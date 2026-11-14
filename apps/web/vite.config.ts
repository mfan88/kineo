import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { downloadCardsHtml } from "./src/site/downloads-html.ts";
import { contactLink } from "./src/site/layout.ts";
import { legalPage } from "./src/site/legal.ts";
import { kineoPages } from "./src/site/plugin.ts";

// Static multi-page site: each page file is wrapped in the shared layout by
// kineoPages and built to plain HTML in dist/.
const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  appType: "mpa",
  plugins: [
    kineoPages({
      downloads: () => downloadCardsHtml(),
      contact: () => contactLink(),
      "legal-privacy": () => legalPage("privacy"),
      "legal-terms": () => legalPage("terms"),
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: resolve(root, "index.html"),
        download: resolve(root, "download/index.html"),
        privacy: resolve(root, "privacy/index.html"),
        terms: resolve(root, "terms/index.html"),
        signedIn: resolve(root, "signed-in/index.html"),
        notFound: resolve(root, "404.html"),
      },
    },
  },
});
