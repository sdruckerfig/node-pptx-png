/**
 * RGBA color with values 0-255 for each channel.
 */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * 2D point in coordinate space.
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Size with width and height.
 */
export interface Size {
  width: number;
  height: number;
}

/**
 * Rectangle with position and dimensions.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 2D affine transform matrix.
 * Stored as [a, b, c, d, e, f] representing:
 * | a c e |
 * | b d f |
 * | 0 0 1 |
 */
export interface Transform2D {
  /** Scale X and rotation component */
  a: number;
  /** Rotation component */
  b: number;
  /** Rotation component */
  c: number;
  /** Scale Y and rotation component */
  d: number;
  /** Translate X */
  e: number;
  /** Translate Y */
  f: number;
}

/**
 * Shape transform properties from OpenXML.
 */
export interface ShapeTransform {
  /** Offset X in EMU */
  offX: number;
  /** Offset Y in EMU */
  offY: number;
  /** Extent (width) in EMU */
  extCx: number;
  /** Extent (height) in EMU */
  extCy: number;
  /** Rotation in degrees (0-360) */
  rotation?: number;
  /** Horizontal flip */
  flipH?: boolean;
  /** Vertical flip */
  flipV?: boolean;
}

/**
 * Path segment types for custom geometry.
 */
export type PathSegmentType = 'moveTo' | 'lineTo' | 'cubicBezierTo' | 'quadBezierTo' | 'arcTo' | 'close';

/**
 * Arc parameters for SVG-style elliptical arcs.
 * Used when type is 'arcTo'.
 */
export interface ArcParameters {
  /** Horizontal radius */
  rx: number;
  /** Vertical radius */
  ry: number;
  /** X-axis rotation in degrees */
  xAxisRotation: number;
  /** Whether to use the larger arc (true) or smaller arc (false) */
  largeArcFlag: boolean;
  /** Direction: true = clockwise, false = counter-clockwise */
  sweepFlag: boolean;
}

/**
 * Legacy arc parameters used by OpenXML custom geometry.
 * Uses start angle and swing angle instead of SVG-style flags.
 */
export interface LegacyArcParameters {
  /** Horizontal radius */
  rx: number;
  /** Vertical radius */
  ry: number;
  /** Start angle in degrees */
  startAngle: number;
  /** Swing angle in degrees (positive = clockwise) */
  swingAngle: number;
}

/**
 * A segment of a path.
 */
export interface PathSegment {
  type: PathSegmentType;
  /** Points for the segment (varies by type) */
  points?: Point[];
  /** SVG-style arc parameters if type is 'arcTo' */
  arc?: ArcParameters;
  /** Legacy OpenXML arc parameters (startAngle/swingAngle) if type is 'arcTo' */
  legacyArc?: LegacyArcParameters;
}

/**
 * A complete path made up of segments.
 */
export interface Path {
  segments: PathSegment[];
  /** Whether the path is filled */
  fill?: boolean;
  /** Whether the path is stroked */
  stroke?: boolean;
}

/**
 * Bounds calculated from a path.
 */
export interface PathBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/**
 * Identity transform (no transformation).
 */
export const IDENTITY_TRANSFORM: Transform2D = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
};

/**
 * Common RGBA colors.
 */
export const Colors = {
  transparent: { r: 0, g: 0, b: 0, a: 0 } as Rgba,
  black: { r: 0, g: 0, b: 0, a: 255 } as Rgba,
  white: { r: 255, g: 255, b: 255, a: 255 } as Rgba,
  red: { r: 255, g: 0, b: 0, a: 255 } as Rgba,
  green: { r: 0, g: 128, b: 0, a: 255 } as Rgba,
  blue: { r: 0, g: 0, b: 255, a: 255 } as Rgba,
  gray: { r: 128, g: 128, b: 128, a: 255 } as Rgba,
  lightGray: { r: 211, g: 211, b: 211, a: 255 } as Rgba,
  darkGray: { r: 169, g: 169, b: 169, a: 255 } as Rgba,
} as const;
