/// <reference lib="webworker" />

import { loadPyodide, type PyodideInterface } from 'pyodide';
import { checkFailureMessage } from './python-checks';
import {
  PYTHON_OUTPUT_LIMIT,
  appendLimitedOutput,
  type PythonCheck,
  type PythonCheckResult,
  type PythonExecutionResult,
  type PythonWorkerRequest,
  type PythonWorkerResponse,
} from './python-runner-protocol';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let runtimePromise: Promise<PyodideInterface> | null = null;

workerScope.onmessage = (event: MessageEvent<PythonWorkerRequest>) => {
  void executeRequest(event.data);
};

interface OutputCapture {
  stdout: string;
  stderr: string;
  truncated: boolean;
}

async function executeRequest(request: PythonWorkerRequest) {
  post({ type: 'state', id: request.id, phase: 'loading' });

  let capture = createCapture();
  let startedAt = performance.now();

  try {
    const pyodide = await getRuntime();
    if (request.packages.length > 0) await pyodide.loadPackage(request.packages);
    await warmPackages(pyodide, request.packages);
    const stdoutDecoder = new TextDecoder();
    const stderrDecoder = new TextDecoder();

    const append = (target: 'stdout' | 'stderr', chunk: string) => {
      const current = capture[target];
      const available = Math.max(
        0,
        PYTHON_OUTPUT_LIMIT - capture.stdout.length - capture.stderr.length,
      );
      const next = appendLimitedOutput(current, chunk, current.length + available);
      capture.truncated ||= next.truncated;
      capture[target] = next.value;
    };

    pyodide.setStdout({
      write(buffer) {
        append('stdout', stdoutDecoder.decode(buffer, { stream: true }));
        return buffer.length;
      },
      fsync() {
        append('stdout', stdoutDecoder.decode());
      },
    });
    pyodide.setStderr({
      write(buffer) {
        append('stderr', stderrDecoder.decode(buffer, { stream: true }));
        return buffer.length;
      },
      fsync() {
        append('stderr', stderrDecoder.decode());
      },
    });
    post({ type: 'state', id: request.id, phase: 'running' });
    startedAt = performance.now();

    if (request.type === 'run') {
      await runInFreshGlobals(pyodide, request.code, request.stdin, request.files);
      const plots = collectPlots(pyodide);
      postResult(request.id, { ...executionResult('completed', capture, startedAt), plots });
      return;
    }

    const checks: PythonCheckResult[] = [];
    let plots = [] as NonNullable<PythonExecutionResult['plots']>;
    for (const check of request.checks) {
      capture = createCapture();
      let failure: string | null;
      try {
        failure = await runCheck(pyodide, request.code, check, request.files, () => capture);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const separator = capture.stderr && !capture.stderr.endsWith('\n') ? '\n' : '';
        checks.push({
          name: check.name,
          passed: false,
          message: 'Код завершился с ошибкой Python.',
        });
        postResult(request.id, {
          ...executionResult('runtime_error', capture, startedAt),
          stderr: `${capture.stderr}${separator}${message}`,
          checks,
        });
        return;
      }
      if (failure) {
        checks.push({ name: check.name, passed: false, message: failure });
        postResult(request.id, {
          ...executionResult('failed', capture, startedAt),
          checks,
        });
        return;
      }
      plots = collectPlots(pyodide);
      checks.push({ name: check.name, passed: true });
    }

    postResult(request.id, {
      ...executionResult('passed', capture, startedAt),
      checks,
      plots,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const separator = capture.stderr && !capture.stderr.endsWith('\n') ? '\n' : '';
    postResult(request.id, {
      ...executionResult('runtime_error', capture, startedAt),
      stderr: `${capture.stderr}${separator}${message}`,
    });
  }
}

async function runCheck(
  pyodide: PyodideInterface,
  code: string,
  check: PythonCheck,
  files: Record<string, string>,
  getCapture: () => OutputCapture,
): Promise<string | null> {
  if (check.kind === 'output') {
    await runInFreshGlobals(pyodide, code, check.stdin, files);
    return checkFailureMessage(check, getCapture().stdout);
  }

  const actual = await runInFreshGlobals(pyodide, code, [], files, (globals) => {
    globals.set('__remora_args_json', JSON.stringify(check.args));
    globals.set('__remora_function_name', check.functionName);
    return pyodide.runPython(
      `
import json as __remora_json
def __remora_to_json(value):
    if value.__class__.__module__.startswith("pandas"):
        if value.__class__.__name__ == "DataFrame":
            return [__remora_to_json(item) for item in value.to_dict(orient="records")]
        if value.__class__.__name__ == "Series":
            return __remora_to_json(value.to_dict())
    if hasattr(value, "tolist"):
        return value.tolist()
    if hasattr(value, "item"):
        return value.item()
    if isinstance(value, dict):
        return {key: __remora_to_json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [__remora_to_json(item) for item in value]
    return value

__remora_callable = globals().get(__remora_function_name)
if not callable(__remora_callable):
    raise TypeError(f"Функция {__remora_function_name} не найдена")
__remora_result_json = __remora_json.dumps(
    __remora_to_json(__remora_callable(*__remora_json.loads(__remora_args_json))),
    ensure_ascii=False,
    sort_keys=True,
)
__remora_result_json
`,
      { globals },
    ) as string;
  });
  const actualValue = JSON.parse(actual ?? 'null') as unknown;
  return checkFailureMessage(check, actualValue);
}

async function runInFreshGlobals<T = void>(
  pyodide: PyodideInterface,
  code: string,
  stdin: string[],
  files: Record<string, string>,
  afterRun?: (globals: ReturnType<PyodideInterface['runPython']>) => T,
): Promise<T | undefined> {
  const input = [...stdin];
  pyodide.setStdin({ stdin: () => input.shift() ?? null, autoEOF: true });
  const globals = pyodide.runPython('dict()');
  try {
    pyodide.runPython(
      'import sys\nif "matplotlib.pyplot" in sys.modules:\n    sys.modules["matplotlib.pyplot"].close("all")',
    );
    for (const [name, content] of Object.entries(files)) {
      if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error('Недопустимое имя встроенного файла');
      pyodide.FS.writeFile(name, content, { encoding: 'utf8' });
    }
    await pyodide.runPythonAsync(code, { globals });
    return afterRun?.(globals);
  } finally {
    for (const name of Object.keys(files)) {
      try {
        pyodide.FS.unlink(name);
      } catch {
        // Пользовательский код мог удалить встроенный файл самостоятельно.
      }
    }
    globals.destroy();
  }
}

function createCapture(): OutputCapture {
  return { stdout: '', stderr: '', truncated: false };
}

function executionResult(
  status: PythonExecutionResult['status'],
  capture: OutputCapture,
  startedAt: number,
): PythonExecutionResult {
  return {
    status,
    stdout: capture.stdout,
    stderr: capture.stderr,
    durationMs: performance.now() - startedAt,
    truncated: capture.truncated,
  };
}

function getRuntime(): Promise<PyodideInterface> {
  runtimePromise ??= loadPyodide({
    indexURL: new URL(`${import.meta.env.BASE_URL}assets/pyodide/`, workerScope.location.origin)
      .href,
  }).catch((error: unknown) => {
    runtimePromise = null;
    throw error;
  });
  return runtimePromise;
}

async function warmPackages(pyodide: PyodideInterface, packages: readonly string[]) {
  const imports = packages.filter((name) => name !== 'matplotlib');
  const statements = imports.map((name) => `import ${name}`);
  if (packages.includes('matplotlib')) {
    statements.push('import matplotlib', 'matplotlib.use("Agg")', 'import matplotlib.pyplot');
  }
  if (statements.length > 0) await pyodide.runPythonAsync(statements.join('\n'));
}

function collectPlots(pyodide: PyodideInterface): NonNullable<PythonExecutionResult['plots']> {
  return JSON.parse(
    pyodide.runPython(`
import sys as __remora_sys
import json as __remora_json
if "matplotlib.pyplot" not in __remora_sys.modules:
    __remora_plots_json = "[]"
else:
    import base64 as __remora_base64
    import io as __remora_io
    import warnings as __remora_warnings
    import matplotlib as __remora_matplotlib
    import matplotlib.pyplot as __remora_plt
    __remora_plots = []
    for __remora_number in __remora_plt.get_fignums()[:4]:
        __remora_figure = __remora_plt.figure(__remora_number)
        __remora_buffer = __remora_io.BytesIO()
        with __remora_warnings.catch_warnings():
            __remora_warnings.simplefilter("ignore", __remora_matplotlib.MatplotlibDeprecationWarning)
            __remora_figure.savefig(__remora_buffer, format="png", dpi=120, bbox_inches="tight")
        __remora_title = next(
            (axis.get_title() for axis in __remora_figure.axes if axis.get_title()),
            f"График {len(__remora_plots) + 1}",
        )
        __remora_plots.append({
            "dataUrl": "data:image/png;base64," + __remora_base64.b64encode(__remora_buffer.getvalue()).decode("ascii"),
            "alt": __remora_title,
        })
    __remora_plt.close("all")
    __remora_plots_json = __remora_json.dumps(__remora_plots, ensure_ascii=False)
__remora_plots_json
`) as string,
  ) as NonNullable<PythonExecutionResult['plots']>;
}

function post(message: PythonWorkerResponse) {
  workerScope.postMessage(message);
}

function postResult(id: number, result: PythonExecutionResult) {
  post({ type: 'result', id, result });
}
