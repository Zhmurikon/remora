import { formatRubles, publicPlans } from '../../lib/pricing';
import { CheckIcon } from '../pricing/CheckIcon';

export function HomePricing() {
  return (
    <section className="home-pricing home-shell" aria-labelledby="home-pricing-title">
      <div className="home-pricing-head">
        <h2 id="home-pricing-title">
          Учиться — бесплатно.
          <br />
          Платите за масштаб.
        </h2>
        <p>
          Все режимы обучения, повторения и доступ к уже созданным материалам остаются бесплатными.
          Plus и Pro добавляют больше контента, автоматизацию и ИИ.
        </p>
      </div>

      <div className="home-pricing-grid">
        {publicPlans.map((plan) => (
          <article
            className={
              plan.code === 'plus' ? 'home-pricing-plan is-recommended' : 'home-pricing-plan'
            }
            key={plan.code}
          >
            <div className="home-pricing-name">
              <h3>{plan.name}</h3>
              {plan.code === 'plus' && <span>Для регулярной учёбы</span>}
            </div>
            {plan.code === 'free' ? (
              <p className="home-pricing-price">
                <strong>0 ₽</strong>
                <span>навсегда</span>
              </p>
            ) : (
              <>
                <p className="home-pricing-price">
                  <del>{formatRubles(plan.monthPrice)}</del>
                  <strong>{formatRubles(plan.yearMonthlyPrice)}</strong>
                  <span>/мес.</span>
                </p>
                <p className="home-pricing-total">
                  Разовая оплата {formatRubles(plan.yearPrice)} за год
                </p>
              </>
            )}
            <p className="home-pricing-description">
              {plan.code === 'free'
                ? '10 курсов, 20 наборов и все режимы обучения без ограничений.'
                : plan.code === 'plus'
                  ? 'Контент и MCP без лимита, ИИ-инструменты и полный преподавательский контур.'
                  : 'Всё из Plus и повышенные недельные квоты для интенсивной работы с ИИ.'}
            </p>
            <a
              className={
                plan.code === 'plus' ? 'home-pricing-button is-primary' : 'home-pricing-button'
              }
              href={plan.code === 'free' ? '/register' : '/tarify'}
            >
              {plan.code === 'free' ? 'Начать бесплатно' : `Посмотреть ${plan.name}`}
            </a>
          </article>
        ))}
      </div>

      <div className="home-pricing-foot">
        <p>
          <CheckIcon />
          <span>
            <strong>Ничего не запираем:</strong> после окончания Plus или Pro материалы и обучение
            остаются доступны.
          </span>
        </p>
        <a href="/tarify">Сравнить тарифы →</a>
      </div>
    </section>
  );
}
