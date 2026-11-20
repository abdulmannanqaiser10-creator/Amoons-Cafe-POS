import { useCallback, useEffect, useState } from "react";

import { adminApi, authApi, companyApi, errorMessage } from "../../api/client";
import {
  AdField,
  AdHead,
  AdPanel,
  AdRefresh,
  AdState,
  AdSwitch,
  AdToast,
  useNotice,
} from "../../components/admin/AdminUi";
import ConfirmDialog from "../../components/orders/ConfirmDialog";
import {
  AlertIcon,
  CheckCircleIcon,
  PlusIcon,
  ShieldIcon,
  TrashIcon,
} from "../../components/Icons";

const SECTIONS = [
  { id: "business", label: "Business" },
  { id: "tax", label: "Tax & Currency" },
  { id: "receipt", label: "Receipts" },
  { id: "security", label: "Security" },
];

const INPUT_CLASS = "om-input";

/** The logo is stored inline as base64, so the file has to stay small. */
const LOGO_MAX_BYTES = 200 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

function BusinessSettings({ onChanged }) {
  const [settings, setSettings] = useState(null);
  const [active, setActive] = useState("business");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [pinForm, setPinForm] = useState({ pin: "", confirm: "" });
  const [pinBusy, setPinBusy] = useState(false);
  const { notice, notify } = useNotice();

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");

    try {
      const result = await companyApi.get();
      if (!result.canEdit) throw new Error("Manager access is required.");
      setSettings(result.settings);
      setStatus("ready");
    } catch (problem) {
      setError(errorMessage(problem, "Could not load business settings."));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The PIN form edits the signed-in manager's own account, and /auth/me is
  // the only endpoint that is guaranteed to know who that is.
  useEffect(() => {
    let active = true;

    authApi
      .me()
      .then((user) => {
        if (active) setAdmin(user);
      })
      .catch(() => {
        // Reported on submit instead of failing the whole settings page.
      });

    return () => {
      active = false;
    };
  }, []);

  const update = (key, field, value) =>
    setSettings((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));

  const save = async () => {
    if (!settings || busy) return;

    setBusy(true);
    try {
      const result = await companyApi.save(active, settings[active]);
      setSettings((current) => ({ ...current, [active]: result[active] }));
      const refreshed =
        ["business", "tax", "receipt"].includes(active) && onChanged
          ? await onChanged()
          : true;
      notify(
        "success",
        refreshed === false
          ? `${result.message || `${active} settings saved.`} Till refresh failed; refresh the till before taking more orders.`
          : result.message || `${active} settings saved.`
      );
    } catch (problem) {
      notify("error", errorMessage(problem, "Could not save these settings."));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!resetting || busy) return;

    setBusy(true);
    try {
      const result = await companyApi.reset(resetting);
      setSettings((current) => ({ ...current, [resetting]: result[resetting] }));
      const refreshed =
        ["business", "tax", "receipt"].includes(resetting) && onChanged
          ? await onChanged()
          : true;
      notify(
        "success",
        refreshed === false
          ? `${result.message || `${resetting} settings reset.`} Till refresh failed; refresh the till before taking more orders.`
          : result.message || `${resetting} settings reset.`
      );
      setResetting(null);
    } catch (problem) {
      notify("error", errorMessage(problem, "Could not reset these settings."));
    } finally {
      setBusy(false);
    }
  };

  const current = settings?.[active];

  /** Reads a chosen image into the inline data URL the API stores. */
  const pickLogo = (event) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) return;

    if (!LOGO_TYPES.includes(file.type)) {
      notify("error", "Logo must be a PNG, JPEG or WebP image.");
      return;
    }

    if (file.size > LOGO_MAX_BYTES) {
      notify("error", "Logo must be smaller than 200 KB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => update("business", "logo", String(reader.result ?? ""));
    reader.onerror = () => notify("error", "Could not read that image file.");
    reader.readAsDataURL(file);
  };

  /**
   * Resets the manager PIN through the same staff endpoint the Staff section
   * uses, so it is hashed and uniqueness-checked exactly once, in one place.
   */
  const submitPin = async (event) => {
    event.preventDefault();
    if (pinBusy) return;

    const pin = pinForm.pin.trim();
    const confirmation = pinForm.confirm.trim();

    if (!/^\d{5}$/.test(pin)) {
      notify("error", "PIN must be exactly 5 digits.");
      return;
    }

    if (pin !== confirmation) {
      notify("error", "The two PINs do not match.");
      return;
    }

    if (!admin) {
      notify("error", "The manager account is still loading — try again.");
      return;
    }

    setPinBusy(true);
    try {
      const result = await adminApi.staff.update(admin.id, {
        name: admin.name,
        role: admin.role,
        pin,
      });
      setPinForm({ pin: "", confirm: "" });
      notify("success", result.message || "The admin PIN has been updated.");
    } catch (problem) {
      notify("error", errorMessage(problem, "Could not update the admin PIN."));
    } finally {
      setPinBusy(false);
    }
  };

  if (status !== "ready") {
    return (
      <div className="ad-page">
        <AdHead
          title="Business Settings"
          sub="Configure the business profile and POS rules."
          actions={<AdRefresh onClick={load} busy={status === "loading"} />}
        />
        <AdState status={status} error={error} onRetry={load} title="" />
      </div>
    );
  }

  return (
    <div className="ad-page ad-settings-page">
      <AdToast notice={notice} />
      <AdHead
        title="Settings"
        sub="Business profile, tax, receipts, and security for the whole POS"
        actions={
          <>
            <button
              type="button"
              className="om-btn om-btn--ghost"
              onClick={() => setResetting(active)}
              disabled={busy}
            >
              Reset section
            </button>
            <button
              type="button"
              className="om-btn om-btn--primary"
              onClick={save}
              disabled={busy}
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
            <AdRefresh onClick={load} busy={status === "loading"} />
          </>
        }
      />

      <div className="ad-settings-layout">
      <nav className="ad-settings-nav" aria-label="Business settings sections">
        {SECTIONS.map(({ id, label }) => (
          <button
            type="button"
            key={id}
            className={`ad-settings-nav-btn${active === id ? " ad-settings-nav-btn--on" : ""}`}
            onClick={() => setActive(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="ad-settings-main">

      {active === "business" ? (
        <AdPanel title="Business Profile" sub="Shown on receipts and used for the business tax profile.">
          <div className="ad-form">
            <AdField
              label="Business Logo"
              hint="Printed at the top of every customer receipt. PNG, JPEG or WebP, under 200 KB."
              wide
            >
              <div className="ad-logo">
                {current.logo ? (
                  <img
                    className="ad-logo-preview"
                    src={current.logo}
                    alt="Business logo preview"
                  />
                ) : (
                  <span className="ad-logo-empty">No logo uploaded yet</span>
                )}

                <span className="ad-logo-actions">
                  <label className="om-btn om-btn--ghost ad-logo-pick">
                    <PlusIcon className="om-btn-icon" />
                    {current.logo ? "Replace logo" : "Choose image"}
                    <input
                      type="file"
                      accept={LOGO_TYPES.join(",")}
                      onChange={pickLogo}
                    />
                  </label>

                  {current.logo ? (
                    <button
                      type="button"
                      className="om-btn om-btn--ghost"
                      onClick={() => update("business", "logo", "")}
                    >
                      <TrashIcon className="om-btn-icon" />
                      Remove
                    </button>
                  ) : null}
                </span>
              </div>
            </AdField>
            <AdField label="Business Name">
              <input className={INPUT_CLASS} maxLength="120" value={current.name} onChange={(event) => update(active, "name", event.target.value)} />
            </AdField>
            <AdField label="Tagline">
              <input className={INPUT_CLASS} maxLength="120" value={current.tagline} onChange={(event) => update(active, "tagline", event.target.value)} />
            </AdField>
            <AdField label="Phone">
              <input className={INPUT_CLASS} maxLength="40" value={current.phone} onChange={(event) => update(active, "phone", event.target.value)} />
            </AdField>
            <AdField label="Email">
              <input className={INPUT_CLASS} type="email" maxLength="160" value={current.email} onChange={(event) => update(active, "email", event.target.value)} />
            </AdField>
            <AdField label="Address">
              <textarea className={INPUT_CLASS} maxLength="300" rows="2" value={current.address} onChange={(event) => update(active, "address", event.target.value)} />
            </AdField>
            <AdField label="Tax Number">
              <input className={INPUT_CLASS} maxLength="60" value={current.taxNumber} onChange={(event) => update(active, "taxNumber", event.target.value)} />
            </AdField>
            <AdField label="Currency">
              <select className="om-select" value={current.currency} onChange={(event) => update(active, "currency", event.target.value)}>
                {["Rs", "$", "€", "£"].map((currency) => <option key={currency}>{currency}</option>)}
              </select>
            </AdField>
          </div>
        </AdPanel>
      ) : null}

      {active === "tax" ? (
        <AdPanel title="Tax Settings" sub="These rules are applied to new orders and saved on each bill.">
          <div className="ad-form">
            <div className="ad-switches">
              <AdSwitch label="Enable sales tax" checked={current.enabled} onChange={(value) => update(active, "enabled", value)} />
              <AdSwitch label="Prices include tax" help="When enabled, tax is extracted from menu prices instead of added on top." checked={current.inclusive} onChange={(value) => update(active, "inclusive", value)} disabled={!current.enabled} />
            </div>
            <AdField label="Tax Label">
              <input className={INPUT_CLASS} maxLength="40" value={current.label} onChange={(event) => update(active, "label", event.target.value)} />
            </AdField>
            <AdField label="Rate (%)" hint="Enter a rate from 0 to 100.">
              <input className={INPUT_CLASS} type="number" min="0" max="100" step="0.01" value={current.rate} onChange={(event) => update(active, "rate", Number(event.target.value))} disabled={!current.enabled} />
            </AdField>
          </div>
        </AdPanel>
      ) : null}

      {active === "receipt" ? (
        <AdPanel title="Receipt Settings" sub="Choose what customer receipts display.">
          <div className="ad-form">
            <div className="ad-switches">
              <AdSwitch label="Show business name" checked={current.showBusinessName} onChange={(value) => update(active, "showBusinessName", value)} />
              <AdSwitch label="Show tax number" checked={current.showTaxNumber} onChange={(value) => update(active, "showTaxNumber", value)} />
              <AdSwitch label="Show payment details" checked={current.showPaymentDetails} onChange={(value) => update(active, "showPaymentDetails", value)} />
              <AdSwitch label="Show item prices" checked={current.showItemPrices} onChange={(value) => update(active, "showItemPrices", value)} />
            </div>
            <AdField label="Header Message">
              <input className={INPUT_CLASS} maxLength="120" value={current.headerMessage} onChange={(event) => update(active, "headerMessage", event.target.value)} />
            </AdField>
            <AdField label="Footer Message">
              <input className={INPUT_CLASS} maxLength="160" value={current.footerMessage} onChange={(event) => update(active, "footerMessage", event.target.value)} />
            </AdField>
          </div>
        </AdPanel>
      ) : null}

      {active === "security" ? (
        <AdPanel title="Security Settings" sub="Configure session lock and manager approval requirements.">
          <div className="ad-form">
            <AdField label="Idle Lock (minutes)" hint="Use 0 to disable the idle lock. Maximum 240 minutes.">
              <input className={INPUT_CLASS} type="number" min="0" max="240" step="1" value={current.idleLockMinutes} disabled readOnly />
            </AdField>
            <p className="om-hint"><AlertIcon className="om-btn-icon" /> Automatic idle locking is not available in this deployment; the saved value is preserved when you update other security settings.</p>
            <div className="ad-switches">
              <AdSwitch label="Require manager PIN for reversals" help="An authorized reversal permission or manager PIN is still required by the reversal endpoint." checked={current.requireManagerPinForReversal} onChange={(value) => update(active, "requireManagerPinForReversal", value)} />
            </div>

            <form className="ad-pin" onSubmit={submitPin}>
              <div className="ad-pin-head">
                <span className="ad-pin-icon" aria-hidden="true">
                  <ShieldIcon />
                </span>
                <span>
                  <strong>Admin PIN</strong>
                  <small>
                    {admin
                      ? `Signed in as ${admin.name} — used on the login keypad.`
                      : "Loading the manager account…"}
                  </small>
                </span>
              </div>

              <div className="ad-pin-grid">
                <AdField label="New Admin PIN" hint="Exactly 5 digits.">
                  <input
                    className={INPUT_CLASS}
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength="5"
                    value={pinForm.pin}
                    onChange={(event) =>
                      setPinForm((form) => ({
                        ...form,
                        pin: event.target.value.replace(/\D/g, "").slice(0, 5),
                      }))
                    }
                  />
                </AdField>

                <AdField label="Confirm New PIN">
                  <input
                    className={INPUT_CLASS}
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength="5"
                    value={pinForm.confirm}
                    onChange={(event) =>
                      setPinForm((form) => ({
                        ...form,
                        confirm: event.target.value.replace(/\D/g, "").slice(0, 5),
                      }))
                    }
                  />
                </AdField>
              </div>

              <div className="ad-pin-foot">
                <button
                  type="submit"
                  className="om-btn om-btn--primary"
                  disabled={pinBusy || !admin}
                >
                  <CheckCircleIcon className="om-btn-icon" />
                  {pinBusy ? "Updating…" : "Update Admin PIN"}
                </button>
                <p className="om-hint">
                  Stored as a one-way hash — the panel never keeps the digits in
                  plain text.
                </p>
              </div>
            </form>
          </div>
        </AdPanel>
      ) : null}

      <div className="ad-form-foot">
        <button type="button" className="om-btn om-btn--primary" onClick={save} disabled={busy}>
          <CheckCircleIcon className="om-btn-icon" />
          {busy ? "Saving…" : "Save Changes"}
        </button>
        <button type="button" className="om-btn om-btn--ghost" onClick={() => setResetting(active)} disabled={busy}>
          Reset Section
        </button>
      </div>
      </div>
      </div>

      {resetting ? (
        <ConfirmDialog
          title={`Reset ${resetting} settings?`}
          message="This section will be restored to its factory defaults."
          confirmLabel={busy ? "Resetting…" : "Reset Section"}
          busy={busy}
          onConfirm={reset}
          onCancel={() => setResetting(null)}
        />
      ) : null}
    </div>
  );
}

export default BusinessSettings;
