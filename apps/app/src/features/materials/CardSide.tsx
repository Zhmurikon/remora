import { CardContent } from '@remora/ui';
import { useQuery } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import { api } from '../../lib/api';

export function CardSide({
  imageId,
  imageAlt,
  ...content
}: ComponentProps<typeof CardContent> & { imageId?: string | null; imageAlt: string }) {
  const image = useQuery({
    queryKey: ['media', imageId],
    enabled: Boolean(imageId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/media/{asset_id}', {
        params: { path: { asset_id: imageId! } },
      });
      if (error || !data) throw new Error();
      return data;
    },
    staleTime: 30 * 60 * 1000,
  });
  return <CardContent {...content} imageUrl={image.data?.download_url} imageAlt={imageAlt} />;
}
