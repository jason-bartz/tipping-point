import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

// Bundle analyzer loads only when ANALYZE=1 so a plain `bun run build` stays
// fast. Run `bun run build:analyze` → produces dist/bundle-report.html.
const analyze = process.env.ANALYZE === '1';

export default defineConfig({
  root: '.',
  base: './',
  publicDir: 'public',
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
