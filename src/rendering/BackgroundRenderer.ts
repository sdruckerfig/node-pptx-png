import type { Canvas, CanvasRenderingContext2D } from 'skia-canvas';
import type { Rgba, ResolvedTheme, GradientStop } from '../types/index.js';
import { Colors } from '../types/index.js';
import type { PptxParser, PptxXmlNode } from '../core/PptxParser.js';
import { getXmlAttr, getXmlChild, getXmlChildren } from '../core/PptxParser.js';
import { ColorResolver } from '../theme/ColorResolver.js';
import { percentageToDecimal } from '../core/UnitConverter.js';
import { RelationshipParser } from '../parsers/RelationshipParser.js';
import { ImageDecoder } from '../utils/ImageDecoder.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Background type.
 */
export type BackgroundType = 'solid' | 'gradient' | 'pattern' | 'picture' | 'none';

/**
 * Picture fill data for background images.
 */
export interface PictureFillData {
  /** Relationship ID for the embedded image */
  blipRelId: string;
  /** Source node (slide, layout, or master) where the background is defined */
  source: 'slide' | 'layout' | 'master';
}

/**
 * Parsed background fill data.
 */
export interface ParsedBackground {
  type: BackgroundType;
  color?: Rgba;
  gradientStops?: GradientStop[];
  gradientAngle?: number;
  isRadial?: boolean;
  /** Picture fill data for blipFill backgrounds */
  pictureFill?: PictureFillData;
}

/**
 * Result of resolving background from inheritance chain.
 */
interface ResolvedBackground {
  background: ParsedBackground | undefined;
  sourcePath: string;
}

/**
 * Renders slide backgrounds.
 */
export class BackgroundRenderer {
  private readonly logger: ILogger;
  private readonly colorResolver: ColorResolver;
  /** Cached RelationshipParser instance (created lazily) */
  private relationshipParser: RelationshipParser | null = null;
  /** Cached ImageDecoder instance (created lazily) */
  private imageDecoder: ImageDecoder | null = null;
  /** Cached parser reference for relationship resolution */
  private cachedParser: PptxParser | null = null;

  constructor(theme: ResolvedTheme, logger?: ILogger) {
    this.logger = logger ?? createLogger('warn', 'BackgroundRenderer');
    this.colorResolver = new ColorResolver(theme.colors);
  }

  /**
   * Renders the background for a slide.
   * Follows the inheritance chain: slide -> layout -> master
   */
  renderBackground(
    ctx: CanvasRenderingContext2D,
    canvas: Canvas,
    slideNode: PptxXmlNode,
    layoutNode?: PptxXmlNode,
    masterNode?: PptxXmlNode,
    overrideColor?: string
  ): void {
    const width = canvas.width;
    const height = canvas.height;

    // If override color is specified, use it
    if (overrideColor) {
      const color = this.colorResolver.parseHexColor(overrideColor);
      this.fillSolid(ctx, width, height, color);
      return;
    }

    // Resolve background from inheritance chain (without path tracking for sync method)
    const background = this.resolveBackgroundFromChain(slideNode, layoutNode, masterNode);

    // Render the background (sync version - no picture support)
    this.renderBackgroundFill(ctx, width, height, background, false);
  }

  /**
   * Renders the background for a slide with async support for picture backgrounds.
   * Follows the inheritance chain: slide -> layout -> master
   *
   * @param ctx Canvas 2D rendering context
   * @param canvas Canvas to render to
   * @param slideNode Slide XML node
   * @param parser PPTX parser for accessing resources
   * @param slidePath Path to the slide file (e.g., ppt/slides/slide1.xml)
   * @param layoutNode Optional layout XML node
   * @param layoutPath Optional path to the layout file (e.g., ppt/slideLayouts/slideLayout1.xml)
   * @param masterNode Optional master XML node
   * @param masterPath Optional path to the master file
   * @param overrideColor Optional background color override
   */
  async renderBackgroundAsync(
    ctx: CanvasRenderingContext2D,
    canvas: Canvas,
    slideNode: PptxXmlNode,
    parser: PptxParser,
    slidePath: string,
    layoutNode?: PptxXmlNode,
    layoutPath?: string,
    masterNode?: PptxXmlNode,
    masterPath?: string,
    overrideColor?: string
  ): Promise<void> {
    const width = canvas.width;
    const height = canvas.height;

    // If override color is specified, use it
    if (overrideColor) {
      const color = this.colorResolver.parseHexColor(overrideColor);
      this.fillSolid(ctx, width, height, color);
      return;
    }

    // Resolve background from inheritance chain with path tracking
    const { background, sourcePath } = this.resolveBackgroundFromChainWithPath(
      slideNode,
      slidePath,
      layoutNode,
      layoutPath,
      masterNode,
      masterPath
    );

    // Render the background (async version - with picture support)
    await this.renderBackgroundFillAsync(ctx, width, height, background, parser, sourcePath);
  }

  /**
   * Resolves background from the inheritance chain (slide -> layout -> master).
   * Simple version without path tracking for sync rendering.
   */
  private resolveBackgroundFromChain(
    slideNode: PptxXmlNode,
    layoutNode?: PptxXmlNode,
    masterNode?: PptxXmlNode
  ): ParsedBackground | undefined {
    // Try slide first
    let background = this.parseBackground(slideNode);
    if (background) return background;

    // Try layout
    if (layoutNode) {
      background = this.parseBackground(layoutNode);
      if (background) return background;
    }

    // Try master
    if (masterNode) {
      background = this.parseBackground(masterNode);
      if (background) return background;
    }

    return undefined;
  }

  /**
   * Resolves background from the inheritance chain with path tracking.
   * Required for async rendering to resolve picture relationships from the correct source.
   */
  private resolveBackgroundFromChainWithPath(
    slideNode: PptxXmlNode,
    slidePath: string,
    layoutNode?: PptxXmlNode,
    layoutPath?: string,
    masterNode?: PptxXmlNode,
    masterPath?: string
  ): ResolvedBackground {
    // Try slide first
    let background = this.parseBackground(slideNode);
    if (background) {
      if (background.pictureFill) {
        background.pictureFill.source = 'slide';
      }
      return { background, sourcePath: slidePath };
    }

    // Try layout
    if (layoutNode) {
      background = this.parseBackground(layoutNode);
      if (background) {
        if (background.pictureFill) {
          background.pictureFill.source = 'layout';
        }
        return { background, sourcePath: layoutPath ?? slidePath };
      }
    }

    // Try master
    if (masterNode) {
      background = this.parseBackground(masterNode);
      if (background) {
        if (background.pictureFill) {
          background.pictureFill.source = 'master';
        }
        return { background, sourcePath: masterPath ?? slidePath };
      }
    }

    return { background: undefined, sourcePath: slidePath };
  }

  /**
   * Renders background fill (sync version - no picture support).
   */
  private renderBackgroundFill(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    background: ParsedBackground | undefined,
    _supportPicture: false
  ): void {
    if (!background) {
      this.logger.debug('No background found, using white default');
      this.fillSolid(ctx, width, height, Colors.white);
      return;
    }

    switch (background.type) {
      case 'solid':
        this.fillSolid(ctx, width, height, background.color ?? Colors.white);
        break;

      case 'gradient':
        this.renderGradient(ctx, width, height, background);
        break;

      case 'pattern':
        this.logger.debug('Pattern background not yet supported, using solid');
        this.fillSolid(ctx, width, height, background.color ?? Colors.white);
        break;

      case 'picture':
        // Picture backgrounds require async rendering - this sync method falls back to white
        this.logger.debug('Picture background detected, use renderBackgroundAsync for image support');
        this.fillSolid(ctx, width, height, Colors.white);
        break;

      default:
        this.fillSolid(ctx, width, height, Colors.white);
    }
  }

  /**
   * Renders background fill (async version - with picture support).
   */
  private async renderBackgroundFillAsync(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    background: ParsedBackground | undefined,
    parser: PptxParser,
    sourcePath: string
  ): Promise<void> {
    if (!background) {
      this.logger.debug('No background found, using white default');
      this.fillSolid(ctx, width, height, Colors.white);
      return;
    }

    switch (background.type) {
      case 'solid':
        this.fillSolid(ctx, width, height, background.color ?? Colors.white);
        break;

      case 'gradient':
        this.renderGradient(ctx, width, height, background);
        break;

      case 'pattern':
        this.logger.debug('Pattern background not yet supported, using solid');
        this.fillSolid(ctx, width, height, background.color ?? Colors.white);
        break;

      case 'picture':
        if (background.pictureFill) {
          await this.fillPicture(ctx, width, height, background.pictureFill, parser, sourcePath);
        } else {
          this.fillSolid(ctx, width, height, Colors.white);
        }
        break;

      default:
        this.fillSolid(ctx, width, height, Colors.white);
    }
  }

  /**
   * Renders gradient background (shared between sync and async).
   */
  private renderGradient(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    background: ParsedBackground
  ): void {
    if (background.gradientStops && background.gradientStops.length >= 2) {
      if (background.isRadial) {
        this.fillRadialGradient(ctx, width, height, background.gradientStops);
      } else {
        this.fillLinearGradient(
          ctx,
          width,
          height,
          background.gradientStops,
          background.gradientAngle ?? 0
        );
      }
    } else {
      this.fillSolid(ctx, width, height, Colors.white);
    }
  }

  /**
   * Gets or creates the cached RelationshipParser instance.
   */
  private getRelationshipParser(parser: PptxParser): RelationshipParser {
    // Invalidate cache if parser changed
    if (this.cachedParser !== parser) {
      this.cachedParser = parser;
      this.relationshipParser = null;
    }

    if (!this.relationshipParser) {
      this.relationshipParser = new RelationshipParser({
        parser,
        logger: this.logger.child?.('RelParser'),
      });
    }
    return this.relationshipParser;
  }

  /**
   * Gets or creates the cached ImageDecoder instance.
   */
  private getImageDecoder(): ImageDecoder {
    if (!this.imageDecoder) {
      this.imageDecoder = new ImageDecoder({
        logger: this.logger.child?.('Decoder'),
      });
    }
    return this.imageDecoder;
  }

  /**
   * Fills the canvas with a picture background.
   *
   * @param ctx Canvas 2D rendering context
   * @param width Canvas width
   * @param height Canvas height
   * @param pictureFill Picture fill data
   * @param parser PPTX parser for accessing resources
   * @param sourcePath Path to the source file for relationship resolution
   */
  private async fillPicture(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    pictureFill: PictureFillData,
    parser: PptxParser,
    sourcePath: string
  ): Promise<void> {
    try {
      // Use cached RelationshipParser
      const relationshipParser = this.getRelationshipParser(parser);

      const mediaPath = await relationshipParser.resolveImageRelationship(
        sourcePath,
        pictureFill.blipRelId
      );

      if (!mediaPath) {
        this.logger.warn('Could not resolve background image relationship', {
          relId: pictureFill.blipRelId,
          source: sourcePath,
        });
        this.fillSolid(ctx, width, height, Colors.white);
        return;
      }

      // Load the image data from the PPTX
      const buffer = await parser.readBinary(mediaPath);

      // Use cached ImageDecoder
      const imageDecoder = this.getImageDecoder();
      const decoded = await imageDecoder.decode(buffer);

      // Draw the image stretched to fill the entire canvas
      ctx.drawImage(decoded.image, 0, 0, width, height);

      this.logger.debug('Filled picture background', {
        relId: pictureFill.blipRelId,
        source: pictureFill.source,
        mediaPath,
        imageWidth: decoded.width,
        imageHeight: decoded.height,
        canvasWidth: width,
        canvasHeight: height,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to load background image', {
        relId: pictureFill.blipRelId,
        error: message,
      });
      // Fallback to white background
      this.fillSolid(ctx, width, height, Colors.white);
    }
  }

  /**
   * Parses background fill from a slide/layout/master node.
   */
  private parseBackground(node: PptxXmlNode): ParsedBackground | undefined {
    // Look for cSld -> bg -> bgPr or cSld -> bg -> bgRef
    const cSld = getXmlChild(node, 'p:cSld');
    if (!cSld) return undefined;

    const bg = getXmlChild(cSld, 'p:bg');
    if (!bg) return undefined;

    // Check for background properties (explicit fill)
    const bgPr = getXmlChild(bg, 'p:bgPr');
    if (bgPr) {
      return this.parseBgProperties(bgPr);
    }

    // Check for background reference (theme style)
    const bgRef = getXmlChild(bg, 'p:bgRef');
    if (bgRef) {
      return this.parseBgReference(bgRef);
    }

    return undefined;
  }

  /**
   * Parses explicit background properties.
   */
  private parseBgProperties(bgPr: PptxXmlNode): ParsedBackground | undefined {
    // Check for solid fill
    const solidFill = getXmlChild(bgPr, 'a:solidFill');
    if (solidFill) {
      const color = this.colorResolver.resolveColorElement(solidFill);
      if (color) {
        return { type: 'solid', color };
      }
    }

    // Check for gradient fill
    const gradFill = getXmlChild(bgPr, 'a:gradFill');
    if (gradFill) {
      return this.parseGradientFill(gradFill);
    }

    // Check for pattern fill
    const pattFill = getXmlChild(bgPr, 'a:pattFill');
    if (pattFill) {
      // Get foreground color as fallback
      const fgClr = getXmlChild(pattFill, 'a:fgClr');
      const color = fgClr ? this.colorResolver.resolveColorElement(fgClr) : undefined;
      return { type: 'pattern', color };
    }

    // Check for picture fill
    const blipFill = getXmlChild(bgPr, 'a:blipFill');
    if (blipFill) {
      const blip = getXmlChild(blipFill, 'a:blip');
      const blipRelId = blip ? getXmlAttr(blip, 'r:embed') : undefined;
      if (blipRelId) {
        return {
          type: 'picture',
          pictureFill: {
            blipRelId,
            source: 'slide', // Will be updated by resolveBackgroundFromChainWithPath
          },
        };
      }
      // No valid blip reference, fallback to no fill
      return { type: 'none' };
    }

    // Check for no fill
    const noFill = getXmlChild(bgPr, 'a:noFill');
    if (noFill) {
      return { type: 'none' };
    }

    return undefined;
  }

  /**
   * Parses a background reference (theme style index).
   */
  private parseBgReference(bgRef: PptxXmlNode): ParsedBackground | undefined {
    // Background references index into theme's background fill styles
    const idx = getXmlAttr(bgRef, 'idx');

    if (idx !== undefined) {
      const styleIdx = parseInt(idx, 10);
      this.logger.debug('Background reference to theme style', { idx: styleIdx });

      // For now, we'll resolve the color if embedded in the reference
      // Full resolution would require access to theme's bgFillStyleLst
      const color = this.colorResolver.resolveColorElement(bgRef);
      if (color) {
        return { type: 'solid', color };
      }
    }

    return undefined;
  }

  /**
   * Parses gradient fill properties.
   */
  private parseGradientFill(gradFill: PptxXmlNode): ParsedBackground | undefined {
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
        gradientStops: stops,
        gradientAngle: angle,
        isRadial: false,
      };
    }

    // Check for path gradient (radial)
    const path = getXmlChild(gradFill, 'a:path');
    if (path) {
      return {
        type: 'gradient',
        gradientStops: stops,
        isRadial: true,
      };
    }

    // Default to horizontal linear gradient
    return {
      type: 'gradient',
      gradientStops: stops,
      gradientAngle: 0,
      isRadial: false,
    };
  }

  /**
   * Fills the canvas with a solid color.
   */
  private fillSolid(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    color: Rgba
  ): void {
    ctx.fillStyle = this.colorResolver.rgbaToCss(color);
    ctx.fillRect(0, 0, width, height);
    this.logger.debug('Filled solid background', { color: this.colorResolver.rgbaToHex(color) });
  }

  /**
   * Fills the canvas with a linear gradient.
   */
  private fillLinearGradient(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    stops: GradientStop[],
    angleDegrees: number
  ): void {
    // Calculate gradient start and end points
    // PowerPoint angles: 0 = up, 90 = right, 180 = down, 270 = left
    // Canvas angles: calculated from center outward
    const centerX = width / 2;
    const centerY = height / 2;

    // Calculate the diagonal length to ensure gradient covers entire canvas
    const diagonal = Math.sqrt(width * width + height * height) / 2;

    // Adjust angle (PowerPoint uses different orientation)
    const adjustedAngle = (90 - angleDegrees) * (Math.PI / 180);

    const x0 = centerX - Math.cos(adjustedAngle) * diagonal;
    const y0 = centerY - Math.sin(adjustedAngle) * diagonal;
    const x1 = centerX + Math.cos(adjustedAngle) * diagonal;
    const y1 = centerY + Math.sin(adjustedAngle) * diagonal;

    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);

    for (const stop of stops) {
      gradient.addColorStop(stop.position, this.colorResolver.rgbaToCss(stop.color));
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    this.logger.debug('Filled linear gradient background', {
      angle: angleDegrees,
      stopCount: stops.length,
    });
  }

  /**
   * Fills the canvas with a radial gradient.
   */
  private fillRadialGradient(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    stops: GradientStop[]
  ): void {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.max(width, height) / 2;

    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);

    // Radial gradients in OpenXML go from outside to center, so reverse the stops
    for (const stop of stops) {
      gradient.addColorStop(1 - stop.position, this.colorResolver.rgbaToCss(stop.color));
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    this.logger.debug('Filled radial gradient background', { stopCount: stops.length });
  }

  /**
   * Gets the background color if it's a solid fill (for contrast calculations).
   */
  getBackgroundColor(
    slideNode: PptxXmlNode,
    layoutNode?: PptxXmlNode,
    masterNode?: PptxXmlNode
  ): Rgba | undefined {
    const background = this.resolveBackgroundFromChain(slideNode, layoutNode, masterNode);

    if (background?.type === 'solid' && background.color) {
      return background.color;
    }

    // For gradient, return the first stop color
    if (background?.type === 'gradient' && background.gradientStops?.length) {
      return background.gradientStops[0]?.color;
    }

    return Colors.white;
  }
}
