type IconName =
  | 'arrow'
  | 'cards'
  | 'book'
  | 'globe'
  | 'leaf'
  | 'check'
  | 'clock'
  | 'spark'
  | 'upload'
  | 'search'
  | 'headphones'
  | 'pen'
  | 'telegram';

const paths: Record<IconName, string> = {
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  cards: 'M8 7h12v14H8zM4 17V3h12',
  book: 'M12 5v16m0-16C8 2 4 3 2 4v15c3-1 6-1 10 2 4-3 7-3 10-2V4c-2-1-6-2-10 1Z',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z',
  leaf: 'M5 19C-1 7 10 3 21 3c0 11-4 22-16 16ZM4 21l12-12',
  check: 'm5 12 4 4L19 6',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 6v6l4 2',
  spark: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-2 5 6 6',
  headphones: 'M4 15v-3a8 8 0 0 1 16 0v3M4 13H2v7h5v-7H4Zm16 0h2v7h-5v-7h3Z',
  pen: 'm4 16 12-12 4 4L8 20H4v-4ZM14 6l4 4',
  telegram: 'm3 11 18-7-4 17-6-6-4 3v-6l10-5-8 7',
};

export function HomeIcon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
