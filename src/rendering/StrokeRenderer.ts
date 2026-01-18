/**
 * Renders shape outlines (strokes) to canvas context.
 * Handles line properties including width, color, dash patterns, caps, and joins.
 */

import type { CanvasRenderingContext2D } from 'skia-canvas';
import type { Rgba, Path } from '../types/geometry.js';
import type { Stroke, LineCap, LineJoin } from '../types/elements.js';
import type { ResolvedTheme } from '../types/theme.js';
import type { PptxXmlNode } from '../core/PptxParser.js';
import { getXmlChild, getXmlAttr } from '../core/PptxParser.js';
import { ColorResolver } from '../theme/ColorResolver.js';
import { UnitConverter } from '../core/UnitConverter.js';
import { applyPathToContext } from '../geometry/PathBuilder.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Default stroke width in EMU (1 point = 12700 EMU).
 */
const DEFAULT_STROKE_WIDTH_EMU = 12700;

/**
 * Preset dash patterns mapped to canvas dash arrays.
 * Values are relative to stroke width.
 */
const PRESET_DASH_PATTERNS: Record<string, number[]> = {
  solid: [],
  dot: [1, 2],
  dash: [4, 3],
  lgDash: [8, 3],
  dashDot: [4, 3, 1, 3],
  lgDashDot: [8, 3, 1, 3],
  lgDashDotDot: [8, 3, 1, 3, 1, 3],
  sysDash: [3, 1],
  sysDot: [1, 1],
  sysDashDot: [3, 1, 1, 1],
  sysDashDotDot: [3, 1, 1, 1, 1, 1],
};

/**
 * Configuration for StrokeRenderer.
 */
export interface StrokeRendererConfig {
  /** Resolved theme for color resolution */
  theme: ResolvedTheme;
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Renders strokes for shapes.
 */
export class StrokeRenderer {
  private readonly logger: ILogger;
  private readonly colorResolver: ColorResolver;
  private readonly unitConverter: UnitConverter;

  constructor(config: StrokeRendererConfig) {
    this.logger = config.logger ?? createLogger('warn', 'StrokeRenderer');
    this.colorResolver = new ColorResolver(config.theme.colors);
    this.unitConverter = new UnitConverter();
  }

  /**
   * Renders a stroke to the canvas for the given path.
   * @param ctx Canvas 2D context
   * @param path Path to stroke
   * @param stroke Stroke definition
   * @param scaleX Horizontal scale factor
   * @param scaleY Vertical scale factor
   */
  renderStroke(
    ctx: CanvasRenderingContext2D,
    path: Path,
    stroke: Stroke,
    scaleX: number,
    scaleY: number
  ): void {
    // Calculate stroke width in pixels
    const widthPixels = this.unitConverter.emuToPixels(stroke.width) * Math.min(scaleX, scaleY);

    // Skip very thin strokes
    if (widthPixels < 0.1) {
      return;
    }

    ctx.save();

    // Set stroke style
    ctx.strokeStyle = this.colorResolver.rgbaToCss(stroke.color);
    ctx.lineWidth = Math.max(widthPixels, 0.5); // Minimum width for visibility

    // Set line cap
    ctx.lineCap = this.mapLineCap(stroke.cap ?? 'flat');

    // Set line join
    ctx.lineJoin = this.mapLineJoin(stroke.join ?? 'miter');

    // Set dash pattern if specified
    if (stroke.dashPattern && stroke.dashPattern.length > 0) {
      // Scale dash pattern by stroke width
      const scaledPattern = stroke.dashPattern.map((v) => v * widthPixels);
      ctx.setLineDash(scaledPattern);
    } else {
      ctx.setLineDash([]);
    }

    // Apply path and stroke
    applyPathToContext(ctx, path, true);
    ctx.stroke();

    ctx.restore();

    this.logger.debug('Rendered stroke', {
      color: this.colorResolver.rgbaToHex(stroke.color),
      width: widthPixels.toFixed(2),
      cap: stroke.cap,
      join: stroke.join,
    });
  }

  /**
   * Parses stroke (outline) properties from a shape properties node.
   * @param spPr Shape properties node containing a:ln
   * @returns Parsed stroke or undefined if no stroke specified
   */
  parseStroke(spPr: PptxXmlNode | undefined): Stroke | undefined {
    if (!spPr) return undefined;

    const ln = getXmlChild(spPr, 'a:ln');
    if (!ln) return undefined;

    // Check for no fill on the outline
    if (getXmlChild(ln, 'a:noFill')) {
      return undefined;
    }

    // Get stroke width
    const w = getXmlAttr(ln, 'w');
    const width = w !== undefined ? parseInt(w, 10) : DEFAULT_STROKE_WIDTH_EMU;

    // Get stroke color
    const color = this.parseStrokeColor(ln);

    // Get dash pattern
    const dashPattern = this.parseDashPattern(ln);

    // Get line cap
    const cap = this.parseLineCap(ln);

    // Get line join
    const join = this.parseLineJoin(ln);

    return {
      width,
      color,
      dashPattern,
      cap,
      join,
    };
  }

  /**
   * Parses stroke color from outline element.
   */
  private parseStrokeColor(ln: PptxXmlNode): Rgba {
    // Check for solid fill
    const solidFill = getXmlChild(ln, 'a:solidFill');
    if (solidFill) {
      const color = this.colorResolver.resolveColorElement(solidFill);
      if (color) return color;
    }

    // Check for gradient fill (use first stop color)
    const gradFill = getXmlChild(ln, 'a:gradFill');
    if (gradFill) {
      const gsLst = getXmlChild(gradFill, 'a:gsLst');
      if (gsLst) {
        const gs = getXmlChild(gsLst, 'a:gs');
        if (gs) {
          const color = this.colorResolver.resolveColorElement(gs);
          if (color) return color;
        }
      }
    }

    // Default stroke color (dark gray)
    return { r: 64, g: 64, b: 64, a: 255 };
  }

  /**
   * Parses dash pattern from outline element.
   */
  private parseDashPattern(ln: PptxXmlNode): number[] | undefined {
    // Check for preset dash
    const prstDash = getXmlChild(ln, 'a:prstDash');
    if (prstDash) {
      const val = getXmlAttr(prstDash, 'val');
      if (val && PRESET_DASH_PATTERNS[val]) {
        return PRESET_DASH_PATTERNS[val];
      }
    }

    // Check for custom dash
    const custDash = getXmlChild(ln, 'a:custDash');
    if (custDash) {
      // Custom dash patterns would be parsed here
      // For now, return undefined to use solid line
      this.logger.debug('Custom dash pattern not fully supported');
    }

    return undefined;
  }

  /**
   * Parses line cap from outline element.
   */
  private parseLineCap(ln: PptxXmlNode): LineCap {
    const cap = getXmlAttr(ln, 'cap');
    switch (cap) {
      case 'rnd':
        return 'round';
      case 'sq':
        return 'square';
      case 'flat':
      default:
        return 'flat';
    }
  }

  /**
   * Parses line join from outline element.
   */
  private parseLineJoin(ln: PptxXmlNode): LineJoin {
    // Check for explicit join type
    if (getXmlChild(ln, 'a:round')) {
      return 'round';
    }
    if (getXmlChild(ln, 'a:bevel')) {
      return 'bevel';
    }
    if (getXmlChild(ln, 'a:miter')) {
      return 'miter';
    }

    return 'miter';
  }

  /**
   * Maps LineCap type to canvas lineCap value.
   */
  private mapLineCap(cap: LineCap): CanvasLineCap {
    switch (cap) {
      case 'round':
        return 'round';
      case 'square':
        return 'square';
      case 'flat':
      default:
        return 'butt';
    }
  }

  /**
   * Maps LineJoin type to canvas lineJoin value.
   */
  private mapLineJoin(join: LineJoin): CanvasLineJoin {
    switch (join) {
      case 'round':
        return 'round';
      case 'bevel':
        return 'bevel';
      case 'miter':
      default:
        return 'miter';
    }
  }

  /**
   * Gets stroke style string for a color (utility method).
   */
  getStrokeStyle(color: Rgba): string {
    return this.colorResolver.rgbaToCss(color);
  }

  /**
   * Converts EMU stroke width to pixels.
   */
  strokeWidthToPixels(widthEmu: number, scale: number): number {
    return this.unitConverter.emuToPixels(widthEmu) * scale;
  }
}

/**
 * Default stroke renderer factory.
 */
export function createStrokeRenderer(theme: ResolvedTheme, logger?: ILogger): StrokeRenderer {
  return new StrokeRenderer({ theme, logger });
}
