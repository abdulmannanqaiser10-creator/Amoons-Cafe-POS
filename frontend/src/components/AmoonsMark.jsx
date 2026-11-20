/** Simple Amoons wordmark / crest for Admin rail footer. */

export default function AmoonsMark({ className = "" }) {
  return (
    <div className={`amoons-mark${className ? ` ${className}` : ""}`} aria-label="Amoons">
      <svg className="amoons-mark-icon" viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <path
          d="M34 62C22 62 14 54 14 44C14 36 20 29 28 27C29 16 38 8 50 8C62 8 71 16 72 27C80 29 86 36 86 44C86 54 78 62 66 62Z"
          stroke="currentColor"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M34 62h32v12a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6z"
          stroke="currentColor"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M45 64v14M55 64v14" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
      </svg>
      <span className="amoons-mark-text">
        <strong>AMOONS</strong>
        <small>Cafe</small>
      </span>
    </div>
  );
}
