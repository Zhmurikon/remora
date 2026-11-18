'use client';

import { PlanIllustration } from './PlanIllustration';
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
      <div className="pricing-controls">
        <div
          className="pricing-period"
          role="group"
          data-period={interval}
          aria-label="Период оплаты"
        >
          <PeriodButton active={interval === 'month'} onClick={() => setInterval('month')}>
            Месяц
          </PeriodButton>
          <PeriodButton active={interval === 'year'} onClick={() => setInterval('year')}>
            Год
          </PeriodButton>
        </div>
        <p className="pricing-payment-note">Разовая оплата · без автосписаний</p>
      </div>

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
  const action = free ? 'Начать бесплатно' : `Выбрать ${plan.name}`;
  return (
    <article
      data-plan={plan.code}
      className={plan.code === 'plus' ? 'pricing-plan is-recommended' : 'pricing-plan'}
    >
      <div className="pricing-plan-name">
        <h2>{plan.name}</h2>
        <PlanIllustration plan={plan.code} />
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
      <div className="pricing-payment">
        {free ? (
          'Регистрация без карты'
        ) : (
          <>
            <p className="pricing-year-total" hidden={!yearly}>
              Разовая оплата {formatRubles(plan.yearPrice)} за год
            </p>
            {!yearly && <p>Разовая оплата {formatRubles(plan.monthPrice)} за месяц</p>}
          </>
        )}
      </div>
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
          {action}
          <span className="pricing-action-line" aria-hidden="true" />
        </a>
        {!free && <small>Оформление продолжится в приложении</small>}
      </div>
    </article>
  );
}
