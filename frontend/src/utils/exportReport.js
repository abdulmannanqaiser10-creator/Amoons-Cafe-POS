import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { PRINT_VENDOR_LINE } from "./branding";
import { formatMoney } from "./format";

function money(value) {
  return Number(value) || 0;
}

function buildSheets(data) {
  const itemsSold = (data.byCategory || []).reduce(
    (sum, row) => sum + (Number(row.quantity) || 0),
    0
  );

  const summary = [
    ["Amoons Sales Report"],
    ["Period From", data.range.from],
    ["Period To", data.range.to],
    [],
    ["Metric", "Value"],
    ["Total Orders", data.summary.orders],
    ["Total Sales / Revenue", money(data.summary.sales)],
    ["Average Order Value", money(data.summary.averageOrder)],
    ["Collected", money(data.summary.collected)],
    ["Outstanding", money(data.summary.outstanding)],
    ["Tax Collected", money(data.summary.tax)],
    ["Total Items Sold", itemsSold],
    ["Cancelled Orders", data.summary.cancelled],
    ["Cancelled Value", money(data.summary.cancelledValue)],
    ["Reversed Orders", data.summary.reversed],
    ["Reversed Value", money(data.summary.reversedValue)],
    ["Shifts in Period", data.shifts?.shifts ?? 0],
    ["Cash Pulls", money(data.shifts?.pulls)],
    ["Shift Variance Total", money(data.shifts?.variance)],
    ["Reversals Count", data.reversals?.count ?? 0],
    ["Reversals Value", money(data.reversals?.value)],
  ];

  const daily = [
    ["Date", "Orders", "Sales"],
    ...(data.daily || []).map((row) => [row.date, row.orders, money(row.sales)]),
  ];

  const products = [
    ["Product", "Quantity", "Revenue"],
    ...(data.topProducts || []).map((row) => [
      row.name,
      row.quantity,
      money(row.revenue),
    ]),
  ];

  const categories = [
    ["Category", "Quantity", "Revenue"],
    ...(data.byCategory || []).map((row) => [
      row.name,
      row.quantity,
      money(row.revenue),
    ]),
  ];

  const channels = [
    ["Channel", "Orders", "Sales"],
    ...(data.byChannel || []).map((row) => [row.key, row.orders, money(row.sales)]),
  ];

  const payments = [
    ["Payment Method", "Orders", "Sales"],
    ...(data.byPaymentMethod || []).map((row) => [
      row.key,
      row.orders,
      money(row.sales),
    ]),
  ];

  const staff = [
    ["Staff", "Orders", "Sales"],
    ...(data.byStaff || []).map((row) => [row.name, row.orders, money(row.sales)]),
  ];

  return { summary, daily, products, categories, channels, payments, staff, itemsSold };
}

/** Real .xlsx workbook with one sheet per report section. */
export function exportReportExcel(data) {
  const sheets = buildSheets(data);
  const book = XLSX.utils.book_new();

  const add = (name, rows) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = rows[0].map((_, index) => ({
      wch: Math.min(
        42,
        Math.max(
          12,
          ...rows.map((row) => String(row[index] ?? "").length + 2)
        )
      ),
    }));
    XLSX.utils.book_append_sheet(book, sheet, name.slice(0, 31));
  };

  add("Summary", sheets.summary);
  add("Daily", sheets.daily);
  add("Top Products", sheets.products);
  add("Categories", sheets.categories);
  add("Channels", sheets.channels);
  add("Payments", sheets.payments);
  add("Staff", sheets.staff);

  XLSX.writeFile(
    book,
    `amoons-report-${data.range.from}-to-${data.range.to}.xlsx`
  );
}

/** Multi-page PDF with headings, summary KPIs, and data tables. */
export function exportReportPdf(data) {
  const sheets = buildSheets(data);
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const margin = 40;
  let y = margin;

  const title = "Amoons Sales & Analytics Report";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(74, 0, 29);
  doc.text(title, margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(80, 70, 75);
  doc.text(`Period: ${data.range.from} → ${data.range.to}`, margin, y);
  y += 16;
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
  y += 24;

  const kpi = [
    ["Total Orders", String(data.summary.orders)],
    ["Total Revenue", formatMoney(data.summary.sales)],
    ["Items Sold", String(sheets.itemsSold)],
    ["Collected", formatMoney(data.summary.collected)],
    ["Outstanding", formatMoney(data.summary.outstanding)],
    ["Tax", formatMoney(data.summary.tax)],
    ["Avg Order", formatMoney(data.summary.averageOrder)],
    ["Reversals", `${data.reversals?.count ?? 0} (${formatMoney(data.reversals?.value)})`],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Key Metric", "Value"]],
    body: kpi,
    theme: "grid",
    headStyles: { fillColor: [74, 0, 29], textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 10, cellPadding: 6 },
    margin: { left: margin, right: margin },
  });

  const sections = [
    ["Daily Sales", sheets.daily],
    ["Top-Selling Items", sheets.products],
    ["Best-Selling Categories", sheets.categories],
    ["Sales by Channel", sheets.channels],
    ["Payment Methods", sheets.payments],
    ["Staff Performance", sheets.staff],
  ];

  for (const [heading, rows] of sections) {
    if (!rows || rows.length <= 1) continue;
    const startY = (doc.lastAutoTable?.finalY || y) + 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(74, 0, 29);
    doc.text(heading, margin, startY);

    const headers = rows[0].map((header) => String(header));
    autoTable(doc, {
      startY: startY + 8,
      head: [headers],
      body: rows.slice(1).map((row) =>
        row.map((cell, index) => {
          const header = headers[index].toLowerCase();
          if (typeof cell === "number" && /(sale|revenue|value|pull|tax|collected)/.test(header)) {
            return formatMoney(cell);
          }
          return cell;
        })
      ),
      theme: "striped",
      headStyles: { fillColor: [122, 18, 56], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 5 },
      margin: { left: margin, right: margin },
    });
  }

  const footerY = Math.min(
    (doc.lastAutoTable?.finalY || y) + 28,
    doc.internal.pageSize.getHeight() - 28
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90, 70, 78);
  doc.text(PRINT_VENDOR_LINE, margin, footerY);

  doc.save(`amoons-report-${data.range.from}-to-${data.range.to}.pdf`);
}
