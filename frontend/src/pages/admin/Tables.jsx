import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

import { AdHead, AdPanel } from "../../components/admin/AdminUi";
import { CheckCircleIcon } from "../../components/Icons";

const TABLES = [1, 2, 3, 4];
const PUBLIC_HOST = "https://amoonssoft-nine.vercel.app";

function tableUrl(id) {
  // Always encode the live public URL into QR codes so dine-in guests
  // never land on a cashier's localhost / preview origin.
  return `${PUBLIC_HOST}/Digitalmenu-t${id}/`;
}

export default function Tables() {
  const [active, setActive] = useState(null);
  const [qrMap, setQrMap] = useState({});
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () =>
      TABLES.map((id) => ({
        id,
        name: `Table ${id}`,
        url: tableUrl(id),
        path: `/Digitalmenu-t${id}/`,
      })),
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      const next = {};
      for (const row of rows) {
        next[row.id] = await QRCode.toDataURL(row.url, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 320,
          color: { dark: "#4a001d", light: "#ffffff" },
        });
      }
      if (!cancelled) setQrMap(next);
      setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const copyUrl = async (url, id) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(String(id));
      window.setTimeout(() => setCopied(""), 2000);
    } catch {
      window.prompt("Copy this table URL:", url);
    }
  };

  return (
    <div className="ad-tables-page">
      <AdHead
        title="Tables"
        sub="QR codes for dine-in digital menus. Each table has its own unique link and code."
      />

      <AdPanel title="Dining tables" sub="Tap a table to view its QR code, copy the URL, or open the digital menu.">
        <div className="ad-tables-grid">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`ad-table-card${active?.id === row.id ? " ad-table-card--active" : ""}`}
              onClick={() => setActive(row)}
            >
              <span className="ad-table-card-badge">T{row.id}</span>
              <strong>{row.name}</strong>
              <small>{row.path}</small>
              {qrMap[row.id] ? (
                <img src={qrMap[row.id]} alt="" className="ad-table-card-qr" />
              ) : (
                <span className="ad-table-card-qr ad-table-card-qr--loading">
                  {busy ? "Preparing…" : "QR"}
                </span>
              )}
            </button>
          ))}
        </div>
      </AdPanel>

      {active ? (
        <div
          className="ad-table-detail-scrim"
          role="presentation"
          onClick={() => setActive(null)}
        >
          <section
            className="ad-table-detail"
            role="dialog"
            aria-modal="true"
            aria-label={`${active.name} QR details`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="ad-table-detail-head">
              <div>
                <p className="ad-eyebrow">Digital menu</p>
                <h2>{active.name}</h2>
                <p className="ad-muted">{active.url}</p>
              </div>
              <button
                type="button"
                className="om-btn om-btn--ghost"
                onClick={() => setActive(null)}
              >
                Close
              </button>
            </div>

            <div className="ad-table-detail-body">
              {qrMap[active.id] ? (
                <img
                  src={qrMap[active.id]}
                  alt={`${active.name} QR code`}
                  className="ad-table-detail-qr"
                />
              ) : (
                <div className="ad-table-detail-qr ad-table-detail-qr--loading">
                  Generating…
                </div>
              )}

              <div className="ad-table-detail-actions">
                <button
                  type="button"
                  className="om-btn om-btn--primary"
                  disabled={!qrMap[active.id]}
                  onClick={() => {
                    if (!qrMap[active.id]) return;
                    const win = window.open("", "_blank");
                    if (!win) return;
                    win.document.write(
                      `<!doctype html><title>${active.name} QR</title>` +
                        `<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#faf7f4">` +
                        `<img src="${qrMap[active.id]}" alt="${active.name} QR code" style="width:min(360px,90vw);height:auto" />` +
                        `</body>`
                    );
                    win.document.close();
                  }}
                >
                  View QR Code
                </button>
                <button
                  type="button"
                  className="om-btn om-btn--ghost"
                  onClick={() => copyUrl(active.url, active.id)}
                >
                  {copied === String(active.id) ? (
                    <>
                      <CheckCircleIcon className="om-btn-icon" /> Copied
                    </>
                  ) : (
                    "Copy URL"
                  )}
                </button>
                <a
                  className="om-btn om-btn--ghost"
                  href={active.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open URL
                </a>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
