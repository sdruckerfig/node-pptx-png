/**
 * FidelityTester - Main testing orchestration for visual fidelity testing
 *
 * Loads baseline images, renders PPTX slides, compares them,
 * and generates detailed reports with per-slide and overall fidelity scores.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { PptxImageRenderer } from '../core/PptxImageRenderer.js';
import type { PptxRenderOptions } from '../types/index.js';
import { compareImages, type ComparisonResult } from './VisualComparator.js';

/**
 * Report for a single slide comparison.
 */
export interface SlideReport {
  /**
   * One-based slide number.
   */
  slideNumber: number;

  /**
   * Structural Similarity Index (0-1).
   */
  ssim: number;

  /**
   * Mean Squared Error.
   */
  mse: number;

  /**
   * Peak Signal-to-Noise Ratio (dB).
   */
  psnr: number;

  /**
   * Percentage of differing pixels.
   */
  pixelDiffPercent: number;

  /**
   * Path to baseline image.
   */
  baselinePath: string;

  /**
   * Path to rendered image (if saved).
   */
  renderedPath: string;

  /**
   * Path to diff image (if generated).
   */
  diffPath?: string;

  /**
   * Whether this slide passed the fidelity threshold.
   */
  passed: boolean;

  /**
   * Error message if comparison failed.
   */
  error?: string;
}

/**
 * Complete fidelity test report.
 */
export interface FidelityReport {
  /**
   * Path to the tested PPTX file.
   */
  pptxPath: string;

  /**
   * When the test was run.
   */
  timestamp: Date;

  /**
   * Average SSIM across all slides.
   */
  overallFidelity: number;

  /**
   * Per-slide comparison reports.
   */
  slides: SlideReport[];

  /**
   * Whether all slides met the target fidelity.
   */
  passed: boolean;

  /**
   * Target fidelity threshold used.
   */
  targetFidelity: number;

  /**
   * Total number of slides.
   */
  totalSlides: number;

  /**
   * Number of slides that passed.
   */
  passedSlides: number;

  /**
   * Test duration in milliseconds.
   */
  durationMs: number;
}

/**
 * Options for fidelity testing.
 */
export interface FidelityTestOptions {
  /**
   * Path to directory containing baseline images.
   * Images should be named slide-1.png, slide-2.png, etc.
   */
  baselinesDir: string;

  /**
   * Target SSIM score to pass (0-1).
   * Default: 0.95
   */
  targetFidelity?: number;

  /**
   * Output directory for rendered images and diffs.
   * Default: undefined (no output saved)
   */
  outputDir?: string;

  /**
   * Generate diff images for debugging.
   * Default: true
   */
  generateDiffs?: boolean;

  /**
   * Render options for PPTX rendering.
   */
  renderOptions?: PptxRenderOptions;

  /**
   * Pixel difference threshold (0-255).
   * Default: 0
   */
  pixelThreshold?: number;
}

/**
 * Default fidelity test options.
 */
const DEFAULT_OPTIONS: Omit<Required<FidelityTestOptions>, 'baselinesDir' | 'renderOptions'> & {
  renderOptions: PptxRenderOptions;
} = {
  targetFidelity: 0.95,
  outputDir: '',
  generateDiffs: true,
  renderOptions: {},
  pixelThreshold: 0,
};

/**
 * Runs fidelity tests for a PPTX presentation.
 *
 * @param pptxPath - Path to the PPTX file
 * @param options - Fidelity test options
 * @returns Fidelity report with per-slide and overall scores
 */
export async function runFidelityTest(
  pptxPath: string,
  options: FidelityTestOptions
): Promise<FidelityReport> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Validate inputs
  if (!fs.existsSync(pptxPath)) {
    throw new Error(`PPTX file not found: ${pptxPath}`);
  }

  if (!fs.existsSync(opts.baselinesDir)) {
    throw new Error(`Baselines directory not found: ${opts.baselinesDir}`);
  }

  // Create output directory if specified
  if (opts.outputDir) {
    fs.mkdirSync(opts.outputDir, { recursive: true });
  }

  // Render the presentation
  const renderer = new PptxImageRenderer({ logLevel: opts.renderOptions.logLevel ?? 'warn' });
  const pptxBuffer = fs.readFileSync(pptxPath);
  const renderResult = await renderer.renderPresentation(pptxBuffer, opts.renderOptions);

  // Compare each slide
  const slideReports: SlideReport[] = [];
  let ssimSum = 0;
  let passedCount = 0;

  for (const slide of renderResult.slides) {
    const slideNumber = slide.slideNumber;
    const baselinePath = path.join(opts.baselinesDir, `slide-${slideNumber}.png`);

    // Check if baseline exists
    if (!fs.existsSync(baselinePath)) {
      slideReports.push({
        slideNumber,
        ssim: 0,
        mse: Infinity,
        psnr: 0,
        pixelDiffPercent: 100,
        baselinePath,
        renderedPath: '',
        passed: false,
        error: `Baseline not found: ${baselinePath}`,
      });
      continue;
    }

    // Save rendered image if output directory specified
    let renderedPath = '';
    if (opts.outputDir && slide.success) {
      renderedPath = path.join(opts.outputDir, `rendered-${slideNumber}.png`);
      fs.writeFileSync(renderedPath, slide.imageData);
    }

    // Handle render failure
    if (!slide.success) {
      slideReports.push({
        slideNumber,
        ssim: 0,
        mse: Infinity,
        psnr: 0,
        pixelDiffPercent: 100,
        baselinePath,
        renderedPath,
        passed: false,
        error: `Render failed: ${slide.errorMessage}`,
      });
      continue;
    }

    // Compare images
    let comparison: ComparisonResult;
    try {
      comparison = await compareImages(baselinePath, slide.imageData, {
        generateDiffImage: opts.generateDiffs,
        pixelThreshold: opts.pixelThreshold,
      });
    } catch (error) {
      slideReports.push({
        slideNumber,
        ssim: 0,
        mse: Infinity,
        psnr: 0,
        pixelDiffPercent: 100,
        baselinePath,
        renderedPath,
        passed: false,
        error: `Comparison failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    // Save diff image if generated
    let diffPath: string | undefined;
    if (opts.outputDir && opts.generateDiffs && comparison.diffImage) {
      diffPath = path.join(opts.outputDir, `diff-${slideNumber}.png`);
      fs.writeFileSync(diffPath, comparison.diffImage);
    }

    // Check if passed
    const passed = comparison.ssim >= opts.targetFidelity;
    if (passed) {
      passedCount++;
    }
    ssimSum += comparison.ssim;

    slideReports.push({
      slideNumber,
      ssim: comparison.ssim,
      mse: comparison.mse,
      psnr: comparison.psnr,
      pixelDiffPercent: comparison.pixelDiffPercent,
      baselinePath,
      renderedPath,
      diffPath,
      passed,
    });
  }

  // Calculate overall metrics
  const totalSlides = slideReports.length;
  const overallFidelity = totalSlides > 0 ? ssimSum / totalSlides : 0;
  const allPassed = passedCount === totalSlides && totalSlides > 0;

  const report: FidelityReport = {
    pptxPath: path.resolve(pptxPath),
    timestamp: new Date(),
    overallFidelity,
    slides: slideReports,
    passed: allPassed,
    targetFidelity: opts.targetFidelity,
    totalSlides,
    passedSlides: passedCount,
    durationMs: Date.now() - startTime,
  };

  // Save JSON report if output directory specified
  if (opts.outputDir) {
    const reportPath = path.join(opts.outputDir, 'fidelity-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }

  return report;
}

/**
 * Formats a fidelity report for console output.
 */
export function formatReport(report: FidelityReport): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('FIDELITY TEST REPORT');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`PPTX: ${report.pptxPath}`);
  lines.push(`Timestamp: ${report.timestamp.toISOString()}`);
  lines.push(`Duration: ${report.durationMs}ms`);
  lines.push(`Target Fidelity: ${(report.targetFidelity * 100).toFixed(1)}%`);
  lines.push('');
  lines.push('-'.repeat(60));
  lines.push('SLIDE RESULTS');
  lines.push('-'.repeat(60));

  for (const slide of report.slides) {
    const status = slide.passed ? 'PASS' : 'FAIL';
    const statusIcon = slide.passed ? '[OK]' : '[!!]';

    if (slide.error) {
      lines.push(`${statusIcon} Slide ${slide.slideNumber}: ${status} - ERROR: ${slide.error}`);
    } else {
      lines.push(
        `${statusIcon} Slide ${slide.slideNumber}: ${status} | ` +
          `SSIM: ${(slide.ssim * 100).toFixed(2)}% | ` +
          `MSE: ${slide.mse.toFixed(2)} | ` +
          `PSNR: ${slide.psnr === Infinity ? 'Inf' : slide.psnr.toFixed(2)}dB | ` +
          `Diff: ${slide.pixelDiffPercent.toFixed(2)}%`
      );
    }
  }

  lines.push('');
  lines.push('-'.repeat(60));
  lines.push('SUMMARY');
  lines.push('-'.repeat(60));
  lines.push(`Overall Fidelity: ${(report.overallFidelity * 100).toFixed(2)}%`);
  lines.push(`Slides Passed: ${report.passedSlides}/${report.totalSlides}`);
  lines.push('');

  if (report.passed) {
    lines.push('RESULT: PASSED');
  } else {
    lines.push('RESULT: FAILED');
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}

/**
 * FidelityTester class for object-oriented usage.
 */
export class FidelityTester {
  private readonly renderer: PptxImageRenderer;
  private readonly defaultOptions: Partial<FidelityTestOptions>;

  constructor(options?: Partial<FidelityTestOptions>) {
    this.renderer = new PptxImageRenderer({ logLevel: options?.renderOptions?.logLevel ?? 'warn' });
    this.defaultOptions = options ?? {};
  }

  /**
   * Runs fidelity tests for a PPTX presentation.
   */
  async test(pptxPath: string, options: FidelityTestOptions): Promise<FidelityReport> {
    return runFidelityTest(pptxPath, { ...this.defaultOptions, ...options });
  }

  /**
   * Quick check if a PPTX meets a minimum fidelity threshold.
   */
  async passes(
    pptxPath: string,
    baselinesDir: string,
    targetFidelity: number = 0.95
  ): Promise<boolean> {
    const report = await this.test(pptxPath, {
      baselinesDir,
      targetFidelity,
      generateDiffs: false,
    });
    return report.passed;
  }
}
