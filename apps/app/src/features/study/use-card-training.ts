import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { selectCurrent, useStudyStore, type QueueItem } from './study-store';
import {
  useStudySession,
  useStudySessionFinalizer,
  type StudySessionOptions,
} from './use-study-session';

type TrainingOptions = Omit<StudySessionOptions, 'setId' | 'courseId' | 'folderId'>;

export function useCardTraining(options: TrainingOptions) {
  const { setId, courseId, folderId } = useParams();
  const targetId = setId ?? courseId ?? folderId ?? '';
  const basePath = courseId
    ? `/courses/${courseId}`
    : folderId
      ? `/folders/${folderId}`
      : `/sets/${targetId}`;
  const [params] = useSearchParams();
  const requestedDirection = params.get('direction');
  const direction =
    requestedDirection === 'both' || requestedDirection === 'def_to_term'
      ? requestedDirection
      : 'term_to_def';
  const query = useStudySession({ setId, courseId, folderId, direction, ...options });
  const items = useStudyStore((state) => state.items);
  const index = useStudyStore((state) => state.index);
  const answers = useStudyStore((state) => state.answers);
  const sessionId = useStudyStore((state) => state.sessionId);
  const answer = useStudyStore((state) => state.answer);
  const goTo = useStudyStore((state) => state.goTo);
  const activeItem = useStudyStore(selectCurrent);
  // Письмо и аудирование удерживают вопрос, пока ученик читает разбор ответа.
  const [answeredItem, setAnsweredItem] = useState<QueueItem | null>(null);
  const current = answeredItem ?? activeItem;
  const [finished, setFinished] = useState(false);
  const finalizeSession = useStudySessionFinalizer(sessionId);
  const shownAt = useRef(Date.now());

  useEffect(() => {
    if (items.length > 0 && (finished || !current)) void finalizeSession();
  }, [current, finalizeSession, finished, items.length]);

  return {
    query,
    targetId,
    basePath,
    backHref: folderId ? '/sets/manage' : basePath,
    backLabel: courseId ? 'К курсу' : folderId ? 'К папкам' : 'К набору',
    current,
    items,
    index,
    answers,
    sessionId,
    answer,
    goTo,
    answeredItem,
    setAnsweredItem,
    finished,
    setFinished,
    finalizeSession,
    shownAt,
  };
}
