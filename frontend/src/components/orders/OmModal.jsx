import { useEffect } from "react";
import { CloseIcon } from "../Icons";

export default function OmModal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = "md",
  closeLabel = "Close dialog",
}) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="om-overlay" onClick={onClose}>
      <div
        className={`om-modal om-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="om-modal-head">
          <div className="om-modal-heading">
            <h2 className="om-modal-title">{title}</h2>
            {subtitle ? <p className="om-modal-sub">{subtitle}</p> : null}
          </div>

          <button
            type="button"
            className="om-modal-close"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <CloseIcon className="om-modal-close-icon" />
          </button>
        </header>

        <div className="om-modal-body">{children}</div>

        {footer ? <footer className="om-modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}
