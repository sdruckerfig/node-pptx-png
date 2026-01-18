/**
 * Renders group shapes (p:grpSp elements) to canvas.
 * Handles nested transforms, recursive child rendering, and group-level clipping.
 */

import type { CanvasRenderingContext2D } from 'skia-canvas';
import type { Rect, Rgba } from '../types/geometry.js';
import type { PptxXmlNode } from '../core/PptxParser.js';
import { getXmlChild, getXmlAttr, getChildrenInDocumentOrder } from '../core/PptxParser.js';
import { TransformCalculator, type ParsedTransform, type PixelTransform } from '../geometry/TransformCalculator.js';
import { UnitConverter } from '../core/UnitConverter.js';
import { SHAPE_ELEMENT_TYPES } from '../core/constants.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Group transform data parsed from p:grpSpPr.
 */
export interface GroupTransform {
  /** Group position and size in EMU */
  groupBounds: ParsedTransform;
  /** Child coordinate space offset and size in EMU */
  childBounds: ParsedTransform;
  /** Scale factor for child X coordinates */
  scaleX: number;
  /** Scale factor for child Y coordinates */
  scaleY: number;
}

/**
 * Configuration for GroupShapeRenderer.
 */
export interface GroupShapeRendererConfig {
  /** Horizontal scale factor (EMU to pixels) */
  scaleX: number;
  /** Vertical scale factor (EMU to pixels) */
  scaleY: number;
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Callback function type for rendering child elements.
 * This allows the SlideRenderer to pass its rendering functions.
 */
export type ChildRenderCallback = (
  ctx: CanvasRenderingContext2D,
  tagName: string,
  node: PptxXmlNode,
  parentGroupTransform?: GroupTransform
) => Promise<void>;

/**
 * Renders group shapes (p:grpSp) to canvas.
 */
export class GroupShapeRenderer {
  private readonly logger: ILogger;
  private readonly scaleX: number;
  private readonly scaleY: number;
  private readonly transformCalculator: TransformCalculator;
  private readonly unitConverter: UnitConverter;

  constructor(config: GroupShapeRendererConfig) {
    this.logger = config.logger ?? createLogger('warn', 'GroupShapeRenderer');
    this.scaleX = config.scaleX;
    this.scaleY = config.scaleY;
    this.transformCalculator = new TransformCalculator();
    this.unitConverter = new UnitConverter();
  }

  /**
   * Parses the group transform from a p:grpSp element.
   * @param grpSpNode The p:grpSp XML node
   * @returns Group transform data or undefined if invalid
   */
  parseGroupTransform(grpSpNode: PptxXmlNode): GroupTransform | undefined {
    // Get group shape properties
    const grpSpPr = getXmlChild(grpSpNode, 'p:grpSpPr');
    if (!grpSpPr) {
      this.logger.debug('Group shape has no grpSpPr');
      return undefined;
    }

    // Get the group transform (a:xfrm)
    const xfrm = getXmlChild(grpSpPr, 'a:xfrm');
    if (!xfrm) {
      this.logger.debug('Group shape has no xfrm');
      return undefined;
    }

    // Parse group offset and extent
    const off = getXmlChild(xfrm, 'a:off');
    const ext = getXmlChild(xfrm, 'a:ext');

    if (!off || !ext) {
      this.logger.debug('Group shape missing offset or extent');
      return undefined;
    }

    const groupX = parseInt(getXmlAttr(off, 'x') ?? '0', 10);
    const groupY = parseInt(getXmlAttr(off, 'y') ?? '0', 10);
    const groupCx = parseInt(getXmlAttr(ext, 'cx') ?? '0', 10);
    const groupCy = parseInt(getXmlAttr(ext, 'cy') ?? '0', 10);

    // Parse rotation and flip
    const rotation = parseInt(getXmlAttr(xfrm, 'rot') ?? '0', 10) / 60000; // Convert from 60000ths
    const flipH = getXmlAttr(xfrm, 'flipH') === '1';
    const flipV = getXmlAttr(xfrm, 'flipV') === '1';

    const groupBounds: ParsedTransform = {
      x: groupX,
      y: groupY,
      width: groupCx,
      height: groupCy,
      rotation,
      flipH,
      flipV,
    };

    // Parse child offset and extent (coordinate space for children)
    const chOff = getXmlChild(xfrm, 'a:chOff');
    const chExt = getXmlChild(xfrm, 'a:chExt');

    // Default child bounds to group bounds if not specified
    const childX = chOff ? parseInt(getXmlAttr(chOff, 'x') ?? '0', 10) : groupX;
    const childY = chOff ? parseInt(getXmlAttr(chOff, 'y') ?? '0', 10) : groupY;
    const childCx = chExt ? parseInt(getXmlAttr(chExt, 'cx') ?? '0', 10) : groupCx;
    const childCy = chExt ? parseInt(getXmlAttr(chExt, 'cy') ?? '0', 10) : groupCy;

    const childBounds: ParsedTransform = {
      x: childX,
      y: childY,
      width: childCx,
      height: childCy,
      rotation: 0,
      flipH: false,
      flipV: false,
    };

    // Calculate scale factors for transforming child coordinates to group coordinates
    const scaleX = childCx > 0 ? groupCx / childCx : 1;
    const scaleY = childCy > 0 ? groupCy / childCy : 1;

    this.logger.debug('Parsed group transform', {
      group: { x: groupX, y: groupY, cx: groupCx, cy: groupCy },
      child: { x: childX, y: childY, cx: childCx, cy: childCy },
      scale: { x: scaleX, y: scaleY },
    });

    return {
      groupBounds,
      childBounds,
      scaleX,
      scaleY,
    };
  }

  /**
   * Transforms a child shape's EMU coordinates to account for group transform.
   * @param childTransform The child's transform in child coordinate space
   * @param groupTransform The group's transform data
   * @returns Transformed coordinates in slide coordinate space (EMU)
   */
  transformChildToSlide(
    childTransform: ParsedTransform,
    groupTransform: GroupTransform
  ): ParsedTransform {
    const { groupBounds, childBounds, scaleX, scaleY } = groupTransform;

    // Transform child position from child coordinate space to group coordinate space
    // 1. Subtract child offset to get position relative to child origin
    // 2. Scale by group/child ratio
    // 3. Add group offset to get final slide position
    const relX = childTransform.x - childBounds.x;
    const relY = childTransform.y - childBounds.y;

    const transformedX = groupBounds.x + relX * scaleX;
    const transformedY = groupBounds.y + relY * scaleY;
    const transformedWidth = childTransform.width * scaleX;
    const transformedHeight = childTransform.height * scaleY;

    // Combine rotations and flips
    const combinedRotation = groupBounds.rotation + childTransform.rotation;
    const combinedFlipH = groupBounds.flipH !== childTransform.flipH;
    const combinedFlipV = groupBounds.flipV !== childTransform.flipV;

    return {
      x: transformedX,
      y: transformedY,
      width: transformedWidth,
      height: transformedHeight,
      rotation: combinedRotation,
      flipH: combinedFlipH,
      flipV: combinedFlipV,
    };
  }

  /**
   * Gets the ordered child elements from a group shape.
   * Uses proper document order parsing to preserve z-order.
   * @param grpSpNode The p:grpSp XML node
   * @returns Array of ordered child elements in document order
   */
  getOrderedChildren(grpSpNode: PptxXmlNode): Array<{ tagName: string; node: PptxXmlNode }> {
    // Use getChildrenInDocumentOrder to preserve z-order across mixed element types
    const orderedElements = getChildrenInDocumentOrder(
      grpSpNode,
      'p:grpSp',
      SHAPE_ELEMENT_TYPES
    );

    // Check if we have multiple element types and log a warning if z-order may be affected
    const elementTypesPresent = new Set<string>();
    for (const { tagName } of orderedElements) {
      elementTypesPresent.add(tagName);
    }

    if (elementTypesPresent.size > 1) {
      this.logger.debug('Group contains multiple element types - z-order preserved via ordered parsing', {
        elementTypes: Array.from(elementTypesPresent),
        count: orderedElements.length,
      });
    }

    // Convert to the expected return format
    return orderedElements.map(({ tagName, node }) => ({ tagName, node }));
  }

  /**
   * Renders a group shape and all its children.
   * @param ctx Canvas 2D context
   * @param grpSpNode The p:grpSp XML node
   * @param renderChild Callback function to render individual child elements
   * @param parentGroupTransform Optional parent group transform for nested groups
   */
  async renderGroupShape(
    ctx: CanvasRenderingContext2D,
    grpSpNode: PptxXmlNode,
    renderChild: ChildRenderCallback,
    parentGroupTransform?: GroupTransform
  ): Promise<void> {
    // Check if hidden
    const nvGrpSpPr = getXmlChild(grpSpNode, 'p:nvGrpSpPr');
    const cNvPr = nvGrpSpPr ? getXmlChild(nvGrpSpPr, 'p:cNvPr') : undefined;
    const hidden = cNvPr ? getXmlAttr(cNvPr, 'hidden') === '1' : false;

    if (hidden) {
      this.logger.debug('Group shape is hidden, skipping');
      return;
    }

    const id = cNvPr ? getXmlAttr(cNvPr, 'id') ?? '0' : '0';
    const name = cNvPr ? getXmlAttr(cNvPr, 'name') : undefined;

    this.logger.debug('Rendering group shape', { id, name });

    // Parse group transform
    let groupTransform = this.parseGroupTransform(grpSpNode);
    if (!groupTransform) {
      this.logger.warn('Could not parse group transform, skipping', { id });
      return;
    }

    // If this group is nested inside another group, apply the parent transform
    if (parentGroupTransform) {
      const transformedBounds = this.transformChildToSlide(
        groupTransform.groupBounds,
        parentGroupTransform
      );
      groupTransform = {
        ...groupTransform,
        groupBounds: transformedBounds,
      };
    }

    // Get all children in order
    const children = this.getOrderedChildren(grpSpNode);

    this.logger.debug('Group has children', { count: children.length });

    // Render each child
    for (const { tagName, node } of children) {
      try {
        await renderChild(ctx, tagName, node, groupTransform);
      } catch (error) {
        this.logger.warn('Failed to render group child', {
          tagName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Parses a shape's transform from its spPr element.
   * @param spPr The shape properties node
   * @returns Parsed transform or undefined
   */
  parseShapeTransform(spPr: PptxXmlNode | undefined): ParsedTransform | undefined {
    return this.transformCalculator.parseTransform(spPr);
  }

  /**
   * Converts an EMU transform to pixel transform, applying group scaling.
   * @param transform EMU-based transform
   * @param groupTransform Optional group transform for nested shapes
   * @returns Pixel-based transform
   */
  toPixelTransform(
    transform: ParsedTransform,
    groupTransform?: GroupTransform
  ): PixelTransform {
    // If there's a group transform, apply it first
    const finalTransform = groupTransform
      ? this.transformChildToSlide(transform, groupTransform)
      : transform;

    return this.transformCalculator.toPixelTransform(
      finalTransform,
      this.scaleX,
      this.scaleY
    );
  }
}

/**
 * Creates a GroupShapeRenderer instance.
 */
export function createGroupShapeRenderer(
  scaleX: number,
  scaleY: number,
  logger?: ILogger
): GroupShapeRenderer {
  return new GroupShapeRenderer({
    scaleX,
    scaleY,
    logger,
  });
}
