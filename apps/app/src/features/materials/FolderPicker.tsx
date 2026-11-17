import type { components } from '@remora/api-client';
import { useEffect, useId, useRef, useState } from 'react';

type Folder = components['schemas']['FolderPublic'];

export function FolderPicker({
  folders,
  items,
  value,
  onChange,
}: {
  folders: Folder[];
  items: { folderId: string | null }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.folderId ?? 'none';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const options = [
    { id: 'all', title: 'Все наборы', count: items.length },
    ...folders.map((folder) => {
      const path = [folder.title];
      const seen = new Set([folder.id]);
      let parent = folder.parent_id;
      while (parent && !seen.has(parent)) {
        const ancestor = byId.get(parent);
        if (!ancestor) break;
        seen.add(parent);
        path.unshift(ancestor.title);
        parent = ancestor.parent_id;
      }
      return { id: folder.id, title: path.join(' / '), count: counts.get(folder.id) ?? 0 };
    }),
    { id: 'none', title: 'Без папки', count: counts.get('none') ?? 0 },
  ];
  const title = byId.get(value)?.title ?? (value === 'none' ? 'Без папки' : 'Все наборы');

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function close() {
    trigger.current?.focus();
    setOpen(false);
  }

  return (
    <div
      className="material-folder-picker"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="material-folder-trigger"
        ref={trigger}
        aria-label={'Выбрать папку: ' + title}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <FolderIcon />
        <span className="truncate">{title}</span>
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
        >
          <path d="m2.5 4.5 3.5 3.5 3.5-3.5" />
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          className="material-folder-menu shadow-pop"
          role="menu"
          aria-label="Выбор папки"
          onKeyDown={(event) => {
            if (event.key === 'Escape' || event.key === 'Tab') {
              if (event.key === 'Escape') event.preventDefault();
              close();
              return;
            }
            const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const next = {
              ArrowDown: current + 1,
              ArrowUp: current - 1,
              Home: 0,
              End: buttons.length - 1,
            }[event.key];
            if (next !== undefined) {
              event.preventDefault();
              buttons[(next + buttons.length) % buttons.length]?.focus();
            }
          }}
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              tabIndex={-1}
              role="menuitemradio"
              aria-checked={option.id === value}
              onClick={() => {
                onChange(option.id);
                close();
              }}
            >
              {option.id !== 'all' && <FolderIcon />}
              <span>{option.title}</span>
              <small>{option.count}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FolderIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinejoin="round"
    >
      <path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}
