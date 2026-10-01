import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { downloader } from "../../downloader";
import { initI18n } from "../../i18n";
import { appendHistoryEntries, loadHistory, removeHistoryEntries, type HistoryEntry } from "../../lib/downloadHistory";
import type { RootTabParamList } from "../../navigation/types";
import { HistoryScreen } from "../../screens/HistoryScreen";

initI18n("de");

// HistoryScreen -> useStyles -> ThemeContext -> themePreference touches AsyncStorage on mount.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("../../lib/downloadHistory", () => ({
  loadHistory: jest.fn(),
  removeHistoryEntries: jest.fn().mockResolvedValue(undefined),
  appendHistoryEntries: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../downloader", () => ({ downloader: { enqueue: jest.fn() } }));

const Tab = createBottomTabNavigator<RootTabParamList>();

function HomePlaceholder() {
  return <Text>Home Screen Placeholder</Text>;
}

function renderHistoryScreen() {
  return render(
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen name="History" component={HistoryScreen} />
        <Tab.Screen name="Home" component={HomePlaceholder} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: "a",
    url: "https://youtube.com/watch?v=a",
    format: "audio",
    quality: "320",
    title: "First",
    thumbnail: null,
    result: "/cache/a.mp3",
    ext: "mp3",
    createdAt: 1000,
    completedAt: 1000,
    ...overrides,
  };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe("HistoryScreen", () => {
  it("shows the empty state when there is no history", async () => {
    (loadHistory as jest.Mock).mockResolvedValue([]);
    await renderHistoryScreen();
    await waitFor(() => expect(screen.getByText("Noch keine abgeschlossenen Downloads.")).toBeTruthy());
  });

  it("offers a way to start a first download from the empty state, switching to Home", async () => {
    (loadHistory as jest.Mock).mockResolvedValue([]);
    await renderHistoryScreen();
    await waitFor(() => expect(screen.getByText("Ersten Download starten")).toBeTruthy());
    await fireEvent.press(screen.getByText("Ersten Download starten"));
    await waitFor(() => expect(screen.getByText("Home Screen Placeholder")).toBeTruthy());
  });

  it("renders entries newest first, falling back to the url when a title is missing", async () => {
    (loadHistory as jest.Mock).mockResolvedValue([
      makeEntry({ id: "a", title: null, ext: "mp3" }),
      makeEntry({
        id: "b",
        title: "Second",
        thumbnail: "https://example.com/thumb.jpg",
        ext: "mp4",
        url: "https://youtube.com/watch?v=b",
      }),
      makeEntry({ id: "c", title: "Third", ext: null, url: "https://youtube.com/watch?v=c" }),
    ]);
    await renderHistoryScreen();
    await waitFor(() => expect(screen.getByText("Third")).toBeTruthy());
    expect(screen.getByText("Second")).toBeTruthy();
    expect(screen.getByText("https://youtube.com/watch?v=a")).toBeTruthy();
    expect(screen.getByText(/MP4$/)).toBeTruthy();
    expect(screen.getByText(/MP3$/)).toBeTruthy();
    expect(screen.getAllByTestId("history-thumbnail")).toHaveLength(1);
  });

  it("re-downloads an entry via enqueue and navigates to the Home tab", async () => {
    (loadHistory as jest.Mock).mockResolvedValue([
      makeEntry({ title: "Foo", format: "video", quality: "720", url: "https://youtube.com/watch?v=foo" }),
    ]);
    await renderHistoryScreen();
    await waitFor(() => expect(screen.getByText("Foo")).toBeTruthy());

    await fireEvent.press(screen.getByText("Erneut herunterladen"));

    expect(downloader.enqueue).toHaveBeenCalledWith({
      url: "https://youtube.com/watch?v=foo",
      format: "video",
      quality: "720",
      title: "Foo",
      thumbnail: null,
    });
    await waitFor(() => expect(screen.getByText("Home Screen Placeholder")).toBeTruthy());
  });

  describe("removing entries", () => {
    const first = makeEntry({ id: "a", title: "First", completedAt: 1000 });
    const second = makeEntry({ id: "b", title: "Second", completedAt: 2000 });

    it("removes a single entry and offers to undo it", async () => {
      (loadHistory as jest.Mock).mockResolvedValueOnce([first, second]).mockResolvedValue([second]);
      await renderHistoryScreen();
      await waitFor(() => expect(screen.getByText("First")).toBeTruthy());

      await fireEvent.press(screen.getByLabelText("„First“ aus dem Verlauf entfernen"));

      expect(removeHistoryEntries).toHaveBeenCalledWith(["a"]);
      await waitFor(() => expect(screen.queryByText("First")).toBeNull());
      expect(screen.getByText("1 Eintrag entfernt")).toBeTruthy();
    });

    it("restores the removed entries on undo and hides the undo bar", async () => {
      (loadHistory as jest.Mock).mockResolvedValueOnce([first, second]).mockResolvedValueOnce([second]).mockResolvedValue([first, second]);
      await renderHistoryScreen();
      await waitFor(() => expect(screen.getByText("First")).toBeTruthy());
      await fireEvent.press(screen.getByLabelText("„First“ aus dem Verlauf entfernen"));
      await waitFor(() => expect(screen.getByText("Rückgängig")).toBeTruthy());

      await fireEvent.press(screen.getByText("Rückgängig"));

      expect(appendHistoryEntries).toHaveBeenCalledWith([first]);
      await waitFor(() => expect(screen.getByText("First")).toBeTruthy());
      expect(screen.queryByText("Rückgängig")).toBeNull();
    });

    it("clears the whole history by id, landing on the empty state with an undo offer", async () => {
      (loadHistory as jest.Mock).mockResolvedValueOnce([first, second]).mockResolvedValue([]);
      await renderHistoryScreen();
      await waitFor(() => expect(screen.getByText("Verlauf leeren")).toBeTruthy());

      await fireEvent.press(screen.getByText("Verlauf leeren"));

      expect(removeHistoryEntries).toHaveBeenCalledWith(["b", "a"]);
      await waitFor(() => expect(screen.getByText("Noch keine abgeschlossenen Downloads.")).toBeTruthy());
      expect(screen.getByText("2 Einträge entfernt")).toBeTruthy();
    });

    it("drops a pending undo once the tab is left and revisited", async () => {
      (loadHistory as jest.Mock).mockResolvedValueOnce([first, second]).mockResolvedValue([second]);
      await renderHistoryScreen();
      await waitFor(() => expect(screen.getByText("First")).toBeTruthy());
      await fireEvent.press(screen.getByLabelText("„First“ aus dem Verlauf entfernen"));
      await waitFor(() => expect(screen.getByText("Rückgängig")).toBeTruthy());

      await fireEvent.press(screen.getByText("Erneut herunterladen"));
      await waitFor(() => expect(screen.getByText("Home Screen Placeholder")).toBeTruthy());
      await fireEvent.press(screen.getByText("History"));

      await waitFor(() => expect(screen.queryByText("Rückgängig")).toBeNull());
    });
  });
});
