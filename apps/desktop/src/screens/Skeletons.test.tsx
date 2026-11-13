import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { FormSkeleton, HomeSkeleton, InvoicesSkeleton, PatientSkeleton } from "./Skeletons";

function renderAt(path: string, element: React.ReactNode) {
  const router = createMemoryRouter([{ path, element }], { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

describe("screen skeletons", () => {
  it("Home keeps its heading and settings icon, with blocks only once shown", () => {
    const { rerender } = renderAt("/", <HomeSkeleton showBlocks={false} />);
    expect(screen.getByRole("heading", { name: "Who are you seeing?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(screen.getByLabelText("Loading Home").getAttribute("aria-busy")).toBe("true");
    expect(document.querySelector(".skeleton")).toBeNull();
    rerender(
      <RouterProvider
        router={createMemoryRouter([{ path: "/", element: <HomeSkeleton showBlocks /> }])}
      />,
    );
    expect(document.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("hides the blocks from screen readers behind one busy label", () => {
    renderAt("/x", <InvoicesSkeleton showBlocks />);
    expect(screen.getByRole("heading", { name: "Invoices" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    const busy = screen.getByLabelText("Loading invoices");
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.querySelector("[aria-hidden='true'] .skeleton")).not.toBeNull();
  });

  it("Patient has a back arrow and no heading text before the name is known", () => {
    renderAt("/x", <PatientSkeleton showBlocks />);
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByLabelText("Loading patient")).toBeTruthy();
  });

  it("other screens keep their own heading", () => {
    renderAt("/x", <FormSkeleton title="Your profile" showBlocks />);
    expect(screen.getByRole("heading", { name: "Your profile" })).toBeTruthy();
    expect(screen.getByLabelText("Loading your profile")).toBeTruthy();
  });
});
