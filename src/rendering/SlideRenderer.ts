import { Canvas, type CanvasRenderingContext2D } from 'skia-canvas';
import type { ResolvedTheme, PptxRenderOptions, ResolvedRenderOptions, Rgba } from '../types/index.js';
import type { Rect } from '../types/geometry.js';
import { DEFAULT_RENDER_OPTIONS, Colors } from '../types/index.js';
import type { PptxParser, PptxXmlNode, SlideData, OrderedXmlOutput } from '../core/PptxParser.js';
import { getXmlChild, getXmlAttr, getOrderedChildren } from '../core/PptxParser.js';
import { UnitConverter } from '../core/UnitConverter.js';
import { SHAPE_ELEMENT_TYPES } from '../core/constants.js';
import { BackgroundRenderer } from './BackgroundRenderer.js';
import { ShapeRenderer } from './ShapeRenderer.js';
import { GroupShapeRenderer, type GroupTransform } from './GroupShapeRenderer.js';
import { AlternateContentRenderer } from './AlternateContentRenderer.js';
import { ChartRenderer } from './ChartRenderer.js';
import { ChartParser } from '../parsers/ChartParser.js';
import { TableRenderer } from './TableRenderer.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';
import { PngOptimizer } from '../utils/PngOptimizer.js';

/**
 * Context for rendering a single slide.
 */
export interface SlideRenderContext {
  /** Canvas to render to */
  canvas: Canvas;
  /** 2D rendering context */
  ctx: CanvasRenderingContext2D;
  /** Resolved theme */
  theme: ResolvedTheme;
  /** Slide width in EMU */
  slideWidthEmu: number;
  /** Slide height in EMU */
  slideHeightEmu: number;
  /** Target width in pixels */
  targetWidth: number;
  /** Target height in pixels */
  targetHeight: number;
  /** Horizontal scale factor (EMU to pixels) */
  scaleX: number;
  /** Vertical scale factor (EMU to pixels) */
  scaleY: number;
  /** Unit converter */
  unitConverter: UnitConverter;
  /** PPTX parser for accessing resources */
  parser: PptxParser;
  /** Slide path for relationship resolution */
  slidePath: string;
  /** Current shape's fill color (for text contrast) */
  shapeFillColor?: Rgba;
  /** Debug mode enabled */
  debugMode: boolean;
}

/**
 * Result of rendering a slide.
 */
export interface SlideRenderOutput {
  /** Rendered image buffer (PNG or JPEG) */
  imageData: Buffer;
  /** Rendered width in pixels */
  width: number;
  /** Rendered height in pixels */
  height: number;
  /** Whether rendering succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Renders individual slides to images.
 */
export class SlideRenderer {
  private readonly logger: ILogger;
  private readonly theme: ResolvedTheme;
  private readonly options: ResolvedRenderOptions;
  private readonly backgroundRenderer: BackgroundRenderer;
  private readonly unitConverter: UnitConverter;
  private readonly chartRenderer: ChartRenderer;
  private readonly chartParser: ChartParser;
  private readonly alternateContentRenderer: AlternateContentRenderer;
  private readonly pngOptimizer: PngOptimizer;
  private pngOptimizerInitialized = false;
  private tableRenderer: TableRenderer | null = null;
  private shapeRenderer: ShapeRenderer | null = null;
  private groupShapeRenderer: GroupShapeRenderer | null = null;
  private currentParser: PptxParser | null = null;
  private currentSlidePath: string = '';
  private currentScaleX: number = 1;
  private currentScaleY: number = 1;

  constructor(
    theme: ResolvedTheme,
    options: PptxRenderOptions = {},
    logger?: ILogger
  ) {
    this.logger = logger ?? createLogger('warn', 'SlideRenderer');
    this.theme = theme;
    this.options = {
      ...DEFAULT_RENDER_OPTIONS,
      ...options,
    };
    this.backgroundRenderer = new BackgroundRenderer(theme, this.logger.child('Background'));
    this.unitConverter = new UnitConverter();
    this.chartRenderer = new ChartRenderer({ logger: this.logger.child('Chart') });
    this.chartParser = new ChartParser({ theme, logger: this.logger.child('ChartParser') });
    this.alternateContentRenderer = new AlternateContentRenderer({ logger: this.logger.child('AltContent') });
    this.pngOptimizer = new PngOptimizer(this.logger.child('PngOptimizer'));
  }

  /**
   * Renders a slide to an image buffer.
   *
   * @param parser PPTX parser instance
   * @param slideData Slide data including path and content
   * @param slideWidthEmu Slide width in EMU
   * @param slideHeightEmu Slide height in EMU
   * @param layoutNode Optional layout XML node
   * @param masterNode Optional master XML node
   * @param layoutPath Optional path to the layout file for relationship resolution
   * @param masterPath Optional path to the master file for relationship resolution
   */
  async renderSlide(
    parser: PptxParser,
    slideData: SlideData,
    slideWidthEmu: number,
    slideHeightEmu: number,
    layoutNode?: PptxXmlNode,
    masterNode?: PptxXmlNode,
    layoutPath?: string,
    masterPath?: string
  ): Promise<SlideRenderOutput> {
    try {
      // Calculate target dimensions
      const { targetWidth, targetHeight, scaleX, scaleY } = this.calculateDimensions(
        slideWidthEmu,
        slideHeightEmu
      );

      this.logger.info('Rendering slide', {
        index: slideData.index,
        width: targetWidth,
        height: targetHeight,
        scaleX: scaleX.toFixed(4),
        scaleY: scaleY.toFixed(4),
      });

      // Create canvas
      const canvas = new Canvas(targetWidth, targetHeight);
      const ctx = canvas.getContext('2d');

      // Create render context
      const context: SlideRenderContext = {
        canvas,
        ctx,
        theme: this.theme,
        slideWidthEmu,
        slideHeightEmu,
        targetWidth,
        targetHeight,
        scaleX,
        scaleY,
        unitConverter: this.unitConverter,
        parser,
        slidePath: slideData.path,
        debugMode: this.options.debugMode,
      };

      // Render background (async to support picture backgrounds)
      await this.backgroundRenderer.renderBackgroundAsync(
        ctx,
        canvas,
        slideData.content,
        parser,
        slideData.path,
        layoutNode,
        layoutPath,
        masterNode,
        masterPath,
        this.options.backgroundColor
      );

      // Store current parser and scale factors for use in rendering methods
      this.currentParser = parser;
      this.currentSlidePath = slideData.path;
      this.currentScaleX = scaleX;
      this.currentScaleY = scaleY;

      // Initialize shape renderer with current scale factors, parser for image support,
      // and layout/master nodes for placeholder resolution
      this.shapeRenderer = new ShapeRenderer({
        theme: this.theme,
        scaleX,
        scaleY,
        parser,
        sourcePath: slideData.path,
        layoutNode,
        masterNode,
        logger: this.logger.child('Shape'),
      });

      // Initialize group shape renderer
      this.groupShapeRenderer = new GroupShapeRenderer({
        scaleX,
        scaleY,
        logger: this.logger.child('GroupShape'),
      });

      // Initialize table renderer
      this.tableRenderer = new TableRenderer({
        theme: this.theme,
        scaleX,
        scaleY,
        logger: this.logger.child('Table'),
      });

      // Render shape tree (Phase 2+5)
      // Use ordered parsing to preserve z-order of interleaved elements
      await this.renderShapeTreeOrdered(ctx, parser, slideData.path);

      // Export to image
      const imageData = await this.exportCanvas(canvas);

      return {
        imageData,
        width: targetWidth,
        height: targetHeight,
        success: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to render slide', {
        index: slideData.index,
        error: message,
      });

      return {
        imageData: Buffer.alloc(0),
        width: 0,
        height: 0,
        success: false,
        error: message,
      };
    }
  }

  /**
   * Calculates target dimensions maintaining aspect ratio.
   */
  private calculateDimensions(
    slideWidthEmu: number,
    slideHeightEmu: number
  ): {
    targetWidth: number;
    targetHeight: number;
    scaleX: number;
    scaleY: number;
  } {
    // Convert EMU to pixels at 96 DPI
    const nativeWidth = this.unitConverter.emuToPixels(slideWidthEmu);
    const nativeHeight = this.unitConverter.emuToPixels(slideHeightEmu);
    const aspectRatio = nativeWidth / nativeHeight;

    let targetWidth: number;
    let targetHeight: number;

    if (this.options.height !== undefined) {
      // Both width and height specified
      targetWidth = this.options.width;
      targetHeight = this.options.height;
    } else {
      // Only width specified, calculate height from aspect ratio
      targetWidth = this.options.width;
      targetHeight = Math.round(targetWidth / aspectRatio);
    }

    // Calculate scale factors
    const scaleX = targetWidth / nativeWidth;
    const scaleY = targetHeight / nativeHeight;

    return { targetWidth, targetHeight, scaleX, scaleY };
  }

  /**
   * Exports the canvas to an image buffer.
   */
  private async exportCanvas(canvas: Canvas): Promise<Buffer> {
    if (this.options.format === 'jpeg') {
      return canvas.toBuffer('jpeg', {
        quality: this.options.jpegQuality / 100,
      });
    }

    // Get raw PNG from canvas
    const pngBuffer = await canvas.toBuffer('png');

    // Apply PNG optimization if configured
    const optimization = this.options.pngOptimization;
    if (optimization && optimization !== 'none') {
      // Initialize optimizer on first use (lazy loading of Sharp)
      if (!this.pngOptimizerInitialized) {
        await this.pngOptimizer.initialize();
        this.pngOptimizerInitialized = true;
      }

      if (this.pngOptimizer.isAvailable()) {
        const optimized = await this.pngOptimizer.optimize(pngBuffer, optimization);

        // Log compression stats in debug mode
        if (this.options.debugMode) {
          const stats = this.pngOptimizer.getCompressionStats(pngBuffer, optimized);
          this.logger.debug('PNG optimization', {
            preset: typeof optimization === 'string' ? optimization : 'custom',
            originalSize: stats.originalSize,
            optimizedSize: stats.optimizedSize,
            reduction: `${stats.reductionPercent}%`,
          });
        }

        return optimized;
      }
    }

    return pngBuffer;
  }

  /**
   * Converts EMU coordinates to pixel coordinates.
   */
  emuToPixels(context: SlideRenderContext, emuX: number, emuY: number): { x: number; y: number } {
    return {
      x: context.unitConverter.emuToPixels(emuX) * context.scaleX,
      y: context.unitConverter.emuToPixels(emuY) * context.scaleY,
    };
  }

  /**
   * Converts EMU dimensions to pixel dimensions.
   */
  emuToPixelSize(
    context: SlideRenderContext,
    emuWidth: number,
    emuHeight: number
  ): { width: number; height: number } {
    return {
      width: context.unitConverter.emuToPixels(emuWidth) * context.scaleX,
      height: context.unitConverter.emuToPixels(emuHeight) * context.scaleY,
    };
  }

  /**
   * Scales a font size from points to target pixels.
   */
  scaleFontSize(context: SlideRenderContext, fontSizePoints: number): number {
    // Convert points to EMU, then to pixels, then apply scale
    const fontEmu = fontSizePoints * 12700; // 12700 EMU per point
    return context.unitConverter.emuToPixels(fontEmu) * context.scaleY;
  }

  /**
   * Gets the background color for contrast calculations.
   */
  getBackgroundColor(
    slideNode: PptxXmlNode,
    layoutNode?: PptxXmlNode,
    masterNode?: PptxXmlNode
  ): Rgba {
    return this.backgroundRenderer.getBackgroundColor(slideNode, layoutNode, masterNode) ?? Colors.white;
  }

  /**
   * Renders all shapes in the shape tree using ordered parsing.
   * Uses the raw XML and parses with preserveOrder to maintain correct z-order.
   * Elements that appear later in the XML are rendered on top.
   */
  private async renderShapeTreeOrdered(
    ctx: CanvasRenderingContext2D,
    parser: PptxParser,
    slidePath: string
  ): Promise<void> {
    if (!this.shapeRenderer) {
      this.logger.warn('ShapeRenderer not initialized');
      return;
    }

    // Get the slide XML with preserved element order
    const orderedSlide = await parser.readXmlOrdered(slidePath);

    // Navigate to p:sld > p:cSld > p:spTree in the ordered structure
    const spTreeChildren = this.navigateToSpTree(orderedSlide);
    if (!spTreeChildren) {
      this.logger.debug('No shape tree found in slide');
      return;
    }

    // Get all elements in document order using shared element type constants
    const orderedElements = getOrderedChildren(spTreeChildren, SHAPE_ELEMENT_TYPES);

    // Count elements for logging
    let shapeCount = 0;
    let connectionCount = 0;
    let pictureCount = 0;
    let groupCount = 0;
    let graphicFrameCount = 0;
    let alternateContentCount = 0;

    // Render each element in document order
    for (const { tagName, node } of orderedElements) {
      try {
        switch (tagName) {
          case 'p:sp':
            await this.shapeRenderer.renderShape(ctx, node);
            shapeCount++;
            break;

          case 'p:cxnSp':
            this.shapeRenderer.renderConnectionShape(ctx, node);
            connectionCount++;
            break;

          case 'p:pic':
            // Render picture elements (Phase 4)
            await this.shapeRenderer.renderPicture(ctx, node);
            pictureCount++;
            break;

          case 'p:grpSp':
            // Render group shapes (Phase 5)
            await this.renderGroupShape(ctx, node);
            groupCount++;
            break;

          case 'p:graphicFrame':
            // Render graphic frames - charts, tables (Phase 5)
            await this.renderGraphicFrame(ctx, node);
            graphicFrameCount++;
            break;

          case 'mc:AlternateContent':
            // Render alternate content - SmartArt fallbacks (Phase 5)
            await this.renderAlternateContent(ctx, node);
            alternateContentCount++;
            break;
        }
      } catch (error) {
        this.logger.warn(`Failed to render ${tagName}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.debug('Rendered shape tree', {
      shapes: shapeCount,
      connections: connectionCount,
      pictures: pictureCount,
      groups: groupCount,
      graphicFrames: graphicFrameCount,
      alternateContent: alternateContentCount,
    });
  }

  /**
   * Navigates the ordered XML structure to find the spTree children.
   * Returns the array of children in document order, or undefined if not found.
   */
  private navigateToSpTree(orderedSlide: OrderedXmlOutput): OrderedXmlOutput | undefined {
    // orderedSlide is an array that may contain XML declaration and p:sld element
    // Format: [{ '?xml': [...], ':@': {...} }, { 'p:sld': [...], ':@': {...} }]
    if (!orderedSlide || !Array.isArray(orderedSlide) || orderedSlide.length === 0) {
      return undefined;
    }

    // Find the p:sld element (skip XML declaration and other elements)
    let sldChildren: OrderedXmlOutput | undefined;
    for (const element of orderedSlide) {
      if (element && element['p:sld']) {
        sldChildren = element['p:sld'] as OrderedXmlOutput;
        break;
      }
    }

    if (!sldChildren || !Array.isArray(sldChildren)) {
      return undefined;
    }

    // Find p:cSld in the children
    for (const child of sldChildren) {
      const cSldChildren = child['p:cSld'] as OrderedXmlOutput | undefined;
      if (cSldChildren && Array.isArray(cSldChildren)) {
        // Find p:spTree in p:cSld children
        for (const cSldChild of cSldChildren) {
          const spTreeChildren = cSldChild['p:spTree'] as OrderedXmlOutput | undefined;
          if (spTreeChildren && Array.isArray(spTreeChildren)) {
            return spTreeChildren;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Renders a group shape (p:grpSp) element.
   * @param ctx Canvas 2D context
   * @param grpSpNode Group shape XML node
   * @param parentGroupTransform Optional parent group transform for nested groups
   */
  private async renderGroupShape(
    ctx: CanvasRenderingContext2D,
    grpSpNode: PptxXmlNode,
    parentGroupTransform?: GroupTransform
  ): Promise<void> {
    if (!this.groupShapeRenderer || !this.shapeRenderer) {
      this.logger.warn('GroupShapeRenderer or ShapeRenderer not initialized');
      return;
    }

    // Define the render callback for child elements
    const renderChild = async (
      childCtx: CanvasRenderingContext2D,
      tagName: string,
      node: PptxXmlNode,
      groupTransform?: GroupTransform
    ): Promise<void> => {
      switch (tagName) {
        case 'p:sp':
          this.renderShapeInGroup(childCtx, node, groupTransform);
          break;

        case 'p:cxnSp':
          this.renderConnectionShapeInGroup(childCtx, node, groupTransform);
          break;

        case 'p:pic':
          await this.renderPictureInGroup(childCtx, node, groupTransform);
          break;

        case 'p:grpSp':
          // Recursive group rendering
          await this.renderGroupShape(childCtx, node, groupTransform);
          break;

        case 'p:graphicFrame':
          await this.renderGraphicFrame(childCtx, node);
          break;

        case 'mc:AlternateContent':
          await this.renderAlternateContent(childCtx, node);
          break;

        default:
          this.logger.debug('Unknown child element in group', { tagName });
      }
    };

    await this.groupShapeRenderer.renderGroupShape(ctx, grpSpNode, renderChild, parentGroupTransform);
  }

  /**
   * Renders a shape within a group, applying the group transform.
   */
  private renderShapeInGroup(
    ctx: CanvasRenderingContext2D,
    spNode: PptxXmlNode,
    groupTransform?: GroupTransform
  ): void {
    if (!this.shapeRenderer || !this.groupShapeRenderer) return;

    // Get shape properties
    const spPr = getXmlChild(spNode, 'p:spPr');
    const shapeTransform = this.groupShapeRenderer.parseShapeTransform(spPr);
    if (!shapeTransform) {
      this.logger.debug('Shape in group has no transform, skipping');
      return;
    }

    // Apply group transform to get final pixel transform
    const pixelTransform = this.groupShapeRenderer.toPixelTransform(shapeTransform, groupTransform);

    // Use the ShapeRenderer's existing shape rendering with the modified transform
    // We render the shape by creating a temporary context state
    this.shapeRenderer.renderShapeWithTransform(ctx, spNode, pixelTransform);
  }

  /**
   * Renders a connection shape within a group.
   */
  private renderConnectionShapeInGroup(
    ctx: CanvasRenderingContext2D,
    cxnSpNode: PptxXmlNode,
    groupTransform?: GroupTransform
  ): void {
    if (!this.shapeRenderer || !this.groupShapeRenderer) return;

    // Get shape properties
    const spPr = getXmlChild(cxnSpNode, 'p:spPr');
    const shapeTransform = this.groupShapeRenderer.parseShapeTransform(spPr);
    if (!shapeTransform) {
      this.logger.debug('Connection shape in group has no transform, skipping');
      return;
    }

    // Apply group transform
    const pixelTransform = this.groupShapeRenderer.toPixelTransform(shapeTransform, groupTransform);

    // Render the connection shape with the transformed coordinates
    this.shapeRenderer.renderConnectionShapeWithTransform(ctx, cxnSpNode, pixelTransform);
  }

  /**
   * Renders a picture within a group.
   */
  private async renderPictureInGroup(
    ctx: CanvasRenderingContext2D,
    picNode: PptxXmlNode,
    groupTransform?: GroupTransform
  ): Promise<void> {
    if (!this.shapeRenderer || !this.groupShapeRenderer) return;

    // Get shape properties
    const spPr = getXmlChild(picNode, 'p:spPr');
    const shapeTransform = this.groupShapeRenderer.parseShapeTransform(spPr);
    if (!shapeTransform) {
      this.logger.debug('Picture in group has no transform, skipping');
      return;
    }

    // Apply group transform
    const pixelTransform = this.groupShapeRenderer.toPixelTransform(shapeTransform, groupTransform);

    // Render the picture with the transformed coordinates
    await this.shapeRenderer.renderPictureWithTransform(ctx, picNode, pixelTransform);
  }

  /**
   * Renders a graphic frame element (p:graphicFrame).
   * Handles charts, tables, and other embedded content.
   */
  private async renderGraphicFrame(
    ctx: CanvasRenderingContext2D,
    graphicFrameNode: PptxXmlNode
  ): Promise<void> {
    if (!this.currentParser) {
      this.logger.warn('Parser not available for graphic frame rendering');
      return;
    }

    // Get transform (position and size)
    const xfrm = getXmlChild(graphicFrameNode, 'p:xfrm');
    if (!xfrm) {
      this.logger.debug('GraphicFrame has no transform');
      return;
    }

    const off = getXmlChild(xfrm, 'a:off');
    const ext = getXmlChild(xfrm, 'a:ext');
    if (!off || !ext) {
      this.logger.debug('GraphicFrame missing offset or extent');
      return;
    }

    const x = parseInt(getXmlAttr(off, 'x') ?? '0', 10);
    const y = parseInt(getXmlAttr(off, 'y') ?? '0', 10);
    const cx = parseInt(getXmlAttr(ext, 'cx') ?? '0', 10);
    const cy = parseInt(getXmlAttr(ext, 'cy') ?? '0', 10);

    // Convert to pixels
    const bounds: Rect = {
      x: this.unitConverter.emuToPixels(x) * this.currentScaleX,
      y: this.unitConverter.emuToPixels(y) * this.currentScaleY,
      width: this.unitConverter.emuToPixels(cx) * this.currentScaleX,
      height: this.unitConverter.emuToPixels(cy) * this.currentScaleY,
    };

    if (bounds.width <= 0 || bounds.height <= 0) {
      this.logger.debug('GraphicFrame has invalid bounds');
      return;
    }

    // Get the graphic data
    const graphic = getXmlChild(graphicFrameNode, 'a:graphic');
    const graphicData = graphic ? getXmlChild(graphic, 'a:graphicData') : undefined;
    if (!graphicData) {
      this.logger.debug('GraphicFrame has no graphic data');
      return;
    }

    const uri = getXmlAttr(graphicData, 'uri');
    this.logger.debug('GraphicFrame URI', { uri });

    // Check if this is a chart
    if (uri === 'http://schemas.openxmlformats.org/drawingml/2006/chart') {
      await this.renderChartFrame(ctx, graphicData, bounds);
    }
    // Check if this is a table
    else if (uri === 'http://schemas.openxmlformats.org/drawingml/2006/table') {
      this.renderTableFrame(ctx, graphicData, bounds);
    }
    // Other types
    else if (uri) {
      this.logger.debug('Unhandled graphic type', { uri });
    }
  }

  /**
   * Renders a chart from a graphic frame.
   */
  private async renderChartFrame(
    ctx: CanvasRenderingContext2D,
    graphicData: PptxXmlNode,
    bounds: Rect
  ): Promise<void> {
    if (!this.currentParser) return;

    // Get the chart reference
    const chartRef = getXmlChild(graphicData, 'c:chart');
    if (!chartRef) {
      this.logger.debug('No chart reference in graphic data');
      return;
    }

    const chartRelId = getXmlAttr(chartRef, 'r:id');
    if (!chartRelId) {
      this.logger.debug('Chart has no relationship ID');
      return;
    }

    try {
      // Resolve the chart path from relationships
      const slideRelsPath = this.currentSlidePath
        .replace('slides/', 'slides/_rels/')
        .replace('.xml', '.xml.rels');
      const chartTarget = await this.currentParser.getRelationshipTarget(slideRelsPath, chartRelId);

      if (!chartTarget) {
        this.logger.warn('Could not resolve chart relationship', { id: chartRelId });
        return;
      }

      const chartPath = this.currentParser.resolvePath(this.currentSlidePath, chartTarget);
      this.logger.debug('Rendering chart', { path: chartPath });

      // Parse and render the chart
      const chartData = await this.chartParser.parseChart(this.currentParser, chartPath);
      if (chartData) {
        this.chartRenderer.renderChart(ctx, chartData, bounds);
      }
    } catch (error) {
      this.logger.warn('Failed to render chart', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Renders a table from a graphic frame.
   */
  private renderTableFrame(
    ctx: CanvasRenderingContext2D,
    graphicData: PptxXmlNode,
    bounds: Rect
  ): void {
    if (!this.tableRenderer) {
      this.logger.warn('TableRenderer not initialized');
      return;
    }

    // Get the table node (a:tbl)
    const tableNode = getXmlChild(graphicData, 'a:tbl');
    if (!tableNode) {
      this.logger.debug('No table node in graphic data');
      return;
    }

    try {
      this.logger.debug('Rendering table', { bounds });
      this.tableRenderer.renderTable(ctx, tableNode, bounds);
    } catch (error) {
      this.logger.warn('Failed to render table', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Renders mc:AlternateContent elements.
   * Used for SmartArt, diagrams, and other content with fallback representations.
   */
  private async renderAlternateContent(
    ctx: CanvasRenderingContext2D,
    alternateContentNode: PptxXmlNode
  ): Promise<void> {
    // Define the render callback for child elements
    const renderChild = async (
      childCtx: CanvasRenderingContext2D,
      tagName: string,
      node: PptxXmlNode
    ): Promise<void> => {
      switch (tagName) {
        case 'p:sp':
          if (this.shapeRenderer) {
            await this.shapeRenderer.renderShape(childCtx, node);
          }
          break;

        case 'p:cxnSp':
          if (this.shapeRenderer) {
            this.shapeRenderer.renderConnectionShape(childCtx, node);
          }
          break;

        case 'p:pic':
          if (this.shapeRenderer) {
            await this.shapeRenderer.renderPicture(childCtx, node);
          }
          break;

        case 'p:grpSp':
          await this.renderGroupShape(childCtx, node);
          break;

        case 'p:graphicFrame':
          await this.renderGraphicFrame(childCtx, node);
          break;

        default:
          this.logger.debug('Unknown child element in AlternateContent', { tagName });
      }
    };

    await this.alternateContentRenderer.renderAlternateContent(ctx, alternateContentNode, renderChild);
  }
}
