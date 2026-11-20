import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import useResource from "../../components/admin/useResource";
import { adminApi } from "../../api/client";
import { formatDateTime } from "../../utils/format";
import {
  AdHead,
  AdPanel,
  AdRefresh,
  AdState,
  AdFormModal,
  AdField,
} from "../../components/admin/AdminUi";
import OmModal from "../../components/orders/OmModal";
import {
  PlusIcon,
  EditIcon,
  BagIcon,
  ClockIcon,
  SearchIcon,
  AlertIcon,
} from "../../components/Icons";

const DEFAULT_REASONS = ["Opening", "Purchase", "Sale", "Return", "Waste", "Adjustment"];

const LEVELS = [
  { key: "", label: "All levels" },
  { key: "low", label: "Low" },
  { key: "out", label: "Out of stock" },
];

/**
 * Stock levels live on the same rows the till reads, so an adjustment here
 * changes what can be sold on the counter immediately — availability is
 * derived from the quantity, never stored twice.
 */
function InventoryManagement({ onChanged }) {
  const [adjusting, setAdjusting] = useState(null);
  const [tuning, setTuning] = useState(null);
  const [history, setHistory] = useState(null);
  const [movements, setMovements] = useState([]);
  const [historyError, setHistoryError] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState("");
  const [form, setForm] = useState({});

  const [searchDraft, setSearchDraft] = useState("");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");

  // The name search runs in the database, so the field is debounced first.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchDraft.trim()), 300);

    return () => clearTimeout(timer);
  }, [searchDraft]);

  const filtering = Boolean(query || level);

  const load = useCallback(async () => {
    const params = filtering ? { q: query || undefined, level: level || undefined } : null;

    const [totals, result] = await Promise.all([
      adminApi.inventory.list(),
      params ? adminApi.inventory.list(params) : null,
    ]);

    const shown = result || totals;

    return {
      items: shown.items || [],
      // The cards always describe the whole store, not just the rows on screen.
      summary: totals.summary || { items: 0, low: 0, out: 0, value: 0 },
      reasons: totals.reasons || DEFAULT_REASONS,
    };
  }, [filtering, query, level]);

  const { data, status, error, reload } = useResource(load);

  const items = data?.items ?? [];
  const summary = data?.summary ?? { items: 0, low: 0, out: 0, value: 0 };
  const reasons = data?.reasons ?? DEFAULT_REASONS;

  const sync = async () => {
    await reload();
    if (onChanged) await onChanged();
  };

  const openAdjust = (item) => {
    setAdjusting(item);
    setForm({ quantity: "", reason: "Purchase", note: "" });
    setErrors("");
  };

  const openTuning = (item) => {
    setTuning(item);
    setForm({ reorderPoint: item.reorderPoint ?? 5, costPrice: item.costPrice ?? 0 });
    setErrors("");
  };

  const openHistory = async (item) => {
    setHistory(item);
    setMovements([]);
    setHistoryError("");

    try {
      const result = await adminApi.inventory.movements(item.productId);
      setMovements(result.movements || []);
    } catch (err) {
      setHistoryError(err?.response?.data?.message || "The stock ledger could not be read.");
    }
  };

  const close = () => {
    setAdjusting(null);
    setTuning(null);
    setHistory(null);
    setForm({});
    setErrors("");
  };

  const submitAdjust = async () => {
    const amount = parseFloat(form.quantity);

    if (!Number.isFinite(amount) || amount === 0) {
      setErrors("Enter how much the stock moves by — negative to reduce it.");
      return;
    }

    setSaving(true);
    setErrors("");

    try {
      await adminApi.inventory.adjust(adjusting.productId, {
        quantity: amount,
        reason: form.reason,
        note: form.note,
      });
      await sync();
      close();
    } catch (err) {
      setErrors(err?.response?.data?.message || "Could not record this movement.");
    } finally {
      setSaving(false);
    }
  };

  const submitTuning = async () => {
    setSaving(true);
    setErrors("");

    try {
      await adminApi.inventory.updateItem(tuning.productId, {
        reorderPoint: parseFloat(form.reorderPoint) || 0,
        costPrice: parseFloat(form.costPrice) || 0,
      });
      await sync();
      close();
    } catch (err) {
      setErrors(err?.response?.data?.message || "Could not save these stock settings.");
    } finally {
      setSaving(false);
    }
  };

  if (status !== "ready") {
    return (
      <div className="ad-page">
        <AdHead title="Inventory" sub="" actions={<AdRefresh onClick={reload} busy={status === "loading"} />} />
        <AdState status={status} error={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="ad-page">
      <AdHead
        title="Inventory Management"
        sub={`${summary.items} tracked · ${summary.low} low · ${summary.out} out of stock · ${summary.value.toFixed(2)} held at cost`}
        actions={<AdRefresh onClick={reload} busy={false} />}
      />

      <section className="om-cards" aria-label="Stock summary">
        <article className="om-card om-card--neutral">
          <span className="om-card-icon">
            <BagIcon />
          </span>
          <div className="om-card-body">
            <span className="om-card-label">Tracked items</span>
            <span className="om-card-value">{summary.items}</span>
          </div>
        </article>

        <article className={`om-card om-card--${summary.low > 0 ? "amber" : "neutral"}`}>
          <span className="om-card-icon">
            <BagIcon />
          </span>
          <div className="om-card-body">
            <span className="om-card-label">Low stock</span>
            <span className="om-card-value">{summary.low}</span>
            <span className="om-card-hint">At or below the reorder point</span>
          </div>
        </article>

        <article className={`om-card om-card--${summary.out > 0 ? "burgundy" : "neutral"}`}>
          <span className="om-card-icon">
            <BagIcon />
          </span>
          <div className="om-card-body">
            <span className="om-card-label">Out of stock</span>
            <span className="om-card-value">{summary.out}</span>
            <span className="om-card-hint">The till will not sell these</span>
          </div>
        </article>

        <article className="om-card om-card--blue">
          <span className="om-card-icon">
            <BagIcon />
          </span>
          <div className="om-card-body">
            <span className="om-card-label">Stock at cost</span>
            <span className="om-card-value">{summary.value.toFixed(2)}</span>
          </div>
        </article>
      </section>

      <AdPanel className="filters">
        <div className="ad-filter-row">
          <label className="om-search">
            <SearchIcon className="om-search-icon" />

            <input
              className="om-search-input"
              type="search"
              placeholder="Find a tracked product…"
              aria-label="Search tracked products"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />

            {searchDraft ? (
              <button
                type="button"
                className="om-search-clear"
                onClick={() => setSearchDraft("")}
                aria-label="Clear search"
              >
                ×
              </button>
            ) : null}
          </label>

          <div className="ad-filter-actions">
            {LEVELS.map(({ key, label }) => (
              <button
                key={key || "all"}
                type="button"
                className={`om-mini${level === key ? " om-mini--on" : ""}`}
                onClick={() => setLevel(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </AdPanel>

      <AdPanel
        sub={
          filtering
            ? `${items.length} of ${summary.items} tracked items match the search`
            : undefined
        }
      >
        {items.length === 0 ? (
          <p className="ad-blank">
            Nothing is tracked yet. Turn on <strong>Track stock</strong> for a product in{" "}
            <Link to="/admin/menu">Menu Management</Link> and it will appear here.
          </p>
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Stock</th>
                  <th>Unit</th>
                  <th>Reorder at</th>
                  <th>Level</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.productId}>
                    <td>{item.name}</td>
                    <td>{item.category}</td>
                    <td className="ad-num">{item.quantity}</td>
                    <td>{item.unit || "pcs"}</td>
                    <td className="ad-num">{item.reorderPoint}</td>
                    <td>
                      <span className={`ad-badge ad-badge--${item.level.toLowerCase()}`}>
                        {item.level}
                      </span>
                    </td>
                    <td>
                      <span className="ad-list-actions">
                        <button className="om-mini" onClick={() => openAdjust(item)}>
                          Adjust
                        </button>
                        <button className="om-mini" onClick={() => openTuning(item)}>
                          <EditIcon className="om-mini-icon" />
                          Levels
                        </button>
                        <button className="om-mini" onClick={() => openHistory(item)}>
                          <ClockIcon className="om-mini-icon" />
                          History
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="ad-panel-foot">
          <Link className="om-btn om-btn--primary" to="/admin/menu">
            <PlusIcon className="om-btn-icon" />
            Add a tracked product
          </Link>
        </div>
      </AdPanel>

      {adjusting && (
        <AdFormModal
          title={`Adjust stock · ${adjusting.name}`}
          subtitle={`Currently ${adjusting.quantity} ${adjusting.unit || "pcs"} on hand.`}
          onClose={close}
          onSubmit={submitAdjust}
          saving={saving}
          error={errors}
          submitLabel="Record movement"
        >
          <AdField
            label="Quantity change"
            htmlFor="inv-qty"
            hint="Positive adds stock, negative removes it. The level can never go below zero."
          >
            <input
              id="inv-qty"
              className="om-input om-input--money"
              type="number"
              step="any"
              placeholder="e.g. 24 or -3"
              value={form.quantity ?? ""}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              autoFocus
            />
          </AdField>

          <AdField label="Reason" htmlFor="inv-reason">
            <select
              id="inv-reason"
              className="om-select"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            >
              {reasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </AdField>

          <AdField label="Note" htmlFor="inv-note">
            <input
              id="inv-note"
              className="om-input"
              type="text"
              placeholder="Optional — e.g. invoice number"
              value={form.note || ""}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </AdField>
        </AdFormModal>
      )}

      {tuning && (
        <AdFormModal
          title={`Stock settings · ${tuning.name}`}
          subtitle="Reorder point drives the low-stock alert; cost price drives the stock value."
          onClose={close}
          onSubmit={submitTuning}
          saving={saving}
          error={errors}
        >
          <AdField label="Reorder point" htmlFor="inv-reorder">
            <input
              id="inv-reorder"
              className="om-input"
              type="number"
              min="0"
              step="1"
              value={form.reorderPoint ?? 0}
              onChange={(e) => setForm({ ...form, reorderPoint: e.target.value })}
            />
          </AdField>

          <AdField label="Cost price per unit" htmlFor="inv-cost">
            <input
              id="inv-cost"
              className="om-input om-input--money"
              type="number"
              min="0"
              step="0.01"
              value={form.costPrice ?? 0}
              onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
            />
          </AdField>
        </AdFormModal>
      )}
      {history && (
        <OmModal
          title={`Stock ledger · ${history.name}`}
          subtitle={`${history.quantity} ${history.unit || "pcs"} on hand · last ${movements.length} movement(s)`}
          onClose={close}
          size="lg"
          footer={
            <button type="button" className="om-btn om-btn--ghost" onClick={close}>
              Close
            </button>
          }
        >
          {historyError ? (
            <p className="om-form-error">
              <AlertIcon className="om-btn-icon" />
              {historyError}
            </p>
          ) : movements.length === 0 ? (
            <p className="ad-blank">
              No movements recorded for this product yet. Use Adjust to log a
              purchase, sale or waste.
            </p>
          ) : (
            <div className="ad-table-wrap">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Movement</th>
                    <th>Reason</th>
                    <th>Note</th>
                    <th>Recorded by</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.createdAt)}</td>
                      <td className={`ad-num${row.quantity < 0 ? " ad-num--minus" : ""}`}>
                        {row.quantity > 0 ? `+${row.quantity}` : row.quantity}
                      </td>
                      <td>{row.reason}</td>
                      <td>{row.note || row.reference || "—"}</td>
                      <td>{row.performedByName || "System"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </OmModal>
      )}
    </div>
  );
}

export default InventoryManagement;
