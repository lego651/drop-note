import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0f0f0f',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            color: '#ffffff',
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 1.1,
          }}
        >
          drop-note
        </div>
        <div
          style={{
            color: '#a0a0a0',
            fontSize: 32,
            marginTop: 20,
          }}
        >
          Save anything from anywhere
        </div>
        <div
          style={{
            color: '#555555',
            fontSize: 20,
            marginTop: 'auto',
          }}
        >
          dropnote.me · Free · Open source (AGPL-3.0)
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
