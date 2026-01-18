/**
 * Main text rendering to canvas.
 * Uses TextLayoutEngine for positioning and renders text with proper styling.
 */

import type { CanvasRenderingContext2D } from 'skia-canvas';
import type { Rect, Rgba } from '../types/geometry.js';
import type { TextBody } from '../types/elements.js';
import type { ResolvedTheme } from '../types/theme.js';
import {
  TextLayoutEngine,
  type TextLayout,
  type LayoutLine,
  type PositionedTextRun,
  type PositionedBullet,
} from '../text/TextLayoutEngine.js';
import type { ResolvedFont } from '../text/FontResolver.js';
import { ColorResolver } from '../theme/ColorResolver.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Configuration for TextRenderer.
 */
export interface TextRendererConfig {
  /** Resolved theme */
  theme: ResolvedTheme;
  /** Horizontal scale factor */
  scaleX: number;
  /** Vertical scale factor */
  scaleY: number;
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Renders text to canvas.
 */
export class TextRenderer {
  private readonly logger: ILogger;
  private readonly theme: ResolvedTheme;
  private readonly scaleX: number;
  private readonly scaleY: number;
  private readonly colorResolver: ColorResolver;
  private readonly layoutEngine: TextLayoutEngine;

  constructor(config: TextRendererConfig) {
    this.logger = config.logger ?? createLogger('warn', 'TextRenderer');
    this.theme = config.theme;
    this.scaleX = config.scaleX;
    this.scaleY = config.scaleY;
    this.colorResolver = new ColorResolver(config.theme.colors);
    this.layoutEngine = new TextLayoutEngine({
      fontScheme: config.theme.fonts,
      logger: this.logger.child?.('Layout'),
    });
  }

  /**
   * Renders text body within shape bounds.
   *
   * @param ctx Canvas 2D context
   * @param textBody Text body to render
   * @param shapeBounds Shape bounds in pixels (after transform applied)
   * @param defaultColor Default text color (from shape fill contrast)
   */
  renderText(
    ctx: CanvasRenderingContext2D,
    textBody: TextBody,
    shapeBounds: Rect,
    defaultColor?: Rgba
  ): void {
    // Layout the text
    const layout = this.layoutEngine.layoutText(
      ctx,
      textBody,
      shapeBounds,
      this.scaleX,
      this.scaleY
    );

    // Check if we have text rotation
    const rotation = textBody.bodyProperties?.rotation;

    if (rotation) {
      this.renderRotatedText(ctx, layout, shapeBounds, defaultColor, rotation);
    } else {
      this.renderLayoutLines(ctx, layout.lines, defaultColor);
    }

    this.logger.debug('Rendered text', {
      lineCount: layout.lines.length,
      totalHeight: layout.totalHeight,
    });
  }

  /**
   * Renders text with rotation.
   */
  private renderRotatedText(
    ctx: CanvasRenderingContext2D,
    layout: TextLayout,
    shapeBounds: Rect,
    defaultColor: Rgba | undefined,
    rotationDegrees: number
  ): void {
    ctx.save();

    // Rotate around center of text bounds
    const centerX = layout.bounds.x + layout.bounds.width / 2;
    const centerY = layout.bounds.y + layout.bounds.height / 2;

    ctx.translate(centerX, centerY);
    ctx.rotate((rotationDegrees * Math.PI) / 180);
    ctx.translate(-centerX, -centerY);

    this.renderLayoutLines(ctx, layout.lines, defaultColor);

    ctx.restore();
  }

  /**
   * Renders all layout lines.
   */
  private renderLayoutLines(
    ctx: CanvasRenderingContext2D,
    lines: LayoutLine[],
    defaultColor: Rgba | undefined
  ): void {
    for (const line of lines) {
      // Render bullet if present
      if (line.bullet) {
        this.renderBullet(ctx, line.bullet, defaultColor);
      }

      // Render text runs
      for (const run of line.runs) {
        this.renderTextRun(ctx, run, defaultColor);
      }
    }
  }

  /**
   * Renders a single text run.
   */
  private renderTextRun(
    ctx: CanvasRenderingContext2D,
    run: PositionedTextRun,
    defaultColor: Rgba | undefined
  ): void {
    if (!run.text) return;

    ctx.save();

    // Set font
    ctx.font = run.font.fontString;

    // Set fill color
    const color = run.color ?? defaultColor ?? { r: 0, g: 0, b: 0, a: 255 };
    ctx.fillStyle = this.colorResolver.rgbaToCss(color);

    // Handle baseline offset (super/subscript)
    let y = run.y;
    if (run.baselineOffset) {
      // Baseline offset is in 1000ths of percentage
      // Positive = superscript (move up), Negative = subscript (move down)
      const offsetPercent = run.baselineOffset / 1000;
      const offsetPixels = run.font.sizePoints * offsetPercent / 100 * this.scaleY;
      y -= offsetPixels;

      // Also scale font for super/subscript
      if (Math.abs(offsetPercent) > 20) {
        const scaledSize = run.font.sizePoints * 0.6;
        const scaledFont = run.font.fontString.replace(
          `${run.font.sizePoints}pt`,
          `${scaledSize}pt`
        );
        ctx.font = scaledFont;
      }
    }

    // Draw text
    ctx.fillText(run.text, run.x, y);

    // Draw underline
    if (run.underline) {
      this.drawUnderline(ctx, run, color);
    }

    // Draw strikethrough
    if (run.strikethrough) {
      this.drawStrikethrough(ctx, run, color);
    }

    ctx.restore();
  }

  /**
   * Renders a bullet.
   */
  private renderBullet(
    ctx: CanvasRenderingContext2D,
    bullet: PositionedBullet,
    defaultColor: Rgba | undefined
  ): void {
    if (!bullet.text) return;

    ctx.save();

    // Set font
    ctx.font = bullet.font.fontString;

    // Set fill color (bullet color or default)
    const color = bullet.color ?? defaultColor ?? { r: 0, g: 0, b: 0, a: 255 };
    ctx.fillStyle = this.colorResolver.rgbaToCss(color);

    // Draw bullet
    ctx.fillText(bullet.text, bullet.x, bullet.y);

    ctx.restore();
  }

  /**
   * Draws underline decoration.
   */
  private drawUnderline(
    ctx: CanvasRenderingContext2D,
    run: PositionedTextRun,
    color: Rgba
  ): void {
    // Use pre-computed width from layout to avoid re-measuring
    const lineWidth = Math.max(1, run.font.sizePoints * 0.05 * this.scaleY);
    const offset = run.font.sizePoints * 0.1 * this.scaleY;

    ctx.strokeStyle = this.colorResolver.rgbaToCss(color);
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(run.x, run.y + offset);
    ctx.lineTo(run.x + run.width, run.y + offset);
    ctx.stroke();
  }

  /**
   * Draws strikethrough decoration.
   */
  private drawStrikethrough(
    ctx: CanvasRenderingContext2D,
    run: PositionedTextRun,
    color: Rgba
  ): void {
    // Use pre-computed width from layout to avoid re-measuring
    const lineWidth = Math.max(1, run.font.sizePoints * 0.05 * this.scaleY);
    const offset = -run.font.sizePoints * 0.3 * this.scaleY;

    ctx.strokeStyle = this.colorResolver.rgbaToCss(color);
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(run.x, run.y + offset);
    ctx.lineTo(run.x + run.width, run.y + offset);
    ctx.stroke();
  }

  /**
   * Gets the layout engine for external use.
   */
  getLayoutEngine(): TextLayoutEngine {
    return this.layoutEngine;
  }

  /**
   * Gets the color resolver for external use.
   */
  getColorResolver(): ColorResolver {
    return this.colorResolver;
  }

  /**
   * Calculates a contrasting text color based on background.
   *
   * @param backgroundColor Background color to contrast against
   * @returns Black or white, whichever provides better contrast
   */
  getContrastingColor(backgroundColor: Rgba): Rgba {
    const isDark = this.colorResolver.isDarkColor(backgroundColor);
    return isDark
      ? { r: 255, g: 255, b: 255, a: 255 }
      : { r: 0, g: 0, b: 0, a: 255 };
  }
}

/**
 * Creates a TextRenderer instance.
 */
export function createTextRenderer(
  theme: ResolvedTheme,
  scaleX: number,
  scaleY: number,
  logger?: ILogger
): TextRenderer {
  return new TextRenderer({ theme, scaleX, scaleY, logger });
}
