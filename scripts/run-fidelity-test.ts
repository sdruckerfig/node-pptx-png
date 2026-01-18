#!/usr/bin/env npx ts-node --esm
/**
 * CLI script to run fidelity tests on PPTX files.
 *
 * Usage:
 *   npx ts-node scripts/run-fidelity-test.ts --pptx ./test.pptx --baselines ./test/baselines --target 0.99
 *
 * Options:
 *   --pptx, -p        Path to PPTX file (required)
 *   --baselines, -b   Path to baselines directory (required)
 *   --target, -t      Target SSIM fidelity threshold (default: 0.95)
 *   --output, -o      Output directory for rendered images and diffs
 *   --no-diffs        Disable diff image generation
 *   --json            Output only JSON report
 *   --help, -h        Show help
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runFidelityTest, formatReport } from '../dist/testing/FidelityTester.js';

interface CliArgs {
  pptx: string;
  baselines: string;
  target: number;
  output?: string;
  generateDiffs: boolean;
  jsonOnly: boolean;
  help: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    pptx: '',
    baselines: '',
    target: 0.95,
    output: undefined,
    generateDiffs: true,
    jsonOnly: false,
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
      case '--baselines':
      case '-b':
        result.baselines = next ?? '';
        i++;
        break;
      case '--target':
      case '-t':
        result.target = parseFloat(next ?? '0.95');
        i++;
        break;
      case '--output':
      case '-o':
        result.output = next;
        i++;
        break;
      case '--no-diffs':
        result.generateDiffs = false;
        break;
      case '--json':
        result.jsonOnly = true;
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
Fidelity Test Runner for pptimg

Usage:
  npx ts-node scripts/run-fidelity-test.ts [options]

Required Options:
  --pptx, -p <path>        Path to PPTX file
  --baselines, -b <path>   Path to baselines directory

Optional Options:
  --target, -t <number>    Target SSIM fidelity threshold (0-1, default: 0.95)
  --output, -o <path>      Output directory for rendered images and diffs
  --no-diffs               Disable diff image generation
  --json                   Output only JSON report (for programmatic use)
  --help, -h               Show this help message

Examples:
  # Basic test with default 95% target
  npx ts-node scripts/run-fidelity-test.ts -p ./test.pptx -b ./test/baselines

  # High fidelity test with 99% target
  npx ts-node scripts/run-fidelity-test.ts -p ./test.pptx -b ./test/baselines -t 0.99

  # Save rendered images and diffs for debugging
  npx ts-node scripts/run-fidelity-test.ts -p ./test.pptx -b ./test/baselines -o ./test/output

  # JSON output for CI integration
  npx ts-node scripts/run-fidelity-test.ts -p ./test.pptx -b ./test/baselines --json
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

  if (!args.baselines) {
    console.error('Error: --baselines argument is required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  // Resolve paths
  const pptxPath = path.resolve(args.pptx);
  const baselinesDir = path.resolve(args.baselines);
  const outputDir = args.output ? path.resolve(args.output) : undefined;

  // Validate files exist
  if (!fs.existsSync(pptxPath)) {
    console.error(`Error: PPTX file not found: ${pptxPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(baselinesDir)) {
    console.error(`Error: Baselines directory not found: ${baselinesDir}`);
    process.exit(1);
  }

  // Validate target
  if (args.target < 0 || args.target > 1) {
    console.error('Error: Target fidelity must be between 0 and 1');
    process.exit(1);
  }

  if (!args.jsonOnly) {
    console.log('Running fidelity test...');
    console.log(`  PPTX: ${pptxPath}`);
    console.log(`  Baselines: ${baselinesDir}`);
    console.log(`  Target: ${(args.target * 100).toFixed(1)}%`);
    if (outputDir) {
      console.log(`  Output: ${outputDir}`);
    }
    console.log('');
  }

  try {
    const report = await runFidelityTest(pptxPath, {
      baselinesDir,
      targetFidelity: args.target,
      outputDir,
      generateDiffs: args.generateDiffs,
    });

    if (args.jsonOnly) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatReport(report));

      if (outputDir) {
        console.log(`\nOutput saved to: ${outputDir}`);
      }
    }

    // Exit with appropriate code
    process.exit(report.passed ? 0 : 1);
  } catch (error) {
    if (args.jsonOnly) {
      console.log(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    } else {
      console.error('Error running fidelity test:', error instanceof Error ? error.message : error);
    }
    process.exit(1);
  }
}

main();
