"use client";

import { useEffect, useMemo, useState } from "react";

import { FloatingUiCard } from "@/components/landing/floating-ui-card";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function HeroProductScene() {
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [scrollDepth, setScrollDepth] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      setScrollDepth(clamp(window.scrollY * 0.045, 0, 18));
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const transforms = useMemo(() => {
    const rotateX = pointer.y * -5;
    const rotateY = pointer.x * 6;
    const leftShift = pointer.x * -18;
    const rightShift = pointer.x * 16;

    return {
      frame: `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
      leftCard: `translate3d(${leftShift}px, ${-scrollDepth * 0.45}px, 0) rotate(-4deg)`,
      rightCard: `translate3d(${rightShift}px, ${-scrollDepth * 0.5}px, 0) rotate(5deg)`,
      topCard: `translate3d(${pointer.x * 10}px, ${-scrollDepth * 0.3}px, 0)`,
    };
  }, [pointer.x, pointer.y, scrollDepth]);

  return (
    <div
      className="relative h-[520px] w-full perspective-[1200px] sm:h-[580px]"
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const nextX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
        const nextY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;

        setPointer({
          x: clamp(nextX, -1, 1),
          y: clamp(nextY, -1, 1),
        });
      }}
      onMouseLeave={() => setPointer({ x: 0, y: 0 })}
    >
      <div className="absolute inset-0 rounded-[2.4rem] bg-[radial-gradient(circle_at_18%_12%,rgba(47,111,97,0.22),transparent_42%),radial-gradient(circle_at_85%_80%,rgba(126,184,214,0.22),transparent_36%)]" />
      <div className="absolute left-[12%] top-[8%] h-32 w-32 rounded-full bg-[rgba(47,111,97,0.2)] blur-3xl" />
      <div className="absolute right-[14%] top-[20%] h-40 w-40 rounded-full bg-[rgba(211,173,98,0.2)] blur-3xl" />

      <div
        className="absolute left-1/2 top-[18%] z-20 w-[min(100%,340px)] -translate-x-1/2 transform-gpu transition-transform duration-300"
        style={{ transform: `translateX(-50%) ${transforms.frame}` }}
      >
        <div className="overflow-hidden rounded-[2.1rem] border border-[rgba(18,28,24,0.4)] bg-[linear-gradient(180deg,#1e2924,#111a17)] p-2 shadow-[0_36px_90px_rgba(17,24,20,0.3)]">
          <div className="rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,#fefcf8,#f7f1e8)] p-4">
            <p className="text-[0.68rem] uppercase tracking-[0.2em] text-[var(--muted)]">Сегодня</p>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-900">Короткий фокус дня</h3>

            <div className="mt-4 grid gap-2.5">
              <MetricRow label="Энергия" value="8/10" width="80%" />
              <MetricRow label="Настроение" value="7/10" width="70%" />
              <MetricRow label="Сон" value="7 ч" width="68%" />
            </div>

            <div className="mt-4 rounded-[1rem] border border-[var(--line)] bg-white/85 px-3 py-2.5 text-xs leading-5 text-slate-600">
              «Сегодня держал темп без перегруза. После прогулки стало легче собраться вечером.»
            </div>
          </div>
        </div>
      </div>

      <FloatingUiCard
        className="absolute left-[2%] top-[14%] z-30 w-[min(90vw,250px)] transform-gpu border-[rgba(47,111,97,0.2)] animate-[landing-float_9s_ease-in-out_infinite]"
      >
        <div style={{ transform: transforms.topCard }} className="transition-transform duration-300">
          <p className="text-[0.64rem] uppercase tracking-[0.2em] text-[var(--accent)]">AI-разбор дня</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            День стабильный: энергия выше среднего. Чтобы сохранить ритм, держите вечер без лишней нагрузки.
          </p>
        </div>
      </FloatingUiCard>

      <FloatingUiCard
        className="absolute bottom-[8%] left-[4%] z-20 w-[min(90vw,250px)] transform-gpu border-[rgba(24,33,29,0.13)]"
      >
        <div style={{ transform: transforms.leftCard }} className="transition-transform duration-300">
          <p className="text-[0.64rem] uppercase tracking-[0.2em] text-[var(--muted)]">Follow-up</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-[var(--line)] bg-white px-2.5 py-1 text-xs text-slate-600">
              Что дало больше энергии?
            </span>
            <span className="rounded-full border border-[var(--line)] bg-white px-2.5 py-1 text-xs text-slate-600">
              Что повторить завтра?
            </span>
          </div>
        </div>
      </FloatingUiCard>

      <FloatingUiCard
        className="absolute right-[2%] top-[44%] z-20 w-[min(90vw,270px)] transform-gpu border-[rgba(126,184,214,0.24)]"
      >
        <div style={{ transform: transforms.rightCard }} className="transition-transform duration-300">
          <p className="text-[0.64rem] uppercase tracking-[0.2em] text-[#2b73a8]">AI-чат</p>
          <div className="mt-2 space-y-2 text-sm">
            <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-slate-700">
              Почему вечером падает фокус?
            </div>
            <div className="rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-[var(--accent-strong)]">
              Посмотрим связь с сном и нагрузкой за последние дни.
            </div>
          </div>
        </div>
      </FloatingUiCard>
    </div>
  );
}

function MetricRow({
  label,
  value,
  width,
}: {
  label: string;
  value: string;
  width: string;
}) {
  return (
    <div className="rounded-[0.95rem] border border-[var(--line)] bg-white/90 p-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-[var(--accent-strong)]">{value}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-[rgba(24,33,29,0.08)]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent),var(--accent-sky))]"
          style={{ width }}
        />
      </div>
    </div>
  );
}
