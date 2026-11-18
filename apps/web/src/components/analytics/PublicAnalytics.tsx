'use client';

import { useEffect, useState } from 'react';
import styles from './PublicAnalytics.module.css';

type Choice = 'yes' | 'no' | 'ask';
const storageKey = 'zapominalnya.analytics.v1';
const counterId = 114197965;
const publicOrigin = 'https://zapominalnya.ru';

interface Counter {
  hit(url: string, options: { referer: string }): void;
  destruct(): void;
}
type Constructor = new (options: Record<string, unknown>) => Counter;
declare global {
  interface Window {
    Ya?: { Metrika2?: Constructor };
  }
}

let loading: Promise<Constructor> | undefined;
let lastPublicUrl: string | undefined;

function loadCounter() {
  if (window.Ya?.Metrika2) return Promise.resolve(window.Ya.Metrika2);
  loading ??= new Promise<Constructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.referrerPolicy = 'origin';
    script.src = 'https://mc.yandex.ru/metrika/tag.js?id=' + counterId;
    script.onload = () => {
      if (window.Ya?.Metrika2) resolve(window.Ya.Metrika2);
      else reject(new Error('Метрика недоступна'));
    };
    script.onerror = () => reject(new Error('Счётчик не загружен'));
    document.head.append(script);
  }).catch((err: unknown) => {
    loading = undefined;
    throw err;
  });
  return loading;
}

function readChoice(): Choice {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'yes' || saved === 'no') return saved;
  } catch {
    // Если хранилище недоступно, решение действует до ухода со страницы.
  }
  return 'ask';
}

function sourceOrigin() {
  try {
    const ref = new URL(document.referrer);
    return /^https?:$/.test(ref.protocol) ? ref.origin : '';
  } catch {
    return '';
  }
}

export function PublicAnalytics({
  path,
  settings = false,
  english = false,
}: {
  path: string;
  settings?: boolean;
  english?: boolean;
}) {
  const [choice, setChoice] = useState<Choice | null>(null);

  useEffect(() => {
    const localPreview =
      process.env.NEXT_PUBLIC_ANALYTICS_PREVIEW === '1' &&
      ['localhost', '127.0.0.1'].includes(location.hostname);
    if (location.origin !== publicOrigin && !localPreview) return;
    const sync = () => setChoice(readChoice());
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) sync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', sync);
    };
  }, []);

  useEffect(() => {
    if (choice !== 'yes' || location.origin !== publicOrigin) return;
    const url = publicOrigin + path;
    let active = true;
    let counter: Counter | undefined;
    void loadCounter()
      .then((Metrika) => {
        if (!active) return;
        const referer = lastPublicUrl ?? sourceOrigin();
        counter = new Metrika({
          id: counterId,
          defer: true,
          webvisor: false,
          clickmap: false,
          trackLinks: false,
          accurateTrackBounce: false,
          disableYtm: true,
          sendTitle: false,
          triggerEvent: false,
          url,
          referrer: referer,
        });
        counter.hit(url, { referer });
        lastPublicUrl = url;
      })
      .catch(() => {
        // Блокировщик аналитики не должен мешать чтению страницы.
      });
    return () => {
      active = false;
      counter?.destruct();
    };
  }, [choice, path]);

  function choose(value: 'yes' | 'no') {
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      // Выбранный вариант всё равно применяется в текущем окне.
    }
    if (value === 'no') lastPublicUrl = undefined;
    setChoice(value);
  }

  if (!choice || (choice !== 'ask' && !settings)) return null;
  return (
    <aside
      aria-label={english ? 'Analytics preferences' : 'Настройки аналитики'}
      className={
        settings ? `${styles.notice} ${styles.settings}` : `${styles.notice} ${styles.floating}`
      }
    >
      <h2 className={styles.title}>
        {settings
          ? english
            ? 'Analytics preferences'
            : 'Настройки аналитики'
          : english
            ? 'Cookies for analytics'
            : 'Cookie для аналитики'}
      </h2>
      <p className={styles.text}>
        {choice === 'ask'
          ? english
            ? 'May we use cookies to see which public pages people visit and how they find them?'
            : 'Разрешить cookie, чтобы мы видели, какие публичные страницы читают и как их находят?'
          : choice === 'yes'
            ? english
              ? 'Analytics is on.'
              : 'Аналитика включена.'
            : english
              ? 'Analytics is off.'
              : 'Аналитика выключена.'}
      </p>
      {!settings && (
        <a className={styles.policy} href={english ? '/en/privacy' : '/privacy'}>
          {english ? 'Privacy policy' : 'Политика конфиденциальности'}
        </a>
      )}
      <div className={styles.actions}>
        {choice !== 'no' && (
          <button type="button" className={styles.decline} onClick={() => choose('no')}>
            {english ? 'Decline' : 'Отказаться'}
          </button>
        )}
        {choice !== 'yes' && (
          <button type="button" className={styles.allow} onClick={() => choose('yes')}>
            {english ? 'Allow' : 'Разрешить'}
          </button>
        )}
      </div>
    </aside>
  );
}
