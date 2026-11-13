import { describe, expect, it } from "@jest/globals";
import { statusTags } from "@kineo/tokens";
import { render, screen } from "@testing-library/react-native";
import { StatusTag } from "./status-tag";

describe("StatusTag", () => {
  it.each([
    ["uninvoiced", "notInvoiced"],
    ["draft", "draft"],
    ["sent", "sent"],
    ["paid", "paid"],
    ["cancelled", "cancelled"],
    ["error", "error"],
  ] as const)("shows %s with its word, colours and an icon", async (status, key) => {
    await render(<StatusTag status={status} />);
    const tag = screen.getByTestId(`status-tag-${key}`);
    expect(tag.props.accessibilityLabel).toBe(statusTags[key].label);
    expect(screen.getByText(statusTags[key].label)).toHaveStyle({ color: statusTags[key].text });
    expect(tag).toHaveStyle({ backgroundColor: statusTags[key].background });
  });
});
