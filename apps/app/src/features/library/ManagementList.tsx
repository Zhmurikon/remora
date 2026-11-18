import { pluralWithCount } from '@remora/core';
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type MutableRefObject,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { DropIndicator, moveCustomItem, moveCustomItemTo, useDragOrder } from './ListSort';
import './management.css';

export const cardCount = (count: number) =>
  pluralWithCount(count, ['карточка', 'карточки', 'карточек']);
export type Origin = 'all' | 'owned' | 'saved';

export function ManageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="manage-header">
      <Link className="manage-back" to="/materials">
        ← Материалы
      </Link>
      <div>
        <h1>{title}</h1>
        {children && <nav aria-label="Действия страницы">{children}</nav>}
      </div>
    </header>
  );
}

export function OriginFilter({
  value,
  onChange,
}: {
  value: Origin;
  onChange: (value: Origin) => void;
}) {
  return (
    <div className="manage-filter" role="group" aria-label="Принадлежность материала">
      {(
        [
          ['all', 'Все'],
          ['owned', 'Свои'],
          ['saved', 'Сохранённые'],
        ] as const
      ).map(([id, label]) => (
        <button key={id} aria-pressed={value === id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function ManageGroup({
  title,
  count,
  initialOpen = true,
  children,
  folder,
  actions,
  dropProps,
  motion = false,
}: {
  title: string;
  count: number;
  initialOpen?: boolean;
  children: ReactNode;
  folder?: string;
  actions?: ReactNode;
  dropProps?: HTMLAttributes<HTMLButtonElement>;
  motion?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [dropActive, setDropActive] = useState(false);
  const id = useId();
  const canAcceptDrop = (types: readonly string[]) => types.includes('text/remora-set-id');
  return (
    <section
      className={motion ? 'manage-group manage-group-motion' : 'manage-group'}
      data-manage-folder={folder}
    >
      <div className="manage-band" data-open={open} data-drop-active={dropActive || undefined}>
        <h2>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen(!open)}
            data-folder={folder}
            {...dropProps}
            onDragEnter={(event) => {
              dropProps?.onDragEnter?.(event);
              if (canAcceptDrop(event.dataTransfer.types)) setDropActive(true);
            }}
            onDragOver={(event) => {
              dropProps?.onDragOver?.(event);
              if (event.defaultPrevented) setDropActive(true);
            }}
            onDragLeave={(event) => {
              dropProps?.onDragLeave?.(event);
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropActive(false);
            }}
            onDrop={(event) => {
              setDropActive(false);
              dropProps?.onDrop?.(event);
            }}
          >
            <svg className="manage-chevron" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m6 3 5 5-5 5" />
            </svg>
            {folder !== undefined && (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 6h6l2 2h10v11H3z" />
              </svg>
            )}
            <span>{title}</span>
            <small>{count}</small>
          </button>
        </h2>
        {open && actions}
      </div>
      {motion ? (
        <div
          id={id}
          className="manage-group-body"
          data-open={open}
          aria-hidden={!open}
          inert={!open}
        >
          <div className="manage-group-clip">{children}</div>
        </div>
      ) : (
        <div id={id} hidden={!open}>
          {children}
        </div>
      )}
    </section>
  );
}

export function OrderedRows<T extends { id: string; title: string }>({
  items,
  fullOrder,
  onOrder,
  custom,
  children,
  onMoveFolder,
  motion = false,
  motionScope,
}: {
  items: T[];
  fullOrder: string[];
  onOrder: (order: string[]) => void;
  custom: boolean;
  children: (item: T) => ReactNode;
  onMoveFolder?: (id: string, folder: string) => void;
  motion?: boolean;
  motionScope?: MutableRefObject<Map<string, DOMRect>>;
}) {
  const ids = items.map((item) => item.id);
  const move = (id: string, direction: -1 | 1) =>
    onOrder(moveCustomItem(fullOrder, ids, id, direction));
  const drop = (id: string, target: string, after: boolean) =>
    onOrder(moveCustomItemTo(fullOrder, id, target, after));
  const drag = useDragOrder(drop, ids, move);
  const rows = useRef<HTMLDivElement>(null);
  const localPositions = useRef(new Map<string, DOMRect>());
  const touch = useRef<{ id: string; x: number; y: number; active: boolean } | null>(null);
  const [touchDraggingId, setTouchDraggingId] = useState<string | null>(null);
  const [marker, setMarker] = useState<{ id: string; after: boolean } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  useLayoutEffect(() => {
    const elements = [
      ...(rows.current?.querySelectorAll<HTMLElement>(':scope > [data-row-id]') ?? []),
    ];
    const positions = motionScope?.current ?? localPositions.current;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    for (const element of elements)
      element.getAnimations?.().forEach((animation) => animation.cancel());
    const next = new Map(
      elements.map((element) => [element.dataset.rowId ?? '', element.getBoundingClientRect()]),
    );

    if (motion && !reduce) {
      for (const element of elements) {
        const itemId = element.dataset.rowId;
        if (!itemId || !element.animate) continue;
        const before = positions.get(itemId);
        const after = next.get(itemId);
        if (!before || !after) continue;
        const x = before.left - after.left;
        const y = before.top - after.top;
        if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) continue;
        element.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'none' }], {
          duration: 180,
          easing: 'cubic-bezier(0.2, 0.75, 0.3, 1)',
        });
      }
    }
    for (const [itemId, rect] of next) positions.set(itemId, rect);
  });
  function targetAt(event: PointerEvent) {
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const row = hit?.closest<HTMLElement>('[data-row-id]');
    if (
      row?.dataset.rowId &&
      row.dataset.rowId !== touch.current?.id &&
      ids.includes(row.dataset.rowId)
    ) {
      const rect = row.getBoundingClientRect();
      return { id: row.dataset.rowId, after: event.clientY > rect.top + rect.height / 2 };
    }
    return null;
  }
  const resetTouch = () => {
    touch.current = null;
    setTouchDraggingId(null);
    setMarker(null);
  };
  return (
    <>
      <div ref={rows} className="manage-rows">
        {items.map((item, index) => {
          const movable = Boolean(onMoveFolder);
          const attrs = custom ? drag.getDragProps(item.id, item.title) : {};
          const edge =
            marker?.id === item.id
              ? marker.after
                ? 'bottom'
                : 'top'
              : drag.dropTarget?.id === item.id
                ? drag.dropTarget.edge
                : null;
          return (
            <div
              key={item.id}
              {...attrs}
              className="manage-row"
              data-row-id={item.id}
              data-dragged={drag.draggedId === item.id || touchDraggingId === item.id || undefined}
              draggable={custom || movable}
              onDragStart={(event) => {
                attrs.onDragStart?.(event);
                if (movable) event.dataTransfer.setData('text/remora-set-id', item.id);
              }}
            >
              {edge && <DropIndicator edge={edge} />}
              {(custom || movable) && (
                <span
                  className="manage-grip"
                  aria-hidden="true"
                  title="Перетащить"
                  onPointerDown={(event) => {
                    if (event.pointerType === 'mouse' || !event.isPrimary) return;
                    touch.current = {
                      id: item.id,
                      x: event.clientX,
                      y: event.clientY,
                      active: false,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    const current = touch.current;
                    if (!current || current.id !== item.id) return;
                    if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 5)
                      current.active = true;
                    if (current.active) {
                      setTouchDraggingId(item.id);
                      if (event.clientY > window.innerHeight - 55) window.scrollBy(0, 12);
                      if (event.clientY < 65) window.scrollBy(0, -12);
                      setMarker(custom ? targetAt(event) : null);
                    }
                  }}
                  onPointerUp={(event) => {
                    if (touch.current?.active) {
                      const target = targetAt(event);
                      const folder = document
                        .elementFromPoint(event.clientX, event.clientY)
                        ?.closest<HTMLElement>('[data-folder]')?.dataset.folder;
                      if (movable && folder !== undefined) onMoveFolder?.(item.id, folder);
                      else if (custom && target) drop(item.id, target.id, target.after);
                    }
                    resetTouch();
                  }}
                  onPointerCancel={resetTouch}
                  onLostPointerCapture={resetTouch}
                >
                  ⠿
                </span>
              )}
              <div className="manage-item">{children(item)}</div>
              {custom && (
                <div className="manage-arrows">
                  {([-1, 1] as const).map((direction) => {
                    const disabled = ids[index + direction] === undefined;
                    const label = direction === -1 ? 'Выше' : 'Ниже';
                    return (
                      <button
                        key={direction}
                        type="button"
                        title={label}
                        aria-label={label + ' — ' + item.title}
                        aria-disabled={disabled}
                        onClick={(event) => {
                          if (!disabled) {
                            if (!ids[index + direction * 2]) {
                              const other =
                                direction < 0
                                  ? event.currentTarget.nextElementSibling
                                  : event.currentTarget.previousElementSibling;
                              if (other instanceof HTMLButtonElement)
                                other.focus({ preventScroll: true });
                            }
                            move(item.id, direction);
                            setAnnouncement(
                              item.title + ' — ' + (index + direction + 1) + ' из ' + items.length,
                            );
                          }
                        }}
                      >
                        {direction === -1 ? '↑' : '↓'}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <span className="sr-only" role="status">
        {announcement}
      </span>
    </>
  );
}
