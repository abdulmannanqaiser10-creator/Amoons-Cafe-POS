import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

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
import { adminApi, companyApi, errorMessage, settingsApi } from "../../api/client";
import {
  CheckCircleIcon,
  GearIcon,
  GlobeIcon,
  PrinterIcon,
  ShieldIcon,
  UsbIcon,
} from "../../components/Icons";

const EMPTY = {
  srbEnabled: false,
  srbMode: "cloud",
  srbPosId: "",
  srbPosKey: "",
  srbPosUser: "",
  srbPosPass: "",
  srbApiUrl: "https://pos.srb.gos.pk/ePOSGateway/v1/SalesInvoiceService.api",
  srbTransType: "Live",
  srbTaxRate: 15,
  srbNtn: "",
  srbMerchantId: "",
  srbApiKey: "",
  websiteEnabled: false,
  websiteStoreUrl: "",
  websiteApiKey: "",
  accountingEnabled: false,
  accountingProvider: "",
  accountingCode: "",
  deliveryEnabled: false,
  deliveryPartner: "",
  deliveryApiKey: "",
};

function statusOf(configured, enabled) {
  if (!enabled) return { label: "Disabled", tone: "gray" };
  if (configured) return { label: "Configured", tone: "green" };
  return { label: "Not configured", tone: "amber" };
}

/**
 * Real integration profiles stored in app_settings.integrations.
 * Status is derived only from saved fields — never fake "Connected".
 */
function Integrations() {
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [integrations, setIntegrations] = useState(EMPTY);
  const [printer, setPrinter] = useState(null);
  const [business, setBusiness] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [active, setActive] = useState("srb");
  const { notice, notify } = useNotice();

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const [companyResult, printerResult] = await Promise.all([
        companyApi.get(),
        settingsApi.getPrinter().catch(() => null),
      ]);
      setIntegrations({
        ...EMPTY,
        ...(companyResult?.settings?.integrations || {}),
      });
      setBusiness(companyResult?.settings?.business || null);
      setPrinter(printerResult);
      setStatus("ready");
    } catch (problem) {
      setError(errorMessage(problem, "Could not load integrations."));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (field, value) =>
    setIntegrations((current) => ({ ...current, [field]: value }));

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await companyApi.save("integrations", integrations);
      setIntegrations({ ...EMPTY, ...(result.integrations || integrations) });
      notify("success", result.message || "Integrations saved.");
    } catch (problem) {
      notify("error", errorMessage(problem, "Could not save integrations."));
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading" || status === "error") {
    return (
      <div className="ad-page">
        <AdHead
          title="Integrations"
          sub="Connect fiscal, website, and device services"
          actions={<AdRefresh onClick={load} busy={status === "loading"} />}
        />
        <AdState status={status} error={error} onRetry={load} />
      </div>
    );
  }

  const printerConfigured = Boolean(
    printer?.printer?.printerName ||
      printer?.printer?.connection ||
      printer?.settings?.name
  );
  const srbConfigured = Boolean(
    integrations.srbConfigured ||
      (integrations.srbPosId && integrations.srbPosUser && integrations.srbPosPass)
  );

  const testSrb = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const result = await adminApi.srb.test();
      notify(result.ok ? "success" : "error", result.message || "SRB test finished.");
    } catch (problem) {
      notify("error", errorMessage(problem, "SRB connection test failed."));
    } finally {
      setTesting(false);
    }
  };
  const websiteConfigured = Boolean(
    integrations.websiteStoreUrl && integrations.websiteApiKey
  );
  const accountingConfigured = Boolean(
    integrations.accountingProvider && integrations.accountingCode
  );
  const deliveryConfigured = Boolean(
    integrations.deliveryPartner && integrations.deliveryApiKey
  );

  const cards = [
    {
      id: "srb",
      title: "SRB Integration",
      text: "Sindh Revenue Board fiscal reporting credentials for POS invoices.",
      Glyph: ShieldIcon,
      status: statusOf(srbConfigured, integrations.srbEnabled),
    },
    {
      id: "website",
      title: "Website Integration",
      text: "Online store that posts Web channel orders into Order Management.",
      Glyph: GlobeIcon,
      status: statusOf(websiteConfigured, integrations.websiteEnabled),
    },
    {
      id: "printer",
      title: "Receipt Printer",
      text: "Browser receipt / KOT printing for this workstation.",
      Glyph: PrinterIcon,
      status: printerConfigured
        ? { label: "Configured", tone: "green" }
        : { label: "Not configured", tone: "amber" },
    },
    {
      id: "accounting",
      title: "Accounting Export",
      text: "Optional ledger codes for end-of-day sales export.",
      Glyph: GearIcon,
      status: statusOf(accountingConfigured, integrations.accountingEnabled),
    },
    {
      id: "delivery",
      title: "Delivery Partner API",
      text: "Third-party courier credentials when you sync dispatch statuses.",
      Glyph: UsbIcon,
      status: statusOf(deliveryConfigured, integrations.deliveryEnabled),
    },
    {
      id: "business",
      title: "Business Profile",
      text: business?.name
        ? `${business.name}${business.phone ? ` · ${business.phone}` : ""}`
        : "Legal name and tax details printed on receipts.",
      Glyph: CheckCircleIcon,
      status: business?.name
        ? { label: "Configured", tone: "green" }
        : { label: "Incomplete", tone: "amber" },
    },
  ];

  return (
    <div className="ad-page">
      <AdToast notice={notice} />
      <AdHead
        title="Integrations"
        sub="Manage real connectors — status reflects saved credentials only"
        actions={
          <>
            <button type="button" className="om-btn om-btn--primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save integrations"}
            </button>
            <AdRefresh onClick={load} busy={false} />
          </>
        }
      />

      <section className="ad-int-grid" aria-label="Integration overview">
        {cards.map(({ id, title, text, Glyph, status: st }) => (
          <article key={id} className={`ad-int-card${active === id ? " ad-int-card--on" : ""}`}>
            <span className="ad-int-icon ad-int-icon--burgundy">
              <Glyph />
            </span>
            <div className="ad-int-body">
              <h3>{title}</h3>
              <p>{text}</p>
              <span className={`ad-badge ad-badge--${st.tone}`}>{st.label}</span>
            </div>
            {id === "printer" ? (
              <Link className="om-btn om-btn--ghost" to="/settings">
                Open till settings
              </Link>
            ) : id === "business" ? (
              <Link className="om-btn om-btn--ghost" to="/admin/settings">
                Edit business settings
              </Link>
            ) : (
              <button
                type="button"
                className="om-btn om-btn--ghost"
                onClick={() => setActive(id)}
              >
                Configure
              </button>
            )}
          </article>
        ))}
      </section>

      {active === "srb" ? (
        <AdPanel
          title="SRB Integration"
          sub="Sindh Revenue Board ePOS — SalesInvoiceService.api"
          actions={
            <button
              type="button"
              className="om-btn om-btn--ghost"
              onClick={testSrb}
              disabled={testing || busy}
            >
              {testing ? "Testing…" : "Test connection"}
            </button>
          }
        >
          <div className="ad-settings-grid">
            <AdSwitch
              label="Enable SRB fiscalisation"
              help="When enabled, completed till orders are submitted to SRB automatically."
              checked={integrations.srbEnabled}
              onChange={(checked) => patch("srbEnabled", checked)}
            />
            <AdField
              label="Integration mode"
              htmlFor="int-srb-mode"
              hint="Cloud posts to SRB ePOSGateway. Offline posts to the local SRB POS Connector (SDC) on this machine."
            >
              <select
                id="int-srb-mode"
                className="om-select"
                value={integrations.srbMode || "cloud"}
                onChange={(e) => {
                  const mode = e.target.value;
                  patch("srbMode", mode);
                  if (mode === "offline" && /ePOSGateway/i.test(integrations.srbApiUrl || "")) {
                    patch("srbApiUrl", "http://localhost:8282/pos/SalesInvoiceServices");
                  }
                  if (mode === "cloud" && /localhost:8282/i.test(integrations.srbApiUrl || "")) {
                    patch(
                      "srbApiUrl",
                      "https://pos.srb.gos.pk/ePOSGateway/v1/SalesInvoiceService.api"
                    );
                  }
                }}
              >
                <option value="cloud">Cloud API</option>
                <option value="offline">Local SDC / Offline Connector</option>
              </select>
            </AdField>
            <AdField label="POS ID" htmlFor="int-srb-pos">
              <input
                id="int-srb-pos"
                className="om-input"
                value={integrations.srbPosId}
                onChange={(e) => patch("srbPosId", e.target.value)}
                placeholder="e.g. 2909"
              />
            </AdField>
            <AdField label="POS Key" htmlFor="int-srb-poskey" hint="Stored securely; leave masked value unchanged to keep the current key.">
              <input
                id="int-srb-poskey"
                className="om-input"
                type="password"
                value={integrations.srbPosKey}
                onChange={(e) => patch("srbPosKey", e.target.value)}
                placeholder="POS key from SRB"
                autoComplete="off"
              />
            </AdField>
            <AdField label="pos_user" htmlFor="int-srb-user">
              <input
                id="int-srb-user"
                className="om-input"
                value={integrations.srbPosUser}
                onChange={(e) => patch("srbPosUser", e.target.value)}
                placeholder="SRB portal username"
              />
            </AdField>
            <AdField label="pos_pass" htmlFor="int-srb-pass" hint="Stored securely; leave masked value unchanged to keep the current password.">
              <input
                id="int-srb-pass"
                className="om-input"
                type="password"
                value={integrations.srbPosPass}
                onChange={(e) => patch("srbPosPass", e.target.value)}
                placeholder="SRB portal password"
                autoComplete="off"
              />
            </AdField>
            <AdField label="API URL" htmlFor="int-srb-url">
              <input
                id="int-srb-url"
                className="om-input"
                value={integrations.srbApiUrl}
                onChange={(e) => patch("srbApiUrl", e.target.value)}
                placeholder="https://pos.srb.gos.pk/ePOSGateway/v1/SalesInvoiceService.api"
              />
            </AdField>
            <AdField label="Transaction type" htmlFor="int-srb-trans">
              <select
                id="int-srb-trans"
                className="om-select"
                value={integrations.srbTransType || "Live"}
                onChange={(e) => patch("srbTransType", e.target.value)}
              >
                <option value="Live">Live</option>
                <option value="Test">Test</option>
              </select>
            </AdField>
            <AdField
              label="Fallback tax rate (%)"
              htmlFor="int-srb-rate"
              hint="Used only when an order has no tax rate. SRB PoS restaurants typically use 15%."
            >
              <input
                id="int-srb-rate"
                className="om-input"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={integrations.srbTaxRate ?? 15}
                onChange={(e) => patch("srbTaxRate", Number(e.target.value))}
              />
            </AdField>
            <AdField
              label="Registered NTN"
              htmlFor="int-srb-ntn"
              hint="Optional override. Defaults to Business Settings → Tax number. SRB wants digits only (no leading S, no hyphen check digit)."
            >
              <input
                id="int-srb-ntn"
                className="om-input"
                value={integrations.srbNtn || ""}
                onChange={(e) => patch("srbNtn", e.target.value)}
                placeholder={business?.taxNumber || "e.g. 1234567"}
              />
            </AdField>
            <p className="om-hint">
              Business name comes from Admin → Settings → Business. NTN must match the
              POS registered with SRB. Completed till orders fiscalise automatically when
              SRB is enabled; failed invoices can be resent from Order Management.
            </p>
          </div>
        </AdPanel>
      ) : null}

      {active === "website" ? (
        <AdPanel title="Website Integration" sub="Orders arrive on the Web channel">
          <div className="ad-settings-grid">
            <AdSwitch
              label="Enable website intake"
              help="Website checkout posts to /api/website/orders."
              checked={integrations.websiteEnabled}
              onChange={(checked) => patch("websiteEnabled", checked)}
            />
            <AdField label="Store URL" htmlFor="int-web-url">
              <input
                id="int-web-url"
                className="om-input"
                value={integrations.websiteStoreUrl}
                onChange={(e) => patch("websiteStoreUrl", e.target.value)}
                placeholder="https://your-store.example"
              />
            </AdField>
            <AdField label="Shared API key" htmlFor="int-web-key">
              <input
                id="int-web-key"
                className="om-input"
                type="password"
                value={integrations.websiteApiKey}
                onChange={(e) => patch("websiteApiKey", e.target.value)}
                placeholder="Shared secret for website → POS"
                autoComplete="off"
              />
            </AdField>
          </div>
        </AdPanel>
      ) : null}

      {active === "accounting" ? (
        <AdPanel title="Accounting Export">
          <div className="ad-settings-grid">
            <AdSwitch
              label="Enable accounting profile"
              checked={integrations.accountingEnabled}
              onChange={(checked) => patch("accountingEnabled", checked)}
            />
            <AdField label="Provider" htmlFor="int-acc-provider">
              <input
                id="int-acc-provider"
                className="om-input"
                value={integrations.accountingProvider}
                onChange={(e) => patch("accountingProvider", e.target.value)}
                placeholder="e.g. QuickBooks, Xero, Excel"
              />
            </AdField>
            <AdField label="Sales account code" htmlFor="int-acc-code">
              <input
                id="int-acc-code"
                className="om-input"
                value={integrations.accountingCode}
                onChange={(e) => patch("accountingCode", e.target.value)}
                placeholder="Ledger / account code"
              />
            </AdField>
          </div>
        </AdPanel>
      ) : null}

      {active === "delivery" ? (
        <AdPanel title="Delivery Partner API">
          <div className="ad-settings-grid">
            <AdSwitch
              label="Enable delivery partner"
              checked={integrations.deliveryEnabled}
              onChange={(checked) => patch("deliveryEnabled", checked)}
            />
            <AdField label="Partner" htmlFor="int-del-partner">
              <input
                id="int-del-partner"
                className="om-input"
                value={integrations.deliveryPartner}
                onChange={(e) => patch("deliveryPartner", e.target.value)}
                placeholder="Courier / aggregator name"
              />
            </AdField>
            <AdField label="API key" htmlFor="int-del-key">
              <input
                id="int-del-key"
                className="om-input"
                type="password"
                value={integrations.deliveryApiKey}
                onChange={(e) => patch("deliveryApiKey", e.target.value)}
                placeholder="Partner API key"
                autoComplete="off"
              />
            </AdField>
          </div>
        </AdPanel>
      ) : null}
    </div>
  );
}

export default Integrations;
