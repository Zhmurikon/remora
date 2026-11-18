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
import { AudioPlayer, Button, Card, CardContent, Input } from '@remora/ui';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Diff, SessionSummary } from '../features/study/SessionSummary';
import { StudyShell, StudyState } from '../features/study/StudyShell';
import { useStudyTransition } from '../features/study/study-transition';
import { answerLang, questionImage, questionSide } from '../features/study/card-sides';
import { selectCurrent, useStudyStore, type QueueItem } from '../features/study/study-store';
import {
  useStudySession,
  useStudySessionFinalizer,
  type StudyDirectionMode,
} from '../features/study/use-study-session';
import { api } from '../lib/api';

export function ListenPage() {
  const { setId, folderId } = useParams();
  const targetId = setId ?? folderId ?? '';
  const isFolder = Boolean(folderId);
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
    folderId,
    mode: 'listen',
    scope: 'due',
    direction,
    enabled: status.data?.available === true,
  });

  const items = useStudyStore((state) => state.items);
  const index = useStudyStore((state) => state.index);
  const answers = useStudyStore((state) => state.answers);
  const sessionId = useStudyStore((state) => state.sessionId);
  const activeItem = useStudyStore(selectCurrent);
  const [answeredItem, setAnsweredItem] = useState<QueueItem | null>(null);
  const current = answeredItem ?? activeItem;
  const answer = useStudyStore((state) => state.answer);

  const { schedule, cancel } = useStudyTransition();
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const shownAt = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const finalizeSession = useStudySessionFinalizer(sessionId);

  const queue = query.data?.queue;
  const audio = useAudio(current, 'question');
  const nextAudio = useAudio(items[index + (answeredItem ? 0 : 1)] ?? null, 'question');

  useEffect(() => {
    inputRef.current?.focus();
  }, [answeredItem, current?.card.id, index]);

  useEffect(() => {
    if (items.length > 0 && (finished || !current)) void finalizeSession();
  }, [current, finalizeSession, finished, items.length]);

  const next = useCallback(() => {
    setAnsweredItem(null);
    setTyped('');
    setResult(null);
    setRevealed(false);
    shownAt.current = Date.now();
  }, []);

  const submit = useCallback(() => {
    if (!current || result) return;
    // Проверяем против озвученной стороны: услышал — записал именно её.
    const expected = questionSide(current);
    const verdict = checkAnswer(typed, expected, {
      strictness: queue?.answer_strictness ?? 'moderate',
      lang: answerLang(current, queue?.lang_definition, queue?.lang_term),
    });
    const correct = verdict.verdict !== 'incorrect';
    setAnsweredItem(current);
    setResult(verdict);
    answer({
      item: current,
      rating: correct ? 3 : 1,
      correct,
      typed,
      durationMs: Date.now() - shownAt.current,
      requeue: !correct,
    });
    if (correct) schedule(next, 600);
  }, [answer, current, next, queue, result, schedule, typed]);

  if (status.isPending) return <StudyState title="Проверяем озвучку" loading />;
  if (status.isError || status.data?.available === false) {
    return (
      <StudyState
        title={status.isError ? 'Не удалось проверить озвучку' : 'Озвучка пока недоступна'}
        error={status.isError}
        actions={
          <>
            {status.isError && (
              <Button onClick={() => void status.refetch()}>Попробовать снова</Button>
            )}
            <Button
              variant={status.isError ? 'secondary' : 'primary'}
              onClick={() =>
                navigate(isFolder ? `/folders/${targetId}/learn` : `/sets/${targetId}/learn`)
              }
            >
              Перейти к заучиванию
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate(isFolder ? '/sets/manage' : `/sets/${targetId}`)}
            >
              {isFolder ? 'К папкам' : 'К набору'}
            </Button>
          </>
        }
      >
        Сейчас не получается воспроизвести карточки. Можно продолжить в другом режиме.
      </StudyState>
    );
  }

  if (query.isPending) return <StudyState title="Готовим тренировку" loading />;
  if (query.isError)
    return (
      <StudyState
        title="Не удалось загрузить карточки"
        error
        actions={
          <>
            <Button onClick={() => void query.refetch()}>Попробовать снова</Button>
            <Button
              variant="ghost"
              onClick={() => navigate(isFolder ? '/sets/manage' : `/sets/${targetId}`)}
            >
              К материалам
            </Button>
          </>
        }
      >
        Проверьте подключение и попробуйте ещё раз.
      </StudyState>
    );

  if (items.length === 0) {
    return (
      <StudyState title="На сегодня всё повторено">
        <Button
          className="mt-6"
          variant="ghost"
          onClick={() => navigate(isFolder ? '/sets/manage' : `/sets/${targetId}`)}
        >
          {isFolder ? 'К папкам' : 'К набору'}
        </Button>
      </StudyState>
    );
  }

  if (finished || !current) {
    return (
      <SessionSummary
        setId={targetId}
        backHref={isFolder ? '/sets/manage' : undefined}
        backLabel={isFolder ? 'К папкам' : undefined}
        answers={answers}
        onRestart={async () => {
          if (!(await finalizeSession())) return;
          next();
          setFinished(false);
          await query.refetch();
        }}
      />
    );
  }

  const expected = questionSide(current);
  const wrong = result !== null && result.verdict === 'incorrect';

  return (
    <StudyShell
      title="На слух"
      subtitle={`Запишите услышанное · проверка «${STRICTNESS_LABELS[
        queue?.answer_strictness ?? 'moderate'
      ].toLowerCase()}»`}
      footer={
        <p className="study-shortcuts">
          <kbd>Enter</kbd> — проверить или продолжить
        </p>
      }
      done={index}
      total={items.length}
      onExit={() => {
        cancel();
        void finalizeSession();
        setFinished(true);
      }}
    >
      <Card className="study-question study-audio">
        <p className="study-side">Слушайте и записывайте</p>
        <div className="study-audio-control">
          {audio.isPending ? (
            <p className="text-fg-muted">Готовим озвучку…</p>
          ) : audio.data ? (
            <AudioPlayer
              src={audio.data.audio_url}
              preloadSrc={nextAudio.data?.audio_url ?? null}
              trackId={`${current.card.id}:${current.direction}`}
            />
          ) : (
            <div role="alert">
              <p className="text-fg-muted">Не удалось озвучить эту карточку.</p>
              <div className="study-actions">
                <Button variant="secondary" onClick={() => void audio.refetch()}>
                  Повторить озвучку
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    navigate(isFolder ? `/folders/${targetId}/write` : `/sets/${targetId}/write`)
                  }
                >
                  Перейти к письму
                </Button>
              </div>
            </div>
          )}
        </div>
        {revealed && (
          <CardContent
            value={expected}
            type={current.card.content_type}
            codeLanguage={current.card.code_language}
            imageUrl={questionImage(current)}
            imageAlt="Изображение вопроса"
            className="mt-4 text-lg"
          />
        )}
      </Card>

      <form
        className="study-answer-form"
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
          label="Что вы услышали"
          placeholder="Запишите слово или фразу"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Что вы услышали"
          readOnly={result !== null}
        />
        <div className="study-actions">
          <Button type="submit" disabled={result !== null && !wrong}>
            {wrong ? 'Дальше' : 'Проверить'}
          </Button>
          {!result && (
            <Button type="button" variant="ghost" onClick={() => setRevealed(true)}>
              Показать текст
            </Button>
          )}
        </div>
      </form>

      {result?.verdict === 'correct' && (
        <Card className="study-feedback study-feedback-success" role="status">
          <p className="text-success study-feedback-title">
            <span aria-hidden="true">✓</span> Верно
          </p>
        </Card>
      )}
      {result?.verdict === 'typo' && (
        <Card className="study-feedback study-feedback-warning" role="status">
          <p className="text-warning font-medium">Почти — засчитано как опечатка</p>
          <p className="text-fg-muted mt-1 text-sm">
            Правильно: <span className="text-fg font-medium">{expected}</span>
          </p>
        </Card>
      )}
      {wrong && (
        <Card className="study-feedback study-feedback-error" role="status">
          <p className="text-danger study-feedback-title">
            <span aria-hidden="true">↺</span> Повторим эту карточку
          </p>
          <p className="mt-2 text-sm">Правильно:</p>
          <CardContent
            value={expected}
            type={current.card.content_type}
            codeLanguage={current.card.code_language}
            imageUrl={questionImage(current)}
            imageAlt="Изображение ответа"
          />
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
