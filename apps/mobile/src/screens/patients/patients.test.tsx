import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { patientRow, renderScreen } from "@/test/render-screen";
import { Patients } from "./index";

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
  useIsFocused: () => true,
}));

beforeEach(() => {
  jest.clearAllMocks();
});

const ROWS = {
  patients: [
    patientRow("11111111-1111-4111-8111-111111111111", "Riley Example", "Knee pain"),
    patientRow("22222222-2222-4222-8222-222222222222", "Alex Sample"),
  ],
};

describe("Patients", () => {
  it("lists everyone A–Z with their reason for visit", async () => {
    await renderScreen(<Patients />, ROWS);
    expect(screen.getByRole("header", { name: "Patients" })).toBeTruthy();
    const names = screen.getAllByText(/Example|Sample/).map((node) => node.props.children);
    expect(names).toEqual(["Alex Sample", "Riley Example"]);
    expect(screen.getByText("Knee pain")).toBeTruthy();
  });

  it("opens a patient when their row is tapped", async () => {
    await renderScreen(<Patients />, ROWS);
    await fireEvent.press(screen.getByText("Riley Example"));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: "/patient/[id]",
      params: { id: "11111111-1111-4111-8111-111111111111" },
    });
  });

  it("narrows the list as you type", async () => {
    await renderScreen(<Patients />, ROWS);
    await fireEvent.changeText(screen.getByLabelText("Search patients"), "ril");
    expect(screen.getByText("Riley Example")).toBeTruthy();
    expect(screen.queryByText("Alex Sample")).toBeNull();
  });

  it("offers to add the name when nobody matches", async () => {
    await renderScreen(<Patients />, ROWS);
    await fireEvent.changeText(screen.getByLabelText("Search patients"), " Jordan Test ");
    expect(screen.getByText("No patients match “Jordan Test”.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Add “Jordan Test” as a new patient"));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: "/patient/new",
      params: { name: "Jordan Test" },
    });
  });

  it("opens New patient from its button", async () => {
    await renderScreen(<Patients />, ROWS);
    await fireEvent.press(screen.getByText("New patient"));
    expect(mockRouter.navigate).toHaveBeenCalledWith("/patient/new");
  });

  it("says so when there are no patients yet", async () => {
    await renderScreen(<Patients />);
    expect(screen.getByText("No patients yet")).toBeTruthy();
    expect(screen.getByText("New patient")).toBeTruthy();
  });

  it("shows a patient added elsewhere straight away", async () => {
    const { setRows } = await renderScreen(<Patients />);
    await setRows(ROWS);
    expect(screen.getByText("Alex Sample")).toBeTruthy();
    expect(screen.queryByText("No patients yet")).toBeNull();
  });
});
