import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';

interface IndexCard {
  key: string;
  term: string;
}
interface DropPosition {
  key: string;
  after: boolean;
}

export function EditorCardIndex({
  cards,
  selected,
  onSelect,
  onMove,
}: {
  cards: IndexCard[];
  selected: IndexCard;
  onSelect: (key: string) => void;
  onMove: (source: string, target: string, after: boolean) => void;
}) {
  const listId = useId();
  const hintId = useId();
  const list = useRef<HTMLUListElement>(null);
  const gesture = useRef<{ id: number; key: string; x: number; y: number; active: boolean } | null>(
    null,
  );
  const scrollFrame = useRef<number>(0);
  const skipClick = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [marker, setMarker] = useState<DropPosition | null>(null);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), []);

  function positionAt(x: number, y: number): DropPosition | null {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-card-key]');
    if (!row || !list.current?.contains(row) || row.dataset.cardKey === gesture.current?.key)
      return null;
    const rect = row.getBoundingClientRect();
    return { key: row.dataset.cardKey!, after: y >= rect.top + rect.height / 2 };
  }

  function track(x: number, y: number) {
    const node = list.current;
    if (!node || !gesture.current?.active) return;
    setMarker(positionAt(x, y));
    const rect = node.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
    const direction = y < rect.top + 30 ? -1 : y > rect.bottom - 30 ? 1 : 0;
    const before = node.scrollTop;
    node.scrollTop += direction * 8;
    if (node.scrollTop !== before) scrollFrame.current = requestAnimationFrame(() => track(x, y));
  }
  function finish() {
    gesture.current = null;
    cancelAnimationFrame(scrollFrame.current);
    setMarker(null);
  }
  function begin(event: PointerEvent<HTMLButtonElement>, key: string) {
    skipClick.current = false;
    if (!event.isPrimary || event.button !== 0 || cards.length < 2) return;
    if (event.pointerType !== 'mouse' && !(event.target as Element).closest('.editor-grip')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      id: event.pointerId,
      key,
      x: event.clientX,
      y: event.clientY,
      active: false,
    };
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const drag = gesture.current;
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
    drag.active = true;
    skipClick.current = true;
    cancelAnimationFrame(scrollFrame.current);
    track(event.clientX, event.clientY);
  }
  function end(event: PointerEvent<HTMLButtonElement>) {
    const drag = gesture.current;
    if (!drag || drag.id !== event.pointerId) return;
    const target = drag.active ? positionAt(event.clientX, event.clientY) : null;
    if (target) onMove(drag.key, target.key, target.after);
    finish();
  }
  return (
    <>
      <button
        type="button"
        className="editor-jump"
        aria-label="Выбрать карточку"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded(!expanded)}
      >
        <span>{selected.term || 'Без термина'}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      <span className="sr-only" id={hintId}>
        Чтобы переместить карточку, удерживайте Alt и нажимайте стрелки вверх или вниз.
      </span>
      <ul ref={list} id={listId} className="editor-terms" data-expanded={expanded}>
        {cards.map((card, i) => {
          const name = card.term || 'Без термина';
          return (
            <li
              key={card.key}
              data-card-key={card.key}
              data-drop={marker?.key === card.key ? (marker.after ? 'after' : 'before') : undefined}
            >
              <button
                type="button"
                aria-current={card.key === selected.key ? 'true' : undefined}
                aria-describedby={hintId}
                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                onPointerDown={(event) => begin(event, card.key)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={finish}
                onLostPointerCapture={finish}
                onClick={(event) => {
                  if (event.detail && skipClick.current) return;
                  setExpanded(false);
                  onSelect(card.key);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && gesture.current) {
                    finish();
                    return;
                  }
                  if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown'))
                    return;
                  event.preventDefault();
                  const down = event.key === 'ArrowDown';
                  const target = i + (down ? 1 : -1);
                  const sibling = cards[target];
                  if (!sibling) return;
                  const button = event.currentTarget;
                  onMove(card.key, sibling.key, down);
                  setAnnouncement(`${name}, позиция ${target + 1} из ${cards.length}`);
                  requestAnimationFrame(() => button.focus());
                }}
              >
                <span className="editor-grip" title="Перетащить · Alt + ↑ / ↓" aria-hidden="true">
                  ⠿
                </span>
                <span>{name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <span className="sr-only" role="status">
        {announcement}
      </span>
    </>
  );
}
