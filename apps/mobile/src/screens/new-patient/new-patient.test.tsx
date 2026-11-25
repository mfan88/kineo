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
// Custom details get their IDs here; Expo's own mock returns nothing.
jest.mock("expo-crypto", () => {
  let n = 0;
  return {
    randomUUID: () => `11111111-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  };
});

// jest.mock is hoisted above mockRouter, so look it up when the screen uses it.
jest.mock("expo-router", () => ({
  get router() {
    return mockRouter;
  },
  useIsFocused: () => true,
}));

/** Fills in the email and phone every new patient needs (made-up values). */
async function fillContact({ parent = false } = {}) {
  await fireEvent.changeText(
    screen.getByLabelText(parent ? "Parent email" : "Email"),
    "jordan@example.com",
  );
  await fireEvent.changeText(
    screen.getByLabelText(parent ? "Parent phone" : "Phone"),
    "604-555-0100",
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("New patient", () => {
  it("saves the patient, says so and opens them once they're in the database", async () => {
    const { writes, setRows } = await renderScreen(<NewPatient />);
    await fireEvent.changeText(screen.getByLabelText("Full name"), "Jordan Test");
    await fireEvent.changeText(screen.getByLabelText("Reason for visit (optional)"), " Sore back ");
    await fillContact();
    await fireEvent.press(screen.getByText("Add patient"));

    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toContain("INSERT INTO patients");
    expect(writes[0]?.parameters.slice(0, 4)).toEqual([
      NEW_ID,
      TEST_OWNER,
      "Jordan Test",
      "Sore back",
    ]);
    // is_child, parent_names, parent_names_on_invoice, email, email_on_invoice, phone, …
    expect(writes[0]?.parameters.slice(4, 12)).toEqual([
      0,
      "[]",
      0,
      "jordan@example.com",
      0,
      "604-555-0100",
      0,
      "[]",
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
    await fillContact();
    await fireEvent.press(screen.getByText("Add patient"));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.parameters[3]).toBeNull();
  });

  it("asks for the name when it's empty, and saves nothing", async () => {
    const { writes } = await renderScreen(<NewPatient />);
    await fireEvent.changeText(screen.getByLabelText("Full name"), "   ");
    await fireEvent.press(screen.getByText("Add patient"));
    expect(await screen.findByText("Add the patient's name.")).toBeTruthy();
    expect(writes).toEqual([]);
    expect(mockRouter.replace).not.toHaveBeenCalled();

    // The message goes once the name is being typed.
    await fireEvent.changeText(screen.getByLabelText("Full name"), "J");
    await waitFor(() => expect(screen.queryByText("Add the patient's name.")).toBeNull());
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

    await fillContact();
    await fireEvent.changeText(screen.getByLabelText("Reason for visit (optional)"), "Sore back");
    await fireEvent(screen.getByLabelText("Reason for visit (optional)"), "submitEditing");
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.parameters.slice(2, 4)).toEqual(["Jordan Test", "Sore back"]);
  });

  it("says which detail needs a label, under that detail", async () => {
    await renderScreen(<NewPatient />);
    await fireEvent.changeText(screen.getByLabelText("Full name"), "Jordan Test");
    await fillContact();
    await fireEvent.press(screen.getByText("Add detail"));
    await fireEvent.press(screen.getByText("Add detail"));
    await fireEvent.changeText(screen.getByLabelText("Label for detail 1"), "Referring doctor");
    await fireEvent.changeText(screen.getByLabelText("Value for detail 1"), "Dr. Test");
    await fireEvent.changeText(screen.getByLabelText("Label for detail 2"), " referring doctor ");
    await fireEvent.changeText(screen.getByLabelText("Value for detail 2"), "Dr. Other");
    await fireEvent.press(screen.getByText("Add patient"));
    expect(screen.getAllByText("Each detail needs its own label.")).toHaveLength(1);
  });

  it("needs an email and phone, says so under each, and clears each as it's typed", async () => {
    const { writes } = await renderScreen(<NewPatient />);
    await fireEvent.changeText(screen.getByLabelText("Full name"), "Jordan Test");
    await fireEvent.press(screen.getByText("Add patient"));
    expect(screen.getByText("Add an email so you can reach this patient.")).toBeTruthy();
    expect(screen.getByText("Add a phone number so you can reach this patient.")).toBeTruthy();
    expect(writes).toEqual([]);

    await fireEvent.changeText(screen.getByLabelText("Email"), "not-an-email");
    expect(screen.queryByText("Add an email so you can reach this patient.")).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Phone"), "604-555-0100");
    await fireEvent.press(screen.getByText("Add patient"));
    expect(screen.getByText("Enter an email like name@example.com.")).toBeTruthy();
    expect(writes).toEqual([]);
  });

  it("uses the email and phone keyboards", async () => {
    await renderScreen(<NewPatient />);
    expect(screen.getByLabelText("Email").props).toMatchObject({
      keyboardType: "email-address",
      autoCapitalize: "none",
    });
    expect(screen.getByLabelText("Phone").props.keyboardType).toBe("phone-pad");
  });

  it("asks for a child's parents, adds and removes them, and saves the shown ones", async () => {
    const { writes } = await renderScreen(<NewPatient />);
    await fireEvent.changeText(screen.getByLabelText("Full name"), "Jordan Test");
    expect(screen.queryByLabelText("Parent name")).toBeNull();
    await fireEvent.press(screen.getByRole("switch", { name: "Patient is a child" }));
    expect(screen.getByLabelText("Parent name")).toBeTruthy();
    expect(screen.queryByLabelText("Remove parent")).toBeNull();
    await fillContact({ parent: true });
    await fireEvent.press(screen.getByText("Add patient"));
    expect(screen.getByText("Add a parent's name.")).toBeTruthy();
    expect(writes).toEqual([]);

    await fireEvent.changeText(screen.getByLabelText("Parent name"), "Robin Test");
    await fireEvent.press(screen.getByText("Add parent"));
    await fireEvent.changeText(screen.getByLabelText("Parent name 2"), "Ash Test");
    await fireEvent.press(screen.getByText("Add parent"));
    expect(screen.getAllByLabelText("Remove parent")).toHaveLength(3);
    await fireEvent.press(screen.getAllByLabelText("Remove parent")[2]!);
    await fireEvent.press(screen.getByText("Add parent"));
    await fireEvent.press(screen.getByText("Add parent"));
    // Four at most.
    expect(screen.queryByText("Add parent")).toBeNull();
    await fireEvent.press(screen.getByRole("switch", { name: "Show parent names on invoice" }));
    await fireEvent.press(screen.getByText("Add patient"));

    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.parameters.slice(4, 7)).toEqual([1, '["Robin Test","Ash Test"]', 1]);
  });

  it("drops the parents when the child switch is turned off again", async () => {
    const { writes } = await renderScreen(<NewPatient />);
    await fireEvent.changeText(screen.getByLabelText("Full name"), "Jordan Test");
    await fireEvent.press(screen.getByRole("switch", { name: "Patient is a child" }));
    await fireEvent.changeText(screen.getByLabelText("Parent name"), "Robin Test");
    await fireEvent.press(screen.getByRole("switch", { name: "Patient is a child" }));
    expect(screen.queryByLabelText("Parent name")).toBeNull();
    await fillContact();
    await fireEvent.press(screen.getByText("Add patient"));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.parameters.slice(4, 6)).toEqual([0, "[]"]);
  });

  it("adds and removes custom details, each needing a label and value", async () => {
    const { writes } = await renderScreen(<NewPatient />);
    await fireEvent.changeText(screen.getByLabelText("Full name"), "Jordan Test");
    await fillContact();
    await fireEvent.press(screen.getByText("Add detail"));
    await fireEvent.press(screen.getByText("Add detail"));
    await fireEvent.changeText(screen.getByLabelText("Label for detail 1"), "Referring doctor");
    await fireEvent.press(screen.getByText("Add patient"));
    expect(screen.getByText("Give each detail a label and a value.")).toBeTruthy();
    expect(writes).toEqual([]);

    await fireEvent.press(screen.getByLabelText("Remove detail 2"));
    expect(screen.queryByLabelText("Label for detail 2")).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Value for detail 1"), "Dr. Test");
    await fireEvent.press(screen.getByRole("switch", { name: "Show detail 1 on invoice" }));
    await fireEvent.press(screen.getByRole("switch", { name: "Show email on invoice" }));
    await fireEvent.press(screen.getByText("Add patient"));

    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.parameters[8]).toBe(1);
    const details = JSON.parse(String(writes[0]?.parameters[11])) as unknown;
    expect(details).toEqual([
      expect.objectContaining({
        label: "Referring doctor",
        value: "Dr. Test",
        show_on_invoice: true,
      }),
    ]);
  });

  it("has a back arrow", async () => {
    await renderScreen(<NewPatient />);
    expect(screen.getByLabelText("Back")).toBeTruthy();
  });
});
