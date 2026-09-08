import { isActiveState, isHovered, withActiveTint, withFeedback } from "../../styles/interactive";

const feedbackStyles = { interactiveHovered: { opacity: 0.85 }, interactivePressed: { opacity: 0.65 } };
const baseStyle = { padding: 10 };
const idle = { pressed: false, hovered: false };
const hovered = { pressed: false, hovered: true };
const pressed = { pressed: true, hovered: false };

describe("isHovered", () => {
  it("reads react-native-web's hovered field off the state object", () => {
    expect(isHovered(hovered)).toBe(true);
  });

  it("is false when hovered is false (native Pressable state)", () => {
    expect(isHovered(idle)).toBe(false);
  });
});

describe("isActiveState", () => {
  it("is true while hovered", () => {
    expect(isActiveState(hovered)).toBe(true);
  });

  it("is true while pressed", () => {
    expect(isActiveState(pressed)).toBe(true);
  });

  it("is false when neither hovered nor pressed", () => {
    expect(isActiveState(idle)).toBe(false);
  });
});

describe("withFeedback", () => {
  it("returns just the base style when idle", () => {
    expect(withFeedback(feedbackStyles, baseStyle)(idle)).toEqual([baseStyle, false, false]);
  });

  it("layers interactiveHovered on top of the base style while hovered", () => {
    expect(withFeedback(feedbackStyles, baseStyle)(hovered)).toEqual([
      baseStyle,
      feedbackStyles.interactiveHovered,
      false,
    ]);
  });

  it("layers interactivePressed on top of the base style while pressed", () => {
    expect(withFeedback(feedbackStyles, baseStyle)(pressed)).toEqual([
      baseStyle,
      false,
      feedbackStyles.interactivePressed,
    ]);
  });
});

describe("withActiveTint", () => {
  const activeStyle = { backgroundColor: "tint" };

  it("returns just the base style when idle", () => {
    expect(withActiveTint(baseStyle, activeStyle)(idle)).toEqual([baseStyle, false]);
  });

  it("applies the tint while hovered", () => {
    expect(withActiveTint(baseStyle, activeStyle)(hovered)).toEqual([baseStyle, activeStyle]);
  });

  it("applies the tint while pressed", () => {
    expect(withActiveTint(baseStyle, activeStyle)(pressed)).toEqual([baseStyle, activeStyle]);
  });
});
