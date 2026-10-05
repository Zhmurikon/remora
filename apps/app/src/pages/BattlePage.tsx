import type { components } from '@remora/api-client';
import { Button, Card, CardContent } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

type Room = components['schemas']['BattleRoomOut'];
type Result = components['schemas']['BattleResultOut'];

export function BattlePage() {
  const { setId, battleId } = useParams();
  return battleId ? <BattleRoom battleId={battleId} /> : <BattleCreate setId={setId ?? ''} />;
}

function BattleCreate({ setId }: { setId: string }) {
  const navigate = useNavigate();
  const [count, setCount] = useState(10);
  const [direction, setDirection] = useState<'term_to_def' | 'def_to_term'>('term_to_def');
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/battles', {
        body: { set_id: setId, question_count: count, direction, request_key: crypto.randomUUID() },
      });
      if (error || !data) throw new Error(message(error));
      return data;
    },
    onSuccess: (battle) => navigate(`/battles/${battle.id}?invite=${encodeURIComponent(battle.invite_token)}`),
  });
  return <main className="mx-auto max-w-2xl"><Link to={`/sets/${setId}`} className="text-primary text-sm font-medium">← К набору</Link><h1 className="mt-5 text-2xl font-semibold tracking-tight">Битва 1×1</h1><p className="text-fg-muted mt-2">Пройдите один набор с соперником. Сначала точность, затем время.</p><Card className="mt-6 space-y-5 p-6"><label className="block text-sm font-medium">Вопросов<select className="border-border mt-2 block min-h-11 w-full rounded-md border bg-surface px-3" value={count} onChange={(e) => setCount(Number(e.target.value))}>{[4, 5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}</select></label><label className="block text-sm font-medium">Направление<select className="border-border mt-2 block min-h-11 w-full rounded-md border bg-surface px-3" value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}><option value="term_to_def">Термин → определение</option><option value="def_to_term">Определение → термин</option></select></label>{create.error && <p className="text-danger text-sm">{create.error.message}</p>}<Button loading={create.isPending} onClick={() => create.mutate()}>Создать приглашение</Button></Card></main>;
}

function BattleRoom({ battleId }: { battleId: string }) {
  const [search] = useSearchParams();
  const invite = search.get('invite');
  const client = useQueryClient();
  const [joinDone, setJoinDone] = useState(!invite);
  const join = useMutation({ mutationFn: async () => { const { data, error } = await api.POST('/api/v1/battles/join', { body: { invite_token: invite ?? '' } }); if (error || !data) throw new Error(message(error)); return data; }, onSuccess: () => { setJoinDone(true); void client.invalidateQueries({ queryKey: ['battle', battleId] }); } });
  useEffect(() => { if (invite && !joinDone && !join.isPending && !join.error) join.mutate(); }, [invite, join, joinDone]);
  const room = useQuery({ queryKey: ['battle', battleId], enabled: joinDone, queryFn: async () => { const { data, error } = await api.GET('/api/v1/battles/{battle_id}', { params: { path: { battle_id: battleId } } }); if (error || !data) throw new Error(message(error)); return data; }, refetchInterval: (q) => q.state.data?.status === 'finished' ? false : 1_000 });
  if (join.error || room.error) return <Problem error={(join.error ?? room.error)?.message ?? 'Не удалось открыть битву'} />;
  if (!joinDone || room.isLoading) return <main className="mx-auto max-w-2xl"><p className="text-fg-muted">Открываем комнату…</p></main>;
  if (!room.data) return null;
  return <BattleScreen room={room.data} battleId={battleId} invite={invite} />;
}

function BattleScreen({ room, battleId, invite }: { room: Room; battleId: string; invite: string | null }) {
  const client = useQueryClient(); const [index, setIndex] = useState(0); const current = room.questions[index];
  const ready = useMutation({ mutationFn: async () => { const { data, error } = await api.POST('/api/v1/battles/{battle_id}/ready', { params: { path: { battle_id: battleId } } }); if (error || !data) throw new Error(message(error)); return data; }, onSuccess: (data) => client.setQueryData(['battle', battleId], data) });
  const answer = useMutation({ mutationFn: async (value: string) => { if (!current) throw new Error('Вопрос не найден'); const { data, error } = await api.POST('/api/v1/battles/{battle_id}/answers', { params: { path: { battle_id: battleId } }, body: { client_answer_id: crypto.randomUUID(), question_id: current.id, value } }); if (error || !data) throw new Error(message(error)); return data; }, onSuccess: (data) => { client.setQueryData(['battle', battleId], data.room); setIndex((v) => Math.min(v + 1, room.questions.length - 1)); } });
  const mine = room.participants.find((p) => p.is_current); const start = room.starts_at ? new Date(room.starts_at).getTime() - Date.now() : 0;
  const [left, setLeft] = useState(start); useEffect(() => { const timer = window.setInterval(() => setLeft(room.starts_at ? new Date(room.starts_at).getTime() - Date.now() : 0), 200); return () => window.clearInterval(timer); }, [room.starts_at]);
  if (room.status === 'finished') return <BattleResult battleId={battleId} room={room} />;
  return <main className="mx-auto max-w-3xl"><header className="flex flex-wrap justify-between gap-3"><div><p className="text-fg-muted text-sm">Битва · {room.set_title}</p><h1 className="text-2xl font-semibold">{room.status === 'active' ? `Вопрос ${index + 1} из ${room.question_count}` : 'Комната ожидания'}</h1></div><p className="text-fg-muted text-sm">{mine?.answered_count ?? 0} / {room.question_count} отвечено</p></header><Card className="mt-6 p-6"><Participants room={room} />{room.status === 'waiting' && <div className="mt-6 space-y-3"><p className="text-fg-muted text-sm">Отправьте ссылку сопернику и подтвердите готовность.</p>{invite && <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(window.location.href)}>Скопировать приглашение</Button>}<Button className="ml-3" loading={ready.isPending} disabled={Boolean(mine?.ready)} onClick={() => ready.mutate()}>{mine?.ready ? 'Вы готовы' : 'Я готов'}</Button></div>}{room.status === 'countdown' && <p className="mt-8 text-center text-xl font-semibold">Старт через {Math.max(1, Math.ceil(left / 1000))}…</p>}{room.status === 'active' && current && <section className="mt-8"><CardContent value={current.prompt} type={current.content_type} codeLanguage={current.code_language ?? undefined} imageUrl={current.prompt_image_url ?? undefined} className="text-xl" /><div className="mt-6 grid gap-3">{current.options.map((option) => <Button key={option} variant="secondary" disabled={answer.isPending} onClick={() => answer.mutate(option)}><CardContent value={option} type="text" /></Button>)}</div>{answer.error && <p className="text-danger mt-3 text-sm">{answer.error.message}</p>}</section>}</Card></main>;
}

function Participants({ room }: { room: Room }) { return <ul className="space-y-2">{room.participants.map((p) => <li key={p.user_id} className="border-border flex min-h-11 items-center justify-between rounded-md border px-3"><span>{p.display_name || p.username}{p.is_current ? ' · вы' : ''}</span><span className="text-fg-muted text-sm">{p.ready ? 'Готов' : 'Ожидает'} · {p.answered_count}/{room.question_count}</span></li>)}</ul>; }
function BattleResult({ battleId, room }: { battleId: string; room: Room }) { const navigate = useNavigate(); const result = useQuery({ queryKey: ['battle-result', battleId], queryFn: async () => { const { data, error } = await api.GET('/api/v1/battles/{battle_id}/result', { params: { path: { battle_id: battleId } } }); if (error || !data) throw new Error(message(error)); return data; } }); const rematch = useMutation({ mutationFn: async () => { const { data, error } = await api.POST('/api/v1/battles/{battle_id}/rematch', { params: { path: { battle_id: battleId } }, body: { request_key: crypto.randomUUID() } }); if (error || !data) throw new Error(message(error)); return data; }, onSuccess: (battle) => navigate(`/battles/${battle.id}?invite=${encodeURIComponent(battle.invite_token)}`) }); if (!result.data) return <main className="mx-auto max-w-2xl"><p className="text-fg-muted">Считаем результат…</p></main>; const mine = result.data.participants.find((p) => p.is_current); return <main className="mx-auto max-w-2xl"><h1 className="text-2xl font-semibold">{room.winner_id === mine?.user_id ? 'Победа' : room.is_draw ? 'Ничья' : 'Битва завершена'}</h1><Card className="mt-6 p-6"><p className="text-fg-muted">{mine?.correct_count} из {room.question_count} верно · {formatTime(mine?.duration_ms)}</p>{rematch.error && <p className="text-danger mt-3 text-sm">{rematch.error.message}</p>}<Button className="mt-6" loading={rematch.isPending} onClick={() => rematch.mutate()}>Реванш</Button></Card></main>; }
function Problem({ error }: { error: string }) { return <main className="mx-auto max-w-2xl"><h1 className="text-2xl font-semibold">Битва недоступна</h1><p className="text-danger mt-3">{error}</p></main>; }
function formatTime(value: number | null | undefined) { return value == null ? '—' : `${(value / 1000).toFixed(1)} с`; }
function message(error: unknown) { return typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Не удалось выполнить действие'; }
