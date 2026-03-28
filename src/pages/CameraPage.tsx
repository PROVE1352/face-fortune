import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Intensity } from '../types';

const INTENSITY_CONFIG = {
  warm: {
    emoji: '\uD83C\uDF38',
    label: '훈훈',
    description: '따뜻한 칭찬과 함께 살짝 찔러봅니다',
    selectedClass: 'selected-warm',
  },
  normal: {
    emoji: '\uD83D\uDD25',
    label: '기본',
    description: '관상학의 정통 방식으로 읽어드립니다',
    selectedClass: 'selected-normal',
  },
  brutal: {
    emoji: '\uD83D\uDC80',
    label: '극딜',
    description: '자비 없는 팩폭. 감수하시겠습니까?',
    selectedClass: 'selected-brutal',
  },
} as const;

export default function CameraPage() {
  const navigate = useNavigate();

  const [intensity, setIntensity] = useState<Intensity>('normal');
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err) {
      console.error('Camera error:', err);
      setCameraError(`카메라에 접근할 수 없습니다: ${err instanceof Error ? err.message : '알 수 없는 오류'}. 사진 업로드를 이용해주세요.`);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Auto-start camera on mount
  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [startCamera]);

  // Capture selfie from video — resize to max 480px for faster API
  const captureSelfie = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const MAX_SIZE = 512;
    const ratio = Math.min(MAX_SIZE / video.videoWidth, MAX_SIZE / video.videoHeight, 1);
    canvas.width = Math.round(video.videoWidth * ratio);
    canvas.height = Math.round(video.videoHeight * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    setSelfieDataUrl(dataUrl);
  }, []);

  // Handle file upload
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        setSelfieDataUrl(reader.result as string);
        stopCamera();
      };
      reader.readAsDataURL(file);
    },
    [stopCamera],
  );

  // Reset selfie — stream is still alive, just show video again
  const resetSelfie = useCallback(() => {
    setSelfieDataUrl(null);
    // 스트림이 죽었으면 다시 시작
    if (!streamRef.current) {
      startCamera();
    }
  }, [startCamera]);

  // Navigate to scan — stop camera before leaving
  const handleAnalyze = useCallback(() => {
    if (!selfieDataUrl) return;
    stopCamera();
    navigate('/scan', { state: { selfieDataUrl, intensity } });
  }, [navigate, selfieDataUrl, intensity, stopCamera]);

  const currentConfig = INTENSITY_CONFIG[intensity];

  return (
    <div className="page-enter relative flex flex-1 flex-col px-5 pt-6 pb-8">
      <div className="fog" />

      <div className="relative z-10 flex flex-1 flex-col gap-6">
        {/* Header */}
        <div className="text-center">
          <h2
            className="text-xl font-bold"
            style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-serif-kr)' }}
          >
            관상 촬영
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-caption)' }}>
            얼굴이 잘 보이도록 정면을 바라봐주세요
          </p>
        </div>

        {/* Viewfinder */}
        <div className="viewfinder">
          {/* 비디오는 항상 렌더 — selfie가 있으면 숨김 */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              transform: 'scaleX(-1)',
              display: selfieDataUrl || !cameraActive ? 'none' : 'block',
            }}
          />
          {selfieDataUrl ? (
            <img src={selfieDataUrl} alt="촬영된 셀카" />
          ) : !cameraActive ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
              <div className="text-5xl opacity-40">&#128247;</div>
              <p className="text-sm" style={{ color: 'var(--color-caption)' }}>
                카메라를 활성화하거나 사진을 업로드하세요
              </p>
            </div>
          ) : null}
          <div className="viewfinder-border" />
        </div>

        {/* Camera controls */}
        <div className="flex gap-3">
          {selfieDataUrl ? (
            <button
              className="btn-gold flex-1 py-3 text-sm"
              onClick={resetSelfie}
            >
              &#128260; 다시 찍기
            </button>
          ) : (
            <>
              {!cameraActive ? (
                <button
                  className="btn-gold flex-1 py-3 text-sm"
                  onClick={startCamera}
                >
                  &#128247; 카메라 켜기
                </button>
              ) : (
                <button
                  className="btn-gold flex-1 py-3 text-sm"
                  onClick={captureSelfie}
                >
                  &#128248; 촬영
                </button>
              )}
              <label
                className="btn-gold flex-1 cursor-pointer py-3 text-center text-sm"
              >
                &#128193; 사진 업로드
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </>
          )}
        </div>

        {cameraError && (
          <p className="text-center text-sm" style={{ color: 'var(--color-danger)' }}>
            {cameraError}
          </p>
        )}

        {/* Intensity selector */}
        <div className="flex flex-col gap-3">
          <p
            className="text-center text-sm font-medium"
            style={{ color: 'var(--color-cream)' }}
          >
            디스 강도를 선택하세요
          </p>

          <div className="flex gap-3">
            {(Object.keys(INTENSITY_CONFIG) as Intensity[]).map((key) => {
              const config = INTENSITY_CONFIG[key];
              const isSelected = intensity === key;
              return (
                <button
                  key={key}
                  className={`intensity-btn ${isSelected ? config.selectedClass : ''}`}
                  onClick={() => setIntensity(key)}
                >
                  <span className="emoji">{config.emoji}</span>
                  <span>{config.label}</span>
                </button>
              );
            })}
          </div>

          <p
            className="text-center text-sm italic"
            style={{ color: 'var(--color-caption)' }}
          >
            "{currentConfig.description}"
          </p>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* CTA */}
        <button
          className="btn-cta"
          disabled={!selfieDataUrl}
          onClick={handleAnalyze}
        >
          <span className="text-xl">&#128302;</span>
          관상 분석 시작
        </button>
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
