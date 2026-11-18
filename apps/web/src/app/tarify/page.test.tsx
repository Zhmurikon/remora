// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import PricingPage, { metadata } from './page';

vi.mock('../../components/landing/LandingHeader', () => ({ LandingHeader: () => <div /> }));
vi.mock('../../components/pricing/PricingPlans', () => ({ PricingPlans: () => <div /> }));
vi.mock('../../components/home/HomeTheme', () => ({ HomeTheme: () => <div /> }));
vi.mock('../../components/analytics/PublicAnalytics', () => ({ PublicAnalytics: () => null }));

it('публикует индексируемые метаданные страницы тарифов', () => {
  expect(metadata.alternates).toMatchObject({ canonical: '/tarify' });
  expect(metadata.title).toBe('Тарифы Free, Plus и Pro');
  expect(metadata.description).toContain('Обучение, повторения');
});

it('ссылается на условия оплаты и возврата', () => {
  render(<PricingPage />);

  expect(
    screen.getByRole('link', { name: '«Условия оплаты и возврата»' }).getAttribute('href'),
  ).toBe('/oplata-i-vozvrat');
});
