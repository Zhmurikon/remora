export default function CatalogLoading() {
  return (
    <main
      className="mx-auto min-h-dvh max-w-6xl space-y-6 px-4 py-16 sm:px-8"
      aria-busy="true"
      aria-label="Загружаем каталог"
    >
      <p role="status" className="text-fg-muted">
        Загружаем курсы…
      </p>
      <div className="bg-surface-muted h-64 rounded-2xl" />
      <div className="grid gap-5 sm:grid-cols-2">
        {[0, 1, 2, 3].map((id) => (
          <div key={id} className="bg-surface-muted h-56 rounded-2xl" />
        ))}
      </div>
    </main>
  );
}
