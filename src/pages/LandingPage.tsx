import { useNavigate } from 'react-router-dom';

const STAR_COUNT = 40;

function generateStars() {
  return Array.from({ length: STAR_COUNT }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    duration: `${2 + Math.random() * 4}s`,
    delay: `${Math.random() * 5}s`,
    brightness: 0.3 + Math.random() * 0.7,
    size: 1 + Math.random() * 2,
  }));
}

const stars = generateStars();

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="page-enter relative flex flex-1 flex-col items-center justify-center px-6 py-12">
      {/* Fog layer */}
      <div className="fog" />

      {/* Star particles */}
      <div className="stars">
        {stars.map((s) => (
          <div
            key={s.id}
            className="star"
            style={{
              left: s.left,
              top: s.top,
              width: `${s.size}px`,
              height: `${s.size}px`,
              ['--duration' as string]: s.duration,
              ['--delay' as string]: s.delay,
              ['--brightness' as string]: s.brightness,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-8 text-center">
        {/* Decorative sparkle */}
        <div
          className="text-2xl tracking-[0.5em] opacity-60"
          style={{ color: 'var(--color-gold)' }}
        >
          &#10022; &#10022; &#10022;
        </div>

        {/* Neon title */}
        <h1
          className="neon-text text-4xl leading-tight font-black sm:text-5xl"
          style={{ fontFamily: 'var(--font-serif-kr)' }}
        >
          AI 독설 관상쟁이
        </h1>

        {/* Subtitle card */}
        <div
          className="rounded-xl border px-6 py-5"
          style={{
            borderColor: 'rgba(212, 175, 55, 0.2)',
            background: 'rgba(26, 17, 69, 0.6)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <p
            className="text-lg font-medium leading-relaxed"
            style={{ color: 'var(--color-cream)', fontFamily: 'var(--font-batang)' }}
          >
            당신의 관상을 봐드립니다
          </p>
          <p
            className="mt-2 text-sm"
            style={{ color: 'var(--color-caption)' }}
          >
            결과에 대한 책임은 본인에게 있습니다
          </p>
        </div>

        {/* CTA */}
        <button
          className="btn-gold mt-4 text-lg"
          onClick={() => navigate('/camera')}
        >
          <span className="text-2xl">&#128065;</span>
          관상 보러 가기
        </button>

        {/* Disclaimer */}
        <p
          className="mt-8 text-xs"
          style={{ color: 'var(--color-caption)' }}
        >
          &#9888;&#65039; 이 서비스는 만우절 장난입니다. 재미로만 즐겨주세요.
        </p>
      </div>
    </div>
  );
}
