/**
 * Generates paths for preset shapes defined in ECMA-376.
 * Implements common shapes: rectangles, ellipses, triangles, arrows, stars, etc.
 */

import type { Path, Rect } from '../types/geometry.js';
import { PathBuilder } from './PathBuilder.js';

/**
 * Adjustment value scale factor.
 * OpenXML adjustment values are percentages as integers (0-100000 = 0-100%).
 */
const ADJUSTMENT_SCALE = 100000;

/**
 * Default adjustment values for various shapes.
 */
const DEFAULT_ADJUSTMENTS: Record<string, Record<string, number>> = {
  roundRect: { adj: 16667 },        // ~16.67% corner radius
  parallelogram: { adj: 25000 },    // 25% offset
  trapezoid: { adj: 25000 },        // 25% offset
  hexagon: { adj: 25000 },          // 25% offset
  octagon: { adj: 29289 },          // ~29.3% (1 - sqrt(2)/2)
  rightArrow: { adj1: 50000, adj2: 50000 },
  leftArrow: { adj1: 50000, adj2: 50000 },
  upArrow: { adj1: 50000, adj2: 50000 },
  downArrow: { adj1: 50000, adj2: 50000 },
  chevron: { adj: 50000 },
  homePlate: { adj: 50000 },
  plus: { adj: 25000 },
  wedgeRectCallout: { adj1: -20000, adj2: 62500 },
};

/**
 * Calculator for preset geometry shapes.
 */
export class PresetGeometryCalculator {
  /**
   * List of supported preset geometry names.
   */
  static readonly SUPPORTED_SHAPES = [
    // Basic shapes
    'rect',
    'roundRect',
    'ellipse',
    'triangle',
    'rtTriangle',
    'diamond',
    'parallelogram',
    'trapezoid',
    'pentagon',
    'hexagon',
    'octagon',
    'line',
    // Arrows
    'rightArrow',
    'leftArrow',
    'upArrow',
    'downArrow',
    // Stars
    'star5',
    // Plus and special
    'plus',
    'heart',
    // Callouts
    'wedgeRectCallout',
    // Flowchart
    'flowChartProcess',
    'flowChartDecision',
    'flowChartTerminator',
  ] as const;

  /**
   * Checks if a preset geometry is supported.
   */
  isSupported(presetName: string): boolean {
    return (PresetGeometryCalculator.SUPPORTED_SHAPES as readonly string[]).includes(presetName);
  }

  /**
   * Creates a path for the specified preset geometry.
   * @param presetName OpenXML preset geometry name
   * @param bounds Bounding rectangle in pixels
   * @param adjustValues Optional adjustment values for parameterized shapes
   * @returns Path for rendering, or undefined if geometry is not supported
   */
  createPath(
    presetName: string,
    bounds: Rect,
    adjustValues?: Map<string, number>
  ): Path | undefined {
    // Validate bounds
    if (presetName === 'line') {
      // Lines can have zero height or width
      if (bounds.width <= 0 && bounds.height <= 0) return undefined;
    } else {
      if (bounds.width <= 0 || bounds.height <= 0) return undefined;
    }

    const adj = this.resolveAdjustments(presetName, adjustValues);

    switch (presetName) {
      // Basic shapes
      case 'rect':
        return this.createRectangle(bounds);
      case 'roundRect':
        return this.createRoundedRectangle(bounds, adj);
      case 'ellipse':
      case 'oval':
        return this.createEllipse(bounds);
      case 'triangle':
        return this.createTriangle(bounds);
      case 'rtTriangle':
        return this.createRightTriangle(bounds);
      case 'diamond':
        return this.createDiamond(bounds);
      case 'parallelogram':
        return this.createParallelogram(bounds, adj);
      case 'trapezoid':
        return this.createTrapezoid(bounds, adj);
      case 'pentagon':
        return this.createPentagon(bounds);
      case 'hexagon':
        return this.createHexagon(bounds, adj);
      case 'octagon':
        return this.createOctagon(bounds, adj);
      case 'line':
        return this.createLine(bounds);

      // Arrows
      case 'rightArrow':
        return this.createArrow(bounds, 'right', adj);
      case 'leftArrow':
        return this.createArrow(bounds, 'left', adj);
      case 'upArrow':
        return this.createArrow(bounds, 'up', adj);
      case 'downArrow':
        return this.createArrow(bounds, 'down', adj);
      case 'chevron':
        return this.createChevron(bounds, adj);
      case 'homePlate':
        return this.createHomePlate(bounds, adj);

      // Stars
      case 'star5':
        return this.createStar(bounds, 5);

      // Plus and special
      case 'plus':
        return this.createPlus(bounds, adj);
      case 'heart':
        return this.createHeart(bounds);

      // Callouts
      case 'wedgeRectCallout':
        return this.createWedgeRectCallout(bounds, adj);

      // Flowchart
      case 'flowChartProcess':
        return this.createRectangle(bounds);
      case 'flowChartDecision':
        return this.createDiamond(bounds);
      case 'flowChartTerminator':
        return this.createFlowChartTerminator(bounds);

      default:
        return undefined;
    }
  }

  /**
   * Resolves adjustment values, using defaults for missing values.
   */
  private resolveAdjustments(
    presetName: string,
    adjustValues?: Map<string, number>
  ): Record<string, number> {
    const defaults = DEFAULT_ADJUSTMENTS[presetName] ?? {};
    const result = { ...defaults };

    if (adjustValues) {
      for (const [key, value] of adjustValues) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Gets an adjustment value with fallback.
   */
  private getAdj(adj: Record<string, number>, name: string, defaultValue: number): number {
    return adj[name] ?? defaultValue;
  }

  // ============================================================
  // Basic Shapes
  // ============================================================

  private createRectangle(bounds: Rect): Path {
    const builder = new PathBuilder();
    builder.addRectangle(bounds.x, bounds.y, bounds.width, bounds.height);
    return builder.build();
  }

  private createRoundedRectangle(bounds: Rect, adj: Record<string, number>): Path {
    const adjValue = this.getAdj(adj, 'adj', 16667);
    const minDim = Math.min(bounds.width, bounds.height);
    let cornerRadius = minDim * (adjValue / ADJUSTMENT_SCALE);

    // Clamp to half of minimum dimension
    cornerRadius = Math.min(cornerRadius, minDim / 2);

    if (cornerRadius <= 0) {
      return this.createRectangle(bounds);
    }

    const builder = new PathBuilder();
    builder.addRoundedRectangle(bounds.x, bounds.y, bounds.width, bounds.height, cornerRadius);
    return builder.build();
  }

  private createEllipse(bounds: Rect): Path {
    const builder = new PathBuilder();
    builder.addEllipse(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      bounds.width / 2,
      bounds.height / 2
    );
    return builder.build();
  }

  private createTriangle(bounds: Rect): Path {
    const builder = new PathBuilder();

    // Isoceles triangle: top-center, bottom-left, bottom-right
    builder.moveTo(bounds.x + bounds.width / 2, bounds.y);
    builder.lineTo(bounds.x + bounds.width, bounds.y + bounds.height);
    builder.lineTo(bounds.x, bounds.y + bounds.height);
    builder.closePath();

    return builder.build();
  }

  private createRightTriangle(bounds: Rect): Path {
    const builder = new PathBuilder();

    // Right triangle: top-left, bottom-left, bottom-right
    builder.moveTo(bounds.x, bounds.y);
    builder.lineTo(bounds.x, bounds.y + bounds.height);
    builder.lineTo(bounds.x + bounds.width, bounds.y + bounds.height);
    builder.closePath();

    return builder.build();
  }

  private createDiamond(bounds: Rect): Path {
    const builder = new PathBuilder();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    builder.moveTo(centerX, bounds.y);                    // Top
    builder.lineTo(bounds.x + bounds.width, centerY);     // Right
    builder.lineTo(centerX, bounds.y + bounds.height);    // Bottom
    builder.lineTo(bounds.x, centerY);                    // Left
    builder.closePath();

    return builder.build();
  }

  private createParallelogram(bounds: Rect, adj: Record<string, number>): Path {
    const adjValue = this.getAdj(adj, 'adj', 25000);
    const offset = bounds.width * (adjValue / ADJUSTMENT_SCALE);

    const builder = new PathBuilder();

    builder.moveTo(bounds.x + offset, bounds.y);
    builder.lineTo(bounds.x + bounds.width, bounds.y);
    builder.lineTo(bounds.x + bounds.width - offset, bounds.y + bounds.height);
    builder.lineTo(bounds.x, bounds.y + bounds.height);
    builder.closePath();

    return builder.build();
  }

  private createTrapezoid(bounds: Rect, adj: Record<string, number>): Path {
    const adjValue = this.getAdj(adj, 'adj', 25000);
    const offset = bounds.width * (adjValue / ADJUSTMENT_SCALE);

    const builder = new PathBuilder();

    builder.moveTo(bounds.x + offset, bounds.y);
    builder.lineTo(bounds.x + bounds.width - offset, bounds.y);
    builder.lineTo(bounds.x + bounds.width, bounds.y + bounds.height);
    builder.lineTo(bounds.x, bounds.y + bounds.height);
    builder.closePath();

    return builder.build();
  }

  private createPentagon(bounds: Rect): Path {
    return this.createRegularPolygon(bounds, 5, -90);
  }

  private createHexagon(bounds: Rect, adj: Record<string, number>): Path {
    const adjValue = this.getAdj(adj, 'adj', 25000);
    const offset = bounds.width * (adjValue / ADJUSTMENT_SCALE);
    const centerY = bounds.y + bounds.height / 2;

    const builder = new PathBuilder();

    builder.moveTo(bounds.x + offset, bounds.y);
    builder.lineTo(bounds.x + bounds.width - offset, bounds.y);
    builder.lineTo(bounds.x + bounds.width, centerY);
    builder.lineTo(bounds.x + bounds.width - offset, bounds.y + bounds.height);
    builder.lineTo(bounds.x + offset, bounds.y + bounds.height);
    builder.lineTo(bounds.x, centerY);
    builder.closePath();

    return builder.build();
  }

  private createOctagon(bounds: Rect, adj: Record<string, number>): Path {
    const adjValue = this.getAdj(adj, 'adj', 29289);
    const offsetX = bounds.width * (adjValue / ADJUSTMENT_SCALE);
    const offsetY = bounds.height * (adjValue / ADJUSTMENT_SCALE);

    const builder = new PathBuilder();

    builder.moveTo(bounds.x + offsetX, bounds.y);
    builder.lineTo(bounds.x + bounds.width - offsetX, bounds.y);
    builder.lineTo(bounds.x + bounds.width, bounds.y + offsetY);
    builder.lineTo(bounds.x + bounds.width, bounds.y + bounds.height - offsetY);
    builder.lineTo(bounds.x + bounds.width - offsetX, bounds.y + bounds.height);
    builder.lineTo(bounds.x + offsetX, bounds.y + bounds.height);
    builder.lineTo(bounds.x, bounds.y + bounds.height - offsetY);
    builder.lineTo(bounds.x, bounds.y + offsetY);
    builder.closePath();

    return builder.build();
  }

  private createLine(bounds: Rect): Path {
    const builder = new PathBuilder();

    if (bounds.height < 1) {
      // Horizontal line
      builder.moveTo(bounds.x, bounds.y);
      builder.lineTo(bounds.x + bounds.width, bounds.y);
    } else if (bounds.width < 1) {
      // Vertical line
      builder.moveTo(bounds.x, bounds.y);
      builder.lineTo(bounds.x, bounds.y + bounds.height);
    } else {
      // Diagonal line
      builder.moveTo(bounds.x, bounds.y);
      builder.lineTo(bounds.x + bounds.width, bounds.y + bounds.height);
    }

    return builder.build({ fill: false, stroke: true });
  }

  // ============================================================
  // Arrows
  // ============================================================

  private createArrow(
    bounds: Rect,
    direction: 'right' | 'left' | 'up' | 'down',
    adj: Record<string, number>
  ): Path {
    const adj1 = this.getAdj(adj, 'adj1', 50000);
    const adj2 = this.getAdj(adj, 'adj2', 50000);

    const builder = new PathBuilder();

    switch (direction) {
      case 'right':
        this.createHorizontalArrow(builder, bounds, adj1, adj2, false);
        break;
      case 'left':
        this.createHorizontalArrow(builder, bounds, adj1, adj2, true);
        break;
      case 'up':
        this.createVerticalArrow(builder, bounds, adj1, adj2, true);
        break;
      case 'down':
        this.createVerticalArrow(builder, bounds, adj1, adj2, false);
        break;
    }

    return builder.build();
  }

  private createHorizontalArrow(
    builder: PathBuilder,
    bounds: Rect,
    adj1: number,
    adj2: number,
    leftPointing: boolean
  ): void {
    const headWidthRatio = adj1 / ADJUSTMENT_SCALE;
    const shaftHeightRatio = 1 - (adj2 / ADJUSTMENT_SCALE);

    const headWidth = bounds.width * headWidthRatio;
    const shaftHeight = bounds.height * shaftHeightRatio;
    const shaftTop = bounds.y + (bounds.height - shaftHeight) / 2;
    const shaftBottom = shaftTop + shaftHeight;
    const centerY = bounds.y + bounds.height / 2;

    if (leftPointing) {
      builder.moveTo(bounds.x, centerY);
      builder.lineTo(bounds.x + headWidth, bounds.y);
      builder.lineTo(bounds.x + headWidth, shaftTop);
      builder.lineTo(bounds.x + bounds.width, shaftTop);
      builder.lineTo(bounds.x + bounds.width, shaftBottom);
      builder.lineTo(bounds.x + headWidth, shaftBottom);
      builder.lineTo(bounds.x + headWidth, bounds.y + bounds.height);
    } else {
      builder.moveTo(bounds.x + bounds.width, centerY);
      builder.lineTo(bounds.x + bounds.width - headWidth, bounds.y);
      builder.lineTo(bounds.x + bounds.width - headWidth, shaftTop);
      builder.lineTo(bounds.x, shaftTop);
      builder.lineTo(bounds.x, shaftBottom);
      builder.lineTo(bounds.x + bounds.width - headWidth, shaftBottom);
      builder.lineTo(bounds.x + bounds.width - headWidth, bounds.y + bounds.height);
    }

    builder.closePath();
  }

  private createVerticalArrow(
    builder: PathBuilder,
    bounds: Rect,
    adj1: number,
    adj2: number,
    upPointing: boolean
  ): void {
    const headHeightRatio = adj1 / ADJUSTMENT_SCALE;
    const shaftWidthRatio = 1 - (adj2 / ADJUSTMENT_SCALE);

    const headHeight = bounds.height * headHeightRatio;
    const shaftWidth = bounds.width * shaftWidthRatio;
    const shaftLeft = bounds.x + (bounds.width - shaftWidth) / 2;
    const shaftRight = shaftLeft + shaftWidth;
    const centerX = bounds.x + bounds.width / 2;

    if (upPointing) {
      builder.moveTo(centerX, bounds.y);
      builder.lineTo(bounds.x + bounds.width, bounds.y + headHeight);
      builder.lineTo(shaftRight, bounds.y + headHeight);
      builder.lineTo(shaftRight, bounds.y + bounds.height);
      builder.lineTo(shaftLeft, bounds.y + bounds.height);
      builder.lineTo(shaftLeft, bounds.y + headHeight);
      builder.lineTo(bounds.x, bounds.y + headHeight);
    } else {
      builder.moveTo(centerX, bounds.y + bounds.height);
      builder.lineTo(bounds.x + bounds.width, bounds.y + bounds.height - headHeight);
      builder.lineTo(shaftRight, bounds.y + bounds.height - headHeight);
      builder.lineTo(shaftRight, bounds.y);
      builder.lineTo(shaftLeft, bounds.y);
      builder.lineTo(shaftLeft, bounds.y + bounds.height - headHeight);
      builder.lineTo(bounds.x, bounds.y + bounds.height - headHeight);
    }

    builder.closePath();
  }

  /**
   * Creates a chevron shape (arrow pointing right with V-notch on left).
   * The 'adj' value controls how far the point extends (default 50000 = 50%).
   * Per OOXML spec, the indent is based on height, not width.
   */
  private createChevron(bounds: Rect, adj: Record<string, number>): Path {
    const builder = new PathBuilder();

    // adj controls the indentation as percentage of height (not width)
    // This maintains proper chevron proportions regardless of aspect ratio
    const adjValue = this.getAdj(adj, 'adj', 50000);
    const indentRatio = adjValue / ADJUSTMENT_SCALE;
    // The indent is based on height to maintain consistent chevron appearance
    const indent = bounds.height * indentRatio;

    const centerY = bounds.y + bounds.height / 2;

    // Draw chevron shape (arrow pointing right with V-notch on left)
    // The shape is like a pentagon with a triangular notch cut from the left side
    //
    //    1 -------- 2
    //     \          \
    //      6          3
    //     /          /
    //    5 -------- 4
    //
    // Start at top-left outer corner
    builder.moveTo(bounds.x, bounds.y);                                    // 1
    // Go to top-right corner (before the point)
    builder.lineTo(bounds.x + bounds.width - indent, bounds.y);            // 2
    // Go to right point (tip of arrow)
    builder.lineTo(bounds.x + bounds.width, centerY);                      // 3
    // Go to bottom-right corner (after the point)
    builder.lineTo(bounds.x + bounds.width - indent, bounds.y + bounds.height); // 4
    // Go to bottom-left outer corner
    builder.lineTo(bounds.x, bounds.y + bounds.height);                    // 5
    // Go to left notch point (V pointing into the shape)
    builder.lineTo(bounds.x + indent, centerY);                            // 6

    builder.closePath();
    return builder.build();
  }

  /**
   * Creates a homePlate shape (pentagon arrow pointing right).
   * Similar to chevron but with a flat back.
   */
  private createHomePlate(bounds: Rect, adj: Record<string, number>): Path {
    const builder = new PathBuilder();

    const adjValue = this.getAdj(adj, 'adj', 50000);
    const pointRatio = adjValue / ADJUSTMENT_SCALE;
    const pointWidth = bounds.width * pointRatio;

    const centerY = bounds.y + bounds.height / 2;

    // Draw homePlate shape (pentagon pointing right)
    builder.moveTo(bounds.x, bounds.y);
    builder.lineTo(bounds.x + bounds.width - pointWidth, bounds.y);
    builder.lineTo(bounds.x + bounds.width, centerY);
    builder.lineTo(bounds.x + bounds.width - pointWidth, bounds.y + bounds.height);
    builder.lineTo(bounds.x, bounds.y + bounds.height);

    builder.closePath();
    return builder.build();
  }

  // ============================================================
  // Stars
  // ============================================================

  private createStar(bounds: Rect, points: number): Path {
    const builder = new PathBuilder();

    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const outerRadiusX = bounds.width / 2;
    const outerRadiusY = bounds.height / 2;
    const innerRadiusX = outerRadiusX * 0.4;
    const innerRadiusY = outerRadiusY * 0.4;

    const startAngle = -Math.PI / 2; // Start at top
    const angleStep = Math.PI / points;

    for (let i = 0; i < points * 2; i++) {
      const angle = startAngle + i * angleStep;
      const isOuter = i % 2 === 0;
      const rx = isOuter ? outerRadiusX : innerRadiusX;
      const ry = isOuter ? outerRadiusY : innerRadiusY;

      const x = centerX + rx * Math.cos(angle);
      const y = centerY + ry * Math.sin(angle);

      if (i === 0) {
        builder.moveTo(x, y);
      } else {
        builder.lineTo(x, y);
      }
    }

    builder.closePath();
    return builder.build();
  }

  // ============================================================
  // Plus and Special Shapes
  // ============================================================

  private createPlus(bounds: Rect, adj: Record<string, number>): Path {
    const adjValue = this.getAdj(adj, 'adj', 25000);
    const armThickness = Math.min(bounds.width, bounds.height) * (adjValue / ADJUSTMENT_SCALE);

    const builder = new PathBuilder();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const halfArm = armThickness / 2;

    // Draw plus sign clockwise from top-left of top arm
    builder.moveTo(centerX - halfArm, bounds.y);
    builder.lineTo(centerX + halfArm, bounds.y);
    builder.lineTo(centerX + halfArm, centerY - halfArm);
    builder.lineTo(bounds.x + bounds.width, centerY - halfArm);
    builder.lineTo(bounds.x + bounds.width, centerY + halfArm);
    builder.lineTo(centerX + halfArm, centerY + halfArm);
    builder.lineTo(centerX + halfArm, bounds.y + bounds.height);
    builder.lineTo(centerX - halfArm, bounds.y + bounds.height);
    builder.lineTo(centerX - halfArm, centerY + halfArm);
    builder.lineTo(bounds.x, centerY + halfArm);
    builder.lineTo(bounds.x, centerY - halfArm);
    builder.lineTo(centerX - halfArm, centerY - halfArm);
    builder.closePath();

    return builder.build();
  }

  private createHeart(bounds: Rect): Path {
    const builder = new PathBuilder();

    const centerX = bounds.x + bounds.width / 2;
    const topY = bounds.y + bounds.height * 0.25;
    const bottomY = bounds.y + bounds.height;

    // Start at bottom point
    builder.moveTo(centerX, bottomY);

    // Left side curve
    builder.cubicBezierTo(
      bounds.x - bounds.width * 0.1,
      bounds.y + bounds.height * 0.6,
      bounds.x,
      bounds.y,
      centerX,
      topY
    );

    // Right side curve
    builder.cubicBezierTo(
      bounds.x + bounds.width,
      bounds.y,
      bounds.x + bounds.width + bounds.width * 0.1,
      bounds.y + bounds.height * 0.6,
      centerX,
      bottomY
    );

    builder.closePath();
    return builder.build();
  }

  // ============================================================
  // Callouts
  // ============================================================

  private createWedgeRectCallout(bounds: Rect, adj: Record<string, number>): Path {
    const adj1 = this.getAdj(adj, 'adj1', -20000);
    const adj2 = this.getAdj(adj, 'adj2', 62500);

    const builder = new PathBuilder();
    const bodyBottom = bounds.y + bounds.height - bounds.height * 0.2;

    // Pointer tip position
    const pointerTipX = bounds.x + bounds.width / 2 + bounds.width * (adj1 / ADJUSTMENT_SCALE);
    let pointerTipY = bounds.y + bounds.height * (adj2 / ADJUSTMENT_SCALE);

    // Clamp pointer tip to be outside the body
    pointerTipY = Math.max(pointerTipY, bodyBottom);

    // Pointer base positions
    const pointerBaseLeft = bounds.x + bounds.width * 0.35;
    const pointerBaseRight = bounds.x + bounds.width * 0.65;

    builder.moveTo(bounds.x, bounds.y);
    builder.lineTo(bounds.x + bounds.width, bounds.y);
    builder.lineTo(bounds.x + bounds.width, bodyBottom);
    builder.lineTo(pointerBaseRight, bodyBottom);
    builder.lineTo(pointerTipX, pointerTipY);
    builder.lineTo(pointerBaseLeft, bodyBottom);
    builder.lineTo(bounds.x, bodyBottom);
    builder.closePath();

    return builder.build();
  }

  // ============================================================
  // Flowchart Shapes
  // ============================================================

  private createFlowChartTerminator(bounds: Rect): Path {
    // Stadium/pill shape (rounded rectangle with semicircular ends)
    const builder = new PathBuilder();
    const radius = bounds.height / 2;

    if (bounds.width < bounds.height) {
      // Too narrow, just use ellipse
      return this.createEllipse(bounds);
    }

    // Start at top edge, after the left semicircle
    builder.moveTo(bounds.x + radius, bounds.y);

    // Top edge (left to right)
    builder.lineTo(bounds.x + bounds.width - radius, bounds.y);

    // Right semicircle: from top-right going clockwise to bottom-right
    // Arc from (x + width - radius, y) to (x + width - radius, y + height)
    // The arc goes through (x + width, y + radius) at the rightmost point
    builder.arcTo(radius, radius, 0, false, true, bounds.x + bounds.width - radius, bounds.y + bounds.height);

    // Bottom edge (right to left)
    builder.lineTo(bounds.x + radius, bounds.y + bounds.height);

    // Left semicircle: from bottom-left going clockwise back to top-left
    // Arc from (x + radius, y + height) to (x + radius, y)
    // The arc goes through (x, y + radius) at the leftmost point
    builder.arcTo(radius, radius, 0, false, true, bounds.x + radius, bounds.y);

    builder.closePath();

    return builder.build();
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  private createRegularPolygon(bounds: Rect, sides: number, startAngleDegrees: number): Path {
    const builder = new PathBuilder();

    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const radiusX = bounds.width / 2;
    const radiusY = bounds.height / 2;
    const startAngle = (startAngleDegrees * Math.PI) / 180;
    const angleStep = (2 * Math.PI) / sides;

    for (let i = 0; i < sides; i++) {
      const angle = startAngle + i * angleStep;
      const x = centerX + radiusX * Math.cos(angle);
      const y = centerY + radiusY * Math.sin(angle);

      if (i === 0) {
        builder.moveTo(x, y);
      } else {
        builder.lineTo(x, y);
      }
    }

    builder.closePath();
    return builder.build();
  }

  /**
   * Gets the text bounds for a shape, accounting for non-rectangular shapes.
   * For shapes like chevrons, the text area is smaller than the full bounds.
   *
   * @param presetName The preset geometry name
   * @param bounds The full shape bounds
   * @param adjustValues Optional adjustment values
   * @returns The bounds to use for text layout
   */
  getTextBounds(
    presetName: string,
    bounds: Rect,
    adjustValues?: Map<string, number>
  ): Rect {
    const adj = this.resolveAdjustments(presetName, adjustValues);

    switch (presetName) {
      case 'chevron': {
        // Chevron has indents on both left (notch) and right (point) based on height
        const adjValue = this.getAdj(adj, 'adj', 50000);
        const indentRatio = adjValue / ADJUSTMENT_SCALE;
        const indent = bounds.height * indentRatio; // Height-based, matching the shape geometry
        // Text area starts after left indent and ends before right indent
        return {
          x: bounds.x + indent,
          y: bounds.y,
          width: bounds.width - indent * 2,
          height: bounds.height,
        };
      }

      case 'homePlate': {
        // HomePlate only has indent on the right (arrow point)
        const adjValue = this.getAdj(adj, 'adj', 50000);
        const pointRatio = adjValue / ADJUSTMENT_SCALE;
        const pointWidth = bounds.width * pointRatio;
        return {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width - pointWidth,
          height: bounds.height,
        };
      }

      case 'rightArrow': {
        // Arrow has shaft and head, text goes in shaft area
        const adj1 = this.getAdj(adj, 'adj1', 50000);
        const adj2 = this.getAdj(adj, 'adj2', 50000);
        const headRatio = adj2 / ADJUSTMENT_SCALE;
        const headWidth = bounds.width * headRatio;
        const shaftRatio = adj1 / ADJUSTMENT_SCALE;
        const shaftHeight = bounds.height * shaftRatio;
        const shaftY = bounds.y + (bounds.height - shaftHeight) / 2;
        return {
          x: bounds.x,
          y: shaftY,
          width: bounds.width - headWidth,
          height: shaftHeight,
        };
      }

      case 'leftArrow': {
        const adj1 = this.getAdj(adj, 'adj1', 50000);
        const adj2 = this.getAdj(adj, 'adj2', 50000);
        const headRatio = adj2 / ADJUSTMENT_SCALE;
        const headWidth = bounds.width * headRatio;
        const shaftRatio = adj1 / ADJUSTMENT_SCALE;
        const shaftHeight = bounds.height * shaftRatio;
        const shaftY = bounds.y + (bounds.height - shaftHeight) / 2;
        return {
          x: bounds.x + headWidth,
          y: shaftY,
          width: bounds.width - headWidth,
          height: shaftHeight,
        };
      }

      default:
        // Most shapes use full bounds for text
        return bounds;
    }
  }
}

/**
 * Default preset geometry calculator instance.
 */
export const presetGeometryCalculator = new PresetGeometryCalculator();
