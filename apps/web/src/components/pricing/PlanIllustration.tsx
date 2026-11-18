import Image from 'next/image';
import type { PublicPlan } from '../../lib/pricing';

const artwork = { free: 'cards', plus: 'notebook', pro: 'books' };

export function PlanIllustration({ plan }: { plan: PublicPlan['code'] }) {
  return (
    <div className="pricing-art" aria-hidden="true">
      <Image
        src={`/lecture-demo/pricing-${artwork[plan]}.webp`}
        alt=""
        width={67}
        height={54}
        unoptimized
      />
    </div>
  );
}
