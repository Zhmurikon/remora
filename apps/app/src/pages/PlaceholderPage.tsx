import { Card } from '@remora/ui';

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <Card className="mt-8 grid min-h-72 place-items-center text-center">
        <div>
          <p className="text-fg-muted max-w-md">{description}</p>
          <span className="text-fg-subtle mt-3 block text-sm">Раздел готовится</span>
        </div>
      </Card>
    </div>
  );
}
