/**
 * Text layout engine for measuring and positioning text within bounds.
 * Handles paragraph properties, alignment, spacing, and indentation.
 */

import type { CanvasRenderingContext2D } from 'skia-canvas';
import type { Rect, Rgba } from '../types/geometry.js';
import type { TextBody, Paragraph, TextRun, ParagraphProperties, TextRunProperties, TextBodyProperties, BulletConfig } from '../types/elements.js';
import type { ResolvedFontScheme } from '../types/theme.js';
import { FontResolver, type ResolvedFont, type FontMetrics } from './FontResolver.js';
import { WordWrapper, type WrappedLine, type WrapMode, type TextFragment } from './WordWrapper.js';
import { BulletFormatter, type BulletProps, type FormattedBullet } from './BulletFormatter.js';
import { emuToPixels, fontSizeToPoints } from '../core/UnitConverter.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * A positioned text run ready for rendering.
 */
export interface PositionedTextRun {
  /** Text content */
  text: string;
  /** X position in pixels */
  x: number;
  /** Y position (baseline) in pixels */
  y: number;
  /** Width of the text in pixels (pre-measured during layout) */
  width: number;
  /** Font for rendering */
  font: ResolvedFont;
  /** Text color */
  color: Rgba;
  /** Whether text is underlined */
  underline?: boolean;
  /** Whether text has strikethrough */
  strikethrough?: boolean;
  /** Baseline offset for super/subscript (percentage) */
  baselineOffset?: number;
}

/**
 * A positioned bullet ready for rendering.
 */
export interface PositionedBullet {
  /** Bullet text */
  text: string;
  /** X position in pixels */
  x: number;
  /** Y position (baseline) in pixels */
  y: number;
  /** Font for rendering */
  font: ResolvedFont;
  /** Bullet color (undefined = use text color) */
  color?: Rgba;
}

/**
 * A laid out line of text.
 */
export interface LayoutLine {
  /** Positioned text runs in this line */
  runs: PositionedTextRun[];
  /** Bullet for this line (if any, only first line of paragraph) */
  bullet?: PositionedBullet;
  /** Line Y position (top of line) in pixels */
  y: number;
  /** Line height in pixels */
  height: number;
  /** Total width of line content in pixels */
  width: number;
}

/**
 * Complete text layout result.
 */
export interface TextLayout {
  /** All laid out lines */
  lines: LayoutLine[];
  /** Total height of text content in pixels */
  totalHeight: number;
  /** Maximum width of any line in pixels */
  maxWidth: number;
  /** Bounds used for layout */
  bounds: Rect;
}

/**
 * Configuration for TextLayoutEngine.
 */
export interface TextLayoutEngineConfig {
  /** Font scheme from theme */
  fontScheme: ResolvedFontScheme;
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Default text color.
 */
const DEFAULT_TEXT_COLOR: Rgba = { r: 0, g: 0, b: 0, a: 255 };

/**
 * Default font size in hundredths of a point.
 */
const DEFAULT_FONT_SIZE = 1800; // 18pt

/**
 * Default insets in EMU.
 */
const DEFAULT_INSET_EMU = 91440; // 0.1 inch

/**
 * Text layout engine for measuring and positioning text.
 */
export class TextLayoutEngine {
  private readonly logger: ILogger;
  private readonly fontResolver: FontResolver;
  private readonly wordWrapper: WordWrapper;
  private readonly bulletFormatter: BulletFormatter;

  constructor(config: TextLayoutEngineConfig) {
    this.logger = config.logger ?? createLogger('warn', 'TextLayoutEngine');
    this.fontResolver = new FontResolver({
      fontScheme: config.fontScheme,
      logger: this.logger.child?.('FontResolver'),
    });
    this.wordWrapper = new WordWrapper({
      fontResolver: this.fontResolver,
      logger: this.logger.child?.('WordWrapper'),
    });
    this.bulletFormatter = new BulletFormatter({
      logger: this.logger.child?.('BulletFormatter'),
    });
  }

  /**
   * Lays out text within the specified bounds.
   *
   * @param ctx Canvas 2D context for text measurement
   * @param textBody Text body to lay out
   * @param shapeBounds Shape bounds in pixels
   * @param scaleX Horizontal scale factor
   * @param scaleY Vertical scale factor
   * @returns Complete text layout
   */
  layoutText(
    ctx: CanvasRenderingContext2D,
    textBody: TextBody,
    shapeBounds: Rect,
    scaleX: number,
    scaleY: number
  ): TextLayout {
    const bodyProps = textBody.bodyProperties ?? {};

    // Calculate text area with insets
    const textBounds = this.calculateTextBounds(shapeBounds, bodyProps, scaleX, scaleY);

    // Determine wrap mode
    const wrapMode: WrapMode = bodyProps.wrap === false ? 'none' : 'word';

    // Layout each paragraph
    const lines: LayoutLine[] = [];
    let currentY = textBounds.y;
    let paragraphBulletIndex = 0;

    for (let paraIdx = 0; paraIdx < textBody.paragraphs.length; paraIdx++) {
      const paragraph = textBody.paragraphs[paraIdx];
      if (!paragraph) continue;

      const paraProps = paragraph.properties ?? {};

      // Get space before
      const spaceBefore = this.getSpacingPixels(paraProps.spaceBefore, scaleY);
      if (paraIdx > 0) {
        currentY += spaceBefore;
      }

      // Layout paragraph
      const paragraphLines = this.layoutParagraph(
        ctx,
        paragraph,
        textBounds,
        wrapMode,
        paragraphBulletIndex,
        scaleX,
        scaleY
      );

      // Position lines
      for (let lineIdx = 0; lineIdx < paragraphLines.length; lineIdx++) {
        const line = paragraphLines[lineIdx];
        if (!line) continue;

        // Apply horizontal alignment
        const alignedLine = this.applyHorizontalAlignment(
          line,
          textBounds,
          paraProps.alignment ?? 'left'
        );

        // Calculate the Y offset to convert from paragraph-relative to absolute
        const yOffset = currentY - line.y;

        // Update line and all runs/bullets to absolute Y positions
        alignedLine.y = currentY;
        for (const run of alignedLine.runs) {
          run.y += yOffset;
        }
        if (alignedLine.bullet) {
          alignedLine.bullet.y += yOffset;
        }

        lines.push(alignedLine);
        currentY += alignedLine.height;
      }

      // Get space after
      const spaceAfter = this.getSpacingPixels(paraProps.spaceAfter, scaleY);
      currentY += spaceAfter;

      // Track bullet index for numbered lists
      if (paraProps.bullet && paraProps.bullet.type !== 'none') {
        paragraphBulletIndex++;
      } else {
        paragraphBulletIndex = 0;
      }
    }

    // Apply vertical alignment
    const totalTextHeight = currentY - textBounds.y;
    const verticalOffset = this.calculateVerticalOffset(
      totalTextHeight,
      textBounds.height,
      bodyProps.anchor ?? 'top'
    );

    // Shift all lines by vertical offset
    for (const line of lines) {
      line.y += verticalOffset;
      for (const run of line.runs) {
        run.y += verticalOffset;
      }
      if (line.bullet) {
        line.bullet.y += verticalOffset;
      }
    }

    const maxWidth = Math.max(0, ...lines.map(l => l.width));

    this.logger.debug('Laid out text', {
      paragraphCount: textBody.paragraphs.length,
      lineCount: lines.length,
      totalHeight: totalTextHeight,
      maxWidth,
    });

    return {
      lines,
      totalHeight: totalTextHeight,
      maxWidth,
      bounds: textBounds,
    };
  }

  /**
   * Calculates text bounds with insets applied.
   */
  private calculateTextBounds(
    shapeBounds: Rect,
    bodyProps: TextBodyProperties,
    scaleX: number,
    scaleY: number
  ): Rect {
    const leftInset = emuToPixels(bodyProps.leftInset ?? DEFAULT_INSET_EMU) * scaleX;
    const rightInset = emuToPixels(bodyProps.rightInset ?? DEFAULT_INSET_EMU) * scaleX;
    const topInset = emuToPixels(bodyProps.topInset ?? DEFAULT_INSET_EMU) * scaleY;
    const bottomInset = emuToPixels(bodyProps.bottomInset ?? DEFAULT_INSET_EMU) * scaleY;

    return {
      x: shapeBounds.x + leftInset,
      y: shapeBounds.y + topInset,
      width: Math.max(0, shapeBounds.width - leftInset - rightInset),
      height: Math.max(0, shapeBounds.height - topInset - bottomInset),
    };
  }

  /**
   * Lays out a single paragraph.
   */
  private layoutParagraph(
    ctx: CanvasRenderingContext2D,
    paragraph: Paragraph,
    textBounds: Rect,
    wrapMode: WrapMode,
    bulletIndex: number,
    scaleX: number,
    scaleY: number
  ): LayoutLine[] {
    const paraProps = paragraph.properties ?? {};

    // Calculate indentation
    const level = paraProps.level ?? 0;
    const marginLeft = emuToPixels(paraProps.marginLeft ?? 0) * scaleX;
    const indent = emuToPixels(paraProps.indent ?? 0) * scaleX;
    const bulletIndent = this.bulletFormatter.calculateBulletIndent(level);
    const totalLeftMargin = marginLeft + emuToPixels(bulletIndent) * scaleX;

    // Get bullet
    const bulletProps = this.convertBulletConfig(paraProps.bullet);
    const bullet = this.bulletFormatter.formatBullet(bulletProps, bulletIndex, level);

    // Build text fragments from runs
    const fragments = this.buildFragments(paragraph, paraProps);

    // Get default font metrics for line height calculation
    const defaultFont = this.getDefaultFont(paraProps);
    const metrics = this.fontResolver.getFontMetrics(ctx, defaultFont);

    // Calculate line spacing
    const lineSpacingPercent = paraProps.lineSpacing !== undefined
      ? paraProps.lineSpacing / 1000 // Convert from 100000 = 100% format
      : 100;
    const lineHeight = this.fontResolver.calculateLineHeight(defaultFont.sizePoints, lineSpacingPercent) * scaleY;

    // Calculate available width for text
    const availableWidth = textBounds.width - totalLeftMargin - indent;

    // Wrap text
    const wrapResult = this.wordWrapper.wrapText(
      ctx,
      fragments,
      availableWidth,
      wrapMode,
      lineHeight
    );

    // Convert wrapped lines to layout lines
    const layoutLines: LayoutLine[] = [];
    let currentY = 0;

    for (let lineIdx = 0; lineIdx < wrapResult.lines.length; lineIdx++) {
      const wrappedLine = wrapResult.lines[lineIdx];
      if (!wrappedLine) continue;

      // Calculate X position (first line has different indent)
      const isFirstLine = lineIdx === 0;
      const lineIndent = isFirstLine ? indent : 0;
      let xPos = textBounds.x + totalLeftMargin + lineIndent;

      // Position text runs
      const positionedRuns: PositionedTextRun[] = [];

      for (const fragment of wrappedLine.fragments) {
        const runProps = (fragment as TextFragment & { runProps?: TextRunProperties }).runProps;
        const color = runProps?.color ?? DEFAULT_TEXT_COLOR;
        // Use pre-computed width from layout, fallback to measuring only if needed
        const fragmentWidth = fragment.width ?? this.fontResolver.measureText(ctx, fragment.text, fragment.font);

        positionedRuns.push({
          text: fragment.text,
          x: xPos,
          y: currentY + metrics.ascent,
          width: fragmentWidth,
          font: fragment.font,
          color,
          underline: runProps?.underline,
          strikethrough: runProps?.strikethrough,
          baselineOffset: runProps?.baseline,
        });

        xPos += fragmentWidth;
      }

      // Add bullet to first line
      let positionedBullet: PositionedBullet | undefined;
      if (isFirstLine && bullet) {
        const bulletFont = this.fontResolver.resolveFont(
          bullet.font ?? defaultFont.family,
          defaultFont.sizePoints * bullet.sizeMultiplier,
          defaultFont.bold,
          defaultFont.italic
        );

        // Bullet color: use explicit bullet color, or inherit from first text run, or default text color
        const firstRunColor = positionedRuns[0]?.color;
        const bulletColor = bullet.color ?? firstRunColor;

        positionedBullet = {
          text: bullet.text,
          x: textBounds.x + totalLeftMargin - emuToPixels(457200) * scaleX, // Bullet position before text
          y: currentY + metrics.ascent,
          font: bulletFont,
          color: bulletColor,
        };
      }

      layoutLines.push({
        runs: positionedRuns,
        bullet: positionedBullet,
        y: currentY,
        height: lineHeight,
        width: wrappedLine.width,
      });

      currentY += lineHeight;
    }

    return layoutLines;
  }

  /**
   * Builds text fragments from paragraph runs.
   */
  private buildFragments(
    paragraph: Paragraph,
    paraProps: ParagraphProperties
  ): (TextFragment & { runProps?: TextRunProperties })[] {
    const fragments: (TextFragment & { runProps?: TextRunProperties })[] = [];

    for (const run of paragraph.runs) {
      const runProps = run.properties ?? {};
      const mergedProps = this.mergeRunProperties(paraProps.defaultRunProperties, runProps);

      const fontSize = fontSizeToPoints(mergedProps.fontSize ?? DEFAULT_FONT_SIZE);
      const font = this.fontResolver.resolveFont(
        mergedProps.fontFamily,
        fontSize,
        mergedProps.bold ?? false,
        mergedProps.italic ?? false
      );

      fragments.push({
        text: run.text,
        font,
        runProps: mergedProps,
      });
    }

    return fragments;
  }

  /**
   * Merges default run properties with specific run properties.
   */
  private mergeRunProperties(
    defaults: TextRunProperties | undefined,
    specific: TextRunProperties | undefined
  ): TextRunProperties {
    return {
      fontSize: specific?.fontSize ?? defaults?.fontSize,
      fontFamily: specific?.fontFamily ?? defaults?.fontFamily,
      bold: specific?.bold ?? defaults?.bold,
      italic: specific?.italic ?? defaults?.italic,
      underline: specific?.underline ?? defaults?.underline,
      strikethrough: specific?.strikethrough ?? defaults?.strikethrough,
      color: specific?.color ?? defaults?.color,
      baseline: specific?.baseline ?? defaults?.baseline,
      spacing: specific?.spacing ?? defaults?.spacing,
    };
  }

  /**
   * Converts BulletConfig to BulletProps.
   */
  private convertBulletConfig(config: BulletConfig | undefined): BulletProps | undefined {
    if (!config || config.type === 'none') {
      return undefined;
    }

    return {
      type: config.type === 'auto' ? 'autoNum' : config.type === 'picture' ? 'blip' : config.type,
      char: config.char,
      autoNumType: config.autoNumType as BulletProps['autoNumType'],
      startAt: config.startAt,
      color: config.color,
      sizePercent: config.sizePercent,
      font: config.font,
    };
  }

  /**
   * Gets spacing in pixels from EMU value.
   */
  private getSpacingPixels(spacingEmu: number | undefined, scaleY: number): number {
    if (spacingEmu === undefined) return 0;
    return emuToPixels(spacingEmu) * scaleY;
  }

  /**
   * Gets the default font for a paragraph.
   */
  private getDefaultFont(paraProps: ParagraphProperties): ResolvedFont {
    const defaultProps = paraProps.defaultRunProperties ?? {};
    const fontSize = fontSizeToPoints(defaultProps.fontSize ?? DEFAULT_FONT_SIZE);

    return this.fontResolver.resolveFont(
      defaultProps.fontFamily,
      fontSize,
      defaultProps.bold ?? false,
      defaultProps.italic ?? false
    );
  }

  /**
   * Applies horizontal alignment to a layout line.
   */
  private applyHorizontalAlignment(
    line: LayoutLine,
    textBounds: Rect,
    alignment: 'left' | 'center' | 'right' | 'justify' | 'distributed'
  ): LayoutLine {
    if (alignment === 'left' || line.runs.length === 0) {
      return line;
    }

    const availableWidth = textBounds.width;
    const contentWidth = line.width;
    let offsetX = 0;

    switch (alignment) {
      case 'center':
        offsetX = (availableWidth - contentWidth) / 2;
        break;
      case 'right':
        offsetX = availableWidth - contentWidth;
        break;
      case 'justify':
      case 'distributed':
        // For justify/distributed, we would need to adjust spacing between words
        // For now, just left-align
        this.logger.debug('justify/distributed alignment not yet implemented, using left-align');
        break;
    }

    if (offsetX !== 0) {
      for (const run of line.runs) {
        run.x += offsetX;
      }
      if (line.bullet) {
        line.bullet.x += offsetX;
      }
    }

    return line;
  }

  /**
   * Calculates vertical offset for alignment.
   */
  private calculateVerticalOffset(
    contentHeight: number,
    containerHeight: number,
    anchor: 'top' | 'middle' | 'bottom'
  ): number {
    switch (anchor) {
      case 'top':
        return 0;
      case 'middle':
        return Math.max(0, (containerHeight - contentHeight) / 2);
      case 'bottom':
        return Math.max(0, containerHeight - contentHeight);
      default:
        return 0;
    }
  }

  /**
   * Gets the font resolver for external use.
   */
  getFontResolver(): FontResolver {
    return this.fontResolver;
  }

  /**
   * Gets the bullet formatter for external use.
   */
  getBulletFormatter(): BulletFormatter {
    return this.bulletFormatter;
  }
}

/**
 * Creates a TextLayoutEngine instance.
 */
export function createTextLayoutEngine(
  fontScheme: ResolvedFontScheme,
  logger?: ILogger
): TextLayoutEngine {
  return new TextLayoutEngine({ fontScheme, logger });
}
