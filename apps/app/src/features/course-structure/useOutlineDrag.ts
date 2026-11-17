import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { placeItem, samePosition } from './order';
import type { OutlineSection, Position } from './order';

type Drag = {
  from: Position;
  to: Position | null;
  title: string;
  key: string;
  pointer: number | null;
  x: number;
  y: number;
};

export function useOutlineDrag(
  sections: OutlineSection[],
  change: (sections: OutlineSection[]) => void,
  expand: (index: number) => void,
) {
  const root = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const active = useRef<Drag | null>(null);
  function update(value: Drag | null) {
    active.current = value;
    setDrag(value);
  }
  function finish(drop: boolean) {
    const d = active.current;
    update(null);
    if (!d) return;
    if (drop && d.to && !samePosition(d.from, d.to)) {
      if (d.from.lesson !== undefined) expand(d.to.section);
      change(placeItem(sections, d.from, d.to));
    }
    requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLButtonElement>(`[data-handle="${d.key}"]`)
        ?.focus({ preventScroll: true }),
    );
  }
  function point(from: Position, x: number, y: number): Position | null {
    const el = document.elementFromPoint(x, y);
    const group = el?.closest<HTMLElement>('[data-group]');
    if (!group || !root.current?.contains(group)) return null;
    const section = Number(group.dataset.group);
    if (from.lesson === undefined) {
      const rect = group.getBoundingClientRect();
      const slot = section + Number(y > rect.top + rect.height / 2);
      return { section: slot - Number(slot > from.section) };
    }
    const row = el?.closest<HTMLElement>('[data-lesson]');
    let slot = 0;
    if (row) {
      const rect = row.getBoundingClientRect();
      slot = Number(row.dataset.lesson) + Number(y > rect.top + rect.height / 2);
    } else if (!el?.closest('[data-section-heading]')) slot = sections[section]!.articles.length;
    return { section, lesson: slot - Number(section === from.section && slot > from.lesson) };
  }
  const pointer = drag?.pointer;
  // У края окна прокрутка продолжается, даже когда палец неподвижен.
  useEffect(() => {
    if (pointer == null) return;
    let frame = 0;
    function scroll() {
      const d = active.current;
      if (!d || d.pointer == null) return;
      const delta = d.y < 72 ? -12 : d.y > innerHeight - 64 ? 12 : 0;
      if (delta && d.x >= 0 && d.x <= innerWidth) {
        const prev = window.scrollY;
        window.scrollBy(0, delta);
        if (window.scrollY !== prev) update({ ...d, to: point(d.from, d.x, d.y) });
      }
      frame = requestAnimationFrame(scroll);
    }
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
    // Данные не переставляются до отпускания маркера.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointer, sections]);
  const destination = drag?.from.lesson !== undefined ? drag?.to?.section : undefined;
  useEffect(() => {
    if (destination === undefined) return;
    const timer = setTimeout(() => expand(destination), 400);
    return () => clearTimeout(timer);
  }, [destination, expand]);
  function handle(from: Position, key: string, title: string) {
    return {
      'data-handle': key,
      'aria-label': `Переместить «${title}»`,
      'aria-describedby': 'outline-drag-help',
      title: 'Перетащить или выбрать пробелом',
      onBlur: () => {
        if (active.current?.pointer === null) update(null);
      },
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
        if (!e.isPrimary || e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.focus({ preventScroll: true });
        update({ from, to: from, key, title, pointer: e.pointerId, x: e.clientX, y: e.clientY });
      },
      onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
        const d = active.current;
        if (d?.pointer !== e.pointerId) return;
        update({ ...d, x: e.clientX, y: e.clientY, to: point(d.from, e.clientX, e.clientY) });
      },
      onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
        const d = active.current;
        if (d?.pointer !== e.pointerId) return;
        active.current = { ...d, to: point(d.from, e.clientX, e.clientY) };
        finish(true);
      },
      onLostPointerCapture: () => {
        if (active.current?.pointer != null) finish(false);
      },
      onPointerCancel: () => finish(false),
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
        const d = active.current;
        if (!d && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault();
          update({ from, to: from, key, title, pointer: null, x: 0, y: 0 });
          return;
        }
        if (!d) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
          return;
        }
        if (d.pointer !== null || !d.to) return;
        if (e.key === 'Tab') {
          update(null);
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          finish(true);
          return;
        }
        const offset = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
        if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) return;
        e.preventDefault();
        const clamp = (i: number, max: number) => Math.max(0, Math.min(max, i));
        let { section, lesson } = d.to;
        if (lesson === undefined) {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') return;
          section = clamp(section + offset, sections.length - 1);
        } else {
          const across = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
          if (across) section = clamp(section + offset, sections.length - 1);
          lesson = clamp(
            lesson + (across ? 0 : offset),
            sections[section]!.articles.length - Number(section === d.from.section),
          );
          expand(section);
        }
        update({ ...d, to: { section, lesson } });
        requestAnimationFrame(() =>
          root.current?.querySelector('.outline-insert')?.scrollIntoView?.({ block: 'nearest' }),
        );
      },
    };
  }
  const to = drag?.to;
  let slot: Position | null = null;
  if (drag && to) {
    if (to.lesson === undefined)
      slot = { section: to.section + Number(to.section > drag.from.section) };
    else
      slot = {
        section: to.section,
        lesson:
          to.lesson + Number(to.section === drag.from.section && to.lesson > drag.from.lesson!),
      };
  }
  return { root, drag, handle, slot };
}
