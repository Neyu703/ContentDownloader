import { Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { BackgroundProvider, useBackground } from "./BackgroundContext";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

function BackgroundProbe() {
  const { backgroundId, params, isActive, setBackground } = useBackground();
  return (
    <>
      <Text testID="id">{backgroundId}</Text>
      <Text testID="active">{String(isActive)}</Text>
      <Text testID="params">{JSON.stringify(params)}</Text>
      <Text testID="select-aero" onPress={() => setBackground("aeroShards", { scale: 1.5 })}>
        select-aero
      </Text>
    </>
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("BackgroundProvider", () => {
  it("defaults to 'none', inactive, with no params", async () => {
    await render(
      <BackgroundProvider>
        <BackgroundProbe />
      </BackgroundProvider>
    );
    expect(screen.getByTestId("id")).toHaveTextContent("none");
    expect(screen.getByTestId("active")).toHaveTextContent("false");
  });

  it("loads a previously saved setting on mount", async () => {
    await AsyncStorage.setItem(
      "contentdownloader.backgroundSetting",
      JSON.stringify({ backgroundId: "aeroShards", params: { scale: 2 } })
    );
    await render(
      <BackgroundProvider>
        <BackgroundProbe />
      </BackgroundProvider>
    );
    await waitFor(() => expect(screen.getByTestId("id")).toHaveTextContent("aeroShards"));
    expect(screen.getByTestId("active")).toHaveTextContent("true");
    expect(screen.getByTestId("params")).toHaveTextContent(JSON.stringify({ scale: 2 }));
  });

  it("persists a selection and updates state immediately", async () => {
    await render(
      <BackgroundProvider>
        <BackgroundProbe />
      </BackgroundProvider>
    );
    await waitFor(() => expect(screen.getByTestId("id")).toHaveTextContent("none"));

    await fireEvent.press(screen.getByTestId("select-aero"));

    expect(screen.getByTestId("id")).toHaveTextContent("aeroShards");
    expect(screen.getByTestId("active")).toHaveTextContent("true");
    await waitFor(async () =>
      expect(await AsyncStorage.getItem("contentdownloader.backgroundSetting")).toBe(
        JSON.stringify({ backgroundId: "aeroShards", params: { scale: 1.5 } })
      )
    );
  });
});

describe("useBackground outside a BackgroundProvider", () => {
  it("returns the inactive default with a no-op setter, instead of throwing", async () => {
    await render(<BackgroundProbe />);
    expect(screen.getByTestId("id")).toHaveTextContent("none");
    expect(screen.getByTestId("active")).toHaveTextContent("false");

    await fireEvent.press(screen.getByTestId("select-aero"));
    expect(screen.getByTestId("id")).toHaveTextContent("none");
  });
});
