import Database from 'better-sqlite3';
import path from 'path';
import type { FaceMetrics, FortuneResult, Intensity } from '../types';

const DB_PATH = path.join(process.cwd(), 'face-fortune.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initTables(db);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Graceful shutdown
process.on('SIGINT', () => { closeDb(); process.exit(0); });
process.on('SIGTERM', () => { closeDb(); process.exit(0); });

function initTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS readings (
      id              TEXT PRIMARY KEY,
      session_id      TEXT NOT NULL,
      intensity       TEXT NOT NULL CHECK (intensity IN ('warm', 'normal', 'brutal')),
      selfie_url      TEXT,
      card_image_url  TEXT,
      device_type     TEXT DEFAULT 'mobile' CHECK (device_type IN ('mobile', 'desktop')),
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS face_metrics (
      id                      TEXT PRIMARY KEY,
      reading_id              TEXT NOT NULL UNIQUE REFERENCES readings(id) ON DELETE CASCADE,
      left_eyebrow_angle      REAL,
      right_eyebrow_angle     REAL,
      eyebrow_angle_diff      REAL,
      left_eye_ratio          REAL,
      right_eye_ratio         REAL,
      nose_length             REAL,
      nose_width              REAL,
      nose_ratio              REAL,
      mouth_corner_angle      REAL,
      face_symmetry           REAL,
      face_width_height_ratio REAL,
      forehead_ratio          REAL,
      glabella_distance       REAL,
      created_at              TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fortune_results (
      id                  TEXT PRIMARY KEY,
      reading_id          TEXT NOT NULL UNIQUE REFERENCES readings(id) ON DELETE CASCADE,
      title               TEXT NOT NULL,
      face_report         TEXT,
      reading_text        TEXT NOT NULL,
      fortune_text        TEXT NOT NULL,
      lucky_direction     TEXT,
      card_quote          TEXT,
      visual_roast        TEXT,
      model_used          TEXT DEFAULT 'claude-sonnet-4-6',
      prompt_tokens       INTEGER,
      completion_tokens   INTEGER,
      response_time_ms    INTEGER,
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_readings_session ON readings (session_id);
    CREATE INDEX IF NOT EXISTS idx_readings_created_at ON readings (created_at DESC);
  `);
}

function uuid(): string {
  return crypto.randomUUID();
}

// ─── INSERT (all-in-one transaction) ────────────────────────

export function insertFullReading(params: {
  sessionId: string;
  intensity: Intensity;
  metrics: FaceMetrics;
  result: FortuneResult;
  deviceType?: 'mobile' | 'desktop';
  meta?: { promptTokens?: number; completionTokens?: number; responseTimeMs?: number };
}): string {
  const db = getDb();
  const readingId = uuid();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO readings (id, session_id, intensity, device_type)
      VALUES (?, ?, ?, ?)
    `).run(readingId, params.sessionId, params.intensity, params.deviceType ?? 'mobile');

    db.prepare(`
      INSERT INTO face_metrics (
        id, reading_id,
        left_eyebrow_angle, right_eyebrow_angle, eyebrow_angle_diff,
        left_eye_ratio, right_eye_ratio,
        nose_length, nose_width, nose_ratio,
        mouth_corner_angle,
        face_symmetry, face_width_height_ratio, forehead_ratio, glabella_distance
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid(), readingId,
      params.metrics.leftEyebrowAngle, params.metrics.rightEyebrowAngle, params.metrics.eyebrowAngleDiff,
      params.metrics.leftEyeRatio, params.metrics.rightEyeRatio,
      params.metrics.noseLength, params.metrics.noseWidth, params.metrics.noseRatio,
      params.metrics.mouthCornerAngle,
      params.metrics.faceSymmetry, params.metrics.faceWidthHeightRatio, params.metrics.foreheadRatio, params.metrics.glabellaDistance,
    );

    db.prepare(`
      INSERT INTO fortune_results (
        id, reading_id,
        title, face_report, reading_text, fortune_text,
        lucky_direction, card_quote, visual_roast,
        prompt_tokens, completion_tokens, response_time_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid(), readingId,
      params.result.title, params.result.faceReport, params.result.readingText, params.result.fortuneText,
      params.result.luckyDirection, params.result.cardQuote, params.result.visualRoast,
      params.meta?.promptTokens ?? null, params.meta?.completionTokens ?? null, params.meta?.responseTimeMs ?? null,
    );
  });

  tx();
  return readingId;
}


// ─── QUERY ──────────────────────────────────────────────────

export function getReading(id: string) {
  const db = getDb();
  return db.prepare(`
    SELECT
      r.id, r.session_id, r.intensity, r.device_type, r.created_at,
      fm.left_eyebrow_angle, fm.right_eyebrow_angle, fm.eyebrow_angle_diff,
      fm.left_eye_ratio, fm.right_eye_ratio,
      fm.nose_length, fm.nose_width, fm.nose_ratio,
      fm.mouth_corner_angle, fm.face_symmetry, fm.face_width_height_ratio,
      fm.forehead_ratio, fm.glabella_distance,
      fr.title, fr.face_report, fr.reading_text, fr.fortune_text,
      fr.lucky_direction, fr.card_quote, fr.visual_roast,
      fr.model_used, fr.prompt_tokens, fr.completion_tokens, fr.response_time_ms
    FROM readings r
    LEFT JOIN face_metrics fm ON fm.reading_id = r.id
    LEFT JOIN fortune_results fr ON fr.reading_id = r.id
    WHERE r.id = ?
  `).get(id);
}

export function getStats() {
  const db = getDb();
  const intensityCounts = db.prepare(`
    SELECT intensity, COUNT(*) as count
    FROM readings
    GROUP BY intensity
  `).all();

  const total = db.prepare(`SELECT COUNT(*) as total FROM readings`).get() as { total: number };

  const avgSymmetry = db.prepare(`
    SELECT
      ROUND(AVG(face_symmetry), 4) as avg_symmetry,
      ROUND(MIN(face_symmetry), 4) as min_symmetry,
      ROUND(MAX(face_symmetry), 4) as max_symmetry
    FROM face_metrics
  `).get();

  return { total: total.total, intensityCounts, avgSymmetry };
}

export function getRecentReadings(limit = 20) {
  const db = getDb();
  return db.prepare(`
    SELECT r.id, r.intensity, r.created_at, fr.title, fr.card_quote
    FROM readings r
    LEFT JOIN fortune_results fr ON fr.reading_id = r.id
    ORDER BY r.created_at DESC
    LIMIT ?
  `).all(limit);
}
