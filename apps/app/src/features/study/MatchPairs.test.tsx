// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import fixture from '../../../../../packages/core/src/learn-round-cases.json';
import { MatchPairs } from './MatchPairs';
import type { QueueItem } from './study-store';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('листит нерешённые пары по кругу и уступает ручному выбору', () => {
  vi.useFakeTimers();
  const items = fixture.items.slice(0, 4) as unknown as QueueItem[];
  const grade = vi.fn();
  const complete = vi.fn();
  const { container } = render(
    <MatchPairs items={items} seed="round" onPair={grade} onComplete={complete} speak={vi.fn()} />,
  );
  const hand = container.querySelector<HTMLElement>('.match-hand')!;
  const nav = within(hand).getByRole('navigation');
  const position = () => nav.querySelector('[aria-current="step"]')!.textContent;
  const visit = (page: number) =>
    fireEvent.click(within(nav).getByRole('button', { name: new RegExp('^Определение ' + page) }));
  const answer = (correct = true) => {
    const prompt = hand.querySelector('.match-prompt')!.textContent!;
    const option = items.find(({ card }) => prompt.includes(card.definition) === correct)!;
    fireEvent.click(within(hand).getByRole('button', { name: option.card.term }));
  };
  const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  answer(false);
  wait(1200);
  expect(position()).toBe('1');
  answer();
  visit(4);
  wait(1200);
  expect(position()).toBe('4');
  answer();
  wait(999);
  expect(position()).toBe('4');
  wait(1);
  expect(position()).toBe('2');
  answer();
  wait(1000);
  expect(position()).toBe('3');
  expect(complete).not.toHaveBeenCalled();
  answer();
  wait(1200);
  expect(position()).toBe('3');
  expect(grade).toHaveBeenCalledTimes(4);
  expect(complete).toHaveBeenCalledTimes(1);
  expect(within(container).queryByRole('button', { name: 'Дальше' })).toBeNull();
});
