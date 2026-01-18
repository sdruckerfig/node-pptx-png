# pptimg

High-fidelity PPTX to image converter for Node.js.

## Overview

`pptimg` is a pure JavaScript/TypeScript library for converting PowerPoint (PPTX) presentations to high-quality images. It uses native canvas rendering (via node-canvas with Cairo) for accurate slide reproduction without relying on LibreOffice, Puppeteer, or other external dependencies.

## Features

- **Pure Node.js** - No external dependencies like LibreOffice or headless browsers
- **High fidelity** - Cairo-based rendering for accurate slide reproduction
- **TypeScript** - Full type definitions included
- **Configurable** - Control output size, format, and quality
- **Theme support** - Proper resolution of PowerPoint theme colors and fonts

## Installation

```bash
npm install pptimg
```

### Prerequisites

node-canvas requires some native dependencies. On macOS:

```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

On Ubuntu/Debian:

```bash
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

## Usage

### Basic Usage

```typescript
import { renderPresentation, renderSlide } from 'pptimg';

// Render all slides
const result = await renderPresentation('./presentation.pptx');

for (const slide of result.slides) {
  if (slide.success) {
    // slide.imageData is a Buffer containing PNG image data
    await fs.writeFile(`slide-${slide.slideNumber}.png`, slide.imageData);
  }
}

// Render a single slide
const slideResult = await renderSlide('./presentation.pptx', 0); // First slide
```

### With Options

```typescript
import { PptxImageRenderer } from 'pptimg';

const renderer = new PptxImageRenderer({ logLevel: 'debug' });

const result = await renderer.renderPresentation('./presentation.pptx', {
  width: 1920,           // Target width in pixels (default: 1920)
  format: 'png',         // 'png' or 'jpeg'
  jpegQuality: 90,       // JPEG quality 1-100 (default: 90)
  backgroundColor: '#FFFFFF', // Override background color
});
```

### Rendering from Buffer

```typescript
import { renderPresentation } from 'pptimg';
import * as fs from 'fs/promises';

const pptxBuffer = await fs.readFile('./presentation.pptx');
const result = await renderPresentation(pptxBuffer);
```

### Getting Slide Information

```typescript
import { PptxImageRenderer } from 'pptimg';

const renderer = new PptxImageRenderer();

const slideCount = await renderer.getSlideCount('./presentation.pptx');
const dimensions = await renderer.getSlideDimensions('./presentation.pptx');

console.log(`Presentation has ${slideCount} slides`);
console.log(`Slide size: ${dimensions.width} x ${dimensions.height} EMU`);
```

## API Reference

### `renderPresentation(input, options?)`

Renders all slides in a presentation.

- `input`: `Buffer | string` - File path or buffer containing PPTX data
- `options`: `PptxRenderOptions` - Optional rendering options
- Returns: `Promise<PresentationRenderResult>`

### `renderSlide(input, slideIndex, options?)`

Renders a single slide.

- `input`: `Buffer | string` - File path or buffer containing PPTX data
- `slideIndex`: `number` - Zero-based slide index
- `options`: `PptxRenderOptions` - Optional rendering options
- Returns: `Promise<SlideRenderResult>`

### `PptxRenderOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `width` | `number` | `1920` | Target width in pixels |
| `height` | `number` | auto | Target height (auto-calculated from aspect ratio) |
| `format` | `'png' \| 'jpeg'` | `'png'` | Output format |
| `jpegQuality` | `number` | `90` | JPEG quality (1-100) |
| `backgroundColor` | `string` | - | Override background color (hex) |
| `logLevel` | `'debug' \| 'info' \| 'warn' \| 'error' \| 'silent'` | `'warn'` | Logging level |
| `debugMode` | `boolean` | `false` | Enable debug rendering |

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

## Implementation Status

### Phase 1 (Current) - Core Infrastructure
- [x] Project setup (TypeScript, ESLint, Prettier)
- [x] Type definitions
- [x] PPTX parsing (ZIP extraction, XML parsing)
- [x] Unit conversion (EMU to pixels)
- [x] Theme resolution (colors, fonts)
- [x] Background rendering (solid, gradient)

### Phase 2 - Shape Rendering
- [ ] Preset geometry calculator (20+ common shapes)
- [ ] Fill renderer (solid, gradient)
- [ ] Stroke renderer
- [ ] Shape renderer integration

### Phase 3 - Text Rendering
- [ ] Text layout engine
- [ ] Word wrapping
- [ ] Font resolution
- [ ] Text renderer

### Phase 4 - Images and Media
- [ ] Relationship parser
- [ ] Image renderer
- [ ] Picture fills

### Phase 5 - Advanced Features
- [ ] All preset geometries (100+)
- [ ] Custom geometry parser
- [ ] Group shapes
- [ ] Placeholder resolution
- [ ] Charts

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

# Lint
npm run lint

# Format
npm run format
```

## License

MIT
