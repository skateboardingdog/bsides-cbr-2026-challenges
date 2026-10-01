import { defineConfig } from "vite";

export default defineConfig({
  define: { __EDITOR_ENABLED__: false },
  build: { minify: true, sourcemap: false },
});
