import { fireEvent, render, screen } from "@testing-library/react-native";
import { PlaylistPickerModal, type PlaylistPickerViewState } from "./PlaylistPickerModal";
import type { PlaylistEntry } from "../downloader/types";

const ENTRIES: PlaylistEntry[] = [
  { id: "a", url: "u1", title: "Video A", thumbnail: null, duration: 60 },
  { id: "b", url: "u2", title: "Video B", thumbnail: null, duration: 120 },
];

function makePicker(overrides: Partial<PlaylistPickerViewState> = {}): PlaylistPickerViewState {
  return {
    info: { title: "My Playlist", entries: ENTRIES, totalCount: null },
    selected: new Set(["a", "b"]),
    isLoadingMore: false,
    ...overrides,
  };
}

const NOOP_HANDLERS = {
  onToggleEntry: jest.fn(),
  onToggleAll: jest.fn(),
  onLoadMore: jest.fn(),
  onConfirm: jest.fn(),
  onCancel: jest.fn(),
};

describe("PlaylistPickerModal", () => {
  it("renders nothing when picker is null", async () => {
    const { toJSON } = await render(<PlaylistPickerModal picker={null} format="audio" {...NOOP_HANDLERS} />);
    expect(toJSON()).toBeNull();
  });

  it("shows the total count in the title when known", async () => {
    await render(<PlaylistPickerModal picker={makePicker({ info: { ...makePicker().info, totalCount: 42 } })} format="audio" {...NOOP_HANDLERS} />);
    expect(screen.getByText("My Playlist (42)")).toBeTruthy();
  });

  it("omits the count when totalCount is null", async () => {
    await render(<PlaylistPickerModal picker={makePicker()} format="audio" {...NOOP_HANDLERS} />);
    expect(screen.getByText("My Playlist")).toBeTruthy();
  });

  it("shows 'Alle abwählen' when everything is selected", async () => {
    await render(<PlaylistPickerModal picker={makePicker()} format="audio" {...NOOP_HANDLERS} />);
    expect(screen.getByText("Alle abwählen")).toBeTruthy();
  });

  it("shows 'Alle auswählen' when not everything is selected", async () => {
    await render(<PlaylistPickerModal picker={makePicker({ selected: new Set(["a"]) })} format="audio" {...NOOP_HANDLERS} />);
    expect(screen.getByText("Alle auswählen")).toBeTruthy();
  });

  it("calls onToggleAll when the toggle link is pressed", async () => {
    const onToggleAll = jest.fn();
    await render(<PlaylistPickerModal picker={makePicker()} format="audio" {...NOOP_HANDLERS} onToggleAll={onToggleAll} />);
    await fireEvent.press(screen.getByText("Alle abwählen"));
    expect(onToggleAll).toHaveBeenCalled();
  });

  it("renders each entry and calls onToggleEntry when one is pressed", async () => {
    const onToggleEntry = jest.fn();
    await render(<PlaylistPickerModal picker={makePicker()} format="audio" {...NOOP_HANDLERS} onToggleEntry={onToggleEntry} />);
    expect(screen.getByText("Video A")).toBeTruthy();
    expect(screen.getByText("Video B")).toBeTruthy();
    await fireEvent.press(screen.getByText("Video A"));
    expect(onToggleEntry).toHaveBeenCalledWith("a");
  });

  it("calls onLoadMore on end reached", async () => {
    const onLoadMore = jest.fn();
    await render(<PlaylistPickerModal picker={makePicker()} format="audio" {...NOOP_HANDLERS} onLoadMore={onLoadMore} />);
    fireEvent(screen.getByTestId("playlist-entry-list"), "endReached");
    expect(onLoadMore).toHaveBeenCalled();
  });

  it("shows the loading footer while isLoadingMore", async () => {
    await render(<PlaylistPickerModal picker={makePicker({ isLoadingMore: true })} format="audio" {...NOOP_HANDLERS} />);
    expect(screen.getByText("Lädt weitere Videos…")).toBeTruthy();
  });

  it("shows no loading footer otherwise", async () => {
    await render(<PlaylistPickerModal picker={makePicker({ isLoadingMore: false })} format="audio" {...NOOP_HANDLERS} />);
    expect(screen.queryByText("Lädt weitere Videos…")).toBeNull();
  });

  it("disables confirm and shows 'Nichts ausgewählt' when nothing is selected", async () => {
    await render(<PlaylistPickerModal picker={makePicker({ selected: new Set() })} format="audio" {...NOOP_HANDLERS} />);
    expect(screen.getByText("Nichts ausgewählt")).toBeTruthy();
  });

  it("calls onConfirm when the confirm button is pressed with a selection", async () => {
    const onConfirm = jest.fn();
    await render(<PlaylistPickerModal picker={makePicker()} format="video" {...NOOP_HANDLERS} onConfirm={onConfirm} />);
    await fireEvent.press(screen.getByText("2 Videos herunterladen"));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onCancel on the Abbrechen button and on the overlay", async () => {
    const onCancel = jest.fn();
    await render(<PlaylistPickerModal picker={makePicker()} format="audio" {...NOOP_HANDLERS} onCancel={onCancel} />);
    await fireEvent.press(screen.getByText("Abbrechen"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId("dropdown-overlay"));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
