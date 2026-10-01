import { render } from "@testing-library/react-native";
import { HistoryRecorder } from "../../downloader/HistoryRecorder";
import { startHistoryRecording } from "../../downloader/historyRecording";

jest.mock("../../downloader/historyRecording", () => ({ startHistoryRecording: jest.fn() }));

afterEach(() => {
  jest.clearAllMocks();
});

describe("HistoryRecorder", () => {
  it("starts history recording once on mount and renders nothing", async () => {
    const unsubscribe = jest.fn();
    (startHistoryRecording as jest.Mock).mockReturnValue(unsubscribe);
    const { toJSON, unmount } = await render(<HistoryRecorder />);
    expect(toJSON()).toBeNull();
    expect(startHistoryRecording).toHaveBeenCalledTimes(1);

    await unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
