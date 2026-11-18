import type { components } from '@remora/api-client';
import { formatBytes } from '@remora/core';
import { Button, Card, Input } from '@remora/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  SettingsDirtyContext,
  SettingsFeedback,
  SettingsSaveBar,
  useSettingsDirty,
  settingsError,
  type SettingsNotice,
} from '../features/settings/SettingsFeedback';
import './settings.css';
import { SettingsLeaveGuard } from '../features/settings/SettingsLeaveGuard';
import { useAuthStore } from '../features/auth/auth-store';
import { StudySettingsForm } from '../features/study/StudySettingsForm';
import { api, clearAccessToken } from '../lib/api';
import { ApiTokens } from './ApiTokens';
import { BotConnections } from './BotConnections';

type Session = components['schemas']['SessionPublic'];

const sections = [
  {
    id: 'profile',
    label: 'Профиль',
    icon: 'M20 21v-2a7 7 0 0 0-14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    fields: ['Email', 'Имя пользователя', 'Отображаемое имя', 'Язык', 'Часовой пояс'],
  },
  {
    id: 'password',
    label: 'Пароль',
    icon: 'M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4',
    fields: ['Текущий пароль', 'Новый пароль', 'Повторите новый пароль'],
  },
  {
    id: 'study',
    label: 'Обучение',
    icon: 'm2 8 10-5 10 5-10 5L2 8Zm4 2v7c4 3 8 3 12 0v-7m4-2v8',
    fields: [
      'Готовые варианты',
      'Заучивание',
      'Расписание повторений',
      'Выбор ответа',
      'Написание ответа',
      'Карточка с самооценкой',
      'Карточек в сессии',
      'Успешных ответов на карточку',
      'Проверка написанного ответа',
      'Минимальное совпадение, %',
      'Целевое удержание, %',
      'Максимальный интервал, дней',
      'Новых карточек в день',
      'Повторений в день',
      'Дневная цель, карточек',
      'Строгость проверки ответов',
    ],
  },
  {
    id: 'data',
    label: 'Ваши данные',
    icon: 'M4 3h16v5H4zM6 8v13h12V8m-8 4h4',
    fields: ['Скачать ZIP', 'Запросить архив'],
  },
  {
    id: 'api',
    label: 'API и ИИ-агенты',
    icon: 'm7 6-5 6 5 6m10-12 5 6-5 6M14 3l-4 18',
    fields: [
      'Название токена',
      'Срок действия',
      'Права доступа',
      'Читать свои наборы и курсы',
      'Создавать и изменять материалы',
      'Публиковать курсы и снимать с публикации',
    ],
  },
  {
    id: 'bots',
    label: 'Боты Telegram и VK',
    icon: 'm3 10 18-7-7 18-3-7-8-4Zm8 4L21 3',
    fields: ['Telegram', 'VK', 'Команда привязки'],
  },
  {
    id: 'sessions',
    label: 'Активные устройства',
    icon: 'M3 3h18v14H3zM8 21h8m-4-4v4',
    fields: ['Браузер', 'IP', 'Завершить сеанс', 'Выйти'],
  },
];

function SectionIcon({ path }: { path: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const active = sections.find((item) => `#${item.id}` === location.hash)?.id ?? 'profile';
  const [search, setSearch] = useState('');
  const [dirtySections, setDirtySections] = useState<Record<string, boolean>>({});
  const panelRoot = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const reportDirty = useCallback((section: string, dirty: boolean) => {
    setDirtySections((current) =>
      current[section] === dirty ? current : { ...current, [section]: dirty },
    );
  }, []);
  const dirty = Object.values(dirtySections).some(Boolean);

  const term = search.trim().toLocaleLowerCase('ru');
  const results = term
    ? sections.flatMap((section) =>
        [section.label, ...section.fields]
          .filter((label) => label.toLocaleLowerCase('ru').includes(term))
          .map((label) => ({ section, label })),
      )
    : [];
  const pendingFocus = useRef<{ id: string; label?: string } | null>(null);
  function select(id: string, label?: string) {
    setSearch('');
    pendingFocus.current = { id, label };
    navigate({ hash: `#${id}` }, { replace: true });
  }
  useEffect(() => {
    if (!pendingFocus.current || pendingFocus.current.id !== active) return;
    const { id, label } = pendingFocus.current;
    pendingFocus.current = null;
    // Фокус переносится после смены маршрута, когда панель уже видима.
    const panel = panelRoot.current?.querySelector<HTMLElement>(`[data-section="${id}"]`);
    if (!panel) return;
    const match = label
      ? Array.from(panel.querySelectorAll<HTMLElement>('label, legend, h3, button')).find(
          (element) => element.textContent?.trim() === label,
        )
      : undefined;
    let target: HTMLElement | null = match ?? panel.querySelector('h2');
    if (match instanceof HTMLLabelElement)
      target = match.control ?? match.querySelector('input, select') ?? match;
    for (
      let parent = target?.parentElement;
      parent && parent !== panel;
      parent = parent.parentElement
    ) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
    if (target) {
      if (!target.matches('input, select, button, a, textarea')) target.tabIndex = -1;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'nearest' });
    }
  }, [active, location.key]);

  return (
    <SettingsDirtyContext.Provider value={reportDirty}>
      <SettingsLeaveGuard dirty={dirty} />
      <div
        className="account-settings"
        onInvalidCapture={(event) => {
          if (!(event.target instanceof HTMLElement)) return;
          for (let element = event.target.parentElement; element; element = element.parentElement) {
            if (element instanceof HTMLDetailsElement) element.open = true;
          }
        }}
      >
        <header className="settings-heading">
          <h1>Настройки</h1>
          <div className="settings-search">
            <SectionIcon path="M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0" />
            <input
              ref={searchInput}
              type="search"
              aria-label="Найти настройку"
              placeholder="Найти настройку"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSearch('');
              }}
            />
            {search && (
              <button
                type="button"
                aria-label="Очистить поиск"
                title="Очистить поиск"
                onClick={() => {
                  setSearch('');
                  searchInput.current?.focus();
                }}
              >
                <SectionIcon path="m6 6 12 12M6 18 18 6" />
              </button>
            )}
            {term && (
              <div className="settings-search-results" aria-label="Результаты поиска">
                <p role="status">
                  {results.length
                    ? `Найдено: ${results.length}`
                    : 'Ничего не найдено. Попробуйте другое название.'}
                </p>
                {results.map(({ section, label }) => (
                  <button
                    type="button"
                    key={`${section.id}-${label}`}
                    onClick={() => select(section.id, label)}
                  >
                    <span>{label}</span>
                    <small>{section.label}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>
        <div className="settings-workspace">
          <nav className="settings-nav" aria-label="Разделы настроек">
            <label className="settings-mobile-select">
              Раздел настроек
              <select value={active} onChange={(event) => select(event.target.value)}>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.label}
                    {dirtySections[section.id] ? ' · изменено' : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="settings-nav-links">
              {sections.map((section) => (
                <button
                  type="button"
                  key={section.id}
                  aria-current={active === section.id ? 'page' : undefined}
                  onClick={() => select(section.id)}
                >
                  <SectionIcon path={section.icon} />
                  <span>{section.label}</span>
                  {dirtySections[section.id] && (
                    <span
                      className="settings-dirty-dot"
                      aria-label="Есть несохранённые изменения"
                    />
                  )}
                </button>
              ))}
            </div>
            <p className="settings-nav-note">Каждый раздел сохраняется отдельно.</p>
          </nav>
          <div className="settings-panels" ref={panelRoot}>
            <section data-section="profile" hidden={active !== 'profile'} aria-label="Профиль">
              <ProfileForm />
              <aside className="settings-privacy">
                <SectionIcon path="M12 11v6m0-10v.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0" />
                <div>
                  <h3>Что увидят другие</h3>
                  <p>
                    Имя пользователя и отображаемое имя видны в профиле автора. Email не
                    отображается в публичном профиле.
                  </p>
                </div>
              </aside>
            </section>
            <section data-section="password" hidden={active !== 'password'} aria-label="Пароль">
              <PasswordForm />
            </section>
            <section data-section="study" hidden={active !== 'study'} aria-label="Обучение">
              <StudySettingsForm />
            </section>
            <section data-section="data" hidden={active !== 'data'} aria-label="Ваши данные">
              <AccountExport />
            </section>
            <section data-section="api" hidden={active !== 'api'} aria-label="API и ИИ-агенты">
              <ApiTokens />
            </section>
            <section data-section="bots" hidden={active !== 'bots'} aria-label="Боты Telegram и VK">
              <BotConnections />
            </section>
            <section
              data-section="sessions"
              hidden={active !== 'sessions'}
              aria-label="Активные устройства"
            >
              <Sessions />
            </section>
          </div>
        </div>
      </div>
    </SettingsDirtyContext.Provider>
  );
}

type AccountExportJob = components['schemas']['AccountExportPublic'];

function AccountExport() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<SettingsNotice>(null);
  const [starting, setStarting] = useState(false);
  const query = useQuery({
    queryKey: ['account-export'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/users/me/export/latest');
      if (error) throw new Error(settingsError(error));
      return data;
    },
    refetchInterval: (state) => {
      const job = state.state.data;
      return job?.status === 'queued' || job?.status === 'processing' ? 2_000 : false;
    },
  });
  const job = query.data as AccountExportJob | null | undefined;
  const active = job?.status === 'queued' || job?.status === 'processing';

  async function start() {
    if (starting) return;
    setStarting(true);
    setNotice(null);
    try {
      const { data, error } = await api.POST('/api/v1/users/me/export');
      if (error) throw error;
      queryClient.setQueryData(['account-export'], data);
      setNotice({
        kind: 'success',
        text: 'Архив поставлен в очередь. Ссылку также отправим на ваш email.',
      });
    } catch (error) {
      setNotice({ kind: 'error', text: settingsError(error) });
    } finally {
      setStarting(false);
    }
  }

  return (
    <Card className="settings-card">
      <h2 className="text-xl font-semibold">Ваши данные</h2>
      <p className="text-fg-muted mt-1 text-sm leading-relaxed">
        Скачайте ZIP со всеми наборами, историей обучения, настройками и медиафайлами. Пароли и
        токены в архив не входят.
      </p>

      {active && job && (
        <div className="bg-surface-muted mt-5 rounded-xl p-4" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">
              {job.status === 'queued' ? 'Ожидает обработки' : 'Собираем архив'}
            </span>
            <span className="text-fg-muted">{job.progress}%</span>
          </div>
          <div
            className="bg-border mt-3 h-2 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={job.progress}
          >
            <div className="bg-primary h-full rounded-full" style={{ width: `${job.progress}%` }} />
          </div>
        </div>
      )}

      {job?.status === 'completed' && job.download_url && (
        <div className="bg-success-subtle mt-5 rounded-xl p-4">
          <p className="font-medium">Архив готов</p>
          <p className="text-fg-muted mt-1 text-sm">
            {job.size_bytes ? formatBytes(job.size_bytes) : 'ZIP'} · ссылка действует до{' '}
            {job.expires_at ? new Date(job.expires_at).toLocaleString('ru-RU') : 'истечения срока'}
          </p>
          <a
            href={job.download_url}
            className="bg-primary text-primary-fg mt-4 inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-medium"
          >
            Скачать ZIP
          </a>
        </div>
      )}

      {job?.status === 'completed' && !job.download_url && (
        <p className="bg-warning-subtle mt-5 rounded-xl p-4 text-sm" role="status">
          Срок ссылки истёк. Запросите новый архив.
        </p>
      )}
      {job?.status === 'failed' && (
        <p className="bg-danger-subtle text-danger mt-5 rounded-xl p-4 text-sm" role="alert">
          {job.error_message || 'Не удалось подготовить архив. Попробуйте ещё раз.'}
        </p>
      )}

      <SettingsFeedback notice={notice?.kind === 'success' && !active ? null : notice} />
      {query.isPending && (
        <p role="status" className="mt-5">
          Проверяем архив…
        </p>
      )}
      {query.isError && (
        <div className="mt-5">
          <SettingsFeedback
            notice={{
              kind: 'error',
              text: 'Не удалось проверить архив. Попробуйте загрузить его состояние ещё раз.',
            }}
          />
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Повторить
          </Button>
        </div>
      )}
      <Button
        variant={job?.status === 'completed' ? 'secondary' : 'primary'}
        className="mt-5"
        loading={starting}
        disabled={active || starting || query.isPending || query.isError}
        onClick={() => void start()}
      >
        {active ? 'Архив готовится' : job ? 'Создать новый архив' : 'Запросить архив'}
      </Button>
    </Card>
  );
}

function ProfileForm() {
  const user = useAuthStore((state) => state.user);
  const authenticate = useAuthStore((state) => state.authenticate);
  const [saved, setSaved] = useState(() => ({
    username: user?.username ?? '',
    display_name: user?.display_name ?? '',
    locale: user?.locale ?? 'ru',
    timezone: user?.timezone ?? 'Europe/Moscow',
  }));
  const [draft, setDraft] = useState(saved);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof draft, string>>>({});
  const [notice, setNotice] = useState<SettingsNotice>(null);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  useSettingsDirty('profile', dirty);
  const change = (key: keyof typeof draft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setNotice(null);
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setNotice(null);
    setFieldErrors({});
    try {
      const { data: updated, error } = await api.PATCH('/api/v1/auth/me', {
        body: { ...draft, display_name: draft.display_name || null },
      });
      if (error || !updated) throw error;
      authenticate(updated);
      const value = {
        username: updated.username,
        display_name: updated.display_name ?? '',
        locale: updated.locale,
        timezone: updated.timezone,
      };
      setSaved(value);
      setDraft(value);
      setNotice({ kind: 'success', text: 'Профиль сохранён' });
    } catch (error) {
      const fields: Partial<Record<keyof typeof draft, string>> = {};
      if (typeof error === 'object' && error !== null && 'code' in error) {
        if (error.code === 'CONFLICT') fields.username = 'Это имя пользователя занято';
        if (error.code === 'VALIDATION_ERROR' && 'details' in error) {
          const details = error.details as { errors?: { loc?: unknown[] }[] } | undefined;
          const messages = {
            username: 'Используйте 3–32 символа: латиницу, цифры, _ и -.',
            display_name: 'Отображаемое имя должно быть не длиннее 64 символов.',
            locale: 'Укажите код языка длиной от 2 до 5 символов.',
            timezone: 'Укажите часовой пояс длиной от 1 до 40 символов.',
          };
          for (const issue of details?.errors ?? []) {
            const field = issue.loc?.[1];
            if (typeof field === 'string' && Object.hasOwn(messages, field)) {
              fields[field as keyof typeof draft] = messages[field as keyof typeof draft];
            }
          }
        }
      }
      setFieldErrors(fields);
      if (!Object.keys(fields).length) setNotice({ kind: 'error', text: settingsError(error) });
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card className="settings-card">
      <h2>Профиль</h2>
      <p className="settings-description">Основные данные вашего аккаунта.</p>
      <form className="settings-form" onSubmit={(event) => void submit(event)}>
        <fieldset disabled={saving} className="settings-fields">
          <Input
            label="Email"
            value={user?.email ?? ''}
            readOnly
            hint="Адрес для входа. Изменить его здесь нельзя."
          />
          <div className="settings-field-pair">
            <Input
              label="Имя пользователя"
              name="username"
              error={fieldErrors.username}
              value={draft.username}
              onChange={(event) => change('username', event.target.value)}
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9_-]+"
              required
              hint="3–32 символа: латиница, цифры, _ и -."
            />
            <Input
              label="Отображаемое имя"
              name="display_name"
              error={fieldErrors.display_name}
              value={draft.display_name}
              onChange={(event) => change('display_name', event.target.value)}
              maxLength={64}
              hint="Как вас видят другие пользователи."
            />
          </div>
          <div className="settings-field-pair">
            <Input
              label="Язык"
              name="locale"
              error={fieldErrors.locale}
              value={draft.locale}
              onChange={(event) => change('locale', event.target.value)}
              required
              hint="Код языка, например ru."
            />
            <Input
              label="Часовой пояс"
              name="timezone"
              error={fieldErrors.timezone}
              value={draft.timezone}
              onChange={(event) => change('timezone', event.target.value)}
              required
              hint="Например, Europe/Moscow или Asia/Vladivostok."
            />
          </div>
        </fieldset>
        <SettingsFeedback notice={notice} />
        <SettingsSaveBar
          dirty={dirty}
          saving={saving}
          label="Сохранить профиль"
          onCancel={() => {
            setDraft(saved);
            setFieldErrors({});
            setNotice(null);
          }}
        />
      </form>
    </Card>
  );
}

function PasswordForm() {
  const cache = useQueryClient();
  const [draft, setDraft] = useState({
    current_password: '',
    new_password: '',
    repeat_password: '',
  });
  const [notice, setNotice] = useState<SettingsNotice>(null);
  const [mismatch, setMismatch] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = Object.values(draft).some(Boolean);
  useSettingsDirty('password', dirty);
  function reset() {
    setDraft({ current_password: '', new_password: '', repeat_password: '' });
    setMismatch(false);
    setNotice(null);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setMismatch(draft.new_password !== draft.repeat_password);
    if (draft.new_password !== draft.repeat_password) {
      event.currentTarget.querySelector<HTMLInputElement>('[name="repeat_password"]')?.focus();
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const { error } = await api.POST('/api/v1/auth/change-password', {
        body: { current_password: draft.current_password, new_password: draft.new_password },
      });
      if (error) throw error;
      reset();
      setNotice({
        kind: 'success',
        text: 'Пароль изменён. Остальные устройства вышли из аккаунта.',
      });
      await cache.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    } catch (error) {
      setNotice({ kind: 'error', text: settingsError(error) });
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card className="settings-card">
      <h2>Пароль</h2>
      <p className="settings-description">
        После смены пароля остальные устройства выйдут из аккаунта.
      </p>
      <form className="settings-form" onSubmit={(event) => void submit(event)}>
        <fieldset className="settings-fields" disabled={saving}>
          <Input
            label="Текущий пароль"
            name="current_password"
            type="password"
            autoComplete="current-password"
            required
            value={draft.current_password}
            onChange={(event) => {
              setDraft({ ...draft, current_password: event.target.value });
              setNotice(null);
            }}
          />
          <Input
            label="Новый пароль"
            name="new_password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            hint="Не менее 8 символов."
            value={draft.new_password}
            onChange={(event) => {
              setDraft({ ...draft, new_password: event.target.value });
              setMismatch(false);
              setNotice(null);
            }}
          />
          <Input
            label="Повторите новый пароль"
            name="repeat_password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={draft.repeat_password}
            error={mismatch ? 'Новые пароли не совпадают' : undefined}
            onChange={(event) => {
              setDraft({ ...draft, repeat_password: event.target.value });
              setMismatch(false);
              setNotice(null);
            }}
          />
        </fieldset>
        <SettingsFeedback notice={notice} />
        <SettingsSaveBar dirty={dirty} saving={saving} label="Изменить пароль" onCancel={reset} />
      </form>
    </Card>
  );
}

function Sessions() {
  const cache = useQueryClient();
  const becomeGuest = useAuthStore((state) => state.becomeGuest);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<SettingsNotice>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const sessions = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/auth/sessions');
      if (error) throw new Error(settingsError(error));
      return data;
    },
  });
  async function revoke(session: Session) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await api.DELETE('/api/v1/auth/sessions/{session_id}', {
        params: { path: { session_id: session.id } },
      });
      if (error) throw error;
      if (session.current) {
        clearAccessToken();
        becomeGuest();
        return;
      }
      setConfirmId(null);
      await cache.invalidateQueries({ queryKey: ['auth', 'sessions'] });
      setNotice({
        kind: 'success',
        text: 'Сеанс завершён. На этом устройстве потребуется снова войти.',
      });
      heading.current?.focus();
    } catch (error) {
      setNotice({ kind: 'error', text: settingsError(error) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="settings-card">
      <h2 ref={heading} tabIndex={-1}>
        Активные устройства
      </h2>
      <p className="settings-description">Сессии, в которых сейчас открыт ваш аккаунт.</p>
      <SettingsFeedback notice={notice} />
      {sessions.isPending && (
        <p role="status" className="mt-5">
          Загружаем устройства…
        </p>
      )}
      {sessions.isError && (
        <div className="mt-5">
          <SettingsFeedback notice={{ kind: 'error', text: sessions.error.message }} />
          <Button variant="secondary" onClick={() => void sessions.refetch()}>
            Повторить
          </Button>
        </div>
      )}
      {sessions.data?.length === 0 && <p className="text-fg-muted mt-5">Активных устройств нет.</p>}
      <ul className="settings-session-list">
        {sessions.data?.map((session) => (
          <li key={session.id}>
            <div className="settings-session-row">
              <div>
                <h3>
                  {deviceName(session.user_agent)}{' '}
                  {session.current && <span className="settings-current">Это устройство</span>}
                </h3>
                <p>
                  {session.ip || 'IP не определён'} · до{' '}
                  {new Date(session.expires_at).toLocaleDateString('ru-RU')}
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={(event) => {
                  trigger.current = event.currentTarget;
                  setConfirmId(session.id);
                  setNotice(null);
                }}
              >
                {session.current ? 'Выйти' : 'Завершить'}
              </Button>
            </div>
            {confirmId === session.id && (
              <div
                className="settings-confirm"
                role="group"
                aria-label="Подтверждение завершения сеанса"
              >
                <p>
                  {session.current
                    ? 'Выйти из аккаунта на этом устройстве?'
                    : `Завершить сеанс ${deviceName(session.user_agent)}?`}{' '}
                  Для продолжения потребуется снова войти.
                </p>
                <div className="settings-save-actions">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setConfirmId(null);
                      trigger.current?.focus();
                    }}
                  >
                    Отмена
                  </Button>
                  <Button variant="danger" loading={busy} onClick={() => void revoke(session)}>
                    Да, завершить
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function deviceName(agent: string | null) {
  if (!agent) return 'Неизвестное устройство';
  if (agent.includes('Firefox')) return 'Firefox';
  if (agent.includes('Edg/')) return 'Microsoft Edge';
  if (agent.includes('Chrome')) return 'Google Chrome';
  if (agent.includes('Safari')) return 'Safari';
  return agent.slice(0, 60);
}
