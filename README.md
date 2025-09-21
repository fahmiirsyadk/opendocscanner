# PureScanner

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
- Node.js and npm (for building)

### Installation

1. **Install dependencies**:
   ```bash
   spago install
   ```

2. **Build the project**:
   ```bash
   spago build
   ```

3. **Open the application**:
   Open `index.html` in your web browser.

### Development

For development with auto-rebuilding:

```bash
# Terminal 1: Build and watch for changes
spago build --watch

# Terminal 2: Serve files (optional)
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

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
