export const PYTHON_RUN_TIMEOUT_MS = 3_000;
export const PYTHON_OUTPUT_LIMIT = 32_000;

export type PythonRunnerPhase = 'loading' | 'running';
export type PythonExecutionStatus = 'completed' | 'runtime_error' | 'timeout' | 'stopped';

export interface PythonExecutionResult {
  status: PythonExecutionStatus;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
}

export interface PythonRunRequest {
  type: 'run';
  id: number;
  code: string;
  stdin: string[];
}

export type PythonWorkerRequest = PythonRunRequest;

export interface PythonWorkerStateMessage {
  type: 'state';
  id: number;
  phase: PythonRunnerPhase;
}

export interface PythonWorkerResultMessage {
  type: 'result';
  id: number;
  result: PythonExecutionResult;
}

export type PythonWorkerResponse = PythonWorkerStateMessage | PythonWorkerResultMessage;

export function appendLimitedOutput(
  current: string,
  chunk: string,
  limit = PYTHON_OUTPUT_LIMIT,
): { value: string; truncated: boolean } {
  const remaining = limit - current.length;
  if (remaining <= 0) return { value: current, truncated: chunk.length > 0 };
  return {
    value: current + chunk.slice(0, remaining),
    truncated: chunk.length > remaining,
  };
}
