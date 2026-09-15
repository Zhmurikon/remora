/**
 * Режим «Аудирование»: звучит одна сторона карточки, ответ вводится.
 *
 * Текст вопроса на экране не показывается — иначе слушать незачем. Для
 * языковых наборов это заодно режим «диктант»: услышал — написал целиком.
 *
 * Если синтез не настроен или недоступен, режим честно говорит об этом и
 * предлагает другие: обучение не должно зависеть от внешнего сервиса.
 */

import { STRICTNESS_LABELS, checkAnswer, type AnswerResult } from '@remora/core';
import { AudioPlayer, Badge, Button, Card, Input } from '@remora/ui';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Diff, SessionSummary } from '../features/study/SessionSummary';
import { StudyShell } from '../features/study/StudyShell';
import { answerLang, questionSide } from '../features/study/card-sides';
import { selectCurrent, useStudyStore, type QueueItem } from '../features/study/study-store';
import {
  finishSession,
  useStudySession,
  type StudyDirectionMode,
} from '../features/study/use-study-session';
import { api } from '../lib/api';

export function ListenPage() {
  const { setId = '' } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const direction = (params.get('direction') as StudyDirectionMode | null) ?? 'term_to_def';

  const status = useQuery({
    queryKey: ['tts', 'status'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/tts/status');
      if (error || !data) throw new Error('Не удалось проверить озвучку');
      return data;
    },
  });

  const query = useStudySession({
    setId,
    mode: 'listen',
    scope: 'due',
    direction,
    enabled: status.data?.available === true,
  });

  const items = useStudyStore((state) => state.items);
  const index = useStudyStore((state) => state.index);
  const answers = useStudyStore((state) => state.answers);
  const sessionId = useStudyStore((state) => state.sessionId);
  const current = useStudyStore(selectCurrent);
  const answer = useStudyStore((state) => state.answer);

  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const shownAt = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const queue = query.data?.queue;
  const audio = useAudio(current, 'question');
  const nextAudio = useAudio(items[index + 1] ?? null, 'question');

  useEffect(() => {
    inputRef.current?.focus();
  }, [index]);

  const next = useCallback(() => {
    setTyped('');
    setResult(null);
    setRevealed(false);
    shownAt.current = Date.now();
  }, []);

  const submit = useCallback(() => {
    if (!current) return;
    // Проверяем против озвученной стороны: услышал — записал именно её.
    const expected = questionSide(current);
    const verdict = checkAnswer(typed, expected, {
      strictness: queue?.answer_strictness ?? 'moderate',
      lang: answerLang(current, queue?.lang_definition, queue?.lang_term),
    });
    const correct = verdict.verdict !== 'incorrect';
    setResult(verdict);
    answer({
      item: current,
      rating: correct ? 3 : 1,
      correct,
      typed,
      durationMs: Date.now() - shownAt.current,
      requeue: !correct,
    });
    if (correct) setTimeout(next, 600);
  }, [answer, current, next, queue, typed]);

  if (status.isPending) return <p className="text-fg-muted">Проверяем озвучку…</p>;
  if (status.data?.available === false) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <p className="text-4xl" aria-hidden="true">
          🔇
        </p>
        <h1 className="mt-4 text-xl font-semibold">Озвучка пока не подключена</h1>
        <p className="text-fg-muted mt-2">
          «Аудирование» заработает, как только к проекту подключат синтез речи. Остальные режимы
          доступны как обычно.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => navigate(`/sets/${setId}/learn`)}>Перейти к заучиванию</Button>
          <Button variant="ghost" onClick={() => navigate(`/sets/${setId}`)}>
            К набору
          </Button>
        </div>
      </Card>
    );
  }

  if (query.isPending) return <p className="text-fg-muted">Собираем очередь…</p>;
  if (query.isError) return <p className="text-danger">Не удалось загрузить очередь.</p>;

  if (items.length === 0) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <p className="text-4xl" aria-hidden="true">
          🎧
        </p>
        <h1 className="mt-4 text-xl font-semibold">На сегодня всё повторено</h1>
        <Button className="mt-6" variant="ghost" onClick={() => navigate(`/sets/${setId}`)}>
          К набору
        </Button>
      </Card>
    );
  }

  if (finished || !current) {
    return (
      <SessionSummary
        setId={setId}
        answers={answers}
        onRestart={() => {
          setFinished(false);
          void query.refetch();
        }}
      />
    );
  }

  const expected = questionSide(current);
  const wrong = result !== null && result.verdict === 'incorrect';

  return (
    <StudyShell
      title="Аудирование"
      subtitle={`Запишите услышанное · проверка «${STRICTNESS_LABELS[
        queue?.answer_strictness ?? 'moderate'
      ].toLowerCase()}»`}
      done={index}
      total={items.length}
      onExit={() => {
        void finishSession(sessionId);
        setFinished(true);
      }}
    >
      <Card className="p-6 sm:p-8">
        <Badge tone="neutral">Слушайте и записывайте</Badge>
        <div className="mt-5">
          {audio.isPending ? (
            <p className="text-fg-muted">Готовим озвучку…</p>
          ) : audio.data ? (
            <AudioPlayer
              src={audio.data.audio_url}
              preloadSrc={nextAudio.data?.audio_url ?? null}
              trackId={`${current.card.id}:${current.direction}`}
            />
          ) : (
            <p className="text-danger">Не удалось озвучить эту карточку.</p>
          )}
        </div>
        {revealed && <p className="text-fg-muted mt-4 text-lg">{expected}</p>}
      </Card>

      <form
        className="mt-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (wrong) next();
          else submit();
        }}
      >
        <Input
          ref={inputRef}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Что вы услышали"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Что вы услышали"
          disabled={result?.verdict === 'correct'}
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <Button type="submit">{wrong ? 'Дальше' : 'Проверить'}</Button>
          {!result && (
            <Button type="button" variant="ghost" onClick={() => setRevealed(true)}>
              Показать текст
            </Button>
          )}
        </div>
      </form>

      {result?.verdict === 'correct' && (
        <Card className="border-success mt-5 p-5">
          <p className="text-success font-medium">Верно</p>
        </Card>
      )}
      {result?.verdict === 'typo' && (
        <Card className="border-warning mt-5 p-5">
          <p className="text-warning font-medium">Почти — засчитано как опечатка</p>
          <p className="text-fg-muted mt-1 text-sm">
            Правильно: <span className="text-fg font-medium">{expected}</span>
          </p>
        </Card>
      )}
      {wrong && (
        <Card className="border-danger mt-5 p-5">
          <p className="text-danger text-sm font-medium">Не совсем</p>
          <p className="mt-2">
            Правильно: <span className="font-medium">{expected}</span>
          </p>
          {typed && (
            <p className="text-fg-subtle mt-1 text-sm">
              Вы ввели: <Diff expected={expected} typed={typed} />
            </p>
          )}
        </Card>
      )}
    </StudyShell>
  );
}

/** Озвучка одной стороны карточки. Кэш запроса совпадает с кэшем на сервере. */
function useAudio(item: QueueItem | null, side: 'question' | 'answer') {
  return useQuery({
    queryKey: ['tts', 'speak', item?.card.id, item?.direction, side],
    enabled: Boolean(item),
    staleTime: 30 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await api.POST('/api/v1/tts/speak', {
        body: { card_id: item!.card.id, direction: item!.direction, side, speed: 1 },
      });
      if (error || !data) throw new Error('Не удалось озвучить карточку');
      return data;
    },
  });
}
