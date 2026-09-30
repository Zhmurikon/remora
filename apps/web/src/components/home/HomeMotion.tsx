'use client';

import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function HomeMotion() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const root = document.querySelector<HTMLElement>('.home');
    if (!root) return;

    const media = gsap.matchMedia();
    const context = gsap.context(() => {
      media.add('(prefers-reduced-motion: no-preference)', () => {
        const heroTimeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
        heroTimeline
          .fromTo(
            '[data-home-memory-cluster] path',
            { strokeDashoffset: 1 },
            { strokeDashoffset: 0, duration: 0.9, stagger: 0.08, ease: 'power2.out' },
          )
          .from(
            '[data-home-hero-copy] > *',
            {
              y: 28,
              opacity: 0,
              duration: 0.65,
              stagger: 0.07,
            },
            '-=0.64',
          )
          .from(
            '[data-home-hero-demo]',
            { y: 46, rotate: 1.5, opacity: 0, duration: 0.8 },
            '-=0.42',
          );

        gsap.fromTo(
          '[data-home-memory-route]',
          { strokeDashoffset: 1 },
          {
            strokeDashoffset: 0,
            ease: 'none',
            scrollTrigger: {
              trigger: root,
              start: 'top top',
              end: 'bottom bottom',
              scrub: 0.45,
            },
          },
        );

        gsap.utils.toArray<HTMLElement>('[data-home-memory-node]').forEach((node) => {
          gsap.fromTo(
            node,
            { scale: 0.82, opacity: 0.24 },
            {
              scale: 1,
              opacity: 1,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: node,
                start: 'top 92%',
                end: 'top 66%',
                scrub: 0.35,
              },
            },
          );
        });

        gsap.utils.toArray<HTMLElement>('[data-home-story]').forEach((section) => {
          const visual = section.querySelector<HTMLElement>('[role="img"]');
          const copy = section.querySelector<HTMLElement>(
            '.home-feature-copy, .home-section-heading',
          );

          ScrollTrigger.create({
            trigger: section,
            start: 'top 82%',
            once: true,
            onEnter: () => {
              const timeline = gsap.timeline();
              if (copy) {
                timeline.fromTo(
                  copy,
                  { y: 30, opacity: 0 },
                  { y: 0, opacity: 1, duration: 0.55, ease: 'power3.out' },
                );
              }
              if (visual) {
                timeline.fromTo(
                  visual,
                  {
                    x: section.classList.contains('home-feature-reverse') ? -34 : 34,
                    opacity: 0,
                  },
                  { x: 0, opacity: 1, duration: 0.65, ease: 'power3.out' },
                  '-=0.35',
                );
              }
            },
          });
        });

        gsap.fromTo(
          '[data-home-story-progress]',
          { scaleY: 0 },
          {
            scaleY: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: '.home-features',
              start: 'top 55%',
              end: 'bottom 65%',
              scrub: 0.5,
            },
          },
        );

        gsap.utils.toArray<SVGPathElement>('.home-motion-path').forEach((path) => {
          ScrollTrigger.create({
            trigger: path.closest('[data-home-story]') ?? path,
            start: 'top 76%',
            once: true,
            onEnter: () => {
              gsap.fromTo(
                path,
                { strokeDashoffset: 1 },
                { strokeDashoffset: 0, duration: 0.7, ease: 'power2.out' },
              );
            },
          });
        });

        ScrollTrigger.create({
          trigger: '[data-home-catalog]',
          start: 'top 72%',
          once: true,
          onEnter: () => {
            const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
            timeline
              .fromTo(
                '[data-home-catalog] .home-catalog-map-routes path',
                { strokeDasharray: 1, strokeDashoffset: 1 },
                { strokeDashoffset: 0, duration: 0.9, stagger: 0.06, ease: 'power2.out' },
              )
              .fromTo(
                '[data-home-catalog-card]',
                { y: 34, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.58, stagger: 0.08 },
                '-=0.62',
              );
          },
        });

        ScrollTrigger.create({
          trigger: '[data-home-faq]',
          start: 'top 78%',
          once: true,
          onEnter: () => {
            gsap.fromTo(
              '[data-home-faq-route]',
              { strokeDasharray: 1, strokeDashoffset: 1 },
              { strokeDashoffset: 0, duration: 1, ease: 'power2.out' },
            );
          },
        });

        ScrollTrigger.create({
          trigger: '.home-final',
          start: 'top 84%',
          once: true,
          onEnter: () => {
            const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
            timeline
              .fromTo(
                '[data-home-final-memory] path',
                { strokeDashoffset: 1 },
                {
                  strokeDashoffset: 0,
                  duration: 1.1,
                  stagger: 0.06,
                  ease: 'power2.out',
                },
              )
              .fromTo(
                '[data-home-final-card]',
                { y: 28, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.62, stagger: 0.08 },
                '-=0.8',
              );
          },
        });
      });

      media.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set(
          '[data-home-memory-route], [data-home-memory-cluster] path, [data-home-final-memory] path, [data-home-final-card], [data-home-memory-node], [data-home-catalog-card], [data-home-catalog] .home-catalog-map-routes path, [data-home-faq-route]',
          { clearProps: 'all' },
        );
        gsap.fromTo(
          '[data-home-hero-copy], [data-home-hero-demo]',
          { opacity: 0 },
          { opacity: 1, duration: 0.15, ease: 'power1.out' },
        );
      });
    }, root);

    return () => {
      media.revert();
      context.revert();
    };
  }, []);

  return null;
}
