# OpenDocScanner

A PureScript-based Single Page Application (SPA) for document scanning and image manipulation using Halogen and HTML5 Canvas.

## Features

- **Document Scanner**: Upload images and detect document boundaries
- **Image Processing**: Apply filters and transformations to images
- **Canvas-based Rendering**: Real-time image manipulation using HTML5 Canvas
- **Responsive Design**: Mobile-friendly interface
- **PureScript & Halogen**: Type-safe functional reactive programming

## Project Structure

```
src/
├── Main.purs              # Application entry point
├── DocumentScanner.purs    # Main document scanning component
└── CanvasUtils.purs       # Canvas manipulation utilities

index.html                 # HTML entry point with embedded CSS
```

## Dependencies

This project uses the following PureScript packages:

- `halogen` - Web framework for building reactive UIs
- `web-canvas` - HTML5 Canvas API bindings
- `web-dom` - DOM manipulation
- `web-events` - Event handling
- `web-file` - File API bindings
- `web-html` - HTML manipulation

## Getting Started

### Prerequisites

- PureScript compiler (`purs`)
- Spago package manager
- Node.js and npm (for building and bundling)

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   spago install
   ```

2. **Development build**:
   ```bash
   npm run build
   ```

3. **Production build**:
   ```bash
   npm run build:prod
   ```

4. **Serve locally**:
   ```bash
   npm run serve
   ```
   Then open `http://localhost:8080` in your browser.

### Development

For development with auto-rebuilding:

```bash
npm run dev
```

This will watch for PureScript file changes and rebuild automatically.

### Deployment to Vercel

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. **Deploy to Vercel**:
   ```bash
   vercel --prod
   ```

   Or push to your git repository and connect it to Vercel for automatic deployments.

### Available Scripts

- `npm run build` - Build for development (with source maps)
- `npm run build:prod` - Build for production (minified)
- `npm run bundle` - Bundle JavaScript files only
- `npm run minify` - Minify the bundle
- `npm run dev` - Development mode with file watching
- `npm run clean` - Clean build artifacts
- `npm run serve` - Start local development server

## Usage

1. **Upload an Image**: Click the file input or drag and drop an image
2. **Process Document**: Click "Process Document" to apply basic processing
3. **View Results**: See the processed image on the canvas

## Architecture

### Components

- **Main**: Root component that manages the application layout
- **DocumentScanner**: Handles file upload and image processing
- **CanvasUtils**: Utility functions for canvas manipulation

### Image Processing

The application includes basic image processing capabilities:

- Grayscale conversion
- Edge detection (simplified)
- Auto-cropping
- Rectangle drawing utilities

## Browser Support

This application requires modern browsers with support for:

- HTML5 Canvas
- File API
- ES6 Modules
- CSS Grid and Flexbox

## Future Enhancements

Potential features to add:

- YOLOv8 integration for document boundary detection
- PDF rendering and processing
- Advanced image filters (brightness, contrast, etc.)
- Batch processing
- Export functionality
- Mobile camera integration

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is open source and available under the MIT License.
