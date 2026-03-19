"use client";

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
  const { profile, updateProfile } = useWorkspace();

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <SectionCard className="rounded-[32px] p-5 sm:p-6">
        <SectionHeader
          eyebrow="Settings"
          title="Настройки"
          description="Подготовил основу под полноценный settings-экран: профиль, поведение интерфейса, компактность метрик и рабочие предпочтения для AI-помощника."
        />

        <div className="mt-6 grid gap-6">
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold text-[var(--foreground)]">Аккаунт</h2>
            <div className="grid gap-4 sm:grid-cols-2">
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
            <h2 className="text-xl font-semibold text-[var(--foreground)]">Поведение интерфейса</h2>
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
            <li>Правый AI-rail теперь рассчитан на присутствие во всех разделах.</li>
            <li>Плотность метрик и поведение интерфейса уже сохранены в модели профиля.</li>
            <li>Экран настроек можно дальше расширять без миграции UI.</li>
          </ul>
        </SectionCard>

        <SectionCard className="rounded-[30px] p-4 sm:p-5">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Сессия</h2>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            Кнопку выхода перенёс сюда, в блок настроек аккаунта, как основу для будущей
            security-секции.
          </p>
          <div className="mt-4">
            <LogoutButton />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
