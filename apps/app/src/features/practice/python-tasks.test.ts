import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { loadPyodide, type PyodideInterface } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PythonCheck } from './python-runner-protocol';
import { pythonTasks } from './python-tasks';

let pyodide: PyodideInterface;

const checkScript = String.raw`
import contextlib
import io
import json

payload = json.loads(__remora_task_payload)
results = []

def normalize(value):
    if hasattr(value, "tolist"):
        return value.tolist()
    if hasattr(value, "item"):
        return value.item()
    return value

def equal(actual, expected, tolerance=None):
    actual = normalize(actual)
    if tolerance is not None and isinstance(actual, (int, float)) and isinstance(expected, (int, float)):
        return abs(actual - expected) <= tolerance
    if isinstance(actual, list) and isinstance(expected, list):
        return len(actual) == len(expected) and all(equal(a, e, tolerance) for a, e in zip(actual, expected))
    return actual == expected

for check in payload["checks"]:
    try:
        namespace = {}
        if check["kind"] == "output":
            values = iter(check["stdin"])
            namespace["input"] = lambda: next(values)
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                exec(payload["code"], namespace)
            actual = output.getvalue().replace("\r\n", "\n").replace("\r", "\n").rstrip()
            expected = check["expectedOutput"].replace("\r\n", "\n").replace("\r", "\n").rstrip()
            results.append(actual == expected)
        else:
            exec(payload["code"], namespace)
            function = namespace.get(check["functionName"])
            results.append(callable(function) and equal(function(*check["args"]), check["expected"], check.get("tolerance")))
    except Exception:
        results.append(False)

json.dumps(results)
`;

describe('каталог задач Python', () => {
  beforeAll(async () => {
    const runtimeDirectory = dirname(createRequire(import.meta.url).resolve('pyodide'));
    pyodide = await loadPyodide({ indexURL: `${runtimeDirectory}/` });
    await pyodide.loadPackage(
      resolve(
        import.meta.dirname,
        '../../../vendor/pyodide/numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
      ),
    );
  });

  it('проверяется той же версией CPython, что и браузерный исполнитель', () => {
    expect(pyodide.runPython('import sys; sys.version')).toContain('3.14.2');
  });

  it('содержит 26 задач по семи темам со стабильными адресами', () => {
    expect(pythonTasks).toHaveLength(26);
    expect(new Set(pythonTasks.map((task) => task.id)).size).toBe(26);
    expect(new Set(pythonTasks.map((task) => task.slug)).size).toBe(26);
    expect(new Set(pythonTasks.map((task) => task.topic))).toEqual(
      new Set(['Вывод и переменные', 'Условия', 'Циклы', 'Строки', 'Списки', 'Функции', 'NumPy']),
    );
  });

  it.each(pythonTasks)('$title: эталон проходит все сценарии CPython', (task) => {
    expect(runChecks(task.referenceSolution, task.checks)).toEqual(task.checks.map(() => true));
  });

  it.each(pythonTasks)('$title: типичное неверное решение отклоняется', (task) => {
    expect(task.commonWrongSolutions.length).toBeGreaterThan(0);
    for (const solution of task.commonWrongSolutions) {
      expect(runChecks(solution, task.checks)).toContain(false);
    }
  });
});

function runChecks(code: string, checks: readonly PythonCheck[]): boolean[] {
  pyodide.globals.set('__remora_task_payload', JSON.stringify({ code, checks }));
  try {
    return JSON.parse(pyodide.runPython(checkScript) as string) as boolean[];
  } finally {
    pyodide.globals.delete('__remora_task_payload');
  }
}
