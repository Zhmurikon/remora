import { PublicState } from '../../../components/landing/PublicState';

export default function NotFound() {
  return (
    <PublicState
      code="404"
      title="Подборка не найдена"
      description="Возможно, она ещё не опубликована или больше недоступна. Посмотрите другие редакционные папки или выберите курс в каталоге."
      primaryHref="/podborki"
      primaryLabel="Все подборки"
      secondaryHref="/kursy"
      secondaryLabel="Каталог курсов"
    />
  );
}
