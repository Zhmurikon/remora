import { pluralWithCount } from '@remora/core';
import type { components } from '@remora/api-client';
import { Button, CardContent } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useBattleAnswer } from '../features/battle/useBattleAnswer';
import './battle.css';

type Room = components['schemas']['BattleRoomOut'];
type Created = components['schemas']['BattleCreateOut'];
const terminal = (room?: Room) =>
  Boolean(room && ['finished', 'expired', 'cancelled'].includes(room.status));

export function BattlePage() {
  const { setId, battleId } = useParams();
  return battleId ? (
    <BattleRoom key={battleId} battleId={battleId} />
  ) : (
    <BattleCreate key={setId} setId={setId ?? ''} />
  );
}

function Frame({
  children,
  title,
  description,
  back,
  action,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  back?: string;
  action?: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Смена шага объявляется фокусом, а polling и часы его не перехватывают.
  useEffect(() => {
    heading.current?.focus();
  }, [title]);
  return (
    <main className="battle-page">
      <div className="battle-toolbar">
        {back ? (
          <Link className="battle-back" to={back}>
            <BackIcon /> К набору
          </Link>
        ) : (
          <Link className="battle-back" to="/materials">
            <BackIcon /> К материалам
          </Link>
        )}
        {action}
      </div>
      <header className="battle-heading">
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        {description && <p>{description}</p>}
      </header>
      {children}
    </main>
  );
}

function BattleCreate({ setId }: { setId: string }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [count, setCount] = useState(10);
  const [direction, setDirection] = useState<'term_to_def' | 'def_to_term'>('term_to_def');
  const requestKey = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const set = useQuery({
    queryKey: ['sets', setId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/sets/{set_id}', {
        params: { path: { set_id: setId } },
      });
      if (error || !data) throw new Error(message(error));
      return data;
    },
  });
  const available = Math.min(20, set.data?.cards_count ?? 20);
  const selectedCount = Math.min(count, Math.max(4, available));
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/battles', {
        body: {
          set_id: setId,
          question_count: selectedCount,
          direction,
          request_key: requestKey.current,
        },
      });
      if (error || !data) throw new Error(message(error));
      return data;
    },
    onSuccess: (battle) => openCreated(battle, client, navigate),
    onSettled: () => {
      busy.current = false;
    },
  });
  const unavailable = set.data?.visibility === 'private' || available < 4;
  return (
    <Frame
      back={`/sets/${setId}`}
      title="Битва 1×1"
      description="Один набор. Два участника. Сначала точность, затем время."
    >
      <div className="battle-setup">
        <form
          className="battle-panel battle-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy.current || unavailable || !set.data) return;
            busy.current = true;
            create.mutate();
          }}
        >
          <h2>Пригласите соперника</h2>
          {set.isPending ? (
            <p role="status">Загружаем набор…</p>
          ) : set.error ? (
            <Notice error={set.error.message} retry={() => void set.refetch()} />
          ) : (
            <p className="battle-set-name">{set.data?.title}</p>
          )}
          <fieldset disabled={create.isPending || unavailable || !set.data}>
            <legend>Количество вопросов</legend>
            <div className="battle-counts">
              {Array.from({ length: Math.max(0, available - 3) }, (_, i) => i + 4).map((n) => (
                <label key={n}>
                  <input
                    type="radio"
                    name="count"
                    value={n}
                    checked={selectedCount === n}
                    onChange={() => {
                      setCount(n);
                      requestKey.current = crypto.randomUUID();
                      create.reset();
                    }}
                  />
                  <span>{n}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={create.isPending || unavailable || !set.data}>
            <legend>Что показывать первым</legend>
            <div className="battle-directions">
              {(['term_to_def', 'def_to_term'] as const).map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="direction"
                    checked={direction === value}
                    onChange={() => {
                      setDirection(value);
                      requestKey.current = crypto.randomUUID();
                      create.reset();
                    }}
                  />
                  <span>
                    <strong>
                      {value === 'term_to_def' ? 'Термин → определение' : 'Определение → термин'}
                    </strong>
                    <small>
                      {value === 'term_to_def'
                        ? 'Выберите значение термина'
                        : 'Узнайте термин по описанию'}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {unavailable && (
            <Notice
              error={
                set.data?.visibility === 'private'
                  ? 'Для битвы нужен публичный набор. Измените доступ в настройках набора.'
                  : 'Для битвы нужны хотя бы четыре карточки с различимыми ответами.'
              }
            />
          )}
          {create.error && <Notice error={create.error.message} />}
          <Button type="submit" loading={create.isPending} disabled={unavailable || !set.data}>
            Создать приглашение
          </Button>
        </form>
        <aside className="battle-rules">
          <h2>Как проходит битва</h2>
          <ol>
            <li>
              <strong>Поделитесь ссылкой</strong>
              <p>Соперник войдёт в свой аккаунт. Приглашение действует 10 минут.</p>
            </li>
            <li>
              <strong>Подтвердите готовность</strong>
              <p>После готовности обоих — три секунды до общего старта.</p>
            </li>
            <li>
              <strong>Отвечайте точно</strong>
              <p>
                Вопросы и варианты одинаковы. Время решает только при равном числе верных ответов.
              </p>
            </li>
          </ol>
          <p className="battle-footnote">Битва не меняет расписание повторений.</p>
        </aside>
      </div>
    </Frame>
  );
}

function openCreated(
  battle: Created,
  client: ReturnType<typeof useQueryClient>,
  navigate: ReturnType<typeof useNavigate>,
) {
  client.setQueryData(['battle', battle.id], battle);
  navigate(`/battles/${battle.id}?invite=${encodeURIComponent(battle.invite_token)}`);
}

function BattleRoom({ battleId }: { battleId: string }) {
  const [search] = useSearchParams();
  const invite = search.get('invite');
  const client = useQueryClient();
  const navigate = useNavigate();
  const room = useQuery({
    queryKey: ['battle', battleId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/battles/{battle_id}', {
        params: { path: { battle_id: battleId } },
      });
      if (error || !data) throw new Error(message(error));
      return data;
    },
    refetchInterval: (query) => (terminal(query.state.data) || !query.state.data ? false : 1_000),
  });
  const busy = useRef(false);
  const join = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/battles/join', {
        body: { invite_token: invite ?? '' },
      });
      if (error || !data) throw new Error(message(error));
      return data;
    },
    onSuccess: (data) => {
      client.setQueryData(['battle', data.id], data);
      if (data.id !== battleId) navigate(`/battles/${data.id}`, { replace: true });
    },
    onSettled: () => {
      busy.current = false;
    },
  });
  if (!room.data) {
    if (room.isPending)
      return (
        <Frame title="Открываем битву">
          <div className="battle-panel battle-loading" role="status">
            Загружаем комнату и участников…
          </div>
        </Frame>
      );
    if (invite)
      return (
        <Frame
          title="Вас пригласили в битву"
          description="Пройдите один набор с соперником. Побеждает точность."
        >
          <section className="battle-panel battle-entry">
            <h2>Займите второе место</h2>
            <p>
              После входа вы увидите набор и участников. Игра начнётся, когда оба подтвердят
              готовность.
            </p>
            {join.error && <Notice error={join.error.message} />}
            <Button
              loading={join.isPending}
              onClick={() => {
                if (!busy.current) {
                  busy.current = true;
                  join.mutate();
                }
              }}
            >
              {join.error ? 'Повторить вход' : 'Присоединиться'}
            </Button>
            <p className="battle-footnote">
              Ссылка действует 10 минут и рассчитана на одного соперника.
            </p>
          </section>
        </Frame>
      );
    return (
      <Frame title="Битва недоступна">
        <Notice
          error={room.error?.message ?? 'Не удалось открыть комнату.'}
          retry={() => void room.refetch()}
        />
      </Frame>
    );
  }
  return (
    <BattleScreen
      room={room.data}
      invite={invite}
      syncError={Boolean(room.error)}
      retry={() => void room.refetch()}
    />
  );
}

function BattleScreen({
  room,
  invite,
  syncError,
  retry,
}: {
  room: Room;
  invite: string | null;
  syncError: boolean;
  retry: () => void;
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const mine = room.participants.find((p) => p.is_current);
  const index = mine?.answered_count ?? 0;
  const current = room.questions[index];
  const [confirmLeave, setConfirmLeave] = useState(false);
  const readyBusy = useRef(false);
  const leaveBusy = useRef(false);
  const images = useBattleImages(room);
  const clock = useBattleClock(room);
  const answer = useBattleAnswer(room);
  const ready = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/battles/{battle_id}/ready', {
        params: { path: { battle_id: room.id } },
      });
      if (error || !data) throw new Error(message(error));
      return data;
    },
    onSuccess: (data) => client.setQueryData(['battle', room.id], data),
    onSettled: () => {
      readyBusy.current = false;
    },
  });
  const leave = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/battles/{battle_id}/leave', {
        params: { path: { battle_id: room.id } },
      });
      if (error || !data) throw new Error(message(error));
      return data;
    },
    onSuccess: (data) => {
      client.setQueryData(['battle', room.id], data);
      navigate(`/sets/${room.set_id}`);
    },
    onSettled: () => {
      leaveBusy.current = false;
    },
  });
  const choose = useCallback(
    (value: string) => {
      if (room.status === 'active' && current && !confirmLeave)
        answer.choose(current.id, value, index);
    },
    [room.status, current, confirmLeave, answer, index],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      )
        return;
      const option = current?.options[Number(event.key) - 1];
      if (
        /^[1-4]$/.test(event.key) &&
        option !== undefined &&
        room.status === 'active' &&
        !confirmLeave
      ) {
        event.preventDefault();
        choose(option);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choose, current, room.status, confirmLeave]);
  if (room.status === 'finished') return <BattleResult room={room} />;
  if (room.status === 'expired' || room.status === 'cancelled')
    return (
      <Frame
        title={room.status === 'expired' ? 'Приглашение истекло' : 'Битва отменена'}
        back={`/sets/${room.set_id}`}
        description={room.set_title}
      >
        <section className="battle-panel battle-entry">
          <p>
            {room.status === 'expired'
              ? 'За 10 минут битва не началась. Создайте новое приглашение и отправьте его сопернику.'
              : 'Один из участников вышел до старта. Можно создать новое приглашение.'}
          </p>
          <Link className="battle-primary-link" to={`/sets/${room.set_id}/battle`}>
            Новая битва
          </Link>
        </section>
      </Frame>
    );
  const completed = index >= room.question_count;
  const title =
    room.status === 'waiting'
      ? 'Комната ожидания'
      : room.status === 'countdown'
        ? 'Приготовьтесь'
        : completed
          ? 'Ваши ответы приняты'
          : `Вопрос ${index + 1} из ${room.question_count}`;
  return (
    <Frame
      title={title}
      description={room.set_title}
      action={
        <button type="button" className="battle-text-button" onClick={() => setConfirmLeave(true)}>
          Выйти из битвы
        </button>
      }
    >
      {confirmLeave && (
        <section className="battle-notice" aria-label="Выход из битвы">
          <h2>Выйти из битвы?</h2>
          <p>
            {room.status === 'active'
              ? 'Принятые ответы сохранятся. Оставшиеся вопросы будут засчитаны как ошибки.'
              : 'Выход до старта отменит битву для обоих участников.'}
          </p>
          <div className="battle-actions">
            <Button
              variant="secondary"
              disabled={leave.isPending}
              onClick={() => setConfirmLeave(false)}
            >
              Остаться
            </Button>
            <Button
              variant="danger"
              loading={leave.isPending}
              disabled={answer.sending}
              onClick={() => {
                if (!leaveBusy.current) {
                  leaveBusy.current = true;
                  leave.mutate();
                }
              }}
            >
              Подтвердить выход
            </Button>
          </div>
          {leave.error && <Notice error={leave.error.message} />}
        </section>
      )}
      {syncError && (
        <Notice
          error="Не удалось обновить комнату. Восстанавливаем соединение; время битвы продолжает идти."
          retry={retry}
        />
      )}
      <Participants room={room} />
      {room.status === 'waiting' && (
        <section className="battle-panel battle-lobby">
          <div>
            <h2>
              {room.participants.length < 2 ? 'Приглашение готово' : 'Оба участника в комнате'}
            </h2>
            <p>
              {room.participants.length < 2
                ? 'Отправьте ссылку сопернику. Можно подтвердить готовность уже сейчас.'
                : 'Подтвердите готовность. Когда оба будут готовы, начнётся отсчёт.'}
            </p>
            {invite && <InviteLink invite={invite} battleId={room.id} />}
          </div>
          <div className="battle-ready">
            <p>
              {pluralWithCount(room.question_count, ['вопрос', 'вопроса', 'вопросов'])} ·{' '}
              {room.direction === 'term_to_def' ? 'Термин → определение' : 'Определение → термин'}
            </p>
            {images.status === 'loading' && <p role="status">Загружаем изображения…</p>}
            {images.status === 'error' && (
              <Notice error="Не удалось загрузить изображения вопросов." retry={images.retry} />
            )}
            <Button
              loading={ready.isPending}
              disabled={Boolean(mine?.ready) || images.status !== 'ready' || confirmLeave}
              onClick={() => {
                if (!readyBusy.current) {
                  readyBusy.current = true;
                  ready.mutate();
                }
              }}
            >
              {mine?.ready ? 'Вы готовы' : 'Я готов'}
            </Button>
            {mine?.ready && <p role="status">Ждём готовности соперника.</p>}
            {ready.error && <Notice error={ready.error.message} />}
          </div>
        </section>
      )}
      {room.status === 'countdown' && (
        <section className="battle-panel battle-countdown" role="status" aria-live="polite">
          <p>Общий старт через</p>
          <strong key={clock.countdown}>{clock.countdown > 0 ? clock.countdown : 'Старт'}</strong>
          <p>Сначала точность. Время — при равном счёте.</p>
        </section>
      )}
      {room.status === 'active' && (
        <>
          <div className="battle-game-meta">
            <span>{completed ? 'Ждём соперника' : 'Выберите один ответ'}</span>
            <span>Осталось {clock.remaining}</span>
          </div>
          {completed ? (
            <section className="battle-panel battle-entry" role="status">
              <h2>Вы ответили на все вопросы</h2>
              <p>Результат появится, когда закончит соперник или истечёт время битвы.</p>
            </section>
          ) : (
            current && (
              <section className="battle-panel battle-question" aria-label={`Вопрос ${index + 1}`}>
                <div className="battle-prompt">
                  <CardContent
                    value={current.prompt}
                    type={current.content_type}
                    codeLanguage={current.code_language ?? undefined}
                    imageUrl={current.prompt_image_url ?? undefined}
                  />
                </div>
                <div className="battle-options">
                  {current.options.map((option, i) => (
                    <button
                      className="battle-option"
                      key={`${current.id}-${i}`}
                      type="button"
                      disabled={Boolean(answer.pending) || confirmLeave}
                      data-selected={
                        answer.pending?.value === option &&
                        answer.pending.question_id === current.id
                      }
                      onClick={() => choose(option)}
                    >
                      <kbd aria-hidden="true">{i + 1}</kbd>
                      <CardContent value={option} type="text" />
                    </button>
                  ))}
                </div>
                <p className="battle-key-hint">Клавиши 1–4 — выбрать ответ</p>
              </section>
            )
          )}
          {answer.pending && (
            <div className="battle-notice" role="status">
              <p>
                {answer.error
                  ? 'Ответ сохранён на устройстве. Повторяем отправку при восстановлении связи.'
                  : 'Отправляем ответ…'}
              </p>
              {answer.error && (
                <button
                  className="battle-text-button"
                  disabled={answer.sending}
                  onClick={answer.retry}
                >
                  Повторить отправку
                </button>
              )}
            </div>
          )}
          {answer.storageError && (
            <Notice error="Браузер не разрешил сохранить ответ на устройстве. Не закрывайте эту страницу до подтверждения отправки." />
          )}
        </>
      )}
      <p className="battle-footnote">
        {room.status === 'active'
          ? 'Правильные ответы откроются после общего финиша. Перезагрузка не останавливает время.'
          : 'Одинаковые вопросы и варианты для обоих. Расписание повторений не меняется.'}
      </p>
    </Frame>
  );
}

function InviteLink({ invite, battleId }: { invite: string; battleId: string }) {
  const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle');
  const url = `${window.location.origin}${import.meta.env.BASE_URL}battles/${battleId}?invite=${encodeURIComponent(invite)}`;
  const field = useRef<HTMLInputElement>(null);
  return (
    <div className="battle-invite">
      <label htmlFor="battle-invite">Ссылка-приглашение</label>
      <div>
        <input
          ref={field}
          id="battle-invite"
          readOnly
          value={url}
          onFocus={(event) => event.target.select()}
        />
        <Button
          variant="secondary"
          disabled={state === 'copying'}
          onClick={async () => {
            setState('copying');
            try {
              await navigator.clipboard.writeText(url);
              setState('copied');
            } catch {
              setState('failed');
              field.current?.focus();
              field.current?.select();
            }
          }}
        >
          {state === 'copied' ? 'Скопировано' : 'Копировать'}
        </Button>
      </div>
      <p role="status">
        {state === 'failed'
          ? 'Не удалось скопировать. Ссылка выделена — скопируйте её вручную.'
          : state === 'copied'
            ? 'Ссылка скопирована. Отправьте её сопернику.'
            : 'Действует 10 минут с момента создания комнаты.'}
      </p>
    </div>
  );
}

function Participants({ room }: { room: Room }) {
  return (
    <ul className="battle-players" aria-label="Участники">
      {[1, 2].map((slot) => {
        const player = room.participants.find((p) => p.slot === slot);
        return (
          <li key={slot} className="battle-player" data-current={player?.is_current ?? false}>
            <div className="battle-player-top">
              <strong>
                {player ? player.display_name || player.username : 'Ваш соперник'}
                {player?.is_current && <small>Вы</small>}
              </strong>
              <span className="battle-player-state">
                {!player
                  ? 'Пока не в комнате'
                  : !player.is_connected
                    ? 'Нет связи'
                    : room.status === 'waiting'
                      ? player.ready
                        ? 'Готов'
                        : 'Не готов'
                      : room.status === 'countdown'
                        ? 'Готов'
                        : `${player.answered_count} из ${room.question_count}`}
              </span>
            </div>
            <progress
              aria-label={
                player ? `Ответы: ${player.display_name || player.username}` : 'Ответы соперника'
              }
              value={player?.answered_count ?? 0}
              max={room.question_count}
            />
          </li>
        );
      })}
    </ul>
  );
}

function BattleResult({ room }: { room: Room }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const key = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const result = useQuery({
    queryKey: ['battle-result', room.id],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/battles/{battle_id}/result', {
        params: { path: { battle_id: room.id } },
      });
      if (error || !data) throw new Error(message(error));
      return data;
    },
  });
  const rematch = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/battles/{battle_id}/rematch', {
        params: { path: { battle_id: room.id } },
        body: { request_key: key.current },
      });
      if (error || !data) throw new Error(message(error));
      return data;
    },
    onSuccess: (data) => openCreated(data, client, navigate),
    onSettled: () => {
      busy.current = false;
    },
  });
  const mine = room.participants.find((p) => p.is_current);
  const title = room.is_draw
    ? 'Ничья'
    : room.winner_id === mine?.user_id
      ? 'Вы победили'
      : 'Битва завершена';
  return (
    <Frame back={`/sets/${room.set_id}`} title={title} description={room.set_title}>
      <section className="battle-panel battle-result">
        <h2>Точность решает</h2>
        <p>
          {room.is_draw
            ? 'Верных ответов поровну, разница во времени — не больше половины секунды.'
            : 'Сначала сравниваем верные ответы. При равном счёте — время.'}
        </p>
        <div className="battle-scoreboard">
          {room.participants.map((player) => (
            <div
              className="battle-score"
              key={player.user_id}
              data-winner={room.winner_id === player.user_id}
            >
              <h3>
                {player.display_name || player.username}
                {player.is_current ? ' · вы' : ''}
              </h3>
              <p className="battle-score-value">
                {player.correct_count ?? 0}
                <span> / {room.question_count}</span>
              </p>
              <p>верных ответов · {formatTime(player.duration_ms)}</p>
              <p className="battle-score-outcome">
                {room.is_draw
                  ? 'Ничья'
                  : room.winner_id === player.user_id
                    ? 'Победитель'
                    : 'Битва завершена'}
              </p>
            </div>
          ))}
        </div>
        {room.finish_reason === 'timeout' && (
          <p className="battle-footnote">Время вышло. Вопросы без ответа засчитаны как ошибки.</p>
        )}
        <div className="battle-actions">
          <Button
            loading={rematch.isPending}
            onClick={() => {
              if (!busy.current) {
                busy.current = true;
                rematch.mutate();
              }
            }}
          >
            Реванш
          </Button>
          <Link className="battle-back" to={`/sets/${room.set_id}`}>
            Вернуться к набору
          </Link>
        </div>
        <p className="battle-footnote">
          Реванш создаст новую комнату. Отправьте сопернику новую ссылку.
        </p>
        {rematch.error && <Notice error={rematch.error.message} />}
      </section>
      <section className="battle-review">
        <h2>Ваши ответы</h2>
        <p>Разбор виден только вам. Битва не меняет расписание повторений.</p>
        {result.isPending && <p role="status">Загружаем разбор…</p>}
        {result.error && (
          <Notice
            error="Не удалось загрузить разбор. Итог битвы сохранён."
            retry={() => void result.refetch()}
          />
        )}
        {result.data && (
          <ol>
            {result.data.review.map((item, index) => {
              const question = room.questions.find((q) => q.id === item.question_id);
              return (
                <li key={item.question_id}>
                  <details>
                    <summary>
                      <span className="battle-review-number">{index + 1}</span>
                      <span className="battle-review-prompt">
                        <CardContent
                          value={question?.prompt ?? `Вопрос ${index + 1}`}
                          type={question?.content_type ?? 'text'}
                          codeLanguage={question?.code_language ?? undefined}
                          imageUrl={question?.prompt_image_url ?? undefined}
                        />
                      </span>
                      <span className={item.correct ? 'battle-correct' : 'battle-incorrect'}>
                        {item.correct ? 'Верно' : item.given ? 'Ошибка' : 'Без ответа'}
                      </span>
                      <svg
                        className="battle-disclosure"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        aria-hidden="true"
                      >
                        <path d="m7 10 5 5 5-5" />
                      </svg>
                    </summary>
                    <div className="battle-review-answer">
                      <div>
                        <h3>Ваш ответ</h3>
                        <CardContent value={item.given || 'Нет ответа'} type="text" />
                      </div>
                      {!item.correct && (
                        <div>
                          <h3>Правильный ответ</h3>
                          <CardContent value={item.expected} type="text" />
                        </div>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </Frame>
  );
}

function Notice({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="battle-notice" role="alert">
      <p>{error}</p>
      {retry && (
        <button className="battle-text-button" onClick={retry}>
          Повторить
        </button>
      )}
    </div>
  );
}
function formatTime(value: number | null | undefined) {
  return value == null
    ? '—'
    : `${(value / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} с`;
}
function message(error: unknown): string {
  return typeof error === 'object' && error && 'message' in error
    ? String(error.message)
    : 'Не удалось выполнить действие. Проверьте соединение и повторите.';
}

function useBattleClock(room: Room) {
  const [now, setNow] = useState(Date.now());
  const offset = useRef(Date.parse(room.server_now) - Date.now());
  useEffect(() => {
    offset.current = Date.parse(room.server_now) - Date.now();
  }, [room.server_now]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(
    0,
    Math.ceil(
      ((room.deadline_at ? Date.parse(room.deadline_at) : now) - now - offset.current) / 1000,
    ),
  );
  return {
    countdown: Math.max(
      0,
      Math.ceil(
        ((room.starts_at ? Date.parse(room.starts_at) : now) - now - offset.current) / 1000,
      ),
    ),
    remaining: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
  };
}

function useBattleImages(room: Room) {
  const urls = room.questions
    .map((q) => q.prompt_image_url)
    .filter((url): url is string => Boolean(url));
  // Подписанные ссылки обновляются при polling, но содержимое снимка остаётся прежним.
  const identity = room.questions
    .filter((q) => q.prompt_image_url)
    .map((q) => q.id)
    .join('|');
  const sources = useRef(urls);
  sources.current = urls;
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    urls.length ? 'loading' : 'ready',
  );
  useEffect(() => {
    let cancelled = false;
    const images: HTMLImageElement[] = [];
    setStatus(sources.current.length ? 'loading' : 'ready');
    const timer = window.setTimeout(() => {
      if (!cancelled) setStatus('error');
    }, 15_000);
    void Promise.all(
      sources.current.map(
        (url) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            images.push(img);
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('image'));
            img.src = url;
          }),
      ),
    )
      .then(() => {
        if (!cancelled) setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      images.forEach((img) => {
        img.onload = null;
        img.onerror = null;
      });
    };
  }, [identity, attempt]);
  return { status, retry: () => setAttempt((value) => value + 1) };
}

function BackIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="m10 5-7 7 7 7M3 12h18" />
    </svg>
  );
}
