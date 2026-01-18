import type {
  ResolvedTheme,
  ResolvedColorScheme,
  ResolvedFontScheme,
  Rgba,
} from '../types/index.js';
import { DEFAULT_THEME, DEFAULT_OFFICE_COLORS, DEFAULT_FONT_SCHEME } from '../types/index.js';
import type { PptxParser, PptxXmlNode, ThemeData } from '../core/PptxParser.js';
import { getXmlAttr, getXmlChild, getXmlChildren } from '../core/PptxParser.js';
import { ColorResolver } from './ColorResolver.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Resolves theme colors, fonts, and effects from PPTX theme data.
 */
export class ThemeResolver {
  private readonly logger: ILogger;
  private colorResolver: ColorResolver;

  constructor(logger?: ILogger) {
    this.logger = logger ?? createLogger('warn', 'ThemeResolver');
    this.colorResolver = new ColorResolver();
  }

  /**
   * Resolves the complete theme from PPTX parser.
   */
  async resolveTheme(parser: PptxParser): Promise<ResolvedTheme> {
    try {
      const themeData = await parser.getTheme();
      return this.parseTheme(themeData);
    } catch (error) {
      this.logger.warn('Failed to load theme, using default', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { ...DEFAULT_THEME };
    }
  }

  /**
   * Parses theme data into resolved theme.
   */
  parseTheme(themeData: ThemeData): ResolvedTheme {
    const themeElements = getXmlChild(themeData.content, 'a:themeElements');

    if (!themeElements) {
      this.logger.debug('No theme elements found, using default theme');
      return { ...DEFAULT_THEME };
    }

    const colorScheme = this.resolveColorScheme(getXmlChild(themeElements, 'a:clrScheme'));
    const fontScheme = this.resolveFontScheme(getXmlChild(themeElements, 'a:fontScheme'));
    const backgroundFillStyles = this.resolveBackgroundFillStyles(
      getXmlChild(themeElements, 'a:fmtScheme'),
      colorScheme
    );

    // Update the color resolver with the new color scheme
    this.colorResolver = new ColorResolver(colorScheme);

    return {
      colors: colorScheme,
      fonts: fontScheme,
      backgroundFillStyles,
    };
  }

  /**
   * Resolves the color scheme from theme XML.
   */
  private resolveColorScheme(clrScheme: PptxXmlNode | undefined): ResolvedColorScheme {
    if (!clrScheme) {
      this.logger.debug('No color scheme found, using default');
      return { ...DEFAULT_OFFICE_COLORS };
    }

    return {
      dark1: this.extractThemeColor(getXmlChild(clrScheme, 'a:dk1')) ?? DEFAULT_OFFICE_COLORS.dark1,
      light1: this.extractThemeColor(getXmlChild(clrScheme, 'a:lt1')) ?? DEFAULT_OFFICE_COLORS.light1,
      dark2: this.extractThemeColor(getXmlChild(clrScheme, 'a:dk2')) ?? DEFAULT_OFFICE_COLORS.dark2,
      light2: this.extractThemeColor(getXmlChild(clrScheme, 'a:lt2')) ?? DEFAULT_OFFICE_COLORS.light2,
      accent1: this.extractThemeColor(getXmlChild(clrScheme, 'a:accent1')) ?? DEFAULT_OFFICE_COLORS.accent1,
      accent2: this.extractThemeColor(getXmlChild(clrScheme, 'a:accent2')) ?? DEFAULT_OFFICE_COLORS.accent2,
      accent3: this.extractThemeColor(getXmlChild(clrScheme, 'a:accent3')) ?? DEFAULT_OFFICE_COLORS.accent3,
      accent4: this.extractThemeColor(getXmlChild(clrScheme, 'a:accent4')) ?? DEFAULT_OFFICE_COLORS.accent4,
      accent5: this.extractThemeColor(getXmlChild(clrScheme, 'a:accent5')) ?? DEFAULT_OFFICE_COLORS.accent5,
      accent6: this.extractThemeColor(getXmlChild(clrScheme, 'a:accent6')) ?? DEFAULT_OFFICE_COLORS.accent6,
      hyperlink: this.extractThemeColor(getXmlChild(clrScheme, 'a:hlink')) ?? DEFAULT_OFFICE_COLORS.hyperlink,
      followedHyperlink: this.extractThemeColor(getXmlChild(clrScheme, 'a:folHlink')) ?? DEFAULT_OFFICE_COLORS.followedHyperlink,
    };
  }

  /**
   * Extracts a color from a theme color element.
   */
  private extractThemeColor(node: PptxXmlNode | undefined): Rgba | undefined {
    if (!node) return undefined;

    // Check for sRGB color (most common)
    const srgbClr = getXmlChild(node, 'a:srgbClr');
    if (srgbClr) {
      const val = getXmlAttr(srgbClr, 'val');
      if (val) {
        return this.colorResolver.parseHexColor(val);
      }
    }

    // Check for system color
    const sysClr = getXmlChild(node, 'a:sysClr');
    if (sysClr) {
      const lastClr = getXmlAttr(sysClr, 'lastClr');
      if (lastClr) {
        return this.colorResolver.parseHexColor(lastClr);
      }
      const val = getXmlAttr(sysClr, 'val');
      if (val) {
        return this.colorResolver.resolveSystemColor(val);
      }
    }

    return undefined;
  }

  /**
   * Resolves the font scheme from theme XML.
   */
  private resolveFontScheme(fontScheme: PptxXmlNode | undefined): ResolvedFontScheme {
    if (!fontScheme) {
      this.logger.debug('No font scheme found, using default');
      return { ...DEFAULT_FONT_SCHEME };
    }

    const majorFont = getXmlChild(fontScheme, 'a:majorFont');
    const minorFont = getXmlChild(fontScheme, 'a:minorFont');

    return {
      majorFont: this.extractFontFamily(majorFont, 'latin') ?? DEFAULT_FONT_SCHEME.majorFont,
      minorFont: this.extractFontFamily(minorFont, 'latin') ?? DEFAULT_FONT_SCHEME.minorFont,
      majorFontEastAsian: this.extractFontFamily(majorFont, 'ea'),
      minorFontEastAsian: this.extractFontFamily(minorFont, 'ea'),
      majorFontComplexScript: this.extractFontFamily(majorFont, 'cs'),
      minorFontComplexScript: this.extractFontFamily(minorFont, 'cs'),
    };
  }

  /**
   * Extracts a font family from a font element.
   */
  private extractFontFamily(
    fontNode: PptxXmlNode | undefined,
    type: 'latin' | 'ea' | 'cs'
  ): string | undefined {
    if (!fontNode) return undefined;

    const elementName = type === 'latin' ? 'a:latin' : type === 'ea' ? 'a:ea' : 'a:cs';
    const fontElement = getXmlChild(fontNode, elementName);

    if (fontElement) {
      return getXmlAttr(fontElement, 'typeface');
    }

    return undefined;
  }

  /**
   * Resolves background fill styles from the format scheme.
   */
  private resolveBackgroundFillStyles(
    fmtScheme: PptxXmlNode | undefined,
    colorScheme: ResolvedColorScheme
  ): Rgba[] | undefined {
    if (!fmtScheme) return undefined;

    const bgFillStyleLst = getXmlChild(fmtScheme, 'a:bgFillStyleLst');
    if (!bgFillStyleLst) return undefined;

    const styles: Rgba[] = [];

    // Create a color resolver with the current color scheme for fill resolution
    const resolver = new ColorResolver(colorScheme);

    // Look for solid fills
    const solidFills = getXmlChildren(bgFillStyleLst, 'a:solidFill');
    for (const fill of solidFills) {
      const color = resolver.resolveColorElement(fill);
      if (color) {
        styles.push(color);
      }
    }

    // Look for gradient fills (use first stop color as representative)
    const gradFills = getXmlChildren(bgFillStyleLst, 'a:gradFill');
    for (const fill of gradFills) {
      const gsLst = getXmlChild(fill, 'a:gsLst');
      if (gsLst) {
        const stops = getXmlChildren(gsLst, 'a:gs');
        if (stops.length > 0 && stops[0]) {
          const color = resolver.resolveColorElement(stops[0]);
          if (color) {
            styles.push(color);
          }
        }
      }
    }

    this.logger.debug('Extracted background fill styles', { count: styles.length });

    return styles.length > 0 ? styles : undefined;
  }

  /**
   * Gets the color resolver for this theme.
   */
  getColorResolver(): ColorResolver {
    return this.colorResolver;
  }

  /**
   * Creates a color resolver with the given color scheme.
   */
  createColorResolver(colorScheme: ResolvedColorScheme): ColorResolver {
    return new ColorResolver(colorScheme);
  }
}
