"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { BrandGlyph } from "@/components/brand-glyph";
import { BrandWordmark } from "@/components/landing/brand-wordmark";
import {
  type PhysarumSettings,
  LandingPhysarumBackground,
} from "@/components/landing/landing-physarum-background";

type LandingPageProps = {
  isAuthenticated: boolean;
  isConfigured: boolean;
};

type FloatingTag = {
  label: string;
  className: string;
};

type SettingField = {
  key: keyof PhysarumSettings;
  label: string;
  min: number;
  max: number;
  step: number;
};

const FLOATING_TAGS: FloatingTag[] = [
  { label: "Сегодня", className: "left-[2.5%] top-[24%]" },
  { label: "Короткий фокус дня", className: "left-[23%] bottom-[17%]" },
  { label: "Сон 7 ч", className: "left-[11%] bottom-[9%]" },
  { label: "Diary AI", className: "left-1/2 top-[27%] -translate-x-1/2" },
  { label: "Разбор периода", className: "right-[12%] bottom-[18%]" },
  { label: "Энергия 8/10", className: "right-[8%] bottom-[8%]" },
];

const DEFAULT_SETTINGS: PhysarumSettings = {
  agentCount: 2600,
  speed: 1.1,
  sensorDistance: 10,
  sensorAngle: 0.58,
  turnAngle: 0.44,
  decay: 0.972,
  diffuse: 0.14,
  foodStrength: 1.7,
  lineBoost: 0.17,
  noise: 0.045,
  opacity: 0.96,
  ambientDots: 8,
};

const SETTING_FIELDS: SettingField[] = [
  { key: "agentCount", label: "Agents", min: 800, max: 4200, step: 100 },
  { key: "speed", label: "Speed", min: 0.4, max: 2, step: 0.02 },
  { key: "sensorDistance", label: "Sensor", min: 4, max: 24, step: 0.5 },
  { key: "sensorAngle", label: "Sense angle", min: 0.15, max: 1.2, step: 0.01 },
  { key: "turnAngle", label: "Turn", min: 0.1, max: 1.2, step: 0.01 },
  { key: "decay", label: "Decay", min: 0.9, max: 0.995, step: 0.001 },
  { key: "diffuse", label: "Diffuse", min: 0.02, max: 0.28, step: 0.01 },
  { key: "foodStrength", label: "Food", min: 0.5, max: 3.5, step: 0.05 },
  { key: "lineBoost", label: "Line boost", min: 0, max: 0.5, step: 0.01 },
  { key: "noise", label: "Noise", min: 0, max: 0.2, step: 0.005 },
  { key: "opacity", label: "Opacity", min: 0.4, max: 1, step: 0.01 },
  { key: "ambientDots", label: "Anchors", min: 2, max: 14, step: 1 },
];

function formatSetting(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export function LandingPage({ isAuthenticated, isConfigured }: LandingPageProps) {
  const [settings, setSettings] = useState<PhysarumSettings>(DEFAULT_SETTINGS);

  const primaryHref = isAuthenticated ? "/diary" : "/login";
  const primaryLabel = isAuthenticated ? "Открыть систему" : "Войти в систему";
  const secondaryHref = isAuthenticated ? "/analytics" : "/register";
  const secondaryLabel = isAuthenticated ? "Аналитика" : "Создать аккаунт";

  const stableSettings = useMemo(() => settings, [settings]);

  return (
    <main className="relative h-screen overflow-hidden bg-[#06110b] text-white">
      <LandingPhysarumBackground settings={stableSettings} />

      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_center,rgba(19,41,29,0)_0%,rgba(5,12,8,0.08)_56%,rgba(3,8,5,0.88)_100%)]" />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(6,17,11,0.22),rgba(6,17,11,0.52))]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1] h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(66,255,112,0.08),rgba(66,255,112,0))]" />

      <section className="relative z-10 mx-auto flex h-screen w-full max-w-[1600px] flex-col px-4 pb-4 pt-4 sm:px-6 lg:px-8">
        <header
          data-physarum-block
          className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] px-4 py-4 backdrop-blur-xl sm:rounded-full sm:px-6 sm:py-3"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/" className="flex items-center gap-3">
              <BrandGlyph />
              <BrandWordmark compact />
            </Link>

            <div className="hidden items-center gap-3 lg:flex">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[0.72rem] uppercase tracking-[0.28em] text-white/55">
                Live landing
              </span>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href={secondaryHref}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white/82 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.07]"
              >
                {secondaryLabel}
              </Link>
              <Link
                href={primaryHref}
                className="rounded-full border border-[rgba(87,255,132,0.24)] bg-[rgba(87,255,132,0.14)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_40px_rgba(87,255,132,0.12)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[rgba(87,255,132,0.18)]"
              >
                {primaryLabel}
              </Link>
            </div>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          {FLOATING_TAGS.map((tag) => (
            <div
              key={tag.label}
              data-physarum-block
              className={`absolute z-10 hidden rounded-[1.15rem] border border-white/8 bg-white/[0.035] px-7 py-4 text-sm text-white/70 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-white/16 hover:bg-white/[0.06] xl:block ${tag.className}`}
            >
              {tag.label}
            </div>
          ))}

          <section className="relative z-20 flex w-full max-w-[860px] flex-col items-center px-6 text-center">
            <div
              data-physarum-block
              className="rounded-full border border-[rgba(87,255,132,0.16)] bg-[rgba(11,27,18,0.6)] px-5 py-2 text-[0.8rem] tracking-[0.02em] text-white/78 backdrop-blur-md"
            >
              Diary AI
            </div>

            <h1
              data-physarum-block
              className="mt-6 max-w-[10ch] font-sans text-[clamp(3.7rem,8vw,7.3rem)] font-black leading-[0.9] tracking-[-0.08em] text-[#f2ffee]"
            >
              Понимай свою жизнь. Не просто записывай.
            </h1>

            <p
              data-physarum-block
              className="mt-6 max-w-[780px] text-[clamp(1rem,1.6vw,1.65rem)] leading-[1.6] text-white/62"
            >
              Дневник, который превращает записи, метрики и AI-разбор в ясную картину дня и периода.
            </p>

            <div data-physarum-block className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={isConfigured ? primaryHref : "#"}
                className="rounded-full border border-[rgba(87,255,132,0.22)] bg-[rgba(87,255,132,0.2)] px-8 py-4 text-lg font-semibold text-[#f4fff2] shadow-[0_0_44px_rgba(87,255,132,0.14)] transition-all duration-300 hover:-translate-y-1 hover:bg-[rgba(87,255,132,0.26)]"
              >
                Войти в систему
              </Link>
              <Link
                href={secondaryHref}
                className="rounded-full border border-white/10 bg-white/[0.04] px-8 py-4 text-lg text-white/82 transition-all duration-300 hover:-translate-y-1 hover:border-white/18 hover:bg-white/[0.07]"
              >
                {secondaryLabel}
              </Link>
            </div>

            {!isConfigured ? (
              <p className="mt-5 text-sm text-white/44">
                Среда ещё не настроена полностью. Точка входа активируется после конфигурации.
              </p>
            ) : null}
          </section>

          <aside
            data-physarum-block
            className="absolute left-4 top-[6.4rem] z-20 hidden h-[calc(100vh-9rem)] w-[280px] rounded-[1.6rem] border border-white/10 bg-[rgba(6,17,11,0.68)] p-4 backdrop-blur-xl xl:flex xl:flex-col"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[0.72rem] uppercase tracking-[0.26em] text-white/42">Physarum</div>
                <div className="mt-1 text-sm text-white/72">Параметры сцены</div>
              </div>
              <button
                type="button"
                onClick={() => setSettings(DEFAULT_SETTINGS)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/72 transition hover:border-white/20 hover:bg-white/[0.07]"
              >
                Reset
              </button>
            </div>

            <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
              {SETTING_FIELDS.map((field) => {
                const value = settings[field.key];

                return (
                  <label key={field.key} className="block">
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-white/70">
                      <span>{field.label}</span>
                      <span className="font-mono text-white/48">{formatSetting(value)}</span>
                    </div>
                    <input
                      type="range"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={value}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        setSettings((current) => ({
                          ...current,
                          [field.key]: field.key === "agentCount" || field.key === "ambientDots"
                            ? Math.round(nextValue)
                            : nextValue,
                        }));
                      }}
                      className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#57ff84]"
                    />
                  </label>
                );
              })}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
