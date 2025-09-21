// Import the main function from the compiled PureScript output.
import { main } from './output/Main/index.js';

// Run the main function to start the Halogen application.
// This runs after the DOM is parsed because module scripts are deferred by default.
main();