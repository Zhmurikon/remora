import { PublicState } from '../../../components/landing/PublicState';

export default function CourseNotFound() {
  return (
    <main>
      <PublicState
        code="404"
        title="Курс недоступен"
        description="Возможно, автор снял его с публикации или ссылка изменилась. В каталоге можно выбрать другой материал."
        primaryHref="/kursy"
        primaryLabel="Открыть каталог"
        secondaryHref="/"
        secondaryLabel="На главную"
      />
    </main>
  );
}
