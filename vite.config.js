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
    // 'hidden' generates sourcemaps for Sentry / local debugging but omits the
    // //# sourceMappingURL comment, so browsers don't auto-fetch them on view.
    // The .map files still land in dist/ — upload them to Sentry with the CLI
    // (`sentry-cli sourcemaps upload ...`) and/or strip them from the deploy.
    sourcemap: 'hidden',
    target: 'es2020',
    rollupOptions: {
      input: {
        main: 'index.html',
      },
      output: {
        // Split the geo/map vendors into their own chunk so game-code edits
        // don't invalidate the ~150 KB of d3-geo + topojson-client + atlas
        // data. They rarely change; client caches get mileage out of this.
        manualChunks(id) {
          if (id.includes('node_modules/d3-geo')
            || id.includes('node_modules/d3-selection')
            || id.includes('node_modules/d3-array')
            || id.includes('node_modules/topojson-client')
            || id.includes('node_modules/world-atlas')) {
            return 'vendor-geo';
          }
          return undefined;
        },
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
