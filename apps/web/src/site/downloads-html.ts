import { downloads, isRealLink, type Download } from "../data/downloads.ts";
import { escapeHtml } from "./html.ts";

const TAGS: Record<Download["status"], string> = {
  available: "",
  beta: "Beta",
  "coming-soon": "Coming soon",
};

/** One card per platform: a download button when there's a real link, otherwise a calm tag. */
export function downloadCardsHtml(list: readonly Download[] = downloads): string {
  const cards = list.map((download) => {
    const name = escapeHtml(download.name);
    const linked = download.status !== "coming-soon" && isRealLink(download.link);
    const tag = TAGS[download.status];
    const action = linked
      ? `<a class="button" href="${escapeHtml(download.link)}">Get Kineō for ${name}</a>`
      : `<span class="tag">${TAGS["coming-soon"]}</span>`;
    return `<li class="card download">
  <h2 class="download__name">${name}${linked && tag ? ` <span class="tag">${tag}</span>` : ""}</h2>
  <p class="download__requirement muted">${escapeHtml(download.requirement)}</p>
  ${action}
</li>`;
  });
  return `<ul class="downloads">\n${cards.join("\n")}\n</ul>`;
}
