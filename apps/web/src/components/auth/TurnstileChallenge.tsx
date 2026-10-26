'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';

declare global {
  interface Window {
    remoraTurnstileDone?: (token: string) => void;
  }
}

export function TurnstileChallenge({ onToken }: { onToken: (token: string) => void }) {
  const [nonce, setNonce] = useState<string>();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    setNonce(document.body.dataset.cspNonce);
    window.remoraTurnstileDone = onToken;
    return () => {
      delete window.remoraTurnstileDone;
    };
  }, [onToken]);

  if (!siteKey) {
    return <p className="text-danger text-sm">Проверка CAPTCHA временно недоступна.</p>;
  }
  return (
    <div className="min-h-16" aria-label="Проверка CAPTCHA">
      {nonce && (
        <Script
          nonce={nonce}
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
        />
      )}
      <div
        className="cf-turnstile"
        data-sitekey={siteKey}
        data-callback="remoraTurnstileDone"
        data-language="ru"
      />
    </div>
  );
}
