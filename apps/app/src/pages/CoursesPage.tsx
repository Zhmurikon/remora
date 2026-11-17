import {
  ManageHeader,
  ManageGroup,
  OrderedRows,
  OriginFilter,
  cardCount,
} from '../features/library/ManagementList';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { ListSort, sortItems, useCustomOrder, useListSort } from '../features/library/ListSort';

const WEB_URL = import.meta.env.VITE_WEB_URL ?? 'http://localhost:3000';
function failure(error: unknown): Error {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'CONFLICT') {
    return new Error('Этот набор уже входит в курс. Выберите другой набор.');
  }
  return new Error('Не удалось выполнить запрос. Проверьте соединение и повторите попытку.');
}

export function CoursesPage() {
  const [search, setSearch] = useState('');
  const [origin, setOrigin] = useState<'all' | 'owned' | 'saved'>('all');
  const [sortMode, setSortMode] = useListSort('remora:sort:courses', 'custom', false);
  const [customOrder, setCustomOrder] = useCustomOrder('remora:order:courses');
  const courses = useQuery({
    queryKey: ['courses'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/courses');
      if (!data || error) throw failure(error);
      return data;
    },
  });
  const savedCourses = useQuery({
    queryKey: ['library', 'courses'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/library/courses');
      if (!data || error) throw failure(error);
      return data;
    },
  });
  const sortedCourses = useMemo(
    () =>
      sortItems(
        courses.data ?? [],
        sortMode,
        (course) => ({
          id: course.id,
          title: course.title,
          date: course.updated_at,
        }),
        customOrder,
      ),
    [courses.data, customOrder, sortMode],
  );
  const sortedSavedCourses = useMemo(
    () =>
      sortItems(
        savedCourses.data ?? [],
        sortMode,
        (course) => ({
          id: course.id,
          title: course.title,
          date: course.saved_at,
          size: course.cards_count,
        }),
        customOrder,
      ),
    [customOrder, savedCourses.data, sortMode],
  );
  const allOrderedIds = [...sortedCourses, ...sortedSavedCourses].map((course) => course.id);
  const needle = search.trim().toLocaleLowerCase('ru');
  const matches = (course: { title: string; description: string }) =>
    (course.title + ' ' + course.description).toLocaleLowerCase('ru').includes(needle);
  const owned = origin === 'saved' ? [] : sortedCourses.filter(matches);
  const saved = origin === 'owned' ? [] : sortedSavedCourses.filter(matches);
  const ordering = {
    fullOrder: allOrderedIds,
    onOrder: setCustomOrder,
    custom: sortMode === 'custom',
  };
  return (
    <div className="management">
      <ManageHeader title="Сортировка курсов">
        <a className="manage-link" href={WEB_URL + '/kursy'}>
          Найти курсы
        </a>
        <Link className="manage-link" to="/library/manage">
          Управлять сохранениями
        </Link>
        <Link className="manage-action" to="/courses/new">
          Создать курс
        </Link>
      </ManageHeader>
      <div className="manage-toolbar">
        <input
          type="search"
          aria-label="Поиск курсов"
          placeholder="Найти курс"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <OriginFilter value={origin} onChange={setOrigin} />
        <ListSort
          value={sortMode}
          onChange={setSortMode}
          label="Сортировка курсов"
          includeSize={false}
        />
      </div>
      {courses.isError || savedCourses.isError ? (
        <p role="alert">
          {courses.error?.message ?? savedCourses.error?.message}{' '}
          <button
            className="manage-link"
            onClick={() => {
              void courses.refetch();
              void savedCourses.refetch();
            }}
          >
            Повторить
          </button>
        </p>
      ) : courses.isPending || savedCourses.isPending ? (
        <p role="status">Загружаем курсы…</p>
      ) : (
        <>
          {owned.length > 0 && (
            <ManageGroup title="Свои курсы" count={owned.length}>
              <OrderedRows {...ordering} items={owned}>
                {(course) => (
                  <>
                    <Link className="manage-title" draggable={false} to={'/courses/' + course.id}>
                      {course.title}
                    </Link>
                    <p className="manage-meta">
                      Изменён {new Date(course.updated_at).toLocaleDateString('ru-RU')}
                    </p>
                  </>
                )}
              </OrderedRows>
            </ManageGroup>
          )}
          {saved.length > 0 && (
            <ManageGroup title="Сохранённые курсы" count={saved.length}>
              <OrderedRows {...ordering} items={saved}>
                {(course) => (
                  <>
                    <Link
                      className="manage-title"
                      draggable={false}
                      to={'/courses/' + course.id}
                      aria-label={[course.title, course.description].filter(Boolean).join(' ')}
                    >
                      {course.title}
                    </Link>
                    <p className="manage-meta">
                      {cardCount(course.cards_count)} ·{' '}
                      {course.author.display_name || '@' + course.author.username} ·{' '}
                      <a aria-label="Публичная страница" href={WEB_URL + '/kurs/' + course.slug}>
                        Оригинал курса
                      </a>
                    </p>
                  </>
                )}
              </OrderedRows>
            </ManageGroup>
          )}
          {!owned.length && !saved.length && (
            <p className="manage-note">
              {needle
                ? 'Курсы не найдены.'
                : origin === 'saved'
                  ? 'Сохранённых курсов пока нет.'
                  : 'Ваш первый курс'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
