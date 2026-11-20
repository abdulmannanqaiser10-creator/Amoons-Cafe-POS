import OmModal from "./OmModal";
import { AlertIcon } from "../Icons";

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Keep it",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <OmModal
      title={title}
      size="sm"
      onClose={busy ? () => {} : onCancel}
      footer={
        <>
          <button
            type="button"
            className="om-btn om-btn--ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            className={`om-btn om-btn--${tone}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="om-confirm">
        <span className="om-confirm-icon">
          <AlertIcon />
        </span>
        <p className="om-confirm-text">{message}</p>
      </div>
    </OmModal>
  );
}
