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
  },
] as const;

export function findPythonTask(slug: string): PythonTask | undefined {
  return pythonTasks.find((task) => task.slug === slug);
}
