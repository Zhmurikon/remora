import { CardFace, type CardFaceProps } from '@remora/ui';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function CardSide({ imageId, ...content }: CardFaceProps & { imageId?: string | null }) {
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
  return <CardFace {...content} imageUrl={image.data?.download_url} />;
}
