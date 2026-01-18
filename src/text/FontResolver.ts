/**
 * Resolves font names from PPTX to system fonts.
 * Handles theme fonts (+mj-lt, +mn-lt) and font substitution fallback chains.
 */

import type { CanvasRenderingContext2D } from 'skia-canvas';
import type { ResolvedFontScheme } from '../types/theme.js';
import { DEFAULT_FONT_SCHEME } from '../types/theme.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Font metrics for a specific font at a specific size.
 */
export interface FontMetrics {
  /** Font ascent (distance from baseline to top) in pixels */
  ascent: number;
  /** Font descent (distance from baseline to bottom) in pixels */
  descent: number;
  /** Total line height (ascent + descent) in pixels */
  lineHeight: number;
  /** Em width (approximate width of 'M' character) in pixels */
  emWidth: number;
  /** Average character width in pixels */
  avgCharWidth: number;
}

/**
 * Resolved font information ready for canvas use.
 */
export interface ResolvedFont {
  /** Canvas-compatible font family string */
  family: string;
  /** Font size in points */
  sizePoints: number;
  /** Whether the font is bold */
  bold: boolean;
  /** Whether the font is italic */
  italic: boolean;
  /** Complete font string for canvas (e.g., "bold italic 12pt Arial") */
  fontString: string;
}

/**
 * Configuration for FontResolver.
 */
export interface FontResolverConfig {
  /** Resolved font scheme from theme */
  fontScheme: ResolvedFontScheme;
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Font substitution fallback chains.
 * When a requested font is unavailable, try these alternatives in order.
 */
const FONT_FALLBACK_CHAINS: Record<string, string[]> = {
  // Common Windows fonts
  'Calibri': ['Calibri', 'Arial', 'Helvetica', 'sans-serif'],
  'Calibri Light': ['Calibri Light', 'Calibri', 'Arial', 'Helvetica', 'sans-serif'],
  'Arial': ['Arial', 'Helvetica', 'sans-serif'],
  'Times New Roman': ['Times New Roman', 'Times', 'Georgia', 'serif'],
  'Cambria': ['Cambria', 'Georgia', 'Times New Roman', 'serif'],
  'Consolas': ['Consolas', 'Monaco', 'Courier New', 'monospace'],
  'Courier New': ['Courier New', 'Courier', 'monospace'],
  'Georgia': ['Georgia', 'Times New Roman', 'serif'],
  'Tahoma': ['Tahoma', 'Arial', 'Helvetica', 'sans-serif'],
  'Verdana': ['Verdana', 'Arial', 'Helvetica', 'sans-serif'],
  'Trebuchet MS': ['Trebuchet MS', 'Arial', 'Helvetica', 'sans-serif'],
  'Impact': ['Impact', 'Arial Black', 'sans-serif'],
  'Comic Sans MS': ['Comic Sans MS', 'cursive'],
  'Segoe UI': ['Segoe UI', 'Arial', 'Helvetica', 'sans-serif'],

  // Common macOS fonts
  'Helvetica': ['Helvetica', 'Arial', 'sans-serif'],
  'Helvetica Neue': ['Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
  'San Francisco': ['San Francisco', 'Helvetica Neue', 'Helvetica', 'sans-serif'],

  // Default fallbacks
  'sans-serif': ['Arial', 'Helvetica', 'sans-serif'],
  'serif': ['Georgia', 'Times New Roman', 'Times', 'serif'],
  'monospace': ['Consolas', 'Monaco', 'Courier New', 'monospace'],
};

/**
 * Default fallback chain for unknown fonts.
 */
const DEFAULT_FALLBACK = ['Arial', 'Helvetica', 'sans-serif'];

/**
 * Resolves font names from PPTX to canvas-compatible fonts.
 */
export class FontResolver {
  private readonly logger: ILogger;
  private readonly fontScheme: ResolvedFontScheme;
  private readonly metricsCache: Map<string, FontMetrics> = new Map();

  constructor(config: FontResolverConfig) {
    this.logger = config.logger ?? createLogger('warn', 'FontResolver');
    this.fontScheme = config.fontScheme;
  }

  /**
   * Resolves a font family name from PPTX to a canvas-compatible name.
   * Handles theme font references (+mj-lt, +mn-lt) and substitution.
   *
   * @param fontFamily Font family name from PPTX (may include theme references)
   * @returns Resolved font family name for canvas
   */
  resolveFontFamily(fontFamily: string | undefined): string {
    if (!fontFamily) {
      return this.fontScheme.minorFont;
    }

    // Handle theme font references
    // +mj-lt = Major Latin font (headings)
    // +mn-lt = Minor Latin font (body)
    // +mj-ea = Major East Asian font
    // +mn-ea = Minor East Asian font
    // +mj-cs = Major Complex Script font
    // +mn-cs = Minor Complex Script font
    if (fontFamily.startsWith('+mj-lt') || fontFamily === '+mj-lt') {
      return this.fontScheme.majorFont;
    }
    if (fontFamily.startsWith('+mn-lt') || fontFamily === '+mn-lt') {
      return this.fontScheme.minorFont;
    }
    if (fontFamily.startsWith('+mj-ea') || fontFamily === '+mj-ea') {
      return this.fontScheme.majorFontEastAsian ?? this.fontScheme.majorFont;
    }
    if (fontFamily.startsWith('+mn-ea') || fontFamily === '+mn-ea') {
      return this.fontScheme.minorFontEastAsian ?? this.fontScheme.minorFont;
    }
    if (fontFamily.startsWith('+mj-cs') || fontFamily === '+mj-cs') {
      return this.fontScheme.majorFontComplexScript ?? this.fontScheme.majorFont;
    }
    if (fontFamily.startsWith('+mn-cs') || fontFamily === '+mn-cs') {
      return this.fontScheme.minorFontComplexScript ?? this.fontScheme.minorFont;
    }

    // Return as-is for regular font names
    return fontFamily;
  }

  /**
   * Gets a font family with fallback chain for CSS/canvas use.
   *
   * @param fontFamily Primary font family name
   * @returns Comma-separated font family string with fallbacks
   */
  getFontFamilyWithFallbacks(fontFamily: string): string {
    const resolved = this.resolveFontFamily(fontFamily);
    // Always clone the array to avoid mutating the const FONT_FALLBACK_CHAINS
    const fallbacks = [...(FONT_FALLBACK_CHAINS[resolved] ?? DEFAULT_FALLBACK)];

    // Ensure the resolved font is first if not in fallback chain
    if (!fallbacks.includes(resolved)) {
      fallbacks.unshift(resolved);
    }

    // Quote font names that contain spaces
    const quoted = fallbacks.map(f =>
      f.includes(' ') ? `"${f}"` : f
    );

    return quoted.join(', ');
  }

  /**
   * Resolves complete font information for canvas rendering.
   *
   * @param fontFamily Font family name (may include theme refs)
   * @param sizePoints Font size in points
   * @param bold Whether the font should be bold
   * @param italic Whether the font should be italic
   * @returns Complete resolved font information
   */
  resolveFont(
    fontFamily: string | undefined,
    sizePoints: number,
    bold: boolean = false,
    italic: boolean = false
  ): ResolvedFont {
    const family = this.getFontFamilyWithFallbacks(fontFamily ?? this.fontScheme.minorFont);

    // Build canvas font string: "bold italic 12pt Arial"
    const parts: string[] = [];
    if (bold) parts.push('bold');
    if (italic) parts.push('italic');
    parts.push(`${sizePoints}pt`);
    parts.push(family);

    return {
      family,
      sizePoints,
      bold,
      italic,
      fontString: parts.join(' '),
    };
  }

  /**
   * Measures text using the specified font.
   *
   * @param ctx Canvas 2D context
   * @param text Text to measure
   * @param font Resolved font information
   * @returns Width of the text in pixels
   */
  measureText(ctx: CanvasRenderingContext2D, text: string, font: ResolvedFont): number {
    ctx.save();
    ctx.font = font.fontString;
    const metrics = ctx.measureText(text);
    ctx.restore();
    return metrics.width;
  }

  /**
   * Gets font metrics for the specified font.
   * Results are cached for performance.
   *
   * @param ctx Canvas 2D context
   * @param font Resolved font information
   * @returns Font metrics
   */
  getFontMetrics(ctx: CanvasRenderingContext2D, font: ResolvedFont): FontMetrics {
    const cacheKey = font.fontString;
    const cached = this.metricsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    ctx.save();
    ctx.font = font.fontString;

    // Measure using canvas text metrics
    const metrics = ctx.measureText('Mgy');

    // Get ascent and descent from canvas metrics
    // Note: Some canvas implementations may not support all metrics
    const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent ?? font.sizePoints * 0.8;
    const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent ?? font.sizePoints * 0.2;

    // Measure 'M' width for em-based calculations
    const emMetrics = ctx.measureText('M');
    const emWidth = emMetrics.width;

    // Measure average character width using a sample string
    const avgMetrics = ctx.measureText('abcdefghijklmnopqrstuvwxyz');
    const avgCharWidth = avgMetrics.width / 26;

    ctx.restore();

    const result: FontMetrics = {
      ascent,
      descent,
      lineHeight: ascent + descent,
      emWidth,
      avgCharWidth,
    };

    this.metricsCache.set(cacheKey, result);
    this.logger.debug('Computed font metrics', {
      font: font.fontString,
      ascent,
      descent,
      lineHeight: result.lineHeight,
    });

    return result;
  }

  /**
   * Calculates line height based on font size and line spacing.
   *
   * @param fontSizePoints Font size in points
   * @param lineSpacingPercent Line spacing as percentage (100 = single, 200 = double)
   * @returns Line height in points
   */
  calculateLineHeight(fontSizePoints: number, lineSpacingPercent: number = 100): number {
    // Standard line height is approximately 1.2x font size
    // Line spacing percentage modifies this
    const baseLineHeight = fontSizePoints * 1.2;
    return baseLineHeight * (lineSpacingPercent / 100);
  }

  /**
   * Clears the metrics cache.
   */
  clearCache(): void {
    this.metricsCache.clear();
  }
}

/**
 * Creates a FontResolver with the given font scheme.
 */
export function createFontResolver(
  fontScheme: ResolvedFontScheme = DEFAULT_FONT_SCHEME,
  logger?: ILogger
): FontResolver {
  return new FontResolver({ fontScheme, logger });
}
