export type AnswerScene = 0 | 1 | 2 | 3 | 4;
export type SessionOutcome = 'partial' | 'failed' | 'perfect';

export function sessionOutcome(
  correct: number,
  total: number,
  complete: boolean,
): SessionOutcome | null {
  if (!total) return null;
  if (!correct) return 'failed';
  return complete && correct === total ? 'perfect' : 'partial';
}
export const durationMs = [675, 900, 525, 775, 1000] as const;

export function sceneForStreak(streak: number): AnswerScene {
  if (streak >= 8) return 4;
  if (streak >= 5) return 3;
  if (streak >= 3) return 2;
  return streak === 2 ? 1 : 0;
}
