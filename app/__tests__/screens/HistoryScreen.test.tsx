import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { downloader } from "../../downloader";
import { initI18n } from "../../i18n";
import { loadHistory, type HistoryEntry } from "../../lib/downloadHistory";
import type { RootTabParamList } from "../../navigation/types";
import { HistoryScreen } from "../../screens/HistoryScreen";

initI18n("de");

// HistoryScreen -> useStyles -> ThemeContext -> themePreference touches AsyncStorage on mount.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("../../lib/downloadHistory", () => ({ loadHistory: jest.fn() }));
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
});
