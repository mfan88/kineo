import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { TextInput } from "react-native";
import { NEW_ID, patientRow, renderScreen, TEST_OWNER } from "@/test/render-screen";
import { NewPatient } from "./index";

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

describe("New patient", () => {
  it("saves the patient, says so and opens them once they're in the database", async () => {
    const { writes, setRows } = await renderScreen(<NewPatient />);
    await fireEvent.changeText(screen.getByLabelText("Full name"), "Jordan Test");
    await fireEvent.changeText(screen.getByLabelText("Reason for visit (optional)"), " Sore back ");
    await fireEvent.press(screen.getByText("Add patient"));

    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toContain("INSERT INTO patients");
    expect(writes[0]?.parameters.slice(0, 4)).toEqual([
      NEW_ID,
      TEST_OWNER,
      "Jordan Test",
      "Sore back",
    ]);
    // Not until the screens can read the new patient.
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await setRows({ patients: [patientRow(NEW_ID, "Jordan Test", "Sore back")] });
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: "/patient/[id]",
      params: { id: NEW_ID },
    });
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    // The toast draws its text more than once (it measures itself first).
    expect((await screen.findAllByText("Patient added")).length).toBeGreaterThan(0);
  });

  it("saves without a reason for visit", async () => {
    const { writes } = await renderScreen(<NewPatient />);
    await fireEvent.changeText(screen.getByLabelText("Full name"), "Jordan Test");
    await fireEvent.press(screen.getByText("Add patient"));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.parameters[3]).toBeNull();
  });

  it("asks for the name when it's empty, and saves nothing", async () => {
    const { writes } = await renderScreen(<NewPatient />);
    await fireEvent.changeText(screen.getByLabelText("Full name"), "   ");
    await fireEvent.press(screen.getByText("Add patient"));
    expect(await screen.findByText("Add the patient's full name.")).toBeTruthy();
    expect(writes).toEqual([]);
    expect(mockRouter.replace).not.toHaveBeenCalled();

    // The message goes once the name is being typed.
    await fireEvent.changeText(screen.getByLabelText("Full name"), "J");
    await waitFor(() => expect(screen.queryByText("Add the patient's full name.")).toBeNull());
  });

  it("starts with the name that was searched for", async () => {
    await renderScreen(<NewPatient name=" Jordan Test " />);
    expect(screen.getByLabelText("Full name").props.value).toBe("Jordan Test");
  });

  it("moves from the name to the reason on return, and saves from the reason", async () => {
    const { writes } = await renderScreen(<NewPatient />);
    await fireEvent.changeText(screen.getByLabelText("Full name"), "Jordan Test");
    const focus = jest.spyOn(TextInput.prototype, "focus");
    await fireEvent(screen.getByLabelText("Full name"), "submitEditing");
    expect(writes).toEqual([]);
    expect(focus).toHaveBeenCalledTimes(1);

    await fireEvent.changeText(screen.getByLabelText("Reason for visit (optional)"), "Sore back");
    await fireEvent(screen.getByLabelText("Reason for visit (optional)"), "submitEditing");
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.parameters.slice(2, 4)).toEqual(["Jordan Test", "Sore back"]);
  });

  it("has a back arrow", async () => {
    await renderScreen(<NewPatient />);
    expect(screen.getByLabelText("Back")).toBeTruthy();
  });
});
