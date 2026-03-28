import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import type { Intensity, FaceMetrics, FortuneResult } from '../types';
import { renderTarotCard, downloadCard, shareCard } from '../lib/cardRenderer';

// ---------------------------------------------------------------------------
// Accent colour per intensity
// ---------------------------------------------------------------------------

const ACCENT: Record<Intensity, string> = {
  warm: '#FFB7C5',
  normal: '#9B59B6',
  brutal: '#E74C3C',
};

const ACCENT_GLOW: Record<Intensity, string> = {
  warm: 'rgba(255, 183, 197, 0.35)',
  normal: 'rgba(155, 89, 182, 0.35)',
  brutal: 'rgba(231, 76, 60, 0.35)',
};

const ACCENT_BG: Record<Intensity, string> = {
  warm: 'rgba(255, 183, 197, 0.08)',
  normal: 'rgba(155, 89, 182, 0.08)',
  brutal: 'rgba(231, 76, 60, 0.08)',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResultState {
  metrics: FaceMetrics;
  result: FortuneResult;
  selfieDataUrl: string;
  intensity: Intensity;
}

// ---------------------------------------------------------------------------
// Helper: individual metric display config
// ---------------------------------------------------------------------------

interface MetricRow {
  label: string;
  value: string;
  bar?: number; // 0..1 for a visual bar
}

function buildMetricRows(m: FaceMetrics): MetricRow[] {
  return [
    {
      label: '\uC88C\uC6B0 \uB300\uCE6D\uB3C4',
      value: `${(m.faceSymmetry * 100).toFixed(1)}%`,
      bar: m.faceSymmetry,
    },
    {
      label: '\uC5BC\uAD74 \uC885\uD6A1\uBE44',
      value: m.faceWidthHeightRatio.toFixed(3),
      bar: Math.min(m.faceWidthHeightRatio / 1.2, 1),
    },
    {
      label: '\uC67C\uCABD \uB208\uC369 \uAC01\uB3C4',
      value: `${m.leftEyebrowAngle.toFixed(1)}\u00B0`,
    },
    {
      label: '\uC624\uB978\uCABD \uB208\uC369 \uAC01\uB3C4',
      value: `${m.rightEyebrowAngle.toFixed(1)}\u00B0`,
    },
    {
      label: '\uB208\uC369 \uAC01\uB3C4 \uCC28\uC774',
      value: `${m.eyebrowAngleDiff.toFixed(1)}\u00B0`,
    },
    {
      label: '\uCF54 \uBE44\uC728',
      value: m.noseRatio.toFixed(3),
      bar: Math.min(m.noseRatio / 2, 1),
    },
    {
      label: '\uC785\uAF2C\uB9AC \uAC01\uB3C4',
      value: `${m.mouthCornerAngle.toFixed(1)}\u00B0`,
    },
    {
      label: '\uC774\uB9C8 \uBE44\uC728',
      value: `${(m.foreheadRatio * 100).toFixed(1)}%`,
      bar: m.foreheadRatio,
    },
    {
      label: '\uBBF8\uAC04 \uAC70\uB9AC',
      value: m.glabellaDistance.toFixed(4),
    },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as ResultState | null;

  const cardContainerRef = useRef<HTMLDivElement>(null);
  const cardCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cardReady, setCardReady] = useState(false);

  // Derived (safe before guard — uses fallback)
  const selfieDataUrl = state?.selfieDataUrl ?? '';
  const intensity: Intensity = state?.intensity ?? 'normal';
  const metrics = state?.metrics ?? null;
  const result = state?.result ?? null;
  const accent = ACCENT[intensity];
  const glow = ACCENT_GLOW[intensity];
  const bg = ACCENT_BG[intensity];

  // ---------------------------------------------------------------------------
  // Render tarot card into DOM
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!selfieDataUrl || !result || !metrics) return;
    let cancelled = false;

    (async () => {
      try {
        const canvas = await renderTarotCard({
          selfieImg: selfieDataUrl,
          result,
          intensity,
          metrics,
        });
        if (cancelled) return;

        cardCanvasRef.current = canvas;

        if (cardContainerRef.current) {
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.style.borderRadius = '12px';
          canvas.style.display = 'block';
          cardContainerRef.current.innerHTML = '';
          cardContainerRef.current.appendChild(canvas);
        }
        setCardReady(true);
      } catch (err) {
        console.error('Card render error:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selfieDataUrl, result, intensity, metrics]);

  // ---------------------------------------------------------------------------
  // Button handlers
  // ---------------------------------------------------------------------------
  const handleDownload = useCallback(() => {
    if (cardCanvasRef.current) downloadCard(cardCanvasRef.current);
  }, []);

  const handleShare = useCallback(async () => {
    try {
      if (cardCanvasRef.current) await shareCard(cardCanvasRef.current);
    } catch {
      // 사용자 취소 등 무시
    }
  }, []);

  const handleRetry = useCallback(() => {
    navigate('/camera');
  }, [navigate]);

  // Guard: redirect if no state (after all hooks)
  if (!state?.result || !state?.metrics || !state?.selfieDataUrl || !state?.intensity) {
    return <Navigate to="/" replace />;
  }

  // After guard, these are guaranteed non-null
  const safeResult = result!;
  const safeMetrics = metrics!;
  const metricRows = buildMetricRows(safeMetrics);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="page-enter relative flex flex-1 flex-col items-center px-4 pt-6 pb-10">
      {/* Fog */}
      <div className="fog" />

      {/* Content wrapper -- scrollable */}
      <div className="relative z-10 flex w-full max-w-sm flex-col gap-8">
        {/* ================================================================
            1. Tarot card
           ================================================================ */}
        <section className="flex flex-col items-center gap-3">
          {/* Card container */}
          <div
            ref={cardContainerRef}
            className="w-full overflow-hidden rounded-xl"
            style={{
              boxShadow: `0 4px 40px ${glow}, 0 0 80px ${glow.replace('0.35', '0.1')}`,
              border: `1px solid ${accent}33`,
              minHeight: 200,
              background: cardReady ? 'transparent' : `${bg}`,
            }}
          >
            {/* Placeholder while rendering */}
            {!cardReady && (
              <div
                className="flex h-60 items-center justify-center"
                style={{ color: `${accent}88` }}
              >
                <span className="animate-pulse text-sm tracking-wide">
                  카드 생성 중...
                </span>
              </div>
            )}
          </div>
        </section>

        {/* ================================================================
            2. 얼굴 분석 리포트
           ================================================================ */}
        <section>
          {/* Section header */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-lg">&#128208;</span>
            <h2
              className="text-base font-bold"
              style={{ color: accent, fontFamily: 'var(--font-serif-kr)' }}
            >
              얼굴 분석 리포트
            </h2>
          </div>

          {/* Divider */}
          <div className="mb-4 h-px w-full" style={{ background: `${accent}33` }} />

          {/* Metrics grid */}
          <div className="flex flex-col gap-3">
            {metricRows.map((row) => (
              <div key={row.label} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <span
                    className="text-[13px]"
                    style={{ color: 'var(--color-cream)' }}
                  >
                    {row.label}
                  </span>
                  <span
                    className="font-mono text-[13px] tabular-nums"
                    style={{ color: accent }}
                  >
                    {row.value}
                  </span>
                </div>

                {row.bar != null && (
                  <div
                    className="h-1 w-full overflow-hidden rounded-full"
                    style={{ backgroundColor: `${accent}14` }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round(row.bar * 100)}%`,
                        background: `linear-gradient(90deg, ${accent}66, ${accent})`,
                        boxShadow: `0 0 6px ${accent}44`,
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ================================================================
            3. 관상 해석
           ================================================================ */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <span className="text-lg">&#128302;</span>
            <h2
              className="text-base font-bold"
              style={{ color: accent, fontFamily: 'var(--font-serif-kr)' }}
            >
              관상 해석
            </h2>
          </div>

          <div className="mb-4 h-px w-full" style={{ background: `${accent}33` }} />

          <div
            className="rounded-xl p-4"
            style={{
              background: bg,
              border: `1px solid ${accent}22`,
            }}
          >
            <p
              className="whitespace-pre-line text-sm leading-relaxed"
              style={{
                color: 'var(--color-cream)',
                fontFamily: 'var(--font-batang)',
              }}
            >
              {safeResult.readingText}
            </p>
          </div>
        </section>

        {/* ================================================================
            4. 오늘의 운세
           ================================================================ */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <span className="text-lg">&#127919;</span>
            <h2
              className="text-base font-bold"
              style={{ color: accent, fontFamily: 'var(--font-serif-kr)' }}
            >
              오늘의 운세
            </h2>
          </div>

          <div className="mb-4 h-px w-full" style={{ background: `${accent}33` }} />

          <div
            className="rounded-xl p-4"
            style={{
              background: bg,
              border: `1px solid ${accent}22`,
            }}
          >
            <p
              className="whitespace-pre-line text-sm leading-relaxed"
              style={{
                color: 'var(--color-cream)',
                fontFamily: 'var(--font-batang)',
              }}
            >
              {safeResult.fortuneText}
            </p>
          </div>

          {/* Lucky direction */}
          {safeResult.luckyDirection && (
            <p
              className="mt-3 text-center text-sm"
              style={{ color: accent }}
            >
              &#129517; 행운의 방향: {safeResult.luckyDirection}
            </p>
          )}
        </section>

        {/* ================================================================
            5. Bottom divider
           ================================================================ */}
        <div
          className="h-px w-full"
          style={{ background: `${accent}22` }}
        />

        {/* ================================================================
            6. Action buttons
           ================================================================ */}
        <div className="flex gap-3">
          <button
            className="result-action-btn flex-1"
            style={{
              '--btn-accent': accent,
              '--btn-bg': bg,
            } as React.CSSProperties}
            onClick={handleDownload}
            disabled={!cardReady}
          >
            <span className="text-base">&#128190;</span>
            <span>저장</span>
          </button>

          <button
            className="result-action-btn flex-1"
            style={{
              '--btn-accent': accent,
              '--btn-bg': bg,
            } as React.CSSProperties}
            onClick={handleShare}
            disabled={!cardReady}
          >
            <span className="text-base">&#128228;</span>
            <span>공유</span>
          </button>

          <button
            className="result-action-btn flex-1"
            style={{
              '--btn-accent': accent,
              '--btn-bg': bg,
            } as React.CSSProperties}
            onClick={handleRetry}
          >
            <span className="text-base">&#128260;</span>
            <span>다시하기</span>
          </button>
        </div>
      </div>

    </div>
  );
}
