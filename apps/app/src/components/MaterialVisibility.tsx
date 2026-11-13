import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useCanHideMaterials() {
  const query = useQuery({
    queryKey: ['billing-entitlements'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/billing/entitlements');
      if (error || !data) throw new Error('Не удалось загрузить возможности подписки');
      return data;
    },
  });
  return query.data?.features?.['materials.private'] === true;
}

export function MaterialVisibility({
  label,
  isPublic,
  canHide,
  onChange,
  disabled,
}: {
  label: string;
  isPublic: boolean;
  canHide: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select
        className="border-border bg-surface text-fg mt-1 block min-h-11 w-full rounded-lg border px-3"
        value={isPublic ? 'public' : 'private'}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value === 'public')}
      >
        <option value="public">Публичный доступ (рекомендуем)</option>
        <option value="private" disabled={!canHide}>
          Только мне · Plus и Pro
        </option>
      </select>
    </label>
  );
}
