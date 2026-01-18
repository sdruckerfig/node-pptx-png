# node-pptx-png

High-fidelity PPTX to PNG converter for Node.js.

## Overview

`node-pptx-png` is a pure JavaScript/TypeScript library for converting PowerPoint (PPTX) presentations to high-quality PNG images. It uses native canvas rendering (via skia-canvas) for accurate slide reproduction without relying on LibreOffice, Puppeteer, or other external dependencies.

## Features

- **Pure Node.js** - No external dependencies like LibreOffice or headless browsers
- **High fidelity** - Skia-based rendering for accurate slide reproduction
- **TypeScript** - Full type definitions included
- **Configurable** - Control output size, format, and quality
- **Theme support** - Proper resolution of PowerPoint theme colors and fonts
- **Rich content support**:
  - Shapes with preset geometries (rectangles, chevrons, arrows, etc.)
  - Text with full styling (fonts, colors, bullets, alignment)
  - Images (embedded and linked)
  - Tables with cell formatting
  - Charts (bar, line, pie)
  - Backgrounds (solid, gradient, image)
  - Master/layout inheritance

## Installation

```bash
npm install node-pptx-png
```

### Prerequisites

This library uses `skia-canvas` for rendering. It should work out of the box on most systems, but you may need:

On macOS:
```bash
brew install pkg-config
```

On Ubuntu/Debian:
```bash
sudo apt-get install build-essential libfontconfig1-dev
```

## Usage

### Basic Usage

```typescript
import { PptxImageRenderer } from 'node-pptx-png';
import * as fs from 'fs';

const renderer = new PptxImageRenderer();

// Render all slides
const result = await renderer.renderPresentation('./presentation.pptx', {
  format: 'png',
  scale: 1.0
});

for (const slide of result.slides) {
  if (slide.imageData) {
    fs.writeFileSync(`slide-${slide.slideNumber}.png`, slide.imageData);
  }
}
```

### With Options

```typescript
import { PptxImageRenderer } from 'node-pptx-png';

const renderer = new PptxImageRenderer({ logLevel: 'info' });

const result = await renderer.renderPresentation('./presentation.pptx', {
  scale: 0.5,              // Scale factor (0.5 = half size)
  format: 'png',           // Output format
  slideNumbers: [1, 2, 3], // Optional: render only specific slides
});
```

### Rendering from Buffer

```typescript
import { PptxImageRenderer } from 'node-pptx-png';
import * as fs from 'fs';

const pptxBuffer = fs.readFileSync('./presentation.pptx');
const renderer = new PptxImageRenderer();
const result = await renderer.renderPresentation(pptxBuffer);
```

## API Reference

### `PptxImageRenderer`

Main class for rendering presentations.

#### Constructor

```typescript
new PptxImageRenderer(options?: { logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent' })
```

#### Methods

##### `renderPresentation(input, options?)`

Renders all slides (or specified slides) in a presentation.

- `input`: `Buffer | string` - File path or buffer containing PPTX data
- `options`: `RenderOptions` - Optional rendering options
- Returns: `Promise<PresentationRenderResult>`

##### `getSlideCount(input)`

Gets the number of slides in a presentation.

- `input`: `Buffer | string` - File path or buffer containing PPTX data
- Returns: `Promise<number>`

### `RenderOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scale` | `number` | `1.0` | Scale factor for output size |
| `format` | `'png'` | `'png'` | Output format |
| `slideNumbers` | `number[]` | all | Specific slides to render (1-based) |

### `SlideRenderResult`

| Property | Type | Description |
|----------|------|-------------|
| `slideIndex` | `number` | Zero-based slide index |
| `slideNumber` | `number` | One-based slide number |
| `imageData` | `Buffer` | Rendered image data |
| `width` | `number` | Image width in pixels |
| `height` | `number` | Image height in pixels |
| `success` | `boolean` | Whether rendering succeeded |
| `errorMessage` | `string?` | Error message if failed |

### `PresentationRenderResult`

| Property | Type | Description |
|----------|------|-------------|
| `slides` | `SlideRenderResult[]` | Results for each slide |
| `totalSlides` | `number` | Total number of slides |
| `successfulSlides` | `number` | Number of successfully rendered slides |
| `allSuccessful` | `boolean` | Whether all slides rendered successfully |

## Supported Features

### Shapes
- Rectangles, rounded rectangles
- Chevrons, arrows, pentagons
- Ellipses, circles
- Lines and connectors
- Custom geometries

### Text
- Font families and sizes
- Bold, italic, underline, strikethrough
- Text colors (solid and theme colors)
- Bullet points and numbered lists
- Paragraph alignment
- Line spacing
- Superscript/subscript

### Fills
- Solid colors
- Theme/scheme colors (accent1-6, dk1, lt1, etc.)
- Gradients (linear)
- Picture fills

### Tables
- Cell backgrounds
- Borders
- Merged cells
- Text formatting within cells

### Charts
- Bar/column charts
- Line charts
- Pie charts
- Chart titles and legends

### Other
- Background images
- Master slide inheritance
- Layout inheritance
- Placeholder resolution
- Shape effects (shadows)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Type check
npx tsc --noEmit

# Render a test presentation
npx ts-node scripts/render-pptx.ts ./test.pptx ./output
```

## License

MIT
