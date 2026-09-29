export const PYTHON_RUN_TIMEOUT_MS = 3_000;
export const PYTHON_OUTPUT_LIMIT = 32_000;

export type PythonRunnerPhase = 'loading' | 'running';
export type PythonPackage = 'numpy' | 'pandas' | 'scipy' | 'matplotlib';
export type PythonEmbeddedFiles = Record<string, string>;
export type PythonExecutionStatus =
  'completed' | 'passed' | 'failed' | 'runtime_error' | 'timeout' | 'stopped';

export type PythonCheckValue =
  null | boolean | number | string | PythonCheckValue[] | { [key: string]: PythonCheckValue };

export interface PythonOutputCheck {
  kind: 'output';
  name: string;
  stdin: string[];
  expectedOutput: string;
}

export interface PythonFunctionCheck {
  kind: 'function';
  name: string;
  functionName: string;
  args: PythonCheckValue[];
  expected: PythonCheckValue;
  tolerance?: number;
}

export type PythonCheck = PythonOutputCheck | PythonFunctionCheck;

export interface PythonCheckResult {
  name: string;
  passed: boolean;
  message?: string;
}

export interface PythonExecutionResult {
  status: PythonExecutionStatus;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
  checks?: PythonCheckResult[];
  plots?: PythonPlot[];
}

export interface PythonPlot {
  dataUrl: string;
  alt: string;
}

export interface PythonRunRequest {
  type: 'run';
  id: number;
  code: string;
  stdin: string[];
  packages: PythonPackage[];
  files: PythonEmbeddedFiles;
}

export interface PythonCheckRequest {
  type: 'check';
  id: number;
  code: string;
  checks: PythonCheck[];
  packages: PythonPackage[];
  files: PythonEmbeddedFiles;
}

export type PythonWorkerRequest = PythonRunRequest | PythonCheckRequest;

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
