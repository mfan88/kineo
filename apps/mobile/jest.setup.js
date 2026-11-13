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
