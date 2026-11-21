/**
 * Legacy browser HTML print helper (dialog).
 * Silent POS printing uses the Local Print Agent / Android native bridge.
 */

export function printHtmlInBrowser({ title, html }) {
  if (typeof window === "undefined" || typeof window.print !== "function") {
    return Promise.resolve(false);
  }

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("title", title || "Print");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(frame);

  const view = frame.contentWindow;
  if (!view) {
    frame.remove();
    return Promise.resolve(false);
  }

  const doc = view.document;
  doc.open();
  doc.write(html);
  doc.close();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      window.setTimeout(() => {
        try {
          frame.remove();
        } catch {
          /* ignore */
        }
      }, 200);
      resolve(Boolean(ok));
    };

    const run = () => {
      try {
        view.focus();
        view.print();
        finish(true);
      } catch {
        finish(false);
      }
    };

    if (doc.readyState === "complete") {
      window.requestAnimationFrame(run);
    } else {
      frame.onload = () => window.requestAnimationFrame(run);
      window.setTimeout(run, 80);
    }
  });
}
