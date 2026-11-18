import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import notebookImage from '../../../../web/public/lecture-demo/pricing-notebook.webp';
import './billing-support.css';

export type BillingLimitDetails = {
  limit: number;
  current: number;
  requested: number;
  resetsAt: string | null;
};

export function BillingLimitDialog({
  details,
  onClose,
}: {
  details: BillingLimitDetails;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const remaining = Math.max(details.limit - details.current, 0);
  const number = (value: number) => value.toLocaleString('ru-RU');
  const minutes = (value: number) => {
    const last = value % 10;
    const teen = value % 100 >= 11 && value % 100 <= 14;
    return !teen && last === 1 ? 'минута' : !teen && last >= 2 && last <= 4 ? 'минуты' : 'минут';
  };
  useEffect(() => {
    const node = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node?.showModal();
    return () => {
      node?.close();
      trigger?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="billing-limit-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="billing-limit-heading">
        <img src={notebookImage} alt="" width={67} height={54} />
        <button
          type="button"
          className="billing-support-close"
          aria-label="Закрыть"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m6 6 12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <h2 id={titleId}>Недостаточно минут</h2>
      <p id={descriptionId}>
        Для этой записи потребуется {number(details.requested)} {minutes(details.requested)}, а на текущей
        неделе осталось {number(remaining)}.
      </p>
      <dl className="billing-limit-values">
        <div>
          <dt>Использовано</dt>
          <dd>
            {number(details.current)} из {number(details.limit)} минут
          </dd>
        </div>
        <div>
          <dt>Обновление квоты</dt>
          <dd>
            {details.resetsAt
              ? new Date(details.resetsAt).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                })
              : 'Каждую неделю'}
          </dd>
        </div>
      </dl>
      <p>
        {details.limit > 0
          ? 'Можно дождаться обновления квоты или выбрать тариф с большим объёмом.'
          : 'Новая расшифровка доступна на Plus и Pro.'}{' '}
        Готовые материалы и обучение остаются доступны.
      </p>
      <div className="billing-limit-actions">
        <button className="billing-support-button" type="button" onClick={onClose}>
          Вернуться к записи
        </button>
        <Link className="billing-support-button billing-support-primary" to="/billing">
          Посмотреть тарифы
        </Link>
      </div>
    </dialog>
  );
}
