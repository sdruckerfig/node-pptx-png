#!/usr/bin/env node
/**
 * Simple script to render a PPTX file to images.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { renderPresentation } from '../dist/index.js';

async function main(): Promise<void> {
  const pptxPath = process.argv[2];
  const outputDir = process.argv[3] || './output';

  if (!pptxPath) {
    console.error('Usage: node scripts/render-pptx.ts <pptx-path> [output-dir]');
    process.exit(1);
  }

  console.log(`Rendering: ${pptxPath}`);
  console.log(`Output: ${outputDir}`);

  await fs.mkdir(outputDir, { recursive: true });

  const startTime = Date.now();

  try {
    const result = await renderPresentation(pptxPath, {
      width: 1920,
      format: 'png',
      logLevel: 'debug',
    });

    console.log(`\nRendered ${result.successfulSlides}/${result.totalSlides} slides`);

    for (const slide of result.slides) {
      if (slide.success) {
        const outputPath = path.join(outputDir, `slide-${slide.slideNumber}.png`);
        await fs.writeFile(outputPath, slide.imageData);
        console.log(`  ✓ Slide ${slide.slideNumber}: ${slide.width}x${slide.height}`);
      } else {
        console.log(`  ✗ Slide ${slide.slideNumber}: ${slide.errorMessage}`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`\nCompleted in ${duration}ms`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
