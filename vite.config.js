import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  publicDir: false,
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'public/pdf-lib.min.js', dest: '' },
        { src: 'vendor/pdfjs/*.mjs', dest: '' },
        { src: 'src/assets/opencv/opencv.js', dest: '' },
        { src: 'src/Worker/*.js', dest: 'src/Worker' }
      ]
    })
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html'
    }
  },
  server: {
    port: 5173
  }
});

