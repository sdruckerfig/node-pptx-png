/**
 * Renders images to canvas context.
 * Handles picture shapes (p:pic elements), blipFill for shape fills,
 * source rectangle cropping, and stretch/tile fill modes.
 */

import type { CanvasRenderingContext2D, Image } from 'skia-canvas';
import type { Rect } from '../types/geometry.js';
import type { PptxParser, PptxXmlNode } from '../core/PptxParser.js';
import { getXmlChild, getXmlAttr } from '../core/PptxParser.js';
import { RelationshipParser } from '../parsers/RelationshipParser.js';
import { ImageDecoder, type DecodedImage } from '../utils/ImageDecoder.js';
import { TransformCalculator, type PixelTransform } from '../geometry/TransformCalculator.js';
import { UnitConverter } from '../core/UnitConverter.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Crop rectangle with percentage-based values.
 * Used for image cropping in OpenXML where values represent percentages.
 * Values are in percentage units (0-100000 = 0-100%).
 *
 * Note: This is distinct from geometry.Rect which uses pixel coordinates.
 * OpenXML uses this percentage format for srcRect and fillRect in blipFill elements.
 */
export interface CropRect {
  /** Left crop percentage (0-100000 where 100000 = 100%) */
  left: number;
  /** Top crop percentage (0-100000 where 100000 = 100%) */
  top: number;
  /** Right crop percentage (0-100000 where 100000 = 100%) */
  right: number;
  /** Bottom crop percentage (0-100000 where 100000 = 100%) */
  bottom: number;
}

/**
 * Tile fill settings for repeating an image.
 */
export interface TileInfo {
  /** Horizontal scale percentage (100000 = 100%) */
  sx: number;
  /** Vertical scale percentage (100000 = 100%) */
  sy: number;
  /** Horizontal offset in EMU */
  tx: number;
  /** Vertical offset in EMU */
  ty: number;
  /** Flip mode for tiles */
  flip: 'none' | 'x' | 'y' | 'xy';
  /** Alignment anchor */
  alignment: string;
}

/**
 * Picture data parsed from p:pic or blipFill elements.
 */
export interface PictureData {
  /** Relationship ID for embedded image (r:embed) */
  blipRelId: string;
  /** Source rectangle for cropping (percentage-based, see CropRect) */
  srcRect?: CropRect;
  /** Whether to stretch the image to fill bounds */
  stretch?: boolean;
  /** Tile fill settings */
  tile?: TileInfo;
  /** Fill rectangle for stretch mode (percentage-based, see CropRect) */
  fillRect?: CropRect;
}

/**
 * Configuration for ImageRenderer.
 */
export interface ImageRendererConfig {
  /** PPTX parser instance */
  parser: PptxParser;
  /** Source file path for relationship resolution (e.g., ppt/slides/slide1.xml) */
  sourcePath: string;
  /** Horizontal scale factor (EMU to pixels) */
  scaleX: number;
  /** Vertical scale factor (EMU to pixels) */
  scaleY: number;
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Renders images from PPTX media folder to canvas.
 */
export class ImageRenderer {
  private readonly logger: ILogger;
  private readonly parser: PptxParser;
  private readonly sourcePath: string;
  private readonly scaleX: number;
  private readonly scaleY: number;
  private readonly relationshipParser: RelationshipParser;
  private readonly imageDecoder: ImageDecoder;
  private readonly transformCalculator: TransformCalculator;
  private readonly unitConverter: UnitConverter;
  /** Cache of loaded images, keyed by relationship ID */
  private readonly imageCache: Map<string, DecodedImage> = new Map();
  /** Maximum number of images to cache (LRU eviction) */
  private readonly maxCacheSize: number = 50;
  /** Track insertion order for LRU eviction */
  private readonly cacheOrder: string[] = [];

  constructor(config: ImageRendererConfig) {
    this.logger = config.logger ?? createLogger('warn', 'ImageRenderer');
    this.parser = config.parser;
    this.sourcePath = config.sourcePath;
    this.scaleX = config.scaleX;
    this.scaleY = config.scaleY;
    this.relationshipParser = new RelationshipParser({
      parser: config.parser,
      logger: this.logger.child?.('RelParser'),
    });
    this.imageDecoder = new ImageDecoder({
      logger: this.logger.child?.('Decoder'),
    });
    this.transformCalculator = new TransformCalculator();
    this.unitConverter = new UnitConverter();
  }

  /**
   * Adds an image to the cache with LRU eviction.
   * @param key The cache key (relationship ID)
   * @param image The decoded image to cache
   */
  private addToCache(key: string, image: DecodedImage): void {
    if (this.imageCache.has(key)) {
      // Move to end of order (most recently used)
      const idx = this.cacheOrder.indexOf(key);
      if (idx > -1) {
        this.cacheOrder.splice(idx, 1);
      }
    }
    this.imageCache.set(key, image);
    this.cacheOrder.push(key);

    // Evict oldest entries if over limit
    while (this.cacheOrder.length > this.maxCacheSize) {
      const oldest = this.cacheOrder.shift();
      if (oldest) {
        this.imageCache.delete(oldest);
        this.logger.debug('Evicted image from cache', { id: oldest });
      }
    }
  }

  /**
   * Loads an image by its relationship ID.
   *
   * @param relationshipId The r:embed relationship ID
   * @returns The decoded image or undefined if not found
   */
  async loadImage(relationshipId: string): Promise<DecodedImage | undefined> {
    // Check cache (and update access order for LRU)
    const cached = this.imageCache.get(relationshipId);
    if (cached) {
      // Move to end of order (most recently used)
      const idx = this.cacheOrder.indexOf(relationshipId);
      if (idx > -1) {
        this.cacheOrder.splice(idx, 1);
        this.cacheOrder.push(relationshipId);
      }
      return cached;
    }

    try {
      // Resolve relationship to media path
      const mediaPath = await this.relationshipParser.resolveImageRelationship(
        this.sourcePath,
        relationshipId
      );

      if (!mediaPath) {
        this.logger.warn('Image relationship not found', { id: relationshipId });
        return undefined;
      }

      // Load the image data from the PPTX
      const buffer = await this.parser.readBinary(mediaPath);

      // Decode the image
      const decoded = await this.imageDecoder.decode(buffer);

      // Cache it with LRU eviction
      this.addToCache(relationshipId, decoded);

      this.logger.debug('Image loaded', {
        id: relationshipId,
        path: mediaPath,
        width: decoded.width,
        height: decoded.height,
        format: decoded.format,
      });

      return decoded;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to load image', {
        id: relationshipId,
        error: message,
      });
      return undefined;
    }
  }

  /**
   * Parses a blipFill element to extract picture data.
   *
   * @param blipFill The a:blipFill element node
   * @returns Parsed picture data or undefined
   */
  parseBlipFill(blipFill: PptxXmlNode | undefined): PictureData | undefined {
    if (!blipFill) {
      return undefined;
    }

    // Get the blip element with the relationship ID
    const blip = getXmlChild(blipFill, 'a:blip');
    if (!blip) {
      this.logger.debug('blipFill has no blip element');
      return undefined;
    }

    const blipRelId = getXmlAttr(blip, 'r:embed');
    if (!blipRelId) {
      // Could be r:link for external images, but we only support embedded
      this.logger.debug('blip has no r:embed attribute');
      return undefined;
    }

    const result: PictureData = {
      blipRelId,
    };

    // Parse source rectangle (cropping)
    const srcRect = getXmlChild(blipFill, 'a:srcRect');
    if (srcRect) {
      result.srcRect = this.parseCropRect(srcRect);
    }

    // Check for stretch fill
    const stretch = getXmlChild(blipFill, 'a:stretch');
    if (stretch) {
      result.stretch = true;
      // Parse fill rectangle within stretch
      const fillRect = getXmlChild(stretch, 'a:fillRect');
      if (fillRect) {
        result.fillRect = this.parseCropRect(fillRect);
      }
    }

    // Check for tile fill
    const tile = getXmlChild(blipFill, 'a:tile');
    if (tile) {
      result.tile = this.parseTileInfo(tile);
    }

    return result;
  }

  /**
   * Parses a p:pic element to extract picture data.
   *
   * @param picNode The p:pic element node
   * @returns Parsed picture data or undefined
   */
  parsePicElement(picNode: PptxXmlNode | undefined): PictureData | undefined {
    if (!picNode) {
      return undefined;
    }

    // Get blipFill from the picture element
    const blipFill = getXmlChild(picNode, 'p:blipFill');
    return this.parseBlipFill(blipFill);
  }

  /**
   * Parses a crop rectangle element (srcRect or fillRect).
   * Values are in OpenXML percentage format (0-100000).
   */
  private parseCropRect(rectNode: PptxXmlNode): CropRect {
    return {
      left: parseInt(getXmlAttr(rectNode, 'l') ?? '0', 10),
      top: parseInt(getXmlAttr(rectNode, 't') ?? '0', 10),
      right: parseInt(getXmlAttr(rectNode, 'r') ?? '0', 10),
      bottom: parseInt(getXmlAttr(rectNode, 'b') ?? '0', 10),
    };
  }

  /**
   * Parses tile fill settings.
   */
  private parseTileInfo(tileNode: PptxXmlNode): TileInfo {
    const flipAttr = getXmlAttr(tileNode, 'flip') ?? 'none';
    let flip: TileInfo['flip'] = 'none';
    if (flipAttr === 'x') flip = 'x';
    else if (flipAttr === 'y') flip = 'y';
    else if (flipAttr === 'xy') flip = 'xy';

    return {
      sx: parseInt(getXmlAttr(tileNode, 'sx') ?? '100000', 10),
      sy: parseInt(getXmlAttr(tileNode, 'sy') ?? '100000', 10),
      tx: parseInt(getXmlAttr(tileNode, 'tx') ?? '0', 10),
      ty: parseInt(getXmlAttr(tileNode, 'ty') ?? '0', 10),
      flip,
      alignment: getXmlAttr(tileNode, 'algn') ?? 'tl',
    };
  }

  /**
   * Converts a percentage value (0-100000) to a decimal (0-1).
   */
  private percentToDecimal(percent: number): number {
    return percent / 100000;
  }

  /**
   * Renders an image to the canvas.
   *
   * @param ctx Canvas 2D context
   * @param image The decoded image to render
   * @param bounds The destination bounds in pixels
   * @param pictureData Optional picture data with cropping/fill settings
   */
  renderImage(
    ctx: CanvasRenderingContext2D,
    image: Image,
    bounds: Rect,
    pictureData?: PictureData
  ): void {
    ctx.save();

    // Calculate source rectangle (cropping)
    let srcX = 0;
    let srcY = 0;
    let srcWidth = image.width;
    let srcHeight = image.height;

    if (pictureData?.srcRect) {
      const { left, top, right, bottom } = pictureData.srcRect;
      const leftPct = this.percentToDecimal(left);
      const topPct = this.percentToDecimal(top);
      const rightPct = this.percentToDecimal(right);
      const bottomPct = this.percentToDecimal(bottom);

      srcX = image.width * leftPct;
      srcY = image.height * topPct;
      srcWidth = image.width * (1 - leftPct - rightPct);
      srcHeight = image.height * (1 - topPct - bottomPct);
    }

    // Calculate destination rectangle
    let destX = bounds.x;
    let destY = bounds.y;
    let destWidth = bounds.width;
    let destHeight = bounds.height;

    // Apply fill rectangle if specified (adjusts destination within bounds)
    if (pictureData?.fillRect) {
      const { left, top, right, bottom } = pictureData.fillRect;
      const leftPct = this.percentToDecimal(left);
      const topPct = this.percentToDecimal(top);
      const rightPct = this.percentToDecimal(right);
      const bottomPct = this.percentToDecimal(bottom);

      destX = bounds.x - bounds.width * leftPct;
      destY = bounds.y - bounds.height * topPct;
      destWidth = bounds.width * (1 + leftPct + rightPct);
      destHeight = bounds.height * (1 + topPct + bottomPct);
    }

    if (pictureData?.tile) {
      // Render as tiled pattern
      this.renderTiledImage(ctx, image, bounds, pictureData.tile, srcX, srcY, srcWidth, srcHeight);
    } else {
      // Render stretched or scaled image
      ctx.drawImage(
        image,
        srcX,
        srcY,
        srcWidth,
        srcHeight,
        destX,
        destY,
        destWidth,
        destHeight
      );
    }

    ctx.restore();

    this.logger.debug('Image rendered', {
      src: { x: srcX, y: srcY, width: srcWidth, height: srcHeight },
      dest: { x: destX, y: destY, width: destWidth, height: destHeight },
      tiled: !!pictureData?.tile,
    });
  }

  /**
   * Renders a tiled image pattern.
   */
  private renderTiledImage(
    ctx: CanvasRenderingContext2D,
    image: Image,
    bounds: Rect,
    tile: TileInfo,
    srcX: number,
    srcY: number,
    srcWidth: number,
    srcHeight: number
  ): void {
    // Calculate tile dimensions
    const tileWidth = (srcWidth * tile.sx) / 100000;
    const tileHeight = (srcHeight * tile.sy) / 100000;

    // Guard against infinite loops from zero/negative tile dimensions
    if (tileWidth <= 0 || tileHeight <= 0) {
      this.logger.warn('Invalid tile dimensions, skipping tile fill', {
        tileWidth,
        tileHeight,
        srcWidth,
        srcHeight,
        scaleX: tile.sx,
        scaleY: tile.sy,
      });
      return;
    }

    // Calculate offset in pixels (from EMU)
    const offsetX = this.unitConverter.emuToPixels(tile.tx) * this.scaleX;
    const offsetY = this.unitConverter.emuToPixels(tile.ty) * this.scaleY;

    // Set clip region to bounds
    ctx.beginPath();
    ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.clip();

    // Calculate starting position based on alignment
    let startX = bounds.x + offsetX;
    let startY = bounds.y + offsetY;

    // Adjust for alignment (tl = top-left, etc.)
    switch (tile.alignment) {
      case 'tr':
        startX = bounds.x + bounds.width - tileWidth + offsetX;
        break;
      case 'bl':
        startY = bounds.y + bounds.height - tileHeight + offsetY;
        break;
      case 'br':
        startX = bounds.x + bounds.width - tileWidth + offsetX;
        startY = bounds.y + bounds.height - tileHeight + offsetY;
        break;
      case 'ctr':
        startX = bounds.x + (bounds.width - tileWidth) / 2 + offsetX;
        startY = bounds.y + (bounds.height - tileHeight) / 2 + offsetY;
        break;
      // tl and others default to top-left
    }

    // Adjust start to ensure we cover from the beginning
    while (startX > bounds.x) startX -= tileWidth;
    while (startY > bounds.y) startY -= tileHeight;

    // Draw tiles
    let row = 0;
    for (let y = startY; y < bounds.y + bounds.height; y += tileHeight) {
      let col = 0;
      for (let x = startX; x < bounds.x + bounds.width; x += tileWidth) {
        ctx.save();

        // Apply flip if needed
        let flipX = 1;
        let flipY = 1;

        if (tile.flip === 'x' || tile.flip === 'xy') {
          flipX = col % 2 === 0 ? 1 : -1;
        }
        if (tile.flip === 'y' || tile.flip === 'xy') {
          flipY = row % 2 === 0 ? 1 : -1;
        }

        if (flipX !== 1 || flipY !== 1) {
          ctx.translate(x + tileWidth / 2, y + tileHeight / 2);
          ctx.scale(flipX, flipY);
          ctx.translate(-(x + tileWidth / 2), -(y + tileHeight / 2));
        }

        ctx.drawImage(
          image,
          srcX,
          srcY,
          srcWidth,
          srcHeight,
          x,
          y,
          tileWidth,
          tileHeight
        );

        ctx.restore();
        col++;
      }
      row++;
    }
  }

  /**
   * Renders a picture element (p:pic) to the canvas.
   *
   * @param ctx Canvas 2D context
   * @param picNode The p:pic XML node
   * @param transform The pixel transform for the picture
   */
  async renderPictureElement(
    ctx: CanvasRenderingContext2D,
    picNode: PptxXmlNode,
    transform: PixelTransform
  ): Promise<void> {
    // Parse the picture data
    const pictureData = this.parsePicElement(picNode);
    if (!pictureData) {
      this.logger.debug('No picture data found in p:pic element');
      return;
    }

    // Load the image
    const decodedImage = await this.loadImage(pictureData.blipRelId);
    if (!decodedImage) {
      this.logger.warn('Could not load image', { relId: pictureData.blipRelId });
      return;
    }

    // Apply transform
    ctx.save();
    this.transformCalculator.applyTransform(ctx, transform);

    // Create bounds at origin (transform already applied)
    const bounds: Rect = {
      x: 0,
      y: 0,
      width: transform.width,
      height: transform.height,
    };

    // Render the image
    this.renderImage(ctx, decodedImage.image, bounds, pictureData);

    ctx.restore();
  }

  /**
   * Renders a picture fill (blipFill) to the canvas.
   *
   * @param ctx Canvas 2D context
   * @param blipFill The a:blipFill XML node
   * @param bounds The destination bounds in pixels
   */
  async renderPictureFill(
    ctx: CanvasRenderingContext2D,
    blipFill: PptxXmlNode,
    bounds: Rect
  ): Promise<void> {
    // Parse the picture data
    const pictureData = this.parseBlipFill(blipFill);
    if (!pictureData) {
      this.logger.debug('No picture data found in blipFill');
      return;
    }

    // Load the image
    const decodedImage = await this.loadImage(pictureData.blipRelId);
    if (!decodedImage) {
      this.logger.warn('Could not load image for fill', { relId: pictureData.blipRelId });
      return;
    }

    // Render the image
    this.renderImage(ctx, decodedImage.image, bounds, pictureData);
  }

  /**
   * Clears the image cache.
   */
  clearCache(): void {
    this.imageCache.clear();
    this.cacheOrder.length = 0;
    this.logger.debug('Image cache cleared');
  }

  /**
   * Updates the source path for relationship resolution.
   * Call this when rendering a different slide.
   */
  setSourcePath(sourcePath: string): ImageRenderer {
    return new ImageRenderer({
      parser: this.parser,
      sourcePath,
      scaleX: this.scaleX,
      scaleY: this.scaleY,
      logger: this.logger,
    });
  }
}

/**
 * Creates an ImageRenderer instance.
 */
export function createImageRenderer(
  parser: PptxParser,
  sourcePath: string,
  scaleX: number,
  scaleY: number,
  logger?: ILogger
): ImageRenderer {
  return new ImageRenderer({
    parser,
    sourcePath,
    scaleX,
    scaleY,
    logger,
  });
}
