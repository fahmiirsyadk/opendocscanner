const { execSync } = require('child_process');
const { build } = require('vite');

async function run() {
  try {
    console.log('Running PureScript compile...');
    execSync('npx spago build', { stdio: 'inherit' });
    console.log('PureScript compile completed.');

    await build();
    console.log('Vite build completed successfully.');
  } catch (error) {
    console.error('Build step failed:', error);
    process.exit(1);
  }
}

run();
