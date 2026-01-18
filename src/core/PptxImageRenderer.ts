import type {
  PptxRenderOptions,
  SlideRenderResult,
  PresentationRenderResult,
  ResolvedTheme,
} from '../types/index.js';
import { DEFAULT_RENDER_OPTIONS } from '../types/index.js';
import { PptxParser } from './PptxParser.js';
import { ThemeResolver } from '../theme/ThemeResolver.js';
import { SlideRenderer } from '../rendering/SlideRenderer.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Interface for the PPTX image renderer.
 */
export interface IPptxImageRenderer {
  /**
   * Renders all slides in a presentation to images.
   */
  renderPresentation(
    input: Buffer | string,
    options?: PptxRenderOptions
  ): Promise<PresentationRenderResult>;

  /**
   * Renders a single slide to an image.
   */
  renderSlide(
    input: Buffer | string,
    slideIndex: number,
    options?: PptxRenderOptions
  ): Promise<SlideRenderResult>;

  /**
   * Gets the number of slides in a presentation.
   */
  getSlideCount(input: Buffer | string): Promise<number>;

  /**
   * Gets the slide dimensions in EMU.
   */
  getSlideDimensions(input: Buffer | string): Promise<{ width: number; height: number }>;
}

/**
 * Main entry point for rendering PPTX presentations to images.
 */
export class PptxImageRenderer implements IPptxImageRenderer {
  private readonly logger: ILogger;

  constructor(options?: { logLevel?: PptxRenderOptions['logLevel'] }) {
    this.logger = createLogger(options?.logLevel ?? 'warn', 'PptxImageRenderer');
  }

  /**
   * Renders all slides in a presentation to images.
   */
  async renderPresentation(
    input: Buffer | string,
    options: PptxRenderOptions = {}
  ): Promise<PresentationRenderResult> {
    const mergedOptions = { ...DEFAULT_RENDER_OPTIONS, ...options };
    const parser = new PptxParser(this.logger.child('Parser'));

    try {
      await parser.open(input);

      // Get presentation data
      const presentation = await parser.getPresentation();
      const { slideWidth, slideHeight, slideCount } = presentation;

      this.logger.info('Rendering presentation', {
        slideCount,
        slideWidth,
        slideHeight,
      });

      // Resolve theme
      const themeResolver = new ThemeResolver(this.logger.child('Theme'));
      const theme = await themeResolver.resolveTheme(parser);

      // Create slide renderer
      const slideRenderer = new SlideRenderer(
        theme,
        mergedOptions,
        this.logger.child('Slide')
      );

      // Render each slide
      const slides: SlideRenderResult[] = [];
      let successfulSlides = 0;

      for (let i = 0; i < slideCount; i++) {
        const result = await this.renderSlideInternal(
          parser,
          i,
          slideWidth,
          slideHeight,
          theme,
          slideRenderer
        );

        slides.push(result);

        if (result.success) {
          successfulSlides++;
        }
      }

      return {
        slides,
        totalSlides: slideCount,
        successfulSlides,
        allSuccessful: successfulSlides === slideCount,
      };
    } finally {
      parser.close();
    }
  }

  /**
   * Renders a single slide to an image.
   */
  async renderSlide(
    input: Buffer | string,
    slideIndex: number,
    options: PptxRenderOptions = {}
  ): Promise<SlideRenderResult> {
    const mergedOptions = { ...DEFAULT_RENDER_OPTIONS, ...options };
    const parser = new PptxParser(this.logger.child('Parser'));

    try {
      await parser.open(input);

      // Get presentation data
      const presentation = await parser.getPresentation();
      const { slideWidth, slideHeight, slideCount } = presentation;

      // Validate slide index
      if (slideIndex < 0 || slideIndex >= slideCount) {
        return {
          slideIndex,
          slideNumber: slideIndex + 1,
          imageData: Buffer.alloc(0),
          width: 0,
          height: 0,
          success: false,
          errorMessage: `Slide index ${slideIndex} out of range (0-${slideCount - 1})`,
        };
      }

      // Resolve theme
      const themeResolver = new ThemeResolver(this.logger.child('Theme'));
      const theme = await themeResolver.resolveTheme(parser);

      // Create slide renderer
      const slideRenderer = new SlideRenderer(
        theme,
        mergedOptions,
        this.logger.child('Slide')
      );

      // Render the slide
      return this.renderSlideInternal(
        parser,
        slideIndex,
        slideWidth,
        slideHeight,
        theme,
        slideRenderer
      );
    } finally {
      parser.close();
    }
  }

  /**
   * Internal method to render a single slide.
   */
  private async renderSlideInternal(
    parser: PptxParser,
    slideIndex: number,
    slideWidth: number,
    slideHeight: number,
    theme: ResolvedTheme,
    slideRenderer: SlideRenderer
  ): Promise<SlideRenderResult> {
    try {
      // Get slide data
      const slideData = await parser.getSlide(slideIndex);

      // Get layout and master for inheritance chain
      let layoutNode = undefined;
      let layoutPath: string | undefined = undefined;
      let masterNode = undefined;
      let masterPath: string | undefined = undefined;

      if (slideData.layoutRelId) {
        try {
          const layoutData = await parser.getSlideLayout(slideData.path, slideData.layoutRelId);
          layoutNode = layoutData.content;
          layoutPath = layoutData.path;

          if (layoutData.masterRelId) {
            try {
              const masterData = await parser.getSlideMaster(layoutData.path, layoutData.masterRelId);
              masterNode = masterData.content;
              masterPath = masterData.path;
            } catch (error) {
              this.logger.warn('Failed to load slide master', {
                slideIndex,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        } catch (error) {
          this.logger.warn('Failed to load slide layout', {
            slideIndex,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Render the slide
      const output = await slideRenderer.renderSlide(
        parser,
        slideData,
        slideWidth,
        slideHeight,
        layoutNode,
        masterNode,
        layoutPath,
        masterPath
      );

      return {
        slideIndex,
        slideNumber: slideIndex + 1,
        imageData: output.imageData,
        width: output.width,
        height: output.height,
        success: output.success,
        errorMessage: output.error,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.error('Failed to render slide', {
        slideIndex,
        error: message,
      });

      return {
        slideIndex,
        slideNumber: slideIndex + 1,
        imageData: Buffer.alloc(0),
        width: 0,
        height: 0,
        success: false,
        errorMessage: message,
        errorStack: stack,
      };
    }
  }

  /**
   * Gets the number of slides in a presentation.
   */
  async getSlideCount(input: Buffer | string): Promise<number> {
    const parser = new PptxParser(this.logger.child('Parser'));

    try {
      await parser.open(input);
      return parser.getSlideCount();
    } finally {
      parser.close();
    }
  }

  /**
   * Gets the slide dimensions in EMU.
   */
  async getSlideDimensions(input: Buffer | string): Promise<{ width: number; height: number }> {
    const parser = new PptxParser(this.logger.child('Parser'));

    try {
      await parser.open(input);
      const presentation = await parser.getPresentation();

      return {
        width: presentation.slideWidth,
        height: presentation.slideHeight,
      };
    } finally {
      parser.close();
    }
  }
}

/**
 * Creates a new PptxImageRenderer instance.
 */
export function createRenderer(options?: { logLevel?: PptxRenderOptions['logLevel'] }): IPptxImageRenderer {
  return new PptxImageRenderer(options);
}

/**
 * Convenience function to render a presentation.
 */
export async function renderPresentation(
  input: Buffer | string,
  options?: PptxRenderOptions
): Promise<PresentationRenderResult> {
  const renderer = new PptxImageRenderer({ logLevel: options?.logLevel });
  return renderer.renderPresentation(input, options);
}

/**
 * Convenience function to render a single slide.
 */
export async function renderSlide(
  input: Buffer | string,
  slideIndex: number,
  options?: PptxRenderOptions
): Promise<SlideRenderResult> {
  const renderer = new PptxImageRenderer({ logLevel: options?.logLevel });
  return renderer.renderSlide(input, slideIndex, options);
}
