"use client";

import dynamic from "next/dynamic";

const AnalyticsSection = dynamic(
  () => import("@/components/analytics-section").then((module) => module.AnalyticsSection),
  {
    ssr: false,
    loading: () => (
      <div className="px-4 py-6 text-sm text-[var(--muted)] sm:px-6">
        Загружаем аналитику...
      </div>
    ),
  },
);

export default function AnalyticsPage() {
  return <AnalyticsSection />;
}
