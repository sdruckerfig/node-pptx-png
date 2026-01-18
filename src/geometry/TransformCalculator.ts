/**
 * Handles shape transforms (position, size, rotation, flip).
 * Parses xfrm element from OpenXML and applies transforms to canvas context.
 */

import type { CanvasRenderingContext2D } from 'skia-canvas';
import type { ShapeTransform, Rect, Point } from '../types/geometry.js';
import type { PptxXmlNode } from '../core/PptxParser.js';
import { getXmlAttr, getXmlChild } from '../core/PptxParser.js';
import { UnitConverter, ANGLE_UNIT_PER_DEGREE } from '../core/UnitConverter.js';

/**
 * Transform data parsed from xfrm element.
 */
export interface ParsedTransform {
  /** X offset in EMU */
  x: number;
  /** Y offset in EMU */
  y: number;
  /** Width in EMU */
  width: number;
  /** Height in EMU */
  height: number;
  /** Rotation in degrees (0-360) */
  rotation: number;
  /** Horizontal flip */
  flipH: boolean;
  /** Vertical flip */
  flipV: boolean;
}

/**
 * Pixel-space transform after unit conversion.
 */
export interface PixelTransform {
  /** X offset in pixels */
  x: number;
  /** Y offset in pixels */
  y: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Rotation in radians */
  rotation: number;
  /** Horizontal flip */
  flipH: boolean;
  /** Vertical flip */
  flipV: boolean;
}

/**
 * Calculator for shape transforms.
 */
export class TransformCalculator {
  private readonly unitConverter: UnitConverter;

  constructor(unitConverter?: UnitConverter) {
    this.unitConverter = unitConverter ?? new UnitConverter();
  }

  /**
   * Parses an xfrm element from shape properties.
   * @param spPr Shape properties node containing a:xfrm
   * @returns Parsed transform or undefined if no transform found
   */
  parseTransform(spPr: PptxXmlNode | undefined): ParsedTransform | undefined {
    if (!spPr) return undefined;

    const xfrm = getXmlChild(spPr, 'a:xfrm');
    if (!xfrm) return undefined;

    return this.parseXfrmElement(xfrm);
  }

  /**
   * Parses an xfrm element directly.
   * @param xfrm The a:xfrm element node
   * @returns Parsed transform
   */
  parseXfrmElement(xfrm: PptxXmlNode): ParsedTransform {
    // Get offset (position)
    const off = getXmlChild(xfrm, 'a:off');
    const x = off ? parseInt(getXmlAttr(off, 'x') ?? '0', 10) : 0;
    const y = off ? parseInt(getXmlAttr(off, 'y') ?? '0', 10) : 0;

    // Get extent (size)
    const ext = getXmlChild(xfrm, 'a:ext');
    const width = ext ? parseInt(getXmlAttr(ext, 'cx') ?? '0', 10) : 0;
    const height = ext ? parseInt(getXmlAttr(ext, 'cy') ?? '0', 10) : 0;

    // Get rotation (in 60000ths of a degree)
    const rotAttr = getXmlAttr(xfrm, 'rot');
    const rotationUnits = rotAttr ? parseInt(rotAttr, 10) : 0;
    const rotation = rotationUnits / ANGLE_UNIT_PER_DEGREE;

    // Get flip flags
    const flipH = getXmlAttr(xfrm, 'flipH') === '1';
    const flipV = getXmlAttr(xfrm, 'flipV') === '1';

    return {
      x,
      y,
      width,
      height,
      rotation,
      flipH,
      flipV,
    };
  }

  /**
   * Converts EMU transform to pixel transform.
   * @param transform EMU-based transform
   * @param scaleX Horizontal scale factor
   * @param scaleY Vertical scale factor
   * @returns Pixel-based transform
   */
  toPixelTransform(transform: ParsedTransform, scaleX: number, scaleY: number): PixelTransform {
    return {
      x: this.unitConverter.emuToPixels(transform.x) * scaleX,
      y: this.unitConverter.emuToPixels(transform.y) * scaleY,
      width: this.unitConverter.emuToPixels(transform.width) * scaleX,
      height: this.unitConverter.emuToPixels(transform.height) * scaleY,
      rotation: (transform.rotation * Math.PI) / 180,
      flipH: transform.flipH,
      flipV: transform.flipV,
    };
  }

  /**
   * Applies a transform to a canvas context.
   * The transform is applied as: translate -> rotate -> flip -> translate to origin.
   *
   * **Important:** This method does NOT call ctx.save(). The caller is responsible
   * for managing the canvas context state with save/restore pairs.
   *
   * @param ctx Canvas 2D context
   * @param transform Pixel-based transform to apply
   */
  applyTransform(ctx: CanvasRenderingContext2D, transform: PixelTransform): void {
    const centerX = transform.x + transform.width / 2;
    const centerY = transform.y + transform.height / 2;

    // Move to center
    ctx.translate(centerX, centerY);

    // Apply rotation
    if (transform.rotation !== 0) {
      ctx.rotate(transform.rotation);
    }

    // Apply flips
    if (transform.flipH || transform.flipV) {
      ctx.scale(transform.flipH ? -1 : 1, transform.flipV ? -1 : 1);
    }

    // Move back to top-left corner
    ctx.translate(-transform.width / 2, -transform.height / 2);
  }

  /**
   * Resets the canvas context to before the transform was applied.
   *
   * **Note:** This is a convenience wrapper around ctx.restore(). Since applyTransform
   * does not call ctx.save(), the caller must ensure proper save/restore pairing.
   *
   * @param ctx Canvas 2D context
   * @deprecated Use ctx.restore() directly with your own save/restore management
   */
  resetTransform(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }

  /**
   * Gets the bounding rectangle in pixel space for a transform.
   * Takes rotation into account for the axis-aligned bounding box.
   * @param transform Pixel-based transform
   * @returns Axis-aligned bounding rectangle
   */
  getBoundingRect(transform: PixelTransform): Rect {
    if (transform.rotation === 0) {
      return {
        x: transform.x,
        y: transform.y,
        width: transform.width,
        height: transform.height,
      };
    }

    // Calculate corners
    const corners = this.getTransformedCorners(transform);

    // Find bounding box
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);

    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Gets the four corners of a transformed rectangle in pixel space.
   * @param transform Pixel-based transform
   * @returns Array of four corner points
   */
  getTransformedCorners(transform: PixelTransform): Point[] {
    const centerX = transform.x + transform.width / 2;
    const centerY = transform.y + transform.height / 2;
    const halfWidth = transform.width / 2;
    const halfHeight = transform.height / 2;

    const cos = Math.cos(transform.rotation);
    const sin = Math.sin(transform.rotation);

    // Calculate corners relative to center, then rotate and translate
    const offsets = [
      { x: -halfWidth, y: -halfHeight }, // top-left
      { x: halfWidth, y: -halfHeight },  // top-right
      { x: halfWidth, y: halfHeight },   // bottom-right
      { x: -halfWidth, y: halfHeight },  // bottom-left
    ];

    return offsets.map((offset) => {
      // Apply flip
      let x = transform.flipH ? -offset.x : offset.x;
      let y = transform.flipV ? -offset.y : offset.y;

      // Rotate
      const rotatedX = x * cos - y * sin;
      const rotatedY = x * sin + y * cos;

      // Translate to final position
      return {
        x: centerX + rotatedX,
        y: centerY + rotatedY,
      };
    });
  }

  /**
   * Combines a parent transform with a child transform (for group shapes).
   * @param parent Parent transform in EMU
   * @param child Child transform in EMU
   * @returns Combined transform in EMU
   */
  combineTransforms(parent: ParsedTransform, child: ParsedTransform): ParsedTransform {
    // Child positions are relative to parent
    // Parent rotation affects child position
    const parentRotRad = (parent.rotation * Math.PI) / 180;
    const cos = Math.cos(parentRotRad);
    const sin = Math.sin(parentRotRad);

    // Rotate child offset around parent center
    let childX = child.x;
    let childY = child.y;

    if (parent.rotation !== 0) {
      const rotatedX = childX * cos - childY * sin;
      const rotatedY = childX * sin + childY * cos;
      childX = rotatedX;
      childY = rotatedY;
    }

    // Apply parent flips
    if (parent.flipH) {
      childX = parent.width - childX - child.width;
    }
    if (parent.flipV) {
      childY = parent.height - childY - child.height;
    }

    return {
      x: parent.x + childX,
      y: parent.y + childY,
      width: child.width,
      height: child.height,
      rotation: parent.rotation + child.rotation,
      flipH: parent.flipH !== child.flipH, // XOR for flips
      flipV: parent.flipV !== child.flipV,
    };
  }

  /**
   * Converts a ShapeTransform to ParsedTransform.
   * @param shapeTransform Shape transform from types
   * @returns Parsed transform
   */
  fromShapeTransform(shapeTransform: ShapeTransform): ParsedTransform {
    return {
      x: shapeTransform.offX,
      y: shapeTransform.offY,
      width: shapeTransform.extCx,
      height: shapeTransform.extCy,
      rotation: shapeTransform.rotation ?? 0,
      flipH: shapeTransform.flipH ?? false,
      flipV: shapeTransform.flipV ?? false,
    };
  }

  /**
   * Converts a ParsedTransform to ShapeTransform.
   * @param parsed Parsed transform
   * @returns Shape transform for types
   */
  toShapeTransform(parsed: ParsedTransform): ShapeTransform {
    return {
      offX: parsed.x,
      offY: parsed.y,
      extCx: parsed.width,
      extCy: parsed.height,
      rotation: parsed.rotation,
      flipH: parsed.flipH,
      flipV: parsed.flipV,
    };
  }
}

/**
 * Default transform calculator instance.
 */
export const defaultTransformCalculator = new TransformCalculator();
