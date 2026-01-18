import { describe, it, expect } from 'vitest';
import { ColorResolver } from '../../src/theme/ColorResolver.js';
import { DEFAULT_OFFICE_COLORS } from '../../src/types/index.js';

describe('ColorResolver', () => {
  describe('Scheme color resolution', () => {
    it('should resolve scheme colors from default Office theme', () => {
      const resolver = new ColorResolver(DEFAULT_OFFICE_COLORS);

      expect(resolver.resolveSchemeColor('dk1')).toEqual(DEFAULT_OFFICE_COLORS.dark1);
      expect(resolver.resolveSchemeColor('lt1')).toEqual(DEFAULT_OFFICE_COLORS.light1);
      expect(resolver.resolveSchemeColor('accent1')).toEqual(DEFAULT_OFFICE_COLORS.accent1);
    });

    it('should map text and background colors to dark/light', () => {
      const resolver = new ColorResolver(DEFAULT_OFFICE_COLORS);

      expect(resolver.resolveSchemeColor('tx1')).toEqual(DEFAULT_OFFICE_COLORS.dark1);
      expect(resolver.resolveSchemeColor('tx2')).toEqual(DEFAULT_OFFICE_COLORS.dark2);
      expect(resolver.resolveSchemeColor('bg1')).toEqual(DEFAULT_OFFICE_COLORS.light1);
      expect(resolver.resolveSchemeColor('bg2')).toEqual(DEFAULT_OFFICE_COLORS.light2);
    });
  });

  describe('Hex color parsing', () => {
    it('should parse 6-digit hex colors', () => {
      const resolver = new ColorResolver();

      expect(resolver.parseHexColor('FF0000')).toEqual({ r: 255, g: 0, b: 0, a: 255 });
      expect(resolver.parseHexColor('00FF00')).toEqual({ r: 0, g: 255, b: 0, a: 255 });
      expect(resolver.parseHexColor('0000FF')).toEqual({ r: 0, g: 0, b: 255, a: 255 });
    });

    it('should parse 3-digit hex shorthand', () => {
      const resolver = new ColorResolver();

      expect(resolver.parseHexColor('F00')).toEqual({ r: 255, g: 0, b: 0, a: 255 });
      expect(resolver.parseHexColor('0F0')).toEqual({ r: 0, g: 255, b: 0, a: 255 });
      expect(resolver.parseHexColor('00F')).toEqual({ r: 0, g: 0, b: 255, a: 255 });
    });

    it('should handle # prefix', () => {
      const resolver = new ColorResolver();

      expect(resolver.parseHexColor('#FF0000')).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    });

    it('should parse 8-digit hex with alpha', () => {
      const resolver = new ColorResolver();

      expect(resolver.parseHexColor('FF000080')).toEqual({ r: 255, g: 0, b: 0, a: 128 });
    });
  });

  describe('Color transforms', () => {
    it('should apply tint (lighten toward white)', () => {
      const resolver = new ColorResolver();
      const baseColor = { r: 0, g: 0, b: 0, a: 255 }; // Black

      const result = resolver.applyColorTransforms(baseColor, { tint: 50000 }); // 50%

      // Tinting black by 50% should give gray
      expect(result.r).toBeGreaterThan(100);
      expect(result.g).toBeGreaterThan(100);
      expect(result.b).toBeGreaterThan(100);
    });

    it('should apply shade (darken toward black)', () => {
      const resolver = new ColorResolver();
      const baseColor = { r: 255, g: 255, b: 255, a: 255 }; // White

      const result = resolver.applyColorTransforms(baseColor, { shade: 50000 }); // 50%

      // Shading white by 50% should give gray
      expect(result.r).toBeLessThan(200);
      expect(result.g).toBeLessThan(200);
      expect(result.b).toBeLessThan(200);
    });

    it('should apply alpha', () => {
      const resolver = new ColorResolver();
      const baseColor = { r: 255, g: 0, b: 0, a: 255 };

      const result = resolver.applyColorTransforms(baseColor, { alpha: 50000 }); // 50%

      expect(result.a).toBeGreaterThanOrEqual(127);
      expect(result.a).toBeLessThanOrEqual(128);
    });

    it('should apply saturation modulation', () => {
      const resolver = new ColorResolver();
      // A saturated color
      const baseColor = { r: 255, g: 0, b: 0, a: 255 };

      const result = resolver.applyColorTransforms(baseColor, { satMod: 50000 }); // 50%

      // Reducing saturation should make color less vivid
      expect(result.g).toBeGreaterThan(0);
      expect(result.b).toBeGreaterThan(0);
    });
  });

  describe('HSL conversions', () => {
    it('should convert RGB to HSL and back', () => {
      const resolver = new ColorResolver();

      const originalRed = { r: 255, g: 0, b: 0, a: 255 };
      const hsl = resolver.rgbaToHsl(originalRed);
      const backToRgb = resolver.hslToRgba(hsl.h, hsl.s, hsl.l);

      expect(backToRgb.r).toBeCloseTo(255, 0);
      expect(backToRgb.g).toBeCloseTo(0, 0);
      expect(backToRgb.b).toBeCloseTo(0, 0);
    });

    it('should handle grayscale correctly', () => {
      const resolver = new ColorResolver();

      const gray = { r: 128, g: 128, b: 128, a: 255 };
      const hsl = resolver.rgbaToHsl(gray);

      expect(hsl.s).toBe(0); // No saturation for gray
    });
  });

  describe('Preset colors', () => {
    it('should resolve preset color names', () => {
      const resolver = new ColorResolver();

      expect(resolver.resolvePresetColor('black')).toEqual({ r: 0, g: 0, b: 0, a: 255 });
      expect(resolver.resolvePresetColor('white')).toEqual({ r: 255, g: 255, b: 255, a: 255 });
      expect(resolver.resolvePresetColor('red')).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    });
  });

  describe('CSS and hex output', () => {
    it('should convert RGBA to CSS string', () => {
      const resolver = new ColorResolver();

      expect(resolver.rgbaToCss({ r: 255, g: 0, b: 0, a: 255 })).toBe('rgb(255, 0, 0)');
      expect(resolver.rgbaToCss({ r: 255, g: 0, b: 0, a: 128 })).toMatch(/rgba\(255, 0, 0, 0\.50\d*\)/);
    });

    it('should convert RGBA to hex string', () => {
      const resolver = new ColorResolver();

      expect(resolver.rgbaToHex({ r: 255, g: 0, b: 0, a: 255 })).toBe('#ff0000');
      expect(resolver.rgbaToHex({ r: 0, g: 255, b: 0, a: 255 })).toBe('#00ff00');
      expect(resolver.rgbaToHex({ r: 255, g: 0, b: 0, a: 128 }, true)).toBe('#ff000080');
    });
  });

  describe('Luminance and contrast', () => {
    it('should calculate relative luminance', () => {
      const resolver = new ColorResolver();

      const whiteLuminance = resolver.calculateLuminance({ r: 255, g: 255, b: 255, a: 255 });
      const blackLuminance = resolver.calculateLuminance({ r: 0, g: 0, b: 0, a: 255 });

      expect(whiteLuminance).toBeCloseTo(1, 1);
      expect(blackLuminance).toBeCloseTo(0, 1);
    });

    it('should correctly identify dark colors', () => {
      const resolver = new ColorResolver();

      expect(resolver.isDarkColor({ r: 0, g: 0, b: 0, a: 255 })).toBe(true);
      expect(resolver.isDarkColor({ r: 255, g: 255, b: 255, a: 255 })).toBe(false);
      expect(resolver.isDarkColor({ r: 50, g: 50, b: 50, a: 255 })).toBe(true);
    });
  });
});
