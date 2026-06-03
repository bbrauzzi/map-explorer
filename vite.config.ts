/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// In development we use a proxy to the Copernicus Data Space STAC API to avoid
// possible CORS issues. Requests to "/stac/*" are forwarded to
// https://stac.dataspace.copernicus.eu/* (see src/config.ts).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
  server: {
    proxy: {
      '/stac': {
        target: 'https://stac.dataspace.copernicus.eu',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/stac/, ''),
      },
      // Quicklook thumbnails (datahub.creodias.eu -> 301 -> zipper.creodias.eu).
      // followRedirects lets the proxy stream the final image bytes from the same
      // origin, so the WebGL map texture needs no cross-origin CORS in dev.
      '/thumb': {
        target: 'https://datahub.creodias.eu',
        changeOrigin: true,
        secure: true,
        followRedirects: true,
        rewrite: (path) => path.replace(/^\/thumb/, ''),
      },
    },
  },
})
