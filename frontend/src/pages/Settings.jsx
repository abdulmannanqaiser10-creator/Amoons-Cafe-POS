import { useCallback, useEffect, useState } from "react";

import {
  authApi,
  errorMessage,
  menuApi,
  settingsApi,
  staffApi,
} from "../api/client";
import ModuleNav from "../components/ModuleNav";
import ConfirmDialog from "../components/orders/ConfirmDialog";
import {
  AlertIcon,
  BellIcon,
  CheckCircleIcon,
  GearIcon,
  PrinterIcon,
  RefreshIcon,
  ReceiptIcon,
  ShieldIcon,
  UserIcon,
} from "../components/Icons";
import { PageNotice } from "../components/PosPageUi";
import { applyPrinterSettings, PRINTER_DEFAULTS, testSample } from "../utils/printer";
import { printReceipt } from "../utils/receipt";
import {
  DISPLAY_DEFAULTS,
  FONT_SIZE_OPTIONS,
  FONT_STYLE_OPTIONS,
  getDisplayPreferences,
  saveDisplayPreferences,
} from "../utils/preferences";
import "./ModulePages.css";

const PROFILE_PHOTO_KEY = "softpos.profile-photo";
const LEGACY_PROFILE_PHOTO_KEY = "lexos.profile-photo";

const TABS = [
  { id: "profile", label: "Profile Settings", Icon: UserIcon },
  { id: "system", label: "System Settings", Icon: GearIcon },
  { id: "notifications", label: "Notification Settings", Icon: BellIcon },
  { id: "printer", label: "Printer Settings", Icon: PrinterIcon },
  { id: "security", label: "Security", Icon: ShieldIcon },
];

function Switch({ label, help, checked, onChange, disabled = false }) {
  return (
    <div className="mp-settings-switch">
      <span className="mp-settings-switch-copy">
        <strong>{label}</strong>
        {help ? <small>{help}</small> : null}
      </span>
      <label className="mp-switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          aria-label={label}
        />
        <span />
      </label>
    </div>
  );
}

function Field({ label, children, wide = false }) {
  return <label className={`mp-settings-field${wide ? " mp-settings-field--wide" : ""}`}>{label}{children}</label>;
}

function Settings() {
  const [tab, setTab] = useState("profile");
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ name: "", email: "" });
  const [photo, setPhoto] = useState("");
  const [prefs, setPrefs] = useState(getDisplayPreferences);
  const [printer, setPrinter] = useState({ ...PRINTER_DEFAULTS });
  const [printerCapabilities, setPrinterCapabilities] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const [identity, printerResult] = await Promise.all([
        authApi.me(),
        settingsApi.getPrinter(),
      ]);
      const saved = getDisplayPreferences();
      setUser(identity);
      setProfile({ name: identity.name || "", email: identity.email || "" });
      setPrefs({
        ...saved,
        autoPrintReceipt: printerResult.printer.autoPrintReceipt,
        playNotificationSound: printerResult.printer.voiceAlert,
      });
      setPrinter(printerResult.printer);
      setPrinterCapabilities(printerResult.capabilities);
      setPhoto(
        localStorage.getItem(PROFILE_PHOTO_KEY) ||
          localStorage.getItem(LEGACY_PROFILE_PHOTO_KEY) ||
          ""
      );
      applyPrinterSettings(printerResult.printer);
      setStatus("ready");
    } catch (problem) {
      setError(errorMessage(problem, "Could not load settings."));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showNotice = (type, text) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), type === "error" ? 6000 : 3500);
  };

  const updatePreference = (key, value) =>
    setPrefs((current) => ({ ...current, [key]: value }));

  const choosePhoto = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showNotice("error", "Choose a JPG, PNG, or WebP profile image.");
      return;
    }
    if (file.size > 1024 * 1024) {
      showNotice("error", "Profile images must be 1 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = String(reader.result || "");
      try {
        localStorage.setItem(PROFILE_PHOTO_KEY, image);
        setPhoto(image);
        showNotice("success", "Profile photo saved on this terminal.");
      } catch {
        showNotice("error", "The photo could not be saved in browser storage.");
      }
    };
    reader.onerror = () => showNotice("error", "Could not read that image file.");
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const saveChanges = async () => {
    setBusy(true);
    try {
      if (tab === "profile") {
        const result = await staffApi.updateProfile(profile);
        setUser((current) => ({ ...current, ...result.user }));
        window.dispatchEvent(
          new CustomEvent("softpos:profile-changed", { detail: result.user })
        );
        window.dispatchEvent(
          new CustomEvent("lexos:profile-changed", { detail: result.user })
        );
        showNotice("success", "Profile details saved.");
      } else if (tab === "printer") {
        const result = await settingsApi.savePrinter(printer);
        setPrinter(result.printer);
        applyPrinterSettings(result.printer);
        showNotice("success", result.message || "Printer settings saved.");
      } else if (["system", "notifications"].includes(tab)) {
        const result = await settingsApi.savePrinter({
          ...printer,
          autoPrintReceipt: prefs.autoPrintReceipt !== false,
          voiceAlert: Boolean(prefs.playNotificationSound),
        });
        setPrinter(result.printer);
        applyPrinterSettings(result.printer);
        const saved = saveDisplayPreferences(prefs);
        setPrefs(saved);
        showNotice("success", "Preferences saved on this terminal and printer settings saved.");
      } else {
        showNotice("error", "Use the security form to update your PIN.");
      }
    } catch (problem) {
      showNotice("error", errorMessage(problem, "Could not save these changes."));
    } finally {
      setBusy(false);
    }
  };

  const testPrinter = async () => {
    setBusy(true);
    try {
      const menu = await menuApi.get();
      const sample = testSample(menu.products || []);
      const sent = await printReceipt(sample, {
        paperWidth: Number(printer.paperWidth),
        copies: Number(printer.copies),
        business: menu.business,
        receipt: menu.receipt,
      });
      if (!sent) throw new Error("Printing is not available in this browser.");
      showNotice("success", "A test receipt was opened in the browser print dialog.");
    } catch (problem) {
      showNotice("error", errorMessage(problem, problem.message || "Could not open the test receipt."));
    } finally {
      setBusy(false);
    }
  };

  const savePin = async (event) => {
    event.preventDefault();
    if (newPin !== confirmPin) {
      showNotice("error", "The new PIN and confirmation do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await staffApi.changePin({ currentPin, newPin });
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      showNotice("success", result.message || "PIN changed.");
    } catch (problem) {
      showNotice("error", errorMessage(problem, "Could not change your PIN."));
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = async () => {
    setBusy(true);
    try {
      const result = await settingsApi.resetPrinter();
      setPrinter(result.printer);
      applyPrinterSettings(result.printer);
      const saved = saveDisplayPreferences({ ...DISPLAY_DEFAULTS });
      setPrefs({
        ...saved,
        autoPrintReceipt: result.printer.autoPrintReceipt,
        playNotificationSound: result.printer.voiceAlert,
      });
      setResetting(false);
      showNotice("success", "Terminal preferences and printer configuration reset.");
    } catch (problem) {
      showNotice("error", errorMessage(problem, "Could not reset settings."));
    } finally {
      setBusy(false);
    }
  };

  const requestOrderNotification = async (checked) => {
    if (checked) {
      if (!("Notification" in window)) {
        showNotice("error", "This browser does not support desktop notifications.");
        return;
      }
      let permission = Notification.permission;
      try {
        if (permission === "default") permission = await Notification.requestPermission();
      } catch {
        showNotice("error", "The browser could not request notification permission.");
        return;
      }
      if (permission !== "granted") {
        showNotice("error", "Browser notifications were not enabled.");
        return;
      }
    }
    updatePreference("orderAlerts", checked);
  };

  const saveButtonVisible = ["profile", "system", "notifications", "printer"].includes(tab);

  if (status === "loading") {
    return <><ModuleNav /><main className="mp-settings"><div className="mp-state">Loading your saved settings…</div></main></>;
  }

  if (status === "error") {
    return <><ModuleNav /><main className="mp-settings"><div className="mp-state mp-state--error" role="alert">{error}<button type="button" className="om-btn om-btn--ghost" onClick={load}>Try again</button></div></main></>;
  }

  return (
    <>
      <ModuleNav />
      <main className="mp-settings">
        <header className="mp-settings-head">
          <div className="module-title-icon"><GearIcon /></div>
          <div>
            <h1>Settings</h1>
            <p>Manage your account, system preferences and more.</p>
          </div>
          <button type="button" className="om-btn om-btn--ghost" onClick={() => setResetting(true)}>
            <RefreshIcon className="om-btn-icon" /> Reset to Default
          </button>
        </header>

        <div className="mp-settings-layout">
          <nav className="mp-settings-tabs" aria-label="Settings sections">
            {TABS.map(({ id, label, Icon }) => (
              <button type="button" key={id} className={`mp-settings-tab${tab === id ? " mp-settings-tab--active" : ""}`} onClick={() => setTab(id)}>
                <Icon /> {label}
              </button>
            ))}
          </nav>

          <section className="mp-settings-panel">
            {tab === "profile" ? (
              <>
                <h2>Profile Settings</h2>
                <div className="mp-profile-photo">{photo ? <img src={photo} alt="Profile" /> : (profile.name || "U").slice(0, 1).toUpperCase()}</div>
                <div className="mp-profile-photo-action">
                  <label className="om-btn om-btn--ghost om-btn--sm">
                    <UserIcon className="om-btn-icon" /> Change Photo
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} hidden />
                  </label>
                  {photo ? <button type="button" className="om-btn om-btn--ghost om-btn--sm" onClick={() => { localStorage.removeItem(PROFILE_PHOTO_KEY); localStorage.removeItem(LEGACY_PROFILE_PHOTO_KEY); setPhoto(""); }}>Remove photo</button> : null}
                </div>
                <div className="mp-settings-form">
                  <Field label="Cashier Name"><input autoComplete="name" maxLength="120" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></Field>
                  <Field label="Email Address"><input type="email" autoComplete="email" maxLength="160" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} /></Field>
                  <Field label="Role"><input value={user?.role === "admin" ? "Manager" : "Staff"} readOnly aria-readonly="true" /><small>Roles are assigned by a manager and cannot be changed from your own profile.</small></Field>
                </div>
              </>
            ) : null}

            {tab === "system" ? (
              <>
                <h2>System Settings</h2>
                <div className="mp-settings-form">
                  <Field label="Language"><select value={prefs.language} onChange={(event) => updatePreference("language", event.target.value)}><option>English</option></select></Field>
                  <Field label="Date Format"><select value={prefs.dateFormat} onChange={(event) => updatePreference("dateFormat", event.target.value)}><option value="MMM d, yyyy">Nov 3, 2025 (MMM d, yyyy)</option><option value="dd/MM/yyyy">03/11/2025 (dd/mm/yyyy)</option><option value="yyyy-MM-dd">2025-11-03 (yyyy-mm-dd)</option></select></Field>
                  <Field label="Time Format"><select value={prefs.timeFormat} onChange={(event) => updatePreference("timeFormat", event.target.value)}><option>12 Hours (AM/PM)</option><option>24 Hours</option></select></Field>
                  <Field label="Currency"><select value={prefs.currency} onChange={(event) => updatePreference("currency", event.target.value)}><option value="Rs">Rs (PKR)</option><option value="$">$ (USD)</option><option value="€">€ (EUR)</option><option value="£">£ (GBP)</option></select></Field>
                  <Field label="Font Size">
                    <select
                      value={prefs.fontSize || DISPLAY_DEFAULTS.fontSize}
                      onChange={(event) => {
                        const next = saveDisplayPreferences({
                          ...prefs,
                          fontSize: event.target.value,
                        });
                        setPrefs(next);
                      }}
                    >
                      {FONT_SIZE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.value}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Font Style">
                    <select
                      value={prefs.fontStyle || DISPLAY_DEFAULTS.fontStyle}
                      onChange={(event) => {
                        const next = saveDisplayPreferences({
                          ...prefs,
                          fontStyle: event.target.value,
                        });
                        setPrefs(next);
                      }}
                    >
                      {FONT_STYLE_OPTIONS.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          style={{ fontFamily: option.family }}
                        >
                          {option.value}
                        </option>
                      ))}
                    </select>
                    <small>Applies instantly across the entire POS on this terminal.</small>
                  </Field>
                </div>
                <div className="mp-settings-switches">
                  <Switch
                    label="Show Navigation Bar"
                    help="Show or hide the POS top navigation (New Order, Orders, Order Reversal, Shift, Settings, Help, Logout)."
                    checked={prefs.showNavigationBar !== false}
                    onChange={(value) => {
                      const next = saveDisplayPreferences({
                        ...prefs,
                        showNavigationBar: value,
                      });
                      setPrefs(next);
                    }}
                  />
                  <Switch label="Auto Print Receipt" help="Open the browser print dialog after a receipt is requested." checked={prefs.autoPrintReceipt !== false} onChange={(value) => updatePreference("autoPrintReceipt", value)} />
                  <Switch label="Show Order Details" help="Include customer and delivery details on printed receipts." checked={prefs.showOrderDetails} onChange={(value) => updatePreference("showOrderDetails", value)} />
                  <Switch label="Play Notification Sound" help="Use the configured till alert when a new order is created." checked={prefs.playNotificationSound} onChange={(value) => updatePreference("playNotificationSound", value)} />
                </div>
              </>
            ) : null}

            {tab === "notifications" ? (
              <>
                <h2>Notification Settings</h2>
                <div className="mp-settings-switches">
                  <Switch label="Email Notifications" help="Email delivery is unavailable because no mail service is configured." checked={false} onChange={() => {}} disabled />
                  <Switch label="Order Alerts" help={`Browser notifications${"Notification" in window ? ` (${Notification.permission} permission)` : " are not supported"} for newly received orders.`} checked={prefs.orderAlerts} onChange={requestOrderNotification} />
                  <Switch label="Shift Reminders" help="No shift duration or reminder schedule is configured for this business." checked={false} onChange={() => {}} disabled />
                </div>
                <div className="mp-settings-form">
                  <Field label="Notification Sound"><select value={prefs.playNotificationSound ? "Till alert" : "Off"} onChange={(event) => updatePreference("playNotificationSound", event.target.value === "Till alert")}><option>Default</option><option>Till alert</option><option>Off</option></select></Field>
                </div>
                <p className="mp-settings-note"><AlertIcon /> Browser alerts require permission from this browser. Email and scheduled shift notifications need integrations that are not configured in this deployment.</p>
              </>
            ) : null}

            {tab === "printer" ? (
              <>
                <h2>Printer Settings</h2>
                <div className="mp-settings-form">
                  <Field label="Printer Name"><input maxLength="60" value={printer.printerName} onChange={(event) => setPrinter({ ...printer, printerName: event.target.value })} /></Field>
                  <Field label="Printer Type"><select value={printer.printerType} onChange={(event) => setPrinter({ ...printer, printerType: event.target.value })}>{["Receipt", "Kitchen", "Both"].map((item) => <option key={item}>{item}</option>)}</select></Field>
                  <Field label="Connection"><select value={printer.connection} onChange={(event) => setPrinter({ ...printer, connection: event.target.value })}>{(printerCapabilities?.connections || [{ id: "Browser", available: true }]).map((connection) => <option key={connection.id} value={connection.id} disabled={!connection.available}>{connection.id}{connection.available ? "" : " (agent unavailable)"}</option>)}</select></Field>
                  <Field label="Paper Width"><select value={printer.paperWidth} onChange={(event) => setPrinter({ ...printer, paperWidth: Number(event.target.value) })}><option value="58">58 mm</option><option value="80">80 mm</option></select></Field>
                  <Field label="Copies"><select value={printer.copies} onChange={(event) => setPrinter({ ...printer, copies: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map((number) => <option key={number} value={number}>{number}</option>)}</select></Field>
                </div>
                <div className="mp-settings-switches">
                  <Switch label="Auto Print Receipt" checked={printer.autoPrintReceipt} onChange={(value) => setPrinter({ ...printer, autoPrintReceipt: value })} />
                  <Switch label="Auto Print Kitchen Ticket" checked={printer.autoPrintKitchen} onChange={(value) => setPrinter({ ...printer, autoPrintKitchen: value })} />
                  <Switch label="Voice Alert for New Orders" checked={printer.voiceAlert} onChange={(value) => setPrinter({ ...printer, voiceAlert: value })} />
                </div>
                <p className="mp-settings-note"><PrinterIcon /> {printerCapabilities?.silentPrinting === false ? "Printing uses the browser's regular print dialog. Direct USB/network printing is not available without a local print agent." : "Choose the thermal printer in the browser print dialog."}</p>
                <button type="button" className="om-btn om-btn--ghost" onClick={testPrinter} disabled={busy}><ReceiptIcon className="om-btn-icon" /> Test Receipt</button>
              </>
            ) : null}

            {tab === "security" ? (
              <>
                <h2>Security</h2>
                <p className="mp-settings-description">Change your sign-in PIN. The server verifies your current PIN and stores only a protected hash.</p>
                <form className="mp-settings-form" onSubmit={savePin}>
                  <Field label="Current PIN"><input type="password" autoComplete="current-password" inputMode="numeric" pattern="[0-9]{5}" maxLength="5" required value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, "").slice(0, 5))} /></Field>
                  <Field label="New PIN"><input type="password" autoComplete="new-password" inputMode="numeric" pattern="[0-9]{5}" maxLength="5" required value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 5))} /></Field>
                  <Field label="Confirm New PIN"><input type="password" autoComplete="new-password" inputMode="numeric" pattern="[0-9]{5}" maxLength="5" required value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 5))} /></Field>
                  <div className="mp-settings-actions"><button type="submit" className="om-btn om-btn--primary" disabled={busy}>{busy ? "Updating…" : "Change PIN"}</button></div>
                </form>
              </>
            ) : null}

            {saveButtonVisible ? (
              <div className="mp-settings-actions">
                <button type="button" className="om-btn om-btn--primary" onClick={saveChanges} disabled={busy}>
                  <CheckCircleIcon className="om-btn-icon" /> {busy ? "Saving…" : "Save Changes"}
                </button>
              </div>
            ) : null}
          </section>
        </div>
        <PageNotice notice={notice} onDismiss={() => setNotice(null)} />
        {resetting ? (
          <ConfirmDialog
            title="Reset terminal settings?"
            message="Display preferences and printer settings will be restored to their defaults. Your profile and PIN will not be changed."
            confirmLabel={busy ? "Resetting…" : "Reset to Default"}
            busy={busy}
            onConfirm={confirmReset}
            onCancel={() => setResetting(false)}
          />
        ) : null}
      </main>
    </>
  );
}

export default Settings;
