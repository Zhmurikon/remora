import { PublicState } from '../../../components/landing/PublicState';

export default function NoteNotFound() {
  return (
    <main>
      <PublicState
        code="404"
        title="Конспект недоступен"
        description="Возможно, автор закрыл доступ или ссылка изменилась. В каталоге можно выбрать другой материал."
        primaryHref="/kursy"
        primaryLabel="Открыть каталог"
        secondaryHref="/"
        secondaryLabel="На главную"
      />
    </main>
  );
}
