import { Platform } from "react-native";

export const layoutStyles = {
  page: {
    flex: 1,
    backgroundColor: "#0d0d0d",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "90%",
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2c2c2c",
    padding: 28,
    // web-only: clips content past maxHeight so the job list's own ScrollView (not this card) is
    // the one scrollable region. NOT on native — jobList isn't flex:1 there (see its own comment),
    // so clipping here would just hide overflowing content with nothing able to scroll to it.
    overflow: Platform.select({ web: "hidden" as const, default: "visible" as const }),
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
    color: "#f0f0f0",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: "#a0a0a0",
    textAlign: "center",
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
  },
  searchMessage: {
    fontSize: 12,
    color: "#a0a0a0",
    textAlign: "center",
    marginBottom: 10,
  },
  linkButton: {
    alignSelf: "center",
    marginTop: 14,
  },
  linkText: {
    color: "#a0a0a0",
    textDecorationLine: "underline",
    fontSize: 13,
  },
  errorText: {
    color: "#ff6b6b",
    textAlign: "center",
    fontSize: 13,
  },
  // Zeroes a marginTop that only makes sense when stacked below another element — used when the
  // clear-finished link or the job list is the first thing in the right column instead.
  flushTop: {
    marginTop: 0,
  },
} as const;
