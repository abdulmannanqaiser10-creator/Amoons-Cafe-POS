/**
 * Normalizes Android WebView bridge into async window.AmoonsNativePrint.
 * Loaded early from main.jsx when running inside the APK.
 */

export function installNativePrintBridge() {
  if (typeof window === "undefined") return;

  // Already provided by Capacitor/WebView injection.
  if (window.AmoonsNativePrint?.print) return;

  if (window.AmoonsNativePrintRaw) {
    window.AmoonsNativePrint = {
      async probe({ host, port }) {
        try {
          return JSON.parse(
            window.AmoonsNativePrintRaw.probe(String(host || ""), Number(port) || 9100)
          );
        } catch (error) {
          return { ok: false, message: error?.message || String(error) };
        }
      },
      async print({ host, port, data }) {
        try {
          return JSON.parse(
            window.AmoonsNativePrintRaw.print(
              String(host || ""),
              Number(port) || 9100,
              String(data || "")
            )
          );
        } catch (error) {
          return { ok: false, message: error?.message || String(error) };
        }
      },
    };
  }
}
