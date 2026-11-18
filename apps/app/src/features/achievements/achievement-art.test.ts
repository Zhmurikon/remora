import { describe, expect, it } from 'vitest';
import { achievementArtwork } from './achievement-art';

describe('achievementArtwork', () => {
  it.each([
    'first_review',
    'reviews_10',
    'reviews_67',
    'reviews_200',
    'reviews_300',
    'reviews_777',
    'publish_1',
  ])('выбирает индивидуальный рисунок для %s', (code) => {
    const artwork = achievementArtwork(code);
    expect(artwork.variant).toBe('individual');
    expect(artwork.src).toContain('achievement-');
  });

  it('сохраняет общую заглушку для остальных достижений', () => {
    expect(achievementArtwork('reviews_500')).toMatchObject({ variant: 'placeholder' });
  });
});
