type BrandGlyphProps = {
  className?: string;
  iconClassName?: string;
};

export function BrandGlyph({ className, iconClassName }: BrandGlyphProps) {
  const rootClassName = [
    "relative flex items-center justify-center overflow-hidden rounded-2xl bg-[linear-gradient(160deg,#2f9f93_0%,#2f6f61_100%)]",
    className ?? "h-11 w-11",
  ]
    .filter(Boolean)
    .join(" ");

  const glyphClassName = ["relative text-white", iconClassName ?? "h-5 w-5"]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={rootClassName} aria-hidden="true">
      <span className="absolute inset-0 bg-[linear-gradient(135deg,transparent_52%,rgba(22,81,74,0.45)_52%)]" />
      <svg viewBox="0 0 24 24" className={glyphClassName} fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="5.2" y="4.4" width="13.6" height="15.2" rx="2.2" fill="rgba(255,255,255,0.95)" stroke="none" />
        <path d="M7.4 4.4v15.2" stroke="#d6ece8" />
        <path d="M14.6 4.4h3.2v4.5l-1.6-1-1.6 1V4.4Z" fill="#2b73a8" stroke="none" />
      </svg>
    </span>
  );
}
