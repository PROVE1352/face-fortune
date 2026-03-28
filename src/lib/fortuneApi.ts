import type { FaceMetrics, FortuneResult, Intensity } from '../types';

/**
 * Claude API를 통해 독설 관상 운세를 생성하는 클라이언트 함수.
 * 브라우저에서 직접 Anthropic API를 호출하면 CORS 문제가 발생하므로
 * Vercel Edge Function(/api/fortune)을 경유한다.
 */
export async function generateFortune(
  selfieBase64: string,
  metrics: FaceMetrics,
  intensity: Intensity,
): Promise<FortuneResult> {
  const response = await fetch('/api/fortune', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: selfieBase64,
      metrics,
      intensity,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `Fortune API error (${response.status}): ${errorBody}`,
    );
  }

  const data: FortuneResult = await response.json();
  return data;
}
