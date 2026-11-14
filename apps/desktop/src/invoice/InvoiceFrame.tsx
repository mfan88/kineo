import { useEffect, useRef, useState } from "react";

/** A letter page at 96 dpi. */
const PAGE_WIDTH = 816;

/**
 * Shows invoice HTML from @kineo/invoice-template as a fixed-width page, scaled
 * down to fit its container, so the page scrolls rather than the frame.
 */
export function InvoiceFrame({ html, title }: { html: string; title: string }) {
  const [height, setHeight] = useState(800);
  const [scale, setScale] = useState(1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof ResizeObserver === "undefined") return undefined;
    const update = () => setScale(Math.min(1, wrapper.clientWidth / PAGE_WIDTH));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={wrapperRef}
      data-testid="invoice-frame"
      style={{ height: height * scale }}
      className="w-full overflow-hidden rounded-2xl bg-white shadow-surface"
    >
      <iframe
        title={title}
        srcDoc={html}
        onLoad={(event) => {
          // The body, not the whole document: the document is at least as tall as the frame.
          const body = event.currentTarget.contentDocument?.body;
          if (body) setHeight(Math.ceil(body.getBoundingClientRect().height));
        }}
        style={{
          width: PAGE_WIDTH,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
        className="block border-0 bg-white"
      />
    </div>
  );
}
