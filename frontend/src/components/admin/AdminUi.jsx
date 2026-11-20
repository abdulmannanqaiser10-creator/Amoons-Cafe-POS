import { useCallback, useEffect, useId, useRef, useState } from "react";

import OmModal from "../orders/OmModal";
import { AlertIcon, RefreshIcon } from "../Icons";

/* ------------------------------------------------------------------ */
/* Notice (saved / failed feedback that never claims a lie)            */
/* ------------------------------------------------------------------ */

export function useNotice() {
  const [notice, setNotice] = useState(null);
  const timer = useRef(null);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    setNotice(null);
  }, []);

  const notify = useCallback(
    (tone, text) => {
      clearTimeout(timer.current);
      setNotice({ tone, text });
      timer.current = setTimeout(() => setNotice(null), tone === "error" ? 6000 : 3500);
    },
    []
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return { notice, notify, clear };
}

export function AdToast({ notice }) {
  if (!notice) return null;

  return (
    <div className={`ad-toast ad-toast--${notice.tone}`} role="status">
      {notice.text}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function AdHead({ title, sub, actions }) {
  return (
    <header className="ad-head">
      <div className="om-heading">
        <h1 className="om-title">{title}</h1>
        <p className="om-sub">{sub}</p>
      </div>

      <div className="om-head-actions">{actions}</div>
    </header>
  );
}

export function AdPanel({ id, title, sub, actions, children, className = "" }) {
  return (
    <section id={id} className={`ad-panel${className ? ` ad-panel--${className}` : ""}`}>
      {title ? (
        <div className="ad-panel-head">
          <div>
            <h2 className="ad-panel-title">{title}</h2>
            {sub ? <p className="ad-panel-sub">{sub}</p> : null}
          </div>

          {actions ? <div className="ad-panel-actions">{actions}</div> : null}
        </div>
      ) : null}

      <div className="ad-panel-body">{children}</div>
    </section>
  );
}

export function AdRefresh({ onClick, busy, label = "Refresh" }) {
  return (
    <button type="button" className="om-btn om-btn--ghost" onClick={onClick} disabled={busy}>
      <RefreshIcon className={`om-btn-icon${busy ? " om-spin" : ""}`} />
      {label}
    </button>
  );
}

/** First-load and failure states, so a section never shows an empty table. */
export function AdState({ status, error, onRetry, title = "Nothing to show yet" }) {
  if (status === "loading") {
    return (
      <div className="ad-loading" role="status" aria-live="polite">
        <RefreshIcon className="om-spin ad-loading-icon" />
        <span>Loading from the database…</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="ad-error">
        <AlertIcon className="ad-error-icon" />
        <div>
          <p className="ad-error-title">This could not be loaded</p>
          <p className="ad-error-text">{error}</p>
          <button type="button" className="om-btn om-btn--ghost" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (title) {
    return <p className="ad-blank">{title}</p>;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Form pieces                                                         */
/* ------------------------------------------------------------------ */

export function AdField({ label, hint, error, htmlFor, children, wide }) {
  return (
    <div className={`om-field${wide ? " om-field--wide" : ""}`}>
      {label ? (
        <label className="om-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}

      {children}

      {hint && !error ? <p className="om-hint">{hint}</p> : null}
      {error ? <p className="om-error">{error}</p> : null}
    </div>
  );
}

export function AdSwitch({ label, help, checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`st-toggle${checked ? "" : " st-toggle--off"}`}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className="st-toggle-track">
        <span className="st-toggle-knob" />
      </span>

      <span className="st-toggle-body">
        <span className="st-toggle-label">{label}</span>
        {help ? <span className="st-toggle-help">{help}</span> : null}
      </span>
    </button>
  );
}

/** A modal whose body is a form: Escape and the backdrop still close it. */
export function AdFormModal({
  title,
  subtitle,
  onClose,
  onSubmit,
  saving,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  error,
  children,
  size = "md",
}) {
  // The footer lives outside the modal body, so the save button reaches the
  // form by id rather than by nesting.
  const formId = useId().replace(/[^a-zA-Z0-9]/g, "");

  return (
    <OmModal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      size={size}
      footer={
        <>
          <button
            type="button"
            className="om-btn om-btn--ghost"
            onClick={onClose}
            disabled={saving}
          >
            {cancelLabel}
          </button>

          <button
            type="submit"
            className="om-btn om-btn--primary"
            form={formId}
            disabled={saving}
          >
            {saving ? "Saving…" : submitLabel}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="ad-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {error ? (
          <p className="om-form-error">
            <AlertIcon className="om-btn-icon" />
            {error}
          </p>
        ) : null}

        {children}
      </form>
    </OmModal>
  );
}
