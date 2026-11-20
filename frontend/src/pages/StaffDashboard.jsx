import { useCallback, useState } from "react";
import { Link } from "react-router-dom";

import { authApi, errorMessage, logoutSession, menuApi, shiftsApi } from "../api/client";
import useResource from "../components/admin/useResource";
import { AdHead, AdPanel, AdRefresh, AdState } from "../components/admin/AdminUi";
import { formatDateTime, formatMoney } from "../utils/format";

function StaffDashboard() {
  const [openingCash, setOpeningCash] = useState("0");
  const [closingCash, setClosingCash] = useState("");
  const [shiftNotes, setShiftNotes] = useState("");
  const [savingShift, setSavingShift] = useState(false);
  const [shiftError, setShiftError] = useState("");
  const [shiftNotice, setShiftNotice] = useState("");

  const load = useCallback(async () => {
    const [user, menu, currentShift, history] = await Promise.all([
      authApi.me(),
      menuApi.get(),
      shiftsApi.current(),
      shiftsApi.list({ mine: true, limit: 5 }),
    ]);

    return {
      user,
      products: menu.products ?? [],
      currentShift,
      shifts: history.shifts ?? [],
    };
  }, []);

  const { data, status, error, reload } = useResource(load);

  const updateShift = async (action) => {
    if (savingShift) return;

    setSavingShift(true);
    setShiftError("");
    setShiftNotice("");

    try {
      if (action === "open") {
        const amount = Number(openingCash);
        if (!Number.isFinite(amount) || amount < 0) {
          setShiftError("Opening cash must be a non-negative amount.");
          return;
        }
        await shiftsApi.open({ openingCash: amount });
        setShiftNotice("Your shift is now open.");
      } else {
        const amount = Number(closingCash);
        if (closingCash.trim() === "" || !Number.isFinite(amount) || amount < 0) {
          setShiftError("Enter the counted cash to close your shift.");
          return;
        }
        await shiftsApi.close(data.currentShift.id, {
          closingCash: amount,
          notes: shiftNotes,
        });
        setShiftNotice("Your shift has been closed.");
      }

      setClosingCash("");
      setShiftNotes("");
      await reload();
    } catch (problem) {
      setShiftError(errorMessage(problem, "Could not update your shift."));
    } finally {
      setSavingShift(false);
    }
  };

  if (status !== "ready") {
    return (
      <div className="om-page ad-page">
        <AdHead title="Staff Dashboard" sub="Your shift and restaurant menu." />
        <AdState status={status} error={error} onRetry={reload} />
      </div>
    );
  }

  const shift = data.currentShift;

  return (
    <div className="om-page ad-page ad-staff">
      <AdHead
        title={`Welcome, ${data.user.name}`}
        sub="Your workspace for the counter, menu, and current shift."
        actions={
          <>
            <Link className="om-btn om-btn--primary" to="/home">Open the till</Link>
            <AdRefresh onClick={reload} busy={status === "loading"} />
            <button type="button" className="om-btn om-btn--ghost" onClick={() => logoutSession()}>
              Log out
            </button>
          </>
        }
      />

      {shiftError ? <p className="ad-staff-message ad-staff-message--error" role="alert">{shiftError}</p> : null}
      {shiftNotice ? <p className="ad-staff-message" role="status">{shiftNotice}</p> : null}

      <section className="ad-staff-grid" aria-label="Staff overview">
        <AdPanel title="My current shift" sub={shift ? `${shift.shiftNumber} · opened ${formatDateTime(shift.openedAt)}` : "No shift is currently open."}>
          {shift ? (
            <div className="ad-staff-shift">
              <p><strong>Opening cash</strong><span>{formatMoney(shift.openingCash)}</span></p>
              <p><strong>Orders</strong><span>{shift.totals.orderCount}</span></p>
              <p><strong>Sales</strong><span>{formatMoney(shift.totals.totalSales)}</span></p>
              <label className="om-field">
                <span className="om-label">Counted cash to close</span>
                <input
                  className="om-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={closingCash}
                  onChange={(event) => setClosingCash(event.target.value)}
                />
              </label>
              <label className="om-field">
                <span className="om-label">Shift note (optional)</span>
                <textarea className="om-textarea" rows="2" maxLength="500" value={shiftNotes} onChange={(event) => setShiftNotes(event.target.value)} />
              </label>
              <button type="button" className="om-btn om-btn--primary" disabled={savingShift} onClick={() => updateShift("close")}>
                {savingShift ? "Saving…" : "Close my shift"}
              </button>
            </div>
          ) : (
            <div className="ad-staff-shift">
              <label className="om-field">
                <span className="om-label">Opening cash</span>
                <input
                  className="om-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingCash}
                  onChange={(event) => setOpeningCash(event.target.value)}
                />
              </label>
              <button type="button" className="om-btn om-btn--primary" disabled={savingShift} onClick={() => updateShift("open")}>
                {savingShift ? "Saving…" : "Open my shift"}
              </button>
            </div>
          )}
        </AdPanel>

        <AdPanel title="Menu at a glance" sub={`${data.products.length} items available to browse in the till.`}>
          {data.products.length ? (
            <ul className="ad-staff-menu">
              {data.products.slice(0, 6).map((product) => (
                <li key={product.id}>
                  <span>{product.name}<small>{product.category || "Menu item"}</small></span>
                  <strong>{formatMoney(product.price)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ad-blank">There are no menu items to show.</p>
          )}
          <Link className="om-btn om-btn--ghost" to="/home">Browse menu and start an order</Link>
        </AdPanel>
      </section>

      <AdPanel title="My recent shifts" sub="Only shifts assigned to your staff account are shown.">
        {data.shifts.length ? (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr><th>Shift</th><th>Status</th><th>Opened</th><th>Orders</th><th>Sales</th></tr>
              </thead>
              <tbody>
                {data.shifts.map((item) => (
                  <tr key={item.id}>
                    <td>{item.shiftNumber}</td>
                    <td>{item.status}</td>
                    <td>{formatDateTime(item.openedAt)}</td>
                    <td className="ad-num">{item.totals.orderCount}</td>
                    <td className="ad-num">{formatMoney(item.totals.totalSales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ad-blank">Your shift history will appear here.</p>
        )}
      </AdPanel>
    </div>
  );
}

export default StaffDashboard;
