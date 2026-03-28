import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
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
      label: '좌우 대칭도',
      value: `${(m.faceSymmetry * 100).toFixed(1)}%`,
      bar: m.faceSymmetry,
    },
    {
      label: '얼굴 종횡비',
      value: m.faceWidthHeightRatio.toFixed(3),
      bar: Math.min(m.faceWidthHeightRatio / 1.2, 1),
    },
    {
      label: '왼쪽 눈썹 각도',
      value: `${m.leftEyebrowAngle.toFixed(1)}\u00B0`,
    },
    {
      label: '오른쪽 눈썹 각도',
      value: `${m.rightEyebrowAngle.toFixed(1)}\u00B0`,
    },
    {
      label: '눈썹 각도 차이',
      value: `${m.eyebrowAngleDiff.toFixed(1)}\u00B0`,
    },
    {
      label: '코 비율',
      value: m.noseRatio.toFixed(3),
      bar: Math.min(m.noseRatio / 2, 1),
    },
    {
      label: '입꼬리 각도',
      value: `${m.mouthCornerAngle.toFixed(1)}\u00B0`,
    },
    {
      label: '이마 비율',
      value: `${(m.foreheadRatio * 100).toFixed(1)}%`,
      bar: m.foreheadRatio,
    },
    {
      label: '미간 거리',
      value: m.glabellaDistance.toFixed(4),
    },
  ];
}

// ---------------------------------------------------------------------------
// Confetti burst for card flip
// ---------------------------------------------------------------------------

function fireFlipConfetti(intensity: Intensity) {
  const base = {
    origin: { x: 0.5, y: 0.5 },
    gravity: 0.6,
    ticks: 120,
    disableForReducedMotion: true,
  };

  if (intensity === 'warm') {
    confetti({
      ...base,
      particleCount: 60,
      shapes: ['circle'],
      colors: ['#FFB7C5', '#FFF0F5', '#FFD700', '#FFC0CB'],
      spread: 140,
      scalar: 0.9,
    });
  } else if (intensity === 'brutal') {
    confetti({
      ...base,
      particleCount: 50,
      shapes: ['circle'],
      colors: ['#E74C3C', '#FF6347', '#FF4500', '#8B0000', '#FFD700'],
      spread: 100,
      scalar: 1.1,
      startVelocity: 35,
    });
  } else {
    // normal — starlight burst
    confetti({
      ...base,
      particleCount: 70,
      shapes: ['star', 'circle'],
      colors: ['#D4AF37', '#9B59B6', '#E8D5B7', '#C4B5FD', '#FFFFFF'],
      spread: 160,
      scalar: 1,
      startVelocity: 30,
    });
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as ResultState | null;

  const cardCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const [cardDataUrl, setCardDataUrl] = useState<string | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);

  // Derived (safe before guard — uses fallback)
  const selfieDataUrl = state?.selfieDataUrl ?? '';
  const intensity: Intensity = state?.intensity ?? 'normal';
  const metrics = state?.metrics ?? null;
  const result = state?.result ?? null;
  const accent = ACCENT[intensity];
  const glow = ACCENT_GLOW[intensity];
  const bg = ACCENT_BG[intensity];

  // ---------------------------------------------------------------------------
  // Render tarot card into canvas
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
        setCardDataUrl(canvas.toDataURL('image/png'));
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
  // 3D flip trigger — 1.5s after card image is ready
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!cardReady) return;
    const timer = setTimeout(() => {
      setIsFlipped(true);
      // fire confetti slightly after flip starts
      setTimeout(() => fireFlipConfetti(intensity), 400);
    }, 1500);
    return () => clearTimeout(timer);
  }, [cardReady, intensity]);

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
            Title badge
           ================================================================ */}
        <div
          className="result-stagger result-title-badge text-2xl"
          style={{
            color: accent,
            animationDelay: '0.2s',
            textShadow: `0 0 20px ${glow}`,
          }}
        >
          {safeResult.title}
        </div>

        {/* ================================================================
            1. Tarot card — 3D flip
           ================================================================ */}
        <section
          className="result-stagger flex flex-col items-center"
          style={{ animationDelay: '0.4s' }}
        >
          <div className="tarot-scene">
            <div className={`tarot-card${isFlipped ? ' flipped' : ''}`}>
              {/* --- BACK face (default visible) --- */}
              <div className="tarot-face tarot-back">
                <div className="tarot-back-glow" />
                <div className="tarot-back-corner tl" />
                <div className="tarot-back-corner tr" />
                <div className="tarot-back-corner bl" />
                <div className="tarot-back-corner br" />
                <span className="tarot-back-sub">FORTUNE AWAITS</span>
                <span className="tarot-back-symbol">{'\u2726'}</span>
                <span className="tarot-back-title">AI 관상 타로</span>
                <span className="tarot-back-sub">{'\u2500\u2500 \u2726 \u2726 \u2726 \u2500\u2500'}</span>
              </div>

              {/* --- FRONT face (visible after flip) --- */}
              <div className="tarot-face tarot-front">
                {cardDataUrl ? (
                  <img
                    src={cardDataUrl}
                    alt="타로카드 결과"
                    className="block w-full rounded-2xl"
                    style={{
                      boxShadow: `0 4px 40px ${glow}, 0 0 80px ${glow.replace('0.35', '0.12')}`,
                    }}
                  />
                ) : (
                  <div
                    className="flex aspect-[2/3] items-center justify-center rounded-2xl"
                    style={{
                      background: bg,
                      border: `1px solid ${accent}33`,
                      color: `${accent}88`,
                    }}
                  >
                    <span className="animate-pulse text-sm tracking-wide">
                      카드 생성 중...
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
            2. 얼굴 분석 리포트
           ================================================================ */}
        <section
          className="result-stagger result-section-card"
          style={{
            '--section-accent': accent,
            animationDelay: '0.6s',
          } as React.CSSProperties}
        >
          <div className="result-section-header" style={{ color: accent }}>
            <span className="text-lg">{'\uD83D\uDCD0'}</span>
            <h2>얼굴 분석 리포트</h2>
          </div>

          <div className="result-section-divider" style={{ '--section-accent': `${accent}55` } as React.CSSProperties} />

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
                    className="metric-bar-track"
                    style={{ backgroundColor: `${accent}14` }}
                  >
                    <div
                      className="metric-bar-fill"
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
        <section
          className="result-stagger result-section-card"
          style={{
            '--section-accent': accent,
            animationDelay: '0.8s',
          } as React.CSSProperties}
        >
          <div className="result-section-header" style={{ color: accent }}>
            <span className="text-lg">{'\uD83D\uDD2E'}</span>
            <h2>관상 해석</h2>
          </div>

          <div className="result-section-divider" style={{ '--section-accent': `${accent}55` } as React.CSSProperties} />

          <div
            className="rounded-xl p-4"
            style={{
              background: `linear-gradient(135deg, ${bg}, transparent)`,
              border: `1px solid ${accent}15`,
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
        <section
          className="result-stagger result-section-card"
          style={{
            '--section-accent': accent,
            animationDelay: '1.0s',
          } as React.CSSProperties}
        >
          <div className="result-section-header" style={{ color: accent }}>
            <span className="text-lg">{'\uD83C\uDFAF'}</span>
            <h2>오늘의 운세</h2>
          </div>

          <div className="result-section-divider" style={{ '--section-accent': `${accent}55` } as React.CSSProperties} />

          <div
            className="rounded-xl p-4"
            style={{
              background: `linear-gradient(135deg, ${bg}, transparent)`,
              border: `1px solid ${accent}15`,
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
              className="mt-4 text-center text-sm"
              style={{
                color: accent,
                fontFamily: 'var(--font-batang)',
                textShadow: `0 0 8px ${glow}`,
              }}
            >
              {'\uD83E\uDDED'} 행운의 방향: {safeResult.luckyDirection}
            </p>
          )}
        </section>

        {/* ================================================================
            5. Bottom divider — decorative
           ================================================================ */}
        <div
          className="result-stagger h-px w-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${accent}33, transparent)`,
            animationDelay: '1.2s',
          }}
        />

        {/* ================================================================
            6. Action buttons
           ================================================================ */}
        <div
          className="result-stagger flex gap-3"
          style={{ animationDelay: '1.3s' }}
        >
          <button
            className="result-action-btn flex-1"
            style={{
              '--btn-accent': accent,
              '--btn-bg': bg,
            } as React.CSSProperties}
            onClick={handleDownload}
            disabled={!cardReady}
          >
            <span className="text-base">{'\uD83D\uDCBE'}</span>
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
            <span className="text-base">{'\uD83D\uDCE4'}</span>
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
            <span className="text-base">{'\uD83D\uDD04'}</span>
            <span>다시하기</span>
          </button>
        </div>
      </div>
    </div>
  );
}
