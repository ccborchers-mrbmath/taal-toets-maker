import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Resolve pdf-lib's ESM bundle to an absolute path so the alias doesn't recurse.
const pdfLibEsm = require.resolve("pdf-lib/dist/pdf-lib.esm.js");

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: [
        // pdf-lib's default CJS entry breaks under the Cloudflare Worker bundler
        // (`Cannot destructure property '__extends' of '__toESM(...).default'`).
        // The `dist/pdf-lib.esm.js` bundle inlines tslib and works in the Worker.
        // Use an exact-match regex + absolute path so nested imports don't re-alias.
        { find: /^pdf-lib$/, replacement: pdfLibEsm },
      ],
    },
  },
});
