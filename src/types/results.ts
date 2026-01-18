/**
 * Result of rendering a single slide.
 */
export interface SlideRenderResult {
  /**
   * Zero-based slide index.
   */
  slideIndex: number;

  /**
   * One-based slide number for display purposes.
   */
  slideNumber: number;

  /**
   * Rendered image data as a Buffer (PNG or JPEG bytes).
   */
  imageData: Buffer;

  /**
   * Rendered image width in pixels.
   */
  width: number;

  /**
   * Rendered image height in pixels.
   */
  height: number;

  /**
   * Whether the slide was rendered successfully.
   */
  success: boolean;

  /**
   * Error message if rendering failed.
   */
  errorMessage?: string;

  /**
   * Detailed error stack if available.
   */
  errorStack?: string;
}

/**
 * Result of rendering an entire presentation.
 */
export interface PresentationRenderResult {
  /**
   * Results for each slide in order.
   */
  slides: SlideRenderResult[];

  /**
   * Total number of slides in the presentation.
   */
  totalSlides: number;

  /**
   * Number of slides that rendered successfully.
   */
  successfulSlides: number;

  /**
   * Whether all slides rendered successfully.
   */
  allSuccessful: boolean;

  /**
   * Presentation-level errors (e.g., invalid PPTX file).
   */
  errors?: RenderError[];
}

/**
 * Level at which a rendering error occurred.
 */
export type RenderErrorLevel = 'presentation' | 'slide' | 'element';

/**
 * Detailed error information for rendering failures.
 */
export interface RenderError {
  /**
   * Level at which the error occurred.
   */
  level: RenderErrorLevel;

  /**
   * Slide index if applicable (zero-based).
   */
  slideIndex?: number;

  /**
   * Type of element that caused the error.
   */
  elementType?: string;

  /**
   * Element ID or identifier if available.
   */
  elementId?: string;

  /**
   * Human-readable error message.
   */
  message: string;

  /**
   * Stack trace if available.
   */
  stack?: string;
}
