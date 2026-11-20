import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../../api/client";

/**
 * Every admin section reads from the database, so they all need the same
 * loading / error / retry cycle. The caller passes a memoised loader and gets
 * back the payload plus a `reload` that re-runs it after a save.
 *
 * When data is already on screen, a reload uses status "refreshing" so pages
 * can keep rendering instead of flashing a full-page spinner.
 */
export default function useResource(loader) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setStatus((prev) => (prev === "ready" || prev === "refreshing" ? "refreshing" : "loading"));

    try {
      const result = await loader();

      setData(result);
      setStatus("ready");
      setError("");

      return result;
    } catch (problem) {
      setError(errorMessage(problem, "This data could not be loaded."));
      setStatus((prev) => (prev === "refreshing" ? "ready" : "error"));

      return null;
    }
  }, [loader]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, setData, status, error, reload: load };
}
