// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { findPythonTask, pythonTasks } from '../features/practice/python-tasks';
import { AppLayout } from '../layouts/AppLayout';
import { PracticePage, PythonPracticePage, PythonTaskPage } from './PracticePage';

afterEach(cleanup);

describe('раздел практики', () => {
  it('добавлен в основную навигацию', () => {
    render(
      <MemoryRouter initialEntries={['/practice']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="practice" element={<PracticePage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Практика' }).getAttribute('href')).toBe('/practice');
    expect(screen.getByRole('heading', { name: 'Практика', level: 1 })).toBeTruthy();
  });

  it('ведёт из списка тренажёров в каталог Python', () => {
    render(
      <MemoryRouter>
        <PracticePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Python/ }).getAttribute('href')).toBe(
      '/practice/python',
    );
  });

  it('показывает статический каталог задач', () => {
    render(
      <MemoryRouter>
        <PythonPracticePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Python', level: 1 })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Приветствие по имени/ }).getAttribute('href')).toBe(
      '/practice/python/privetstvie-po-imeni',
    );
    expect(screen.getByText('1 из 20')).toBeTruthy();
  });
});

describe('демонстрационная задача', () => {
  it('имеет стабильный адрес и версию', () => {
    expect(pythonTasks).toHaveLength(1);
    expect(findPythonTask('privetstvie-po-imeni')).toMatchObject({
      id: 'python-greeting-by-name',
      version: 1,
    });
  });

  it('показывает условие, пример и стартовый код без фиктивного запуска', () => {
    renderTask('/practice/python/privetstvie-po-imeni');

    expect(screen.getByRole('heading', { name: 'Приветствие по имени', level: 1 })).toBeTruthy();
    expect(screen.getByText('Привет, Мира!')).toBeTruthy();
    expect(screen.getByText(/name = input/)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Запустить' }).disabled).toBe(
      true,
    );
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Проверить решение' }).disabled,
    ).toBe(true);
    expect(screen.getByText('Запуск кода появится на этапе P1.')).toBeTruthy();
  });

  it('объясняет, что делать при неизвестном адресе', () => {
    renderTask('/practice/python/net-takoy-zadachi');

    expect(screen.getByRole('alert').textContent).toContain('Задача не найдена');
    expect(screen.getByRole('link', { name: 'Вернуться к задачам' }).getAttribute('href')).toBe(
      '/practice/python',
    );
  });
});

function renderTask(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="practice/python/:taskSlug" element={<PythonTaskPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
