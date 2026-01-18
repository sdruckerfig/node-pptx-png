/**
 * Decodes image data from Buffer to canvas-compatible Image objects.
 * Handles different image formats (PNG, JPEG, GIF, BMP, WebP).
 */

import { loadImage, type Image } from 'skia-canvas';
import type { ILogger } from './Logger.js';
import { createLogger } from './Logger.js';

/**
 * Supported image formats.
 */
export type ImageFormat = 'png' | 'jpeg' | 'gif' | 'bmp' | 'webp' | 'unknown';

/**
 * Result of decoding an image.
 */
export interface DecodedImage {
  /** The decoded Image object */
  image: Image;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Detected format */
  format: ImageFormat;
}

/**
 * Configuration for ImageDecoder.
 */
export interface ImageDecoderConfig {
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Image signature bytes for format detection.
 */
const IMAGE_SIGNATURES = {
  png: [0x89, 0x50, 0x4e, 0x47],  // .PNG
  jpeg: [0xff, 0xd8, 0xff],       // JPEG SOI marker
  gif: [0x47, 0x49, 0x46],        // GIF
  bmp: [0x42, 0x4d],              // BM
  webp: [0x52, 0x49, 0x46, 0x46], // RIFF (WebP container)
} as const;

/**
 * Decodes images from binary data to canvas-compatible Image objects.
 * Note: Caching is handled at the ImageRenderer level by relationship ID,
 * which is the correct key for deduplication.
 */
export class ImageDecoder {
  private readonly logger: ILogger;

  constructor(config: ImageDecoderConfig = {}) {
    this.logger = config.logger ?? createLogger('warn', 'ImageDecoder');
  }

  /**
   * Detects the image format from the buffer's magic bytes.
   */
  detectFormat(buffer: Buffer): ImageFormat {
    if (buffer.length < 4) {
      return 'unknown';
    }

    // Check PNG signature
    if (this.matchesSignature(buffer, IMAGE_SIGNATURES.png)) {
      return 'png';
    }

    // Check JPEG signature
    if (this.matchesSignature(buffer, IMAGE_SIGNATURES.jpeg)) {
      return 'jpeg';
    }

    // Check GIF signature
    if (this.matchesSignature(buffer, IMAGE_SIGNATURES.gif)) {
      return 'gif';
    }

    // Check BMP signature
    if (this.matchesSignature(buffer, IMAGE_SIGNATURES.bmp)) {
      return 'bmp';
    }

    // Check WebP (RIFF container with WEBP)
    if (
      this.matchesSignature(buffer, IMAGE_SIGNATURES.webp) &&
      buffer.length >= 12 &&
      buffer[8] === 0x57 && // W
      buffer[9] === 0x45 && // E
      buffer[10] === 0x42 && // B
      buffer[11] === 0x50   // P
    ) {
      return 'webp';
    }

    return 'unknown';
  }

  /**
   * Checks if a buffer starts with the given signature bytes.
   */
  private matchesSignature(buffer: Buffer, signature: readonly number[]): boolean {
    if (buffer.length < signature.length) {
      return false;
    }
    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Decodes an image from a Buffer.
   *
   * @param buffer The image data as a Buffer
   * @returns The decoded image with metadata
   * @throws Error if the image cannot be decoded
   */
  async decode(buffer: Buffer): Promise<DecodedImage> {
    const format = this.detectFormat(buffer);

    this.logger.debug('Decoding image', {
      format,
      size: buffer.length,
    });

    try {
      // loadImage can take a Buffer directly
      const image = await loadImage(buffer);

      const result: DecodedImage = {
        image,
        width: image.width,
        height: image.height,
        format,
      };

      this.logger.debug('Image decoded successfully', {
        format,
        width: image.width,
        height: image.height,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to decode image', {
        format,
        size: buffer.length,
        error: message,
      });
      throw new Error(`Failed to decode image: ${message}`);
    }
  }

  /**
   * Decodes an image from a data URI.
   *
   * @param dataUri The data URI string (e.g., data:image/png;base64,...)
   * @returns The decoded image with metadata
   */
  async decodeDataUri(dataUri: string): Promise<DecodedImage> {
    // Parse data URI
    const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error('Invalid data URI format');
    }

    const mimeType = match[1];
    const base64Data = match[2];

    if (!base64Data) {
      throw new Error('No image data in data URI');
    }

    const buffer = Buffer.from(base64Data, 'base64');

    this.logger.debug('Decoding image from data URI', {
      mimeType,
      size: buffer.length,
    });

    return this.decode(buffer);
  }

  /**
   * Gets the MIME type for an image format.
   */
  getMimeType(format: ImageFormat): string {
    switch (format) {
      case 'png':
        return 'image/png';
      case 'jpeg':
        return 'image/jpeg';
      case 'gif':
        return 'image/gif';
      case 'bmp':
        return 'image/bmp';
      case 'webp':
        return 'image/webp';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Gets the file extension for an image format.
   */
  getExtension(format: ImageFormat): string {
    switch (format) {
      case 'png':
        return '.png';
      case 'jpeg':
        return '.jpg';
      case 'gif':
        return '.gif';
      case 'bmp':
        return '.bmp';
      case 'webp':
        return '.webp';
      default:
        return '.bin';
    }
  }

}

/**
 * Creates an ImageDecoder instance.
 */
export function createImageDecoder(logger?: ILogger): ImageDecoder {
  return new ImageDecoder({ logger });
}
