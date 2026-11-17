import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const paths = {
  about: 'm4 16 11-11 4 4L8 20l-5 1 1-5Zm9-9 4 4',
  access: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-1 0H4m8-9c-5 6-5 12 0 18 5-6 5-12 0-18Z',
  structure: 'M4 4h5v5H4zM6.5 9v9h5m-5-5h5m2-2h7v4h-7zm0 6h7v4h-7z',
  materials: 'M12 6c-3-2-6-2-9-1v13c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v13',
  first: 'M6 8h14v12H6zM3 16V4h13',
  actions:
    'M3 7h8m4 0h6M3 17h3m4 0h11m-6-10a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm-5 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
};

export type SettingsSection = {
  id: keyof typeof paths;
  label: string;
  to: string;
};

export function CourseSettingsNav({
  sections,
  active,
}: {
  sections: SettingsSection[];
  active: SettingsSection;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  function closeMenu() {
    if (open) {
      setOpen(false);
      toggle.current?.focus();
    }
  }
  return (
    <nav
      className="course-settings-nav"
      aria-label="Разделы настроек курса"
      onKeyDown={(event) => {
        if (event.key === 'Escape') closeMenu();
      }}
    >
      <button
        ref={toggle}
        type="button"
        className="course-settings-toggle"
        aria-label={`Раздел настроек: ${active.label}`}
        aria-expanded={open}
        aria-controls="course-settings-links"
        onClick={() => setOpen(!open)}
      >
        <span>{active.label}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      <div id="course-settings-links" data-open={open}>
        {sections.map((item) => (
          <Link
            key={item.id}
            to={item.to}
            aria-current={active.id === item.id ? 'page' : undefined}
            onClick={closeMenu}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={paths[item.id]} />
            </svg>
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
