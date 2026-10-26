'use client';

import { useState } from 'react';
import { APP_URL } from '../../lib/auth-api';
import {
  formatRubles,
  publicPlans,
  type BillingInterval,
  type PublicPlan,
} from '../../lib/pricing';
import { CheckIcon } from './CheckIcon';

export function PricingPlans() {
  const [interval, setInterval] = useState<BillingInterval>('year');

  return (
    <>
      <div className="pricing-period" aria-label="Период оплаты">
        <PeriodButton active={interval === 'month'} onClick={() => setInterval('month')}>
          Месяц
        </PeriodButton>
        <PeriodButton active={interval === 'year'} onClick={() => setInterval('year')}>
          Год
        </PeriodButton>
      </div>
      <p className="pricing-payment-note">
        Разовая оплата · без автопродления и неожиданных списаний
      </p>

      <section className="pricing-plans" aria-label="Тарифы «Запоминальни»">
        {publicPlans.map((plan) => (
          <PlanColumn key={plan.code} plan={plan} interval={interval} />
        ))}
      </section>
    </>
  );
}

function PeriodButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}

function PlanColumn({ plan, interval }: { plan: PublicPlan; interval: BillingInterval }) {
  const free = plan.code === 'free';
  const yearly = interval === 'year';
  return (
    <article className={plan.code === 'plus' ? 'pricing-plan is-recommended' : 'pricing-plan'}>
      <div className="pricing-plan-name">
        <h2>{plan.name}</h2>
        {plan.code === 'plus' && <span>Для регулярной учёбы</span>}
      </div>

      <div className="pricing-price">
        {free ? (
          <strong>0 ₽</strong>
        ) : (
          <>
            {yearly && <del>{formatRubles(plan.monthPrice)}</del>}
            <strong>{formatRubles(yearly ? plan.yearMonthlyPrice : plan.monthPrice)}</strong>
            <span>/месяц</span>
          </>
        )}
      </div>
      {!free && (
        <p className="pricing-year-total" hidden={!yearly}>
          Разовая оплата {formatRubles(plan.yearPrice)} за год
        </p>
      )}

      <p className="pricing-plan-description">{plan.description}</p>
      <ul>
        {plan.features.map((feature) => (
          <li key={feature}>
            <CheckIcon />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="pricing-plan-action">
        <a
          className={plan.code === 'plus' ? 'pricing-button is-primary' : 'pricing-button'}
          href={free ? '/register' : `${APP_URL}/billing`}
        >
          {free ? 'Начать бесплатно' : `Выбрать ${plan.name}`}
        </a>
        <small>{free ? 'Регистрация без карты' : 'Оформление продолжится в приложении'}</small>
      </div>
    </article>
  );
}
