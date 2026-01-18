/**
 * Type definitions for pptimg library.
 */

// Options and configuration
export type { PptxRenderOptions, ImageFormat, LogLevel, ResolvedRenderOptions } from './options.js';
export { DEFAULT_RENDER_OPTIONS } from './options.js';

// Results
export type {
  SlideRenderResult,
  PresentationRenderResult,
  RenderError,
  RenderErrorLevel,
} from './results.js';

// Theme
export type {
  ResolvedTheme,
  ResolvedColorScheme,
  ResolvedFontScheme,
  SchemeColorType,
  ColorTransform,
} from './theme.js';
export {
  DEFAULT_THEME,
  DEFAULT_OFFICE_COLORS,
  DEFAULT_FONT_SCHEME,
} from './theme.js';

// Geometry
export type {
  Rgba,
  Point,
  Size,
  Rect,
  Transform2D,
  ShapeTransform,
  PathSegment,
  PathSegmentType,
  Path,
  PathBounds,
} from './geometry.js';
export { IDENTITY_TRANSFORM, Colors } from './geometry.js';

// Elements
export type {
  ElementType,
  SlideElement,
  ShapeElement,
  PictureElement,
  GroupShapeElement,
  ConnectionShapeElement,
  Fill,
  FillType,
  SolidFill,
  GradientFill,
  GradientStop,
  PatternFill,
  PictureFill,
  Stroke,
  LineCap,
  LineJoin,
  TextBody,
  TextBodyProperties,
  Paragraph,
  ParagraphProperties,
  TextRun,
  TextRunProperties,
  TextAlignment,
  VerticalAlignment,
  BulletConfig,
  PlaceholderType,
  PlaceholderReference,
} from './elements.js';
