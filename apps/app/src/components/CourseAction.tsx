import { Link } from 'react-router-dom';

const strokes = {
  folder: 'M3 6h7l2 3h9v11H3z',
  cancel: 'm6 6 12 12M18 6 6 18',
  grip: 'M9 5h.2m5.8 0h.2M9 12h.2m5.8 0h.2M9 19h.2m5.8 0h.2',
  more: 'M5 12h.5m6.25 0h.5m6.25 0h.5',
  chevron: 'm9 5 7 7-7 7',
  document: 'M5 3h9l5 5v13H5zM14 3v6h5M8 13h8m-8 4h6',
  up: 'M12 20V4m-7 7 7-7 7 7',
  down: 'M12 4v16m-7-7 7 7 7-7',
  trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  edit: 'm4 16 11-11 4 4L8 20l-5 1 1-5Zm9-9 4 4',
  cards: 'M7 8h14v12H7zM3 15V4h14',
  section: 'M3 19V5h7l2 3h9v11H3zm6-5h6m-3-3v6',
  article: 'M5 3h9l5 5v13H5V3zm8 1v5h5M9 15h6m-3-3v6',
  save: 'M4 3h13l4 4v14H3V3h1zm3 0v6h9V3M7 21v-8h10v8',
  move: 'M3 5h5l2 3h10v12H3v-6m-1-3h12m-4-4 4 4-4 4',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z',
  lock: 'M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3m-4 4v3',
  external: 'M14 4h6v6m0-6L10 14m0-9H4v15h15v-6',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',
};

type Icon = keyof typeof strokes;

export function CourseIcon({ name }: { name: Icon }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={strokes[name]} />
    </svg>
  );
}

export function CourseAction({
  icon,
  label,
  to,
  onClick,
  disabled,
  submit,
}: {
  icon: Icon;
  label: string;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  submit?: boolean;
}) {
  const className = `course-icon-action${submit ? ' is-primary' : ''}${icon === 'trash' ? ' is-delete' : ''}`;
  if (to)
    return (
      <Link className={className} aria-label={label} to={to}>
        <CourseIcon name={icon} />
      </Link>
    );
  return (
    <button
      className={className}
      type={submit ? 'submit' : 'button'}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
    >
      <CourseIcon name={icon} />
    </button>
  );
}
