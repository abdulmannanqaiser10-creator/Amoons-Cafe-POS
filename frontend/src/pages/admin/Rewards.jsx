import { useCallback, useMemo, useState } from "react";

import useResource from "../../components/admin/useResource";
import { adminApi } from "../../api/client";
import {
  AdHead,
  AdPanel,
  AdRefresh,
  AdState,
  AdFormModal,
  AdField,
  AdToast,
  useNotice,
} from "../../components/admin/AdminUi";
import ConfirmDialog from "../../components/orders/ConfirmDialog";
import { PlusIcon, EditIcon, WalletIcon, TrashIcon } from "../../components/Icons";
import { REWARD_TIERS } from "../../data/rewardTiers";
const DEFAULT_REASONS = ["Earn", "Redeem", "Adjustment"];

const formatDate = (value) => {
  if (!value) return "Never";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB");
};

/** Loyalty balances are the same rows the till earns and redeems against. */
function Rewards() {
  const [mode, setMode] = useState(null); // "member" | "points" | "detail" | "reward"
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState("");
  const [formData, setFormData] = useState({});
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [retiring, setRetiring] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [query, setQuery] = useState("");
  const { notice, notify } = useNotice();

  const load = useCallback(async () => {
    const [result, redeemed] = await Promise.all([
      adminApi.loyalty.list(),
      adminApi.loyalty.redemptions().catch(() => ({ redemptions: [] })),
    ]);
    return {
      members: result.members || [],
      totals: result.totals || { members: 0, outstanding: 0, newToday: 0 },
      reasons: result.reasons || DEFAULT_REASONS,
      redemptions: redeemed.redemptions || [],
    };
  }, []);

  const { data, status, error, reload } = useResource(load);

  const members = data?.members ?? [];
  const totals = data?.totals ?? { members: 0, outstanding: 0, newToday: 0 };
  const reasons = data?.reasons ?? DEFAULT_REASONS;
  const redemptions = data?.redemptions ?? [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((member) =>
      [member.name, member.phone, member.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [members, query]);

  const close = () => {
    setMode(null);
    setFormData({});
    setErrors("");
    setSelected(null);
  };

  const openAdd = () => {
    setFormData({ name: "", phone: "", email: "", openingPoints: 0 });
    setErrors("");
    setMode("member");
  };

  const openAddReward = () => {
    setFormData({
      memberId: members[0]?.id || "",
      points: REWARD_TIERS[0].points,
    });
    setErrors("");
    setMode("reward");
  };

  const submitReward = async () => {
    const memberId = Number(formData.memberId);
    const points = Math.trunc(Number(formData.points));
    if (!Number.isInteger(memberId) || memberId < 1) {
      setErrors("Select a loyalty member.");
      return;
    }
    if (!REWARD_TIERS.some((tier) => tier.points === points)) {
      setErrors("Choose a valid reward tier.");
      return;
    }

    setSaving(true);
    setErrors("");
    try {
      const result = await adminApi.customers.redeem(memberId, { points });
      await reload();
      close();
      notify("success", result?.message || "Reward redeemed.");
    } catch (err) {
      setErrors(err?.response?.data?.message || "Could not redeem this reward.");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (member) => {
    setFormData({ ...member });
    setErrors("");
    setMode("member");
  };

  const openPoints = (member) => {
    setSelected(member);
    setFormData({ points: "", reason: "Adjustment", note: "" });
    setErrors("");
    setMode("points");
  };

  const openDetail = async (member) => {
    setSelected(member);
    setDetail(null);
    setDetailLoading(true);
    setMode("detail");
    setErrors("");

    try {
      const result = await adminApi.loyalty.detail(member.id);
      setDetail(result);
    } catch (err) {
      setErrors(err?.response?.data?.message || "Could not load member history.");
    } finally {
      setDetailLoading(false);
    }
  };

  const submitMember = async () => {
    setSaving(true);
    setErrors("");

    try {
      if (formData.id) {
        await adminApi.loyalty.update(formData.id, formData);
      } else {
        await adminApi.loyalty.create(formData);
      }

      await reload();
      close();
      notify("success", formData.id ? "Member updated." : "Member enrolled.");
    } catch (err) {
      setErrors(err?.response?.data?.message || "Could not save this member.");
    } finally {
      setSaving(false);
    }
  };

  const submitPoints = async () => {
    const points = Math.trunc(Number(formData.points));

    if (!Number.isFinite(points) || points === 0) {
      setErrors("Enter the points to add (positive) or remove (negative).");
      return;
    }

    setSaving(true);
    setErrors("");

    try {
      await adminApi.loyalty.addEntry(selected.id, {
        points,
        reason: formData.reason,
        note: formData.note,
      });

      await reload();
      close();
      notify("success", "Points balance updated.");
    } catch (err) {
      setErrors(err?.response?.data?.message || "Could not update the balance.");
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!retiring || removing) return;

    setRemoving(true);

    try {
      const result = await adminApi.loyalty.remove(retiring.id);
      await reload();
      setRetiring(null);
      notify("success", result?.message || "Member removed.");
    } catch (err) {
      notify("error", err?.response?.data?.message || "Could not remove this member.");
    } finally {
      setRemoving(false);
    }
  };

  if (status !== "ready") {
    return (
      <div className="ad-page">
        <AdHead title="Rewards & Loyalty" sub="" actions={<AdRefresh onClick={reload} busy={status === "loading"} />} />
        <AdState status={status} error={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="ad-page">
      <AdToast notice={notice} />
      <AdHead
        title="Rewards Management"
        sub={`${totals.members} member${totals.members === 1 ? "" : "s"} · ${totals.outstanding} points outstanding · ${totals.newToday} joined today · tiers 10→5%, 20→10%, 50→20%`}
        actions={
          <>
            <button className="om-btn om-btn--ghost" onClick={openAdd}>
              <PlusIcon className="om-btn-icon" />
              Add member
            </button>
            <button
              className="om-btn om-btn--primary"
              onClick={openAddReward}
              disabled={members.length === 0}
            >
              <WalletIcon className="om-btn-icon" />
              Add Reward
            </button>
            <AdRefresh onClick={reload} busy={false} />
          </>
        }
      />

      <section className="om-cards" aria-label="Loyalty summary">
        <article className="om-card om-card--burgundy">
          <span className="om-card-icon">
            <WalletIcon />
          </span>
          <div className="om-card-body">
            <span className="om-card-label">Members</span>
            <strong className="om-card-value">{totals.members}</strong>
          </div>
        </article>

        <article className="om-card om-card--blue">
          <span className="om-card-icon">
            <WalletIcon />
          </span>
          <div className="om-card-body">
            <span className="om-card-label">Points outstanding</span>
            <strong className="om-card-value">{totals.outstanding}</strong>
            <span className="om-card-hint">1 pt per Rs 100 on website orders</span>
          </div>
        </article>

        <article className="om-card om-card--green">
          <span className="om-card-icon">
            <WalletIcon />
          </span>
          <div className="om-card-body">
            <span className="om-card-label">Joined today</span>
            <strong className="om-card-value">{totals.newToday}</strong>
          </div>
        </article>
      </section>

      <AdPanel
        title="Reward tiers"
        sub="10 pts = 5% · 20 pts = 10% · 50 pts = 20% — redeem on till or below"
      >
        <div className="ad-reward-tiers ad-reward-tiers--showcase">
          {REWARD_TIERS.map((tier) => (
            <div key={tier.points} className="ad-reward-tier ad-reward-tier--static">
              <WalletIcon />
              <strong>{tier.points} points</strong>
              <span>{tier.label}</span>
            </div>
          ))}
        </div>
      </AdPanel>

      <AdPanel
        title="Recent redemptions"
        sub="Customers who redeemed reward points"
      >
        {redemptions.length === 0 ? (
          <p className="ad-blank">No rewards have been redeemed yet.</p>
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Points</th>
                  <th>Order</th>
                  <th>By</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {redemptions.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td>{row.memberName}</td>
                    <td>{row.memberPhone}</td>
                    <td className="ad-num">{Math.abs(row.points)} pts</td>
                    <td>{row.orderNumber || "—"}</td>
                    <td>{row.performedByName || "System"}</td>
                    <td>{row.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdPanel>

      <AdPanel
        title="Members"
        sub="Search by name or phone"
        actions={
          <input
            className="om-input"
            style={{ minWidth: 220 }}
            type="search"
            placeholder="Search members…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search loyalty members"
          />
        }
      >
        {members.length === 0 ? (
          <p className="ad-blank">No loyalty members yet — enrol the first one, or complete an order with a phone number.</p>
        ) : filtered.length === 0 ? (
          <p className="ad-blank">No members match that search.</p>
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Points</th>
                  <th>Last activity</th>
                  <th>Entries</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <button type="button" className="om-linkish" onClick={() => openDetail(m)}>
                        {m.name}
                      </button>
                    </td>
                    <td>{m.phone}</td>
                    <td>
                      <span className="ad-badge ad-badge--green">{m.points} pts</span>
                    </td>
                    <td>{formatDate(m.lastActivity)}</td>
                    <td className="ad-num">{m.entryCount ?? 0}</td>
                    <td>
                      <span className="ad-list-actions">
                        <button className="om-mini" onClick={() => openDetail(m)}>
                          History
                        </button>
                        <button className="om-mini" onClick={() => openPoints(m)}>
                          Adjust
                        </button>
                        <button className="om-mini" onClick={() => openEdit(m)}>
                          <EditIcon className="om-mini-icon" />
                          Edit
                        </button>
                        <button
                          className="om-mini om-mini--danger"
                          onClick={() => setRetiring(m)}
                        >
                          <TrashIcon className="om-mini-icon" />
                          Remove
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdPanel>

      {mode === "reward" && (
        <AdFormModal
          title="Add Reward"
          subtitle="Redeem a loyalty tier for a member (points are deducted)."
          onClose={close}
          onSubmit={submitReward}
          saving={saving}
          error={errors}
          submitLabel="Redeem reward"
        >
          <AdField label="Member" htmlFor="rw-reward-member">
            <select
              id="rw-reward-member"
              className="om-select"
              value={formData.memberId || ""}
              onChange={(e) => setFormData({ ...formData, memberId: e.target.value })}
              required
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} · {member.phone} · {member.points} pts
                </option>
              ))}
            </select>
          </AdField>
          <AdField label="Reward tier" htmlFor="rw-reward-tier">
            <select
              id="rw-reward-tier"
              className="om-select"
              value={formData.points || REWARD_TIERS[0].points}
              onChange={(e) =>
                setFormData({ ...formData, points: Number(e.target.value) })
              }
            >
              {REWARD_TIERS.map((tier) => (
                <option key={tier.points} value={tier.points}>
                  {tier.points} points → {tier.label}
                </option>
              ))}
            </select>
          </AdField>
        </AdFormModal>
      )}

      {mode === "member" && (
        <AdFormModal
          title={formData.id ? `Edit ${formData.name}` : "Enrol a member"}
          subtitle="Phone number is the unique customer identifier."
          onClose={close}
          onSubmit={submitMember}
          saving={saving}
          error={errors}
        >
          <AdField label="Name" htmlFor="rw-name">
            <input
              id="rw-name"
              className="om-input"
              type="text"
              placeholder="Member name"
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </AdField>

          <AdField label="Phone" htmlFor="rw-phone" hint="10–15 digits — unique lookup key.">
            <input
              id="rw-phone"
              className="om-input"
              type="tel"
              placeholder="03XX XXXXXXX"
              value={formData.phone || ""}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
            />
          </AdField>

          <AdField label="Email" htmlFor="rw-email">
            <input
              id="rw-email"
              className="om-input"
              type="email"
              placeholder="Optional"
              value={formData.email || ""}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </AdField>

          {!formData.id ? (
            <AdField label="Opening points" htmlFor="rw-points" hint="Optional welcome balance.">
              <input
                id="rw-points"
                className="om-input"
                type="number"
                min="0"
                step="1"
                value={formData.openingPoints ?? 0}
                onChange={(e) =>
                  setFormData({ ...formData, openingPoints: parseInt(e.target.value) || 0 })
                }
              />
            </AdField>
          ) : null}
        </AdFormModal>
      )}

      {mode === "points" && selected && (
        <AdFormModal
          title={`Manual adjustment · ${selected.name}`}
          subtitle={`Current balance ${selected.points} points. Every change is audited.`}
          onClose={close}
          onSubmit={submitPoints}
          saving={saving}
          error={errors}
          submitLabel="Apply"
        >
          <AdField
            label="Points change"
            htmlFor="rw-change"
            hint="Positive earns, negative redeems. The balance cannot go below zero."
          >
            <input
              id="rw-change"
              className="om-input om-input--money"
              type="number"
              step="1"
              placeholder="e.g. 50 or -100"
              value={formData.points ?? ""}
              onChange={(e) => setFormData({ ...formData, points: e.target.value })}
              autoFocus
            />
          </AdField>

          <AdField label="Reason" htmlFor="rw-reason">
            <select
              id="rw-reason"
              className="om-select"
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
            >
              {reasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </AdField>

          <AdField label="Audit note" htmlFor="rw-note">
            <input
              id="rw-note"
              className="om-input"
              type="text"
              placeholder="Why was this adjusted?"
              value={formData.note || ""}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
            />
          </AdField>
        </AdFormModal>
      )}

      {mode === "detail" && selected && (
        <AdFormModal
          title={`${selected.name}`}
          subtitle={`${selected.phone} · ${selected.points} points`}
          onClose={close}
          onSubmit={() => {
            close();
            openPoints(selected);
          }}
          saving={false}
          error={errors}
          submitLabel="Adjust points"
          cancelLabel="Close"
        >
          {detailLoading ? (
            <p className="ad-blank">Loading history…</p>
          ) : (
            <div className="ad-table-wrap">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Points</th>
                    <th>Reason</th>
                    <th>Order</th>
                    <th>By</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail?.entries || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="ad-blank">
                        No point transactions yet.
                      </td>
                    </tr>
                  ) : (
                    (detail?.entries || []).map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDateTime(entry.createdAt)}</td>
                        <td className="ad-num">
                          {entry.points > 0 ? `+${entry.points}` : entry.points}
                        </td>
                        <td>{entry.reason}</td>
                        <td>{entry.orderNumber || "—"}</td>
                        <td>{entry.performedByName || "System"}</td>
                        <td>{entry.note || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {detail?.member ? (
                <p className="om-hint" style={{ marginTop: 12 }}>
                  Member since {formatDate(detail.member.createdAt)} · balance{" "}
                  {detail.member.points ?? 0} pts
                </p>
              ) : null}
            </div>
          )}
        </AdFormModal>
      )}

      {retiring && (
        <ConfirmDialog
          title={`Remove “${retiring.name}”?`}
          message="This deletes the member and every points entry they have earned or redeemed. Orders that awarded those points are left alone."
          confirmLabel="Remove member"
          cancelLabel="Keep the member"
          busy={removing}
          onCancel={() => setRetiring(null)}
          onConfirm={confirmRemove}
        />
      )}
    </div>
  );
}

export default Rewards;
