import { CardFace } from '@remora/ui';
import { sideName, type CardRole } from './card-sides';
import type { QueueItem } from './study-store';

export function StudyCardFace({
  item,
  role,
  className,
}: {
  item: QueueItem;
  role: CardRole;
  className?: string;
}) {
  return (
    <CardFace
      card={item.card}
      side={sideName(item, role)}
      className={className}
      imageAlt={role === 'question' ? 'Изображение вопроса' : 'Изображение ответа'}
    />
  );
}
