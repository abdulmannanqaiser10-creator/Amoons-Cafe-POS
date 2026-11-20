import { useCallback, useMemo, useState } from "react";

import useResource from "../../components/admin/useResource";
import { adminApi } from "../../api/client";
import OmModal from "../../components/orders/OmModal";
import {
  AdHead,
  AdPanel,
  AdRefresh,
  AdState,
  AdFormModal,
  AdField,
  AdSwitch,
} from "../../components/admin/AdminUi";
import { PlusIcon, EditIcon, TrashIcon, AlertIcon } from "../../components/Icons";

/**
 * Category CRUD. The till reads these rows through /menu, so a save here is
 * what the counter groups by on its next refresh — `onChanged` triggers that.
 */
function CategoriesManagement({ onChanged }) {
  const [editing, setEditing] = useState(false);
  const [retiring, setRetiring] = useState(null);
  const [reassignTo, setReassignTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState("");
  const [formData, setFormData] = useState({});
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const result = await adminApi.categories.list();
    return result.categories || [];
  }, []);

  const { data: categories = [], status, error, reload } = useResource(load);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return categories;
    return categories.filter((cat) =>
      String(cat.name || "").toLowerCase().includes(needle)
    );
  }, [categories, query]);

  const sync = async () => {
    await reload();
    if (onChanged) await onChanged();
  };

  const handleAdd = () => {
    setFormData({ name: "", sortOrder: 0, isActive: true });
    setErrors("");
    setEditing(true);
  };

  const handleEdit = (cat) => {
    setFormData({ ...cat });
    setErrors("");
    setEditing(true);
  };

  const handleClose = () => {
    setEditing(false);
    setFormData({});
    setErrors("");
  };

  const handleSubmit = async () => {
    setSaving(true);
    setErrors("");

    try {
      if (formData.id) {
        await adminApi.categories.update(formData.id, formData);
      } else {
        await adminApi.categories.create(formData);
      }

      await sync();
      handleClose();
    } catch (err) {
      setErrors(err?.response?.data?.message || "Could not save this category.");
    } finally {
      setSaving(false);
    }
  };

  const openRetire = (cat) => {
    const fallback = categories.find((c) => c.id !== cat.id);
    setErrors("");
    setReassignTo(fallback ? String(fallback.id) : "");
    setRetiring(cat);
  };

  const closeRetire = () => {
    setRetiring(null);
    setReassignTo("");
    setErrors("");
  };

  const targets = retiring ? categories.filter((c) => c.id !== retiring.id) : [];

  const confirmRetire = async () => {
    if (!retiring || saving) return;

    setSaving(true);
    setErrors("");

    try {
      await adminApi.categories.remove(
        retiring.id,
        retiring.productCount > 0 ? reassignTo : undefined
      );
      await sync();
      closeRetire();
    } catch (err) {
      setErrors(err?.response?.data?.message || "Could not delete this category.");
    } finally {
      setSaving(false);
    }
  };

  if (status !== "ready") {
    return (
      <div className="ad-page">
        <AdHead title="Categories" sub="" actions={<AdRefresh onClick={reload} busy={status === "loading"} />} />
        <AdState status={status} error={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="ad-page">
      <AdHead
        title="Categories Management"
        sub={`${categories.length} categories · grouped on the till in this order`}
        actions={
          <>
            <button className="om-btn om-btn--primary" onClick={handleAdd}>
              <PlusIcon className="om-btn-icon" />
              Add category
            </button>
            <AdRefresh onClick={reload} busy={false} />
          </>
        }
      />

      <AdPanel
        className="scroll"
        title="All categories"
        sub="Search and manage till groups"
        actions={
          <input
            className="om-input"
            style={{ minWidth: 200 }}
            type="search"
            placeholder="Search categories…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search categories"
          />
        }
      >
        {categories.length === 0 ? (
          <p className="ad-blank">No categories yet — add the first one.</p>
        ) : filtered.length === 0 ? (
          <p className="ad-blank">No categories match that search.</p>
        ) : (
          <ul className="ad-list">
            {filtered.map((cat) => (
              <li key={cat.id} className="ad-list-item">
                <span className="ad-list-name">
                  {cat.name}
                  {cat.isActive === false ? (
                    <small className="ad-list-note"> hidden from the till</small>
                  ) : null}
                </span>

                <span
                  className={`ad-badge ad-badge--${
                    cat.productCount > 0 ? "amber" : "green"
                  }`}
                >
                  {cat.productCount} product{cat.productCount === 1 ? "" : "s"}
                </span>

                <span className="ad-list-actions">
                  <button className="om-mini" onClick={() => handleEdit(cat)}>
                    <EditIcon className="om-mini-icon" />
                    Edit
                  </button>
                  <button
                    className="om-mini om-mini--danger"
                    onClick={() => openRetire(cat)}
                  >
                    <TrashIcon className="om-mini-icon" />
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdPanel>

      {editing && (
        <AdFormModal
          title={formData.id ? "Edit Category" : "Add Category"}
          subtitle={
            formData.id
              ? "Renaming here renames the group on the till."
              : "New categories appear on the till as soon as they are saved."
          }
          onClose={handleClose}
          onSubmit={handleSubmit}
          saving={saving}
          error={errors}
        >
          <AdField label="Name" htmlFor="ct-name">
            <input
              id="ct-name"
              className="om-input"
              type="text"
              placeholder="e.g. Hot Coffees"
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </AdField>

          <AdField
            label="Sort order"
            htmlFor="ct-order"
            hint="Lower numbers are shown first on the till."
          >
            <input
              id="ct-order"
              className="om-input"
              type="number"
              step="1"
              value={formData.sortOrder ?? 0}
              onChange={(e) =>
                setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })
              }
            />
          </AdField>

          <div className="ad-switches">
            <AdSwitch
              label="Visible on the till"
              help="Switch off to hide this group without deleting it."
              checked={formData.isActive !== false}
              onChange={(v) => setFormData({ ...formData, isActive: v })}
            />
          </div>

          {formData.id && formData.productCount > 0 ? (
            <p className="om-hint">
              This category holds {formData.productCount} product
              {formData.productCount === 1 ? "" : "s"}.
            </p>
          ) : null}
        </AdFormModal>
      )}

      {retiring && (
        <OmModal
          title="Delete category"
          subtitle={
            retiring.productCount > 0
              ? `“${retiring.name}” still holds ${retiring.productCount} product${
                  retiring.productCount === 1 ? "" : "s"
                } — say where they go.`
              : `“${retiring.name}” holds no products.`
          }
          onClose={closeRetire}
          closeLabel="Cancel deleting this category"
          footer={
            <>
              <button
                type="button"
                className="om-btn om-btn--ghost"
                onClick={closeRetire}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="om-btn om-btn--danger"
                onClick={confirmRetire}
                disabled={saving || (retiring.productCount > 0 && targets.length === 0)}
              >
                {saving ? "Deleting…" : "Delete category"}
              </button>
            </>
          }
        >
          <div className="ad-form ad-form--flat">
            {retiring.productCount > 0 ? (
              targets.length === 0 ? (
                <p className="om-note">
                  <AlertIcon className="om-note-icon" />
                  It is the only category, so there is nowhere to move these products
                  to. Add another category first.
                </p>
              ) : (
                <AdField
                  label="Move the products to"
                  htmlFor="ct-reassign"
                  hint="The products stay on sale — only the group they sit in changes."
                >
                  <select
                    id="ct-reassign"
                    className="om-select"
                    value={reassignTo}
                    onChange={(event) => setReassignTo(event.target.value)}
                  >
                    {targets.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {`${c.name} · ${c.productCount} product${c.productCount === 1 ? "" : "s"}`}
                      </option>
                    ))}
                  </select>
                </AdField>
              )
            ) : (
              <p className="om-hint">
                Removing it takes the group off the till. No products were in it, so
                none are touched.
              </p>
            )}

            {errors ? <p className="om-form-error">{errors}</p> : null}
          </div>
        </OmModal>
      )}
    </div>
  );
}

export default CategoriesManagement;
