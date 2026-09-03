import { fireEvent, render, screen } from "@testing-library/react-native";
import { Dropdown } from "./Dropdown";

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
