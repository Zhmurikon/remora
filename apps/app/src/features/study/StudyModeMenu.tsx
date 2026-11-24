import { STUDY_MODE_LABELS } from '@remora/core';
import { Link } from 'react-router-dom';
import { trainingModes } from './study-routes';

export function StudyModeMenu({
  basePath,
  label,
  summary,
  showLearn = true,
}: {
  basePath: string;
  label: string;
  summary: string;
  showLearn?: boolean;
}) {
  return (
    <details>
      <summary className="text-primary flex min-h-11 cursor-pointer items-center gap-2">
        {summary} <span aria-hidden="true">▾</span>
      </summary>
      <nav className="manage-options" aria-label={label}>
        {trainingModes
          .filter((mode) => mode !== 'learn' || showLearn)
          .map((mode) => (
            <Link
              className="text-primary inline-flex min-h-11 items-center"
              key={mode}
              to={`${basePath}/${mode}`}
            >
              {STUDY_MODE_LABELS[mode]}
            </Link>
          ))}
      </nav>
    </details>
  );
}
