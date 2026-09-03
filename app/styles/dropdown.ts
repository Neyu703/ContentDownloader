export const dropdownStyles = {
  dropdownButton: {
    borderWidth: 1,
    borderColor: "#3a3a3a",
    backgroundColor: "#111",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownButtonText: {
    color: "#f0f0f0",
    fontSize: 14,
  },
  dropdownChevron: {
    color: "#888",
    fontSize: 12,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dropdownMenu: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3a3a3a",
    overflow: "hidden",
  },
  dropdownOption: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#2c2c2c",
  },
  dropdownOptionSelected: {
    backgroundColor: "#2a2a3a",
  },
  dropdownOptionText: {
    color: "#f0f0f0",
    fontSize: 14,
  },
} as const;
