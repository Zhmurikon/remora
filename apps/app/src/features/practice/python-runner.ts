import {
  PYTHON_RUN_TIMEOUT_MS,
  type PythonCheck,
  type PythonExecutionResult,
  type PythonPackage,
  type PythonRunnerPhase,
  type PythonWorkerRequest,
  type PythonWorkerResponse,
} from './python-runner-protocol';

interface RunnerWorker {
  onerror: ((event: ErrorEvent) => void) | null;
  onmessage: ((event: MessageEvent<PythonWorkerResponse>) => void) | null;
  postMessage(message: PythonWorkerRequest): void;
  terminate(): void;
}

type WorkerFactory = () => RunnerWorker;

interface PendingRun {
  id: number;
  resolve: (result: PythonExecutionResult) => void;
  onPhase?: (phase: PythonRunnerPhase) => void;
  startedAt: number;
  timeout: ReturnType<typeof setTimeout> | null;
}

export class PythonRunner {
  private worker: RunnerWorker | null = null;
  private pending: PendingRun | null = null;
  private nextId = 1;

  constructor(
    private readonly workerFactory: WorkerFactory = () =>
      new Worker(new URL('./python-runner.worker.ts', import.meta.url), { type: 'module' }),
    private readonly timeoutMs = PYTHON_RUN_TIMEOUT_MS,
  ) {}

  run(
    code: string,
    stdin: string,
    onPhase?: (phase: PythonRunnerPhase) => void,
    packages: PythonPackage[] = [],
  ) {
    return this.start(
      (id) => ({ type: 'run', id, code, stdin: stdinLines(stdin), packages }),
      onPhase,
    );
  }

  check(
    code: string,
    checks: PythonCheck[],
    onPhase?: (phase: PythonRunnerPhase) => void,
    packages: PythonPackage[] = [],
  ) {
    return this.start((id) => ({ type: 'check', id, code, checks, packages }), onPhase);
  }

  private start(
    createRequest: (id: number) => PythonWorkerRequest,
    onPhase?: (phase: PythonRunnerPhase) => void,
  ) {
    if (this.pending) throw new Error('Программа уже выполняется');

    const worker = this.getWorker();
    const id = this.nextId++;

    return new Promise<PythonExecutionResult>((resolve) => {
      this.pending = {
        id,
        resolve,
        onPhase,
        startedAt: performance.now(),
        timeout: null,
      };
      onPhase?.('loading');
      worker.postMessage(createRequest(id));
    });
  }

  stop() {
    if (!this.pending) return;
    this.finishAfterTermination('stopped');
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    if (this.pending?.timeout) clearTimeout(this.pending.timeout);
    this.pending = null;
  }

  private getWorker() {
    if (this.worker) return this.worker;

    const worker = this.workerFactory();
    worker.onmessage = (event) => this.handleMessage(event.data);
    worker.onerror = () =>
      this.finishAfterTermination('runtime_error', 'Не удалось запустить Python.');
    this.worker = worker;
    return worker;
  }

  private handleMessage(message: PythonWorkerResponse) {
    const pending = this.pending;
    if (!pending || pending.id !== message.id) return;

    if (message.type === 'state') {
      pending.onPhase?.(message.phase);
      if (message.phase === 'running' && !pending.timeout) {
        pending.startedAt = performance.now();
        pending.timeout = setTimeout(() => this.finishAfterTermination('timeout'), this.timeoutMs);
      }
      return;
    }

    if (pending.timeout) clearTimeout(pending.timeout);
    this.pending = null;
    pending.resolve(message.result);
  }

  private finishAfterTermination(status: 'runtime_error' | 'stopped' | 'timeout', stderr = '') {
    const pending = this.pending;
    this.worker?.terminate();
    this.worker = null;
    if (!pending) return;
    if (pending.timeout) clearTimeout(pending.timeout);
    this.pending = null;
    pending.resolve({
      status,
      stdout: '',
      stderr,
      durationMs: performance.now() - pending.startedAt,
      truncated: false,
    });
  }
}

export function stdinLines(value: string): string[] {
  const normalized = value.replace(/\r\n?/g, '\n');
  if (!normalized) return [];
  return (normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized).split('\n');
}
