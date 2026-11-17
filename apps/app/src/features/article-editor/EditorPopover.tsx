import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function EditorPopover({
  anchor,
  label,
  close,
  children,
}: {
  anchor: HTMLElement;
  label: string;
  close: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const dismiss = useRef(close);
  dismiss.current = close;
  useLayoutEffect(() => {
    const el = panel.current!;
    function position() {
      const r = anchor.getBoundingClientRect(),
        h = window.innerHeight,
        w = window.innerWidth;
      const below = h - r.bottom - 10,
        above = r.top - 10,
        up = below < el.scrollHeight + 2 && above > below;
      el.style.maxHeight = Math.max(70, up ? above : below) + 'px';
      el.style.top = (up ? Math.max(5, r.top - el.offsetHeight - 4) : r.bottom + 4) + 'px';
      el.style.left = Math.max(6, Math.min(r.left, w - el.offsetWidth - 6)) + 'px';
    }
    function outside(e: Event) {
      if (e.target instanceof Node && !el.contains(e.target) && !anchor.contains(e.target))
        dismiss.current();
    }
    position();
    const controls = el.querySelectorAll<HTMLElement>(
      'input:not([type=checkbox]),textarea,select,button:not(:disabled),a[href]',
    );
    Array.from(controls)
      .find((control) => control.getClientRects().length)
      ?.focus({ preventScroll: true });
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    return () => {
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
    };
  }, [anchor, label]);
  return createPortal(
    <div
      ref={panel}
      className="ae-pop"
      role="dialog"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
          anchor.focus({ preventScroll: true });
        }
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
