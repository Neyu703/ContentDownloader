import { useEffect, useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { useTranslation } from "react-i18next";
import { downloader } from "../downloader";
import { looksLikeNetscapeCookiesFile } from "../lib/cookies";
import { useStyles } from "../styles/useStyles";
import { withFeedback } from "../styles/interactive";
import { OverlayModal } from "./OverlayModal";

type CookiesStatus = { present: boolean; updatedAt: string | null };

const CHROME_EXTENSION_URL = "https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc";
const FIREFOX_EXTENSION_URL = "https://addons.mozilla.org/en-US/firefox/addon/get-cookies-txt-locally/";
const DROP_ZONE_TEST_ID = "cookie-drop-zone";

export function CookieImportModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const { t: translate } = useTranslation();
  const [cookiesText, setCookiesText] = useState("");
  const [status, setStatus] = useState<CookiesStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    downloader.getCookiesStatus().then(setStatus);
  }, [visible]);

  async function handlePaste() {
    const text = await Clipboard.getStringAsync();
    if (text) setCookiesText(text);
  }

  /** Applies picked/dropped file content, flagging it immediately if it doesn't look like a real cookies.txt. */
  function applyFileContent(content: string) {
    setSuccessMessage(null);
    setErrorMessage(looksLikeNetscapeCookiesFile(content) ? null : translate("errors.cookiesInvalidFormat"));
    setCookiesText(content);
  }

  /** Shared by the file picker and the web drop zone: resolves the text and applies it, or surfaces a read error. */
  async function readAndApplyFile(getText: () => Promise<string>) {
    try {
      applyFileContent(await getText());
    } catch {
      setErrorMessage(translate("errors.cookieFileReadFailed"));
    }
  }

  async function handlePickFile() {
    const result = await DocumentPicker.getDocumentAsync({ type: ["text/plain", "text/*"] });
    const asset = result.assets?.[0];
    if (!asset) return;
    await readAndApplyFile(() => fetch(asset.uri).then((response) => response.text()));
  }

  // Real HTML5 drag-and-drop only exists on web, and react-native-web's View doesn't forward
  // onDrop/onDragOver/onDragLeave as props the way it does onClick (confirmed missing from RNW's
  // forwarded-props allowlist) — so this wires listeners directly onto the underlying DOM node
  // instead, found by its testID (a View ref did not reliably resolve to that same node in
  // testing). Depends on `visible`: OverlayModal never actually renders the drop zone at all while
  // closed, so running this only once on CookieImportModal's own (permanent, always-open) mount
  // would find nothing and never retry. On native there's no `document`, so this is a no-op there.
  /* istanbul ignore next -- exercised only by real drag-and-drop in a browser; react-test-renderer never creates a real DOM/document for this to find a node in. */
  useEffect(() => {
    if (!visible || typeof document === "undefined") return;
    const node = document.querySelector(`[data-testid="${DROP_ZONE_TEST_ID}"]`) as HTMLElement | null;
    if (!node) return;
    const onDragOver = (event: DragEvent) => {
      event.preventDefault();
      setIsDragOver(true);
    };
    const onDragLeave = () => setIsDragOver(false);
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      setIsDragOver(false);
      const file = event.dataTransfer?.files?.[0];
      if (file) readAndApplyFile(() => file.text());
    };
    node.addEventListener("dragover", onDragOver);
    node.addEventListener("dragleave", onDragLeave);
    node.addEventListener("drop", onDrop);
    return () => {
      node.removeEventListener("dragover", onDragOver);
      node.removeEventListener("dragleave", onDragLeave);
      node.removeEventListener("drop", onDrop);
    };
  }, [visible]);

  async function handleSave() {
    const trimmed = cookiesText.trim();
    if (!trimmed) {
      setErrorMessage(translate("errors.cookiesEmpty"));
      return;
    }
    if (!looksLikeNetscapeCookiesFile(trimmed)) {
      setErrorMessage(translate("errors.cookiesInvalidFormat"));
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await downloader.importCookies(trimmed);
      setCookiesText("");
      setStatus(await downloader.getCookiesStatus());
      setSuccessMessage(translate("cookieImport.saveSuccess"));
    } catch {
      setErrorMessage(translate("errors.cookieImportFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClear() {
    await downloader.clearCookies();
    setStatus(await downloader.getCookiesStatus());
    setSuccessMessage(null);
  }

  const steps = translate("cookieImport.steps", { returnObjects: true }) as unknown as string[];

  return (
    <OverlayModal visible={visible} onClose={onClose}>
      <Pressable style={styles.cookieImportModal} onPress={() => {}} accessibilityRole="none">
        <Text style={styles.cookieImportTitle}>{translate("cookieImport.title")}</Text>
        {steps.map((step, index) => (
          <View key={index}>
            <Text style={styles.cookieImportStep}>
              {index + 1}. {step}
            </Text>
            {index === 0 && (
              <View style={styles.cookieImportLinksRow}>
                <Pressable
                  style={withFeedback(styles, undefined)}
                  onPress={() => Linking.openURL(CHROME_EXTENSION_URL)}
                  accessibilityRole="link"
                >
                  <Text style={styles.linkText}>{translate("cookieImport.chromeLink")}</Text>
                </Pressable>
                <Pressable
                  style={withFeedback(styles, undefined)}
                  onPress={() => Linking.openURL(FIREFOX_EXTENSION_URL)}
                  accessibilityRole="link"
                >
                  <Text style={styles.linkText}>{translate("cookieImport.firefoxLink")}</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))}
        <View
          testID={DROP_ZONE_TEST_ID}
          // isDragOver only ever flips true via the drag-and-drop effect above, which itself can't
          // run under react-test-renderer — see that effect's own istanbul-ignore comment.
          style={[styles.cookieImportDropZone, /* istanbul ignore next */ isDragOver && styles.cookieImportDropZoneActive]}
        >
          <Text style={styles.cookieImportDropIcon}>📤</Text>
          <Text style={styles.cookieImportDropHint}>{translate("cookieImport.dropHint")}</Text>
          <Text style={styles.cookieImportDropOr}>{translate("cookieImport.dropOr")}</Text>
          <Pressable style={withFeedback(styles, styles.secondaryButton)} onPress={handlePickFile} accessibilityRole="button">
            <Text style={styles.buttonText}>{translate("cookieImport.pickFileButton")}</Text>
          </Pressable>
        </View>
        <Text style={styles.cookieImportManualPasteLabel}>{translate("cookieImport.manualPasteLabel")}</Text>
        <View style={styles.urlRow}>
          <TextInput
            style={styles.urlInput}
            placeholder={translate("cookieImport.pasteHint")}
            value={cookiesText}
            onChangeText={setCookiesText}
            multiline
          />
          <Pressable
            style={withFeedback(styles, styles.pasteButton)}
            onPress={handlePaste}
            accessibilityLabel={translate("cookieImport.pasteHint")}
            accessibilityRole="button"
          >
            <Text style={styles.pasteButtonIcon}>📋</Text>
          </Pressable>
        </View>
        <Text style={styles.searchMessage}>
          {status?.present
            ? translate("settings.cookieImportStatusPresent", {
                date: status.updatedAt ? new Date(status.updatedAt).toLocaleString() : "",
              })
            : translate("settings.cookieImportStatusAbsent")}
        </Text>
        {successMessage && <Text style={styles.cookieImportSuccessText}>{successMessage}</Text>}
        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
        <Pressable
          style={withFeedback(styles, styles.button)}
          onPress={handleSave}
          disabled={isSaving}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{translate("cookieImport.saveButton")}</Text>
        </Pressable>
        {status?.present && (
          <Pressable
            style={withFeedback(styles, [styles.linkButton, styles.flushTop])}
            onPress={handleClear}
            accessibilityRole="button"
          >
            <Text style={styles.linkText}>{translate("settings.cookieImportClearButton")}</Text>
          </Pressable>
        )}
        <Pressable
          style={withFeedback(styles, [styles.linkButton, styles.flushTop])}
          onPress={onClose}
          accessibilityRole="button"
        >
          <Text style={styles.linkText}>{translate("cookieImport.closeButton")}</Text>
        </Pressable>
      </Pressable>
    </OverlayModal>
  );
}
