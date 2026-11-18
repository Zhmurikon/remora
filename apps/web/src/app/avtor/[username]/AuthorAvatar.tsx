'use client';

import Image from 'next/image';
import { useState } from 'react';

export function AuthorAvatar({ name, src }: { name: string; src: string | null }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <div className="public-author-avatar" aria-hidden="true">
      {src && src !== failedSrc ? (
        <Image
          src={src}
          alt=""
          width={112}
          height={112}
          unoptimized
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span>{name.replace(/^@/, '').slice(0, 1).toLocaleUpperCase('ru-RU')}</span>
      )}
    </div>
  );
}
