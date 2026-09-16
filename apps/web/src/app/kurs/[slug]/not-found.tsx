import Link from 'next/link';

export default function CourseNotFound() {
  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-16">
      <h1 className="text-3xl font-semibold">Курс недоступен</h1>
      <p className="text-fg-muted">Возможно, автор снял его с публикации или ссылка изменилась.</p>
      <Link className="text-primary inline-flex min-h-11 items-center underline" href="/">
        На главную
      </Link>
    </main>
  );
}
