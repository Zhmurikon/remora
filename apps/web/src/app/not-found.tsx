import { PublicFooter } from '../components/landing/PublicFooter';
import { PublicHeader } from '../components/landing/PublicHeader';
import { PublicState } from '../components/landing/PublicState';

export default function NotFound() {
  return (
    <>
      <PublicHeader />
      <main id="main-content">
        <PublicState
          code="404"
          title="Такой страницы здесь нет"
          description="Возможно, ссылка устарела или материал переехал. Вернитесь на главную либо найдите нужную тему в каталоге."
          primaryHref="/"
          primaryLabel="На главную"
          secondaryHref="/kursy"
          secondaryLabel="Открыть каталог"
        />
      </main>
      <PublicFooter />
    </>
  );
}
