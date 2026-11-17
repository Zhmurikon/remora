const paths = {
  top: 'M5 4h14M12 20V8m-5 5 5-5 5 5',
  bottom: 'M5 20h14M12 4v12m-5-5 5 5 5-5',
  previous: 'm14.5 5-7 7 7 7',
  next: 'm9.5 5 7 7-7 7',
  outline: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm4 0v16',
};

export function ReaderIconButton({
  icon,
  label,
  title = label,
  disabled,
  onClick,
}: {
  icon: keyof typeof paths;
  label: string;
  title?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="reader-control reader-icon"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={paths[icon]} />
      </svg>
    </button>
  );
}
