'use client';

import { CardContent, type CardContentType } from '@remora/ui';

export function PublicCardContent({
  value,
  type,
  codeLanguage,
  imageUrl,
  imageAlt,
  className,
}: {
  value: string;
  type: CardContentType;
  codeLanguage: string | null;
  imageUrl: string | null;
  imageAlt: string;
  className?: string;
}) {
  return (
    <CardContent
      value={value}
      type={type}
      codeLanguage={codeLanguage}
      imageUrl={imageUrl}
      imageAlt={imageAlt}
      className={className}
    />
  );
}
