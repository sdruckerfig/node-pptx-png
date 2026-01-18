/**
 * BaselineGenerator - Generate baseline images from PPTX using LibreOffice
 *
 * Uses LibreOffice headless mode to export PPTX slides to high-quality PNG
 * images that serve as reference baselines for fidelity testing.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

/**
 * Result of baseline generation.
 */
export interface BaselineGenerationResult {
  /**
   * Path to the source PPTX file.
   */
  pptxPath: string;

  /**
   * Directory where baselines were saved.
   */
  outputDir: string;

  /**
   * Paths to generated baseline images.
   */
  baselinePaths: string[];

  /**
   * Number of slides processed.
   */
  slideCount: number;

  /**
   * Whether generation succeeded.
   */
  success: boolean;

  /**
   * Error message if generation failed.
   */
  error?: string;

  /**
   * Duration in milliseconds.
   */
  durationMs: number;
}

/**
 * Options for baseline generation.
 */
export interface BaselineGeneratorOptions {
  /**
   * Output directory for baseline images.
   * Default: './test/baselines'
   */
  outputDir?: string;

  /**
   * Path to LibreOffice executable.
   * Default: auto-detect
   */
  libreOfficePath?: string;

  /**
   * Image width in pixels.
   * Default: 1920
   */
  width?: number;

  /**
   * Image height in pixels.
   * Default: 1080
   */
  height?: number;

  /**
   * Timeout for LibreOffice process in milliseconds.
   * Default: 60000 (1 minute)
   */
  timeout?: number;
}

/**
 * Default options for baseline generation.
 */
const DEFAULT_OPTIONS: Required<BaselineGeneratorOptions> = {
  outputDir: './test/baselines',
  libreOfficePath: '',
  width: 1920,
  height: 1080,
  timeout: 60000,
};

/**
 * Common LibreOffice executable paths by platform.
 */
const LIBREOFFICE_PATHS: Record<string, string[]> = {
  darwin: [
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/opt/homebrew/bin/soffice',
    '/usr/local/bin/soffice',
  ],
  linux: [
    '/usr/bin/soffice',
    '/usr/bin/libreoffice',
    '/usr/local/bin/soffice',
    '/snap/bin/libreoffice',
  ],
  win32: [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ],
};

/**
 * Finds the LibreOffice executable path.
 */
function findLibreOfficePath(): string | null {
  const platform = process.platform;
  const paths = LIBREOFFICE_PATHS[platform] ?? [];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * Executes a command and returns the result.
 */
function execCommand(
  command: string,
  args: string[],
  timeout: number
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({ stdout, stderr, code: code ?? 1 });
    });

    proc.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

/**
 * Generates baseline images from a PPTX file using LibreOffice.
 *
 * @param pptxPath - Path to the PPTX file
 * @param options - Generation options
 * @returns Generation result
 */
export async function generateBaselines(
  pptxPath: string,
  options: BaselineGeneratorOptions = {}
): Promise<BaselineGenerationResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Validate PPTX file
  if (!fs.existsSync(pptxPath)) {
    return {
      pptxPath,
      outputDir: opts.outputDir,
      baselinePaths: [],
      slideCount: 0,
      success: false,
      error: `PPTX file not found: ${pptxPath}`,
      durationMs: Date.now() - startTime,
    };
  }

  // Find LibreOffice
  const libreOfficePath = opts.libreOfficePath || findLibreOfficePath();
  if (!libreOfficePath) {
    return {
      pptxPath,
      outputDir: opts.outputDir,
      baselinePaths: [],
      slideCount: 0,
      success: false,
      error:
        'LibreOffice not found. Please install LibreOffice or specify the path via libreOfficePath option.',
      durationMs: Date.now() - startTime,
    };
  }

  // Create output directory
  fs.mkdirSync(opts.outputDir, { recursive: true });

  // Create temporary directory for LibreOffice output
  const tempDir = path.join(tmpdir(), `pptimg-baseline-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // Copy PPTX to temp directory (LibreOffice needs to write next to the file)
    const tempPptx = path.join(tempDir, path.basename(pptxPath));
    fs.copyFileSync(pptxPath, tempPptx);

    // Run LibreOffice to convert to PNG
    const args = [
      '--headless',
      '--invisible',
      '--convert-to',
      'png',
      '--outdir',
      tempDir,
      tempPptx,
    ];

    const result = await execCommand(libreOfficePath, args, opts.timeout);

    if (result.code !== 0) {
      return {
        pptxPath,
        outputDir: opts.outputDir,
        baselinePaths: [],
        slideCount: 0,
        success: false,
        error: `LibreOffice failed with code ${result.code}: ${result.stderr}`,
        durationMs: Date.now() - startTime,
      };
    }

    // LibreOffice exports to a single PDF first, then we need to use another approach
    // Actually, LibreOffice can export directly to PNG but creates slide-by-slide output
    // Let's check what files were created
    const files = fs.readdirSync(tempDir);
    const pngFiles = files
      .filter((f) => f.endsWith('.png'))
      .sort((a, b) => {
        // Sort numerically if possible
        const numA = parseInt(a.replace(/\D/g, ''), 10);
        const numB = parseInt(b.replace(/\D/g, ''), 10);
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB;
        }
        return a.localeCompare(b);
      });

    if (pngFiles.length === 0) {
      // LibreOffice might have created a single PNG - check for it
      const baseName = path.basename(pptxPath, path.extname(pptxPath));
      const singlePng = `${baseName}.png`;
      if (files.includes(singlePng)) {
        // Single slide presentation
        const srcPath = path.join(tempDir, singlePng);
        const destPath = path.join(opts.outputDir, 'slide-1.png');
        fs.copyFileSync(srcPath, destPath);

        return {
          pptxPath,
          outputDir: path.resolve(opts.outputDir),
          baselinePaths: [destPath],
          slideCount: 1,
          success: true,
          durationMs: Date.now() - startTime,
        };
      }

      return {
        pptxPath,
        outputDir: opts.outputDir,
        baselinePaths: [],
        slideCount: 0,
        success: false,
        error: 'No PNG files generated. LibreOffice may not support PNG export for this file.',
        durationMs: Date.now() - startTime,
      };
    }

    // Copy and rename PNG files to output directory
    const baselinePaths: string[] = [];
    for (let i = 0; i < pngFiles.length; i++) {
      const srcPath = path.join(tempDir, pngFiles[i] ?? '');
      const destPath = path.join(opts.outputDir, `slide-${i + 1}.png`);
      fs.copyFileSync(srcPath, destPath);
      baselinePaths.push(destPath);
    }

    return {
      pptxPath,
      outputDir: path.resolve(opts.outputDir),
      baselinePaths,
      slideCount: baselinePaths.length,
      success: true,
      durationMs: Date.now() - startTime,
    };
  } finally {
    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Generates baselines using PDF intermediate (for better quality).
 * This is an alternative approach that first converts to PDF, then to PNG.
 */
export async function generateBaselinesViaPdf(
  pptxPath: string,
  options: BaselineGeneratorOptions = {}
): Promise<BaselineGenerationResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Validate PPTX file
  if (!fs.existsSync(pptxPath)) {
    return {
      pptxPath,
      outputDir: opts.outputDir,
      baselinePaths: [],
      slideCount: 0,
      success: false,
      error: `PPTX file not found: ${pptxPath}`,
      durationMs: Date.now() - startTime,
    };
  }

  // Find LibreOffice
  const libreOfficePath = opts.libreOfficePath || findLibreOfficePath();
  if (!libreOfficePath) {
    return {
      pptxPath,
      outputDir: opts.outputDir,
      baselinePaths: [],
      slideCount: 0,
      success: false,
      error:
        'LibreOffice not found. Please install LibreOffice or specify the path via libreOfficePath option.',
      durationMs: Date.now() - startTime,
    };
  }

  // Create output directory
  fs.mkdirSync(opts.outputDir, { recursive: true });

  // Create temporary directory
  const tempDir = path.join(tmpdir(), `pptimg-baseline-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // Copy PPTX to temp directory
    const tempPptx = path.join(tempDir, path.basename(pptxPath));
    fs.copyFileSync(pptxPath, tempPptx);

    // Step 1: Convert to PDF
    const pdfArgs = ['--headless', '--invisible', '--convert-to', 'pdf', '--outdir', tempDir, tempPptx];

    const pdfResult = await execCommand(libreOfficePath, pdfArgs, opts.timeout);

    if (pdfResult.code !== 0) {
      return {
        pptxPath,
        outputDir: opts.outputDir,
        baselinePaths: [],
        slideCount: 0,
        success: false,
        error: `LibreOffice PDF conversion failed: ${pdfResult.stderr}`,
        durationMs: Date.now() - startTime,
      };
    }

    // Find the generated PDF
    const pdfName = path.basename(pptxPath, path.extname(pptxPath)) + '.pdf';
    const pdfPath = path.join(tempDir, pdfName);

    if (!fs.existsSync(pdfPath)) {
      return {
        pptxPath,
        outputDir: opts.outputDir,
        baselinePaths: [],
        slideCount: 0,
        success: false,
        error: 'PDF not generated by LibreOffice',
        durationMs: Date.now() - startTime,
      };
    }

    // Step 2: Convert PDF to PNG using pdftoppm if available
    // This provides better quality than direct LibreOffice PNG export
    let baselinePaths: string[] = [];

    // Try pdftoppm first (from poppler-utils)
    try {
      const ppmArgs = [
        '-png',
        '-r',
        '150', // 150 DPI
        pdfPath,
        path.join(tempDir, 'slide'),
      ];

      const ppmResult = await execCommand('pdftoppm', ppmArgs, opts.timeout);

      if (ppmResult.code === 0) {
        // pdftoppm outputs slide-1.png, slide-2.png, etc.
        const files = fs.readdirSync(tempDir);
        const pngFiles = files.filter((f) => f.startsWith('slide-') && f.endsWith('.png')).sort();

        for (let i = 0; i < pngFiles.length; i++) {
          const srcPath = path.join(tempDir, pngFiles[i] ?? '');
          const destPath = path.join(opts.outputDir, `slide-${i + 1}.png`);
          fs.copyFileSync(srcPath, destPath);
          baselinePaths.push(destPath);
        }
      }
    } catch {
      // pdftoppm not available, fall back to LibreOffice PNG export
    }

    // If pdftoppm failed, try direct PNG export from PPTX
    if (baselinePaths.length === 0) {
      const pngArgs = ['--headless', '--invisible', '--convert-to', 'png', '--outdir', tempDir, tempPptx];

      await execCommand(libreOfficePath, pngArgs, opts.timeout);

      const files = fs.readdirSync(tempDir);
      const pngFiles = files.filter((f) => f.endsWith('.png')).sort();

      for (let i = 0; i < pngFiles.length; i++) {
        const srcPath = path.join(tempDir, pngFiles[i] ?? '');
        const destPath = path.join(opts.outputDir, `slide-${i + 1}.png`);
        fs.copyFileSync(srcPath, destPath);
        baselinePaths.push(destPath);
      }
    }

    if (baselinePaths.length === 0) {
      return {
        pptxPath,
        outputDir: opts.outputDir,
        baselinePaths: [],
        slideCount: 0,
        success: false,
        error: 'No baseline images generated',
        durationMs: Date.now() - startTime,
      };
    }

    return {
      pptxPath,
      outputDir: path.resolve(opts.outputDir),
      baselinePaths,
      slideCount: baselinePaths.length,
      success: true,
      durationMs: Date.now() - startTime,
    };
  } finally {
    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * BaselineGenerator class for object-oriented usage.
 */
export class BaselineGenerator {
  private readonly options: BaselineGeneratorOptions;

  constructor(options: BaselineGeneratorOptions = {}) {
    this.options = options;
  }

  /**
   * Generates baseline images from a PPTX file.
   */
  async generate(pptxPath: string, outputDir?: string): Promise<BaselineGenerationResult> {
    return generateBaselines(pptxPath, {
      ...this.options,
      outputDir: outputDir ?? this.options.outputDir,
    });
  }

  /**
   * Generates baselines using PDF as intermediate format (higher quality).
   */
  async generateViaPdf(pptxPath: string, outputDir?: string): Promise<BaselineGenerationResult> {
    return generateBaselinesViaPdf(pptxPath, {
      ...this.options,
      outputDir: outputDir ?? this.options.outputDir,
    });
  }

  /**
   * Checks if LibreOffice is available.
   */
  isLibreOfficeAvailable(): boolean {
    const path = this.options.libreOfficePath || findLibreOfficePath();
    return path !== null;
  }

  /**
   * Gets the detected LibreOffice path.
   */
  getLibreOfficePath(): string | null {
    return this.options.libreOfficePath || findLibreOfficePath();
  }
}

/**
 * Checks if LibreOffice is available on the system.
 */
export function isLibreOfficeAvailable(): boolean {
  return findLibreOfficePath() !== null;
}
