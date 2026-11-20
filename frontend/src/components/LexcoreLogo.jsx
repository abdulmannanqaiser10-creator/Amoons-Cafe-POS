const LOGO_SRC = "/lexcorelogo.png";

/** Official Lexcore Solutions mark — PNG lockup. */
export function LexcoreMark({ className = "", title = "Lexcore Solutions" }) {
  return (
    <img
      className={`lexcore-mark lexcore-mark--png ${className}`.trim()}
      src={LOGO_SRC}
      alt={title || "Lexcore Solutions"}
      title={title || undefined}
      decoding="async"
      draggable={false}
    />
  );
}

export default function LexcoreLogo({
  className = "",
  compact = false,
  light = false,
  showWordmark = false,
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
