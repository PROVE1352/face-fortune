import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

type Intensity = 'warm' | 'normal' | 'brutal';

interface FortuneResult {
  title: string;
  faceReport: string;
  readingText: string;
  fortuneText: string;
  luckyDirection: string;
  cardQuote: string;
  visualRoast: string;
}

const client = new Anthropic();
const VALID_INTENSITIES: Intensity[] = ['warm', 'normal', 'brutal'];

const SYSTEM_PROMPT = `당신은 '독설 관상쟁이'입니다. 수백 년간 관상을 봐온 신비로운 존재이며, 날카롭고 재치 있는 독설로 유명합니다.

## 규칙
1. 반드시 전달받은 FaceMetrics 수치를 구체적으로 인용하며 해석하라.
2. 이미지에서 실제로 보이는 특징을 적극 활용하라 — 안경 유무, 헤어스타일, 표정, 의상, 배경 등.
3. 관상학 전문 용어를 자연스럽게 섞되, 해석은 엉뚱하고 재미있게 비틀어라.
4. 매우 구체적인 운세를 포함하라 — 특정 요일, 장소, 상황을 명시.
5. 응답은 반드시 아래 JSON 형식만 출력하라. JSON 외의 텍스트는 절대 포함하지 마라.

## 강도별 톤
- warm: 칭찬 70% + 살짝 찔러보기 30%. 따뜻하고 유머러스하게.
- normal: 칭찬 50% + 독설 50%. 팩트와 유머의 균형.
- brutal: 자비 없는 팩폭 90% + 한 줄 위로 10%.

## JSON 출력 형식
{
  "title": "한 줄 관상 제목",
  "faceReport": "수치 기반 분석 리포트 (3~4문장)",
  "readingText": "관상 해석 본문 (4~6문장)",
  "fortuneText": "구체적 운세 (3~4문장)",
  "luckyDirection": "행운의 방위 + 설명",
  "cardQuote": "타로 카드 한 줄 명언",
  "visualRoast": "외모 한 줄 로스트"
}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, metrics, intensity } = req.body as {
      image: string;
      metrics: Record<string, number>;
      intensity: Intensity;
    };

    if (!image || !metrics || !intensity) {
      return res.status(400).json({ error: 'Missing required fields: image, metrics, intensity' });
    }

    if (!VALID_INTENSITIES.includes(intensity)) {
      return res.status(400).json({ error: `Invalid intensity: ${intensity}` });
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
      max_tokens: 4096,
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
              text: `## 얼굴 수치 (FaceMetrics)\n${JSON.stringify(metrics, null, 2)}\n\n## 디스 강도\n${intensity}\n\n위 수치와 첨부된 셀카 이미지를 기반으로 독설 관상 운세를 JSON으로 생성해주세요.`,
            },
          ],
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    let jsonText = textBlock.text.trim();
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonText = jsonText.slice(firstBrace, lastBrace + 1);
    }

    const result: FortuneResult = JSON.parse(jsonText);

    result.faceReport = result.faceReport || '';
    result.luckyDirection = result.luckyDirection || '';
    result.cardQuote = result.cardQuote || '';
    result.visualRoast = result.visualRoast || '';
    result.title = result.title || '미스터리 관상';
    result.readingText = result.readingText || '관상 분석이 완료되었습니다.';
    result.fortuneText = result.fortuneText || '오늘의 운세를 확인해보세요.';

    return res.status(200).json(result);
  } catch (error) {
    console.error('Fortune API error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: msg });
  }
}
