'use client';

import { CourseReactionIcon } from './CourseReactionIcon';
import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

type Props = {
  slug: string;
  initialCount: number;
  initialLiked: boolean;
};

export function CourseLikeButton({ slug, initialCount, initialLiked }: Props) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(accessToken: string) {
    return fetch(`${API_URL}/api/v1/courses/public/${encodeURIComponent(slug)}/like`, {
      method: liked ? 'DELETE' : 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  async function toggle() {
    setLoading(true);
    setError(null);
    try {
      const refresh = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!refresh.ok) {
        const next = window.location.href;
        window.location.assign(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      const token = (await refresh.json()) as { access_token: string };
      const response = await send(token.access_token);
      if (!response.ok) throw new Error('Не удалось сохранить оценку');
      const course = (await response.json()) as { likes_count: number; liked_by_me: boolean };
      setCount(course.likes_count);
      setLiked(course.liked_by_me);
    } catch {
      setError('Не удалось сохранить оценку. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  }

  const label = liked ? 'Убрать лайк' : 'Нравится';
  return (
    <div className="course-like">
      <button
        type="button"
        className="reader-control course-reaction"
        disabled={loading}
        aria-pressed={liked}
        aria-label={label}
        title={label}
        aria-describedby="course-like-count"
        onClick={toggle}
      >
        <CourseReactionIcon icon="heart" />
        <span aria-hidden="true">{count}</span>
      </button>
      <span id="course-like-count" className="sr-only" aria-live="polite">
        Лайков: {count}
      </span>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
