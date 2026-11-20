import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

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
import useResource from "../../components/admin/useResource";
import { adminApi } from "../../api/client";
import ConfirmDialog from "../../components/orders/ConfirmDialog";
import { formatMoney } from "../../utils/format";
import { EditIcon, PlusIcon, RefreshIcon, TrashIcon, UploadIcon } from "../../components/Icons";

const CATEGORY_ALL = "All";

/**
 * Simple CSV parser for WooCommerce export format
 */
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  
  // Clean headers - remove special characters and normalize
  const headers = lines[0]
    .split(',')
    .map(h => h.replace(/"/g, '').trim().toLowerCase())
    .filter(Boolean);
  
  const products = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV line handling quoted strings
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const product = {};
    headers.forEach((header, idx) => {
      product[header] = values[idx] || '';
    });
    
    products.push(product);
  }
  
  return products;
}

/**
 * The catalogue the till sells from, read straight from the admin tables so a
 * category that is switched off still shows here (the counter hides it).
 * Everything is filtered on this side of the wire — one request, instant typing.
 */
function MenuManagement({ onChanged }) {
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(searchQuery);
  const [categoryFilter, setCategoryFilter] = useState(CATEGORY_ALL);
  const [editing, setEditing] = useState(false);
  const [retiring, setRetiring] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState("");
  const [formData, setFormData] = useState({});
  
  // CSV Import states
  const [csvFile, setCsvFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState({ progress: 0, imported: 0, skipped: 0, total: 0 });
  
  const fileInputRef = useRef(null);
  const { notice, notify } = useNotice();

  const load = useCallback(async () => {
    const [catalogue, groups] = await Promise.all([
      adminApi.products.list(),
      adminApi.categories.list(),
    ]);

    return {
      products: catalogue.products || [],
      categories: groups.categories || [],
    };
  }, []);

  const { data, status, error, reload } = useResource(load);

  useEffect(() => {
    setQuery(searchQuery);
  }, [searchQuery]);

  const products = data?.products ?? [];
  const categories = data?.categories ?? [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory =
        categoryFilter === CATEGORY_ALL ||
        product.categoryId === Number(categoryFilter);
      const matchesQuery =
        needle === "" || product.name.toLowerCase().includes(needle);

      return matchesCategory && matchesQuery;
    });
  }, [products, query, categoryFilter]);

  const handleCreateClick = () => {
    setEditing(true);
    setFormData({
      categoryId: categories[0]?.id ?? "",
      name: "",
      price: 0,
      description: "",
      imageUrl: "",
      isAvailable: true,
      trackStock: false,
      unit: "pcs",
    });
    setErrors("");
  };

  const handleEditClick = (product) => {
    setEditing(true);
    setFormData({ ...product });
    setErrors("");
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
      const result = formData.id
        ? await adminApi.products.update(formData.id, formData)
        : await adminApi.products.create(formData);

      await reload();
      if (onChanged) await onChanged();
      handleClose();

      // The server knows when a newly tracked item starts at zero stock, which
      // is the one save that silently stops the till selling it.
      if (result?.hint) notify("success", result.hint);
    } catch (err) {
      setErrors(err?.response?.data?.message || err.message || "Could not save this product.");
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!retiring || removing) return;

    setRemoving(true);

    try {
      const result = await adminApi.products.remove(retiring.id);
      await reload();
      if (onChanged) await onChanged();
      setRetiring(null);
      notify("success", result?.message || "Product removed from the till.");
    } catch (err) {
      notify("error", err?.response?.data?.message || "Could not retire this product.");
    } finally {
      setRemoving(false);
    }
  };

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const uploadImage = (event) => {
    const [file] = event.target.files ?? [];
    if (!file) return;

    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      setErrors("Choose a PNG, JPEG, WebP, or GIF image.");
      event.target.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setErrors("Images must be smaller than 2 MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        updateField("imageUrl", reader.result);
        setErrors("");
      }
    };
    reader.onerror = () => setErrors("The selected image could not be read.");
    reader.readAsDataURL(file);
  };

  /** Upload CSV file */
  const handleCsvUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "text/csv" && !file.name.endsWith('.csv')) {
      notify("error", "Please select a valid CSV file");
      return;
    }

    setCsvFile(file);
    
    try {
      const text = await file.text();
      await bulkImportCSV(text, file.name);
    } catch (error) {
      notify("error", `Failed to parse CSV: ${error.message}`);
    } finally {
      setCsvFile(null);
    }
  };

  /** Bulk import products from WooCommerce CSV export */
  const bulkImportCSV = async (csvText, fileName) => {
    setImporting(true);
    setImportStatus({ progress: 0, imported: 0, skipped: 0, total: 0 });
    let imported = 0;
    let skipped = 0;

    try {
      const products = parseCSV(csvText);

      // Map WooCommerce parent SKU/ID -> category + description + image for variations
      const parentsBySku = new Map();
      const parentsById = new Map();
      for (const product of products) {
        const type = String(product.type || "").toLowerCase();
        if (type === "variation") continue;
        const meta = {
          categories: product.categories || "",
          description: (product.description || product.short_description || "").trim(),
          image:
            (typeof product.images === "string" ? product.images.split(",")[0]?.trim() : "") ||
            product.images?.[0]?.src ||
            "",
          name: product.name || "",
        };
        if (product.sku) parentsBySku.set(String(product.sku), meta);
        if (product.id) parentsById.set(String(product.id), meta);
      }

      const filtered = products.filter((p) => {
        const type = String(p.type || "").toLowerCase();
        const price = parseFloat(p.regular_price);
        if (!p.name || !Number.isFinite(price) || price <= 0) return false;
        // Import simple/variable priced rows and variation rows
        if (type === "variation") return true;
        if (type === "variable" && !p.regular_price) return false;
        return Boolean(p.categories) || type === "variation";
      });
      
      setImportStatus({ progress: 10, imported: 0, skipped: 0, total: filtered.length });
      
      // First fetch existing categories
      const categoryData = await adminApi.categories.list();
      const existingCategories = new Map(categoryData.categories.map(c => [c.name.toLowerCase(), c.id]));
      const existingProducts = new Map(
        (data?.products || []).map((p) => [String(p.name).toLowerCase(), p.id])
      );
      
      // Process each product
      for (let i = 0; i < filtered.length; i++) {
        const product = filtered[i];
        const type = String(product.type || "").toLowerCase();
        const parentMeta =
          parentsBySku.get(String(product.parent || "")) ||
          parentsById.get(String(product.parent || "")) ||
          null;
        
        // Find or create category
        const categorySource = product.categories || parentMeta?.categories || "";
        const categoryNames = categorySource.split(',').map(c => c.trim()).filter(Boolean);
        let categoryId = null;
        
        for (const catName of categoryNames) {
          const lowerCat = catName.toLowerCase();
          
          if (existingCategories.has(lowerCat)) {
            categoryId = existingCategories.get(lowerCat);
          } else {
            // Create new category
            try {
              const result = await adminApi.categories.create({ name: catName });
              categoryId = result.category.id;
              existingCategories.set(lowerCat, categoryId);
            } catch (err) {
              console.warn(`Could not create category "${catName}":`, err.message);
            }
          }
          
          if (categoryId) break;
        }
        
        if (!categoryId) {
          skipped += 1;
          setImportStatus((prev) => ({ ...prev, skipped }));
          continue;
        }

        const productName = product.name.trim();
        if (existingProducts.has(productName.toLowerCase())) {
          skipped += 1;
          setImportStatus((prev) => ({ ...prev, skipped }));
          continue;
        }

        const imageUrl =
          (typeof product.images === "string" ? product.images.split(",")[0]?.trim() : "") ||
          product.images?.[0]?.src ||
          parentMeta?.image ||
          "";
        const description =
          (product.description || product.short_description || "").trim() ||
          parentMeta?.description ||
          "";
        
        // Create product
        try {
          await adminApi.products.create({
            name: productName,
            categoryId: categoryId,
            price: parseFloat(product.regular_price),
            isAvailable: product.published === "1" || product.status === "publish" || type === "variation",
            description,
            imageUrl,
          });

          existingProducts.set(productName.toLowerCase(), true);
          imported += 1;
          setImportStatus({
            progress: 10 + Math.round(((i + 1) / filtered.length) * 80),
            imported,
            skipped,
            total: filtered.length,
          });
        } catch (err) {
          console.warn(`Could not create product "${product.name}":`, err.message);
          skipped += 1;
          setImportStatus((prev) => ({ ...prev, skipped }));
        }
      }
      
      // Final reload
      await reload();
      if (onChanged) await onChanged();

      notify(
        "success",
        skipped > 0
          ? `${imported} items imported from ${fileName} (${skipped} skipped)`
          : `${imported} items imported from ${fileName}`
      );
      
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      notify("error", `Import failed: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  if (status !== "ready") {
    return (
      <div className="ad-page">
        <AdHead title="Menu Management" sub="" actions={<AdRefresh onClick={reload} busy={status === "loading"} />} />
        <AdState status={status} error={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="ad-page">
      <AdToast notice={notice} />

      <AdHead
        title="Menu Management"
        sub={`${filtered.length} of ${products.length} products · ${
          products.filter((p) => !p.canSell).length
        } cannot be sold right now`}
        actions={<AdRefresh onClick={reload} busy={false} />}
      />

      <AdPanel className="filters">
        <div className="ad-filter-row">
          <input
            className="om-input om-search"
            type="search"
            placeholder="Search products…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search products"
          />

          <select
            className="om-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value={CATEGORY_ALL}>All categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
                {cat.isActive === false ? " (hidden)" : ""}
              </option>
            ))}
          </select>

          <button className="om-btn om-btn--primary" onClick={handleCreateClick}>
            <PlusIcon className="om-btn-icon" />
            Add product
          </button>

          <label className="om-btn om-btn--ghost" title="Import from WooCommerce CSV">
            <UploadIcon className="om-btn-icon" />
            Import CSV
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,text/csv"
              onChange={handleCsvUpload}
              style={{ display: 'none' }}
              disabled={importing}
            />
          </label>
        </div>
      </AdPanel>

      {/* Import Progress */}
      {importing && (
        <AdPanel className="import-progress">
          <div className="ad-import-header">
            <h3 className="ad-import-title">
              <RefreshIcon className={`om-spin ad-loading-icon`} />
              Importing Products...
            </h3>
            <span className="ad-import-count">
              {importStatus.imported} / {importStatus.total} imported
            </span>
          </div>
          
          <div className="ad-import-bar">
            <div 
              className="ad-import-progress" 
              style={{ width: `${importStatus.progress}%` }}
            />
          </div>
          
          <div className="ad-import-details">
            <span>✓ Imported: {importStatus.imported}</span>
            {importStatus.skipped > 0 && (
              <span className="ad-import-skipped">⚠ Skipped/Failed: {importStatus.skipped}</span>
            )}
          </div>
        </AdPanel>
      )}

      {filtered.length === 0 ? (
        <p className="ad-blank">
          {products.length === 0
            ? "No products yet — add the first one."
            : "No products match this filter."}
        </p>
      ) : (
        <section className="ad-grid" aria-label="Product list">
          {filtered.map((product) => (
            <article key={product.id} className={`ad-card${!product.canSell ? " ad-card--off" : ""}`}>
              {product.imageUrl ? (
                <div className="ad-card-image">
                  <img src={product.imageUrl} alt="" loading="lazy" />
                </div>
              ) : null}
              <header className="ad-card-head">
                <span className="ad-card-name">{product.name}</span>
                <span className={`ad-badge ad-badge--${product.isAvailable ? "green" : "red"}`}>
                  {product.isAvailable ? "Available" : "Unavailable"}
                </span>
              </header>

              <div className="ad-card-body">
                <span className="ad-card-cat">{product.category || "Uncategorised"}</span>
                <span className="ad-card-price">{formatMoney(product.price)}</span>

                {product.trackStock ? (
                  <span
                    className={`ad-stock ad-stock--${
                      product.stock <= 0 ? "out" : product.stock <= 5 ? "low" : "ok"
                    }`}
                  >
                    {product.stock} {product.unit || "pcs"} left
                  </span>
                ) : null}

                <footer className="ad-card-foot">
                  <button className="om-mini" onClick={() => handleEditClick(product)}>
                    <EditIcon className="om-mini-icon" />
                    Edit
                  </button>

                  <button className="om-mini om-mini--danger" onClick={() => setRetiring(product)}>
                    <TrashIcon className="om-mini-icon" />
                    Retire
                  </button>
                </footer>
              </div>
            </article>
          ))}
        </section>
      )}

      {editing && (
        <AdFormModal
          title={formData.id ? "Edit Product" : "Add Product"}
          onClose={handleClose}
          onSubmit={handleSubmit}
          saving={saving}
          error={errors}
        >
          <AdField label="Name" htmlFor="pm-name">
            <input
              id="pm-name"
              className="om-input"
              type="text"
              placeholder="Product name"
              value={formData.name || ""}
              onChange={(e) => updateField("name", e.target.value)}
              required
            />
          </AdField>

          <AdField label="Category" htmlFor="pm-category">
            <select
              id="pm-category"
              className="om-select"
              value={formData.categoryId || ""}
              onChange={(e) => updateField("categoryId", Number(e.target.value))}
              required
            >
              <option value="">Choose category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </AdField>

          <AdField label="Price" htmlFor="pm-price">
            <input
              id="pm-price"
              className="om-input om-input--money"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={formData.price ?? ""}
              onChange={(e) => updateField("price", parseFloat(e.target.value) || 0)}
              required
            />
          </AdField>

          <AdField label="Upload image" htmlFor="pm-image-upload" hint="PNG, JPEG, WebP, or GIF. Maximum 2 MB.">
            <input
              id="pm-image-upload"
              className="om-input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={uploadImage}
            />
          </AdField>

          <AdField label="Or use an image URL" htmlFor="pm-image" hint="Full http(s) address of a photo.">
            <input
              id="pm-image"
              className="om-input"
              type="url"
              placeholder="https://example.com/image.png"
              value={formData.imageUrl?.startsWith("data:") ? "" : formData.imageUrl || ""}
              onChange={(e) => updateField("imageUrl", e.target.value)}
            />
          </AdField>
          {formData.imageUrl ? (
            <button type="button" className="om-mini" onClick={() => updateField("imageUrl", "")}>
              Remove image
            </button>
          ) : null}

          <AdField label="Description" htmlFor="pm-desc">
            <textarea
              id="pm-desc"
              className="om-textarea"
              rows={3}
              placeholder="Short description"
              value={formData.description || ""}
              onChange={(e) => updateField("description", e.target.value)}
            />
          </AdField>

          <div className="ad-switches">
            <AdSwitch
              label="Track stock"
              help="The till stops selling it at zero."
              checked={formData.trackStock || false}
              onChange={(v) => updateField("trackStock", v)}
            />

            <AdSwitch
              label="Available"
              checked={formData.isAvailable !== false}
              onChange={(v) => updateField("isAvailable", v)}
            />
          </div>

          {formData.trackStock ? (
            <AdField label="Unit" htmlFor="pm-unit">
              <input
                id="pm-unit"
                className="om-input"
                type="text"
                placeholder="pcs, bottle, kg…"
                value={formData.unit || "pcs"}
                onChange={(e) => updateField("unit", e.target.value)}
              />
            </AdField>
          ) : null}
        </AdFormModal>
      )}

      {retiring && (
        <ConfirmDialog
          title={`Retire “${retiring.name}”?`}
          message={
            "A product that already appears on an order is marked unavailable " +
            "instead of deleted, so past receipts keep their lines. Either way it " +
            "leaves the till."
          }
          confirmLabel="Retire"
          cancelLabel="Keep selling it"
          busy={removing}
          onCancel={() => setRetiring(null)}
          onConfirm={confirmRemove}
        />
      )}
    </div>
  );
}

export default MenuManagement;
