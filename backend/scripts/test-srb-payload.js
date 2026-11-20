/**
 * Offline unit checks for SRB payload math & parsing (no network).
 * Never claims a real SRB invoice was issued.
 */
const assert = require("assert");
const {
  buildPayload,
  parseSrbResponse,
  sanitizeNtn,
  saleValueOf,
  DEFAULT_OFFLINE_URL,
} = require("../services/srbService");

function run() {
  assert.strictEqual(sanitizeNtn("S1234567-8"), "1234567");
  assert.strictEqual(sanitizeNtn("1234567"), "1234567");
  // Hyphen + check digit is dropped before non-digits are stripped.
  assert.strictEqual(sanitizeNtn("NTN 9876543-1"), "9876543");

  const order = {
    id: 42,
    orderNumber: "ORD-1001",
    createdAt: "2026-11-17T10:15:30.000Z",
    subtotal: 1000,
    discountAmount: 100,
    taxRate: 16,
    paymentMethod: "Cash",
    customerName: "Walk-in",
    customerPhone: "03001234567",
  };

  const cloudConfig = {
    srbMode: "cloud",
    srbPosId: "2909",
    srbPosUser: "79278836",
    srbPosPass: "secret",
    srbTransType: "Test",
    srbTaxRate: 15,
  };

  const cloud = buildPayload(order, cloudConfig, {
    name: "Amoons Café!",
    taxNumber: "S9876543-1",
  });

  assert.deepStrictEqual(cloud.errors, []);
  assert.strictEqual(saleValueOf(order), 900);
  assert.strictEqual(cloud.saleValue, 900);
  assert.strictEqual(cloud.rateValue, 15); // prefers srbTaxRate over order 16%
  assert.strictEqual(cloud.taxAmount, 135);
  assert.strictEqual(cloud.netAmount, 1035);
  assert.strictEqual(cloud.payload.posId, 2909);
  assert.strictEqual(cloud.payload.name, "Amoons Caf");
  assert.strictEqual(cloud.payload.ntn, "9876543");
  assert.strictEqual(cloud.payload.posUser, "79278836");
  assert.strictEqual(cloud.payload.posPass, "secret");
  assert.strictEqual(cloud.payload.transType, "Test");
  assert.match(cloud.payload.invoiceDateTime, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

  const offline = buildPayload(
    order,
    {
      srbMode: "offline",
      srbPosId: "2909",
      srbApiUrl: DEFAULT_OFFLINE_URL,
      srbTaxRate: 15,
      srbTransType: "Live",
    },
    { name: "Amoons", taxNumber: "9876543" }
  );
  assert.deepStrictEqual(offline.errors, []);
  assert.strictEqual(offline.payload.posUser, undefined);
  assert.strictEqual(offline.payload.posPass, undefined);
  assert.strictEqual(offline.endpoint, DEFAULT_OFFLINE_URL);

  const noNtn = buildPayload(
    order,
    cloudConfig,
    { name: "Amoons", taxNumber: "" }
  );
  assert.ok(noNtn.errors.some((e) => /NTN/i.test(e)));

  const ok = parseSrbResponse(200, {
    resCode: "00",
    srbInvoiceId: "33126066A22",
    QRCodeLink:
      "https://apps.srb.gos.pk/InvoiceVerification/MobileInvoiceStatus.jsp?invoiceVerification=33126066A22",
  });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.srbInvoiceId, "33126066A22");

  const bad = parseSrbResponse(400, {
    resCode: "02",
    error: "Invalid POS User / Password provided",
  });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.srbInvoiceId, null);
  assert.ok(/Invalid POS User/i.test(bad.errors[0]));
  assert.ok(/SRB POS portal/i.test(bad.errors[0]));

  // Never invent success from a failure body
  const forged = parseSrbResponse(400, {
    resCode: "02",
    error: "Invalid",
    srbInvoiceId: "SHOULD-NOT-COUNT",
  });
  assert.strictEqual(forged.ok, false);

  console.log("SRB payload/unit checks passed.");
}

run();
