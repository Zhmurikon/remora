'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function PricingMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!root.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('pricing-heading-enter');
          observer.unobserve(entry.target);
        }
      }
    });
    // До гидратации и без JavaScript заголовки остаются видимыми.
    root.current
      .querySelectorAll('h1, h2, h3, h4, h5, h6, th')
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={root} className="pricing-route">
      {children}
    </div>
  );
}
