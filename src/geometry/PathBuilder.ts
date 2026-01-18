/**
 * Path construction utilities for building canvas paths.
 * Provides a fluent API for constructing paths that can be rendered to canvas.
 */

import type { CanvasRenderingContext2D } from 'skia-canvas';
import type { Point, PathSegment, Path, PathBounds, ArcParameters } from '../types/geometry.js';

/**
 * Builder for constructing paths from segments.
 * Supports moveTo, lineTo, curveTo, arcTo, and closePath operations.
 */
export class PathBuilder {
  private segments: PathSegment[] = [];
  private currentPoint: Point = { x: 0, y: 0 };
  private startPoint: Point = { x: 0, y: 0 };
  private hasMoved = false;

  /**
   * Moves the current point without drawing.
   */
  moveTo(x: number, y: number): this {
    this.segments.push({
      type: 'moveTo',
      points: [{ x, y }],
    });
    this.currentPoint = { x, y };
    this.startPoint = { x, y };
    this.hasMoved = true;
    return this;
  }

  /**
   * Draws a line from the current point to the specified point.
   */
  lineTo(x: number, y: number): this {
    if (!this.hasMoved) {
      this.moveTo(x, y);
      return this;
    }
    this.segments.push({
      type: 'lineTo',
      points: [{ x, y }],
    });
    this.currentPoint = { x, y };
    return this;
  }

  /**
   * Draws a cubic bezier curve.
   * @param cp1x First control point X
   * @param cp1y First control point Y
   * @param cp2x Second control point X
   * @param cp2y Second control point Y
   * @param x End point X
   * @param y End point Y
   */
  cubicBezierTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): this {
    if (!this.hasMoved) {
      this.moveTo(cp1x, cp1y);
    }
    this.segments.push({
      type: 'cubicBezierTo',
      points: [
        { x: cp1x, y: cp1y },
        { x: cp2x, y: cp2y },
        { x, y },
      ],
    });
    this.currentPoint = { x, y };
    return this;
  }

  /**
   * Draws a quadratic bezier curve.
   * @param cpx Control point X
   * @param cpy Control point Y
   * @param x End point X
   * @param y End point Y
   */
  quadBezierTo(cpx: number, cpy: number, x: number, y: number): this {
    if (!this.hasMoved) {
      this.moveTo(cpx, cpy);
    }
    this.segments.push({
      type: 'quadBezierTo',
      points: [
        { x: cpx, y: cpy },
        { x, y },
      ],
    });
    this.currentPoint = { x, y };
    return this;
  }

  /**
   * Draws an elliptical arc.
   * Uses SVG arc notation for compatibility.
   * @param rx Radius X
   * @param ry Radius Y
   * @param xAxisRotation Rotation of the ellipse in degrees
   * @param largeArcFlag Whether to use the larger arc
   * @param sweepFlag Direction of the arc (true = clockwise)
   * @param x End point X
   * @param y End point Y
   */
  arcTo(
    rx: number,
    ry: number,
    xAxisRotation: number,
    largeArcFlag: boolean,
    sweepFlag: boolean,
    x: number,
    y: number
  ): this {
    if (!this.hasMoved) {
      this.moveTo(x, y);
      return this;
    }

    // Store arc parameters using proper SVG-style arc fields
    const arcParams: ArcParameters = {
      rx,
      ry,
      xAxisRotation,
      largeArcFlag,
      sweepFlag,
    };

    this.segments.push({
      type: 'arcTo',
      points: [{ x, y }],
      arc: arcParams,
    });

    this.currentPoint = { x, y };
    return this;
  }

  /**
   * Closes the current path by drawing a line to the start point.
   */
  closePath(): this {
    this.segments.push({ type: 'close' });
    this.currentPoint = { ...this.startPoint };
    return this;
  }

  /**
   * Adds a rectangle to the path.
   */
  addRectangle(x: number, y: number, width: number, height: number): this {
    this.moveTo(x, y);
    this.lineTo(x + width, y);
    this.lineTo(x + width, y + height);
    this.lineTo(x, y + height);
    this.closePath();
    return this;
  }

  /**
   * Adds an ellipse to the path using bezier curves.
   * @param cx Center X
   * @param cy Center Y
   * @param rx Radius X
   * @param ry Radius Y
   */
  addEllipse(cx: number, cy: number, rx: number, ry: number): this {
    // Approximate ellipse with 4 cubic bezier curves
    // Magic number for bezier approximation of quarter circle
    const kappa = 0.5522847498;
    const ox = rx * kappa;
    const oy = ry * kappa;

    // Start at right-most point
    this.moveTo(cx + rx, cy);

    // Top-right quadrant
    this.cubicBezierTo(cx + rx, cy - oy, cx + ox, cy - ry, cx, cy - ry);

    // Top-left quadrant
    this.cubicBezierTo(cx - ox, cy - ry, cx - rx, cy - oy, cx - rx, cy);

    // Bottom-left quadrant
    this.cubicBezierTo(cx - rx, cy + oy, cx - ox, cy + ry, cx, cy + ry);

    // Bottom-right quadrant
    this.cubicBezierTo(cx + ox, cy + ry, cx + rx, cy + oy, cx + rx, cy);

    this.closePath();
    return this;
  }

  /**
   * Adds a rounded rectangle to the path.
   * @param x Top-left X
   * @param y Top-left Y
   * @param width Width
   * @param height Height
   * @param radius Corner radius
   */
  addRoundedRectangle(x: number, y: number, width: number, height: number, radius: number): this {
    const r = Math.min(radius, Math.min(width, height) / 2);
    const kappa = 0.5522847498;
    const o = r * kappa;

    // Start at top edge, after top-left corner
    this.moveTo(x + r, y);

    // Top edge
    this.lineTo(x + width - r, y);

    // Top-right corner
    this.cubicBezierTo(x + width - r + o, y, x + width, y + r - o, x + width, y + r);

    // Right edge
    this.lineTo(x + width, y + height - r);

    // Bottom-right corner
    this.cubicBezierTo(x + width, y + height - r + o, x + width - r + o, y + height, x + width - r, y + height);

    // Bottom edge
    this.lineTo(x + r, y + height);

    // Bottom-left corner
    this.cubicBezierTo(x + r - o, y + height, x, y + height - r + o, x, y + height - r);

    // Left edge
    this.lineTo(x, y + r);

    // Top-left corner
    this.cubicBezierTo(x, y + r - o, x + r - o, y, x + r, y);

    this.closePath();
    return this;
  }

  /**
   * Resets the builder to start a new path.
   */
  reset(): this {
    this.segments = [];
    this.currentPoint = { x: 0, y: 0 };
    this.startPoint = { x: 0, y: 0 };
    this.hasMoved = false;
    return this;
  }

  /**
   * Builds and returns the completed path.
   */
  build(options?: { fill?: boolean; stroke?: boolean }): Path {
    return {
      segments: [...this.segments],
      fill: options?.fill ?? true,
      stroke: options?.stroke ?? true,
    };
  }

  /**
   * Gets the current point.
   */
  getCurrentPoint(): Point {
    return { ...this.currentPoint };
  }
}

/**
 * Calculates the bounding box of a path.
 */
export function calculatePathBounds(path: Path): PathBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const segment of path.segments) {
    if (segment.points) {
      for (const point of segment.points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }
  }

  // Handle case of empty path
  if (!isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Applies a path to a canvas 2D context.
 * Creates a Path2D object or draws directly to the context.
 */
export function applyPathToContext(
  ctx: CanvasRenderingContext2D,
  path: Path,
  startNewPath = true
): void {
  if (startNewPath) {
    ctx.beginPath();
  }

  let currentX = 0;
  let currentY = 0;

  for (const segment of path.segments) {
    switch (segment.type) {
      case 'moveTo':
        if (segment.points?.[0]) {
          currentX = segment.points[0].x;
          currentY = segment.points[0].y;
          ctx.moveTo(currentX, currentY);
        }
        break;

      case 'lineTo':
        if (segment.points?.[0]) {
          currentX = segment.points[0].x;
          currentY = segment.points[0].y;
          ctx.lineTo(currentX, currentY);
        }
        break;

      case 'cubicBezierTo':
        if (segment.points && segment.points.length >= 3) {
          const cp1 = segment.points[0];
          const cp2 = segment.points[1];
          const end = segment.points[2];
          if (cp1 && cp2 && end) {
            ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
            currentX = end.x;
            currentY = end.y;
          }
        }
        break;

      case 'quadBezierTo':
        if (segment.points && segment.points.length >= 2) {
          const cp = segment.points[0];
          const end = segment.points[1];
          if (cp && end) {
            ctx.quadraticCurveTo(cp.x, cp.y, end.x, end.y);
            currentX = end.x;
            currentY = end.y;
          }
        }
        break;

      case 'arcTo':
        if (segment.points?.[0] && segment.arc) {
          const endPoint = segment.points[0];
          // Convert SVG-style arc to canvas arc using proper arc parameters
          applyArcToContext(
            ctx,
            currentX,
            currentY,
            endPoint.x,
            endPoint.y,
            segment.arc.rx,
            segment.arc.ry,
            segment.arc.xAxisRotation,
            segment.arc.largeArcFlag,
            segment.arc.sweepFlag
          );
          currentX = endPoint.x;
          currentY = endPoint.y;
        } else if (segment.points?.[0] && segment.legacyArc) {
          // Handle legacy arc format (startAngle/swingAngle) for custom geometry
          const endPoint = segment.points[0];
          applyLegacyArcToContext(
            ctx,
            currentX,
            currentY,
            endPoint.x,
            endPoint.y,
            segment.legacyArc.rx,
            segment.legacyArc.ry,
            segment.legacyArc.startAngle,
            segment.legacyArc.swingAngle
          );
          currentX = endPoint.x;
          currentY = endPoint.y;
        }
        break;

      case 'close':
        ctx.closePath();
        break;
    }
  }
}

/**
 * Applies an SVG-style arc to a canvas context.
 * Converts from SVG arc notation to canvas arc commands.
 * @param ctx Canvas 2D context
 * @param x1 Start point X
 * @param y1 Start point Y
 * @param x2 End point X
 * @param y2 End point Y
 * @param rx Horizontal radius
 * @param ry Vertical radius
 * @param xAxisRotation X-axis rotation in degrees
 * @param largeArcFlag Whether to use the larger arc
 * @param sweepFlag Direction of the arc (true = clockwise)
 */
function applyArcToContext(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rx: number,
  ry: number,
  xAxisRotation: number,
  largeArcFlag: boolean,
  sweepFlag: boolean
): void {

  // Handle degenerate cases
  if (x1 === x2 && y1 === y2) {
    return;
  }

  if (rx === 0 || ry === 0) {
    ctx.lineTo(x2, y2);
    return;
  }

  // Ensure radii are positive
  rx = Math.abs(rx);
  ry = Math.abs(ry);

  // Convert rotation to radians
  const phi = (xAxisRotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // Step 1: Compute (x1', y1')
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  // Step 2: Compute (cx', cy')
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;
  const rx2 = rx * rx;
  const ry2 = ry * ry;

  // Check if radii are large enough
  const lambda = x1p2 / rx2 + y1p2 / ry2;
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx = sqrtLambda * rx;
    ry = sqrtLambda * ry;
  }

  // Recompute with potentially adjusted radii
  const rx2New = rx * rx;
  const ry2New = ry * ry;

  let sign = largeArcFlag === sweepFlag ? -1 : 1;
  let sq = Math.max(0, (rx2New * ry2New - rx2New * y1p2 - ry2New * x1p2) / (rx2New * y1p2 + ry2New * x1p2));
  sq = sign * Math.sqrt(sq);

  const cxp = sq * (rx * y1p) / ry;
  const cyp = sq * -(ry * x1p) / rx;

  // Step 3: Compute (cx, cy)
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  // Step 4: Compute angles
  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  // Angle between vectors
  function angleBetween(ux: number, uy: number, vx: number, vy: number): number {
    const n = ux * vx + uy * vy;
    const d = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    let a = Math.acos(Math.max(-1, Math.min(1, n / d)));
    if (ux * vy - uy * vx < 0) {
      a = -a;
    }
    return a;
  }

  const theta1 = angleBetween(1, 0, ux, uy);
  let dTheta = angleBetween(ux, uy, vx, vy);

  if (!sweepFlag && dTheta > 0) {
    dTheta -= 2 * Math.PI;
  } else if (sweepFlag && dTheta < 0) {
    dTheta += 2 * Math.PI;
  }

  // Draw arc using canvas ellipse
  ctx.ellipse(cx, cy, rx, ry, phi, theta1, theta1 + dTheta, !sweepFlag);
}

/**
 * Applies a legacy OpenXML-style arc (startAngle/swingAngle) to a canvas context.
 * Used for custom geometry paths that use the OpenXML arc representation.
 * @param ctx Canvas 2D context
 * @param x1 Start point X
 * @param y1 Start point Y
 * @param x2 End point X
 * @param y2 End point Y
 * @param rx Horizontal radius
 * @param ry Vertical radius
 * @param startAngle Start angle in degrees
 * @param swingAngle Swing angle in degrees (positive = clockwise)
 */
function applyLegacyArcToContext(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rx: number,
  ry: number,
  startAngle: number,
  swingAngle: number
): void {
  // Handle degenerate cases
  if (x1 === x2 && y1 === y2) {
    return;
  }

  if (rx === 0 || ry === 0) {
    ctx.lineTo(x2, y2);
    return;
  }

  // Ensure radii are positive
  rx = Math.abs(rx);
  ry = Math.abs(ry);

  // Convert degrees to radians
  const startRad = (startAngle * Math.PI) / 180;
  const swingRad = (swingAngle * Math.PI) / 180;
  const endRad = startRad + swingRad;

  // Calculate the center of the arc based on start point and angle
  // The start point should be at startAngle on the ellipse
  const cx = x1 - rx * Math.cos(startRad);
  const cy = y1 - ry * Math.sin(startRad);

  // Determine sweep direction (counterclockwise = true for canvas)
  const counterclockwise = swingAngle < 0;

  // Draw arc using canvas ellipse
  ctx.ellipse(cx, cy, rx, ry, 0, startRad, endRad, counterclockwise);
}

/**
 * Creates a Path2D object from a path definition.
 */
export function pathToPath2D(path: Path): Path2D {
  const path2d = new Path2D();
  let currentX = 0;
  let currentY = 0;

  for (const segment of path.segments) {
    switch (segment.type) {
      case 'moveTo':
        if (segment.points?.[0]) {
          currentX = segment.points[0].x;
          currentY = segment.points[0].y;
          path2d.moveTo(currentX, currentY);
        }
        break;

      case 'lineTo':
        if (segment.points?.[0]) {
          currentX = segment.points[0].x;
          currentY = segment.points[0].y;
          path2d.lineTo(currentX, currentY);
        }
        break;

      case 'cubicBezierTo':
        if (segment.points && segment.points.length >= 3) {
          const cp1 = segment.points[0];
          const cp2 = segment.points[1];
          const end = segment.points[2];
          if (cp1 && cp2 && end) {
            path2d.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
            currentX = end.x;
            currentY = end.y;
          }
        }
        break;

      case 'quadBezierTo':
        if (segment.points && segment.points.length >= 2) {
          const cp = segment.points[0];
          const end = segment.points[1];
          if (cp && end) {
            path2d.quadraticCurveTo(cp.x, cp.y, end.x, end.y);
            currentX = end.x;
            currentY = end.y;
          }
        }
        break;

      case 'arcTo':
        // Arc segments are not supported in Path2D conversion.
        // Use applyPathToContext() instead which handles arcs via canvas ellipse().
        throw new Error(
          'Arc segments are not supported in Path2D conversion. Use applyPathToContext instead.'
        );

      case 'close':
        path2d.closePath();
        break;
    }
  }

  return path2d;
}
