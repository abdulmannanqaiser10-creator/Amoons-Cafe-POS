const cell = (value) => {
  const text = value === null || value === undefined ? "" : String(value);

  // A leading =, + or - would be evaluated by Excel, so export cannot start with one.
  const safe = /^[=+-@]/.test(text) ? `'${text}` : text;

  return `"${safe.replace(/"/g, '""')}"`;
};

/**
 * Builds a CSV in memory and hands it to the browser as a download. Excel needs
 * the BOM or it reads Rs amounts as mojibake.
 */
export function downloadCsv(filename, headers, rows) {
  const csv = [
    headers.map(cell).join(","),
    ...rows.map((row) => row.map(cell).join(",")),
  ].join("\r\n");

  const blob = new Blob([`﻿${csv}`], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
