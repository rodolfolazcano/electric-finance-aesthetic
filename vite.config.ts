// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const enVercel = process.env.VERCEL === "1";

export default defineConfig({
  nitro: enVercel ? { preset: "vercel" } : undefined,
  vite: {
    server: {
      port: 5199,
      strictPort: true,
      host: true,
    },
    define: {
      // Polyfill para `process` en cliente: server code usa `process.env`/`process.cwd()` y se cuela al bundle cliente
      // via studio.functions → studio.server. En server usa el real, en cliente fallback vacío pero definido.
      process: "globalThis.process ?? { env: {}, cwd: () => '/', platform: 'browser', version: '', nextTick: (cb) => setTimeout(cb, 0) }",
      "process.env": "(globalThis.process?.env ?? {})",
      "process.cwd": "((globalThis.process ?? { cwd: () => '/' }).cwd)",
      "process.platform": "((globalThis.process ?? { platform: 'browser' }).platform)",
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
