"use client";

import Link from "next/link";

import { LogoutButton } from "@/components/logout-button";
import { useWorkspace } from "@/components/workspace-provider";
import {
  ProfileField,
  ProfileTextarea,
  SectionCard,
  SectionHeader,
  SmallToggle,
} from "@/components/workspace-ui";

export function ProfileSection() {
  const { profile, updateProfile, accountEmail, accountInfo } = useWorkspace();
  const providerLabel =
    accountInfo?.provider === "google"
      ? "Google"
      : accountInfo?.provider === "email"
        ? "Email"
        : accountInfo?.provider ?? "unknown";

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <SectionCard className="rounded-[32px] p-5 sm:p-6">
        <SectionHeader
          eyebrow="Settings"
          title="Настройки"
          description="Здесь собраны параметры профиля, интерфейса и данные активной учетной записи, чтобы можно было сразу проверить, под каким пользователем открыт кабинет."
        />

        <div className="mt-6 grid gap-6">
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold text-[var(--foreground)]">Учетная запись</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-[var(--foreground)]">Email</span>
                <input
                  value={accountInfo?.email ?? accountEmail ?? ""}
                  readOnly
                  className="min-h-12 rounded-2xl border border-[var(--border)] bg-[rgba(244,247,244,0.92)] px-4 text-sm text-[var(--muted)] outline-none"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-[var(--foreground)]">User ID</span>
                <input
                  value={accountInfo?.userId ?? ""}
                  readOnly
                  className="min-h-12 rounded-2xl border border-[var(--border)] bg-[rgba(244,247,244,0.92)] px-4 text-sm text-[var(--muted)] outline-none"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-[var(--foreground)]">Provider</span>
                <input
                  value={providerLabel}
                  readOnly
                  className="min-h-12 rounded-2xl border border-[var(--border)] bg-[rgba(244,247,244,0.92)] px-4 text-sm text-[var(--muted)] outline-none"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  Email confirmed
                </span>
                <input
                  value={accountInfo ? (accountInfo.emailConfirmed ? "Yes" : "No") : ""}
                  readOnly
                  className="min-h-12 rounded-2xl border border-[var(--border)] bg-[rgba(244,247,244,0.92)] px-4 text-sm text-[var(--muted)] outline-none"
                />
              </label>
              <ProfileField
                label="Имя"
                value={profile.firstName}
                onChange={(value) => updateProfile("firstName", value)}
              />
              <ProfileField
                label="Фамилия"
                value={profile.lastName}
                onChange={(value) => updateProfile("lastName", value)}
              />
              <ProfileField
                label="Часовой пояс"
                value={profile.timezone}
                onChange={(value) => updateProfile("timezone", value)}
              />
              <ProfileField
                label="Локаль"
                value={profile.locale}
                onChange={(value) => updateProfile("locale", value)}
              />
            </div>
          </section>

          <section className="grid gap-4">
            <h2 className="text-xl font-semibold text-[var(--foreground)]">Личный контекст</h2>
            <ProfileTextarea
              label="Фокус системы"
              value={profile.focus}
              onChange={(value) => updateProfile("focus", value)}
            />
            <ProfileTextarea
              label="Личная цель"
              value={profile.wellbeingGoal}
              onChange={(value) => updateProfile("wellbeingGoal", value)}
            />
            <ProfileTextarea
              label="Коротко о себе"
              value={profile.bio}
              onChange={(value) => updateProfile("bio", value)}
            />
          </section>

          <section className="grid gap-4">
            <h2 className="text-xl font-semibold text-[var(--foreground)]">
              Поведение интерфейса
            </h2>
            <div className="grid gap-3 rounded-[24px] border border-[var(--border)] bg-[rgba(247,250,247,0.84)] p-4">
              <div className="flex flex-wrap gap-2">
                <SmallToggle
                  active={profile.compactMetrics}
                  onClick={() => updateProfile("compactMetrics", !profile.compactMetrics)}
                  label="компактные метрики"
                />
                <SmallToggle
                  active={profile.keepRightRailOpen}
                  onClick={() =>
                    updateProfile("keepRightRailOpen", !profile.keepRightRailOpen)
                  }
                  label="закрепить правый rail"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-[var(--foreground)]">
                    Начало недели
                  </span>
                  <select
                    value={profile.weekStartsOn}
                    onChange={(event) => updateProfile("weekStartsOn", event.target.value)}
                    className="min-h-12 rounded-2xl border border-[var(--border)] bg-white/90 px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                  >
                    <option value="monday">Понедельник</option>
                    <option value="sunday">Воскресенье</option>
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-[var(--foreground)]">Тон AI</span>
                  <select
                    value={profile.chatTone}
                    onChange={(event) => updateProfile("chatTone", event.target.value)}
                    className="min-h-12 rounded-2xl border border-[var(--border)] bg-white/90 px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                  >
                    <option value="supportive">Поддерживающий</option>
                    <option value="direct">Более прямой</option>
                    <option value="coach">Как coach</option>
                  </select>
                </label>
              </div>
            </div>
          </section>
        </div>
      </SectionCard>

      <div className="grid gap-4">
        <SectionCard className="rounded-[30px] p-4 sm:p-5">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Что уже готово</h2>
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-[var(--muted)]">
            <li>В аккаунте теперь видно, какой email и какой provider реально привязаны к текущей сессии.</li>
            <li>User ID можно сразу сверить с `auth.users` и записями в таблицах Supabase.</li>
            <li>Статус подтверждения email теперь виден прямо в интерфейсе кабинета.</li>
          </ul>
        </SectionCard>

        <SectionCard className="rounded-[30px] p-4 sm:p-5">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Сессия</h2>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            Здесь можно быстро проверить активную учетную запись и при необходимости выйти,
            чтобы зайти под другим пользователем.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <LogoutButton />
            <Link
              href="/diagnostics"
              className="rounded-full border border-[var(--border)] bg-white/80 px-4 py-2 text-sm text-[var(--foreground)] transition hover:bg-white"
            >
              Открыть диагностику
            </Link>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
