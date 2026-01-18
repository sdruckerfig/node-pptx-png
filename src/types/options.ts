/**
 * Output image format options.
 */
export type ImageFormat = 'png' | 'jpeg';

/**
 * Logging level for the renderer.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * PNG optimization preset names.
 * - 'none': No optimization (native canvas export)
 * - 'fast': Quick compression (10-20% reduction)
 * - 'balanced': Good balance of speed and size (25-40% reduction)
 * - 'maximum': Best lossless compression (40-55% reduction)
 * - 'web': Palette-based optimization for web (30-70% reduction, may lose quality)
 */
export type PngOptimizationPreset = 'none' | 'fast' | 'balanced' | 'maximum' | 'web';

/**
 * Custom PNG optimization options.
 * Use these for fine-grained control over compression settings.
 */
export interface PngOptimizationOptions {
  /**
   * PNG compression level (0-9).
   * 0 = fastest/largest, 9 = slowest/smallest.
   * @default 6
   */
  compressionLevel?: number;

  /**
   * Use adaptive row filtering for better compression.
   * Slightly slower but can improve compression ratio.
   * @default true
   */
  adaptiveFiltering?: boolean;

  /**
   * Convert to indexed/palette PNG.
   * Significant size reduction for images with limited colors.
   * May cause quality loss for photos or gradients.
   * @default false
   */
  palette?: boolean;

  /**
   * Maximum colors for palette mode (2-256).
   * Only used when palette is true.
   * @default 256
   */
  colors?: number;

  /**
   * Quality threshold for palette quantization (1-100).
   * Lower values = more aggressive compression.
   * Only used when palette is true.
   * @default 90
   */
  quality?: number;

  /**
   * Floyd-Steinberg dithering strength (0.0-1.0).
   * Higher values reduce banding in palette mode.
   * Only used when palette is true.
   * @default 1.0
   */
  dither?: number;
}

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

  /**
   * PNG optimization settings.
   * Can be a preset name or custom options object.
   * Requires Sharp to be installed for optimization.
   * If Sharp is not available, falls back to native canvas export.
   * @default 'none'
   */
  pngOptimization?: PngOptimizationPreset | PngOptimizationOptions;
}

/**
 * Default rendering options.
 */
export const DEFAULT_RENDER_OPTIONS: Required<Omit<PptxRenderOptions, 'height' | 'backgroundColor' | 'pngOptimization'>> & {
  height: undefined;
  backgroundColor: undefined;
  pngOptimization: PngOptimizationPreset;
} = {
  width: 1920,
  height: undefined,
  format: 'png',
  jpegQuality: 90,
  backgroundColor: undefined,
  logLevel: 'warn',
  debugMode: false,
  pngOptimization: 'none',
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
  /** PNG optimization settings. */
  pngOptimization: PngOptimizationPreset | PngOptimizationOptions;
}
