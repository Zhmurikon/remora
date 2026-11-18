'use client';

import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';

const MIN_SHARE = 30;
const MAX_SHARE = 70;
const clampShare = (value: number) => Math.min(MAX_SHARE, Math.max(MIN_SHARE, Math.round(value)));

export function PublicCardTable({ children }: { children: ReactNode }) {
  const [termShare, setTermShare] = useState(50);
  const columns = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; share: number; width: number } | null>(null);
  const helpId = useId();

  function startResize(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const cells = columns.current?.children;
    if (!cells) return;
    const width = cells[1]!.getBoundingClientRect().width + cells[2]!.getBoundingClientRect().width;
    if (!width) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, share: termShare, width };
  }

  return (
    <div
      className="ps-table"
      style={
        {
          '--ps-term-width': `${termShare}fr`,
          '--ps-definition-width': `${100 - termShare}fr`,
        } as CSSProperties
      }
    >
      <div className="ps-table-tools">
        <p id={helpId}>
          Потяните разделитель или используйте стрелки ← →. Каждая колонка — не меньше 30%.
        </p>
        <button type="button" onClick={() => setTermShare(50)} disabled={termShare === 50}>
          Поровну
        </button>
      </div>
      <div ref={columns} className="ps-columns">
        <span aria-hidden="true">№</span>
        <span>Термин</span>
        <div className="ps-definition-heading">
          <div
            className="ps-column-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Ширина колонок карточек"
            aria-describedby={helpId}
            aria-valuemin={MIN_SHARE}
            aria-valuemax={MAX_SHARE}
            aria-valuenow={termShare}
            aria-valuetext={`Термин ${termShare}%, определение ${100 - termShare}%`}
            tabIndex={0}
            title="Изменить ширину колонок. Двойной щелчок — поровну"
            onPointerDown={startResize}
            onPointerMove={(event) => {
              if (!drag.current) return;
              setTermShare(
                clampShare(
                  drag.current.share +
                    ((event.clientX - drag.current.x) / drag.current.width) * 100,
                ),
              );
            }}
            onPointerUp={(event) => {
              drag.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onDoubleClick={() => setTermShare(50)}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 10 : 2;
              const next =
                event.key === 'ArrowLeft'
                  ? termShare - step
                  : event.key === 'ArrowRight'
                    ? termShare + step
                    : event.key === 'Home'
                      ? MIN_SHARE
                      : event.key === 'End'
                        ? MAX_SHARE
                        : event.key === 'Enter'
                          ? 50
                          : null;
              if (next === null) return;
              event.preventDefault();
              setTermShare(clampShare(next));
            }}
          >
            <span aria-hidden="true" />
          </div>
          <span>Определение</span>
        </div>
      </div>
      {children}
    </div>
  );
}
