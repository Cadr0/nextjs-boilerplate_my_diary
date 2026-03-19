"use client";

import { useWorkspace } from "@/components/workspace-provider";
import {
  ProfileField,
  ProfileTextarea,
  SectionCard,
  SectionHeader,
} from "@/components/workspace-ui";

export function ProfileSection() {
  const { profile, updateProfile } = useWorkspace();

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <SectionCard className="rounded-[32px] p-5 sm:p-6">
        <SectionHeader
          eyebrow="Profile"
          title="Профиль"
          description="Пока профиль хранится локально и помогает настроить рабочее пространство. Следующим шагом его можно будет вынести в `profiles`."
        />

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
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

        <div className="mt-4 grid gap-4">
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
        </div>
      </SectionCard>

      <div className="grid gap-4">
        <SectionCard className="rounded-[30px] p-4 sm:p-5">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Что уже готово</h2>
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-[var(--muted)]">
            <li>Дневник и история работают на общей модели дня.</li>
            <li>Core-метрики сохраняются через API.</li>
            <li>Расширенные поля профиля уже готовы под будущий `profiles`.</li>
          </ul>
        </SectionCard>

        <SectionCard className="rounded-[30px] p-4 sm:p-5">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Следующий этап</h2>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            После стабилизации экрана `/diary` логично перенести профиль, задачи и
            гибкие метрики в базу и связать их с AI-потоком без ломки интерфейса.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
