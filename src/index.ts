/**
 * pptimg - PPTX to Image Converter
 *
 * High-fidelity PowerPoint presentation to image conversion for Node.js.
 */

// Main entry point
export {
  PptxImageRenderer,
  createRenderer,
  renderPresentation,
  renderSlide,
} from './core/PptxImageRenderer.js';
export type { IPptxImageRenderer } from './core/PptxImageRenderer.js';

// Types - Options and Results
export type {
  PptxRenderOptions,
  ImageFormat,
  LogLevel,
  SlideRenderResult,
  PresentationRenderResult,
  RenderError,
  RenderErrorLevel,
} from './types/index.js';
export { DEFAULT_RENDER_OPTIONS } from './types/index.js';

// Types - Theme
export type {
  ResolvedTheme,
  ResolvedColorScheme,
  ResolvedFontScheme,
  SchemeColorType,
  ColorTransform,
} from './types/index.js';
export { DEFAULT_THEME, DEFAULT_OFFICE_COLORS, DEFAULT_FONT_SCHEME } from './types/index.js';

// Types - Geometry
export type {
  Rgba,
  Point,
  Size,
  Rect,
  Transform2D,
  ShapeTransform,
  Path,
  PathSegment,
} from './types/index.js';
export { Colors } from './types/index.js';

// Core components (for advanced usage)
export { PptxParser } from './core/PptxParser.js';
export type { PresentationData, SlideData } from './core/PptxParser.js';
export { UnitConverter, emuToPixels, emuToPoints, fontSizeToPoints } from './core/UnitConverter.js';

// Theme components (for advanced usage)
export { ThemeResolver } from './theme/ThemeResolver.js';
export { ColorResolver } from './theme/ColorResolver.js';

// Rendering components (for advanced usage)
export { SlideRenderer } from './rendering/SlideRenderer.js';
export type { SlideRenderContext } from './rendering/SlideRenderer.js';
export { BackgroundRenderer } from './rendering/BackgroundRenderer.js';
export { ShapeRenderer, FillRenderer, StrokeRenderer, TextRenderer } from './rendering/index.js';

// Geometry components (for advanced usage)
export { PathBuilder, TransformCalculator, PresetGeometryCalculator } from './geometry/index.js';

// Parser components (for advanced usage)
export { ShapeParser, TextParser } from './parsers/index.js';

// Text components (for advanced usage)
export {
  FontResolver,
  BulletFormatter,
  WordWrapper,
  TextLayoutEngine,
} from './text/index.js';
export type {
  FontMetrics,
  ResolvedFont,
  BulletProps,
  FormattedBullet,
  WrapMode,
  TextFragment,
  WrappedLine,
  PositionedTextRun,
  PositionedBullet,
  LayoutLine,
  TextLayout,
} from './text/index.js';

// Logger
export { createLogger, Logger } from './utils/Logger.js';
export type { ILogger } from './utils/Logger.js';
