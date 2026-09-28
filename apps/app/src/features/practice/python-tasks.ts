import type { PythonCheck } from './python-runner-protocol';

export type PythonTaskDifficulty = 'Начальная' | 'Средняя';

export interface PythonTaskExample {
  input: string;
  output: string;
}

export interface PythonTask {
  id: string;
  slug: string;
  version: number;
  title: string;
  topic: string;
  difficulty: PythonTaskDifficulty;
  summary: string;
  statement: string;
  starterCode: string;
  examples: PythonTaskExample[];
  checks: PythonCheck[];
}

export const pythonTasks: readonly PythonTask[] = [
  {
    id: 'python-greeting-by-name',
    slug: 'privetstvie-po-imeni',
    version: 1,
    title: 'Приветствие по имени',
    topic: 'Вывод и переменные',
    difficulty: 'Начальная',
    summary: 'Прочитайте имя и составьте приветствие с помощью переменной.',
    statement:
      'Программа получает имя одной строкой. Выведите «Привет, имя!», подставив прочитанное значение.',
    starterCode: 'name = input()\n\n# Выведите приветствие\n',
    examples: [{ input: 'Мира', output: 'Привет, Мира!' }],
    checks: [
      {
        kind: 'output',
        name: 'Основной пример',
        stdin: ['Мира'],
        expectedOutput: 'Привет, Мира!',
      },
      {
        kind: 'output',
        name: 'Короткое имя',
        stdin: ['Ян'],
        expectedOutput: 'Привет, Ян!',
      },
      {
        kind: 'output',
        name: 'Имя с пробелом',
        stdin: ['Анна Мария'],
        expectedOutput: 'Привет, Анна Мария!',
      },
    ],
  },
] as const;

export function findPythonTask(slug: string): PythonTask | undefined {
  return pythonTasks.find((task) => task.slug === slug);
}
