import {
  AlertIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "./Icons";

export function MetricCard({ label, value, hint, icon: Icon, tone = "" }) {
  return (
    <article className={`mp-metric${tone ? ` mp-metric--${tone}` : ""}`}>
      <span className="mp-metric-icon">{Icon ? <Icon /> : null}</span>
      <span className="mp-metric-body">
        <span className="mp-metric-label">{label}</span>
        <strong className="mp-metric-value">{value}</strong>
        {hint ? <span className="mp-metric-hint">{hint}</span> : null}
      </span>
    </article>
  );
}

export function PageNotice({ notice, onDismiss }) {
  if (!notice) return null;

  return (
    <div className={`mp-notice mp-notice--${notice.type}`} role="status" aria-live="polite">
      {notice.type === "error" ? <AlertIcon /> : <CheckCircleIcon />}
      <span>{notice.text}</span>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} aria-label="Dismiss message">
          ×
        </button>
      ) : null}
    </div>
  );
}

export function SelectFilter({ label, value, onChange, options, className = "" }) {
  return (
    <label className={`mp-select-filter ${className}`}>
      <span>{label}</span>
      <span className="mp-select-control">
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon />
      </span>
    </label>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const numbers = [];
  const first = Math.max(1, Math.min(page - 1, pages - 2));
  for (let number = first; number <= Math.min(pages, first + 2); number += 1) {
    numbers.push(number);
  }

  return (
    <footer className="mp-pagination">
      <span className="mp-pagination-range">
        Showing {start}–{end} of {total}
      </span>
      <div className="mp-pagination-controls">
        <button
          type="button"
          className="mp-page-button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeftIcon />
        </button>
        {numbers.map((number) => (
          <button
            type="button"
            className={`mp-page-button${number === page ? " mp-page-button--active" : ""}`}
            key={number}
            onClick={() => onPageChange(number)}
            aria-current={number === page ? "page" : undefined}
          >
            {number}
          </button>
        ))}
        <button
          type="button"
          className="mp-page-button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          aria-label="Next page"
        >
          <ChevronRightIcon />
        </button>
        <label className="mp-page-size">
          <span className="sr-only">Rows per page</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}/page
              </option>
            ))}
          </select>
          <ChevronDownIcon />
        </label>
      </div>
    </footer>
  );
}

export function StateBlock({ status, error, onRetry, empty = "No records found." }) {
  if (status === "loading") {
    return <div className="mp-state" role="status">Loading records…</div>;
  }
  if (status === "error") {
    return (
      <div className="mp-state mp-state--error" role="alert">
        <p>{error}</p>
        <button type="button" className="om-btn om-btn--ghost" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  return <div className="mp-state">{empty}</div>;
}
