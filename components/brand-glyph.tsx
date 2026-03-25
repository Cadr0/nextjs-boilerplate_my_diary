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
        <path
          d="M22 8h18c4.7 0 8.5 3.8 8.5 8.5V48c0 4.4-3.6 8-8 8H22.8c-4.6 0-8.3-3.7-8.3-8.3V16.5C14.5 11.8 17.3 8 22 8Z"
          fill="rgba(255,255,255,0.98)"
        />
        <path d="M22.5 8v48" stroke="#D8EAE4" strokeWidth="3.5" />
        <path d="M37.5 8H48.5V22.4L43 19.2 37.5 22.4V8Z" fill="#2B73A8" />
        <path
          d="M48.5 26.8V48c0 4.4-3.6 8-8 8H22.8c-1.6 0-3.2-.5-4.5-1.3L48.5 26.8Z"
          fill="rgba(21,79,107,0.11)"
        />
        <path
          d="M24.8 39.2H29l3.3-7.3 4 13 3.2-8.3h4.7"
          stroke="#2F7A6D"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="24.2" cy="39.2" r="1.8" fill="#2F7A6D" />
        <circle cx="44.8" cy="36.6" r="1.8" fill="#2F7A6D" />
      </svg>
    </span>
  );
}
