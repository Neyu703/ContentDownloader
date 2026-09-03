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
  },
  cardWide: {
    maxWidth: 920,
  },
  twoColumnRow: {
    flexDirection: "row",
    gap: 24,
  },
  twoColumnLeft: {
    flex: 1,
  },
  twoColumnRight: {
    flex: 1,
    minWidth: 0,
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
