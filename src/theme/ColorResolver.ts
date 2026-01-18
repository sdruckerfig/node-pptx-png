import type { Rgba, ColorTransform, ResolvedColorScheme, SchemeColorType } from '../types/index.js';
import { Colors, DEFAULT_OFFICE_COLORS } from '../types/index.js';
import type { PptxXmlNode } from '../core/PptxParser.js';
import { getXmlAttr, getXmlChild } from '../core/PptxParser.js';

/**
 * Resolves colors from OpenXML color definitions.
 */
export class ColorResolver {
  private readonly colorScheme: ResolvedColorScheme;

  constructor(colorScheme: ResolvedColorScheme = DEFAULT_OFFICE_COLORS) {
    this.colorScheme = colorScheme;
  }

  /**
   * Resolves a scheme color reference to an RGBA color.
   */
  resolveSchemeColor(schemeColorType: SchemeColorType): Rgba {
    switch (schemeColorType) {
      case 'dk1':
      case 'tx1':
        return { ...this.colorScheme.dark1 };
      case 'lt1':
      case 'bg1':
        return { ...this.colorScheme.light1 };
      case 'dk2':
      case 'tx2':
        return { ...this.colorScheme.dark2 };
      case 'lt2':
      case 'bg2':
        return { ...this.colorScheme.light2 };
      case 'accent1':
        return { ...this.colorScheme.accent1 };
      case 'accent2':
        return { ...this.colorScheme.accent2 };
      case 'accent3':
        return { ...this.colorScheme.accent3 };
      case 'accent4':
        return { ...this.colorScheme.accent4 };
      case 'accent5':
        return { ...this.colorScheme.accent5 };
      case 'accent6':
        return { ...this.colorScheme.accent6 };
      case 'hlink':
        return { ...this.colorScheme.hyperlink };
      case 'folHlink':
        return { ...this.colorScheme.followedHyperlink };
      case 'phClr':
        // Placeholder color - should be resolved by caller
        return { ...Colors.black };
      default:
        return { ...Colors.black };
    }
  }

  /**
   * Parses a hex color string to RGBA.
   */
  parseHexColor(hex: string): Rgba {
    // Remove # if present and handle 3-char shorthand
    hex = hex.replace('#', '');

    if (hex.length === 3) {
      const c0 = hex[0] ?? '0';
      const c1 = hex[1] ?? '0';
      const c2 = hex[2] ?? '0';
      hex = c0 + c0 + c1 + c1 + c2 + c2;
    }

    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return { r, g, b, a: 255 };
    }

    if (hex.length === 8) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const a = parseInt(hex.substring(6, 8), 16);
      return { r, g, b, a };
    }

    return { ...Colors.black };
  }

  /**
   * Resolves a color from an OpenXML color element.
   */
  resolveColorElement(node: PptxXmlNode | undefined): Rgba | undefined {
    if (!node) return undefined;

    // Check for scheme color
    const schemeColor = getXmlChild(node, 'a:schemeClr');
    if (schemeColor) {
      const val = getXmlAttr(schemeColor, 'val') as SchemeColorType | undefined;
      if (val) {
        const baseColor = this.resolveSchemeColor(val);
        return this.applyTransforms(baseColor, schemeColor);
      }
    }

    // Check for sRGB color (hex)
    const srgbColor = getXmlChild(node, 'a:srgbClr');
    if (srgbColor) {
      const val = getXmlAttr(srgbColor, 'val');
      if (val) {
        const baseColor = this.parseHexColor(val);
        return this.applyTransforms(baseColor, srgbColor);
      }
    }

    // Check for RGB percentage color
    const scrgbColor = getXmlChild(node, 'a:scrgbClr');
    if (scrgbColor) {
      const r = parseFloat(getXmlAttr(scrgbColor, 'r') ?? '0') / 100000 * 255;
      const g = parseFloat(getXmlAttr(scrgbColor, 'g') ?? '0') / 100000 * 255;
      const b = parseFloat(getXmlAttr(scrgbColor, 'b') ?? '0') / 100000 * 255;
      const baseColor = { r: Math.round(r), g: Math.round(g), b: Math.round(b), a: 255 };
      return this.applyTransforms(baseColor, scrgbColor);
    }

    // Check for HSL color
    const hslColor = getXmlChild(node, 'a:hslClr');
    if (hslColor) {
      const h = parseFloat(getXmlAttr(hslColor, 'hue') ?? '0') / 60000;
      const s = parseFloat(getXmlAttr(hslColor, 'sat') ?? '0') / 100000;
      const l = parseFloat(getXmlAttr(hslColor, 'lum') ?? '0') / 100000;
      const baseColor = this.hslToRgba(h, s, l);
      return this.applyTransforms(baseColor, hslColor);
    }

    // Check for preset color
    const prstColor = getXmlChild(node, 'a:prstClr');
    if (prstColor) {
      const val = getXmlAttr(prstColor, 'val');
      if (val) {
        const baseColor = this.resolvePresetColor(val);
        return this.applyTransforms(baseColor, prstColor);
      }
    }

    // Check for system color
    const sysColor = getXmlChild(node, 'a:sysClr');
    if (sysColor) {
      const lastClr = getXmlAttr(sysColor, 'lastClr');
      if (lastClr) {
        const baseColor = this.parseHexColor(lastClr);
        return this.applyTransforms(baseColor, sysColor);
      }
      const val = getXmlAttr(sysColor, 'val');
      if (val) {
        const baseColor = this.resolveSystemColor(val);
        return this.applyTransforms(baseColor, sysColor);
      }
    }

    return undefined;
  }

  /**
   * Extracts color transforms from an XML node.
   */
  extractTransforms(node: PptxXmlNode): ColorTransform {
    const transforms: ColorTransform = {};

    const tint = getXmlChild(node, 'a:tint');
    if (tint) {
      transforms.tint = parseInt(getXmlAttr(tint, 'val') ?? '0', 10);
    }

    const shade = getXmlChild(node, 'a:shade');
    if (shade) {
      transforms.shade = parseInt(getXmlAttr(shade, 'val') ?? '0', 10);
    }

    const satMod = getXmlChild(node, 'a:satMod');
    if (satMod) {
      transforms.satMod = parseInt(getXmlAttr(satMod, 'val') ?? '100000', 10);
    }

    const lumMod = getXmlChild(node, 'a:lumMod');
    if (lumMod) {
      transforms.lumMod = parseInt(getXmlAttr(lumMod, 'val') ?? '100000', 10);
    }

    const lumOff = getXmlChild(node, 'a:lumOff');
    if (lumOff) {
      transforms.lumOff = parseInt(getXmlAttr(lumOff, 'val') ?? '0', 10);
    }

    const hueMod = getXmlChild(node, 'a:hueMod');
    if (hueMod) {
      transforms.hueMod = parseInt(getXmlAttr(hueMod, 'val') ?? '100000', 10);
    }

    const hueOff = getXmlChild(node, 'a:hueOff');
    if (hueOff) {
      transforms.hueOff = parseInt(getXmlAttr(hueOff, 'val') ?? '0', 10);
    }

    const alpha = getXmlChild(node, 'a:alpha');
    if (alpha) {
      transforms.alpha = parseInt(getXmlAttr(alpha, 'val') ?? '100000', 10);
    }

    return transforms;
  }

  /**
   * Applies color transforms to a base color.
   */
  applyTransforms(baseColor: Rgba, node: PptxXmlNode): Rgba {
    const transforms = this.extractTransforms(node);
    return this.applyColorTransforms(baseColor, transforms);
  }

  /**
   * Applies color transforms to a base color.
   */
  applyColorTransforms(baseColor: Rgba, transforms: ColorTransform): Rgba {
    // Convert to HSL for transformations
    let { h, s, l } = this.rgbaToHsl(baseColor);
    let alpha = baseColor.a / 255;

    // Apply transforms in order: tint/shade -> satMod -> lumMod/lumOff -> hueMod/hueOff -> alpha

    // Tint (lighten toward white)
    if (transforms.tint !== undefined) {
      const tintAmount = transforms.tint / 100000;
      l = l + (1 - l) * tintAmount;
    }

    // Shade (darken toward black)
    if (transforms.shade !== undefined) {
      const shadeAmount = transforms.shade / 100000;
      l = l * shadeAmount;
    }

    // Saturation modulation
    if (transforms.satMod !== undefined) {
      s = Math.min(1, Math.max(0, s * (transforms.satMod / 100000)));
    }

    // Luminance modulation
    if (transforms.lumMod !== undefined) {
      l = Math.min(1, Math.max(0, l * (transforms.lumMod / 100000)));
    }

    // Luminance offset
    if (transforms.lumOff !== undefined) {
      l = Math.min(1, Math.max(0, l + transforms.lumOff / 100000));
    }

    // Hue modulation
    if (transforms.hueMod !== undefined) {
      h = (h * (transforms.hueMod / 100000)) % 360;
    }

    // Hue offset
    if (transforms.hueOff !== undefined) {
      h = (h + transforms.hueOff / 60000) % 360;
      if (h < 0) h += 360;
    }

    // Alpha
    if (transforms.alpha !== undefined) {
      alpha = transforms.alpha / 100000;
    }

    // Convert back to RGBA
    const result = this.hslToRgba(h, s, l);
    result.a = Math.round(alpha * 255);

    return result;
  }

  /**
   * Converts RGBA to HSL.
   */
  rgbaToHsl(color: Rgba): { h: number; s: number; l: number } {
    const r = color.r / 255;
    const g = color.g / 255;
    const b = color.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (delta !== 0) {
      s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

      if (max === r) {
        h = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
      } else if (max === g) {
        h = ((b - r) / delta + 2) * 60;
      } else {
        h = ((r - g) / delta + 4) * 60;
      }
    }

    return { h, s, l };
  }

  /**
   * Converts HSL to RGBA.
   */
  hslToRgba(h: number, s: number, l: number): Rgba {
    let r: number, g: number, b: number;

    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;

      r = this.hueToRgb(p, q, h / 360 + 1 / 3);
      g = this.hueToRgb(p, q, h / 360);
      b = this.hueToRgb(p, q, h / 360 - 1 / 3);
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
      a: 255,
    };
  }

  private hueToRgb(p: number, q: number, t: number): number {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  /**
   * Resolves a preset color name to RGBA.
   */
  resolvePresetColor(name: string): Rgba {
    const presetColors: Record<string, Rgba> = {
      black: { r: 0, g: 0, b: 0, a: 255 },
      white: { r: 255, g: 255, b: 255, a: 255 },
      red: { r: 255, g: 0, b: 0, a: 255 },
      green: { r: 0, g: 128, b: 0, a: 255 },
      blue: { r: 0, g: 0, b: 255, a: 255 },
      yellow: { r: 255, g: 255, b: 0, a: 255 },
      cyan: { r: 0, g: 255, b: 255, a: 255 },
      magenta: { r: 255, g: 0, b: 255, a: 255 },
      gray: { r: 128, g: 128, b: 128, a: 255 },
      ltGray: { r: 211, g: 211, b: 211, a: 255 },
      dkGray: { r: 169, g: 169, b: 169, a: 255 },
      dkRed: { r: 139, g: 0, b: 0, a: 255 },
      dkGreen: { r: 0, g: 100, b: 0, a: 255 },
      dkBlue: { r: 0, g: 0, b: 139, a: 255 },
      orange: { r: 255, g: 165, b: 0, a: 255 },
      pink: { r: 255, g: 192, b: 203, a: 255 },
      purple: { r: 128, g: 0, b: 128, a: 255 },
      brown: { r: 165, g: 42, b: 42, a: 255 },
      navy: { r: 0, g: 0, b: 128, a: 255 },
      teal: { r: 0, g: 128, b: 128, a: 255 },
      olive: { r: 128, g: 128, b: 0, a: 255 },
      silver: { r: 192, g: 192, b: 192, a: 255 },
      maroon: { r: 128, g: 0, b: 0, a: 255 },
      aqua: { r: 0, g: 255, b: 255, a: 255 },
      lime: { r: 0, g: 255, b: 0, a: 255 },
      fuchsia: { r: 255, g: 0, b: 255, a: 255 },
    };

    return presetColors[name] ?? { ...Colors.black };
  }

  /**
   * Resolves a system color name to RGBA.
   */
  resolveSystemColor(name: string): Rgba {
    const systemColors: Record<string, Rgba> = {
      windowText: { r: 0, g: 0, b: 0, a: 255 },
      window: { r: 255, g: 255, b: 255, a: 255 },
      highlightText: { r: 255, g: 255, b: 255, a: 255 },
      highlight: { r: 0, g: 120, b: 215, a: 255 },
      grayText: { r: 128, g: 128, b: 128, a: 255 },
      btnFace: { r: 240, g: 240, b: 240, a: 255 },
      btnText: { r: 0, g: 0, b: 0, a: 255 },
      captionText: { r: 0, g: 0, b: 0, a: 255 },
      menuText: { r: 0, g: 0, b: 0, a: 255 },
      scrollBar: { r: 200, g: 200, b: 200, a: 255 },
    };

    return systemColors[name] ?? { ...Colors.black };
  }

  /**
   * Converts RGBA to CSS color string.
   */
  rgbaToCss(color: Rgba): string {
    if (color.a === 255) {
      return `rgb(${color.r}, ${color.g}, ${color.b})`;
    }
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${(color.a / 255).toFixed(3)})`;
  }

  /**
   * Converts RGBA to hex string.
   */
  rgbaToHex(color: Rgba, includeAlpha: boolean = false): string {
    const r = color.r.toString(16).padStart(2, '0');
    const g = color.g.toString(16).padStart(2, '0');
    const b = color.b.toString(16).padStart(2, '0');

    if (includeAlpha) {
      const a = color.a.toString(16).padStart(2, '0');
      return `#${r}${g}${b}${a}`;
    }

    return `#${r}${g}${b}`;
  }

  /**
   * Calculates relative luminance for contrast calculations.
   */
  calculateLuminance(color: Rgba): number {
    const r = color.r / 255;
    const g = color.g / 255;
    const b = color.b / 255;

    const rs = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    const gs = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    const bs = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  /**
   * Determines if a color is dark (for contrast purposes).
   */
  isDarkColor(color: Rgba): boolean {
    return this.calculateLuminance(color) < 0.5;
  }
}
