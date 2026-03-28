import type { Intensity, FaceMetrics, FortuneResult } from '../types';

// ─── 강도별 스타일 정의 ──────────────────────────────────────────

interface IntensityStyle {
  gradientStops: [string, string, string];
  textColor: string;
  accentColor: string;
  subtitleColor: string;
  badgeBg: string;
  badgeText: string;
  badgeLabel: string;
  filter: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  selfieFilter: (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => void;
}

const STYLES: Record<Intensity, IntensityStyle> = {
  warm: {
    gradientStops: ['#ffe4e6', '#fdf2f8', '#fef3c7'],
    textColor: '#78350f',
    accentColor: '#b45309',
    subtitleColor: '#92400e',
    badgeBg: '#fbbf24',
    badgeText: '#78350f',
    badgeLabel: '\uD83C\uDF38 \uD6C8\uD6C8',
    filter: () => {
      // warm은 배경 그라데이션 자체가 소프트하므로 추가 필터 없음
    },
    selfieFilter: (ctx, cx, cy, r) => {
      // 소프트 글로우: 반투명 핑크 오버레이
      const glow = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
      glow.addColorStop(0, 'rgba(255, 182, 193, 0.15)');
      glow.addColorStop(1, 'rgba(255, 228, 225, 0.25)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  normal: {
    gradientStops: ['#1e1b4b', '#312e81', '#4c1d95'],
    textColor: '#e0e7ff',
    accentColor: '#a78bfa',
    subtitleColor: '#c4b5fd',
    badgeBg: '#6d28d9',
    badgeText: '#ede9fe',
    badgeLabel: '\uD83D\uDD25 \uAE30\uBCF8',
    filter: (ctx, w, h) => {
      // 비네팅: 가장자리 어둡게
      const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.7);
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
    },
    selfieFilter: (ctx, cx, cy, r) => {
      // 세피아 톤 오버레이
      ctx.globalCompositeOperation = 'color';
      ctx.fillStyle = 'rgba(112, 66, 20, 0.25)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  brutal: {
    gradientStops: ['#0a0a0a', '#1a0000', '#450a0a'],
    textColor: '#fca5a5',
    accentColor: '#ef4444',
    subtitleColor: '#f87171',
    badgeBg: '#991b1b',
    badgeText: '#fecaca',
    badgeLabel: '\uD83D\uDC80 \uADF9\uB51C',
    filter: (ctx, w, h) => {
      // 빨간색조 오버레이
      ctx.fillStyle = 'rgba(127, 29, 29, 0.18)';
      ctx.fillRect(0, 0, w, h);
    },
    selfieFilter: (ctx, cx, cy, r) => {
      // 글리치 + 빨간색조
      ctx.globalCompositeOperation = 'color';
      ctx.fillStyle = 'rgba(220, 38, 38, 0.3)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // 글리치 라인
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.15)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const offsetY = cy - r + Math.random() * r * 2;
        const shift = (Math.random() - 0.5) * 8;
        ctx.beginPath();
        ctx.moveTo(cx - r + shift, offsetY);
        ctx.lineTo(cx + r + shift, offsetY);
        ctx.stroke();
      }
    },
  },
};

// ─── 카드 상수 ──────────────────────────────────────────────────

const CARD_W = 600;
const CARD_H = 1050;
const PADDING = 40;
const SELFIE_RADIUS = 100;
const SELFIE_CX = CARD_W / 2;
const SELFIE_CY = 210;

// ─── 유틸 함수 ──────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split('');
  let line = '';
  let currentY = y;

  for (const char of words) {
    const testLine = line + char;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line.length > 0) {
      ctx.fillText(line, x, currentY);
      line = char;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

function formatDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

// ─── 메인 렌더링 함수 ───────────────────────────────────────────

interface RenderTarotCardParams {
  selfieImg: string; // data URL 또는 이미지 URL
  result: FortuneResult;
  intensity: Intensity;
  metrics: FaceMetrics;
}

export async function renderTarotCard({
  selfieImg,
  result,
  intensity,
  metrics,
}: RenderTarotCardParams): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;
  const style = STYLES[intensity];

  // ─── 1. 배경 그라데이션 ───────────────────────────────────────

  const bgGrad = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bgGrad.addColorStop(0, style.gradientStops[0]);
  bgGrad.addColorStop(0.5, style.gradientStops[1]);
  bgGrad.addColorStop(1, style.gradientStops[2]);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // ─── 2. 카드 테두리 ──────────────────────────────────────────

  ctx.strokeStyle = style.accentColor;
  ctx.lineWidth = 2;
  const borderInset = 16;
  roundRect(ctx, borderInset, borderInset, CARD_W - borderInset * 2, CARD_H - borderInset * 2, 12);
  ctx.stroke();

  // 안쪽 장식 테두리
  ctx.strokeStyle = style.accentColor + '55';
  ctx.lineWidth = 1;
  const innerInset = 24;
  roundRect(ctx, innerInset, innerInset, CARD_W - innerInset * 2, CARD_H - innerInset * 2, 8);
  ctx.stroke();

  // ─── 3. 상단 타이틀 ──────────────────────────────────────────

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 작은 장식
  ctx.font = '14px serif';
  ctx.fillStyle = style.accentColor + 'aa';
  ctx.fillText('\u2726 \u2726 \u2726', CARD_W / 2, 52);

  // 메인 타이틀
  ctx.font = 'bold 26px serif';
  ctx.fillStyle = style.accentColor;
  ctx.fillText('\u2726 AI \uAD00\uC0C1 \uD0C0\uB85C \u2726', CARD_W / 2, 80);

  // 타이틀 아래 장식선
  ctx.strokeStyle = style.accentColor + '66';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING + 80, 100);
  ctx.lineTo(CARD_W - PADDING - 80, 100);
  ctx.stroke();

  // ─── 4. 셀카 이미지 (원형 클리핑) ────────────────────────────

  const photo = await loadImage(selfieImg);

  ctx.save();
  ctx.beginPath();
  ctx.arc(SELFIE_CX, SELFIE_CY, SELFIE_RADIUS, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  // 원형 영역에 이미지를 커버로 채우기
  const imgAspect = photo.width / photo.height;
  const circleSize = SELFIE_RADIUS * 2;
  let drawW: number, drawH: number, drawX: number, drawY: number;

  if (imgAspect > 1) {
    drawH = circleSize;
    drawW = circleSize * imgAspect;
    drawX = SELFIE_CX - drawW / 2;
    drawY = SELFIE_CY - SELFIE_RADIUS;
  } else {
    drawW = circleSize;
    drawH = circleSize / imgAspect;
    drawX = SELFIE_CX - SELFIE_RADIUS;
    drawY = SELFIE_CY - drawH / 2;
  }

  ctx.drawImage(photo, drawX, drawY, drawW, drawH);
  ctx.restore();

  // 셀카 필터 적용 (원형 위에)
  style.selfieFilter(ctx, SELFIE_CX, SELFIE_CY, SELFIE_RADIUS);

  // 원형 테두리
  ctx.strokeStyle = style.accentColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(SELFIE_CX, SELFIE_CY, SELFIE_RADIUS + 2, 0, Math.PI * 2);
  ctx.stroke();

  // 바깥쪽 장식 링
  ctx.strokeStyle = style.accentColor + '44';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(SELFIE_CX, SELFIE_CY, SELFIE_RADIUS + 8, 0, Math.PI * 2);
  ctx.stroke();

  // ─── 5. 구분선 ───────────────────────────────────────────────

  let currentY = SELFIE_CY + SELFIE_RADIUS + 30;

  ctx.font = '16px serif';
  ctx.fillStyle = style.accentColor + 'cc';
  ctx.textAlign = 'center';
  ctx.fillText('\u2500\u2500\u2500 \u2726 \u2726 \u2726 \u2500\u2500\u2500', CARD_W / 2, currentY);
  currentY += 30;

  // ─── 6. 칭호 (자동 줄바꿈) ──────────────────────────────────

  ctx.font = 'bold 24px serif';
  ctx.fillStyle = style.textColor;
  ctx.textAlign = 'center';
  currentY = drawWrappedText(
    ctx,
    `\u300E ${result.title} \u300F`,
    CARD_W / 2,
    currentY,
    CARD_W - PADDING * 2 - 40,
    32,
  );
  currentY += 16;

  // ─── 7. 수치 요약 (faceReport) ────────────────────────────────

  ctx.font = '16px sans-serif';
  ctx.fillStyle = style.subtitleColor;
  ctx.textAlign = 'center';
  currentY = drawWrappedText(
    ctx,
    result.faceReport,
    CARD_W / 2,
    currentY,
    CARD_W - PADDING * 2 - 20,
    24,
  );
  currentY += 12;

  // ─── 8. 주요 수치 바 ─────────────────────────────────────────

  const metricsDisplay = [
    { label: '\uC88C\uC6B0\uB300\uCE6D', value: metrics.faceSymmetry, max: 1 },
    { label: '\uC5BC\uAD74\uBE44\uC728', value: metrics.faceWidthHeightRatio, max: 2 },
    { label: '\uCF54 \uBE44\uC728', value: metrics.noseRatio, max: 2 },
  ];

  const barStartX = PADDING + 50;
  const barEndX = CARD_W - PADDING - 50;
  const barWidth = barEndX - barStartX;

  for (const m of metricsDisplay) {
    const ratio = Math.min(m.value / m.max, 1);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = style.subtitleColor + 'cc';
    ctx.textAlign = 'left';
    ctx.fillText(m.label, barStartX, currentY);

    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(m.value.toFixed(2), barEndX, currentY);

    currentY += 8;

    // 바 배경
    ctx.fillStyle = style.accentColor + '22';
    roundRect(ctx, barStartX, currentY, barWidth, 6, 3);
    ctx.fill();

    // 바 값
    ctx.fillStyle = style.accentColor + 'aa';
    roundRect(ctx, barStartX, currentY, barWidth * ratio, 6, 3);
    ctx.fill();

    currentY += 18;
  }

  currentY += 4;

  // ─── 9. 행운의 방향 ──────────────────────────────────────────

  if (result.luckyDirection) {
    ctx.font = '16px sans-serif';
    ctx.fillStyle = style.accentColor;
    ctx.textAlign = 'center';
    currentY = drawWrappedText(
      ctx,
      `🧭 행운의 방향: ${result.luckyDirection}`,
      CARD_W / 2,
      currentY,
      CARD_W - PADDING * 2 - 20,
      24,
    );
    currentY += 16;
  }

  // ─── 10. 카드 한마디 ─────────────────────────────────────────

  ctx.font = 'italic 18px serif';
  ctx.fillStyle = style.textColor;
  ctx.textAlign = 'center';
  currentY = drawWrappedText(
    ctx,
    `\u201C${result.cardQuote}\u201D`,
    CARD_W / 2,
    currentY,
    CARD_W - PADDING * 2 - 40,
    24,
  );
  currentY += 8;

  // ─── 11. 하단: 날짜 + 강도 뱃지 ──────────────────────────────

  const bottomY = CARD_H - 50;

  // 날짜
  ctx.font = '13px sans-serif';
  ctx.fillStyle = style.subtitleColor + 'bb';
  ctx.textAlign = 'left';
  ctx.fillText(formatDate(), PADDING + 20, bottomY);

  // 강도 뱃지
  const badgeText = style.badgeLabel;
  ctx.font = 'bold 13px sans-serif';
  const badgeMetrics = ctx.measureText(badgeText);
  const badgePadH = 14;
  const badgeW = badgeMetrics.width + badgePadH * 2;
  const badgeH = 26;
  const badgeX = CARD_W - PADDING - 20 - badgeW;
  const badgeY = bottomY - badgeH / 2 - 2;

  ctx.fillStyle = style.badgeBg;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
  ctx.fill();

  ctx.fillStyle = style.badgeText;
  ctx.textAlign = 'center';
  ctx.fillText(badgeText, badgeX + badgeW / 2, bottomY);

  // 하단 장식선
  ctx.strokeStyle = style.accentColor + '44';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING + 20, bottomY - 20);
  ctx.lineTo(CARD_W - PADDING - 20, bottomY - 20);
  ctx.stroke();

  // ─── 12. 강도별 후처리 필터 ──────────────────────────────────

  style.filter(ctx, CARD_W, CARD_H);

  return canvas;
}

// ─── 다운로드 ───────────────────────────────────────────────────

export function downloadCard(canvas: HTMLCanvasElement): void {
  const link = document.createElement('a');
  link.download = `ai-tarot-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ─── 공유 (Web Share API, 폴백: 다운로드) ───────────────────────

export async function shareCard(canvas: HTMLCanvasElement): Promise<void> {
  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas toBlob failed'));
      }, 'image/png');
    });

    const file = new File([blob], `ai-tarot-${Date.now()}.png`, { type: 'image/png' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: 'AI 독설 관상쟁이',
        text: '내 관상 타로 결과를 확인해보세요!\nhttps://face-fortune-pearl.vercel.app',
        files: [file],
      });
    } else {
      // Web Share API를 지원하지 않거나 파일 공유 불가 시 다운로드 폴백
      downloadCard(canvas);
    }
  } catch (err) {
    // 사용자가 공유를 취소한 경우(AbortError)는 무시, 그 외엔 다운로드 폴백
    if (err instanceof Error && err.name === 'AbortError') {
      return;
    }
    downloadCard(canvas);
  }
}

// ─── 헬퍼: 둥근 사각형 ─────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
