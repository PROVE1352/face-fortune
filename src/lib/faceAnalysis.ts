import {
  FaceLandmarker,
  FilesetResolver,
} from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { FaceMetrics } from '../types';

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let faceLandmarker: FaceLandmarker | null = null;
let initPromise: Promise<FaceLandmarker> | null = null;

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm';

// ---------------------------------------------------------------------------
// Utility: Euclidean distance between two landmarks
// ---------------------------------------------------------------------------
function distance(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 2D distance (x, y only) — used where depth should not influence the metric.
 */
function distance2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ---------------------------------------------------------------------------
// 1. initFaceLandmarker
// ---------------------------------------------------------------------------
/**
 * Load the MediaPipe Face Landmarker model from the CDN and return the
 * initialised instance. Subsequent calls return the cached singleton.
 */
export async function initFaceLandmarker(): Promise<FaceLandmarker> {
  if (faceLandmarker) return faceLandmarker;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
    return faceLandmarker;
  })();

  return initPromise;
}

export function disposeFaceLandmarker(): void {
  faceLandmarker?.close();
  faceLandmarker = null;
  initPromise = null;
}

// ---------------------------------------------------------------------------
// 2. detectFace
// ---------------------------------------------------------------------------
/**
 * Run face detection on an `HTMLImageElement` (or `HTMLVideoElement` /
 * `HTMLCanvasElement`) and return the 478 landmarks for the first detected
 * face, or `null` if no face was found.
 */
export async function detectFace(
  imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
): Promise<NormalizedLandmark[] | null> {
  const landmarker = await initFaceLandmarker();
  const result = landmarker.detect(imageElement);

  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return null;
  }

  // First detected face
  return result.faceLandmarks[0];
}

// ---------------------------------------------------------------------------
// 3. calculateMetrics
// ---------------------------------------------------------------------------
/**
 * Derive all `FaceMetrics` values from the raw 468‑point landmark array.
 *
 * Landmark indices follow the canonical MediaPipe Face Mesh topology:
 * https://github.com/google/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png
 */
export function calculateMetrics(landmarks: NormalizedLandmark[]): FaceMetrics {
  // ── Eyebrow angles ──────────────────────────────────────────────────
  // Right eyebrow: inner 107, outer 70
  const rightEyebrowAngle = calcAngleDeg(landmarks[70], landmarks[107]);
  // Left eyebrow: inner 336, outer 300
  const leftEyebrowAngle = calcAngleDeg(landmarks[300], landmarks[336]);

  const eyebrowAngleDiff = Math.abs(leftEyebrowAngle - rightEyebrowAngle);

  // ── Eye size ratios (height / width) ────────────────────────────────
  // Right eye: width 33↔133, height 159↔145
  const rightEyeWidth = distance2D(landmarks[33], landmarks[133]);
  const rightEyeHeight = distance2D(landmarks[159], landmarks[145]);
  const rightEyeRatio = rightEyeWidth > 0 ? rightEyeHeight / rightEyeWidth : 0;

  // Left eye: width 263↔362, height 386↔374
  const leftEyeWidth = distance2D(landmarks[263], landmarks[362]);
  const leftEyeHeight = distance2D(landmarks[386], landmarks[374]);
  const leftEyeRatio = leftEyeWidth > 0 ? leftEyeHeight / leftEyeWidth : 0;

  // ── Nose ────────────────────────────────────────────────────────────
  // Length: 168 (bridge) ↔ 1 (tip)
  const noseLength = distance2D(landmarks[168], landmarks[1]);
  // Width: 48 (right alar) ↔ 278 (left alar)
  const noseWidth = distance2D(landmarks[48], landmarks[278]);
  const noseRatio = noseWidth > 0 ? noseLength / noseWidth : 0;

  // ── Mouth corner angle ──────────────────────────────────────────────
  // Right corner: 61, Left corner: 291
  // Midpoint between the two corners serves as the pivot.
  const mouthMid = {
    x: (landmarks[61].x + landmarks[291].x) / 2,
    y: (landmarks[61].y + landmarks[291].y) / 2,
    z: ((landmarks[61].z ?? 0) + (landmarks[291].z ?? 0)) / 2,
    visibility: 1,
  } satisfies NormalizedLandmark;
  // Average angle of left and right corners relative to the midpoint.
  const rightCornerAngle = calcAngleDeg(mouthMid, landmarks[61]);
  const leftCornerAngle = calcAngleDeg(mouthMid, landmarks[291]);
  const mouthCornerAngle = (rightCornerAngle + leftCornerAngle) / 2;

  // ── Face symmetry ──────────────────────────────────────────────────
  // 6 pairs measured against the nose tip (landmark 1) as the axis.
  const symmetryPairs: [number, number][] = [
    [33, 263],
    [133, 362],
    [70, 300],
    [107, 336],
    [61, 291],
    [234, 454],
  ];
  const noseTip = landmarks[1];
  let symmetrySum = 0;
  for (const [l, r] of symmetryPairs) {
    const dLeft = distance(landmarks[l], noseTip);
    const dRight = distance(landmarks[r], noseTip);
    const max = Math.max(dLeft, dRight);
    // ratio: 1 = perfectly symmetric, < 1 = asymmetric
    symmetrySum += max > 0 ? Math.min(dLeft, dRight) / max : 1;
  }
  const faceSymmetry = symmetrySum / symmetryPairs.length;

  // ── Forehead ratio ─────────────────────────────────────────────────
  // Forehead height: 10 (top of head) ↔ 168 (nose bridge)
  // Full face height: 10 ↔ 152 (chin)
  const foreheadHeight = distance2D(landmarks[10], landmarks[168]);
  const fullFaceHeight = distance2D(landmarks[10], landmarks[152]);
  const foreheadRatio = fullFaceHeight > 0 ? foreheadHeight / fullFaceHeight : 0;

  // ── Glabella distance (미간) ────────────────────────────────────────
  // Inner corners of the eyes: 133 (right) ↔ 362 (left)
  const glabellaDistance = distance2D(landmarks[133], landmarks[362]);

  // ── Face width / height ratio (종횡비) ──────────────────────────────
  // Width: 234 (right cheek) ↔ 454 (left cheek)
  // Height: 10 (top) ↔ 152 (chin)
  const faceWidth = distance2D(landmarks[234], landmarks[454]);
  const faceWidthHeightRatio =
    fullFaceHeight > 0 ? faceWidth / fullFaceHeight : 0;

  return {
    leftEyebrowAngle,
    rightEyebrowAngle,
    eyebrowAngleDiff,
    leftEyeRatio,
    rightEyeRatio,
    noseLength,
    noseWidth,
    noseRatio,
    mouthCornerAngle,
    faceSymmetry,
    faceWidthHeightRatio,
    foreheadRatio,
    glabellaDistance,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/**
 * Angle (in degrees) of the line from point `a` to point `b` relative to
 * the horizontal axis. Positive = upward from left to right.
 */
function calcAngleDeg(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return (Math.atan2(-dy, dx) * 180) / Math.PI; // negate dy because y-axis is inverted in screen space
}
