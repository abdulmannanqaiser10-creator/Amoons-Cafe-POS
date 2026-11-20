/** Official Lexcore Solutions mark — SVG wordmark + icon. */

export function LexcoreMark({ className = "", title = "Lexcore Solutions" }) {
  return (
    <svg
      className={`lexcore-mark ${className}`.trim()}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : "presentation"}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id="lexcoreGrad" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7A0C31" />
          <stop offset="55%" stopColor="#4A001D" />
          <stop offset="100%" stopColor="#1E0A12" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#lexcoreGrad)" />
      <path
        d="M18 18h12.5c8.4 0 13.8 4.8 13.8 12.2 0 7.3-5.4 12.1-13.8 12.1H26.2V46H18V18zm8.2 7.2v10.1h3.8c3.7 0 5.9-1.9 5.9-5.05 0-3.15-2.2-5.05-5.9-5.05H26.2z"
        fill="#fff"
      />
      <circle cx="46" cy="46" r="5" fill="#F5C518" />
    </svg>
  );
}

export default function LexcoreLogo({
  className = "",
  compact = false,
  light = false,
  showWordmark = true,
}) {
  return (
    <span
      className={`lexcore-logo${compact ? " lexcore-logo--compact" : ""}${
        light ? " lexcore-logo--light" : ""
      }${className ? ` ${className}` : ""}`}
    >
      <LexcoreMark />
      {showWordmark ? (
        <span className="lexcore-logo-text">
          <strong>Lexcore Solutions</strong>
          {compact ? null : <small>Intelligent Digital Solutions</small>}
        </span>
      ) : null}
    </span>
  );
}
