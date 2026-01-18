# PPTX to Image Converter - Node.js Implementation Plan

## Project Overview

A Node.js library for converting PowerPoint (PPTX) files to high-fidelity images. This project replicates the functionality from Contrails' pure .NET rendering system, adapted for the Node.js ecosystem.

---

## Architecture Overview

### Technology Stack

| Component | Library | Purpose |
|-----------|---------|---------|
| **PPTX Parsing** | `jszip` + custom XML parser | Extract PPTX contents (ZIP archive) |
| **XML Processing** | `fast-xml-parser` | Parse OpenXML structure |
| **Image Rendering** | `canvas` (node-canvas) | 2D graphics rendering with Cairo backend |
| **PNG Encoding** | Built into `canvas` | High-quality PNG output |
| **Font Handling** | `canvas` + `@napi-rs/canvas` | TrueType font rendering |
| **TypeScript** | `typescript` | Type safety and interfaces |

### Why This Stack

- **jszip**: Industry-standard ZIP handling, PPTX files are ZIP archives
- **canvas (node-canvas)**: Cairo-based rendering matches quality of .NET software rasterizer
- **fast-xml-parser**: High-performance XML parsing for OpenXML
- **No Puppeteer/LibreOffice**: Pure JS/native rendering for reliability and speed

---

## Project Structure

```
pptimg/
├── src/
│   ├── index.ts                    # Public API exports
│   ├── types/
│   │   ├── index.ts                # All type exports
│   │   ├── options.ts              # PptxRenderOptions, ImageFormat
│   │   ├── results.ts              # SlideRenderResult, PresentationRenderResult
│   │   ├── theme.ts                # ResolvedTheme, ColorScheme, FontScheme
│   │   ├── geometry.ts             # Path, Point, Rect, Transform
│   │   └── elements.ts             # Shape, Picture, Text, Chart types
│   │
│   ├── core/
│   │   ├── PptxImageRenderer.ts    # Main entry point - orchestrates rendering
│   │   ├── PptxParser.ts           # Opens PPTX, extracts parts
│   │   └── UnitConverter.ts        # EMU/pixel/point conversions
│   │
│   ├── rendering/
│   │   ├── SlideRenderer.ts        # Renders individual slides
│   │   ├── ShapeRenderer.ts        # Renders shape elements
│   │   ├── TextRenderer.ts         # Text layout and rendering
│   │   ├── ImageRenderer.ts        # Embedded image rendering
│   │   ├── FillRenderer.ts         # Solid, gradient, pattern, image fills
│   │   ├── StrokeRenderer.ts       # Shape outlines
│   │   ├── ChartRenderer.ts        # Chart rendering (bar, line, pie)
│   │   └── BackgroundRenderer.ts   # Slide backgrounds
│   │
│   ├── geometry/
│   │   ├── PresetGeometryCalculator.ts  # 100+ preset shape paths
│   │   ├── PathBuilder.ts               # Path construction utilities
│   │   └── TransformCalculator.ts       # Rotation, scale, translate
│   │
│   ├── theme/
│   │   ├── ThemeResolver.ts        # Extracts theme from presentation
│   │   ├── ColorResolver.ts        # Resolves scheme colors + transforms
│   │   └── FontResolver.ts         # Resolves theme fonts
│   │
│   ├── parsers/
│   │   ├── SlideParser.ts          # Parses slide XML
│   │   ├── ShapeParser.ts          # Parses shape properties
│   │   ├── TextParser.ts           # Parses text body/paragraphs
│   │   ├── ChartParser.ts          # Parses chart data
│   │   └── RelationshipParser.ts   # Parses .rels files
│   │
│   └── utils/
│       ├── ColorUtils.ts           # Color manipulation (tint, shade, etc.)
│       ├── XmlUtils.ts             # XML helper functions
│       └── Logger.ts               # Structured logging
│
├── test/
│   ├── integration/
│   │   ├── full-presentation.test.ts
│   │   └── single-slide.test.ts
│   ├── unit/
│   │   ├── parsers/
│   │   ├── rendering/
│   │   └── geometry/
│   └── fixtures/
│       └── *.pptx                  # Test presentation files
│
├── package.json
├── tsconfig.json
├── .eslintrc.js
├── .prettierrc
├── README.md
└── CLAUDE.md
```

---

## Module Specifications

### 1. Core Module: `PptxImageRenderer.ts`

**Purpose**: Main entry point for the library

**Public API**:
```typescript
interface IPptxImageRenderer {
  renderPresentation(input: Buffer | string, options?: PptxRenderOptions): Promise<PresentationRenderResult>;
  renderSlide(input: Buffer | string, slideIndex: number, options?: PptxRenderOptions): Promise<SlideRenderResult>;
  getSlideCount(input: Buffer | string): Promise<number>;
}
```

**Implementation Flow**:
1. Accept Buffer (file contents) or string (file path)
2. Open PPTX via PptxParser
3. Resolve theme via ThemeResolver
4. Get slide dimensions from presentation.xml
5. For each slide, call SlideRenderer
6. Return aggregated results

### 2. Types Module

**PptxRenderOptions**:
```typescript
interface PptxRenderOptions {
  width?: number;           // Target width in pixels (default: 1920)
  height?: number;          // Target height (auto-calculated if omitted)
  format?: ImageFormat;     // Output format (default: 'png')
  jpegQuality?: number;     // JPEG quality 1-100 (default: 90)
  backgroundColor?: string; // Override background color
}

type ImageFormat = 'png' | 'jpeg';
```

**SlideRenderResult**:
```typescript
interface SlideRenderResult {
  slideIndex: number;
  slideNumber: number;      // 1-based for display
  imageData: Buffer;        // PNG/JPEG bytes
  width: number;
  height: number;
  success: boolean;
  errorMessage?: string;
}
```

**PresentationRenderResult**:
```typescript
interface PresentationRenderResult {
  slides: SlideRenderResult[];
  totalSlides: number;
  successfulSlides: number;
  allSuccessful: boolean;
}
```

### 3. PptxParser Module

**Purpose**: Open and extract PPTX contents

**Implementation**:
```typescript
class PptxParser {
  private zip: JSZip;

  async open(input: Buffer | string): Promise<void>;
  async getPresentation(): Promise<PresentationData>;
  async getSlide(index: number): Promise<SlideData>;
  async getSlideLayout(layoutId: string): Promise<SlideLayoutData>;
  async getSlideMaster(masterId: string): Promise<SlideMasterData>;
  async getTheme(): Promise<ThemeData>;
  async getMedia(relationshipId: string): Promise<Buffer>;
  close(): void;
}
```

**PPTX Structure**:
```
[Content_Types].xml
_rels/.rels
ppt/
├── presentation.xml           # Main presentation data
├── _rels/presentation.xml.rels
├── slides/
│   ├── slide1.xml
│   ├── slide2.xml
│   └── _rels/slide1.xml.rels
├── slideLayouts/
│   └── slideLayout1.xml
├── slideMasters/
│   └── slideMaster1.xml
├── theme/
│   └── theme1.xml
├── media/
│   └── image1.png
└── charts/
    └── chart1.xml
```

### 4. ThemeResolver Module

**Purpose**: Extract and resolve theme colors/fonts

**Color Scheme** (12 colors):
- `dk1`, `lt1` (Dark1, Light1) - Primary
- `dk2`, `lt2` (Dark2, Light2) - Secondary
- `accent1` through `accent6` - Accent colors
- `hlink`, `folHlink` - Hyperlink colors

**Color Transforms**:
- `tint` - Lighten color (0-100%)
- `shade` - Darken color (0-100%)
- `satMod` - Saturation modification
- `lumMod` - Luminance modification
- `alpha` - Transparency

**Font Scheme**:
- `majorFont` - Headings (default: Calibri Light)
- `minorFont` - Body text (default: Calibri)

### 5. SlideRenderer Module

**Purpose**: Render a single slide to canvas

**Rendering Order**:
1. Create canvas at target dimensions
2. Fill with white background
3. Render background (slide → layout → master chain)
4. Render layout elements (if not overridden)
5. Render slide elements in z-order:
   - `sp` (Shape)
   - `pic` (Picture)
   - `grpSp` (GroupShape - recursive)
   - `cxnSp` (ConnectionShape)
   - `graphicFrame` (Chart, Table, SmartArt)

**Context Object**:
```typescript
interface SlideRenderContext {
  canvas: Canvas;
  ctx: CanvasRenderingContext2D;
  theme: ResolvedTheme;
  slideWidth: number;      // EMU
  slideHeight: number;     // EMU
  targetWidth: number;     // pixels
  targetHeight: number;    // pixels
  scaleX: number;          // slideWidth → targetWidth
  scaleY: number;          // slideHeight → targetHeight
}
```

### 6. PresetGeometryCalculator Module

**Purpose**: Generate paths for 100+ preset shape types

**Priority Shape Types** (Phase 1):
```
rect, roundRect, ellipse, triangle, rtTriangle
diamond, parallelogram, trapezoid
pentagon, hexagon, octagon
arrow (right, left, up, down), chevron
line, straightConnector1
plus, heart, cloud
wedgeRectCallout, wedgeEllipseCallout
flowChartProcess, flowChartDecision, flowChartTerminator
```

**Full Shape Support** (Phase 2):
- All 100+ preset geometries from ECMA-376
- Custom geometry paths (`custGeom`)

### 7. FillRenderer Module

**Fill Types**:
- `solidFill` - Single color
- `gradFill` - Linear or radial gradient
- `pattFill` - Pattern fill (hatching, etc.)
- `blipFill` - Image fill
- `noFill` - Transparent

**Gradient Implementation**:
```typescript
interface GradientStop {
  position: number;  // 0-100%
  color: string;     // Resolved RGBA
}

function renderLinearGradient(ctx: CanvasRenderingContext2D, bounds: Rect, angle: number, stops: GradientStop[]): void;
function renderRadialGradient(ctx: CanvasRenderingContext2D, bounds: Rect, center: Point, stops: GradientStop[]): void;
```

### 8. TextRenderer Module

**Features**:
- Paragraph and run parsing
- Font family and size resolution
- Word wrapping within bounds
- Vertical alignment (top, middle, bottom)
- Horizontal alignment (left, center, right, justify)
- Line spacing
- Text margins/insets
- Bullet/numbering support

**Text Body Structure**:
```
txBody
├── bodyPr (body properties: anchor, margins)
└── p[] (paragraphs)
    ├── pPr (paragraph properties: alignment, spacing)
    └── r[] (runs)
        ├── rPr (run properties: font, size, color)
        └── t (text content)
```

### 9. ChartRenderer Module

**Supported Chart Types** (Phase 1):
- Bar/Column charts
- Line charts
- Pie charts
- Stacked variants

**Implementation**:
- Parse chart data from `chart.xml`
- Render using Canvas 2D API
- Support legends, labels, axes

### 10. UnitConverter Module

**ECMA-376 Units**:
```typescript
const EMU_PER_INCH = 914400;
const EMU_PER_POINT = 12700;
const EMU_PER_CM = 360000;
const ANGLE_UNIT = 60000;  // 60,000ths of a degree

function emuToPixels(emu: number, dpi: number): number;
function pointsToEmu(points: number): number;
function emuToPoints(emu: number): number;
function angleToRadians(angle: number): number;
function fontSizeToPoints(fontSize: number): number;  // hundredths of a point
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (Foundation)
1. Project setup (package.json, tsconfig, eslint)
2. Type definitions
3. PptxParser (ZIP extraction, XML parsing)
4. UnitConverter
5. ThemeResolver (basic color/font resolution)
6. Basic SlideRenderer (background only)

### Phase 2: Shape Rendering
1. PresetGeometryCalculator (20 common shapes)
2. FillRenderer (solid, gradient)
3. StrokeRenderer
4. ShapeRenderer integration

### Phase 3: Text Rendering
1. TextParser
2. TextRenderer (basic layout)
3. Word wrapping
4. Font resolution and rendering

### Phase 4: Images and Media
1. RelationshipParser
2. ImageRenderer
3. BlipFill support

### Phase 5: Advanced Features
1. PresetGeometryCalculator (remaining shapes)
2. ChartRenderer
3. GroupShape support
4. Pattern fills

### Phase 6: Polish and Testing
1. Comprehensive error handling
2. Logging
3. Integration tests
4. Performance optimization
5. Documentation

---

## Error Handling Strategy

**Multi-Level Approach**:

1. **Presentation Level**:
   - Validate PPTX file structure
   - Return detailed error if invalid

2. **Slide Level**:
   - Try-catch around each slide
   - Continue to next slide on failure
   - Report which slides failed

3. **Element Level**:
   - Try-catch around each shape/text/image
   - Log warning, skip element, continue
   - Graceful degradation

**Error Result**:
```typescript
interface RenderError {
  level: 'presentation' | 'slide' | 'element';
  slideIndex?: number;
  elementType?: string;
  message: string;
  stack?: string;
}
```

---

## Configuration

**Default Options**:
```typescript
const DEFAULT_OPTIONS: Required<PptxRenderOptions> = {
  width: 1920,
  height: undefined,  // Auto-calculated
  format: 'png',
  jpegQuality: 90,
  backgroundColor: undefined,
};
```

**Standard Slide Dimensions**:
- 4:3 Standard: 9,144,000 × 6,858,000 EMU (10" × 7.5")
- 16:9 Widescreen: 12,192,000 × 6,858,000 EMU (13.333" × 7.5")

---

## Dependencies

**Production**:
```json
{
  "jszip": "^3.10.1",
  "fast-xml-parser": "^4.3.0",
  "canvas": "^2.11.2"
}
```

**Development**:
```json
{
  "typescript": "^5.3.0",
  "@types/node": "^20.0.0",
  "vitest": "^1.0.0",
  "eslint": "^8.55.0",
  "@typescript-eslint/parser": "^6.0.0",
  "@typescript-eslint/eslint-plugin": "^6.0.0",
  "prettier": "^3.1.0"
}
```

---

## Testing Strategy

**Unit Tests**:
- Each parser module
- Each renderer module
- Unit converter
- Color utilities

**Integration Tests**:
- Full presentation rendering
- Single slide rendering
- Various PPTX files (4:3, 16:9, complex)

**Test Fixtures**:
- Simple shapes presentation
- Text-heavy presentation
- Image-heavy presentation
- Chart presentation
- Complex mixed presentation

---

## Success Criteria

1. **Fidelity**: Output images closely match PowerPoint rendering
2. **Coverage**: Support 80%+ of common PPTX elements
3. **Performance**: Render 10-slide presentation in <5 seconds
4. **Reliability**: Graceful handling of malformed/complex files
5. **API Quality**: Clean, typed, documented public API

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Canvas font rendering differences | Medium | Use system fonts, test extensively |
| Complex shape geometries | High | Prioritize common shapes, fallback to rect |
| Memory with large files | Medium | Process slides sequentially, dispose canvases |
| OpenXML edge cases | High | Robust parsing, extensive testing |
| Chart complexity | Medium | Support basic charts first, expand iteratively |

---

---

## Neo Agent Feedback - Incorporated Changes

Based on comprehensive review from Neo agent, the following enhancements have been incorporated:

### Additional Modules Added

1. **PlaceholderResolver.ts** - Handles slide/layout/master inheritance chain (CRITICAL)
2. **ConnectionShapeRenderer.ts** - Renders connector shapes between elements
3. **AlternateContentRenderer.ts** - Handles SmartArt fallbacks and mc:Choice/Fallback
4. **GroupShapeRenderer.ts** - Separate module for nested group transforms
5. **CustomGeometryParser.ts** - Parses `custGeom` path data
6. **FontSubstitution.ts** - Font fallback chains for missing fonts
7. **TextLayoutEngine.ts** - Separate text measurement/layout from rendering
8. **WordWrapper.ts** - Proper word break algorithm
9. **BulletFormatter.ts** - Bullet and numbering support

### Edge Cases to Handle

**Text Rendering**:
- Subscript/superscript baseline offsets
- Tab characters and tab stops
- Non-breaking spaces
- Line breaks (`<a:br>`)
- Empty paragraphs (contribute line height)
- Autofit text (shrink to fit)
- Text rotation (90/270/180 degrees)
- RTL text support

**Color Resolution**:
- `phClr` (placeholder color) inheritance
- System colors (`windowText`, `window`)
- HSL color conversion
- Percentage RGB values (0-100000)
- Multiple transform ordering: tint → shade → satMod → lumMod → alpha

**Image Handling**:
- SVG images (may need conversion or skip)
- WMF/EMF legacy formats
- Duotone effects
- Source rectangle cropping
- Tile mode for fills

**Geometry**:
- Custom geometry (`custGeom`) path parsing
- Adjustment values for parameterized shapes
- Shape guides (formulas)
- Zero-dimension shapes (lines)

### Architectural Improvements

1. **Memory Management**: Explicit canvas disposal after rendering
2. **Optional Parallel Processing**: Worker threads for multi-slide rendering
3. **Extensibility Hooks**: Custom shape renderers, font resolvers
4. **Debug Mode**: Option to draw bounding boxes and element IDs
5. **Caching**: Theme, font metrics, decoded images cached per presentation

### Additional Effects to Support

- Shadow effects (common in business presentations)
- Glow effects
- Pattern fills (53 types - implement top 10 with fallback)

### Testing Enhancements

- Visual regression testing infrastructure
- Golden image comparison
- Comprehensive fixture files covering all edge cases
- Shape geometry test suite

---

## Revised Project Structure

```
pptimg/
├── src/
│   ├── index.ts
│   ├── types/
│   │   ├── index.ts
│   │   ├── options.ts
│   │   ├── results.ts
│   │   ├── theme.ts
│   │   ├── geometry.ts
│   │   └── elements.ts
│   │
│   ├── core/
│   │   ├── PptxImageRenderer.ts
│   │   ├── PptxParser.ts
│   │   ├── UnitConverter.ts
│   │   └── PlaceholderResolver.ts      # NEW
│   │
│   ├── rendering/
│   │   ├── SlideRenderer.ts
│   │   ├── ShapeRenderer.ts
│   │   ├── TextRenderer.ts
│   │   ├── ImageRenderer.ts
│   │   ├── FillRenderer.ts
│   │   ├── StrokeRenderer.ts
│   │   ├── ChartRenderer.ts
│   │   ├── BackgroundRenderer.ts
│   │   ├── ConnectionShapeRenderer.ts  # NEW
│   │   ├── GroupShapeRenderer.ts       # NEW
│   │   └── AlternateContentRenderer.ts # NEW
│   │
│   ├── geometry/
│   │   ├── PresetGeometryCalculator.ts
│   │   ├── CustomGeometryParser.ts     # NEW
│   │   ├── PathBuilder.ts
│   │   └── TransformCalculator.ts
│   │
│   ├── theme/
│   │   ├── ThemeResolver.ts
│   │   ├── ColorResolver.ts
│   │   ├── FontResolver.ts
│   │   └── FontSubstitution.ts         # NEW
│   │
│   ├── text/
│   │   ├── TextLayoutEngine.ts         # NEW
│   │   ├── WordWrapper.ts              # NEW
│   │   └── BulletFormatter.ts          # NEW
│   │
│   ├── parsers/
│   │   ├── SlideParser.ts
│   │   ├── ShapeParser.ts
│   │   ├── TextParser.ts
│   │   ├── ChartParser.ts
│   │   └── RelationshipParser.ts
│   │
│   └── utils/
│       ├── ColorUtils.ts
│       ├── XmlUtils.ts
│       └── Logger.ts
│
├── test/
│   ├── visual/                         # NEW
│   │   ├── baselines/
│   │   ├── comparisons/
│   │   └── tolerance.config.ts
│   ├── integration/
│   ├── unit/
│   └── fixtures/
│       ├── shapes-basic.pptx
│       ├── shapes-preset-all.pptx
│       ├── text-formatting.pptx
│       ├── gradients.pptx
│       ├── images-embedded.pptx
│       ├── theme-colors.pptx
│       ├── charts-basic.pptx
│       ├── smartart-org-chart.pptx
│       ├── connectors.pptx
│       ├── groups-nested.pptx
│       ├── transforms-rotation.pptx
│       └── placeholder-inheritance.pptx
│
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .eslintrc.js
├── .prettierrc
├── README.md
└── CLAUDE.md
```

---

## Revised Implementation Phases

### Phase 1: Core Infrastructure
1. Project setup (package.json, tsconfig, eslint, prettier)
2. Type definitions (all interfaces)
3. PptxParser (ZIP extraction, XML parsing)
4. UnitConverter
5. Logger utility
6. ThemeResolver (basic color/font resolution)
7. PlaceholderResolver (stub with basic functionality)
8. Basic SlideRenderer (background only)
9. Visual regression test infrastructure

### Phase 2: Shape Rendering
1. PresetGeometryCalculator (20 common shapes)
2. PathBuilder
3. TransformCalculator (rotation, flip)
4. FillRenderer (solid, gradient)
5. StrokeRenderer
6. ShapeRenderer integration
7. ConnectionShapeRenderer (basic connectors)
8. Shape geometry test suite

### Phase 3: Text Rendering
1. TextLayoutEngine
2. WordWrapper
3. BulletFormatter
4. FontSubstitution
5. TextRenderer (full implementation)

### Phase 4: Images and Media
1. RelationshipParser
2. ImageRenderer
3. BlipFill support
4. Source rectangle cropping
5. Stretch vs tile modes

### Phase 5: Advanced Features
1. PresetGeometryCalculator (remaining shapes)
2. CustomGeometryParser
3. GroupShapeRenderer
4. AlternateContentRenderer
5. Full PlaceholderResolver
6. Shadow/glow effects
7. ChartRenderer

### Phase 6: Polish and Testing
1. Comprehensive error handling
2. Debug mode
3. Performance optimization (caching, memory)
4. Full integration tests
5. Documentation

---

## Next Steps

1. ✅ Create this implementation plan
2. ✅ Get feedback from Neo agent
3. ⏳ Build with CompliantImplementer agent
4. ⏳ Code review with Linus agent
5. ⏳ Iterate until approved
