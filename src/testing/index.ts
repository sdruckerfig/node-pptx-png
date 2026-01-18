/**
 * Visual Testing Infrastructure
 *
 * Provides tools for comparing rendered images against baseline images
 * and calculating fidelity scores to ensure rendering quality.
 */

// Visual Comparator
export {
  compareImages,
  VisualComparator,
  type ComparisonResult,
  type ComparisonOptions,
} from './VisualComparator.js';

// Fidelity Tester
export {
  runFidelityTest,
  formatReport,
  FidelityTester,
  type FidelityReport,
  type SlideReport,
  type FidelityTestOptions,
} from './FidelityTester.js';

// Baseline Generator
export {
  generateBaselines,
  generateBaselinesViaPdf,
  isLibreOfficeAvailable,
  BaselineGenerator,
  type BaselineGenerationResult,
  type BaselineGeneratorOptions,
} from './BaselineGenerator.js';
