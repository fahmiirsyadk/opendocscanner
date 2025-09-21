const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Ensure dist directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

// Copy static assets
const assetsToCopy = [
  'index.html',
  'styles.css',
  'src/assets/opencv/opencv.js',
  'src/assets/pdf-lib.min.js',
  'vendor/pdfjs/pdf.mjs',
  'vendor/pdfjs/pdf.worker.mjs',
  // Add YOLOv8 model if it exists
  'src/assets/YOLOv8-Segmentation.onnx'
];

// Copy worker files maintaining directory structure
const workersToCopy = [
  { src: 'src/Worker/processor.worker.js', dest: 'dist/src/Worker/processor.worker.js' }
];

assetsToCopy.forEach(asset => {
  const src = asset;
  const dest = path.join('dist', path.basename(asset));

  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${src} to ${dest}`);
  } else {
    console.warn(`Warning: ${src} not found, skipping...`);
  }
});

// Copy worker files maintaining directory structure
workersToCopy.forEach(({ src, dest }) => {
  if (fs.existsSync(src)) {
    // Ensure destination directory exists
    const destDir = path.dirname(dest);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`Copied worker ${src} to ${dest}`);
  } else {
    console.warn(`Warning: Worker ${src} not found, skipping...`);
  }
});

// Bundle the application
const isProduction = process.env.NODE_ENV === 'production';

esbuild.build({
  entryPoints: ['loader.js'],
  bundle: true,
  outfile: 'dist/bundle.js',
  format: 'esm',
  target: 'es2020',
  minify: isProduction,
  sourcemap: !isProduction,
  loader: {
    '.js': 'js',
    '.mjs': 'js'
  },
  external: [
    // External dependencies that should not be bundled
  ],
  resolveExtensions: ['.js', '.mjs'],
  conditions: ['module'],
  mainFields: ['module', 'main'],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
  }
}).then(() => {
  console.log('Build completed successfully!');
}).catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
