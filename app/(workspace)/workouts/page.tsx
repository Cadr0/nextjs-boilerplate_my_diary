import { WorkoutsPageShell } from "@/components/workouts-ai/workouts-page-shell";
import { readSelectedWorkoutDate } from "@/lib/workouts-ai/page-data";

type WorkoutsPageProps = {
  searchParams?: Promise<{
    date?: string | string[] | undefined;
  }>;
};

export default async function WorkoutsPage(props: WorkoutsPageProps) {
  const resolvedSearchParams = props.searchParams ? await props.searchParams : {};
  const selectedDate = readSelectedWorkoutDate(resolvedSearchParams.date);

  return <WorkoutsPageShell initialSelectedDate={selectedDate} />;
}
