import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { MAX_HEADING_SCALE, MAX_TEXT_SCALE, Text } from "./text";

describe("Text", () => {
  it("lets body text grow up to twice its size with larger text settings", async () => {
    await render(<Text>Recent patients</Text>);
    expect(screen.getByText("Recent patients").props.maxFontSizeMultiplier).toBe(MAX_TEXT_SCALE);
  });

  it("lets headings grow by half, as they start large", async () => {
    await render(<Text accessibilityRole="header">Who are you seeing?</Text>);
    const heading = screen.getByRole("header", { name: "Who are you seeing?" });
    expect(heading.props.maxFontSizeMultiplier).toBe(MAX_HEADING_SCALE);
  });

  it("keeps a cap a screen sets itself", async () => {
    await render(<Text maxFontSizeMultiplier={1.2}>Total</Text>);
    expect(screen.getByText("Total").props.maxFontSizeMultiplier).toBe(1.2);
  });
});
