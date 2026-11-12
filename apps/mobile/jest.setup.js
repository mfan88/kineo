// Reanimated's mock: animations finish at once, no native worklets runtime needed.
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

// Gesture Handler asks Worklets for the UI runtime at startup; Worklets' plain-JS
// build has none and throws, so hand it an empty one.
jest.mock("react-native-worklets", () => ({
  ...jest.requireActual("react-native-worklets"),
  getUIRuntimeHolder: () => ({}),
}));
