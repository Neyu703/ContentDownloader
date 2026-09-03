import { fireEvent, render, screen } from "@testing-library/react-native";
import { PlaylistEntryRow } from "./PlaylistEntryRow";
import type { PlaylistEntry } from "../downloader/types";

const ENTRY: PlaylistEntry = {
  id: "1",
  url: "https://youtube.com/watch?v=1",
  title: "A Song",
  thumbnail: "https://example.com/thumb.jpg",
  duration: 125,
};

describe("PlaylistEntryRow", () => {
  it("shows the thumbnail when present", async () => {
    await render(<PlaylistEntryRow entry={ENTRY} checked={false} onToggle={jest.fn()} />);
    expect(screen.getByTestId("playlist-entry-thumbnail")).toBeTruthy();
  });

  it("omits the thumbnail when absent", async () => {
    await render(<PlaylistEntryRow entry={{ ...ENTRY, thumbnail: null }} checked={false} onToggle={jest.fn()} />);
    expect(screen.queryByTestId("playlist-entry-thumbnail")).toBeNull();
  });

  it("shows the check mark when checked, none when not", async () => {
    await render(<PlaylistEntryRow entry={ENTRY} checked={true} onToggle={jest.fn()} />);
    expect(screen.getByText("✓")).toBeTruthy();
  });

  it("shows no check mark when unchecked", async () => {
    await render(<PlaylistEntryRow entry={ENTRY} checked={false} onToggle={jest.fn()} />);
    expect(screen.queryByText("✓")).toBeNull();
  });

  it("shows the formatted duration when positive", async () => {
    await render(<PlaylistEntryRow entry={ENTRY} checked={false} onToggle={jest.fn()} />);
    expect(screen.getByText("2:05")).toBeTruthy();
  });

  it("omits the duration when null", async () => {
    await render(<PlaylistEntryRow entry={{ ...ENTRY, duration: null }} checked={false} onToggle={jest.fn()} />);
    expect(screen.queryByText("2:05")).toBeNull();
  });

  it("omits the duration when zero", async () => {
    await render(<PlaylistEntryRow entry={{ ...ENTRY, duration: 0 }} checked={false} onToggle={jest.fn()} />);
    expect(screen.queryByText("0:00")).toBeNull();
  });

  it("calls onToggle when pressed", async () => {
    const onToggle = jest.fn();
    await render(<PlaylistEntryRow entry={ENTRY} checked={false} onToggle={onToggle} />);
    await fireEvent.press(screen.getByText("A Song"));
    expect(onToggle).toHaveBeenCalled();
  });
});
