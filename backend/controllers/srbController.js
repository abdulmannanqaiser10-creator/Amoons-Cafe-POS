const db = require("../config/db");
const { badRequest, notFound, serverError } = require("../helpers/http");
const {
  submitOrderToSrb,
  testSrbConnection,
  loadSrbConfig,
  publicIntegrations,
} = require("../services/srbService");
const { readSettings } = require("./settingsStore");

async function fetchOrderRow(id) {
  const result = await db.query(
    `SELECT o.*,
            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', oi.id,
                    'productId', oi.product_id,
                    'name', oi.product_name,
                    'category', oi.category,
                    'price', oi.unit_price,
                    'quantity', oi.quantity,
                    'lineTotal', oi.line_total
                  )
                  ORDER BY oi.id
                )
                FROM order_items oi
                WHERE oi.order_id = o.id
              ),
              '[]'::json
            ) AS items
       FROM orders o
      WHERE o.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

function mapLite(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    subtotal: Number(row.subtotal) || 0,
    discountAmount: Number(row.discount_amount) || 0,
    taxRate: Number(row.tax_rate) || 0,
    taxAmount: Number(row.tax_amount) || 0,
    total: Number(row.total) || 0,
    paymentMethod: row.payment_method,
    customerName: row.customer_name || "",
    customerPhone: row.customer_phone || "",
    deliveryAddress: row.delivery_address || "",
    status: row.status,
    srbInvoiceId: row.srb_invoice_id || "",
    srbStatus: row.srb_status || "",
    srbQrLink: row.srb_qr_link || "",
    srbResCode: row.srb_res_code || "",
    srbError: row.srb_error || "",
    srbSubmittedAt: row.srb_submitted_at || null,
  };
}

async function persistSrbResult(orderId, result) {
  await db.query(
    `UPDATE orders
        SET srb_invoice_id   = $2,
            srb_status       = $3,
            srb_qr_link      = $4,
            srb_res_code     = $5,
            srb_error        = $6,
            srb_payload      = $7::jsonb,
            srb_response     = $8::jsonb,
            srb_submitted_at = now(),
            updated_at       = now()
      WHERE id = $1`,
    [
      orderId,
      result.srbInvoiceId || null,
      result.status || "Failed",
      result.qrCodeLink || null,
      result.resCode || null,
      result.errors?.length ? result.errors.join(" ") : null,
      JSON.stringify(result.payloadPreview || {}),
      JSON.stringify(result.raw || { errors: result.errors || [] }),
    ]
  );
}

exports.status = async (_req, res) => {
  try {
    const config = await loadSrbConfig();
    const integrations = await readSettings("integrations");
    res.json({
      enabled: config.srbEnabled === true,
      configured: Boolean(
        config.srbPosId && config.srbPosUser && config.srbPosPass
      ),
      apiUrl: config.srbApiUrl,
      posId: config.srbPosId || "",
      transType: config.srbTransType || "Live",
      integrations: publicIntegrations(integrations.value || {}),
    });
  } catch (error) {
    serverError(res, error);
  }
};

exports.test = async (_req, res) => {
  try {
    // Always 200 so the admin UI can read ok/message without treating auth
    // failures as transport errors.
    const result = await testSrbConnection();
    res.json(result);
  } catch (error) {
    serverError(res, error);
  }
};

exports.submitOrder = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Unknown order.");

    const row = await fetchOrderRow(id);
    if (!row) return notFound(res, "Order not found.");

    if (["Cancelled", "Reversed"].includes(row.status)) {
      return badRequest(res, "Cancelled or reversed orders cannot be sent to SRB.");
    }

    if (row.srb_invoice_id && row.srb_status === "Submitted") {
      return res.json({
        message: "Order already submitted to SRB.",
        order: mapLite(row),
      });
    }

    const order = mapLite(row);
    const result = await submitOrderToSrb(order);
    await persistSrbResult(id, result);

    const updated = await fetchOrderRow(id);
    res.status(result.ok ? 200 : 400).json({
      message: result.ok
        ? `SRB invoice ${result.srbInvoiceId} issued.`
        : result.errors?.join(" ") || "SRB submission failed.",
      result,
      order: mapLite(updated),
    });
  } catch (error) {
    serverError(res, error);
  }
};

exports.persistSrbResult = persistSrbResult;
exports.submitOrderToSrb = submitOrderToSrb;
exports.mapLite = mapLite;
