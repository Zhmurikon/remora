/**
 * Режим «Тест»: конструктор → прохождение без подсказок → разбор.
 *
 * Проверка целиком на сервере: он собрал вопросы, он же знает ответы. Клиент
 * только собирает введённое и показывает разбор, который вернул сервер.
 */

import type { components } from '@remora/api-client';
import { pluralWithCount } from '@remora/core';
import { Badge, Button, Card, CardContent, Input } from '@remora/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, openPdf } from '../lib/api';

type TestConfig = components['schemas']['TestConfig'];
type TestAttempt = components['schemas']['TestAttemptOut'];
type TestQuestion = components['schemas']['TestQuestionOut'];
type TestResult = components['schemas']['TestResult'];
type QuestionKind = components['schemas']['TestQuestionKind'];

/** Ответ на один вопрос: строка для большинства типов, список — для сопоставления. */
type Answer = { value?: string; values?: string[] };

const kindLabels: Record<QuestionKind, string> = {
  choice: 'Выбор из вариантов',
  true_false: 'Верно или нет',
  typing: 'Ввод ответа',
  matching: 'Сопоставление',
};

const sourceLabels: Record<NonNullable<TestConfig['source']>, string> = {
  all: 'Весь набор',
  hard: 'Только сложные',
  new: 'Только невыученные',
};

export function TestPage() {
  const { setId = '' } = useParams();
  const [attempt, setAttempt] = useState<TestAttempt | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  if (result && attempt) {
    return (
      <TestReview
        setId={setId}
        result={result}
        attempt={attempt}
        onRetake={(next) => {
          setAttempt(next);
          setResult(null);
        }}
        onRestart={() => {
          setAttempt(null);
          setResult(null);
        }}
      />
    );
  }
  if (attempt) {
    return <TestRunner attempt={attempt} onFinished={setResult} />;
  }
  return <TestBuilder setId={setId} onCreated={setAttempt} />;
}

function TestBuilder({
  setId,
  onCreated,
}: {
  setId: string;
  onCreated: (attempt: TestAttempt) => void;
}) {
  const navigate = useNavigate();
  const [count, setCount] = useState(20);
  const [kinds, setKinds] = useState<QuestionKind[]>(['choice', 'true_false', 'typing']);
  const [source, setSource] = useState<NonNullable<TestConfig['source']>>('all');
  const [direction, setDirection] = useState<NonNullable<TestConfig['direction']>>('term_to_def');
  const [writeToSchedule, setWriteToSchedule] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const { data, error: failure } = await api.POST('/api/v1/study/sets/{set_id}/tests', {
        params: { path: { set_id: setId } },
        body: {
          question_count: count,
          kinds,
          source,
          direction,
          write_to_schedule: writeToSchedule,
        },
      });
      if (failure || !data) throw new Error(errorMessage(failure));
      return data;
    },
    onSuccess: onCreated,
    onError: (failure: Error) => setError(failure.message),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Link to={`/sets/${setId}`} className="text-primary text-sm font-medium">
        ← К набору
      </Link>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Тест</h1>
      <p className="text-fg-muted mt-2">
        Вопросы собираются на сервере и не меняются, пока вы проходите тест.
      </p>

      <Card className="mt-6 space-y-5 p-6">
        <Input
          label="Сколько вопросов"
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
        />

        <fieldset>
          <legend className="text-fg text-sm font-medium">Типы вопросов</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(Object.keys(kindLabels) as QuestionKind[]).map((kind) => (
              <label
                key={kind}
                className="border-border flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={kinds.includes(kind)}
                  onChange={(event) =>
                    setKinds((current) =>
                      event.target.checked
                        ? [...current, kind]
                        : current.filter((item) => item !== kind),
                    )
                  }
                />
                {kindLabels[kind]}
              </label>
            ))}
          </div>
          {kinds.length === 0 && (
            <p className="text-danger mt-2 text-sm">Выберите хотя бы один тип.</p>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Источник"
            value={source}
            onChange={(value) => setSource(value as NonNullable<TestConfig['source']>)}
            options={Object.entries(sourceLabels)}
          />
          <Select
            label="Направление"
            value={direction}
            onChange={(value) => setDirection(value as NonNullable<TestConfig['direction']>)}
            options={[
              ['term_to_def', 'Термин → определение'],
              ['def_to_term', 'Определение → термин'],
              ['both', 'Оба направления'],
            ]}
          />
        </div>

        <label className="text-fg-muted flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={writeToSchedule}
            onChange={(event) => setWriteToSchedule(event.target.checked)}
          />
          Учитывать результат в расписании повторений
        </label>

        {error && <p className="text-danger text-sm">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <Button
            loading={create.isPending}
            disabled={kinds.length === 0}
            onClick={() => create.mutate()}
          >
            Начать тест
          </Button>
          <Button variant="ghost" onClick={() => navigate(`/sets/${setId}`)}>
            Отмена
          </Button>
        </div>
      </Card>
    </div>
  );
}

function TestRunner({
  attempt,
  onFinished,
}: {
  attempt: TestAttempt;
  onFinished: (result: TestResult) => void;
}) {
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      const { data, error: failure } = await api.POST('/api/v1/study/tests/{attempt_id}/submit', {
        params: { path: { attempt_id: attempt.id } },
        body: {
          answers: attempt.questions.map((question) => ({
            question_id: question.id,
            value: answers[question.id]?.value ?? null,
            values: answers[question.id]?.values ?? [],
          })),
        },
      });
      if (failure || !data) throw new Error(errorMessage(failure));
      return data;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['study'] });
      onFinished(data);
    },
    onError: (failure: Error) => setError(failure.message),
  });

  const answered = attempt.questions.filter((question) => isAnswered(answers[question.id])).length;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Тест · {attempt.set_title}</h1>
          <p className="text-fg-muted mt-1 text-sm">
            Отвечено {answered} из {attempt.questions.length}. Проверка — в конце.
          </p>
        </div>
      </header>

      <ol className="mt-6 space-y-5">
        {attempt.questions.map((question, index) => (
          <li key={question.id}>
            <QuestionCard
              question={question}
              index={index}
              answer={answers[question.id]}
              onAnswer={(answer) =>
                setAnswers((current) => ({ ...current, [question.id]: answer }))
              }
            />
          </li>
        ))}
      </ol>

      {error && <p className="text-danger mt-4 text-sm">{error}</p>}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button loading={submit.isPending} onClick={() => submit.mutate()}>
          Проверить
        </Button>
        {answered < attempt.questions.length && (
          <p className="text-fg-subtle text-sm">
            Без ответа{' '}
            {pluralWithCount(attempt.questions.length - answered, [
              'вопрос',
              'вопроса',
              'вопросов',
            ])}
            — они будут засчитаны как ошибки.
          </p>
        )}
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  index,
  answer,
  onAnswer,
}: {
  question: TestQuestion;
  index: number;
  answer: Answer | undefined;
  onAnswer: (answer: Answer) => void;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="text-fg-subtle text-sm">Вопрос {index + 1}</span>
        <Badge tone="neutral">{kindLabels[question.kind]}</Badge>
      </div>

      {question.kind !== 'matching' && (
        <div className="mt-3 text-lg">
          <CardContent
            value={question.prompt}
            type={question.content_type}
            codeLanguage={question.code_language}
            imageUrl={question.prompt_image_url}
            imageAlt="Изображение вопроса"
          />
        </div>
      )}

      {question.kind === 'choice' && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(question.options ?? []).map((option) => (
            <label
              key={option}
              className={`focus-within:ring-primary flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm focus-within:ring-2 ${
                answer?.value === option
                  ? 'border-primary bg-primary-subtle'
                  : 'border-border bg-surface'
              }`}
            >
              <input
                type="radio"
                name={question.id}
                className="h-4 w-4"
                checked={answer?.value === option}
                onChange={() => onAnswer({ value: option })}
              />
              {option}
            </label>
          ))}
        </div>
      )}

      {question.kind === 'true_false' && (
        <>
          <p className="text-fg-muted mt-3">
            Утверждение: <span className="text-fg font-medium">{question.statement}</span>
          </p>
          <div className="mt-4 flex gap-3">
            {[
              ['true', 'Верно'],
              ['false', 'Неверно'],
            ].map(([value, label]) => (
              <Button
                key={value}
                variant={answer?.value === value ? 'primary' : 'secondary'}
                onClick={() => onAnswer({ value })}
              >
                {label}
              </Button>
            ))}
          </div>
        </>
      )}

      {question.kind === 'typing' && (
        <div className="mt-4">
          <Input
            value={answer?.value ?? ''}
            onChange={(event) => onAnswer({ value: event.target.value })}
            placeholder="Ваш ответ"
            autoComplete="off"
            spellCheck={false}
            aria-label={`Ответ на вопрос ${index + 1}`}
          />
        </div>
      )}

      {question.kind === 'matching' && (
        <div className="mt-4 space-y-2">
          <p className="text-fg-muted text-sm">Подберите пару к каждому пункту.</p>
          {(question.pairs ?? []).map((left, position) => (
            <div key={left} className="grid items-center gap-2 sm:grid-cols-2">
              <span className="font-medium">{left}</span>
              <select
                value={answer?.values?.[position] ?? ''}
                aria-label={`Пара для «${left}»`}
                className="border-border bg-surface text-fg h-11 w-full rounded-md border px-3"
                onChange={(event) => {
                  const values = [...(answer?.values ?? [])];
                  values[position] = event.target.value;
                  onAnswer({ values });
                }}
              >
                <option value="">— выберите —</option>
                {(question.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function TestReview({
  setId,
  result,
  attempt,
  onRetake,
  onRestart,
}: {
  setId: string;
  result: TestResult;
  attempt: TestAttempt;
  onRetake: (attempt: TestAttempt) => void;
  onRestart: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const retake = useMutation({
    mutationFn: async () => {
      const { data, error: failure } = await api.POST('/api/v1/study/tests/{attempt_id}/retake', {
        params: { path: { attempt_id: attempt.id } },
      });
      if (failure || !data) throw new Error(errorMessage(failure));
      return data;
    },
    onSuccess: onRetake,
    onError: (failure: Error) => setError(failure.message),
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <p className="text-5xl" aria-hidden="true">
          {result.score >= 80 ? '🎉' : result.score >= 50 ? '👍' : '💪'}
        </p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {Math.round(result.score)}% верно
        </h1>
        <p className="text-fg-muted mt-2">
          {result.correct_count} из {result.total}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {result.wrong_card_ids.length > 0 && (
          <Button loading={retake.isPending} onClick={() => retake.mutate()}>
            Пересдать ошибки ({result.wrong_card_ids.length})
          </Button>
        )}
        <Button variant="secondary" onClick={onRestart}>
          Новый тест
        </Button>
        <Button variant="ghost" onClick={() => void openPdf(`/api/v1/print/tests/${attempt.id}`)}>
          Распечатать бланк
        </Button>
        <Button
          variant="ghost"
          onClick={() => void openPdf(`/api/v1/print/tests/${attempt.id}?answers=true`)}
        >
          Ключ с ответами
        </Button>
        <Link to={`/sets/${setId}`}>
          <Button variant="ghost">К набору</Button>
        </Link>
      </div>
      {error && <p className="text-danger mt-4 text-center text-sm">{error}</p>}

      <h2 className="mt-10 text-lg font-semibold">Разбор</h2>
      <ol className="mt-4 space-y-3">
        {result.review.map((item, index) => (
          <li key={item.question.id}>
            <Card className={`p-5 ${item.correct ? 'border-success' : 'border-danger'}`}>
              <div className="flex items-start justify-between gap-3">
                <span className="text-fg-subtle text-sm">Вопрос {index + 1}</span>
                <Badge tone={item.correct ? 'success' : 'danger'}>
                  {item.correct ? (item.verdict === 'typo' ? 'опечатка' : 'верно') : 'ошибка'}
                </Badge>
              </div>
              <p className="mt-2 font-medium">{item.question.prompt}</p>
              {item.question.statement && (
                <p className="text-fg-muted mt-1 text-sm">Утверждение: {item.question.statement}</p>
              )}
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="text-fg-subtle">Ваш ответ:</dt>
                  <dd className={item.correct ? '' : 'text-danger'}>
                    {formatGiven(item) || '— не отвечено —'}
                  </dd>
                </div>
                {!item.correct && (
                  <div className="flex gap-2">
                    <dt className="text-fg-subtle">Правильно:</dt>
                    <dd className="font-medium">{formatExpected(item)}</dd>
                  </div>
                )}
              </dl>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-fg text-sm font-medium" htmlFor={`select-${label}`}>
        {label}
      </label>
      <select
        id={`select-${label}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-border bg-surface text-fg h-10 w-full rounded-md border px-3 text-base"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

function isAnswered(answer: Answer | undefined): boolean {
  if (!answer) return false;
  if (answer.values?.length) return answer.values.some((value) => value.length > 0);
  return Boolean(answer.value && answer.value.trim().length > 0);
}

function formatGiven(item: TestResult['review'][number]): string {
  if (item.given_values && item.given_values.length > 0) return item.given_values.join(', ');
  if (item.question.kind === 'true_false') {
    return item.given === 'true' ? 'Верно' : item.given === 'false' ? 'Неверно' : '';
  }
  return item.given ?? '';
}

function formatExpected(item: TestResult['review'][number]): string {
  if (item.expected_values && item.expected_values.length > 0)
    return item.expected_values.join(', ');
  if (item.question.kind === 'true_false') {
    return item.expected === 'true' ? 'Верно' : 'Неверно';
  }
  return item.expected;
}

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Не удалось выполнить запрос';
}
