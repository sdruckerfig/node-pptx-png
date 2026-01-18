/**
 * Main shape rendering orchestration.
 * Coordinates geometry calculation, transforms, fills, strokes, and text.
 */

import type { CanvasRenderingContext2D } from 'skia-canvas';
import type { ResolvedTheme } from '../types/theme.js';
import type { Path, Rect, Rgba } from '../types/geometry.js';
import type { ShapeElement, Fill, Stroke, TextBody } from '../types/elements.js';
import type { PptxParser, PptxXmlNode } from '../core/PptxParser.js';
import { getXmlChild, getXmlAttr, getXmlChildren } from '../core/PptxParser.js';
import { TransformCalculator, type ParsedTransform, type PixelTransform } from '../geometry/TransformCalculator.js';
import { PresetGeometryCalculator } from '../geometry/PresetGeometryCalculator.js';
import { FillRenderer } from './FillRenderer.js';
import { StrokeRenderer } from './StrokeRenderer.js';
import { TextRenderer } from './TextRenderer.js';
import { TextParser } from '../parsers/TextParser.js';
import { ImageRenderer } from './ImageRenderer.js';
import { applyPathToContext } from '../geometry/PathBuilder.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Configuration for ShapeRenderer.
 */
export interface ShapeRendererConfig {
  /** Resolved theme for color resolution */
  theme: ResolvedTheme;
  /** Horizontal scale factor (EMU to pixels) */
  scaleX: number;
  /** Vertical scale factor (EMU to pixels) */
  scaleY: number;
  /** PPTX parser for accessing media (required for picture shapes) */
  parser?: PptxParser;
  /** Source file path for relationship resolution (e.g., ppt/slides/slide1.xml) */
  sourcePath?: string;
  /** Slide layout node for placeholder resolution */
  layoutNode?: PptxXmlNode;
  /** Slide master node for placeholder resolution fallback */
  masterNode?: PptxXmlNode;
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Parsed shape data ready for rendering.
 */
export interface ParsedShape {
  /** Shape ID */
  id: string;
  /** Shape name */
  name?: string;
  /** Transform in pixels */
  transform: PixelTransform;
  /** Preset geometry name or 'custom' */
  geometryType: string;
  /** Adjustment values for parameterized shapes */
  adjustValues?: Map<string, number>;
  /** Fill definition */
  fill?: Fill;
  /** Stroke definition */
  stroke?: Stroke;
  /** Text body */
  textBody?: TextBody;
  /** Whether to render as hidden */
  hidden: boolean;
}

/**
 * Renders shapes to canvas.
 */
export class ShapeRenderer {
  private readonly logger: ILogger;
  private readonly theme: ResolvedTheme;
  private readonly scaleX: number;
  private readonly scaleY: number;
  private readonly parser?: PptxParser;
  private readonly sourcePath?: string;
  private readonly layoutNode?: PptxXmlNode;
  private readonly masterNode?: PptxXmlNode;
  private readonly transformCalculator: TransformCalculator;
  private readonly geometryCalculator: PresetGeometryCalculator;
  private readonly fillRenderer: FillRenderer;
  private readonly strokeRenderer: StrokeRenderer;
  private readonly textRenderer: TextRenderer;
  private readonly textParser: TextParser;
  private imageRenderer: ImageRenderer | null = null;

  constructor(config: ShapeRendererConfig) {
    this.logger = config.logger ?? createLogger('warn', 'ShapeRenderer');
    this.theme = config.theme;
    this.scaleX = config.scaleX;
    this.scaleY = config.scaleY;
    this.parser = config.parser;
    this.sourcePath = config.sourcePath;
    this.layoutNode = config.layoutNode;
    this.masterNode = config.masterNode;
    this.transformCalculator = new TransformCalculator();
    this.geometryCalculator = new PresetGeometryCalculator();
    this.fillRenderer = new FillRenderer({
      theme: config.theme,
      logger: this.logger.child?.('FillRenderer'),
    });
    this.strokeRenderer = new StrokeRenderer({
      theme: config.theme,
      logger: this.logger.child?.('StrokeRenderer'),
    });
    this.textRenderer = new TextRenderer({
      theme: config.theme,
      scaleX: config.scaleX,
      scaleY: config.scaleY,
      logger: this.logger.child?.('TextRenderer'),
    });
    this.textParser = new TextParser({
      theme: config.theme,
      logger: this.logger.child?.('TextParser'),
    });

    // Initialize image renderer if parser and source path are provided
    if (config.parser && config.sourcePath) {
      this.imageRenderer = new ImageRenderer({
        parser: config.parser,
        sourcePath: config.sourcePath,
        scaleX: config.scaleX,
        scaleY: config.scaleY,
        logger: this.logger.child?.('ImageRenderer'),
      });
    }
  }

  /**
   * Renders a shape element to the canvas.
   * @param ctx Canvas 2D context
   * @param spNode Shape XML node (p:sp)
   */
  async renderShape(ctx: CanvasRenderingContext2D, spNode: PptxXmlNode): Promise<void> {
    // Parse the shape
    const shape = this.parseShape(spNode);
    if (!shape || shape.hidden) {
      return;
    }

    this.logger.debug('Rendering shape', {
      id: shape.id,
      name: shape.name,
      geometry: shape.geometryType,
      hasText: !!shape.textBody,
    });

    // Create the geometry path
    const bounds: Rect = {
      x: 0,
      y: 0,
      width: shape.transform.width,
      height: shape.transform.height,
    };

    const path = this.createPath(shape.geometryType, bounds, shape.adjustValues);
    if (!path) {
      this.logger.warn('Unsupported geometry type', { type: shape.geometryType });
      return;
    }

    // Apply transform and render
    ctx.save();
    this.transformCalculator.applyTransform(ctx, shape.transform);

    // Get fill color for text contrast calculation
    let fillColor: Rgba | undefined;

    // Render fill first (use async for picture fills)
    if (shape.fill && shape.fill.type !== 'none') {
      if (shape.fill.type === 'picture' && this.imageRenderer) {
        // Use async rendering for picture fills
        await this.fillRenderer.renderFillAsync(ctx, path, shape.fill, bounds, this.imageRenderer);
      } else {
        this.fillRenderer.renderFill(ctx, path, shape.fill, bounds);
      }
      // Extract fill color for text contrast
      if (shape.fill.type === 'solid') {
        fillColor = shape.fill.color;
      }
    }

    // Then render stroke
    if (shape.stroke) {
      this.strokeRenderer.renderStroke(ctx, path, shape.stroke, this.scaleX, this.scaleY);
    }

    // Finally render text if present
    if (shape.textBody && shape.textBody.paragraphs.length > 0) {
      // Calculate default text color based on fill (for contrast)
      const defaultTextColor = fillColor
        ? this.textRenderer.getContrastingColor(fillColor)
        : undefined;

      // Get text bounds (may be different from shape bounds for non-rectangular shapes)
      const textBounds = this.geometryCalculator.getTextBounds(
        shape.geometryType,
        bounds,
        shape.adjustValues
      );

      this.textRenderer.renderText(ctx, shape.textBody, textBounds, defaultTextColor);
    }

    ctx.restore();
  }

  /**
   * Parses a shape XML node into renderable data.
   * @param spNode Shape XML node (p:sp)
   */
  parseShape(spNode: PptxXmlNode): ParsedShape | undefined {
    // Get non-visual properties
    const nvSpPr = getXmlChild(spNode, 'p:nvSpPr');
    const cNvPr = nvSpPr ? getXmlChild(nvSpPr, 'p:cNvPr') : undefined;
    const nvPr = nvSpPr ? getXmlChild(nvSpPr, 'p:nvPr') : undefined;

    const id = cNvPr ? getXmlAttr(cNvPr, 'id') ?? '0' : '0';
    const name = cNvPr ? getXmlAttr(cNvPr, 'name') : undefined;
    const hidden = cNvPr ? getXmlAttr(cNvPr, 'hidden') === '1' : false;

    // Check if this is a placeholder shape
    const phNode = nvPr ? getXmlChild(nvPr, 'p:ph') : undefined;
    const placeholderType = phNode ? getXmlAttr(phNode, 'type') : undefined;
    const placeholderIdx = phNode ? getXmlAttr(phNode, 'idx') : undefined;

    // Get shape properties
    const spPr = getXmlChild(spNode, 'p:spPr');
    if (!spPr) {
      this.logger.debug('Shape has no spPr, skipping', { id });
      return undefined;
    }

    // Parse transform - first try from shape, then from layout placeholder
    let transform = this.transformCalculator.parseTransform(spPr);

    // If no transform and this is a placeholder, look it up from layout
    if (!transform && phNode) {
      transform = this.getPlaceholderTransform(placeholderType, placeholderIdx);
      if (transform) {
        this.logger.debug('Using placeholder transform from layout', {
          id,
          type: placeholderType,
          idx: placeholderIdx
        });
      }
    }

    if (!transform) {
      this.logger.debug('Shape has no transform, skipping', { id });
      return undefined;
    }

    const pixelTransform = this.transformCalculator.toPixelTransform(
      transform,
      this.scaleX,
      this.scaleY
    );

    // Parse geometry - for placeholders, may need to get from layout too
    let { geometryType, adjustValues } = this.parseGeometry(spPr);

    // Default to rect for placeholders without explicit geometry
    if (!geometryType && phNode) {
      geometryType = 'rect';
    }

    // Parse fill
    const fill = this.fillRenderer.parseFill(spPr);

    // Parse stroke
    const stroke = this.strokeRenderer.parseStroke(spPr);

    // Parse text body
    const txBody = getXmlChild(spNode, 'p:txBody');
    const textBody = this.textParser.parseTextBody(txBody);

    return {
      id,
      name,
      transform: pixelTransform,
      geometryType: geometryType || 'rect',
      adjustValues,
      fill,
      stroke,
      textBody,
      hidden,
    };
  }

  /**
   * Parses geometry information from shape properties.
   */
  private parseGeometry(spPr: PptxXmlNode): {
    geometryType: string;
    adjustValues?: Map<string, number>;
  } {
    // Check for preset geometry
    const prstGeom = getXmlChild(spPr, 'a:prstGeom');
    if (prstGeom) {
      const prst = getXmlAttr(prstGeom, 'prst') ?? 'rect';
      const adjustValues = this.parseAdjustValues(prstGeom);
      return { geometryType: prst, adjustValues };
    }

    // Check for custom geometry
    const custGeom = getXmlChild(spPr, 'a:custGeom');
    if (custGeom) {
      // Custom geometry parsing would be implemented here
      // For now, return rectangle as fallback
      this.logger.debug('Custom geometry not fully supported, using rectangle');
      return { geometryType: 'rect' };
    }

    // Default to rectangle
    return { geometryType: 'rect' };
  }

  /**
   * Parses adjustment values from preset geometry.
   */
  private parseAdjustValues(prstGeom: PptxXmlNode): Map<string, number> | undefined {
    const avLst = getXmlChild(prstGeom, 'a:avLst');
    if (!avLst) return undefined;

    const gdNodes = getXmlChildren(avLst, 'a:gd');
    if (gdNodes.length === 0) return undefined;

    const adjustValues = new Map<string, number>();

    for (const gd of gdNodes) {
      const name = getXmlAttr(gd, 'name');
      const fmla = getXmlAttr(gd, 'fmla');

      if (name && fmla) {
        // Parse "val X" formula
        const match = fmla.match(/^val\s+(\d+)$/);
        if (match?.[1]) {
          adjustValues.set(name, parseInt(match[1], 10));
        }
      }
    }

    return adjustValues.size > 0 ? adjustValues : undefined;
  }

  /**
   * Looks up a placeholder's transform from the slide layout or master.
   * @param placeholderType The placeholder type (title, body, etc.)
   * @param placeholderIdx The placeholder index
   * @returns The parsed transform or undefined if not found
   */
  private getPlaceholderTransform(
    placeholderType: string | undefined,
    placeholderIdx: string | undefined
  ): ParsedTransform | undefined {
    // Try layout first, then master
    const sources = [this.layoutNode, this.masterNode].filter(Boolean);

    for (const sourceNode of sources) {
      if (!sourceNode) continue;

      // Navigate to shape tree in layout/master
      // Layout/master structure: p:sldLayout/p:sldMaster > p:cSld > p:spTree
      const cSld = getXmlChild(sourceNode, 'p:cSld');
      if (!cSld) continue;

      const spTree = getXmlChild(cSld, 'p:spTree');
      if (!spTree) continue;

      // Find matching placeholder shape
      const shapes = getXmlChildren(spTree, 'p:sp');
      for (const sp of shapes) {
        const nvSpPr = getXmlChild(sp, 'p:nvSpPr');
        if (!nvSpPr) continue;

        const nvPr = getXmlChild(nvSpPr, 'p:nvPr');
        if (!nvPr) continue;

        const ph = getXmlChild(nvPr, 'p:ph');
        if (!ph) continue;

        // Check if this placeholder matches
        const layoutPhType = getXmlAttr(ph, 'type');
        const layoutPhIdx = getXmlAttr(ph, 'idx');

        // Match by type (for title, body, etc.) or by idx
        const typeMatch = placeholderType && layoutPhType === placeholderType;
        const idxMatch = placeholderIdx !== undefined && layoutPhIdx === placeholderIdx;

        if (typeMatch || idxMatch) {
          // Found matching placeholder - get its transform
          const spPr = getXmlChild(sp, 'p:spPr');
          if (spPr) {
            const transform = this.transformCalculator.parseTransform(spPr);
            if (transform) {
              return transform;
            }
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Creates a path for the specified geometry type.
   */
  private createPath(
    geometryType: string,
    bounds: Rect,
    adjustValues?: Map<string, number>
  ): Path | undefined {
    return this.geometryCalculator.createPath(geometryType, bounds, adjustValues);
  }

  /**
   * Renders a connection shape (connector line).
   * @param ctx Canvas 2D context
   * @param cxnSpNode Connection shape XML node (p:cxnSp)
   */
  renderConnectionShape(ctx: CanvasRenderingContext2D, cxnSpNode: PptxXmlNode): void {
    // Connection shapes are simpler - they're typically lines
    const nvCxnSpPr = getXmlChild(cxnSpNode, 'p:nvCxnSpPr');
    const cNvPr = nvCxnSpPr ? getXmlChild(nvCxnSpPr, 'p:cNvPr') : undefined;

    const id = cNvPr ? getXmlAttr(cNvPr, 'id') ?? '0' : '0';
    const hidden = cNvPr ? getXmlAttr(cNvPr, 'hidden') === '1' : false;

    if (hidden) return;

    const spPr = getXmlChild(cxnSpNode, 'p:spPr');
    if (!spPr) return;

    // Parse transform
    const transform = this.transformCalculator.parseTransform(spPr);
    if (!transform) return;

    const pixelTransform = this.transformCalculator.toPixelTransform(
      transform,
      this.scaleX,
      this.scaleY
    );

    // Parse geometry (usually straightConnector1 or similar)
    const { geometryType } = this.parseGeometry(spPr);

    // Create bounds
    const bounds: Rect = {
      x: 0,
      y: 0,
      width: pixelTransform.width,
      height: pixelTransform.height,
    };

    // Create line path
    const path = this.geometryCalculator.createPath('line', bounds);
    if (!path) return;

    // Parse stroke
    const stroke = this.strokeRenderer.parseStroke(spPr);
    if (!stroke) return;

    this.logger.debug('Rendering connection shape', { id, geometry: geometryType });

    // Apply transform and render stroke only (no fill for lines)
    ctx.save();
    this.transformCalculator.applyTransform(ctx, pixelTransform);
    this.strokeRenderer.renderStroke(ctx, path, stroke, this.scaleX, this.scaleY);
    ctx.restore();
  }

  /**
   * Gets the fill renderer for external use.
   */
  getFillRenderer(): FillRenderer {
    return this.fillRenderer;
  }

  /**
   * Gets the stroke renderer for external use.
   */
  getStrokeRenderer(): StrokeRenderer {
    return this.strokeRenderer;
  }

  /**
   * Gets the text renderer for external use.
   */
  getTextRenderer(): TextRenderer {
    return this.textRenderer;
  }

  /**
   * Gets the text parser for external use.
   */
  getTextParser(): TextParser {
    return this.textParser;
  }

  /**
   * Gets the image renderer for external use.
   */
  getImageRenderer(): ImageRenderer | null {
    return this.imageRenderer;
  }

  /**
   * Sets a new source path for image rendering.
   * Creates a new ImageRenderer for the given path.
   */
  setSourcePath(sourcePath: string): void {
    if (this.parser) {
      this.imageRenderer = new ImageRenderer({
        parser: this.parser,
        sourcePath,
        scaleX: this.scaleX,
        scaleY: this.scaleY,
        logger: this.logger.child?.('ImageRenderer'),
      });
    }
  }

  /**
   * Renders a picture element (p:pic) to the canvas.
   * @param ctx Canvas 2D context
   * @param picNode Picture XML node (p:pic)
   */
  async renderPicture(ctx: CanvasRenderingContext2D, picNode: PptxXmlNode): Promise<void> {
    if (!this.imageRenderer) {
      this.logger.warn('Cannot render picture: ImageRenderer not initialized (missing parser or sourcePath)');
      return;
    }

    // Get non-visual properties
    const nvPicPr = getXmlChild(picNode, 'p:nvPicPr');
    const cNvPr = nvPicPr ? getXmlChild(nvPicPr, 'p:cNvPr') : undefined;

    const id = cNvPr ? getXmlAttr(cNvPr, 'id') ?? '0' : '0';
    const name = cNvPr ? getXmlAttr(cNvPr, 'name') : undefined;
    const hidden = cNvPr ? getXmlAttr(cNvPr, 'hidden') === '1' : false;

    if (hidden) {
      this.logger.debug('Picture is hidden, skipping', { id });
      return;
    }

    // Get shape properties for transform
    const spPr = getXmlChild(picNode, 'p:spPr');
    if (!spPr) {
      this.logger.debug('Picture has no spPr, skipping', { id });
      return;
    }

    // Parse transform
    const transform = this.transformCalculator.parseTransform(spPr);
    if (!transform) {
      this.logger.debug('Picture has no transform, skipping', { id });
      return;
    }

    const pixelTransform = this.transformCalculator.toPixelTransform(
      transform,
      this.scaleX,
      this.scaleY
    );

    this.logger.debug('Rendering picture', {
      id,
      name,
      width: pixelTransform.width,
      height: pixelTransform.height,
    });

    try {
      // Render the picture using ImageRenderer
      await this.imageRenderer.renderPictureElement(ctx, picNode, pixelTransform);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to render picture', { id, error: message });
    }
  }

  /**
   * Parses a picture element to get its picture data.
   * Used for extracting picture information without rendering.
   */
  parsePicture(picNode: PptxXmlNode): {
    id: string;
    name?: string;
    transform?: PixelTransform;
    blipRelId?: string;
  } | undefined {
    // Get non-visual properties
    const nvPicPr = getXmlChild(picNode, 'p:nvPicPr');
    const cNvPr = nvPicPr ? getXmlChild(nvPicPr, 'p:cNvPr') : undefined;

    const id = cNvPr ? getXmlAttr(cNvPr, 'id') ?? '0' : '0';
    const name = cNvPr ? getXmlAttr(cNvPr, 'name') : undefined;

    // Get shape properties for transform
    const spPr = getXmlChild(picNode, 'p:spPr');
    let transform: PixelTransform | undefined;

    if (spPr) {
      const parsedTransform = this.transformCalculator.parseTransform(spPr);
      if (parsedTransform) {
        transform = this.transformCalculator.toPixelTransform(
          parsedTransform,
          this.scaleX,
          this.scaleY
        );
      }
    }

    // Get blip relationship ID
    const blipFill = getXmlChild(picNode, 'p:blipFill');
    const blip = blipFill ? getXmlChild(blipFill, 'a:blip') : undefined;
    const blipRelId = blip ? getXmlAttr(blip, 'r:embed') : undefined;

    return { id, name, transform, blipRelId };
  }

  /**
   * Renders a shape element with a pre-computed pixel transform.
   * Used for rendering shapes within groups where the transform has already been calculated.
   * @param ctx Canvas 2D context
   * @param spNode Shape XML node (p:sp)
   * @param pixelTransform Pre-computed pixel transform
   */
  renderShapeWithTransform(
    ctx: CanvasRenderingContext2D,
    spNode: PptxXmlNode,
    pixelTransform: PixelTransform
  ): void {
    // Get non-visual properties for visibility check
    const nvSpPr = getXmlChild(spNode, 'p:nvSpPr');
    const cNvPr = nvSpPr ? getXmlChild(nvSpPr, 'p:cNvPr') : undefined;

    const id = cNvPr ? getXmlAttr(cNvPr, 'id') ?? '0' : '0';
    const name = cNvPr ? getXmlAttr(cNvPr, 'name') : undefined;
    const hidden = cNvPr ? getXmlAttr(cNvPr, 'hidden') === '1' : false;

    if (hidden) return;

    // Get shape properties for geometry, fill, stroke
    const spPr = getXmlChild(spNode, 'p:spPr');
    if (!spPr) {
      this.logger.debug('Shape has no spPr, skipping', { id });
      return;
    }

    // Parse geometry
    const { geometryType, adjustValues } = this.parseGeometry(spPr);

    // Parse fill
    const fill = this.fillRenderer.parseFill(spPr);

    // Parse stroke
    const stroke = this.strokeRenderer.parseStroke(spPr);

    // Parse text body
    const txBody = getXmlChild(spNode, 'p:txBody');
    const textBody = this.textParser.parseTextBody(txBody);

    this.logger.debug('Rendering shape with transform', {
      id,
      name,
      geometry: geometryType,
      hasText: !!textBody,
    });

    // Create the geometry path
    const bounds: Rect = {
      x: 0,
      y: 0,
      width: pixelTransform.width,
      height: pixelTransform.height,
    };

    const path = this.createPath(geometryType, bounds, adjustValues);
    if (!path) {
      this.logger.warn('Unsupported geometry type', { type: geometryType });
      return;
    }

    // Apply transform and render
    ctx.save();
    this.transformCalculator.applyTransform(ctx, pixelTransform);

    // Get fill color for text contrast calculation
    let fillColor: Rgba | undefined;

    // Render fill first
    if (fill && fill.type !== 'none') {
      this.fillRenderer.renderFill(ctx, path, fill, bounds);
      // Extract fill color for text contrast
      if (fill.type === 'solid') {
        fillColor = fill.color;
      }
    }

    // Then render stroke
    if (stroke) {
      this.strokeRenderer.renderStroke(ctx, path, stroke, this.scaleX, this.scaleY);
    }

    // Finally render text if present
    if (textBody && textBody.paragraphs.length > 0) {
      // Calculate default text color based on fill (for contrast)
      const defaultTextColor = fillColor
        ? this.textRenderer.getContrastingColor(fillColor)
        : undefined;

      // Get text bounds (may be different from shape bounds for non-rectangular shapes)
      const textBounds = this.geometryCalculator.getTextBounds(
        geometryType,
        bounds,
        adjustValues
      );

      this.textRenderer.renderText(ctx, textBody, textBounds, defaultTextColor);
    }

    ctx.restore();
  }

  /**
   * Renders a connection shape with a pre-computed pixel transform.
   * Used for rendering connection shapes within groups.
   * @param ctx Canvas 2D context
   * @param cxnSpNode Connection shape XML node (p:cxnSp)
   * @param pixelTransform Pre-computed pixel transform
   */
  renderConnectionShapeWithTransform(
    ctx: CanvasRenderingContext2D,
    cxnSpNode: PptxXmlNode,
    pixelTransform: PixelTransform
  ): void {
    // Get non-visual properties for visibility check
    const nvCxnSpPr = getXmlChild(cxnSpNode, 'p:nvCxnSpPr');
    const cNvPr = nvCxnSpPr ? getXmlChild(nvCxnSpPr, 'p:cNvPr') : undefined;

    const id = cNvPr ? getXmlAttr(cNvPr, 'id') ?? '0' : '0';
    const hidden = cNvPr ? getXmlAttr(cNvPr, 'hidden') === '1' : false;

    if (hidden) return;

    const spPr = getXmlChild(cxnSpNode, 'p:spPr');
    if (!spPr) return;

    // Parse geometry
    const { geometryType } = this.parseGeometry(spPr);

    // Create bounds
    const bounds: Rect = {
      x: 0,
      y: 0,
      width: pixelTransform.width,
      height: pixelTransform.height,
    };

    // Create line path
    const path = this.geometryCalculator.createPath('line', bounds);
    if (!path) return;

    // Parse stroke
    const stroke = this.strokeRenderer.parseStroke(spPr);
    if (!stroke) return;

    this.logger.debug('Rendering connection shape with transform', { id, geometry: geometryType });

    // Apply transform and render stroke only
    ctx.save();
    this.transformCalculator.applyTransform(ctx, pixelTransform);
    this.strokeRenderer.renderStroke(ctx, path, stroke, this.scaleX, this.scaleY);
    ctx.restore();
  }

  /**
   * Renders a picture element with a pre-computed pixel transform.
   * Used for rendering pictures within groups.
   * @param ctx Canvas 2D context
   * @param picNode Picture XML node (p:pic)
   * @param pixelTransform Pre-computed pixel transform
   */
  async renderPictureWithTransform(
    ctx: CanvasRenderingContext2D,
    picNode: PptxXmlNode,
    pixelTransform: PixelTransform
  ): Promise<void> {
    if (!this.imageRenderer) {
      this.logger.warn('Cannot render picture: ImageRenderer not initialized');
      return;
    }

    // Get non-visual properties
    const nvPicPr = getXmlChild(picNode, 'p:nvPicPr');
    const cNvPr = nvPicPr ? getXmlChild(nvPicPr, 'p:cNvPr') : undefined;

    const id = cNvPr ? getXmlAttr(cNvPr, 'id') ?? '0' : '0';
    const name = cNvPr ? getXmlAttr(cNvPr, 'name') : undefined;
    const hidden = cNvPr ? getXmlAttr(cNvPr, 'hidden') === '1' : false;

    if (hidden) {
      this.logger.debug('Picture is hidden, skipping', { id });
      return;
    }

    this.logger.debug('Rendering picture with transform', {
      id,
      name,
      width: pixelTransform.width,
      height: pixelTransform.height,
    });

    try {
      // Render the picture using ImageRenderer with the pre-computed transform
      await this.imageRenderer.renderPictureElement(ctx, picNode, pixelTransform);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to render picture', { id, error: message });
    }
  }
}

/**
 * Default shape renderer factory.
 */
export function createShapeRenderer(
  theme: ResolvedTheme,
  scaleX: number,
  scaleY: number,
  logger?: ILogger,
  parser?: PptxParser,
  sourcePath?: string
): ShapeRenderer {
  return new ShapeRenderer({ theme, scaleX, scaleY, logger, parser, sourcePath });
}
