import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

// Bundle analyzer loads only when ANALYZE=1 so a plain `bun run build` stays
// fast. Run `bun run build:analyze` → produces dist/bundle-report.html.
const analyze = process.env.ANALYZE === '1';

// Release tag for Sentry. Prefer an explicit VITE_RELEASE; on Vercel, fall
// back to the auto-injected git SHA so deploys are tagged without any
// project-settings juggling.
const release = process.env.VITE_RELEASE
  || process.env.VERCEL_GIT_COMMIT_SHA
  || '';

export default defineConfig({
  root: '.',
  base: './',
  publicDir: 'public',
  define: {
    'import.meta.env.VITE_RELEASE': JSON.stringify(release),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
    rollupOptions: {
      input: {
        main: 'index.html',
      },
      plugins: analyze
        ? [
            visualizer({
              filename: 'dist/bundle-report.html',
              template: 'treemap',
              gzipSize: true,
              brotliSize: true,
              open: false,
            }),
          ]
        : [],
    },
  },
  server: {
    port: 5173,
    open: false,
  },
});
