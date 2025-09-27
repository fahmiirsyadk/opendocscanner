const { build } = require('vite');

async function run() {
  try {
    await build();
    console.log('Vite build completed successfully.');
  } catch (error) {
    console.error('Vite build failed:', error);
    process.exit(1);
  }
}

run();
