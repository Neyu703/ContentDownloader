export const changelogStyles = {
  changelogModal: {
    width: "100%",
    maxWidth: 480,
    height: "85%",
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#3a3a3a",
    padding: 20,
    gap: 10,
  },
  changelogTitle: {
    color: "#f0f0f0",
    fontWeight: "700",
    fontSize: 18,
    marginBottom: 4,
  },
  changelogList: {
    flex: 1,
  },
  changelogEntry: {
    marginBottom: 16,
    gap: 4,
  },
  changelogVersion: {
    color: "#f0f0f0",
    fontWeight: "700",
    fontSize: 14,
  },
  changelogLine: {
    color: "#c0c0c0",
    fontSize: 13,
  },
} as const;
