import type { PythonCheck, PythonCheckValue } from './python-runner-protocol';

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
  hint: string;
  explanation: string;
  referenceSolution: string;
  commonWrongSolutions: string[];
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
      out('Основной пример', ['Мира'], 'Привет, Мира!'),
      out('Короткое имя', ['Ян'], 'Привет, Ян!'),
      out('Имя с пробелом', ['Анна Мария'], 'Привет, Анна Мария!'),
    ],
    hint: 'Сохраните результат input() в переменную и используйте f-строку.',
    explanation:
      'input() возвращает строку целиком, включая пробел внутри имени. F-строка подставляет её без дополнительного преобразования.',
    referenceSolution: 'name = input()\nprint(f"Привет, {name}!")\n',
    commonWrongSolutions: ['name = input()\nprint("Привет, name!")\n'],
  },
  {
    id: 'python-sum-two-numbers',
    slug: 'summa-dvuh-chisel',
    version: 1,
    title: 'Сумма двух чисел',
    topic: 'Вывод и переменные',
    difficulty: 'Начальная',
    summary: 'Преобразуйте две строки ввода в числа и сложите их.',
    statement: 'Программа получает два целых числа, каждое на новой строке. Выведите их сумму.',
    starterCode: 'a = int(input())\nb = int(input())\n\n# Выведите сумму\n',
    examples: [{ input: '7\n5', output: '12' }],
    checks: [
      out('Положительные числа', ['7', '5'], '12'),
      out('Число и ноль', ['9', '0'], '9'),
      out('Отрицательные числа', ['-8', '-4'], '-12'),
    ],
    hint: 'input() возвращает строку. Для сложения чисел преобразуйте обе строки через int().',
    explanation:
      'После преобразования через int() оператор + выполняет арифметическое сложение, а не склеивание строк.',
    referenceSolution: 'a = int(input())\nb = int(input())\nprint(a + b)\n',
    commonWrongSolutions: ['a = input()\nb = input()\nprint(a + b)\n'],
  },
  {
    id: 'python-minutes-to-seconds',
    slug: 'minuty-v-sekundy',
    version: 1,
    title: 'Минуты в секунды',
    topic: 'Вывод и переменные',
    difficulty: 'Начальная',
    summary: 'Переведите длительность из минут и секунд в одно число.',
    statement:
      'Программа получает целое число минут, затем целое число секунд. Выведите общую длительность в секундах.',
    starterCode: 'minutes = int(input())\nseconds = int(input())\n\n',
    examples: [{ input: '2\n15', output: '135' }],
    checks: [
      out('Минуты и секунды', ['2', '15'], '135'),
      out('Только секунды', ['0', '42'], '42'),
      out('Ровно час', ['60', '0'], '3600'),
    ],
    hint: 'В одной минуте 60 секунд.',
    explanation: 'Сначала минуты переводятся в секунды умножением на 60, затем части складываются.',
    referenceSolution:
      'minutes = int(input())\nseconds = int(input())\nprint(minutes * 60 + seconds)\n',
    commonWrongSolutions: [
      'minutes = int(input())\nseconds = int(input())\nprint(minutes + seconds)\n',
    ],
  },
  {
    id: 'python-even-number',
    slug: 'chetnoe-chislo',
    version: 1,
    title: 'Чётное число',
    topic: 'Условия',
    difficulty: 'Начальная',
    summary: 'Определите чётность целого числа.',
    statement: 'Программа получает целое число. Выведите «Да», если оно чётное, иначе «Нет».',
    starterCode: 'number = int(input())\n\n',
    examples: [
      { input: '8', output: 'Да' },
      { input: '5', output: 'Нет' },
    ],
    checks: [
      out('Чётное число', ['8'], 'Да'),
      out('Нечётное число', ['5'], 'Нет'),
      out('Ноль', ['0'], 'Да'),
      out('Отрицательное число', ['-3'], 'Нет'),
    ],
    hint: 'Остаток от деления чётного числа на 2 равен нулю.',
    explanation:
      'Условие number % 2 == 0 одинаково работает для положительных чисел, нуля и отрицательных чисел.',
    referenceSolution:
      'number = int(input())\nif number % 2 == 0:\n    print("Да")\nelse:\n    print("Нет")\n',
    commonWrongSolutions: ['number = int(input())\nprint("Да" if number > 0 else "Нет")\n'],
  },
  {
    id: 'python-largest-of-three',
    slug: 'naibolshee-iz-treh',
    version: 1,
    title: 'Наибольшее из трёх',
    topic: 'Условия',
    difficulty: 'Начальная',
    summary: 'Сравните три числа с помощью условий.',
    statement: 'Программа получает три целых числа на отдельных строках. Выведите наибольшее.',
    starterCode: 'a = int(input())\nb = int(input())\nc = int(input())\n\n',
    examples: [{ input: '4\n9\n2', output: '9' }],
    checks: [
      out('Наибольшее в середине', ['4', '9', '2'], '9'),
      out('Наибольшее первое', ['10', '3', '7'], '10'),
      out('Наибольшее последнее', ['3', '7', '12'], '12'),
      out('Равные числа', ['5', '5', '1'], '5'),
      out('Все отрицательные', ['-8', '-2', '-5'], '-2'),
    ],
    hint: 'Храните текущий максимум и последовательно сравните его с остальными числами.',
    explanation:
      'Текущий максимум начинается с первого числа и заменяется, когда встречается большее значение.',
    referenceSolution:
      'a = int(input())\nb = int(input())\nc = int(input())\nlargest = a\nif b > largest:\n    largest = b\nif c > largest:\n    largest = c\nprint(largest)\n',
    commonWrongSolutions: [
      'a = int(input())\nb = int(input())\nc = int(input())\nprint(a if a > b else b)\n',
    ],
  },
  {
    id: 'python-leap-year',
    slug: 'visokosnyj-god',
    version: 1,
    title: 'Високосный год',
    topic: 'Условия',
    difficulty: 'Средняя',
    summary: 'Объедините несколько условий по календарному правилу.',
    statement:
      'Программа получает номер года. Выведите «Да», если год делится на 400 или делится на 4, но не на 100. Иначе выведите «Нет».',
    starterCode: 'year = int(input())\n\n',
    examples: [
      { input: '2024', output: 'Да' },
      { input: '1900', output: 'Нет' },
    ],
    checks: [
      out('Обычный високосный год', ['2024'], 'Да'),
      out('Кратный ста', ['1900'], 'Нет'),
      out('Кратный четырёмстам', ['2000'], 'Да'),
      out('Обычный год', ['2023'], 'Нет'),
    ],
    hint: 'Запишите два независимых случая и соедините их оператором or.',
    explanation:
      'Годы, кратные 100, являются исключением из правила делимости на 4, но кратность 400 снова делает год високосным.',
    referenceSolution:
      'year = int(input())\nleap = year % 400 == 0 or (year % 4 == 0 and year % 100 != 0)\nprint("Да" if leap else "Нет")\n',
    commonWrongSolutions: ['year = int(input())\nprint("Да" if year % 4 == 0 else "Нет")\n'],
  },
  {
    id: 'python-sum-one-to-n',
    slug: 'summa-ot-odnogo-do-n',
    version: 1,
    title: 'Сумма от 1 до N',
    topic: 'Циклы',
    difficulty: 'Начальная',
    summary: 'Накопите сумму чисел в цикле.',
    statement:
      'Программа получает целое N, где N ≥ 1. С помощью цикла выведите сумму чисел от 1 до N включительно.',
    starterCode: 'n = int(input())\ntotal = 0\n\n# Добавляйте числа к total\n',
    examples: [{ input: '5', output: '15' }],
    checks: [
      out('Пять чисел', ['5'], '15'),
      out('Одно число', ['1'], '1'),
      out('Десять чисел', ['10'], '55'),
    ],
    hint: 'range(1, n + 1) включает n, потому что правая граница range не входит в последовательность.',
    explanation: 'На каждом шаге цикла очередное число прибавляется к накопителю total.',
    referenceSolution:
      'n = int(input())\ntotal = 0\nfor number in range(1, n + 1):\n    total += number\nprint(total)\n',
    commonWrongSolutions: [
      'n = int(input())\ntotal = 0\nfor number in range(1, n):\n    total += number\nprint(total)\n',
    ],
  },
  {
    id: 'python-count-positive',
    slug: 'skolko-polozhitelnyh',
    version: 1,
    title: 'Сколько положительных',
    topic: 'Циклы',
    difficulty: 'Начальная',
    summary: 'Посчитайте подходящие числа в последовательности.',
    statement:
      'Первая строка содержит N. Затем идут N целых чисел, каждое на новой строке. Выведите количество чисел строго больше нуля.',
    starterCode: 'n = int(input())\ncount = 0\n\n',
    examples: [{ input: '5\n3\n0\n-2\n7\n1', output: '3' }],
    checks: [
      out('Смешанные числа', ['5', '3', '0', '-2', '7', '1'], '3'),
      out('Нет положительных', ['3', '0', '-1', '-8'], '0'),
      out('Все положительные', ['4', '1', '2', '3', '4'], '4'),
    ],
    hint: 'Повторите input() ровно N раз и увеличивайте счётчик только для number > 0.',
    explanation: 'Ноль не является положительным, поэтому условие использует >, а не >=.',
    referenceSolution:
      'n = int(input())\ncount = 0\nfor _ in range(n):\n    number = int(input())\n    if number > 0:\n        count += 1\nprint(count)\n',
    commonWrongSolutions: [
      'n = int(input())\ncount = 0\nfor _ in range(n):\n    if int(input()) >= 0:\n        count += 1\nprint(count)\n',
    ],
  },
  {
    id: 'python-multiplication-row',
    slug: 'stroka-umnozheniya',
    version: 1,
    title: 'Строка умножения',
    topic: 'Циклы',
    difficulty: 'Средняя',
    summary: 'Постройте последовательность результатов цикла.',
    statement:
      'Программа получает целое N. Выведите через пробел произведения N на числа от 1 до 5.',
    starterCode: 'n = int(input())\nvalues = []\n\n',
    examples: [{ input: '3', output: '3 6 9 12 15' }],
    checks: [
      out('Тройка', ['3'], '3 6 9 12 15'),
      out('Единица', ['1'], '1 2 3 4 5'),
      out('Отрицательное число', ['-2'], '-2 -4 -6 -8 -10'),
    ],
    hint: 'Добавляйте строки в список, затем соедините их через " ".join(values).',
    explanation:
      'join соединяет готовые строковые элементы одним пробелом и не оставляет лишний пробел в конце.',
    referenceSolution:
      'n = int(input())\nvalues = []\nfor factor in range(1, 6):\n    values.append(str(n * factor))\nprint(" ".join(values))\n',
    commonWrongSolutions: [
      'n = int(input())\nprint(" ".join(str(n * factor) for factor in range(1, 5)))\n',
    ],
  },
  {
    id: 'python-reverse-string',
    slug: 'stroka-naoborot',
    version: 1,
    title: 'Строка наоборот',
    topic: 'Строки',
    difficulty: 'Начальная',
    summary: 'Верните символы строки в обратном порядке.',
    statement:
      'Напишите функцию reverse_text(text), которая возвращает переданную строку задом наперёд.',
    starterCode: 'def reverse_text(text):\n    # Верните строку наоборот\n    pass\n',
    examples: [{ input: 'reverse_text("кот")', output: '"ток"' }],
    checks: [
      fn('Обычное слово', 'reverse_text', ['кот'], 'ток'),
      fn('Пустая строка', 'reverse_text', [''], ''),
      fn('Пробелы и знаки', 'reverse_text', ['а б!'], '!б а'),
    ],
    hint: 'У среза [start:stop:step] отрицательный шаг идёт справа налево.',
    explanation: 'Срез text[::-1] создаёт строку из всех символов с шагом −1.',
    referenceSolution: 'def reverse_text(text):\n    return text[::-1]\n',
    commonWrongSolutions: [
      'def reverse_text(text):\n    return "".join(sorted(text, reverse=True))\n',
    ],
  },
  {
    id: 'python-palindrome',
    slug: 'palindrom',
    version: 1,
    title: 'Палиндром без учёта регистра',
    topic: 'Строки',
    difficulty: 'Начальная',
    summary: 'Нормализуйте регистр и сравните строку с разворотом.',
    statement:
      'Напишите функцию is_palindrome(text). Она возвращает True, если строка читается одинаково в обе стороны без учёта регистра. Пробелы остаются значимыми.',
    starterCode: 'def is_palindrome(text):\n    pass\n',
    examples: [{ input: 'is_palindrome("Топот")', output: 'true' }],
    checks: [
      fn('Разный регистр', 'is_palindrome', ['Топот'], true),
      fn('Не палиндром', 'is_palindrome', ['Python'], false),
      fn('Пустая строка', 'is_palindrome', [''], true),
      fn('Пробел значим', 'is_palindrome', ['а ба'], false),
    ],
    hint: 'Сначала получите строку в одном регистре методом lower().',
    explanation:
      'После lower() достаточно сравнить нормализованную строку с её срезом в обратном порядке.',
    referenceSolution:
      'def is_palindrome(text):\n    normalized = text.lower()\n    return normalized == normalized[::-1]\n',
    commonWrongSolutions: ['def is_palindrome(text):\n    return text == text[::-1]\n'],
  },
  {
    id: 'python-count-vowels',
    slug: 'kolichestvo-glasnyh',
    version: 1,
    title: 'Количество гласных',
    topic: 'Строки',
    difficulty: 'Средняя',
    summary: 'Посчитайте русские гласные в строке.',
    statement:
      'Напишите функцию count_vowels(text), которая возвращает число русских гласных «аеёиоуыэюя» без учёта регистра.',
    starterCode: 'def count_vowels(text):\n    vowels = "аеёиоуыэюя"\n    \n',
    examples: [{ input: 'count_vowels("Привет")', output: '2' }],
    checks: [
      fn('Обычное слово', 'count_vowels', ['Привет'], 2),
      fn('Верхний регистр и ё', 'count_vowels', ['ЁЛКА'], 2),
      fn('Без гласных', 'count_vowels', ['шкф'], 0),
      fn('Пустая строка', 'count_vowels', [''], 0),
    ],
    hint: 'Перебирайте text.lower() и проверяйте каждый символ оператором in.',
    explanation:
      'Приведение к нижнему регистру позволяет использовать один набор гласных для обоих регистров.',
    referenceSolution:
      'def count_vowels(text):\n    vowels = "аеёиоуыэюя"\n    return sum(1 for char in text.lower() if char in vowels)\n',
    commonWrongSolutions: [
      'def count_vowels(text):\n    return sum(1 for char in text if char in "аеиоуыэюя")\n',
    ],
  },
  {
    id: 'python-sum-list',
    slug: 'summa-spiska',
    version: 1,
    title: 'Сумма списка',
    topic: 'Списки',
    difficulty: 'Начальная',
    summary: 'Сложите элементы списка без изменения исходных данных.',
    statement:
      'Напишите функцию list_sum(numbers), которая возвращает сумму всех чисел списка. Для пустого списка верните 0.',
    starterCode: 'def list_sum(numbers):\n    total = 0\n    \n',
    examples: [{ input: 'list_sum([3, 5, 2])', output: '10' }],
    checks: [
      fn('Несколько чисел', 'list_sum', [[3, 5, 2]], 10),
      fn('Пустой список', 'list_sum', [[]], 0),
      fn('Отрицательные числа', 'list_sum', [[-4, 1, -2]], -5),
    ],
    hint: 'Начните с total = 0 и прибавляйте к нему каждый элемент.',
    explanation:
      'Нулевой накопитель даёт правильный результат и для пустого списка, где цикл не выполнится ни разу.',
    referenceSolution:
      'def list_sum(numbers):\n    total = 0\n    for number in numbers:\n        total += number\n    return total\n',
    commonWrongSolutions: [
      'def list_sum(numbers):\n    total = 0\n    for number in numbers:\n        total = number\n    return total\n',
    ],
  },
  {
    id: 'python-only-even',
    slug: 'tolko-chetnye',
    version: 1,
    title: 'Только чётные',
    topic: 'Списки',
    difficulty: 'Начальная',
    summary: 'Отфильтруйте список, сохранив порядок элементов.',
    statement:
      'Напишите функцию only_even(numbers), которая возвращает новый список только из чётных чисел в исходном порядке.',
    starterCode: 'def only_even(numbers):\n    result = []\n    \n',
    examples: [{ input: 'only_even([3, 4, 2, 7])', output: '[4, 2]' }],
    checks: [
      fn('Смешанный список', 'only_even', [[3, 4, 2, 7]], [4, 2]),
      fn('Нет чётных', 'only_even', [[1, 3, 5]], []),
      fn('Ноль и отрицательные', 'only_even', [[0, -2, -3]], [0, -2]),
    ],
    hint: 'Добавляйте number в result, когда остаток от деления на 2 равен нулю.',
    explanation:
      'Последовательный append сохраняет исходный порядок и не изменяет переданный список.',
    referenceSolution:
      'def only_even(numbers):\n    result = []\n    for number in numbers:\n        if number % 2 == 0:\n            result.append(number)\n    return result\n',
    commonWrongSolutions: [
      'def only_even(numbers):\n    return [number for number in numbers if number % 2 == 1]\n',
    ],
  },
  {
    id: 'python-unique-items',
    slug: 'unikalnye-po-poryadku',
    version: 1,
    title: 'Уникальные по порядку',
    topic: 'Списки',
    difficulty: 'Средняя',
    summary: 'Удалите повторы, не меняя порядок первых появлений.',
    statement:
      'Напишите функцию unique_items(items), которая возвращает список без повторов и сохраняет порядок первых появлений.',
    starterCode: 'def unique_items(items):\n    result = []\n    \n',
    examples: [{ input: 'unique_items([2, 1, 2, 3, 1])', output: '[2, 1, 3]' }],
    checks: [
      fn('Повторяющиеся числа', 'unique_items', [[2, 1, 2, 3, 1]], [2, 1, 3]),
      fn('Уже уникальный список', 'unique_items', [['а', 'б']], ['а', 'б']),
      fn('Пустой список', 'unique_items', [[]], []),
    ],
    hint: 'Перед append проверяйте, встречался ли элемент в result.',
    explanation:
      'Проверка по уже собранному result оставляет только первое появление каждого элемента и сохраняет порядок.',
    referenceSolution:
      'def unique_items(items):\n    result = []\n    for item in items:\n        if item not in result:\n            result.append(item)\n    return result\n',
    commonWrongSolutions: ['def unique_items(items):\n    return sorted(set(items))\n'],
  },
  {
    id: 'python-factorial',
    slug: 'faktorial',
    version: 1,
    title: 'Факториал',
    topic: 'Функции',
    difficulty: 'Начальная',
    summary: 'Верните произведение целых чисел от 1 до N.',
    statement: 'Напишите функцию factorial(n) для целого n ≥ 0. Факториал нуля равен 1.',
    starterCode: 'def factorial(n):\n    result = 1\n    \n',
    examples: [{ input: 'factorial(5)', output: '120' }],
    checks: [
      fn('Пять', 'factorial', [5], 120),
      fn('Ноль', 'factorial', [0], 1),
      fn('Один', 'factorial', [1], 1),
      fn('Семь', 'factorial', [7], 5040),
    ],
    hint: 'Умножайте result на числа из range(1, n + 1).',
    explanation: 'Начальное значение 1 нейтрально для умножения и сразу покрывает случай n = 0.',
    referenceSolution:
      'def factorial(n):\n    result = 1\n    for number in range(1, n + 1):\n        result *= number\n    return result\n',
    commonWrongSolutions: [
      'def factorial(n):\n    result = 1\n    for number in range(1, n):\n        result *= number\n    return result\n',
    ],
  },
  {
    id: 'python-is-prime',
    slug: 'prostoe-chislo',
    version: 1,
    title: 'Простое число',
    topic: 'Функции',
    difficulty: 'Средняя',
    summary: 'Проверьте число на наличие делителей.',
    statement:
      'Напишите функцию is_prime(n), которая возвращает True для простого числа и False для составного, единицы, нуля и отрицательных чисел.',
    starterCode: 'def is_prime(n):\n    if n < 2:\n        return False\n    \n',
    examples: [
      { input: 'is_prime(7)', output: 'true' },
      { input: 'is_prime(9)', output: 'false' },
    ],
    checks: [
      fn('Простое число', 'is_prime', [7], true),
      fn('Составное число', 'is_prime', [9], false),
      fn('Двойка', 'is_prime', [2], true),
      fn('Единица', 'is_prime', [1], false),
      fn('Отрицательное число', 'is_prime', [-3], false),
    ],
    hint: 'Достаточно искать делитель от 2 до целой части квадратного корня включительно.',
    explanation:
      'Если у составного числа есть делитель больше корня, второй делитель обязательно меньше корня и уже был бы найден.',
    referenceSolution:
      'def is_prime(n):\n    if n < 2:\n        return False\n    divisor = 2\n    while divisor * divisor <= n:\n        if n % divisor == 0:\n            return False\n        divisor += 1\n    return True\n',
    commonWrongSolutions: ['def is_prime(n):\n    return n % 2 != 0\n'],
  },
  {
    id: 'python-fibonacci',
    slug: 'chisla-fibonachchi',
    version: 1,
    title: 'Числа Фибоначчи',
    topic: 'Функции',
    difficulty: 'Средняя',
    summary: 'Соберите первые N элементов последовательности.',
    statement:
      'Напишите функцию fibonacci(n), которая возвращает список первых n чисел Фибоначчи. Последовательность начинается с 0 и 1.',
    starterCode: 'def fibonacci(n):\n    result = []\n    a, b = 0, 1\n    \n',
    examples: [{ input: 'fibonacci(6)', output: '[0, 1, 1, 2, 3, 5]' }],
    checks: [
      fn('Шесть чисел', 'fibonacci', [6], [0, 1, 1, 2, 3, 5]),
      fn('Пустая последовательность', 'fibonacci', [0], []),
      fn('Одно число', 'fibonacci', [1], [0]),
      fn('Восемь чисел', 'fibonacci', [8], [0, 1, 1, 2, 3, 5, 8, 13]),
    ],
    hint: 'На каждом шаге добавляйте a, затем одновременно присваивайте a, b = b, a + b.',
    explanation:
      'Одновременное присваивание использует старые значения обеих переменных и безопасно сдвигает пару вперёд.',
    referenceSolution:
      'def fibonacci(n):\n    result = []\n    a, b = 0, 1\n    for _ in range(n):\n        result.append(a)\n        a, b = b, a + b\n    return result\n',
    commonWrongSolutions: [
      'def fibonacci(n):\n    result = [0, 1]\n    for _ in range(n):\n        result.append(result[-1] + result[-2])\n    return result\n',
    ],
  },
] as const;

export function findPythonTask(slug: string): PythonTask | undefined {
  return pythonTasks.find((task) => task.slug === slug);
}

function out(name: string, stdin: string[], expectedOutput: string): PythonCheck {
  return { kind: 'output', name, stdin, expectedOutput };
}

function fn(
  name: string,
  functionName: string,
  args: PythonCheckValue[],
  expected: PythonCheckValue,
): PythonCheck {
  return { kind: 'function', name, functionName, args, expected };
}
