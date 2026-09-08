import { Platform } from "react-native";
import type { ThemeColors } from "../theme/colors";

// web-only: react-native-web's Text renders as a real DOM node, so its label is mouse-selectable
// by default unlike native RN Text. Spread into every button-label style so pressing/dragging a
// button doesn't highlight its text like a text selection.
export const noSelect = Platform.select({ web: { userSelect: "none" as const }, default: {} });

// Shared corner radius used across buttons/inputs/badges in dropdown.ts, form.ts, and jobCard.ts.
export const RADIUS_MD = 8;

// Shared modal card shell used by changelog.ts and playlist.ts.
export function modalCard(colors: ThemeColors) {
  return {
    width: "100%",
    maxWidth: 480,
    height: "85%",
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 20,
    gap: 10,
  } as const;
}

export function makeLayoutStyles(colors: ThemeColors, isBackgroundActive: boolean) {
  return {
    page: {
      flex: 1,
      // Transparent when an animated background is active, so BackgroundLayer (mounted behind the
      // nav stack in App.tsx) shows through instead of being hidden by this screen's own backdrop.
      backgroundColor: isBackgroundActive ? "transparent" : colors.background,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      // web-only: an active background reacts to click-and-drag anywhere on screen, which would
      // otherwise drag-select whatever's underneath the cursor over the empty margin around card.
      // card explicitly opts back into selection below, so its own text is unaffected.
      userSelect: isBackgroundActive && Platform.OS === "web" ? ("none" as const) : undefined,
    },
    card: {
      width: "100%",
      maxWidth: 480,
      maxHeight: "90%",
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 28,
      // web-only: clips content past maxHeight so the job list's own ScrollView (not this card) is
      // the one scrollable region. NOT on native — jobList isn't flex:1 there (see its own comment),
      // so clipping here would just hide overflowing content with nothing able to scroll to it.
      overflow: Platform.select({ web: "hidden" as const, default: "visible" as const }),
      // web-only: opts back into normal text selection, overriding page's userSelect:none above.
      userSelect: Platform.OS === "web" ? ("text" as const) : undefined,
    },
    cardWide: {
      maxWidth: 920,
    },
    twoColumnRow: {
      flexDirection: "row",
      gap: 24,
      // web-only: lets this row be clamped by card's maxHeight instead of growing to its content's
      // full height, so the job list's ScrollView further down can actually become scrollable.
      // NOT on native — React Native's real Yoga engine (unlike RN Web's more forgiving flexbox)
      // collapses a flex:1 child of a content-sized (maxHeight-only, non-stretched) parent to
      // near-zero height with overlapping children (confirmed on-device 2026-08-20, the exact
      // reason flex:1 was removed from here in the first place — do not re-add it unconditionally).
      flex: Platform.select({ web: 1, default: undefined }),
      minHeight: Platform.select({ web: 0, default: undefined }),
    },
    twoColumnLeft: {
      flex: 1,
    },
    twoColumnRight: {
      flex: 1,
      minWidth: 0,
      minHeight: Platform.select({ web: 0, default: undefined }),
    },
    title: {
      fontSize: 26,
      fontWeight: "700",
      color: colors.textPrimary,
      textAlign: "center",
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: "center",
      marginBottom: 24,
    },
    label: {
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: 4,
    },
    // Spaces out a second (or later) label+field pair in a settings-style stack — the first one
    // already sits right under the title and needs no extra gap above it.
    fieldSpacing: {
      marginTop: 16,
    },
    searchMessage: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: "center",
      marginBottom: 10,
    },
    linkButton: {
      alignSelf: "center",
      marginTop: 14,
    },
    linkText: {
      color: colors.textSecondary,
      textDecorationLine: "underline",
      fontSize: 13,
      ...noSelect,
    },
    // Full-width, bordered action rows used for the Settings screen's tappable entries
    // (changelog, cookie import, downloads folder) — replaces plain underlined links there.
    settingsActions: {
      gap: 8,
    },
    settingsAction: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surfaceVariant,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS_MD,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    settingsActionPressed: {
      backgroundColor: colors.accentSelected,
      borderColor: colors.borderStrong,
    },
    settingsActionText: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "500",
      ...noSelect,
    },
    settingsActionChevron: {
      color: colors.textMuted,
      fontSize: 16,
    },
    errorText: {
      color: colors.danger,
      textAlign: "center",
      fontSize: 13,
    },
    legalNotice: {
      color: colors.textFaint,
      fontSize: 11,
      textAlign: "center",
      marginTop: 20,
    },
    // Zeroes a marginTop that only makes sense when stacked below another element — used when the
    // clear-finished link or the job list is the first thing in the right column instead.
    flushTop: {
      marginTop: 0,
    },
    // Generic hover/press feedback for Pressables whose surrounding color varies (paste icon,
    // links, secondary/download buttons, dropdown rows, playlist controls, modal actions) — opacity
    // dimming reads consistently regardless of the underlying background. See withFeedback() in
    // interactive.ts. Order matters when both apply: pressed must come after hovered in the style
    // array so it overrides hovered's opacity instead of the two competing.
    interactiveHovered: {
      opacity: 0.85,
    },
    interactivePressed: {
      opacity: 0.65,
    },
  } as const;
}
