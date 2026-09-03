import { Platform } from "react-native";

export const jobCardStyles = {
  jobList: {
    marginTop: 10,
    flex: 1,
    // Lets the ScrollView shrink below its content's natural height instead of forcing the card
    // to overflow — a standard flexbox gotcha for scroll containers (flex:1 alone isn't enough).
    minHeight: 0,
  },
  jobCard: {
    backgroundColor: "#151515",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2c2c2c",
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  jobHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  jobThumbnail: {
    width: 56,
    height: 32,
    borderRadius: 4,
    backgroundColor: "#0d0d0d",
  },
  jobHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  jobTitle: {
    color: "#f0f0f0",
    fontWeight: "600",
    fontSize: 14,
  },
  jobDuration: {
    color: "#888",
    fontSize: 12,
  },
  jobActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  statusText: {
    flex: 1,
    color: "#a0a0a0",
    fontSize: 13,
  },
  collapseButton: {
    backgroundColor: "#2c2c2c",
    borderRadius: 6,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  collapseChevron: {
    color: "#ccc",
    fontSize: 16,
    fontWeight: "700",
  },
  progressWrapper: {
    width: "100%",
    position: "relative",
  },
  progressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2c2c2c",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#646cff",
    borderRadius: 4,
  },
  progressEtaBadge: {
    position: "absolute",
    right: 4,
    top: "50%",
    transform: [{ translateY: -8 }],
    backgroundColor: "rgba(13,13,13,0.75)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  progressEtaText: {
    color: "#f0f0f0",
    fontSize: 10,
    fontWeight: "600",
  },
  debugBox: {
    width: "100%",
    backgroundColor: "#111",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2c2c2c",
    padding: 10,
    gap: 4,
  },
  debugLine: {
    color: "#888",
    fontSize: 12,
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  downloadButton: {
    backgroundColor: "#2ecc71",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  downloadButtonText: {
    color: "#0a0a0a",
    fontWeight: "700",
    fontSize: 13,
  },
  groupHeader: {
    color: "#a0a0a0",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 4,
  },
} as const;
