import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendLimitedOutput, type PythonWorkerResponse } from './python-runner-protocol';
import { PythonRunner, stdinLines } from './python-runner';

afterEach(() => {
  vi.useRealTimers();
});

describe('PythonRunner', () => {
  it('передаёт код и строки ввода в worker и возвращает результат', async () => {
    const worker = new FakeWorker();
    const phases: string[] = [];
    const runner = new PythonRunner(() => worker);

    const resultPromise = runner.run('print(input())', 'первая\r\nвторая\n', (phase) =>
      phases.push(phase),
    );

    expect(worker.message).toMatchObject({
      type: 'run',
      code: 'print(input())',
      stdin: ['первая', 'вторая'],
    });
    worker.emit({ type: 'state', id: 1, phase: 'running' });
    worker.emit({
      type: 'result',
      id: 1,
      result: {
        status: 'completed',
        stdout: 'первая\n',
        stderr: '',
        durationMs: 4,
        truncated: false,
      },
    });

    await expect(resultPromise).resolves.toMatchObject({ status: 'completed', stdout: 'первая\n' });
    expect(phases).toEqual(['loading', 'running']);
  });

  it('передаёт проверочные сценарии отдельно от обычного запуска', async () => {
    const worker = new FakeWorker();
    const runner = new PythonRunner(() => worker);
    const checks = [
      {
        kind: 'output' as const,
        name: 'Основной пример',
        stdin: ['Мира'],
        expectedOutput: 'Привет, Мира!',
      },
    ];

    const resultPromise = runner.check('print("Привет, Мира!")', checks);

    expect(worker.message).toMatchObject({ type: 'check', checks });
    worker.emit({
      type: 'result',
      id: 1,
      result: {
        status: 'passed',
        stdout: 'Привет, Мира!\n',
        stderr: '',
        durationMs: 3,
        truncated: false,
        checks: [{ name: 'Основной пример', passed: true }],
      },
    });

    await expect(resultPromise).resolves.toMatchObject({
      status: 'passed',
      checks: [{ name: 'Основной пример', passed: true }],
    });
  });

  it('завершает зависший worker по таймауту и создаёт новый для следующего запуска', async () => {
    vi.useFakeTimers();
    const workers: FakeWorker[] = [];
    const runner = new PythonRunner(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    }, 50);

    const timedOut = runner.run('while True: pass', '');
    workers[0]?.emit({ type: 'state', id: 1, phase: 'running' });
    await vi.advanceTimersByTimeAsync(50);

    await expect(timedOut).resolves.toMatchObject({ status: 'timeout' });
    expect(workers[0]?.terminated).toBe(true);

    const next = runner.run('print(1)', '');
    expect(workers).toHaveLength(2);
    workers[1]?.emit({
      type: 'result',
      id: 2,
      result: {
        status: 'completed',
        stdout: '1\n',
        stderr: '',
        durationMs: 1,
        truncated: false,
      },
    });
    await expect(next).resolves.toMatchObject({ status: 'completed' });
  });

  it('останавливает загрузку вручную и восстанавливается после ошибки worker', async () => {
    const workers: FakeWorker[] = [];
    const runner = new PythonRunner(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });

    const stopped = runner.run('print(1)', '');
    runner.stop();
    await expect(stopped).resolves.toMatchObject({ status: 'stopped' });
    expect(workers[0]?.terminated).toBe(true);

    const failed = runner.run('print(2)', '');
    workers[1]?.fail();
    await expect(failed).resolves.toMatchObject({
      status: 'runtime_error',
      stderr: 'Не удалось запустить Python.',
    });
  });
});

describe('ограничения ввода и вывода', () => {
  it('нормализует переносы и не создаёт лишнюю строку из завершающего перевода', () => {
    expect(stdinLines('a\r\nb\rc\n')).toEqual(['a', 'b', 'c']);
    expect(stdinLines('')).toEqual([]);
  });

  it('обрезает вывод по заданному пределу', () => {
    expect(appendLimitedOutput('123', '4567', 5)).toEqual({ value: '12345', truncated: true });
    expect(appendLimitedOutput('123', '45', 5)).toEqual({ value: '12345', truncated: false });
  });
});

class FakeWorker {
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<PythonWorkerResponse>) => void) | null = null;
  message: unknown;
  terminated = false;

  postMessage(message: unknown) {
    this.message = message;
  }

  terminate() {
    this.terminated = true;
  }

  emit(message: PythonWorkerResponse) {
    this.onmessage?.({ data: message } as MessageEvent<PythonWorkerResponse>);
  }

  fail() {
    this.onerror?.({} as ErrorEvent);
  }
}
