'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';

export function BlogMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!root.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('blog-heading-enter');
        observer.unobserve(entry.target);
      }
    });
    // Заголовки видны и до гидратации; эффект включается только при первом появлении в окне.
    for (const heading of root.current.querySelectorAll(':is(h1,h2,h3,h4,h5,h6):not(.sr-only)')) {
      observer.observe(heading);
    }
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <div className="blog-page" ref={root}>
      {children}
    </div>
  );
}
