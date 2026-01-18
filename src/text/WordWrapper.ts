/**
 * Word wrapping algorithm for text layout.
 * Breaks text into lines that fit within a given width.
 */

import type { CanvasRenderingContext2D } from 'skia-canvas';
import type { FontResolver, ResolvedFont } from './FontResolver.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Text wrapping modes.
 */
export type WrapMode = 'none' | 'word' | 'char';

/**
 * A fragment of text with consistent styling.
 */
export interface TextFragment {
  /** Text content */
  text: string;
  /** Resolved font for this fragment */
  font: ResolvedFont;
  /** Width of fragment in pixels (calculated during wrapping) */
  width?: number;
  /** Additional run properties (color, underline, etc.) - preserved during wrapping */
  [key: string]: unknown;
}

/**
 * A wrapped line containing one or more text fragments.
 */
export interface WrappedLine {
  /** Fragments making up this line */
  fragments: TextFragment[];
  /** Total width of the line in pixels */
  width: number;
  /** Whether this line ends a paragraph */
  endsWithNewline: boolean;
}

/**
 * Result of word wrapping operation.
 */
export interface WrapResult {
  /** Wrapped lines */
  lines: WrappedLine[];
  /** Total height of all lines in pixels */
  totalHeight: number;
  /** Maximum line width in pixels */
  maxWidth: number;
}

/**
 * Configuration for WordWrapper.
 */
export interface WordWrapperConfig {
  /** Font resolver for text measurement */
  fontResolver: FontResolver;
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Internal state returned from wrap methods.
 */
interface WrapState {
  /** Current working line fragments */
  workingLine: TextFragment[];
  /** Current line width */
  lineWidth: number;
}

/**
 * Word wrapping algorithm for text layout.
 */
export class WordWrapper {
  private readonly logger: ILogger;
  private readonly fontResolver: FontResolver;
  /** Cache for word widths to avoid O(n^2) re-measurement */
  private wordWidthCache: Map<string, number> = new Map();
  /** Cached space width for current font */
  private spaceWidthCache: Map<string, number> = new Map();

  constructor(config: WordWrapperConfig) {
    this.logger = config.logger ?? createLogger('warn', 'WordWrapper');
    this.fontResolver = config.fontResolver;
  }

  /**
   * Gets cached word width or measures and caches it.
   */
  private getCachedWidth(ctx: CanvasRenderingContext2D, text: string, font: ResolvedFont): number {
    const cacheKey = `${font.fontString}:${text}`;
    const cached = this.wordWidthCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    const width = this.fontResolver.measureText(ctx, text, font);
    this.wordWidthCache.set(cacheKey, width);
    return width;
  }

  /**
   * Gets cached space width for a font.
   */
  private getSpaceWidth(ctx: CanvasRenderingContext2D, font: ResolvedFont): number {
    const cached = this.spaceWidthCache.get(font.fontString);
    if (cached !== undefined) {
      return cached;
    }
    const width = this.fontResolver.measureText(ctx, ' ', font);
    this.spaceWidthCache.set(font.fontString, width);
    return width;
  }

  /**
   * Clears the word width cache. Call between different text bodies.
   */
  clearCache(): void {
    this.wordWidthCache.clear();
    this.spaceWidthCache.clear();
  }

  /**
   * Wraps text fragments to fit within the specified width.
   *
   * @param ctx Canvas 2D context for text measurement
   * @param fragments Text fragments to wrap
   * @param maxWidth Maximum width for each line in pixels
   * @param mode Wrapping mode ('none', 'word', 'char')
   * @param lineHeight Line height in pixels
   * @returns Wrapped lines and metrics
   */
  wrapText(
    ctx: CanvasRenderingContext2D,
    fragments: TextFragment[],
    maxWidth: number,
    mode: WrapMode = 'word',
    lineHeight: number
  ): WrapResult {
    if (mode === 'none') {
      return this.noWrap(ctx, fragments, lineHeight);
    }

    const lines: WrappedLine[] = [];
    let currentLine: TextFragment[] = [];
    let currentLineWidth = 0;

    for (const fragment of fragments) {
      // Handle newlines in fragment text
      const parts = fragment.text.split(/(\r?\n)/);

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === undefined) continue;

        // Check for newline
        if (part === '\n' || part === '\r\n') {
          // End current line
          lines.push({
            fragments: currentLine.length > 0 ? currentLine : [{ text: '', font: fragment.font, width: 0 }],
            width: currentLineWidth,
            endsWithNewline: true,
          });
          currentLine = [];
          currentLineWidth = 0;
          continue;
        }

        if (part === '') continue;

        // Wrap this part and get updated state
        let wrapState: WrapState;
        if (mode === 'word') {
          wrapState = this.wrapWords(ctx, part, fragment, maxWidth, currentLine, currentLineWidth, lines);
        } else {
          wrapState = this.wrapChars(ctx, part, fragment, maxWidth, currentLine, currentLineWidth, lines);
        }

        // Update current line state from the returned WrapState
        if (lines.length > 0) {
          const lastLine = lines[lines.length - 1];
          if (lastLine && !lastLine.endsWithNewline) {
            // The last line is the current working line - use state from wrapState
            currentLine = wrapState.workingLine;
            currentLineWidth = wrapState.lineWidth;
            lines.pop();
          } else {
            currentLine = [];
            currentLineWidth = 0;
          }
        }
      }
    }

    // Add remaining text as final line
    if (currentLine.length > 0) {
      lines.push({
        fragments: currentLine,
        width: currentLineWidth,
        endsWithNewline: false,
      });
    }

    // Calculate total metrics
    const totalHeight = lines.length * lineHeight;
    const maxLineWidth = Math.max(0, ...lines.map(l => l.width));

    this.logger.debug('Wrapped text', {
      fragmentCount: fragments.length,
      lineCount: lines.length,
      maxWidth: maxLineWidth,
    });

    return {
      lines,
      totalHeight,
      maxWidth: maxLineWidth,
    };
  }

  /**
   * No wrapping - puts all fragments on a single line.
   */
  private noWrap(
    ctx: CanvasRenderingContext2D,
    fragments: TextFragment[],
    lineHeight: number
  ): WrapResult {
    const measuredFragments: TextFragment[] = [];
    let totalWidth = 0;

    for (const fragment of fragments) {
      const text = fragment.text.replace(/\r?\n/g, ' ');
      const width = this.measureText(ctx, text, fragment.font);
      measuredFragments.push({ ...fragment, text, width });
      totalWidth += width;
    }

    return {
      lines: [{
        fragments: measuredFragments,
        width: totalWidth,
        endsWithNewline: false,
      }],
      totalHeight: lineHeight,
      maxWidth: totalWidth,
    };
  }

  /**
   * Wraps text at word boundaries.
   * Uses cached word widths and running totals to avoid O(n^2) re-measurement.
   */
  private wrapWords(
    ctx: CanvasRenderingContext2D,
    text: string,
    sourceFragment: TextFragment,
    maxWidth: number,
    currentLine: TextFragment[],
    currentLineWidth: number,
    lines: WrappedLine[]
  ): WrapState {
    const font = sourceFragment.font;
    // Split text into words, preserving spaces
    const words = text.split(/(\s+)/);
    let lineWidth = currentLineWidth;
    let lineText = '';
    let lineTextWidth = 0;
    let workingLine = [...currentLine]; // Clone to avoid mutating input

    // Helper to create fragment preserving extra properties from source
    const createFragment = (fragText: string, fragWidth: number): TextFragment => {
      const frag: TextFragment = { text: fragText, font, width: fragWidth };
      // Copy extra properties from source fragment (like runProps)
      for (const key of Object.keys(sourceFragment)) {
        if (key !== 'text' && key !== 'font' && key !== 'width') {
          frag[key] = sourceFragment[key];
        }
      }
      return frag;
    };

    for (const word of words) {
      if (word === '') continue;

      // Use cached width measurement
      const wordWidth = this.getCachedWidth(ctx, word, font);

      // Check if word fits on current line
      if (lineWidth + wordWidth <= maxWidth || lineWidth === 0) {
        // Word fits, add to current line - track width incrementally
        lineText += word;
        lineTextWidth += wordWidth;
        lineWidth += wordWidth;
      } else {
        // Word doesn't fit, start new line
        if (lineText) {
          // Add current line text as fragment with pre-computed width
          if (workingLine.length === 0 || workingLine[workingLine.length - 1]?.font.fontString !== font.fontString) {
            workingLine.push(createFragment(lineText, lineTextWidth));
          } else {
            const lastFrag = workingLine[workingLine.length - 1];
            if (lastFrag) {
              lastFrag.text += lineText;
              // Add to existing width instead of re-measuring
              lastFrag.width = (lastFrag.width ?? 0) + lineTextWidth;
            }
          }
        }

        lines.push({
          fragments: workingLine,
          width: lineWidth - wordWidth,
          endsWithNewline: false,
        });

        // Start new line with current word - create new array instead of splice
        workingLine = [];
        lineText = word;
        lineTextWidth = wordWidth;
        lineWidth = wordWidth;
      }
    }

    // Add remaining text to current line
    if (lineText) {
      if (workingLine.length === 0 || workingLine[workingLine.length - 1]?.font.fontString !== font.fontString) {
        workingLine.push(createFragment(lineText, lineTextWidth));
      } else {
        const lastFrag = workingLine[workingLine.length - 1];
        if (lastFrag) {
          lastFrag.text += lineText;
          // Add to existing width instead of re-measuring
          lastFrag.width = (lastFrag.width ?? 0) + lineTextWidth;
        }
      }
    }

    // Push current line as the "working" line
    lines.push({
      fragments: [...workingLine],
      width: lineWidth,
      endsWithNewline: false,
    });

    // Return the updated state
    return { workingLine, lineWidth };
  }

  /**
   * Wraps text at character boundaries (for CJK or when words don't fit).
   * Uses cached character widths and running totals to avoid O(n^2) re-measurement.
   */
  private wrapChars(
    ctx: CanvasRenderingContext2D,
    text: string,
    sourceFragment: TextFragment,
    maxWidth: number,
    currentLine: TextFragment[],
    currentLineWidth: number,
    lines: WrappedLine[]
  ): WrapState {
    const font = sourceFragment.font;
    let lineWidth = currentLineWidth;
    let lineText = '';
    let lineTextWidth = 0;
    let workingLine = [...currentLine]; // Clone to avoid mutating input

    // Helper to create fragment preserving extra properties from source
    const createFragment = (fragText: string, fragWidth: number): TextFragment => {
      const frag: TextFragment = { text: fragText, font, width: fragWidth };
      // Copy extra properties from source fragment (like runProps)
      for (const key of Object.keys(sourceFragment)) {
        if (key !== 'text' && key !== 'font' && key !== 'width') {
          frag[key] = sourceFragment[key];
        }
      }
      return frag;
    };

    for (const char of text) {
      // Use cached width measurement
      const charWidth = this.getCachedWidth(ctx, char, font);

      if (lineWidth + charWidth <= maxWidth || lineWidth === 0) {
        lineText += char;
        lineTextWidth += charWidth;
        lineWidth += charWidth;
      } else {
        // Line is full, push it
        if (lineText) {
          workingLine.push(createFragment(lineText, lineTextWidth));
        }

        lines.push({
          fragments: [...workingLine],
          width: lineWidth - charWidth,
          endsWithNewline: false,
        });

        // Start new line - create new array instead of splice
        workingLine = [];
        lineText = char;
        lineTextWidth = charWidth;
        lineWidth = charWidth;
      }
    }

    // Add remaining characters
    if (lineText) {
      workingLine.push(createFragment(lineText, lineTextWidth));
    }

    lines.push({
      fragments: [...workingLine],
      width: lineWidth,
      endsWithNewline: false,
    });

    // Return the updated state
    return { workingLine, lineWidth };
  }

  /**
   * Measures text width using the font resolver.
   */
  private measureText(ctx: CanvasRenderingContext2D, text: string, font: ResolvedFont): number {
    return this.fontResolver.measureText(ctx, text, font);
  }

  /**
   * Finds word boundaries in text.
   * Returns array of indices where words start.
   */
  findWordBoundaries(text: string): number[] {
    const boundaries: number[] = [0];

    for (let i = 1; i < text.length; i++) {
      const prevChar = text[i - 1];
      const currChar = text[i];

      if (prevChar === undefined || currChar === undefined) continue;

      // Word boundary conditions:
      // - After whitespace
      // - Before/after punctuation
      // - CJK character boundaries
      if (
        /\s/.test(prevChar) && !/\s/.test(currChar) ||
        this.isCjkChar(currChar) ||
        (this.isCjkChar(prevChar) && !this.isCjkChar(currChar))
      ) {
        boundaries.push(i);
      }
    }

    return boundaries;
  }

  /**
   * Checks if a character is a CJK (Chinese, Japanese, Korean) character.
   */
  private isCjkChar(char: string): boolean {
    const code = char.charCodeAt(0);
    return (
      (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified Ideographs
      (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Extension A
      (code >= 0x3000 && code <= 0x303F) ||   // CJK Punctuation
      (code >= 0x3040 && code <= 0x309F) ||   // Hiragana
      (code >= 0x30A0 && code <= 0x30FF) ||   // Katakana
      (code >= 0xAC00 && code <= 0xD7AF)      // Hangul
    );
  }

  /**
   * Finds potential hyphenation points in a word.
   * Returns array of indices where hyphenation is allowed.
   * Note: This is a simple syllable-based approach; full hyphenation
   * would require a dictionary or hyphenation algorithm like Knuth-Liang.
   */
  findHyphenationPoints(word: string): number[] {
    const points: number[] = [];
    const minLength = 4;

    if (word.length < minLength) {
      return points;
    }

    // Simple vowel-based syllable detection
    const vowels = 'aeiouAEIOU';

    for (let i = 2; i < word.length - 2; i++) {
      const char = word[i];
      const prevChar = word[i - 1];

      if (char && prevChar && vowels.includes(prevChar) && !vowels.includes(char)) {
        points.push(i);
      }
    }

    return points;
  }
}

/**
 * Creates a WordWrapper instance.
 */
export function createWordWrapper(fontResolver: FontResolver, logger?: ILogger): WordWrapper {
  return new WordWrapper({ fontResolver, logger });
}
