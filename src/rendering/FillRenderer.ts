/**
 * Renders fills (solid, gradient, pattern, picture) to canvas context.
 */

import type { CanvasRenderingContext2D, Canvas } from 'skia-canvas';
import type { Rgba, Rect, Path } from '../types/geometry.js';
import type { Fill, SolidFill, GradientFill, GradientStop, PictureFill } from '../types/elements.js';
import type { ResolvedTheme } from '../types/theme.js';
import type { PptxXmlNode } from '../core/PptxParser.js';
import { getXmlChild, getXmlChildren, getXmlAttr } from '../core/PptxParser.js';
import { ColorResolver } from '../theme/ColorResolver.js';
import { percentageToDecimal } from '../core/UnitConverter.js';
import { applyPathToContext } from '../geometry/PathBuilder.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';
import type { ImageRenderer, CropRect, TileInfo } from './ImageRenderer.js';

/**
 * Extended picture fill with parsed source rect and tile info.
 * Note: CropRect fields use OpenXML percentage format (0-100000 = 0-100%),
 * which is distinct from geometry.Rect that uses pixel coordinates.
 */
export interface ExtendedPictureFill extends PictureFill {
  /** Source rectangle for cropping (percentage-based, parsed from blipFill) */
  srcRect?: CropRect;
  /** Tile info (parsed from blipFill) */
  tile?: TileInfo;
  /** Fill rectangle for stretch mode (percentage-based) */
  fillRect?: CropRect;
  /** Whether stretch mode is enabled */
  stretch?: boolean;
  /** The raw blipFill node for ImageRenderer */
  blipFillNode?: PptxXmlNode;
}

/**
 * Configuration for FillRenderer.
 */
export interface FillRendererConfig {
  /** Resolved theme for color resolution */
  theme: ResolvedTheme;
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Renders fills for shapes.
 */
export class FillRenderer {
  private readonly logger: ILogger;
  private readonly colorResolver: ColorResolver;

  constructor(config: FillRendererConfig) {
    this.logger = config.logger ?? createLogger('warn', 'FillRenderer');
    this.colorResolver = new ColorResolver(config.theme.colors);
  }

  /**
   * Renders a fill to the canvas for the given path.
   * For picture fills, use renderFillAsync instead.
   * @param ctx Canvas 2D context
   * @param path Path to fill
   * @param fill Fill definition
   * @param bounds Bounding rectangle of the shape
   */
  renderFill(
    ctx: CanvasRenderingContext2D,
    path: Path,
    fill: Fill,
    bounds: Rect
  ): void {
    if (fill.type === 'none') {
      return;
    }

    ctx.save();

    // Apply path as clip region
    applyPathToContext(ctx, path, true);

    switch (fill.type) {
      case 'solid':
        this.renderSolidFill(ctx, fill as SolidFill);
        break;
      case 'gradient':
        this.renderGradientFill(ctx, fill as GradientFill, bounds);
        break;
      case 'pattern':
        // Pattern fills are complex - fallback to solid with foreground color
        this.logger.debug('Pattern fill rendered as solid (patterns not fully implemented)');
        ctx.fillStyle = this.colorResolver.rgbaToCss(fill.foregroundColor);
        ctx.fill();
        break;
      case 'picture':
        // Picture fills require async rendering - log a warning if called synchronously
        this.logger.debug('Picture fill requires async rendering, use renderFillAsync');
        break;
    }

    ctx.restore();
  }

  /**
   * Renders a fill to the canvas for the given path, with async support for picture fills.
   * @param ctx Canvas 2D context
   * @param path Path to fill
   * @param fill Fill definition
   * @param bounds Bounding rectangle of the shape
   * @param imageRenderer Optional ImageRenderer for picture fills
   */
  async renderFillAsync(
    ctx: CanvasRenderingContext2D,
    path: Path,
    fill: Fill,
    bounds: Rect,
    imageRenderer?: ImageRenderer
  ): Promise<void> {
    if (fill.type === 'none') {
      return;
    }

    ctx.save();

    // Apply path as clip region
    applyPathToContext(ctx, path, true);

    switch (fill.type) {
      case 'solid':
        this.renderSolidFill(ctx, fill as SolidFill);
        break;
      case 'gradient':
        this.renderGradientFill(ctx, fill as GradientFill, bounds);
        break;
      case 'pattern':
        this.logger.debug('Pattern fill rendered as solid (patterns not fully implemented)');
        ctx.fillStyle = this.colorResolver.rgbaToCss(fill.foregroundColor);
        ctx.fill();
        break;
      case 'picture':
        await this.renderPictureFill(ctx, fill as ExtendedPictureFill, bounds, imageRenderer);
        break;
    }

    ctx.restore();
  }

  /**
   * Renders a picture fill.
   * Delegates all parsing and rendering to ImageRenderer.
   */
  private async renderPictureFill(
    ctx: CanvasRenderingContext2D,
    fill: ExtendedPictureFill,
    bounds: Rect,
    imageRenderer?: ImageRenderer
  ): Promise<void> {
    if (!imageRenderer) {
      this.logger.warn('Picture fill requires ImageRenderer');
      return;
    }

    if (!fill.blipFillNode) {
      this.logger.warn('Picture fill has no blipFillNode');
      return;
    }

    try {
      // Delegate to ImageRenderer for parsing and rendering
      await imageRenderer.renderPictureFill(ctx, fill.blipFillNode, bounds);

      this.logger.debug('Rendered picture fill', {
        relId: fill.relationshipId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to render picture fill', { error: message });
    }
  }

  /**
   * Renders a solid fill.
   */
  private renderSolidFill(
    ctx: CanvasRenderingContext2D,
    fill: SolidFill
  ): void {
    ctx.fillStyle = this.colorResolver.rgbaToCss(fill.color);
    ctx.fill();
    this.logger.debug('Rendered solid fill', {
      color: this.colorResolver.rgbaToHex(fill.color),
    });
  }

  /**
   * Renders a gradient fill.
   */
  private renderGradientFill(
    ctx: CanvasRenderingContext2D,
    fill: GradientFill,
    bounds: Rect
  ): void {
    if (!fill.stops || fill.stops.length < 2) {
      // Need at least 2 stops for a gradient
      if (fill.stops?.length === 1 && fill.stops[0]) {
        ctx.fillStyle = this.colorResolver.rgbaToCss(fill.stops[0].color);
        ctx.fill();
      }
      return;
    }

    let gradient: CanvasGradient;

    if (fill.isRadial) {
      gradient = this.createRadialGradient(ctx, bounds, fill);
    } else {
      gradient = this.createLinearGradient(ctx, bounds, fill);
    }

    // Add color stops
    for (const stop of fill.stops) {
      gradient.addColorStop(stop.position, this.colorResolver.rgbaToCss(stop.color));
    }

    ctx.fillStyle = gradient;
    ctx.fill();

    this.logger.debug('Rendered gradient fill', {
      type: fill.isRadial ? 'radial' : 'linear',
      angle: fill.angle,
      stopCount: fill.stops.length,
    });
  }

  /**
   * Creates a linear gradient for the given bounds and fill.
   */
  private createLinearGradient(
    ctx: CanvasRenderingContext2D,
    bounds: Rect,
    fill: GradientFill
  ): CanvasGradient {
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    // Calculate diagonal length to ensure gradient covers entire shape
    const diagonal = Math.sqrt(bounds.width * bounds.width + bounds.height * bounds.height) / 2;

    // Adjust angle: PowerPoint uses 0 = up, 90 = right, 180 = down, 270 = left
    const adjustedAngle = ((90 - (fill.angle ?? 0)) * Math.PI) / 180;

    const x0 = centerX - Math.cos(adjustedAngle) * diagonal;
    const y0 = centerY - Math.sin(adjustedAngle) * diagonal;
    const x1 = centerX + Math.cos(adjustedAngle) * diagonal;
    const y1 = centerY + Math.sin(adjustedAngle) * diagonal;

    return ctx.createLinearGradient(x0, y0, x1, y1);
  }

  /**
   * Creates a radial gradient for the given bounds and fill.
   */
  private createRadialGradient(
    ctx: CanvasRenderingContext2D,
    bounds: Rect,
    fill: GradientFill
  ): CanvasGradient {
    const centerX = bounds.x + bounds.width * (fill.centerX ?? 0.5);
    const centerY = bounds.y + bounds.height * (fill.centerY ?? 0.5);
    const radius = Math.max(bounds.width, bounds.height) / 2;

    return ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  }

  /**
   * Parses fill properties from a shape properties node.
   * @param spPr Shape properties node
   * @returns Parsed fill or undefined if no fill specified
   */
  parseFill(spPr: PptxXmlNode | undefined): Fill | undefined {
    if (!spPr) return undefined;

    // Check for no fill
    if (getXmlChild(spPr, 'a:noFill')) {
      return { type: 'none' };
    }

    // Check for solid fill
    const solidFill = getXmlChild(spPr, 'a:solidFill');
    if (solidFill) {
      return this.parseSolidFill(solidFill);
    }

    // Check for gradient fill
    const gradFill = getXmlChild(spPr, 'a:gradFill');
    if (gradFill) {
      return this.parseGradientFill(gradFill);
    }

    // Check for pattern fill
    const pattFill = getXmlChild(spPr, 'a:pattFill');
    if (pattFill) {
      return this.parsePatternFill(pattFill);
    }

    // Check for picture fill (blipFill)
    const blipFill = getXmlChild(spPr, 'a:blipFill');
    if (blipFill) {
      return this.parsePictureFill(blipFill);
    }

    return undefined;
  }

  /**
   * Parses a solid fill element.
   */
  private parseSolidFill(solidFill: PptxXmlNode): SolidFill | undefined {
    const color = this.colorResolver.resolveColorElement(solidFill);
    if (!color) return undefined;

    return {
      type: 'solid',
      color,
    };
  }

  /**
   * Parses a gradient fill element.
   */
  private parseGradientFill(gradFill: PptxXmlNode): GradientFill | undefined {
    const stops: GradientStop[] = [];

    // Get gradient stops
    const gsLst = getXmlChild(gradFill, 'a:gsLst');
    if (gsLst) {
      const gsNodes = getXmlChildren(gsLst, 'a:gs');
      for (const gs of gsNodes) {
        const pos = getXmlAttr(gs, 'pos');
        const position = pos !== undefined ? percentageToDecimal(parseInt(pos, 10)) : 0;
        const color = this.colorResolver.resolveColorElement(gs);

        if (color) {
          stops.push({ position, color });
        }
      }
    }

    if (stops.length < 2) {
      return undefined;
    }

    // Sort stops by position
    stops.sort((a, b) => a.position - b.position);

    // Check for linear gradient
    const lin = getXmlChild(gradFill, 'a:lin');
    if (lin) {
      const ang = getXmlAttr(lin, 'ang');
      const angle = ang !== undefined ? parseInt(ang, 10) / 60000 : 0;
      return {
        type: 'gradient',
        stops,
        angle,
        isRadial: false,
      };
    }

    // Check for path/radial gradient
    const path = getXmlChild(gradFill, 'a:path');
    if (path) {
      const fillToRect = getXmlChild(path, 'a:fillToRect');
      let centerX = 0.5;
      let centerY = 0.5;

      if (fillToRect) {
        const l = getXmlAttr(fillToRect, 'l');
        const t = getXmlAttr(fillToRect, 't');
        const r = getXmlAttr(fillToRect, 'r');
        const b = getXmlAttr(fillToRect, 'b');

        const left = l !== undefined ? percentageToDecimal(parseInt(l, 10)) : 0;
        const top = t !== undefined ? percentageToDecimal(parseInt(t, 10)) : 0;
        const right = r !== undefined ? percentageToDecimal(parseInt(r, 10)) : 1;
        const bottom = b !== undefined ? percentageToDecimal(parseInt(b, 10)) : 1;

        centerX = (left + right) / 2;
        centerY = (top + bottom) / 2;
      }

      // Reverse stops for radial (OpenXML radial goes edge to center)
      const reversedStops = stops
        .map((s) => ({ position: 1 - s.position, color: s.color }))
        .sort((a, b) => a.position - b.position);

      return {
        type: 'gradient',
        stops: reversedStops,
        isRadial: true,
        centerX,
        centerY,
      };
    }

    // Default to horizontal linear gradient
    return {
      type: 'gradient',
      stops,
      angle: 0,
      isRadial: false,
    };
  }

  /**
   * Parses a pattern fill element.
   */
  private parsePatternFill(pattFill: PptxXmlNode): Fill {
    // Get foreground and background colors
    const fgClr = getXmlChild(pattFill, 'a:fgClr');
    const bgClr = getXmlChild(pattFill, 'a:bgClr');

    const foregroundColor = fgClr
      ? this.colorResolver.resolveColorElement(fgClr) ?? { r: 0, g: 0, b: 0, a: 255 }
      : { r: 0, g: 0, b: 0, a: 255 };
    const backgroundColor = bgClr
      ? this.colorResolver.resolveColorElement(bgClr) ?? { r: 255, g: 255, b: 255, a: 255 }
      : { r: 255, g: 255, b: 255, a: 255 };

    const preset = getXmlAttr(pattFill, 'prst') ?? 'solid';

    return {
      type: 'pattern',
      preset,
      foregroundColor,
      backgroundColor,
    };
  }

  /**
   * Parses a picture fill element.
   * Note: Full parsing of srcRect, tile, fillRect is deferred to ImageRenderer
   * which will parse the blipFillNode when rendering. This avoids duplicate parsing logic.
   */
  private parsePictureFill(blipFill: PptxXmlNode): ExtendedPictureFill {
    const blip = getXmlChild(blipFill, 'a:blip');
    const embedId = blip ? getXmlAttr(blip, 'r:embed') ?? '' : '';

    // Store the blipFillNode - ImageRenderer.parseBlipFill() will handle
    // the detailed parsing of srcRect, tile, fillRect, and stretch settings
    return {
      type: 'picture',
      relationshipId: embedId,
      blipFillNode: blipFill,
    };
  }

  /**
   * Gets fill style string for a solid color (utility method).
   */
  getFillStyle(color: Rgba): string {
    return this.colorResolver.rgbaToCss(color);
  }
}

/**
 * Default fill renderer factory.
 */
export function createFillRenderer(theme: ResolvedTheme, logger?: ILogger): FillRenderer {
  return new FillRenderer({ theme, logger });
}
