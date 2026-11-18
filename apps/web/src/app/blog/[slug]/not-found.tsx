import { PublicState } from '../../../components/landing/PublicState';

export default function BlogNotFound() {
  return (
    <PublicState
      code="404"
      title="Статья не найдена"
      description="Возможно, ссылка изменилась или публикация больше недоступна. В блоге остаются другие материалы об учёбе и запоминании."
      primaryHref="/blog"
      primaryLabel="Все статьи"
      secondaryHref="/"
      secondaryLabel="На главную"
    />
  );
}
