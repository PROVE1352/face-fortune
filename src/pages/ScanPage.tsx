import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Howl } from 'howler';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { Intensity, FaceMetrics, FortuneResult } from '../types';
import { detectFace, calculateMetrics } from '../lib/faceAnalysis';
import { generateFortune } from '../lib/fortuneApi';

// BGM per intensity
const BGM_SRC: Record<Intensity, string> = {
  warm: '/assets/audio/warm.mp3',
  normal: '/assets/audio/normal.mp3',
  brutal: '/assets/audio/brutal.mp3',
};

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

const LOADING_TEXTS: Record<Intensity, string[]> = {
  warm: [
    '따뜻한 기운을 감지하는 중...',
    '눈썹에서 부드러운 봄바람이...',
    '코끝에서 행운의 꽃향기가...',
    '입꼬리에서 미소의 기운을 읽는 중...',
    '이마에서 지혜의 빛이 감지됩니다...',
    '얼굴에서 복덩이 기운이 느껴져요...',
    '눈빛에서 따뜻한 카리스마가...',
    '광대뼈에서 행복의 기운이...',
    '턱선에서 인복의 기운을 읽는 중...',
    '미간에서 여유로움이 감지됩니다...',
    '피부에서 건강운이 빛나고 있어요...',
    '얼굴 전체에서 평화의 기운이...',
    '눈가 주름에서 웃음의 흔적을 발견...',
    '귀 모양에서 재물운을 읽는 중...',
    '코 끝에서 연애운이 피어납니다...',
    '관상학적으로 매우 복된 기운...',
    '당신의 미소가 분석기를 행복하게 해요...',
    '얼굴 대칭에서 조화를 발견 중...',
    '이목구비에서 귀인운이 보입니다...',
    '분석 중... 좋은 결과가 나올 것 같아요 ✨',
  ],
  normal: [
    '얼굴 기운을 감지하는 중...',
    '눈썹에서 강한 의심의 기운이...',
    '코에서 재물운을 읽는 중...',
    '입꼬리 각도 분석 완료. 결과가 심각합니다...',
    '미간 거리에서 운명의 실마리를...',
    '좌우 대칭도를 계산하는 중...',
    '별자리와 관상을 대조하는 중...',
    '관상학 데이터베이스 검색 중...',
    '468개 포인트에서 기운을 읽는 중...',
    '눈동자에서 숨겨진 야망을 감지...',
    '이마 넓이로 지능을 추정하는 중...',
    '코 길이와 자존심의 상관관계 분석 중...',
    '턱선에서 의지력을 측정하는 중...',
    '귀 위치에서 창의성을 읽는 중...',
    '인중 길이로 수명을 점치는 중...',
    '눈꼬리 각도에서 연애운을 해석 중...',
    '광대뼈에서 사회성을 분석하는 중...',
    '얼굴형에서 성격 유형을 추론하는 중...',
    '관상의 비밀이 서서히 드러납니다...',
    '운세 데이터를 종합하는 중...',
  ],
  brutal: [
    '운명의 심판을 준비하는 중...',
    '눈썹에서 불길한 기운이 감지됩니다...',
    '코에서 파산의 징조를 읽는 중...',
    '입꼬리 각도... 이건 좀 심각한데...',
    '이마에서 고난의 기운이 폭발하고 있습니다...',
    '대칭도 분석 결과가 처참합니다...',
    '관상학적으로 전례 없는 케이스입니다...',
    '도망치기엔 이미 늦었습니다...',
    '분석기가 잠시 멈칫했습니다...',
    '눈빛에서 깊은 고독이 읽힙니다...',
    '코 비율이... 말을 아끼겠습니다...',
    '미간에서 스트레스 지수 999 감지...',
    '턱선에서 고집의 화석이 발견되었습니다...',
    '관상학 AI가 울고 있습니다...',
    '이 얼굴은 교과서에 실릴 예정입니다...',
    '눈꼬리에서 야근의 기운이 폭발 중...',
    '분석기가 정신적 데미지를 입었습니다...',
    '얼굴에서 만우절의 기운이...',
    '피해자(분석기)가 증거를 수집하는 중...',
    '이 관상은 역사에 기록될 것입니다...',
  ],
};

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
  const [loadingText, setLoadingText] = useState('');

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
  // BGM: play on mount, stop on unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!state?.selfieDataUrl || !state?.intensity) return;
    const bgm = new Howl({
      src: [BGM_SRC[intensity]],
      loop: true,
      volume: 0.5,
    });
    bgm.play();

    // 극딜: 볼륨 점점 올리기
    let volInterval: ReturnType<typeof setInterval> | undefined;
    if (intensity === 'brutal') {
      let vol = 0.3;
      bgm.volume(vol);
      volInterval = setInterval(() => {
        vol = Math.min(vol + 0.03, 0.8);
        bgm.volume(vol);
        if (vol >= 0.8) clearInterval(volInterval);
      }, 500);
    }

    return () => {
      bgm.fade(bgm.volume(), 0, 500);
      setTimeout(() => bgm.unload(), 600);
      if (volInterval) clearInterval(volInterval);
    };
  }, [intensity, state]);

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

      // --- Start loading text rotation (shuffled per intensity) ---
      const texts = [...LOADING_TEXTS[intensity]].sort(() => Math.random() - 0.5);
      let textIdx = 0;
      setLoadingText(texts[0]);
      textTimer = setInterval(() => {
        if (cancelled) return;
        textIdx = (textIdx + 1) % texts.length;
        setLoadingText(texts[textIdx]);
      }, TEXT_INTERVAL_MS);

      // --- API call in background (parallel with animation) ---
      let metricsResult: FaceMetrics | null = null;
      let fortuneResult: FortuneResult | null = null;

      const apiPromise = (async () => {
        try {
          if (landmarks) {
            metricsResult = calculateMetrics(landmarks);
          }
          // Send full data URL — server handles extraction
          const base64 = selfieDataUrl;
          if (!metricsResult) {
            throw new Error('얼굴을 감지하지 못했습니다');
          }
          fortuneResult = await generateFortune(base64, metricsResult, intensity);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error('Fortune API error:', errMsg);
          // Fallback so the user can still see a result
          if (!fortuneResult) {
            fortuneResult = {
              title: '\uBBF8\uC2A4\uD130\uB9AC \uAD00\uC0C1',
              faceReport: '\uC5BC\uAD74 \uBD84\uC11D\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.',
              readingText: `API 응답을 받지 못했습니다: ${errMsg}`,
              fortuneText: '\uC624\uB298\uC740 \uC7AC\uC2DC\uB3C4\uAC00 \uD589\uC6B4\uC744 \uBD80\uB974\uB294 \uB0A0\uC785\uB2C8\uB2E4.',
              luckyDirection: '\uB3D9\uCABD',
              cardQuote: '\uC774 \uC5BC\uAD74\uC5D0\uB294 \uC228\uACA8\uC9C4 \uC774\uC57C\uAE30\uAC00 \uC788\uB2E4.',
              visualRoast: '',
            };
          }
        }
      })();

      // --- Draw landmark points in batches ---
      // Progress: 0-60% = landmark animation, 60-90% = fake progress while waiting API, 100% = done
      const totalLandmarks = landmarks?.length ?? 0;
      let batchIdx = 0;
      const totalBatches = Math.ceil(totalLandmarks / BATCH_SIZE);
      let apiDone = false;

      apiPromise.then(() => { apiDone = true; });

      function drawNextBatch() {
        if (cancelled || !landmarks) return;

        const start = batchIdx * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, totalLandmarks);
        drawLandmarkBatch(ctx, landmarks, start, end, canvas!.width, canvas!.height);

        batchIdx++;
        // Landmark phase: 0% → 60%
        const pct = Math.min(Math.round((batchIdx / totalBatches) * 60), 60);
        setProgress(pct);

        if (batchIdx < totalBatches) {
          batchTimer = setTimeout(drawNextBatch, BATCH_INTERVAL_MS);
        } else {
          // Landmarks done → start fake progress while waiting for API
          startWaitingProgress();
        }
      }

      // Fake progress 60% → 90% while API is pending, then jump to 100% when done
      function startWaitingProgress() {
        let fakePct = 60;
        const fakeInterval = setInterval(() => {
          if (cancelled) { clearInterval(fakeInterval); return; }
          if (apiDone) {
            clearInterval(fakeInterval);
            setProgress(100);
            setLoadingText('관상 분석 완료!');
            // Brief pause then navigate
            setTimeout(() => {
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
            }, 600);
          } else {
            // Slowly crawl toward 90%
            fakePct = Math.min(fakePct + 1, 90);
            setProgress(fakePct);
          }
        }, 300);

        // Store for cleanup
        batchTimer = fakeInterval as unknown as ReturnType<typeof setTimeout>;
      }

      if (totalLandmarks > 0) {
        batchTimer = setTimeout(drawNextBatch, 300);
      } else {
        // No face detected -- start waiting progress immediately
        startWaitingProgress();
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
            key={loadingText}
          >
            {loadingText}
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
