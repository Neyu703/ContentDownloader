import { Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { DisplayPreferencesProvider, useDisplayPreferences } from "../../display/DisplayPreferencesContext";
import { DEFAULT_DEBUG_FIELDS } from "../../display/displayPreferences";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

/** Renders the current preferences as text and exposes buttons to exercise every setter. */
function DisplayPreferencesProbe() {
  const { preferences, setJobCardSize, setFormSize, setDebugFieldVisible, setAllDebugFieldsVisible } = useDisplayPreferences();
  return (
    <>
      <Text testID="jobCardSize">{preferences.jobCardSize}</Text>
      <Text testID="formSize">{preferences.formSize}</Text>
      <Text testID="speedField">{String(preferences.debugFields.speed)}</Text>
      <Text testID="etaField">{String(preferences.debugFields.eta)}</Text>
      <Text testID="set-job-card-size" onPress={() => setJobCardSize("spacious")}>
        set-job-card-size
      </Text>
      <Text testID="set-form-size" onPress={() => setFormSize("comfortable")}>
        set-form-size
      </Text>
      <Text testID="hide-speed" onPress={() => setDebugFieldVisible("speed", false)}>
        hide-speed
      </Text>
      <Text testID="hide-all" onPress={() => setAllDebugFieldsVisible(false)}>
        hide-all
      </Text>
    </>
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("DisplayPreferencesProvider", () => {
  it("defaults to original size with every debug field visible", async () => {
    await render(
      <DisplayPreferencesProvider>
        <DisplayPreferencesProbe />
      </DisplayPreferencesProvider>
    );
    await waitFor(() => expect(screen.getByTestId("jobCardSize")).toHaveTextContent("original"));
    expect(screen.getByTestId("formSize")).toHaveTextContent("original");
    expect(screen.getByTestId("speedField")).toHaveTextContent("true");
  });

  it("loads a previously saved value", async () => {
    await AsyncStorage.setItem(
      "contentdownloader.displayPreferences",
      JSON.stringify({ jobCardSize: "comfortable", formSize: "spacious", debugFields: DEFAULT_DEBUG_FIELDS })
    );
    await render(
      <DisplayPreferencesProvider>
        <DisplayPreferencesProbe />
      </DisplayPreferencesProvider>
    );
    await waitFor(() => expect(screen.getByTestId("jobCardSize")).toHaveTextContent("comfortable"));
    expect(screen.getByTestId("formSize")).toHaveTextContent("spacious");
  });

  it("persists a job-card-size change and updates immediately", async () => {
    await render(
      <DisplayPreferencesProvider>
        <DisplayPreferencesProbe />
      </DisplayPreferencesProvider>
    );
    await waitFor(() => expect(screen.getByTestId("jobCardSize")).toHaveTextContent("original"));
    await fireEvent.press(screen.getByTestId("set-job-card-size"));
    expect(screen.getByTestId("jobCardSize")).toHaveTextContent("spacious");
    await waitFor(async () => {
      const stored = await AsyncStorage.getItem("contentdownloader.displayPreferences");
      expect(stored && JSON.parse(stored).jobCardSize).toBe("spacious");
    });
  });

  it("persists a form-size change and updates immediately", async () => {
    await render(
      <DisplayPreferencesProvider>
        <DisplayPreferencesProbe />
      </DisplayPreferencesProvider>
    );
    await waitFor(() => expect(screen.getByTestId("formSize")).toHaveTextContent("original"));
    await fireEvent.press(screen.getByTestId("set-form-size"));
    expect(screen.getByTestId("formSize")).toHaveTextContent("comfortable");
  });

  it("persists a single debug-field visibility change without touching the others", async () => {
    await render(
      <DisplayPreferencesProvider>
        <DisplayPreferencesProbe />
      </DisplayPreferencesProvider>
    );
    await waitFor(() => expect(screen.getByTestId("speedField")).toHaveTextContent("true"));
    await fireEvent.press(screen.getByTestId("hide-speed"));
    expect(screen.getByTestId("speedField")).toHaveTextContent("false");
    expect(screen.getByTestId("etaField")).toHaveTextContent("true");
  });

  it("sets every debug field's visibility at once", async () => {
    await render(
      <DisplayPreferencesProvider>
        <DisplayPreferencesProbe />
      </DisplayPreferencesProvider>
    );
    await waitFor(() => expect(screen.getByTestId("etaField")).toHaveTextContent("true"));
    await fireEvent.press(screen.getByTestId("hide-all"));
    expect(screen.getByTestId("speedField")).toHaveTextContent("false");
    expect(screen.getByTestId("etaField")).toHaveTextContent("false");
  });
});

describe("useDisplayPreferences outside a DisplayPreferencesProvider", () => {
  it("returns the default preferences with no-op setters, instead of throwing", async () => {
    await render(<DisplayPreferencesProbe />);
    expect(screen.getByTestId("jobCardSize")).toHaveTextContent("original");

    // The default context's setters are genuine no-ops — pressing them must not throw or change anything.
    await fireEvent.press(screen.getByTestId("set-job-card-size"));
    await fireEvent.press(screen.getByTestId("set-form-size"));
    await fireEvent.press(screen.getByTestId("hide-speed"));
    await fireEvent.press(screen.getByTestId("hide-all"));
    expect(screen.getByTestId("jobCardSize")).toHaveTextContent("original");
    expect(screen.getByTestId("formSize")).toHaveTextContent("original");
    expect(screen.getByTestId("speedField")).toHaveTextContent("true");
  });
});
