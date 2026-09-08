import { useEffect } from "react";
import { Text } from "react-native";
import { render, screen, waitFor } from "@testing-library/react-native";
import { BackgroundLayer } from "../../components/BackgroundLayer";
import { BackgroundProvider, useBackground } from "../../backgrounds/BackgroundContext";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const FakeBackground = ({ params }: { params: { label: string } }) => <Text>fake-background:{params.label}</Text>;

const mockRegistry: { id: string; labelKey: string; component: typeof FakeBackground }[] = [];
jest.mock("../../backgrounds/registry", () => ({
  get backgroundRegistry() {
    return mockRegistry;
  },
}));

/** Selects the given background id right after mount, so BackgroundLayer re-renders with it active. */
function Selector({ backgroundId, params }: { backgroundId: string; params: Record<string, unknown> }) {
  const { setBackground } = useBackground();
  useEffect(() => {
    setBackground(backgroundId, params);
  }, []);
  return null;
}

afterEach(() => {
  mockRegistry.length = 0;
});

describe("BackgroundLayer", () => {
  it("renders nothing when no background is active (default 'none')", async () => {
    const { toJSON } = await render(
      <BackgroundProvider>
        <BackgroundLayer />
      </BackgroundProvider>
    );
    expect(toJSON()).toBeNull();
  });

  it("renders nothing when the selected id isn't in the registry (e.g. native's empty registry)", async () => {
    const { toJSON } = await render(
      <BackgroundProvider>
        <Selector backgroundId="unknown" params={{}} />
        <BackgroundLayer />
      </BackgroundProvider>
    );
    await waitFor(() => expect(toJSON()).toBeNull());
  });

  it("renders the matched definition's component with the current params", async () => {
    mockRegistry.push({ id: "fake", labelKey: "background.fakeName", component: FakeBackground });
    await render(
      <BackgroundProvider>
        <Selector backgroundId="fake" params={{ label: "hello" }} />
        <BackgroundLayer />
      </BackgroundProvider>
    );
    await waitFor(() => expect(screen.getByText("fake-background:hello")).toBeTruthy());
  });
});
