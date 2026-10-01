import { fireEvent, render, screen } from "@testing-library/react-native";
import { Dropdown } from "../../components/Dropdown";

// Dropdown renders through useStyles() -> useTheme() -> ThemeContext, which imports AsyncStorage
// (for the persisted theme setting) even when no ThemeProvider is mounted.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const OPTIONS = [
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
];

describe("Dropdown", () => {
  it("shows the label of the matching value", async () => {
    await render(<Dropdown options={OPTIONS} value="a" onChange={jest.fn()} />);
    expect(screen.getByText("Option A")).toBeTruthy();
  });

  it("shows an empty label when no option matches the current value", async () => {
    await render(<Dropdown options={OPTIONS} value="c" onChange={jest.fn()} />);
    expect(screen.queryByText("Option A")).toBeNull();
    expect(screen.queryByText("Option B")).toBeNull();
  });

  it("opens the menu on button press", async () => {
    await render(<Dropdown options={OPTIONS} value="a" onChange={jest.fn()} />);
    expect(screen.queryByText("Option B")).toBeNull();
    await fireEvent.press(screen.getByText("Option A"));
    expect(screen.getByText("Option B")).toBeTruthy();
  });

  it("calls onChange and closes when an option is pressed", async () => {
    const onChange = jest.fn();
    await render(<Dropdown options={OPTIONS} value="a" onChange={onChange} />);
    await fireEvent.press(screen.getByText("Option A"));
    await fireEvent.press(screen.getByText("Option B"));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("closes without calling onChange when the overlay is pressed", async () => {
    const onChange = jest.fn();
    await render(<Dropdown options={OPTIONS} value="a" onChange={onChange} />);
    await fireEvent.press(screen.getByText("Option A"));
    await fireEvent.press(screen.getByTestId("dropdown-overlay"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText("Option B")).toBeNull();
  });

  it("closes on the Modal's onRequestClose (e.g. Android back button)", async () => {
    await render(<Dropdown options={OPTIONS} value="a" onChange={jest.fn()} />);
    await fireEvent.press(screen.getByText("Option A"));
    await fireEvent(screen.getByTestId("dropdown-modal"), "requestClose");
    expect(screen.queryByText("Option B")).toBeNull();
  });
});

describe("Dropdown — scale prop", () => {
  // Pressable resolves its (possibly function-valued) `style` prop internally before it reaches
  // the rendered host node, so by the time RNTL queries it, `.props.style` is already the plain
  // resolved array — shaped as [buttonStyle, hovered, pressed] (see withFeedback()).
  function resolvedButtonStyle(button: ReturnType<typeof screen.getByRole>) {
    const style = button.props.style as [{ padding?: number }, unknown, unknown];
    return style[0];
  }

  it("uses the static (unscaled) button/label styles when scale is not provided", async () => {
    await render(<Dropdown options={OPTIONS} value="a" onChange={jest.fn()} />);
    expect(resolvedButtonStyle(screen.getByRole("button")).padding).toBe(12);
    expect(screen.getByText("Option A").props.style.fontSize).toBe(14);
  });

  it("uses the static (unscaled) styles when scale is exactly 1 (no-op)", async () => {
    await render(<Dropdown options={OPTIONS} value="a" onChange={jest.fn()} scale={1} />);
    expect(resolvedButtonStyle(screen.getByRole("button")).padding).toBe(12);
    expect(screen.getByText("Option A").props.style.fontSize).toBe(14);
  });

  it("scales both the button padding and label font size when a scale is provided", async () => {
    await render(<Dropdown options={OPTIONS} value="a" onChange={jest.fn()} scale={2} />);
    expect(resolvedButtonStyle(screen.getByRole("button")).padding).toBe(24);
    expect(screen.getByText("Option A").props.style.fontSize).toBe(28);
  });
});
