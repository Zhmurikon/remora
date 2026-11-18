// Подписываемся до монтирования BrowserRouter: иначе его обработчик может
// размонтировать форму до решения пользователя о возврате по истории.
let guard: ((event: PopStateEvent) => void) | null = null;
const onPopState = (event: PopStateEvent) => guard?.(event);
if (typeof window !== 'undefined') window.addEventListener('popstate', onPopState, true);
if (import.meta.hot)
  import.meta.hot.dispose(() => window.removeEventListener('popstate', onPopState, true));

export function setSettingsPopGuard(next: typeof guard) {
  guard = next;
}
