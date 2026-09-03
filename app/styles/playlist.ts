export const playlistStyles = {
  playlistModal: {
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
  playlistModalTitle: {
    color: "#f0f0f0",
    fontWeight: "700",
    fontSize: 16,
  },
  playlistEntryList: {
    flex: 1,
  },
  playlistEntryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  playlistEntryThumbnail: {
    width: 64,
    height: 36,
    borderRadius: 4,
    backgroundColor: "#0d0d0d",
  },
  playlistEntryInfo: {
    flex: 1,
    gap: 2,
  },
  playlistEntryTitle: {
    color: "#f0f0f0",
    fontSize: 13,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#3a3a3a",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#646cff",
    borderColor: "#646cff",
  },
  checkboxMark: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
} as const;
