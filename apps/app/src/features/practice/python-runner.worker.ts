/// <reference lib="webworker" />

import { loadPyodide, type PyodideInterface } from 'pyodide';
import {
  PYTHON_OUTPUT_LIMIT,
  appendLimitedOutput,
  type PythonExecutionResult,
  type PythonWorkerRequest,
  type PythonWorkerResponse,
} from './python-runner-protocol';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let runtimePromise: Promise<PyodideInterface> | null = null;

workerScope.onmessage = (event: MessageEvent<PythonWorkerRequest>) => {
  if (event.data.type === 'run') void runPython(event.data);
};

async function runPython(request: PythonWorkerRequest) {
  post({ type: 'state', id: request.id, phase: 'loading' });

  let stdout = '';
  let stderr = '';
  let truncated = false;
  let startedAt = performance.now();

  try {
    const pyodide = await getRuntime();
    const input = [...request.stdin];
    const stdoutDecoder = new TextDecoder();
    const stderrDecoder = new TextDecoder();

    const append = (target: 'stdout' | 'stderr', chunk: string) => {
      const current = target === 'stdout' ? stdout : stderr;
      const available = Math.max(0, PYTHON_OUTPUT_LIMIT - stdout.length - stderr.length);
      const next = appendLimitedOutput(current, chunk, current.length + available);
      truncated ||= next.truncated;
      if (target === 'stdout') stdout = next.value;
      else stderr = next.value;
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
    pyodide.setStdin({ stdin: () => input.shift() ?? null, autoEOF: true });

    post({ type: 'state', id: request.id, phase: 'running' });
    startedAt = performance.now();

    const globals = pyodide.runPython('dict()');
    try {
      await pyodide.runPythonAsync(request.code, { globals });
    } finally {
      globals.destroy();
    }

    postResult(request.id, {
      status: 'completed',
      stdout,
      stderr,
      durationMs: performance.now() - startedAt,
      truncated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const separator = stderr && !stderr.endsWith('\n') ? '\n' : '';
    postResult(request.id, {
      status: 'runtime_error',
      stdout,
      stderr: `${stderr}${separator}${message}`,
      durationMs: performance.now() - startedAt,
      truncated,
    });
  }
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

function post(message: PythonWorkerResponse) {
  workerScope.postMessage(message);
}

function postResult(id: number, result: PythonExecutionResult) {
  post({ type: 'result', id, result });
}
