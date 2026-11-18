import { useEffect, useRef, useState } from 'react';
import { SettingsDialog } from './SettingsDialog';
import { setSettingsPopGuard } from './settings-navigation';

export function SettingsLeaveGuard({ dirty }: { dirty: boolean }) {
  const [pending, setPending] = useState<{ leave: () => void } | null>(null);
  const approved = useRef(false);
  useEffect(() => {
    if (!dirty) return;
    const path = window.location.pathname;
    const index = window.history.state?.idx as number | undefined;
    let restoring: { leave: () => void } | null = null;
    const warn = (event: BeforeUnloadEvent) => {
      if (approved.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const leave = (event: MouseEvent) => {
      if (
        approved.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      )
        return;
      const anchor = event.target.closest<HTMLAnchorElement>(
        'a[href]:not([target="_blank"]):not([download])',
      );
      const button = event.target.closest<HTMLButtonElement>('button');
      const target = anchor ?? (button?.textContent?.trim() === 'Выйти' ? button : null);
      if (!target) return;
      if (anchor) {
        const url = new URL(anchor.href);
        if (url.origin === window.location.origin && url.pathname === path) return;
      }
      event.preventDefault();
      event.stopPropagation();
      setPending({
        leave: () => {
          approved.current = true;
          target.click();
          // Не оставляем обход защиты после неудавшегося выхода из аккаунта.
          window.setTimeout(() => {
            approved.current = false;
          }, 0);
        },
      });
    };
    const back = (event: PopStateEvent) => {
      if (approved.current) {
        approved.current = false;
        return;
      }
      if (restoring) {
        event.stopImmediatePropagation();
        setPending(restoring);
        restoring = null;
        return;
      }
      if (window.location.pathname === path) return;
      const next = event.state?.idx as number | undefined;
      if (index === undefined || next === undefined || next === index) return;
      event.stopImmediatePropagation();
      // Сначала возвращаем URL, сохраняя форму смонтированной; переход повторим
      // только после явного решения в асинхронном диалоге.
      restoring = {
        leave: () => {
          approved.current = true;
          window.history.go(next - index);
        },
      };
      window.history.go(index - next);
    };
    setSettingsPopGuard(back);
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', leave, true);
    return () => {
      setSettingsPopGuard(null);
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', leave, true);
    };
  }, [dirty]);
  if (!dirty || !pending) return null;
  return (
    <SettingsDialog
      title="Уйти без сохранения?"
      confirmLabel="Уйти без сохранения"
      cancelLabel="Продолжить редактирование"
      onCancel={() => setPending(null)}
      onConfirm={() => {
        setPending(null);
        pending.leave();
      }}
    >
      <p>На этой странице остались несохранённые изменения. Если уйти, они будут потеряны.</p>
      <p>Можно вернуться к редактированию и сохранить изменения.</p>
    </SettingsDialog>
  );
}
