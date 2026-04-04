export function FloatingUiCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[1.4rem] border border-white/75 bg-white/85 p-4 shadow-[0_20px_46px_rgba(24,33,29,0.1)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_58px_rgba(24,33,29,0.14)] ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
