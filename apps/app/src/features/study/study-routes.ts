import type { StudyMode } from '@remora/core';

export const trainingModes = ['learn', 'flashcards', 'write', 'listen'] as const;
const sources: { path: string; modes: readonly StudyMode[] }[] = [
  { path: 'sets/:setId', modes: [...trainingModes, 'test'] },
  { path: 'folders/:folderId', modes: trainingModes },
  { path: 'courses/:courseId', modes: trainingModes },
];

export const studyRoutes = sources.flatMap(({ path, modes }) =>
  modes.map((mode) => ({ path: `${path}/${mode}`, mode })),
);
