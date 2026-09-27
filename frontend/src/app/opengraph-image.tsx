import { ImageResponse } from 'next/og';

// Image metadata exported so Next.js knows the dimensions and alt text
export const alt = 'NeuroWealth — AI-Powered DeFi Yield on Stellar';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#080b11',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Radial glow accent */}
        <div
          style={{
            position: 'absolute',
            top: '-160px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '900px',
            height: '600px',
            borderRadius: '50%',
            background:
              'radial-gradient(ellipse at center, rgba(16,185,129,0.25) 0%, rgba(16,185,129,0) 70%)',
          }}
        />

        {/* Logo + heading */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Logo mark */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, #10b981 0%, #0d9488 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 40px rgba(16,185,129,0.5)',
              }}
            >
              {/* Simple "N" glyph */}
              <span
                style={{
                  color: '#000',
                  fontSize: '40px',
                  fontWeight: 900,
                  lineHeight: 1,
                }}
              >
                N
              </span>
            </div>

            <span
              style={{
                color: '#fff',
                fontSize: '64px',
                fontWeight: 900,
                letterSpacing: '-2px',
                lineHeight: 1,
              }}
            >
              NeuroWealth
            </span>
          </div>

          {/* Tagline */}
          <p
            style={{
              color: '#94a3b8',
              fontSize: '28px',
              fontWeight: 400,
              letterSpacing: '0.5px',
              margin: 0,
            }}
          >
            AI-Powered DeFi Yield on Stellar
          </p>

          {/* APY badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              backgroundColor: 'rgba(16,185,129,0.15)',
              border: '1.5px solid rgba(16,185,129,0.4)',
              borderRadius: '50px',
              padding: '12px 32px',
              marginTop: '8px',
            }}
          >
            <span
              style={{
                color: '#10b981',
                fontSize: '32px',
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              ~8.5% APY
            </span>
            <span
              style={{
                color: '#64748b',
                fontSize: '20px',
                fontWeight: 400,
              }}
            >
              · Automatic rebalancing · No lock-ups
            </span>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: '0',
            left: '0',
            right: '0',
            height: '4px',
            background: 'linear-gradient(90deg, #10b981 0%, #0d9488 50%, #10b981 100%)',
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
