import Image from 'next/image';
import type { PublicPlan } from '../../lib/pricing';

const artwork = {
  free: {
    file: 'cards',
    overlay: (
      <svg viewBox="0 0 236 183" preserveAspectRatio="xMaxYMid meet" focusable="false">
        <g transform="matrix(1 .176 -.216 .985 74 46)">
          <g className="flip-answer">
            <rect className="answer-paper" width="151" height="99" rx="5" />
            <g className="answer-weather">
              <path d="M50 51c-10 0-11-16 1-17 0-16 23-20 28-7 11-8 24 1 22 10 11 1 11 14 0 14Z" />
              <path className="answer-drizzle" d="m63 59-3 7m15-7-3 7m15-7-3 7" />
            </g>
          </g>
        </g>
      </svg>
    ),
  },
  plus: {
    file: 'notebook',
    overlay: (
      <svg viewBox="0 0 201 192" preserveAspectRatio="xMaxYMid meet" focusable="false">
        <defs>
          <path
            id="tarify-plus-curve"
            pathLength="1"
            d="M77 98C88 89 99 66 106 73S111 101 123 96Q130 94 145 79"
          />
        </defs>
        <use className="chart-trace" href="#tarify-plus-curve" />
        <use className="chart-tip" href="#tarify-plus-curve" />
        <g className="chart-caption">
          <path d="m63 116 31 6m-35 3 20 4" />
        </g>
      </svg>
    ),
  },
  pro: {
    file: 'books',
    overlay: (
      <svg viewBox="0 0 207 196" preserveAspectRatio="xMaxYMid meet" focusable="false">
        <g className="book-ribbons">
          <g transform="matrix(1 .22 0 1 45 128)">
            <path d="M0 0h15v27l-7-6-8 5Z" />
          </g>
          <g transform="matrix(1 .22 0 1 69 106)">
            <path d="M0 0h14v26l-7-6-7 5Z" />
          </g>
          <g transform="matrix(1 .22 0 1 94 86)">
            <path d="M0 0h14v25l-7-6-7 5Z" />
          </g>
        </g>
      </svg>
    ),
  },
};

export function PlanIllustration({ plan }: { plan: PublicPlan['code'] }) {
  const { file, overlay } = artwork[plan];
  return (
    <div className="pricing-art" aria-hidden="true">
      <Image
        src={`/lecture-demo/pricing-${file}.webp`}
        alt=""
        width={112}
        height={96}
        unoptimized
      />
      {overlay}
    </div>
  );
}
