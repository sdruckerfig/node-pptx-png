/**
 * Output image format options.
 */
export type ImageFormat = 'png' | 'jpeg';

/**
 * Logging level for the renderer.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * Options for rendering PPTX presentations to images.
 */
export interface PptxRenderOptions {
  /**
   * Target width in pixels.
   * Height will be auto-calculated based on slide aspect ratio.
   * @default 1920
   */
  width?: number;

  /**
   * Target height in pixels.
   * If omitted, calculated from width and slide aspect ratio.
   */
  height?: number;

  /**
   * Output image format.
   * @default 'png'
   */
  format?: ImageFormat;

  /**
   * JPEG quality (1-100). Only applicable when format is 'jpeg'.
   * @default 90
   */
  jpegQuality?: number;

  /**
   * Override slide background color (hex string, e.g., '#FFFFFF').
   * If set, this replaces the slide's background.
   */
  backgroundColor?: string;

  /**
   * Logging level for diagnostic output.
   * @default 'warn'
   */
  logLevel?: LogLevel;

  /**
   * Enable debug mode to draw bounding boxes and element IDs.
   * @default false
   */
  debugMode?: boolean;
}

/**
 * Default rendering options.
 */
export const DEFAULT_RENDER_OPTIONS: Required<Omit<PptxRenderOptions, 'height' | 'backgroundColor'>> & {
  height: undefined;
  backgroundColor: undefined;
} = {
  width: 1920,
  height: undefined,
  format: 'png',
  jpegQuality: 90,
  backgroundColor: undefined,
  logLevel: 'warn',
  debugMode: false,
};

/**
 * Resolved render options after merging with defaults.
 * Unlike Required<PptxRenderOptions>, this type accurately represents
 * that height and backgroundColor remain optional (undefined) even after resolution.
 */
export interface ResolvedRenderOptions {
  /** Target width in pixels. */
  width: number;
  /** Target height in pixels. Undefined means auto-calculate from aspect ratio. */
  height: number | undefined;
  /** Output image format. */
  format: ImageFormat;
  /** JPEG quality (1-100). */
  jpegQuality: number;
  /** Override background color. Undefined means use slide's background. */
  backgroundColor: string | undefined;
  /** Logging level. */
  logLevel: LogLevel;
  /** Debug mode for bounding boxes and element IDs. */
  debugMode: boolean;
}
