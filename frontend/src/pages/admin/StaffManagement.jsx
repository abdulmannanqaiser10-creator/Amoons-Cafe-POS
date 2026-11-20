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
  AdSwitch,
  AdToast,
  useNotice,
} from "../../components/admin/AdminUi";
import ConfirmDialog from "../../components/orders/ConfirmDialog";
import { PlusIcon, EditIcon, TrashIcon, UserIcon } from "../../components/Icons";

/**
 * Accounts the PIN screen accepts. A row that has ever touched an order is
 * deactivated rather than deleted, so the history keeps pointing at a person.
 */
function StaffManagement() {
  const [editing, setEditing] = useState(false);
  const [retiring, setRetiring] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState("");
  const [formData, setFormData] = useState({});
  const [query, setQuery] = useState("");
  const { notice, notify } = useNotice();

  const load = useCallback(async () => {
    const result = await adminApi.staff.list();
    return {
      staff: result.staff || [],
      roles: result.roles || ["staff", "admin"],
    };
  }, []);

  const { data, status, error, reload } = useResource(load);

  const staff = data?.staff ?? [];
  const active = staff.filter((s) => s.isActive);
  const managers = staff.filter((s) => s.role === "admin" && s.isActive);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return staff;
    return staff.filter((member) =>
      [member.name, member.role, member.phone, member.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [staff, query]);

  const handleAdd = () => {
    setFormData({
      name: "",
      role: "staff",
      pin: "",
      phone: "",
      email: "",
      canReverse: false,
      isActive: true,
    });
    setErrors("");
    setEditing(true);
  };

  const handleEdit = (member) => {
    setFormData({ ...member, pin: "" });
    setErrors("");
    setEditing(true);
  };

  const handleClose = () => {
    setEditing(false);
    setFormData({});
    setErrors("");
  };

  const handleSubmit = async () => {
    if (!String(formData.pin || "").trim() && !formData.id) {
      setErrors("Give this person a 5-digit PIN so they can sign in.");
      return;
    }

    if (formData.pin && !/^\d{5}$/.test(String(formData.pin).trim())) {
      setErrors("PIN must be exactly 5 digits.");
      return;
    }

    setSaving(true);
    setErrors("");

    try {
      if (formData.id) {
        await adminApi.staff.update(formData.id, formData);
      } else {
        await adminApi.staff.create(formData);
      }

      await reload();
      handleClose();
    } catch (err) {
      setErrors(err?.response?.data?.message || "Could not save this account.");
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!retiring || removing) return;

    setRemoving(true);

    try {
      const result = await adminApi.staff.remove(retiring.id);
      await reload();
      setRetiring(null);
      notify("success", result?.message || "Account removed.");
    } catch (err) {
      notify("error", err?.response?.data?.message || "Could not remove this account.");
    } finally {
      setRemoving(false);
    }
  };

  if (status !== "ready") {
    return (
      <div className="ad-page">
        <AdHead title="Staff Management" sub="" actions={<AdRefresh onClick={reload} busy={status === "loading"} />} />
        <AdState status={status} error={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="ad-page">
      <AdToast notice={notice} />
      <AdHead
        title="Staff Management"
        sub={`${active.length} active · ${managers.length} manager${managers.length === 1 ? "" : "s"} · ${staff.length - active.length} deactivated`}
        actions={
          <>
            <button className="om-btn om-btn--primary" onClick={handleAdd}>
              <PlusIcon className="om-btn-icon" />
              Add staff
            </button>
            <AdRefresh onClick={reload} busy={false} />
          </>
        }
      />

      <section className="om-cards" aria-label="Team summary">
        <article className="om-card om-card--neutral">
          <span className="om-card-icon">
            <UserIcon />
          </span>
          <div className="om-card-body">
            <span className="om-card-label">Active accounts</span>
            <strong className="om-card-value">{active.length}</strong>
            <span className="om-card-hint">Can sign in on the till</span>
          </div>
        </article>

        <article className="om-card om-card--burgundy">
          <span className="om-card-icon">
            <UserIcon />
          </span>
          <div className="om-card-body">
            <span className="om-card-label">Managers</span>
            <strong className="om-card-value">{managers.length}</strong>
            <span className="om-card-hint">Can open the admin panel</span>
          </div>
        </article>

        <article className="om-card om-card--blue">
          <span className="om-card-icon">
            <UserIcon />
          </span>
          <div className="om-card-body">
            <span className="om-card-label">Cashiers</span>
            <strong className="om-card-value">
              {active.filter((s) => s.role !== "admin").length}
            </strong>
            <span className="om-card-hint">Till access only</span>
          </div>
        </article>
      </section>

      <AdPanel
        title="Team directory"
        sub="Search by name, role, or contact"
        actions={
          <input
            className="om-input"
            style={{ minWidth: 220 }}
            type="search"
            placeholder="Search staff…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search staff"
          />
        }
      >
        {staff.length === 0 ? (
          <p className="ad-blank">No accounts yet — add the first one.</p>
        ) : filtered.length === 0 ? (
          <p className="ad-blank">No staff match that search.</p>
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Permissions</th>
                  <th>Status</th>
                  <th>Contact</th>
                  <th>Orders</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>
                      <span
                        className={`ad-badge ad-badge--${s.role === "admin" ? "burgundy" : "blue"}`}
                      >
                        {s.role === "admin" ? "Manager" : "Staff"}
                      </span>
                    </td>
                    <td>
                      <div className="ad-perm-list">
                        <span className="ad-perm-item">
                          {s.role === "admin" ? "Admin panel" : "Till only"}
                        </span>
                        <span className="ad-perm-item">
                          {s.canReverse ? "Can reverse orders" : "No reversals"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`ad-badge ad-badge--${s.isActive ? "green" : "gray"}`}
                      >
                        {s.isActive ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td>{s.phone || s.email || "—"}</td>
                    <td className="ad-num">{s.orderCount ?? 0}</td>
                    <td>
                      <span className="ad-list-actions">
                        <button className="om-mini" onClick={() => handleEdit(s)}>
                          <EditIcon className="om-mini-icon" />
                          Edit
                        </button>
                        <button
                          className="om-mini om-mini--danger"
                          onClick={() => setRetiring(s)}
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

      {editing && (
        <AdFormModal
          title={formData.id ? `Edit ${formData.name}` : "Add staff member"}
          subtitle={
            formData.id
              ? "Leave the PIN blank to keep the current one."
              : "They sign in on the PIN screen with this PIN."
          }
          onClose={handleClose}
          onSubmit={handleSubmit}
          saving={saving}
          error={errors}
        >
          <AdField label="Name" htmlFor="st-name">
            <input
              id="st-name"
              className="om-input"
              type="text"
              placeholder="Full name"
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </AdField>

          <AdField label="Role" htmlFor="st-role">
            <select
              id="st-role"
              className="om-select"
              value={formData.role || "staff"}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            >
              <option value="staff">Staff — till and own shift</option>
              <option value="admin">Manager — till and admin panel</option>
            </select>
          </AdField>

          <AdField
            label={formData.id ? "Reset PIN (optional)" : "PIN"}
            htmlFor="st-pin"
            hint="Exactly 5 digits."
          >
            <input
              id="st-pin"
              className="om-input"
              type="password"
              inputMode="numeric"
              maxLength={5}
              placeholder="•••••"
              value={formData.pin || ""}
              onChange={(e) =>
                setFormData({ ...formData, pin: e.target.value.replace(/\D/g, "") })
              }
            />
          </AdField>

          <AdField label="Phone" htmlFor="st-phone">
            <input
              id="st-phone"
              className="om-input"
              type="tel"
              placeholder="Optional"
              value={formData.phone || ""}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </AdField>

          <AdField label="Email" htmlFor="st-email">
            <input
              id="st-email"
              className="om-input"
              type="email"
              placeholder="Optional"
              value={formData.email || ""}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </AdField>

          <div className="ad-switches">
            <AdSwitch
              label="Can reverse orders"
              checked={formData.canReverse || false}
              onChange={(v) => setFormData({ ...formData, canReverse: v })}
            />

            {formData.id ? (
              <AdSwitch
                label="Account active"
                help="Deactivated accounts cannot sign in."
                checked={formData.isActive !== false}
                onChange={(v) => setFormData({ ...formData, isActive: v })}
              />
            ) : null}
          </div>
        </AdFormModal>
      )}

      {retiring && (
        <ConfirmDialog
          title={`Remove “${retiring.name}”?`}
          message={
            "An account that appears in order or shift history is deactivated instead " +
            "of deleted, so the history keeps pointing at a real person. Either way it " +
            "can no longer sign in."
          }
          confirmLabel="Remove"
          cancelLabel="Keep the account"
          busy={removing}
          onCancel={() => setRetiring(null)}
          onConfirm={confirmRemove}
        />
      )}
    </div>
  );
}

export default StaffManagement;
