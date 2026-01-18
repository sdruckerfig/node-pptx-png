import type { Rgba } from './geometry.js';

/**
 * Resolved color scheme with all 12 standard theme colors.
 * Values are fully computed RGBA colors.
 */
export interface ResolvedColorScheme {
  /** Dark 1 - typically black or near-black (tx1/bg1 alternate) */
  dark1: Rgba;
  /** Light 1 - typically white or near-white (tx2/bg2 alternate) */
  light1: Rgba;
  /** Dark 2 - secondary dark color */
  dark2: Rgba;
  /** Light 2 - secondary light color */
  light2: Rgba;
  /** Accent 1 - primary accent color */
  accent1: Rgba;
  /** Accent 2 */
  accent2: Rgba;
  /** Accent 3 */
  accent3: Rgba;
  /** Accent 4 */
  accent4: Rgba;
  /** Accent 5 */
  accent5: Rgba;
  /** Accent 6 */
  accent6: Rgba;
  /** Hyperlink color */
  hyperlink: Rgba;
  /** Followed hyperlink color */
  followedHyperlink: Rgba;
}

/**
 * Resolved font scheme with heading and body fonts.
 */
export interface ResolvedFontScheme {
  /** Major font family for headings/titles */
  majorFont: string;
  /** Minor font family for body text */
  minorFont: string;
  /** East Asian major font (optional) */
  majorFontEastAsian?: string;
  /** East Asian minor font (optional) */
  minorFontEastAsian?: string;
  /** Complex script major font (optional) */
  majorFontComplexScript?: string;
  /** Complex script minor font (optional) */
  minorFontComplexScript?: string;
}

/**
 * Fully resolved theme with computed colors and fonts.
 */
export interface ResolvedTheme {
  /** Resolved color scheme */
  colors: ResolvedColorScheme;
  /** Resolved font scheme */
  fonts: ResolvedFontScheme;
  /** Background fill style colors (indexed 0-2 typically) */
  backgroundFillStyles?: Rgba[];
}

/**
 * Scheme color references used in OpenXML.
 */
export type SchemeColorType =
  | 'dk1'
  | 'lt1'
  | 'dk2'
  | 'lt2'
  | 'accent1'
  | 'accent2'
  | 'accent3'
  | 'accent4'
  | 'accent5'
  | 'accent6'
  | 'hlink'
  | 'folHlink'
  | 'tx1'
  | 'tx2'
  | 'bg1'
  | 'bg2'
  | 'phClr';

/**
 * Color transform types that can be applied to a base color.
 */
export interface ColorTransform {
  /** Tint - lighten color toward white (0-100000 = 0-100%) */
  tint?: number;
  /** Shade - darken color toward black (0-100000 = 0-100%) */
  shade?: number;
  /** Saturation modulation (0-100000 = 0-100% scale) */
  satMod?: number;
  /** Luminance modulation (0-100000 = 0-100% scale) */
  lumMod?: number;
  /** Luminance offset (-100000 to 100000 = -100% to 100%) */
  lumOff?: number;
  /** Hue modulation (0-100000 = 0-100% scale) */
  hueMod?: number;
  /** Hue offset (-360 to 360 degrees, in 60000ths) */
  hueOff?: number;
  /** Alpha/transparency (0-100000 = 0-100%) */
  alpha?: number;
}

/**
 * Default Office theme colors.
 */
export const DEFAULT_OFFICE_COLORS: ResolvedColorScheme = {
  dark1: { r: 0, g: 0, b: 0, a: 255 },
  light1: { r: 255, g: 255, b: 255, a: 255 },
  dark2: { r: 68, g: 84, b: 106, a: 255 },
  light2: { r: 231, g: 230, b: 230, a: 255 },
  accent1: { r: 68, g: 114, b: 196, a: 255 },
  accent2: { r: 237, g: 125, b: 49, a: 255 },
  accent3: { r: 165, g: 165, b: 165, a: 255 },
  accent4: { r: 255, g: 192, b: 0, a: 255 },
  accent5: { r: 91, g: 155, b: 213, a: 255 },
  accent6: { r: 112, g: 173, b: 71, a: 255 },
  hyperlink: { r: 5, g: 99, b: 193, a: 255 },
  followedHyperlink: { r: 149, g: 79, b: 114, a: 255 },
};

/**
 * Default font scheme.
 */
export const DEFAULT_FONT_SCHEME: ResolvedFontScheme = {
  majorFont: 'Calibri Light',
  minorFont: 'Calibri',
};

/**
 * Default resolved theme.
 */
export const DEFAULT_THEME: ResolvedTheme = {
  colors: DEFAULT_OFFICE_COLORS,
  fonts: DEFAULT_FONT_SCHEME,
  backgroundFillStyles: [
    { r: 255, g: 255, b: 255, a: 255 },
    { r: 231, g: 230, b: 230, a: 255 },
    { r: 68, g: 84, b: 106, a: 255 },
  ],
};
