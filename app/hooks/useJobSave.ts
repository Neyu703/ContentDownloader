import { useState } from "react";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";

/** Drives a finished job's save button: save state plus the "already saved — overwrite?" guard. */
export function useJobSave(onSave: ((filenameOverride?: string) => Promise<void>) | undefined, customName: string | null) {
  const { t: translate } = useTranslation();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Only ever called while the save button is mounted, which itself requires `onSave` — see the
  // `job.phase === "done" && onSave && (...)` guard around that button in JobCard.
  async function doSave() {
    setSaveState("saving");
    try {
      await onSave!(customName ?? undefined);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  function handleSavePress() {
    // The save button is `disabled` while saving, so normal touch input can't reach this; kept as
    // a defensive guard against non-standard triggers (e.g. an accessibility action bypassing the
    // disabled state) — not reachable via fireEvent.press in tests, hence the coverage exclusion.
    /* istanbul ignore next */
    if (saveState === "saving") return;
    if (saveState === "saved") {
      // Prevents the case that prompted this: tapping "speichern" twice creates two files in
      // Downloads (MediaStore auto-dedupes the name instead of overwriting).
      Alert.alert(translate("jobCard.alreadySavedTitle"), translate("jobCard.alreadySavedBody"), [
        { text: translate("jobCard.alreadySavedCancel"), style: "cancel" },
        { text: translate("jobCard.alreadySavedConfirm"), onPress: doSave },
      ]);
      return;
    }
    doSave();
  }

  return { saveState, handleSavePress };
}
