import { ImageResponse } from 'next/og';

export const alt = 'Remora — карточки для заучивания';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: 'center',
        background: '#f4f7fb',
        color: '#15243a',
        display: 'flex',
        height: '100%',
        justifyContent: 'center',
        padding: 80,
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 960 }}>
        <div style={{ color: '#2764d8', fontSize: 38, fontWeight: 700 }}>Remora</div>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.08 }}>
          Учитесь по карточкам и запоминайте надолго
        </div>
        <div style={{ color: '#506176', fontSize: 32 }}>Интервальные повторения на основе FSRS</div>
      </div>
    </div>,
    size,
  );
}
