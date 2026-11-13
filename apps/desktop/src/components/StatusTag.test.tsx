import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusTag } from "./StatusTag";

describe("StatusTag", () => {
  it.each([
    ["uninvoiced", "Not invoiced", "not-invoiced"],
    ["draft", "Draft", "draft"],
    ["sent", "Waiting on payment", "sent"],
    ["paid", "Paid", "paid"],
    ["error", "Error", "error"],
  ] as const)("shows %s as %s with its theme colours and an icon", (status, label, css) => {
    render(<StatusTag status={status} />);
    const tag = screen.getByText(label);
    expect(tag.style.color).toBe(`var(--tag-${css}-fg)`);
    expect(tag.style.backgroundColor).toBe(`var(--tag-${css}-bg)`);
    const icon = tag.querySelector("svg");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.querySelector("path, circle")).not.toBeNull();
  });
});
