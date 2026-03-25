type BrandGlyphProps = {
  className?: string;
  iconClassName?: string;
};

export function BrandGlyph({ className, iconClassName }: BrandGlyphProps) {
  const rootClassName = [
    "relative flex items-center justify-center overflow-hidden rounded-2xl bg-[linear-gradient(155deg,#2fb0a5_0%,#2f6f61_100%)]",
    className ?? "h-11 w-11",
  ]
    .filter(Boolean)
    .join(" ");

  const glyphClassName = ["relative", iconClassName ?? "h-[86%] w-[86%]"]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={rootClassName} aria-hidden="true">
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_24%_16%,rgba(255,255,255,0.2),transparent_55%)]" />
      <svg viewBox="0 0 64 64" className={glyphClassName} fill="none">
        <rect x="8" y="6" width="48" height="52" rx="9" fill="rgba(255,255,255,0.98)" />
        <path d="M15 6v52" stroke="#D8EAE4" strokeWidth="3.6" />
        <path d="M41 6h12v16l-6-3.2L41 22V6Z" fill="#2B73A8" />
        <path
          d="M29 37.5 36 22.2c.8-1.7 3-1.7 3.8 0l7 15.3M31.4 33h13.4M50 23.4v14"
          stroke="#2F7A6D"
          strokeWidth="3.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
