import type { StudyMode } from '@remora/core';
import { useParams, useSearchParams } from 'react-router-dom';
import { FlashcardsPage } from './FlashcardsPage';
import { LearnPage } from './LearnPage';
import { ListenPage } from './ListenPage';
import { TestPage, type TestPageProps } from './TestPage';
import { WritePage } from './WritePage';
import { PublicQuizAccess } from './PublicQuizAccess';

const modes = {
  flashcards: FlashcardsPage,
  learn: LearnPage,
  listen: ListenPage,
  write: WritePage,
} satisfies Record<Exclude<StudyMode, 'test'>, React.ComponentType>;

type ActivityProps = { mode: Exclude<StudyMode, 'test'> } | ({ mode: 'test' } & TestPageProps);

export function StudyActivity(props: ActivityProps) {
  const { courseId, setId, folderId } = useParams();
  const [params] = useSearchParams();
  if (props.mode === 'test') {
    const id = props.setIdOverride ?? setId;
    const quiz = <TestPage key={id} {...props} />;
    return !props.embedded && id && params.get('from') === 'public-course' ? (
      <PublicQuizAccess key={id} setId={id}>
        {quiz}
      </PublicQuizAccess>
    ) : (
      quiz
    );
  }
  const Activity = modes[props.mode];
  return <Activity key={`${props.mode}:${courseId ?? ''}:${setId ?? ''}:${folderId ?? ''}`} />;
}
