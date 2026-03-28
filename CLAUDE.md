# face-fortune — AI 독설 관상쟁이

만우절 해커톤 프로젝트. 셀카를 올리면 얼굴 분석 후 독설 + 운세를 생성하는 웹 서비스.

## 기술 스택

- Frontend: React + TypeScript (Vite)
- Styling: Tailwind CSS v4
- 얼굴 분석: @mediapipe/tasks-vision (Face Landmarker, 클라이언트)
- AI 생성: Claude API (claude-sonnet-4-6, Vision 멀티모달)
- 오디오: Howler.js
- 파티클: canvas-confetti
- 카드 이미지: Canvas API
- 라우팅: react-router-dom
- 배포: Vercel

## 아키텍처 (역할 분리)

- **MediaPipe** → UX 레이어: 얼굴 감지 가드, 468포인트 연출, 정량 수치 추출
- **Claude Vision** → 디스 엔진: 수치 JSON + 셀카 이미지 → 독설 운세 생성 (API 1회 호출)
- 연출이 API 대기 시간을 가려줌 (3~5초)

## 폴더 구조

```
src/
├── pages/          # 4개 화면 (Landing, Camera, Scan, Result)
├── components/     # 재사용 컴포넌트 (Button, Card, IntensitySelector 등)
├── lib/
│   ├── faceAnalysis.ts    # MediaPipe 초기화 + 수치 계산
│   ├── fortuneApi.ts      # Claude API 호출
│   └── cardRenderer.ts    # Canvas API 타로카드 합성
├── api/            # 서버리스 함수 (Vercel Edge Function)
├── hooks/          # React 커스텀 훅
├── styles/         # 글로벌 CSS
├── types/          # TypeScript 타입 정의
└── assets/
    ├── audio/      # BGM + sfx/
    └── images/     # crack.png, skull.png 등
```

## 디스 강도

- `warm` (🌸 훈훈): 금색/핑크, 꽃잎 파티클
- `normal` (🔥 기본): 보라/남색, 타로카드 플립 + 별빛
- `brutal` (💀 극딜): 초록→빨강, 균열 + 해골

## 핵심 타입

```typescript
type Intensity = 'warm' | 'normal' | 'brutal';

interface FaceMetrics {
  leftEyebrowAngle: number;
  rightEyebrowAngle: number;
  eyebrowAngleDiff: number;
  leftEyeRatio: number;
  rightEyeRatio: number;
  noseRatio: number;
  mouthCornerAngle: number;
  faceSymmetry: number;
  faceWidthHeightRatio: number;
  foreheadRatio: number;
  glabellaDistance: number;
}

interface FortuneResult {
  title: string;
  faceReport: string;
  readingText: string;
  fortuneText: string;
  luckyDirection: string;
  cardQuote: string;
  visualRoast: string;
}
```

## 설계 문서 (옵시디언)

모든 구현은 아래 문서의 스펙을 따른다:

- `/Users/kyuchan/Documents/Obsidian Vault/AI 독설 관상쟁이 - PRD.md` — 전체 기획, 프롬프트 설계, API 호출 구조
- `/Users/kyuchan/Documents/Obsidian Vault/AI 독설 관상쟁이 - 아키텍처.md` — MediaPipe/Claude 역할 분리, 데이터 흐름
- `/Users/kyuchan/Documents/Obsidian Vault/AI 독설 관상쟁이 - 기술 구현.md` — MediaPipe 468포인트, 랜드마크 인덱스, 수치 공식
- `/Users/kyuchan/Documents/Obsidian Vault/AI 독설 관상쟁이 - 스캔 애니메이션.md` — 강도별 스캔 연출, 타임라인
- `/Users/kyuchan/Documents/Obsidian Vault/AI 독설 관상쟁이 - BGM & 효과음.md` — 사운드 타임라인, Howler.js 코드
- `/Users/kyuchan/Documents/Obsidian Vault/AI 독설 관상쟁이 - 타로카드 이미지.md` — 카드 레이아웃, Canvas 코드, 필터
- `/Users/kyuchan/Documents/Obsidian Vault/AI 독설 관상쟁이 - UI UX 디자인.md` — 화면별 와이어프레임, 컬러, 폰트, CSS
- `/Users/kyuchan/Documents/Obsidian Vault/AI 독설 관상쟁이 - DB 설계.md` — 테이블 정의, 쿼리 예시

## 컨벤션

- 컴포넌트: PascalCase (LandingPage.tsx)
- 유틸/훅: camelCase (faceAnalysis.ts, useCamera.ts)
- CSS: Tailwind 유틸리티 클래스 우선
- 한국어 UI, 영어 코드
