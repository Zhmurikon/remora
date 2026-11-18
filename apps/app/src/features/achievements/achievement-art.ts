import bigWin from './assets/achievement-big-win.webp';
import firstReview from './assets/achievement-first-review.webp';
import firstPublishedCourse from './assets/achievement-first-published-course.webp';
import groomArrived from './assets/achievement-groom-arrived.webp';
import placeholder from './assets/achievement-placeholder.webp';
import reviews67 from './assets/achievement-reviews-67.webp';
import spartan from './assets/achievement-spartan.webp';
import warmup from './assets/achievement-warmup.webp';

export type AchievementArtwork = {
  src: string;
  variant: 'individual' | 'placeholder';
};

export function achievementArtwork(code: string): AchievementArtwork {
  const individual: Record<string, string> = {
    first_review: firstReview,
    reviews_10: warmup,
    reviews_67: reviews67,
    reviews_200: groomArrived,
    reviews_300: spartan,
    reviews_777: bigWin,
    publish_1: firstPublishedCourse,
  };
  const src = individual[code];
  if (src) {
    return { src, variant: 'individual' };
  }
  return { src: placeholder, variant: 'placeholder' };
}
