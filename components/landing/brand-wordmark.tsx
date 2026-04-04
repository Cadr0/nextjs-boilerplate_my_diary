export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`leading-none ${compact ? "text-2xl" : "text-[2rem] sm:text-[2.25rem]"}`}>
      <span className="font-semibold tracking-[-0.04em] text-[#1f9a96]">Diary</span>
      <span className="ml-2 font-semibold tracking-[-0.04em] text-[#2b73a8]">AI</span>
    </span>
  );
}
