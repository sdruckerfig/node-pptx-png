import type { Rgba, Rect, ShapeTransform, Path } from './geometry.js';
import type { ColorTransform } from './theme.js';

/**
 * Types of elements that can appear on a slide.
 */
export type ElementType =
  | 'shape'
  | 'picture'
  | 'textBox'
  | 'chart'
  | 'table'
  | 'groupShape'
  | 'connectionShape'
  | 'graphicFrame'
  | 'oleObject'
  | 'unknown';

/**
 * Base interface for all slide elements.
 */
export interface SlideElement {
  /** Element type identifier */
  type: ElementType;
  /** Unique element ID within the slide */
  id?: string;
  /** Element name (for debugging/identification) */
  name?: string;
  /** Element transform (position, size, rotation) */
  transform: ShapeTransform;
  /** Whether the element is hidden */
  hidden?: boolean;
}

/**
 * Fill types for shapes.
 */
export type FillType = 'none' | 'solid' | 'gradient' | 'pattern' | 'picture';

/**
 * Solid fill properties.
 */
export interface SolidFill {
  type: 'solid';
  color: Rgba;
}

/**
 * Gradient stop definition.
 */
export interface GradientStop {
  /** Position 0-1 */
  position: number;
  /** Color at this stop */
  color: Rgba;
}

/**
 * Gradient fill properties.
 */
export interface GradientFill {
  type: 'gradient';
  /** Gradient angle in degrees (0 = left-to-right) */
  angle?: number;
  /** Whether this is a radial gradient */
  isRadial?: boolean;
  /** Gradient stops */
  stops: GradientStop[];
  /** Center point for radial gradients (0-1) */
  centerX?: number;
  centerY?: number;
}

/**
 * Pattern fill properties.
 */
export interface PatternFill {
  type: 'pattern';
  /** Pattern preset name */
  preset: string;
  /** Foreground color */
  foregroundColor: Rgba;
  /** Background color */
  backgroundColor: Rgba;
}

/**
 * Picture/image fill properties.
 */
export interface PictureFill {
  type: 'picture';
  /** Relationship ID to the image */
  relationshipId: string;
  /** Stretch/crop rectangle */
  sourceRect?: Rect;
  /** Tile mode */
  tileMode?: boolean;
}

/**
 * Union of all fill types.
 */
export type Fill = SolidFill | GradientFill | PatternFill | PictureFill | { type: 'none' };

/**
 * Line/stroke cap styles.
 */
export type LineCap = 'flat' | 'round' | 'square';

/**
 * Line join styles.
 */
export type LineJoin = 'miter' | 'round' | 'bevel';

/**
 * Line/stroke properties.
 */
export interface Stroke {
  /** Stroke width in EMU */
  width: number;
  /** Stroke color */
  color: Rgba;
  /** Line cap style */
  cap?: LineCap;
  /** Line join style */
  join?: LineJoin;
  /** Dash pattern (array of dash/gap lengths) */
  dashPattern?: number[];
  /** Compound line type (single, double, etc.) */
  compound?: 'single' | 'double' | 'thickThin' | 'thinThick' | 'triple';
}

/**
 * Shape element (sp).
 */
export interface ShapeElement extends SlideElement {
  type: 'shape';
  /** Preset geometry type (rect, ellipse, etc.) */
  presetGeometry?: string;
  /** Custom geometry paths */
  customGeometry?: Path[];
  /** Shape fill */
  fill?: Fill;
  /** Shape outline/stroke */
  stroke?: Stroke;
  /** Text content within the shape */
  textBody?: TextBody;
}

/**
 * Picture element (pic).
 */
export interface PictureElement extends SlideElement {
  type: 'picture';
  /** Relationship ID to the image */
  relationshipId: string;
  /** Image crop rectangle */
  sourceRect?: Rect;
  /** Fill override */
  fill?: Fill;
  /** Outline */
  stroke?: Stroke;
}

/**
 * Text alignment options.
 */
export type TextAlignment = 'left' | 'center' | 'right' | 'justify' | 'distributed';

/**
 * Vertical text alignment.
 */
export type VerticalAlignment = 'top' | 'middle' | 'bottom';

/**
 * Text body properties.
 */
export interface TextBodyProperties {
  /** Vertical alignment */
  anchor?: VerticalAlignment;
  /** Horizontal anchor */
  anchorCenter?: boolean;
  /** Text rotation angle */
  rotation?: number;
  /** Left margin in EMU */
  leftInset?: number;
  /** Right margin in EMU */
  rightInset?: number;
  /** Top margin in EMU */
  topInset?: number;
  /** Bottom margin in EMU */
  bottomInset?: number;
  /** Wrap text within shape */
  wrap?: boolean;
  /** Auto-fit text to shape */
  autoFit?: 'none' | 'normal' | 'shape';
}

/**
 * Text run properties (character formatting).
 */
export interface TextRunProperties {
  /** Font size in hundredths of a point */
  fontSize?: number;
  /** Font family name */
  fontFamily?: string;
  /** Bold */
  bold?: boolean;
  /** Italic */
  italic?: boolean;
  /** Underline */
  underline?: boolean;
  /** Strikethrough */
  strikethrough?: boolean;
  /** Text color */
  color?: Rgba;
  /** Scheme color reference */
  schemeColor?: string;
  /** Color transforms */
  colorTransforms?: ColorTransform;
  /** Superscript baseline offset */
  baseline?: number;
  /** Character spacing in hundredths of a point */
  spacing?: number;
}

/**
 * A run of text with consistent formatting.
 */
export interface TextRun {
  /** Text content */
  text: string;
  /** Run properties */
  properties?: TextRunProperties;
}

/**
 * Bullet point configuration.
 */
export interface BulletConfig {
  /** Bullet type */
  type: 'none' | 'auto' | 'char' | 'picture';
  /** Bullet character (if type is 'char') */
  char?: string;
  /** Auto-numbering type (if type is 'auto') - e.g., 'arabicPeriod', 'romanUcPeriod' */
  autoNumType?: string;
  /** Starting number for auto-numbered lists */
  startAt?: number;
  /** Bullet font */
  font?: string;
  /** Bullet color */
  color?: Rgba;
  /** Bullet size as percentage of text */
  sizePercent?: number;
}

/**
 * Paragraph properties.
 */
export interface ParagraphProperties {
  /** Horizontal alignment */
  alignment?: TextAlignment;
  /** Indent level (0-8) */
  level?: number;
  /** Left margin in EMU */
  marginLeft?: number;
  /** Right margin in EMU */
  marginRight?: number;
  /** First line indent in EMU */
  indent?: number;
  /** Line spacing (percentage, e.g., 100000 = 100%) */
  lineSpacing?: number;
  /** Space before paragraph in EMU */
  spaceBefore?: number;
  /** Space after paragraph in EMU */
  spaceAfter?: number;
  /** Bullet configuration */
  bullet?: BulletConfig;
  /** Default run properties for this paragraph */
  defaultRunProperties?: TextRunProperties;
}

/**
 * A paragraph of text.
 */
export interface Paragraph {
  /** Paragraph properties */
  properties?: ParagraphProperties;
  /** Text runs */
  runs: TextRun[];
  /** End paragraph run properties */
  endParaRunProperties?: TextRunProperties;
}

/**
 * Text body containing paragraphs.
 */
export interface TextBody {
  /** Body properties */
  bodyProperties?: TextBodyProperties;
  /** Paragraphs */
  paragraphs: Paragraph[];
}

/**
 * Group shape containing multiple elements.
 */
export interface GroupShapeElement extends SlideElement {
  type: 'groupShape';
  /** Child elements */
  children: SlideElement[];
  /** Group-level fill (applies to children) */
  fill?: Fill;
}

/**
 * Connection shape (connector line).
 */
export interface ConnectionShapeElement extends SlideElement {
  type: 'connectionShape';
  /** Preset connector type */
  presetGeometry?: string;
  /** Start shape ID */
  startShapeId?: string;
  /** End shape ID */
  endShapeId?: string;
  /** Stroke properties */
  stroke?: Stroke;
}

/**
 * Placeholder types in OpenXML.
 */
export type PlaceholderType =
  | 'title'
  | 'body'
  | 'ctrTitle'
  | 'subTitle'
  | 'dt'
  | 'ftr'
  | 'sldNum'
  | 'hdr'
  | 'obj'
  | 'chart'
  | 'tbl'
  | 'clipArt'
  | 'dgm'
  | 'media'
  | 'sldImg'
  | 'pic';

/**
 * Placeholder reference.
 */
export interface PlaceholderReference {
  /** Placeholder type */
  type?: PlaceholderType;
  /** Placeholder index */
  idx?: number;
  /** Whether to show placeholder on slide */
  hasCustomPrompt?: boolean;
}
