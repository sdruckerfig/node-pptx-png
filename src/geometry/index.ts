/**
 * Geometry module for path building and calculations.
 */

export { PathBuilder, calculatePathBounds, applyPathToContext, pathToPath2D } from './PathBuilder.js';
export {
  TransformCalculator,
  defaultTransformCalculator,
  type ParsedTransform,
  type PixelTransform,
} from './TransformCalculator.js';
export { PresetGeometryCalculator, presetGeometryCalculator } from './PresetGeometryCalculator.js';
