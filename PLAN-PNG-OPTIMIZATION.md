# Plan: Optimized PNG Output for node-pptx-png

## Problem Statement
The current implementation uses `canvas.toBuffer('png')` without any optimization options, resulting in larger file sizes than necessary. We need to implement PNG optimization to reduce file sizes while maintaining visual quality.

## Research Summary

### Current State
- `SlideRenderer.ts:290` exports PNG via `canvas.toBuffer('png')` with no options
- skia-canvas's native PNG export has limited optimization options (no compression level control)
- skia-canvas v3.0.8+ provides `toSharp()` method for integration with Sharp library

### Key Requirement
**Must upgrade skia-canvas from ^1.0.0 to >=3.0.8** to access the `toSharp()` method.

## Recommended Strategy: Sharp Integration

### Why Sharp?
- skia-canvas has built-in `toSharp()` method (v3.0.8+) for seamless integration
- Sharp is the fastest Node.js image processing library
- No external command-line tools required
- Comprehensive PNG optimization options

### Sharp PNG Options (Actual API)
Based on Sharp's actual API documentation:

```typescript
interface SharpPngOptions {
  compressionLevel?: number;      // 0-9, default 6
  adaptiveFiltering?: boolean;    // default false
  palette?: boolean;              // default false
  colors?: number;                // 2-256, default 256 (NOT paletteColors)
  quality?: number;               // 1-100, only with palette mode
  dither?: number;                // 0.0-1.0, Floyd-Steinberg dithering
  progressive?: boolean;          // Adam7 interlacing
}
```

**Note**: Sharp PNG does NOT have an `effort` option - that's only for WebP/AVIF.

## Implementation Plan

### Phase 1: Update Dependencies

1. Upgrade skia-canvas to `>=3.0.8` for `toSharp()` support
2. Add Sharp as optional peer dependency
3. Add @types/sharp as dev dependency

### Phase 2: Create PngOptimizer Utility

Create `src/utils/PngOptimizer.ts`:

```typescript
import type { Canvas } from 'skia-canvas';

export type PngOptimizationPreset = 'none' | 'fast' | 'balanced' | 'maximum' | 'web';

export interface PngOptimizationOptions {
  /** PNG compression level (0-9). 0=fastest, 9=smallest. Default: 6 */
  compressionLevel?: number;
  /** Use adaptive row filtering. Default: true */
  adaptiveFiltering?: boolean;
  /** Convert to indexed/palette PNG. Default: false */
  palette?: boolean;
  /** Max colors for palette mode (2-256). Default: 256 */
  colors?: number;
  /** Quality for palette quantization (1-100). Default: 90 */
  quality?: number;
  /** Floyd-Steinberg dithering (0.0-1.0). Default: 1.0 */
  dither?: number;
  /** Strip metadata. Default: true */
  stripMetadata?: boolean;
}

const PNG_PRESETS: Record<PngOptimizationPreset, PngOptimizationOptions> = {
  none: {},
  fast: { compressionLevel: 4, adaptiveFiltering: false },
  balanced: { compressionLevel: 6, adaptiveFiltering: true },
  maximum: { compressionLevel: 9, adaptiveFiltering: true },
  web: {
    compressionLevel: 9,
    adaptiveFiltering: true,
    palette: true,
    colors: 256,
    quality: 85,
    dither: 1.0
  }
};
```

### Phase 3: Handle Edge Cases

#### Palette Mode Fallback
Complex slides with gradients/photos will exceed 256 colors. Implement automatic fallback:

```typescript
async optimize(canvas: Canvas, options: PngOptimizationOptions): Promise<Buffer> {
  if (!this.sharp) {
    return canvas.toBuffer('png');
  }

  const sharpInstance = canvas.toSharp();

  if (options.palette) {
    try {
      return await sharpInstance.png({
        palette: true,
        colors: options.colors ?? 256,
        quality: options.quality ?? 90,
        dither: options.dither ?? 1.0,
        compressionLevel: options.compressionLevel ?? 9,
      }).toBuffer();
    } catch {
      // Fallback to non-palette compression for color-rich images
      return await sharpInstance.png({
        compressionLevel: options.compressionLevel ?? 9,
        adaptiveFiltering: options.adaptiveFiltering ?? true,
      }).toBuffer();
    }
  }

  return await sharpInstance.png({
    compressionLevel: options.compressionLevel ?? 6,
    adaptiveFiltering: options.adaptiveFiltering ?? true,
  }).toBuffer();
}
```

#### Alpha Channel Handling
Palette mode has limited alpha support. Document this limitation and consider auto-detecting transparency.

### Phase 4: Update Options Interface

Add to `src/types/options.ts`:

```typescript
export type PngOptimizationPreset = 'none' | 'fast' | 'balanced' | 'maximum' | 'web';

export interface PngOptimizationOptions {
  compressionLevel?: number;
  adaptiveFiltering?: boolean;
  palette?: boolean;
  colors?: number;
  quality?: number;
  dither?: number;
  stripMetadata?: boolean;
}

// In PptxRenderOptions:
pngOptimization?: PngOptimizationPreset | PngOptimizationOptions;
```

### Phase 5: Update SlideRenderer

Modify `exportCanvas()` in `src/rendering/SlideRenderer.ts`:

```typescript
private async exportCanvas(canvas: Canvas): Promise<Buffer> {
  if (this.options.format === 'jpeg') {
    return canvas.toBuffer('jpeg', { quality: this.options.jpegQuality / 100 });
  }

  // Use PNG optimization if configured
  if (this.pngOptimizer && this.options.pngOptimization !== 'none') {
    return this.pngOptimizer.optimize(canvas, this.options.pngOptimization);
  }

  return canvas.toBuffer('png');
}
```

## File Changes Required

| File | Change |
|------|--------|
| `package.json` | Upgrade skia-canvas, add Sharp as optional peer dep |
| `src/utils/PngOptimizer.ts` | New file - optimization logic |
| `src/types/options.ts` | Add PNG optimization options |
| `src/rendering/SlideRenderer.ts` | Integrate PngOptimizer |
| `README.md` | Document PNG optimization |

## Expected Results (Revised)

Based on Neo's review, here are realistic expectations:

| Preset | Expected Reduction | Notes |
|--------|-------------------|-------|
| none | 0% | Native canvas export |
| fast | 10-20% | Quick compression |
| balanced | 25-40% | Good balance |
| maximum | 40-55% | Best lossless |
| web | 30-70% | Varies by content complexity |

**Important Caveats:**
- Photo-heavy slides: 10-25% reduction
- Text/diagram slides: 40-60% reduction
- Gradient-heavy slides: 15-30% reduction
- Palette mode works best for slides with < 256 colors

## Backwards Compatibility

- Default behavior unchanged (no optimization applied unless configured)
- Sharp is optional - graceful fallback if not installed
- New options are additive, no breaking changes

## Dependencies

```json
{
  "dependencies": {
    "skia-canvas": "^3.0.8"
  },
  "peerDependencies": {
    "sharp": ">=0.32.0"
  },
  "peerDependenciesMeta": {
    "sharp": {
      "optional": true
    }
  },
  "devDependencies": {
    "sharp": "^0.33.0"
  }
}
```

## Future Enhancements

1. **WebP Format**: 25-34% smaller than PNG, native Sharp support
2. **AVIF Format**: 50%+ smaller, 93% browser support
3. **Auto Palette Detection**: Analyze colors before deciding palette mode
4. **Progressive/Interlaced PNG**: Better perceived load time for web
