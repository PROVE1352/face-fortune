import Anthropic from '@anthropic-ai/sdk';
import type { FaceMetrics, FortuneResult, Intensity } from '../src/types';

export const config = {
  runtime: 'edge',
};

const client = new Anthropic();

const VALID_INTENSITIES: Intensity[] = ['warm', 'normal', 'brutal'];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SYSTEM_PROMPT = `당신은 '독설 관상쟁이'입니다. 수백 년간 관상을 봐온 신비로운 존재이며, 날카롭고 재치 있는 독설로 유명합니다.

## 규칙
1. 반드시 전달받은 FaceMetrics 수치를 구체적으로 인용하며 해석하라. (예: "눈썹 각도 차이가 3.7도라니, 한쪽은 의심하고 한쪽은 이미 포기한 눈썹이군요")
2. 이미지에서 실제로 보이는 특징을 적극 활용하라 — 안경 유무, 헤어스타일, 표정, 의상, 배경 등.
3. 관상학 전문 용어를 자연스럽게 섞되, 해석은 엉뚱하고 재미있게 비틀어라. (예: "천창이 넓으니 하늘의 기운을 받을 상이지만… 주로 비를 맞을 운이네요")
4. 매우 구체적인 운세를 포함하라 — 특정 요일, 장소, 상황을 명시. (예: "목요일 오후 3시, 편의점에서 삼각김밥을 고르다 인생이 바뀔 것입니다")
5. 응답은 반드시 아래 JSON 형식만 출력하라. JSON 외의 텍스트는 절대 포함하지 마라.

## 강도별 톤
- warm: 칭찬 70% + 살짝 찔러보기 30%. 따뜻하고 유머러스하게. 기분 좋은 독설.
- normal: 칭찬 50% + 독설 50%. 팩트와 유머의 균형. 듣고 나서 "맞는데?!" 하게.
- brutal: 자비 없는 팩폭 90% + 한 줄 위로 10%. 온갖 엉뚱한 비유와 극단적 표현. 웃기지만 따끔함.

## JSON 출력 형식
{
  "title": "한 줄 관상 제목 (예: '좌절과 희망 사이, 그 미간')",
  "faceReport": "얼굴 수치 기반 분석 리포트 (3~4문장). 수치를 직접 인용하며 해석.",
  "readingText": "관상 해석 본문 (4~6문장). 관상학 용어 + 엉뚱한 해석 + 이미지에서 보이는 특징 활용.",
  "fortuneText": "구체적 운세 (3~4문장). 특정 요일/장소/상황 포함.",
  "luckyDirection": "행운의 방위 + 한 줄 설명 (예: '동남쪽 — 그쪽에 당신을 기다리는 자판기가 있습니다')",
  "cardQuote": "타로 카드에 적힐 한 줄 명언 (독설 스타일)",
  "visualRoast": "외모 한 줄 로스트 (이미지 기반, 가장 날카롭고 웃긴 한 마디)"
}`;

function buildUserPrompt(metrics: FaceMetrics, intensity: Intensity): string {
  return `## 얼굴 수치 (FaceMetrics)
${JSON.stringify(metrics, null, 2)}

## 디스 강도
${intensity}

위 수치와 첨부된 셀카 이미지를 기반으로 독설 관상 운세를 JSON으로 생성해주세요.`;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const { image, metrics, intensity } = (await req.json()) as {
      image: string;
      metrics: FaceMetrics;
      intensity: Intensity;
    };

    if (!image || !metrics || !intensity) {
      return jsonResponse({ error: 'Missing required fields: image, metrics, intensity' }, 400);
    }

    if (!VALID_INTENSITIES.includes(intensity)) {
      return jsonResponse({ error: `Invalid intensity: ${intensity}` }, 400);
    }

    let base64Data = image;
    let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';

    if (image.startsWith('data:')) {
      const commaIdx = image.indexOf(',');
      if (commaIdx !== -1) {
        const header = image.slice(5, commaIdx);
        const semiIdx = header.indexOf(';');
        if (semiIdx !== -1) {
          mediaType = header.slice(0, semiIdx) as typeof mediaType;
        }
        base64Data = image.slice(commaIdx + 1);
      }
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: buildUserPrompt(metrics, intensity),
            },
          ],
        },
      ],
    });

    // Claude 응답에서 텍스트 추출
    const textBlock = message.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    // JSON 파싱 — Claude가 코드블록으로 감쌀 수 있으므로 처리
    let jsonText = textBlock.text.trim();
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    }

    const result: FortuneResult = JSON.parse(jsonText);

    // 필수 필드 검증
    const requiredFields: (keyof FortuneResult)[] = [
      'title',
      'faceReport',
      'readingText',
      'fortuneText',
      'luckyDirection',
      'cardQuote',
      'visualRoast',
    ];
    for (const field of requiredFields) {
      if (typeof result[field] !== 'string' || result[field].length === 0) {
        throw new Error(`Missing or invalid field: ${field}`);
      }
    }

    return jsonResponse(result);
  } catch (error) {
    console.error('Fortune API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonResponse({ error: message }, 500);
  }
}
