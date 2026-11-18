// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Diff, SessionSummary } from './SessionSummary';
import { useStudyStore, type AnswerLog, type QueueItem } from './study-store';

const answer: AnswerLog = {
  cardId: 'card',
  direction: 'term_to_def',
  term: 'Вопрос',
  definition: '**Правильно**',
  rating: 1,
  correct: false,
  typed: 'Ошибка',
};
function mount(props: Partial<React.ComponentProps<typeof SessionSummary>> = {}) {
  return render(
    <MemoryRouter>
      <SessionSummary setId="set" answers={[answer]} onRestart={vi.fn()} {...props} />
    </MemoryRouter>,
  );
}
beforeEach(() => useStudyStore.setState({ items: [], mode: 'write' }));
afterEach(cleanup);

it('не объявляет пустую сессию успешной и не выдумывает срок', () => {
  mount({ answers: [] });
  expect(screen.getByText('В этот раз вы не ответили ни на одну карточку.')).toBeTruthy();
  expect(screen.queryByText(/Все ответы верные/)).toBeNull();
  expect(screen.queryByText(/Следующее повторение/)).toBeNull();
  expect(screen.queryByText('Разбор ошибок')).toBeNull();
  expect(screen.queryByText('0%')).toBeNull();
});
it('показывает количество верных ответов и процент без разбора при полном успехе', () => {
  mount({ answers: [{ ...answer, correct: true }] });
  expect(screen.getByText('100%')).toBeTruthy();
  expect(screen.getByText(/Все ответы верные/)).toBeTruthy();
  expect(screen.queryByText('Разбор ошибок')).toBeNull();
});
it('считает ответы, включая повтор одной карточки, без изменения алгоритма', () => {
  mount({ answers: [answer, { ...answer, correct: true }, answer] });
  expect(screen.getByText('33%')).toBeTruthy();
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByLabelText('Итоги сессии').textContent).toContain('Всего ответов3');
});
it('рендерит форматирование обеих сторон и сохраняет длинный пользовательский текст', () => {
  const typed = 'длинный ответ\n'.repeat(100);
  const { container } = mount({ answers: [{ ...answer, term: '**Вопрос**', typed }] });
  expect(container.querySelectorAll('strong')).toHaveLength(2);
  expect(container.querySelector('.session-result__typed .sr-only')?.textContent).toBe(typed);
});
it('различает отсутствие записи и пустой введённый ответ', () => {
  mount({
    answers: [
      { ...answer, typed: undefined },
      { ...answer, typed: '' },
    ],
  });
  expect(screen.getByText('Ответ отмечен как неверный. Текст ответа не записан.')).toBeTruthy();
  expect(screen.getByText('Ответ не введён.')).toBeTruthy();
});
it('разбирает обратное направление по ожидаемой стороне', () => {
  const { container } = mount({ answers: [{ ...answer, direction: 'def_to_term' }] });
  expect(container.querySelector('.session-result__question')?.textContent).toContain('Правильно');
  expect(container.querySelector('.session-result__answer--expected')?.textContent).toContain(
    'Вопрос',
  );
});
it('в диктанте показывает услышанную сторону в обоих направлениях', () => {
  useStudyStore.setState({ mode: 'listen' });
  const { container } = mount({ answers: [answer, { ...answer, direction: 'def_to_term' }] });
  const expected = container.querySelectorAll('.session-result__answer--expected');
  expect(expected[0]?.textContent).toContain('Вопрос');
  expect(expected[1]?.textContent).toContain('Правильно');
});
it('берёт изображения из текущей очереди и меняет стороны при обратном направлении', () => {
  useStudyStore.setState({
    items: [
      {
        card: {
          id: 'card',
          content_type: 'text',
          term_image_url: '/question.png',
          definition_image_url: '/answer.png',
        },
      } as QueueItem,
    ],
  });
  mount({ answers: [{ ...answer, direction: 'def_to_term' }] });
  expect(screen.getByAltText('Изображение вопроса').getAttribute('src')).toBe('/answer.png');
  expect(screen.getByAltText('Изображение правильного ответа').getAttribute('src')).toBe(
    '/question.png',
  );
});
it('показывает переданный срок и уже наступившее повторение', () => {
  const { unmount } = mount({ nextDueSeconds: 3600 });
  expect(screen.getByText(/через 1 ч/)).toBeTruthy();
  unmount();
  mount({ nextDueSeconds: 0 });
  expect(screen.getByText('уже доступно')).toBeTruthy();
});
it('не показывает нечисловой срок', () => {
  mount({ nextDueSeconds: NaN });
  expect(screen.queryByText(/Следующее повторение/)).toBeNull();
});
it('оставляет повтор ошибок отдельным действием и вызывает нужный callback', () => {
  const repeat = vi.fn(),
    restart = vi.fn();
  mount({ onRepeatMistakes: repeat, onRestart: restart });
  fireEvent.click(screen.getByRole('button', { name: 'Повторить ошибки' }));
  expect(repeat).toHaveBeenCalledOnce();
  expect(restart).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить учить' }));
  expect(restart).toHaveBeenCalledOnce();
});
it.each([
  [undefined, undefined, '/sets/set', 'К набору'],
  ['/materials?folder=f', 'К папке', '/materials?folder=f', 'К папке'],
  ['/courses/c', 'К курсу', '/courses/c', 'К курсу'],
])('сохраняет ссылку возврата %s без вложенной кнопки', (backHref, backLabel, href, label) => {
  mount({ backHref, backLabel });
  const link = screen.getByRole('link', { name: label });
  expect(link.getAttribute('href')).toBe(href);
  expect(link.querySelector('button')).toBeNull();
});
it('Diff читает весь ответ одной фразой и сохраняет подсветку несовпадения', () => {
  const { container } = render(<Diff expected="Слово" typed="слова" />);
  expect(container.querySelector('.sr-only')?.textContent).toBe('слова');
  expect(container.querySelector('.text-success')?.textContent).toBe('слов');
  expect(container.querySelector('.text-danger')?.textContent).toBe('а');
});
