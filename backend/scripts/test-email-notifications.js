/**
 * Smoke-test Gmail sale + shift notification templates.
 * Usage: node scripts/test-email-notifications.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const {
  notifyNewSale,
  notifyShiftClosed,
  notificationEnabled,
} = require("../services/emailNotifications");

async function main() {
  console.log("Gmail notifications enabled:", notificationEnabled());
  console.log("User:", process.env.GMAIL_USER || "(missing)");
  console.log("To:", process.env.GMAIL_NOTIFY_TO || process.env.GMAIL_USER || "(missing)");

  const sale = await notifyNewSale({
    orderNumber: "TEST-SALE-001",
    status: "Completed",
    channel: "Dine-In",
    paymentMethod: "Cash",
    paymentStatus: "Paid",
    customerName: "Test Customer",
    customerPhone: "03001234567",
    createdAt: new Date().toISOString(),
    subtotal: 1000,
    discountAmount: 50,
    taxAmount: 142.5,
    taxRate: 15,
    total: 1092.5,
    amountPaid: 1092.5,
    note: "Email notification smoke test",
    items: [
      { name: "Hot Coffee", quantity: 2, price: 350, lineTotal: 700 },
      { name: "Chocolate Frappe", quantity: 1, price: 300, lineTotal: 300 },
    ],
  });
  console.log("New sale result:", JSON.stringify(sale, null, 2));
  const saleOk =
    sale &&
    sale.ok !== false &&
    !sale.skipped &&
    (sale.messageId || sale.via || sale.pendingActivation);
  if (!saleOk) process.exitCode = 1;

  const shift = await notifyShiftClosed(
    {
      shiftNumber: "SHIFT-TEST-001",
      employeeName: "Test Cashier",
      branchName: "Amoons",
      openedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      closedAt: new Date().toISOString(),
      openingCash: 5000,
      expectedCash: 8200,
      closingCash: 8200,
      difference: 0,
      notes: "Email notification smoke test",
      totals: {
        totalSales: 4500,
        cashSales: 3000,
        cardSales: 1500,
        onlineSales: 0,
        aggregatorSales: 0,
        reversedValue: 0,
        pullTotal: 200,
        netRevenue: 4300,
        orderCount: 12,
        completedOrders: 11,
      },
    },
    null
  );
  console.log("Shift close result:", shift);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
