// Reanimated's mock: animations finish at once, no native worklets runtime needed.
// Its shared values lack `modify`, which HeroUI's toasts call when one is hidden,
// so add it as Reanimated defines it: replace the value with the modifier's result.
jest.mock("react-native-reanimated", () => {
  const mock = require("react-native-reanimated/mock");
  return {
    ...mock,
    useSharedValue: (init) => {
      const value = mock.useSharedValue(init);
      const modify = (modifier) => value.set(modifier(value.get()));
      return new Proxy(value, {
        get: (target, prop) => (prop === "modify" ? modify : target[prop]),
      });
    },
  };
});

// Gesture Handler asks Worklets for the UI runtime at startup; Worklets' plain-JS
// build has none and throws, so hand it an empty one.
jest.mock("react-native-worklets", () => ({
  ...jest.requireActual("react-native-worklets"),
  getUIRuntimeHolder: () => ({}),
}));

// Bottom sheets: gorhom's sheet reads layout from Reanimated values the mock above
// can't provide, so use gorhom's own test mock (the sheet renders its content).
jest.mock("@gorhom/bottom-sheet", () => require("@gorhom/bottom-sheet/mock"));

// Jest has no compiled stylesheet, so every Uniwind CSS variable reads as missing:
// Uniwind warns about --theme, and HeroUI's colour helper says it fell back to black.
// Both are expected here (the app has the variables) and drowned the test output, so
// drop exactly those two messages; everything else is still printed.
const EXPECTED_IN_JEST = [
  "Uniwind - We couldn't find your variable",
  "[colorKit.RGB] An error occurred while attempting to convert",
];
for (const level of ["warn", "error"]) {
  const original = console[level];
  console[level] = (...args) => {
    const first = typeof args[0] === "string" ? args[0] : "";
    if (EXPECTED_IN_JEST.some((start) => first.startsWith(start))) return;
    original(...args);
  };
}
