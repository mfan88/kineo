import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceFrame } from "./InvoiceFrame";

describe("InvoiceFrame", () => {
  it("renders a wrapper around a letter-width frame", () => {
    const { getByTestId, getByTitle } = render(<InvoiceFrame html="<p>Hi</p>" title="Invoice 1" />);
    expect(getByTestId("invoice-frame")).toBeTruthy();
    expect(getByTitle("Invoice 1").style.width).toBe("816px");
  });
});

describe("InvoiceFrame scaling", () => {
  const disconnect = vi.fn<() => void>();
  let width = 0;

  beforeEach(() => {
    disconnect.mockClear();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect = disconnect;
      },
    );
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("scales the frame to a narrower container and shrinks the wrapper height", () => {
    width = 408;
    const { getByTestId, getByTitle } = render(<InvoiceFrame html="<p>Hi</p>" title="Invoice 1" />);
    expect(getByTitle("Invoice 1").style.transform).toBe("scale(0.5)");
    expect(getByTestId("invoice-frame").style.height).toBe("400px");
  });

  it("never scales up", () => {
    width = 1200;
    const { getByTitle } = render(<InvoiceFrame html="<p>Hi</p>" title="Invoice 1" />);
    expect(getByTitle("Invoice 1").style.transform).toBe("scale(1)");
  });

  it("disconnects the observer on unmount", () => {
    width = 408;
    const { unmount } = render(<InvoiceFrame html="<p>Hi</p>" title="Invoice 1" />);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
