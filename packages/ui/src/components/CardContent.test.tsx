import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CardContent } from './CardContent';

describe('CardContent', () => {
  it('рендерит формулу внутри обычного текста', async () => {
    const { container } = render(
      <CardContent value={String.raw`Почему $Q_1$ меньше $Q_3$?`} type="text" />,
    );

    expect(container.textContent).toContain('Почему');
    await waitFor(() =>
      expect(container.querySelectorAll('.rm-formula-inline .katex')).toHaveLength(2),
    );
  });

  it('рендерит блочную формулу внутри обычного текста', async () => {
    const { container } = render(
      <CardContent
        value={String.raw`Межквартильный размах:

$$IQR = Q_3 - Q_1$$`}
        type="text"
      />,
    );

    expect(container.textContent).toContain('Межквартильный размах');
    await waitFor(() => expect(container.querySelector('.rm-formula .katex')).not.toBeNull());
  });

  it('не принимает цену за формулу', () => {
    const { container } = render(<CardContent value="Цена 5$ и 10$ за штуку" type="text" />);

    expect(container.querySelector('.katex')).toBeNull();
    expect(container.textContent).toContain('5$');
  });
});
