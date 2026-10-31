import { fileURLToPath } from "node:url";
export default {
  poweredByHeader: false,
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
};
