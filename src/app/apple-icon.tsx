import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: 'center',
          background: '#0066D6',
          color: '#FFFFFF',
          display: 'flex',
          fontFamily: 'Arial, sans-serif',
          fontSize: 62,
          fontWeight: 700,
          height: '100%',
          justifyContent: 'center',
          letterSpacing: -4,
          width: '100%',
        }}
      >
        LV
      </div>
    ),
    size,
  );
}
