import Link from "next/link";

import { RevealSection } from "@/components/landing/reveal-section";

export function LandingCta({
  registerHref,
  loginHref,
}: {
  registerHref: string;
  loginHref: string;
}) {
  return (
    <RevealSection className="pb-16 pt-8 lg:pb-24" delay={120}>
      <section className="rounded-[2.2rem] border border-white/75 bg-[linear-gradient(145deg,rgba(20,66,56,0.95),rgba(34,90,110,0.95))] p-6 text-white shadow-[0_28px_64px_rgba(20,39,34,0.24)] sm:p-10">
        <h2 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          Начните видеть свою жизнь яснее
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/80 sm:text-base">
          Записывайте меньше. Понимайте больше. Дневник, метрики, AI-анализ и память в одной системе.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href={registerHref}
            className="min-w-[11rem] rounded-full bg-white px-5 py-3 text-center text-sm font-semibold text-[#18463c] transition hover:-translate-y-0.5"
          >
            Создать аккаунт
          </Link>
          <Link
            href={loginHref}
            className="min-w-[8rem] rounded-full border border-white/30 bg-white/10 px-5 py-3 text-center text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-white/16"
          >
            Войти
          </Link>
        </div>
      </section>
    </RevealSection>
  );
}
