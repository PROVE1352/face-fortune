export type Intensity = 'warm' | 'normal' | 'brutal';

export interface FaceMetrics {
  leftEyebrowAngle: number;
  rightEyebrowAngle: number;
  eyebrowAngleDiff: number;
  leftEyeRatio: number;
  rightEyeRatio: number;
  noseLength: number;
  noseWidth: number;
  noseRatio: number;
  mouthCornerAngle: number;
  faceSymmetry: number;
  faceWidthHeightRatio: number;
  foreheadRatio: number;
  glabellaDistance: number;
}

export interface FortuneResult {
  title: string;
  faceReport: string;
  readingText: string;
  fortuneText: string;
  luckyDirection: string;
  cardQuote: string;
  visualRoast: string;
}

export interface ReadingSession {
  id: string;
  intensity: Intensity;
  selfieDataUrl: string;
  metrics: FaceMetrics;
  result: FortuneResult;
  createdAt: Date;
}
