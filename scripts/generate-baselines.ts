#!/usr/bin/env npx ts-node --esm
/**
 * CLI script to generate baseline images from PPTX using LibreOffice.
 *
 * Usage:
 *   npx ts-node scripts/generate-baselines.ts --pptx ./test.pptx --output ./test/baselines
 *
 * Options:
 *   --pptx, -p        Path to PPTX file (required)
 *   --output, -o      Output directory for baseline images (default: ./test/baselines)
 *   --libreoffice     Path to LibreOffice executable (auto-detected if not specified)
 *   --via-pdf         Use PDF intermediate for higher quality
 *   --timeout         Timeout in seconds (default: 60)
 *   --help, -h        Show help
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  generateBaselines,
  generateBaselinesViaPdf,
  isLibreOfficeAvailable,
} from '../dist/testing/BaselineGenerator.js';

interface CliArgs {
  pptx: string;
  output: string;
  libreOfficePath?: string;
  viaPdf: boolean;
  timeout: number;
  help: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    pptx: '',
    output: './test/baselines',
    libreOfficePath: undefined,
    viaPdf: false,
    timeout: 60,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--pptx':
      case '-p':
        result.pptx = next ?? '';
        i++;
        break;
      case '--output':
      case '-o':
        result.output = next ?? './test/baselines';
        i++;
        break;
      case '--libreoffice':
        result.libreOfficePath = next;
        i++;
        break;
      case '--via-pdf':
        result.viaPdf = true;
        break;
      case '--timeout':
        result.timeout = parseInt(next ?? '60', 10);
        i++;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
    }
  }

  return result;
}

function showHelp(): void {
  console.log(`
Baseline Generator for pptimg

Generates high-quality baseline images from PPTX files using LibreOffice.
These baselines are used for visual fidelity testing.

Usage:
  npx ts-node scripts/generate-baselines.ts [options]

Required Options:
  --pptx, -p <path>        Path to PPTX file

Optional Options:
  --output, -o <path>      Output directory for baselines (default: ./test/baselines)
  --libreoffice <path>     Path to LibreOffice executable (auto-detected if not specified)
  --via-pdf                Use PDF as intermediate format (higher quality)
  --timeout <seconds>      Timeout for LibreOffice process (default: 60)
  --help, -h               Show this help message

Examples:
  # Generate baselines with default settings
  npx ts-node scripts/generate-baselines.ts -p ./presentation.pptx

  # Generate to specific directory
  npx ts-node scripts/generate-baselines.ts -p ./presentation.pptx -o ./baselines

  # Use PDF intermediate for higher quality
  npx ts-node scripts/generate-baselines.ts -p ./presentation.pptx --via-pdf

  # Specify LibreOffice path manually
  npx ts-node scripts/generate-baselines.ts -p ./presentation.pptx --libreoffice /usr/bin/soffice

Requirements:
  - LibreOffice must be installed on the system
  - For --via-pdf mode, pdftoppm (from poppler-utils) is recommended for best quality
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // Validate required arguments
  if (!args.pptx) {
    console.error('Error: --pptx argument is required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  // Resolve paths
  const pptxPath = path.resolve(args.pptx);
  const outputDir = path.resolve(args.output);

  // Validate PPTX exists
  if (!fs.existsSync(pptxPath)) {
    console.error(`Error: PPTX file not found: ${pptxPath}`);
    process.exit(1);
  }

  // Check LibreOffice availability
  if (!args.libreOfficePath && !isLibreOfficeAvailable()) {
    console.error('Error: LibreOffice not found.');
    console.error('Please install LibreOffice or specify the path via --libreoffice');
    console.error('');
    console.error('Installation:');
    console.error('  macOS:  brew install --cask libreoffice');
    console.error('  Ubuntu: sudo apt install libreoffice');
    console.error('  Fedora: sudo dnf install libreoffice');
    process.exit(1);
  }

  console.log('Generating baselines...');
  console.log(`  PPTX: ${pptxPath}`);
  console.log(`  Output: ${outputDir}`);
  console.log(`  Mode: ${args.viaPdf ? 'via PDF' : 'direct'}`);
  console.log('');

  try {
    const generator = args.viaPdf ? generateBaselinesViaPdf : generateBaselines;

    const result = await generator(pptxPath, {
      outputDir,
      libreOfficePath: args.libreOfficePath,
      timeout: args.timeout * 1000,
    });

    if (!result.success) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    console.log('Baselines generated successfully!');
    console.log(`  Slides: ${result.slideCount}`);
    console.log(`  Duration: ${result.durationMs}ms`);
    console.log(`  Output: ${result.outputDir}`);
    console.log('');
    console.log('Generated files:');
    for (const p of result.baselinePaths) {
      console.log(`  - ${path.basename(p)}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error generating baselines:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
