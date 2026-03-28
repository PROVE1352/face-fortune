import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { Intensity, FaceMetrics, FortuneResult } from '../types';
import { detectFace, calculateMetrics } from '../lib/faceAnalysis';
import { generateFortune } from '../lib/fortuneApi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INTENSITY_COLORS: Record<Intensity, string> = {
  warm: '#FFB7C5',
  normal: '#9B59B6',
  brutal: '#E74C3C',
};

const INTENSITY_GLOW: Record<Intensity, string> = {
  warm: 'rgba(255, 183, 197, 0.6)',
  normal: 'rgba(155, 89, 182, 0.6)',
  brutal: 'rgba(231, 76, 60, 0.6)',
};

const LOADING_TEXTS = [
  '\uC5BC\uAD74 \uAE30\uC6B4\uC744 \uAC10\uC9C0\uD558\uB294 \uC911...',
  '\uB208\uC369\uC5D0\uC11C \uAC15\uD55C \uC758\uC2EC\uC758 \uAE30\uC6B4\uC774...',
  '\uCF54\uC5D0\uC11C \uC7AC\uBB3C\uC6B4\uC744 \uC77D\uB294 \uC911...',
  '\uC785\uAF2C\uB9AC \uAC01\uB3C4 \uBD84\uC11D \uC644\uB8CC. \uACB0\uACFC\uAC00 \uC2EC\uAC01\uD569\uB2C8\uB2E4...',
];

const BATCH_SIZE = 20;
const BATCH_INTERVAL_MS = 50;
const TEXT_INTERVAL_MS = 1200;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScanState {
  selfieDataUrl: string;
  intensity: Intensity;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScanPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as ScanState | null;

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const scanLineRef = useRef<HTMLDivElement>(null);

  // State
  const [progress, setProgress] = useState(0);
  const [loadingTextIdx, setLoadingTextIdx] = useState(0);

  // Derived (safe before guard — uses fallback)
  const selfieDataUrl = state?.selfieDataUrl ?? '';
  const intensity: Intensity = state?.intensity ?? 'normal';
  const accentColor = INTENSITY_COLORS[intensity];
  const glowColor = INTENSITY_GLOW[intensity];

  // ---------------------------------------------------------------------------
  // Draw landmarks in batches on canvas
  // ---------------------------------------------------------------------------
  const drawLandmarkBatch = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      landmarks: NormalizedLandmark[],
      startIdx: number,
      endIdx: number,
      canvasW: number,
      canvasH: number,
    ) => {
      const pointColor = INTENSITY_COLORS[intensity];

      for (let i = startIdx; i < endIdx && i < landmarks.length; i++) {
        const lm = landmarks[i];
        const x = lm.x * canvasW;
        const y = lm.y * canvasH;

        // Outer glow
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle =
          intensity === 'brutal'
            ? `rgba(231, 76, 60, ${0.15 + Math.random() * 0.15})`
            : intensity === 'warm'
              ? `rgba(255, 183, 197, ${0.2 + Math.random() * 0.1})`
              : `rgba(155, 89, 182, ${0.2 + Math.random() * 0.1})`;
        ctx.fill();

        // Core point
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = pointColor;
        ctx.fill();
      }
    },
    [intensity],
  );

  // ---------------------------------------------------------------------------
  // Main effect: run analysis + animation concurrently
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Guard: skip effect if no valid state
    if (!state?.selfieDataUrl || !state?.intensity) return;
    let cancelled = false;
    let batchTimer: ReturnType<typeof setTimeout>;
    let textTimer: ReturnType<typeof setInterval>;
    let scanRafId: number;

    async function run() {
      const img = imageRef.current;
      const canvas = canvasRef.current;
      if (!img || !canvas) return;

      // Wait for image load
      await new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth > 0) {
          resolve();
        } else {
          img.onload = () => resolve();
        }
      });

      if (cancelled) return;

      // Size canvas to match the displayed image
      const rect = img.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext('2d')!;

      // --- Detect face landmarks ---
      const landmarks = await detectFace(img);
      if (cancelled) return;

      // --- Start scan line sweep (rAF + direct DOM, no React re-render) ---
      const scanHeight = rect.height;
      let scanY = 0;
      function animateScanLine() {
        if (cancelled) return;
        scanY += 1.5;
        if (scanY > scanHeight) scanY = 0;
        if (scanLineRef.current) {
          scanLineRef.current.style.top = `${scanY}px`;
        }
        scanRafId = requestAnimationFrame(animateScanLine);
      }
      scanRafId = requestAnimationFrame(animateScanLine);

      // --- Start loading text rotation ---
      let textIdx = 0;
      textTimer = setInterval(() => {
        if (cancelled) return;
        textIdx = Math.min(textIdx + 1, LOADING_TEXTS.length - 1);
        setLoadingTextIdx(textIdx);
      }, TEXT_INTERVAL_MS);

      // --- API call in background (parallel with animation) ---
      let metricsResult: FaceMetrics | null = null;
      let fortuneResult: FortuneResult | null = null;

      const apiPromise = (async () => {
        try {
          if (landmarks) {
            metricsResult = calculateMetrics(landmarks);
          }
          const base64 = selfieDataUrl.includes(',')
            ? selfieDataUrl.split(',')[1]
            : selfieDataUrl;
          if (!metricsResult) {
            throw new Error('얼굴을 감지하지 못했습니다');
          }
          fortuneResult = await generateFortune(base64, metricsResult, intensity);
        } catch (err) {
          console.error('Fortune API error:', err);
          // Fallback so the user can still see a result
          if (!fortuneResult) {
            fortuneResult = {
              title: '\uBBF8\uC2A4\uD130\uB9AC \uAD00\uC0C1',
              faceReport: '\uC5BC\uAD74 \uBD84\uC11D\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.',
              readingText: 'API \uC751\uB2F5\uC744 \uBC1B\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.',
              fortuneText: '\uC624\uB298\uC740 \uC7AC\uC2DC\uB3C4\uAC00 \uD589\uC6B4\uC744 \uBD80\uB974\uB294 \uB0A0\uC785\uB2C8\uB2E4.',
              luckyDirection: '\uB3D9\uCABD',
              cardQuote: '\uC774 \uC5BC\uAD74\uC5D0\uB294 \uC228\uACA8\uC9C4 \uC774\uC57C\uAE30\uAC00 \uC788\uB2E4.',
              visualRoast: '',
            };
          }
        }
      })();

      // --- Draw landmark points in batches ---
      const totalLandmarks = landmarks?.length ?? 0;
      let batchIdx = 0;
      const totalBatches = Math.ceil(totalLandmarks / BATCH_SIZE);

      function drawNextBatch() {
        if (cancelled || !landmarks) return;

        const start = batchIdx * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, totalLandmarks);
        drawLandmarkBatch(ctx, landmarks, start, end, canvas!.width, canvas!.height);

        batchIdx++;
        const pct = Math.min(Math.round((batchIdx / totalBatches) * 100), 100);
        setProgress(pct);

        if (batchIdx < totalBatches) {
          batchTimer = setTimeout(drawNextBatch, BATCH_INTERVAL_MS);
        } else {
          onAnimationComplete();
        }
      }

      async function onAnimationComplete() {
        if (cancelled) return;

        setLoadingTextIdx(LOADING_TEXTS.length - 1);
        setProgress(100);

        // Wait for the API response
        await apiPromise;
        if (cancelled) return;

        // Brief dramatic pause at 100 %
        await new Promise((r) => setTimeout(r, 600));
        if (cancelled) return;

        navigate('/result', {
          state: {
            metrics: metricsResult,
            result: fortuneResult,
            selfieDataUrl,
            intensity,
          },
          replace: true,
        });
      }

      if (totalLandmarks > 0) {
        batchTimer = setTimeout(drawNextBatch, 300);
      } else {
        // No face detected -- still proceed after API finishes
        setProgress(100);
        onAnimationComplete();
      }
    }

    run();

    return () => {
      cancelled = true;
      clearTimeout(batchTimer);
      clearInterval(textTimer);
      cancelAnimationFrame(scanRafId);
    };
  }, [selfieDataUrl, intensity, navigate, drawLandmarkBatch, state]);

  // Guard: redirect if no state (after all hooks)
  if (!state?.selfieDataUrl || !state?.intensity) {
    return <Navigate to="/camera" replace />;
  }

  // ---------------------------------------------------------------------------
  // Scan line gradient varies by intensity
  // ---------------------------------------------------------------------------
  const scanLineGradient =
    intensity === 'brutal'
      ? `linear-gradient(90deg, transparent, ${accentColor}88, transparent)`
      : intensity === 'warm'
        ? `linear-gradient(90deg, transparent, #FFD70066, ${accentColor}88, transparent)`
        : `linear-gradient(90deg, transparent, ${accentColor}88, transparent)`;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="page-enter relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-8">
      {/* Fog */}
      <div className="fog" />

      {/* Ambient glow behind content */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse at 50% 30%, ${glowColor.replace('0.6', '0.07')}, transparent 60%),
            radial-gradient(ellipse at 20% 70%, rgba(13, 11, 30, 0.8), transparent 50%)
          `,
        }}
      />

      {/* Main content */}
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6">
        {/* ---- Image + Canvas overlay ---- */}
        <div
          className="relative w-full overflow-hidden rounded-xl"
          style={{
            boxShadow: `0 0 40px ${glowColor.replace('0.6', '0.18')}, 0 0 80px ${glowColor.replace('0.6', '0.06')}`,
            border: `1px solid ${accentColor}33`,
          }}
        >
          {/* Selfie */}
          <img
            ref={imageRef}
            src={selfieDataUrl}
            alt=""
            className="block w-full"
            crossOrigin="anonymous"
            style={{
              filter:
                intensity === 'brutal'
                  ? 'brightness(0.7) contrast(1.2) saturate(0.8)'
                  : intensity === 'warm'
                    ? 'brightness(1.05) saturate(1.1)'
                    : 'brightness(0.85) contrast(1.1)',
            }}
          />

          {/* Landmark canvas overlay */}
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />

          {/* Scan line — animated via ref, not state */}
          <div
            ref={scanLineRef}
            className="pointer-events-none absolute left-0 h-[2px] w-full"
            style={{
              top: 0,
              background: scanLineGradient,
              boxShadow: `0 0 12px ${accentColor}66, 0 0 24px ${accentColor}33`,
            }}
          />

          {/* Corner brackets */}
          <span
            className="pointer-events-none absolute top-2 left-2 block h-5 w-5"
            style={{ borderTop: `2px solid ${accentColor}77`, borderLeft: `2px solid ${accentColor}77` }}
          />
          <span
            className="pointer-events-none absolute top-2 right-2 block h-5 w-5"
            style={{ borderTop: `2px solid ${accentColor}77`, borderRight: `2px solid ${accentColor}77` }}
          />
          <span
            className="pointer-events-none absolute bottom-2 left-2 block h-5 w-5"
            style={{ borderBottom: `2px solid ${accentColor}77`, borderLeft: `2px solid ${accentColor}77` }}
          />
          <span
            className="pointer-events-none absolute bottom-2 right-2 block h-5 w-5"
            style={{ borderBottom: `2px solid ${accentColor}77`, borderRight: `2px solid ${accentColor}77` }}
          />

          {/* Vignette */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at center, transparent 50%, rgba(13, 11, 30, 0.65) 100%)',
            }}
          />
        </div>

        {/* ---- Loading text ---- */}
        <div className="min-h-[2.8rem] w-full text-center">
          <p
            className="scan-text-fade text-sm leading-relaxed tracking-wide"
            style={{
              color: 'var(--color-cream)',
              fontFamily: 'var(--font-serif-kr)',
              textShadow: `0 0 18px ${glowColor}`,
            }}
            key={loadingTextIdx}
          >
            {LOADING_TEXTS[loadingTextIdx]}
          </p>
        </div>

        {/* ---- Progress bar ---- */}
        <div className="w-full">
          {/* Label row */}
          <div className="mb-1.5 flex items-center justify-between">
            <span
              className="text-[11px] tracking-widest uppercase"
              style={{ color: `${accentColor}99` }}
            >
              Analyzing
            </span>
            <span
              className="font-mono text-[11px] tabular-nums"
              style={{ color: accentColor }}
            >
              {progress}%
            </span>
          </div>

          {/* Track */}
          <div
            className="h-1 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: `${accentColor}14` }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-150 ease-out"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${accentColor}77, ${accentColor})`,
                boxShadow: `0 0 8px ${accentColor}55`,
              }}
            />
          </div>
        </div>

        {/* Decorative pulsing dots */}
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block h-1 w-1 rounded-full"
              style={{
                backgroundColor: accentColor,
                opacity: 0.3 + (i === Math.floor(progress / 4) % 3 ? 0.7 : 0),
                transition: 'opacity 0.3s',
              }}
            />
          ))}
        </div>
      </div>

    </div>
  );
}
