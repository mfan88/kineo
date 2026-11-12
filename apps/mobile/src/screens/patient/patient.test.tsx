import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import { patientRow, renderScreen } from "@/test/render-screen";
import { Patient } from "./index";

const mockRouter = {
  canGoBack: jest.fn<() => boolean>(),
  back: jest.fn<() => void>(),
  navigate: jest.fn<(href: unknown) => void>(),
  replace: jest.fn<(href: unknown) => void>(),
};
// jest.mock is hoisted above mockRouter, so look it up when the screen uses it.
jest.mock("expo-router", () => ({
  get router() {
    return mockRouter;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

const ROWS = {
  patients: [patientRow("11111111-1111-4111-8111-111111111111", "Riley Example", "Knee pain")],
};

describe("Patient", () => {
  it("shows the patient's name and reason for visit, with a back arrow", async () => {
    await renderScreen(<Patient patientId="11111111-1111-4111-8111-111111111111" />, ROWS);
    expect(screen.getByRole("header", { name: "Riley Example" })).toBeTruthy();
    expect(screen.getByText("Knee pain")).toBeTruthy();
    expect(screen.getByLabelText("Back")).toBeTruthy();
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it("says so when the patient isn't there", async () => {
    await renderScreen(<Patient patientId="33333333-3333-4333-8333-333333333333" />, ROWS);
    expect(screen.getByRole("header", { name: "Patient not found" })).toBeTruthy();
    expect(screen.getByLabelText("Back")).toBeTruthy();
  });
});
