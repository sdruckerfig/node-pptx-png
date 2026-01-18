/**
 * Formats bullet points and numbered lists.
 * Handles different bullet types (char, autoNum, blip) and calculates indentation.
 */

import type { Rgba } from '../types/geometry.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Bullet types supported by PPTX.
 */
export type BulletType = 'none' | 'char' | 'autoNum' | 'blip';

/**
 * Auto-numbering types for numbered lists.
 */
export type AutoNumType =
  | 'arabicPeriod'      // 1. 2. 3.
  | 'arabicParenR'      // 1) 2) 3)
  | 'arabicParenBoth'   // (1) (2) (3)
  | 'arabicPlain'       // 1 2 3
  | 'romanUcPeriod'     // I. II. III.
  | 'romanLcPeriod'     // i. ii. iii.
  | 'romanUcParenR'     // I) II) III)
  | 'romanLcParenR'     // i) ii) iii)
  | 'romanUcParenBoth'  // (I) (II) (III)
  | 'romanLcParenBoth'  // (i) (ii) (iii)
  | 'alphaUcPeriod'     // A. B. C.
  | 'alphaLcPeriod'     // a. b. c.
  | 'alphaUcParenR'     // A) B) C)
  | 'alphaLcParenR'     // a) b) c)
  | 'alphaUcParenBoth'  // (A) (B) (C)
  | 'alphaLcParenBoth'  // (a) (b) (c)
  | 'circleNumDbPlain'  // Circled numbers
  | 'circleNumWdBlackPlain'
  | 'circleNumWdWhitePlain';

/**
 * Bullet properties from paragraph properties.
 */
export interface BulletProps {
  /** Bullet type */
  type: BulletType;
  /** Bullet character (for 'char' type) */
  char?: string;
  /** Auto-numbering type (for 'autoNum' type) */
  autoNumType?: AutoNumType;
  /** Starting number for auto-numbering */
  startAt?: number;
  /** Bullet color (undefined = use text color) */
  color?: Rgba;
  /** Bullet size as percentage of text size (100 = same size) */
  sizePercent?: number;
  /** Bullet font family */
  font?: string;
}

/**
 * Formatted bullet result ready for rendering.
 */
export interface FormattedBullet {
  /** Text to render as bullet */
  text: string;
  /** Font family to use for bullet */
  font?: string;
  /** Color to use (undefined = use text color) */
  color?: Rgba;
  /** Size multiplier (1.0 = same as text) */
  sizeMultiplier: number;
  /** Width of the bullet text in current font */
  width?: number;
}

/**
 * Configuration for BulletFormatter.
 */
export interface BulletFormatterConfig {
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Common bullet characters.
 */
const BULLET_CHARS: Record<string, string> = {
  // Standard bullets
  'bullet': '\u2022',       // Bullet: o
  'disc': '\u2022',         // Same as bullet
  'circle': '\u25CB',       // White circle
  'square': '\u25A0',       // Black square
  'diamond': '\u25C6',      // Black diamond
  'dash': '\u2013',         // En dash
  'heavyMinus': '\u2796',   // Heavy minus sign
  'arrow': '\u2192',        // Right arrow
  'checkmark': '\u2713',    // Check mark
  'star': '\u2605',         // Black star

  // Wingdings mappings (common codes)
  '\uF0B7': '\u2022',       // Wingdings bullet
  '\uF0A7': '\u25AA',       // Small black square
  '\uF0FC': '\u2713',       // Checkmark
  '\uF076': '\u2756',       // Black diamond minus white X
};

/**
 * Roman numeral conversion map.
 */
const ROMAN_NUMERALS: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/**
 * Formats bullet points and numbered lists.
 */
export class BulletFormatter {
  private readonly logger: ILogger;

  constructor(config: BulletFormatterConfig = {}) {
    this.logger = config.logger ?? createLogger('warn', 'BulletFormatter');
  }

  /**
   * Formats a bullet for a paragraph.
   *
   * @param bulletProps Bullet properties from paragraph
   * @param paragraphIndex Index of paragraph within its list context
   * @param level Indentation level (0-8)
   * @returns Formatted bullet ready for rendering, or undefined if no bullet
   */
  formatBullet(
    bulletProps: BulletProps | undefined,
    paragraphIndex: number,
    level: number = 0
  ): FormattedBullet | undefined {
    if (!bulletProps || bulletProps.type === 'none') {
      return undefined;
    }

    const sizeMultiplier = bulletProps.sizePercent !== undefined
      ? bulletProps.sizePercent / 100
      : 1.0;

    switch (bulletProps.type) {
      case 'char':
        return this.formatCharBullet(bulletProps, sizeMultiplier);

      case 'autoNum':
        return this.formatAutoNumBullet(bulletProps, paragraphIndex, sizeMultiplier);

      case 'blip':
        // Picture bullets - fall back to standard bullet
        this.logger.debug('Picture bullet not supported, using standard bullet');
        return {
          text: '\u2022',
          color: bulletProps.color,
          sizeMultiplier,
        };

      default:
        return undefined;
    }
  }

  /**
   * Formats a character bullet.
   */
  private formatCharBullet(
    bulletProps: BulletProps,
    sizeMultiplier: number
  ): FormattedBullet {
    let char = bulletProps.char ?? '\u2022';

    // Map special characters to standard Unicode
    const mappedChar = BULLET_CHARS[char];
    if (mappedChar) {
      char = mappedChar;
    }

    return {
      text: char,
      font: bulletProps.font,
      color: bulletProps.color,
      sizeMultiplier,
    };
  }

  /**
   * Formats an auto-numbered bullet.
   */
  private formatAutoNumBullet(
    bulletProps: BulletProps,
    paragraphIndex: number,
    sizeMultiplier: number
  ): FormattedBullet {
    const startAt = bulletProps.startAt ?? 1;
    const number = startAt + paragraphIndex;
    const autoNumType = bulletProps.autoNumType ?? 'arabicPeriod';

    const text = this.formatNumber(number, autoNumType);

    return {
      text,
      font: bulletProps.font,
      color: bulletProps.color,
      sizeMultiplier,
    };
  }

  /**
   * Formats a number according to the auto-numbering type.
   */
  private formatNumber(number: number, autoNumType: AutoNumType): string {
    switch (autoNumType) {
      // Arabic numerals
      case 'arabicPeriod':
        return `${number}.`;
      case 'arabicParenR':
        return `${number})`;
      case 'arabicParenBoth':
        return `(${number})`;
      case 'arabicPlain':
        return `${number}`;

      // Roman numerals - uppercase
      case 'romanUcPeriod':
        return `${this.toRoman(number)}.`;
      case 'romanUcParenR':
        return `${this.toRoman(number)})`;
      case 'romanUcParenBoth':
        return `(${this.toRoman(number)})`;

      // Roman numerals - lowercase
      case 'romanLcPeriod':
        return `${this.toRoman(number).toLowerCase()}.`;
      case 'romanLcParenR':
        return `${this.toRoman(number).toLowerCase()})`;
      case 'romanLcParenBoth':
        return `(${this.toRoman(number).toLowerCase()})`;

      // Alphabetic - uppercase
      case 'alphaUcPeriod':
        return `${this.toAlpha(number)}.`;
      case 'alphaUcParenR':
        return `${this.toAlpha(number)})`;
      case 'alphaUcParenBoth':
        return `(${this.toAlpha(number)})`;

      // Alphabetic - lowercase
      case 'alphaLcPeriod':
        return `${this.toAlpha(number).toLowerCase()}.`;
      case 'alphaLcParenR':
        return `${this.toAlpha(number).toLowerCase()})`;
      case 'alphaLcParenBoth':
        return `(${this.toAlpha(number).toLowerCase()})`;

      // Circled numbers
      case 'circleNumDbPlain':
      case 'circleNumWdBlackPlain':
      case 'circleNumWdWhitePlain':
        return this.toCircledNumber(number);

      default:
        return `${number}.`;
    }
  }

  /**
   * Converts a number to Roman numerals.
   */
  private toRoman(num: number): string {
    if (num <= 0 || num > 3999) {
      return String(num);
    }

    let result = '';
    let remaining = num;

    for (const [value, symbol] of ROMAN_NUMERALS) {
      while (remaining >= value) {
        result += symbol;
        remaining -= value;
      }
    }

    return result;
  }

  /**
   * Converts a number to alphabetic representation (A, B, C, ... AA, AB, ...).
   */
  private toAlpha(num: number): string {
    if (num <= 0) {
      return String(num);
    }

    let result = '';
    let remaining = num;

    while (remaining > 0) {
      remaining--;
      result = String.fromCharCode(65 + (remaining % 26)) + result;
      remaining = Math.floor(remaining / 26);
    }

    return result;
  }

  /**
   * Converts a number to circled number (Unicode).
   */
  private toCircledNumber(num: number): string {
    // Unicode circled numbers: 1-20 available
    if (num >= 1 && num <= 20) {
      // Circled digit one starts at U+2460
      return String.fromCharCode(0x2460 + num - 1);
    }
    // Fall back to regular number for larger values
    return `(${num})`;
  }

  /**
   * Calculates bullet indentation in EMU based on level.
   *
   * @param level Indentation level (0-8)
   * @param baseIndent Base indentation in EMU (default: 457200 = 0.5 inch)
   * @returns Indentation in EMU
   */
  calculateBulletIndent(level: number, baseIndent: number = 457200): number {
    return level * baseIndent;
  }

  /**
   * Gets the default bullet character for a given level.
   *
   * @param level Indentation level (0-8)
   * @returns Default bullet character for that level
   */
  getDefaultBulletChar(level: number): string {
    const levelBullets = [
      '\u2022',  // Level 0: Bullet
      '\u25CB',  // Level 1: White circle
      '\u25AA',  // Level 2: Black small square
      '\u2022',  // Level 3: Bullet
      '\u25CB',  // Level 4: White circle
      '\u25AA',  // Level 5: Black small square
      '\u2022',  // Level 6: Bullet
      '\u25CB',  // Level 7: White circle
      '\u25AA',  // Level 8: Black small square
    ];

    return levelBullets[level % levelBullets.length] ?? '\u2022';
  }
}

/**
 * Creates a BulletFormatter instance.
 */
export function createBulletFormatter(logger?: ILogger): BulletFormatter {
  return new BulletFormatter({ logger });
}
