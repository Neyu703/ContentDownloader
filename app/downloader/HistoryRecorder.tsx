import { useEffect } from "react";
import { startHistoryRecording } from "./historyRecording";

/**
 * Renders nothing — mounted once for the app's entire lifetime (see App.tsx) so download-history
 * capture keeps running across tab switches, instead of stopping whenever HomeScreen unmounts.
 */
export function HistoryRecorder() {
  useEffect(() => startHistoryRecording(), []);
  return null;
}
