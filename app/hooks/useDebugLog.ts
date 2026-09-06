import { useState } from "react";
import Constants from "expo-constants";
import * as MailComposer from "expo-mail-composer";
import { useTranslation } from "react-i18next";
import { downloader } from "../downloader";

/** Prepares the native debug-log file and hands it to the device's mail composer. */
export function useDebugLog(onError: (message: string) => void) {
  const { t } = useTranslation();
  const [isSendingLog, setIsSendingLog] = useState(false);

  async function sendLog() {
    // Defensive only: the triggering button is never rendered without getDebugLogFileUri, and is
    // disabled while isSendingLog is true, so neither side of this guard is reachable via a real press.
    /* istanbul ignore next */
    if (!downloader.getDebugLogFileUri || isSendingLog) return;
    setIsSendingLog(true);
    try {
      const fileUri = await downloader.getDebugLogFileUri();
      if (!(await MailComposer.isAvailableAsync())) {
        onError(t("home.noMailAppConfigured"));
        return;
      }
      const recipient = Constants.expoConfig?.extra?.debugLogEmail as string | undefined;
      await MailComposer.composeAsync({
        recipients: recipient ? [recipient] : undefined,
        subject: t("home.debugLogSubject"),
        body: t("home.debugLogBody"),
        attachments: [fileUri],
      });
    } catch {
      onError(t("home.logPrepareFailed"));
    } finally {
      setIsSendingLog(false);
    }
  }

  return { isSendingLog, sendLog };
}
