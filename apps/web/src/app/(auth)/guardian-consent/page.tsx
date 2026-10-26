import { Suspense } from 'react';
import { GuardianConsent } from '../../../components/auth/GuardianConsent';

export default function GuardianConsentPage() {
  return (
    <Suspense fallback={<p className="text-fg-muted">Проверяем ссылку…</p>}>
      <GuardianConsent />
    </Suspense>
  );
}
