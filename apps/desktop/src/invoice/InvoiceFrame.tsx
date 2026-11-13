import { useState } from "react";

/**
 * Shows invoice HTML from @kineo/invoice-template in a frame, grown to fit the
 * invoice so the page scrolls rather than the frame.
 */
export function InvoiceFrame({ html, title }: { html: string; title: string }) {
  const [height, setHeight] = useState(800);

  return (
    <iframe
      title={title}
      srcDoc={html}
      onLoad={(event) => {
        // The body, not the whole document: the document is at least as tall as the frame.
        const body = event.currentTarget.contentDocument?.body;
        if (body) setHeight(Math.ceil(body.getBoundingClientRect().height));
      }}
      style={{ height }}
      className="w-full rounded-2xl border-0 bg-white shadow-surface"
    />
  );
}
