/**
 * VisualComparator - Image comparison with quality metrics
 *
 * Compares two images pixel-by-pixel and calculates industry-standard
 * image quality metrics including SSIM, MSE, and PSNR.
 */

import { Canvas, loadImage, type Image } from 'skia-canvas';

/**
 * Result of comparing two images.
 */
export interface ComparisonResult {
  /**
   * Structural Similarity Index (0-1, higher is better).
   * 0.99 = 99% similar. Industry standard for perceptual quality.
   */
  ssim: number;

  /**
   * Mean Squared Error (lower is better).
   * 0 = identical images.
   */
  mse: number;

  /**
   * Peak Signal-to-Noise Ratio in decibels (higher is better).
   * Typical values: 30-50 dB for good quality.
   */
  psnr: number;

  /**
   * Percentage of pixels that differ (0-100).
   */
  pixelDiffPercent: number;

  /**
   * Visual diff image highlighting differences in red.
   */
  diffImage?: Buffer;

  /**
   * Width of the compared images in pixels.
   */
  width: number;

  /**
   * Height of the compared images in pixels.
   */
  height: number;
}

/**
 * Options for image comparison.
 */
export interface ComparisonOptions {
  /**
   * Generate a visual diff image highlighting differences.
   * Default: true
   */
  generateDiffImage?: boolean;

  /**
   * Threshold for considering pixels different (0-255).
   * Default: 0 (exact match required)
   */
  pixelThreshold?: number;

  /**
   * SSIM window size for local comparison.
   * Default: 11 (standard 11x11 window)
   */
  ssimWindowSize?: number;
}

/**
 * Default comparison options.
 */
const DEFAULT_OPTIONS: Required<ComparisonOptions> = {
  generateDiffImage: true,
  pixelThreshold: 0,
  ssimWindowSize: 11,
};

/**
 * SSIM constants (from the original paper by Wang et al.)
 */
const SSIM_K1 = 0.01;
const SSIM_K2 = 0.03;
const SSIM_L = 255; // Dynamic range of pixel values

/**
 * Compares two images and returns similarity metrics.
 *
 * @param baseline - Path to baseline image or Buffer
 * @param rendered - Path to rendered image or Buffer
 * @param options - Comparison options
 * @returns Comparison result with similarity metrics
 */
export async function compareImages(
  baseline: string | Buffer,
  rendered: string | Buffer,
  options: ComparisonOptions = {}
): Promise<ComparisonResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Load images
  const baselineImg = await loadImage(baseline);
  const renderedImg = await loadImage(rendered);

  // Get image dimensions
  const width = Math.max(baselineImg.width, renderedImg.width);
  const height = Math.max(baselineImg.height, renderedImg.height);

  // Create canvases to extract pixel data
  const baselineCanvas = new Canvas(width, height);
  const renderedCanvas = new Canvas(width, height);
  const baselineCtx = baselineCanvas.getContext('2d');
  const renderedCtx = renderedCanvas.getContext('2d');

  // Draw images (resizing to match if necessary)
  baselineCtx.drawImage(baselineImg, 0, 0, width, height);
  renderedCtx.drawImage(renderedImg, 0, 0, width, height);

  // Get pixel data
  const baselineData = baselineCtx.getImageData(0, 0, width, height);
  const renderedData = renderedCtx.getImageData(0, 0, width, height);

  // Calculate metrics
  const mse = calculateMSE(baselineData.data, renderedData.data);
  const psnr = calculatePSNR(mse);
  const pixelDiffPercent = calculatePixelDiffPercent(
    baselineData.data,
    renderedData.data,
    opts.pixelThreshold
  );
  const ssim = calculateSSIM(
    baselineData.data,
    renderedData.data,
    width,
    height,
    opts.ssimWindowSize
  );

  // Generate diff image if requested
  let diffImage: Buffer | undefined;
  if (opts.generateDiffImage) {
    diffImage = await generateDiffImage(
      baselineData.data,
      renderedData.data,
      width,
      height,
      opts.pixelThreshold
    );
  }

  return {
    ssim,
    mse,
    psnr,
    pixelDiffPercent,
    diffImage,
    width,
    height,
  };
}

/**
 * Calculates Mean Squared Error between two images.
 */
function calculateMSE(data1: Uint8ClampedArray, data2: Uint8ClampedArray): number {
  if (data1.length !== data2.length) {
    throw new Error('Image data arrays must have the same length');
  }

  let sumSquaredDiff = 0;
  const pixelCount = data1.length / 4; // RGBA = 4 bytes per pixel

  for (let i = 0; i < data1.length; i += 4) {
    // Compare RGB channels (skip alpha)
    for (let c = 0; c < 3; c++) {
      const diff = (data1[i + c] ?? 0) - (data2[i + c] ?? 0);
      sumSquaredDiff += diff * diff;
    }
  }

  // Average over all pixels and channels (RGB = 3 channels)
  return sumSquaredDiff / (pixelCount * 3);
}

/**
 * Calculates Peak Signal-to-Noise Ratio from MSE.
 */
function calculatePSNR(mse: number): number {
  if (mse === 0) {
    return Infinity; // Identical images
  }

  const maxPixelValue = 255;
  return 10 * Math.log10((maxPixelValue * maxPixelValue) / mse);
}

/**
 * Calculates percentage of pixels that differ.
 */
function calculatePixelDiffPercent(
  data1: Uint8ClampedArray,
  data2: Uint8ClampedArray,
  threshold: number
): number {
  const pixelCount = data1.length / 4;
  let diffCount = 0;

  for (let i = 0; i < data1.length; i += 4) {
    // Check if any RGB channel differs beyond threshold
    let differs = false;
    for (let c = 0; c < 3; c++) {
      const diff = Math.abs((data1[i + c] ?? 0) - (data2[i + c] ?? 0));
      if (diff > threshold) {
        differs = true;
        break;
      }
    }
    if (differs) {
      diffCount++;
    }
  }

  return (diffCount / pixelCount) * 100;
}

/**
 * Calculates Structural Similarity Index (SSIM) using sliding window approach.
 *
 * SSIM compares local patterns of pixel intensities that have been normalized
 * for luminance and contrast. It is considered more perceptually accurate
 * than MSE/PSNR for comparing image quality.
 */
function calculateSSIM(
  data1: Uint8ClampedArray,
  data2: Uint8ClampedArray,
  width: number,
  height: number,
  windowSize: number
): number {
  // Convert to grayscale for SSIM calculation
  const gray1 = toGrayscale(data1, width, height);
  const gray2 = toGrayscale(data2, width, height);

  // SSIM constants
  const c1 = Math.pow(SSIM_K1 * SSIM_L, 2);
  const c2 = Math.pow(SSIM_K2 * SSIM_L, 2);

  const halfWindow = Math.floor(windowSize / 2);
  let ssimSum = 0;
  let windowCount = 0;

  // Slide window over the image
  for (let y = halfWindow; y < height - halfWindow; y++) {
    for (let x = halfWindow; x < width - halfWindow; x++) {
      // Extract window values
      const window1: number[] = [];
      const window2: number[] = [];

      for (let wy = -halfWindow; wy <= halfWindow; wy++) {
        for (let wx = -halfWindow; wx <= halfWindow; wx++) {
          const idx = (y + wy) * width + (x + wx);
          window1.push(gray1[idx] ?? 0);
          window2.push(gray2[idx] ?? 0);
        }
      }

      // Calculate local statistics
      const { mean: mean1, variance: var1 } = calculateStats(window1);
      const { mean: mean2, variance: var2 } = calculateStats(window2);
      const covariance = calculateCovariance(window1, window2, mean1, mean2);

      // Calculate SSIM for this window
      const numerator = (2 * mean1 * mean2 + c1) * (2 * covariance + c2);
      const denominator =
        (mean1 * mean1 + mean2 * mean2 + c1) * (var1 + var2 + c2);
      const localSSIM = numerator / denominator;

      ssimSum += localSSIM;
      windowCount++;
    }
  }

  // Return mean SSIM
  return windowCount > 0 ? ssimSum / windowCount : 0;
}

/**
 * Converts RGBA image data to grayscale array.
 */
function toGrayscale(data: Uint8ClampedArray, width: number, height: number): number[] {
  const gray = new Array<number>(width * height);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    // Standard luminance formula
    gray[i / 4] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  return gray;
}

/**
 * Calculates mean and variance of a window.
 */
function calculateStats(values: number[]): { mean: number; variance: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, variance: 0 };

  let sum = 0;
  for (const v of values) {
    sum += v;
  }
  const mean = sum / n;

  let sumSquaredDiff = 0;
  for (const v of values) {
    const diff = v - mean;
    sumSquaredDiff += diff * diff;
  }
  const variance = sumSquaredDiff / n;

  return { mean, variance };
}

/**
 * Calculates covariance between two windows.
 */
function calculateCovariance(
  values1: number[],
  values2: number[],
  mean1: number,
  mean2: number
): number {
  const n = values1.length;
  if (n === 0) return 0;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += ((values1[i] ?? 0) - mean1) * ((values2[i] ?? 0) - mean2);
  }

  return sum / n;
}

/**
 * Generates a visual diff image highlighting differences in red.
 */
async function generateDiffImage(
  data1: Uint8ClampedArray,
  data2: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number
): Promise<Buffer> {
  const diffCanvas = new Canvas(width, height);
  const diffCtx = diffCanvas.getContext('2d');
  const diffData = diffCtx.createImageData(width, height);

  for (let i = 0; i < data1.length; i += 4) {
    // Check if pixel differs
    let differs = false;
    let maxDiff = 0;
    for (let c = 0; c < 3; c++) {
      const diff = Math.abs((data1[i + c] ?? 0) - (data2[i + c] ?? 0));
      maxDiff = Math.max(maxDiff, diff);
      if (diff > threshold) {
        differs = true;
      }
    }

    if (differs) {
      // Highlight difference in red, intensity based on difference magnitude
      const intensity = Math.min(255, 128 + maxDiff);
      diffData.data[i] = intensity; // R
      diffData.data[i + 1] = 0; // G
      diffData.data[i + 2] = 0; // B
      diffData.data[i + 3] = 255; // A
    } else {
      // Show original pixel at reduced opacity
      diffData.data[i] = Math.floor((data1[i] ?? 0) * 0.5);
      diffData.data[i + 1] = Math.floor((data1[i + 1] ?? 0) * 0.5);
      diffData.data[i + 2] = Math.floor((data1[i + 2] ?? 0) * 0.5);
      diffData.data[i + 3] = 255;
    }
  }

  diffCtx.putImageData(diffData, 0, 0);

  return diffCanvas.toBuffer('png');
}

/**
 * VisualComparator class for object-oriented usage.
 */
export class VisualComparator {
  private readonly options: Required<ComparisonOptions>;

  constructor(options: ComparisonOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Compares two images and returns similarity metrics.
   */
  async compare(
    baseline: string | Buffer,
    rendered: string | Buffer,
    options?: ComparisonOptions
  ): Promise<ComparisonResult> {
    return compareImages(baseline, rendered, { ...this.options, ...options });
  }

  /**
   * Checks if two images meet a minimum SSIM threshold.
   */
  async meetsThreshold(
    baseline: string | Buffer,
    rendered: string | Buffer,
    minSSIM: number
  ): Promise<boolean> {
    const result = await this.compare(baseline, rendered, { generateDiffImage: false });
    return result.ssim >= minSSIM;
  }
}
