import { useId } from 'react';

export function PricingActionInk({ label }: { label: string }) {
  const maskId = useId();
  return (
    <svg className="pricing-action-ink" aria-hidden="true" focusable="false">
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
          <svg width="100%" height="100%" viewBox="0 0 220 48" preserveAspectRatio="none">
            <path
              pathLength="1"
              d="M-10 7L230 -3L-10 20L230 9L-10 32L230 21L-10 44L230 33L-10 57L230 45"
            />
          </svg>
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        <rect width="100%" height="100%" />
        <foreignObject width="100%" height="100%">
          <div className="ink-label">{label}</div>
        </foreignObject>
      </g>
    </svg>
  );
}
