/**
 * Parses text body (txBody) elements from shape XML.
 * Extracts paragraphs, runs, and their properties for rendering.
 */

import type {
  TextBody,
  TextBodyProperties,
  Paragraph,
  ParagraphProperties,
  TextRun,
  TextRunProperties,
  BulletConfig,
  TextAlignment,
  VerticalAlignment,
} from '../types/elements.js';
import type { Rgba } from '../types/geometry.js';
import type { ResolvedTheme, ColorTransform } from '../types/theme.js';
import type { PptxXmlNode } from '../core/PptxParser.js';
import { getXmlChild, getXmlChildren, getXmlAttr } from '../core/PptxParser.js';
import { ColorResolver } from '../theme/ColorResolver.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Configuration for TextParser.
 */
export interface TextParserConfig {
  /** Resolved theme for color resolution */
  theme: ResolvedTheme;
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Parses text body elements from slide XML.
 */
export class TextParser {
  private readonly logger: ILogger;
  private readonly colorResolver: ColorResolver;

  constructor(config: TextParserConfig) {
    this.logger = config.logger ?? createLogger('warn', 'TextParser');
    this.colorResolver = new ColorResolver(config.theme.colors);
  }

  /**
   * Parses a text body (txBody) element.
   *
   * @param txBody Text body XML node
   * @returns Parsed TextBody or undefined if invalid
   */
  parseTextBody(txBody: PptxXmlNode | undefined): TextBody | undefined {
    if (!txBody) return undefined;

    // Parse body properties
    const bodyPr = getXmlChild(txBody, 'a:bodyPr');
    const bodyProperties = this.parseBodyProperties(bodyPr);

    // Parse list style (for default paragraph/run properties)
    const lstStyle = getXmlChild(txBody, 'a:lstStyle');

    // Parse paragraphs
    const pNodes = getXmlChildren(txBody, 'a:p');
    const paragraphs: Paragraph[] = [];

    for (const pNode of pNodes) {
      const paragraph = this.parseParagraph(pNode, lstStyle);
      paragraphs.push(paragraph);
    }

    // Return undefined if no paragraphs with content
    if (paragraphs.length === 0) {
      return undefined;
    }

    this.logger.debug('Parsed text body', {
      paragraphCount: paragraphs.length,
    });

    return {
      bodyProperties,
      paragraphs,
    };
  }

  /**
   * Parses body properties (a:bodyPr).
   */
  private parseBodyProperties(bodyPr: PptxXmlNode | undefined): TextBodyProperties {
    if (!bodyPr) {
      return {};
    }

    // Parse anchor (vertical alignment)
    const anchorAttr = getXmlAttr(bodyPr, 'anchor');
    let anchor: VerticalAlignment | undefined;
    if (anchorAttr === 't') anchor = 'top';
    else if (anchorAttr === 'ctr') anchor = 'middle';
    else if (anchorAttr === 'b') anchor = 'bottom';

    // Parse anchor center (horizontal centering)
    const anchorCtr = getXmlAttr(bodyPr, 'anchorCtr') === '1';

    // Parse wrap
    const wrapAttr = getXmlAttr(bodyPr, 'wrap');
    const wrap = wrapAttr !== 'none';

    // Parse insets
    const leftInset = this.parseIntAttr(bodyPr, 'lIns');
    const rightInset = this.parseIntAttr(bodyPr, 'rIns');
    const topInset = this.parseIntAttr(bodyPr, 'tIns');
    const bottomInset = this.parseIntAttr(bodyPr, 'bIns');

    // Parse rotation
    const rotAttr = getXmlAttr(bodyPr, 'rot');
    const rotation = rotAttr ? parseInt(rotAttr, 10) / 60000 : undefined;

    // Parse auto-fit
    const noAutofit = getXmlChild(bodyPr, 'a:noAutofit');
    const normAutofit = getXmlChild(bodyPr, 'a:normAutofit');
    const spAutofit = getXmlChild(bodyPr, 'a:spAutoFit');

    let autoFit: 'none' | 'normal' | 'shape' | undefined;
    if (noAutofit) autoFit = 'none';
    else if (normAutofit) autoFit = 'normal';
    else if (spAutofit) autoFit = 'shape';

    return {
      anchor,
      anchorCenter: anchorCtr || undefined,
      wrap,
      leftInset,
      rightInset,
      topInset,
      bottomInset,
      rotation,
      autoFit,
    };
  }

  /**
   * Parses a paragraph (a:p) element.
   */
  private parseParagraph(pNode: PptxXmlNode, lstStyle?: PptxXmlNode): Paragraph {
    // Parse paragraph properties
    const pPr = getXmlChild(pNode, 'a:pPr');
    const properties = this.parseParagraphProperties(pPr, lstStyle);

    // Parse text runs
    const runs: TextRun[] = [];

    // Parse regular runs (a:r)
    const rNodes = getXmlChildren(pNode, 'a:r');
    for (const rNode of rNodes) {
      const run = this.parseTextRun(rNode, properties.defaultRunProperties);
      if (run) {
        runs.push(run);
      }
    }

    // Parse field codes (a:fld) - treat as regular text
    const fldNodes = getXmlChildren(pNode, 'a:fld');
    for (const fldNode of fldNodes) {
      const run = this.parseTextField(fldNode, properties.defaultRunProperties);
      if (run) {
        runs.push(run);
      }
    }

    // Parse line breaks (a:br) - add newline
    const brNodes = getXmlChildren(pNode, 'a:br');
    for (const _brNode of brNodes) {
      runs.push({ text: '\n' });
    }

    // Parse end paragraph run properties
    const endParaRPr = getXmlChild(pNode, 'a:endParaRPr');
    const endParaRunProperties = endParaRPr
      ? this.parseRunProperties(endParaRPr)
      : undefined;

    return {
      properties,
      runs,
      endParaRunProperties,
    };
  }

  /**
   * Parses paragraph properties (a:pPr).
   */
  private parseParagraphProperties(
    pPr: PptxXmlNode | undefined,
    lstStyle?: PptxXmlNode
  ): ParagraphProperties {
    // Parse alignment
    const algn = pPr ? getXmlAttr(pPr, 'algn') : undefined;
    let alignment: TextAlignment | undefined;
    if (algn === 'l') alignment = 'left';
    else if (algn === 'ctr') alignment = 'center';
    else if (algn === 'r') alignment = 'right';
    else if (algn === 'just') alignment = 'justify';
    else if (algn === 'dist') alignment = 'distributed';

    // Parse level
    const lvlAttr = pPr ? getXmlAttr(pPr, 'lvl') : undefined;
    const level = lvlAttr ? parseInt(lvlAttr, 10) : 0;

    // Parse indentation
    const indent = pPr ? this.parseIntAttr(pPr, 'indent') : undefined;
    const marginLeft = pPr ? this.parseIntAttr(pPr, 'marL') : undefined;
    const marginRight = pPr ? this.parseIntAttr(pPr, 'marR') : undefined;

    // Parse spacing
    const spcBef = pPr ? getXmlChild(pPr, 'a:spcBef') : undefined;
    const spcAft = pPr ? getXmlChild(pPr, 'a:spcAft') : undefined;
    const lnSpc = pPr ? getXmlChild(pPr, 'a:lnSpc') : undefined;

    const spaceBefore = this.parseSpacing(spcBef);
    const spaceAfter = this.parseSpacing(spcAft);
    const lineSpacing = this.parseLineSpacing(lnSpc);

    // Parse bullet
    const bullet = pPr ? this.parseBullet(pPr) : undefined;

    // Get default run properties from lstStyle for the paragraph level
    let lstStyleDefRPr: TextRunProperties | undefined;
    if (lstStyle) {
      // lstStyle contains lvl1pPr, lvl2pPr, etc.
      const levelKey = `a:lvl${(level ?? 0) + 1}pPr`;
      const levelPr = getXmlChild(lstStyle, levelKey);
      if (levelPr) {
        const defRPr = getXmlChild(levelPr, 'a:defRPr');
        if (defRPr) {
          lstStyleDefRPr = this.parseRunProperties(defRPr);
        }
      }
    }

    // Parse default run properties from paragraph's pPr
    const defRPr = pPr ? getXmlChild(pPr, 'a:defRPr') : undefined;
    const pPrDefRPr = defRPr ? this.parseRunProperties(defRPr) : undefined;

    // Merge: pPr defRPr overrides lstStyle defRPr (property by property)
    const defaultRunProperties = this.mergeRunProperties(pPrDefRPr, lstStyleDefRPr);

    return {
      alignment,
      level: level ?? 0,
      indent,
      marginLeft,
      marginRight,
      spaceBefore,
      spaceAfter,
      lineSpacing,
      bullet,
      defaultRunProperties,
    };
  }

  /**
   * Parses bullet properties from paragraph properties.
   */
  private parseBullet(pPr: PptxXmlNode): BulletConfig | undefined {
    // Check for no bullet
    if (getXmlChild(pPr, 'a:buNone')) {
      return { type: 'none' };
    }

    // Check for auto-numbered bullet
    const buAutoNum = getXmlChild(pPr, 'a:buAutoNum');
    if (buAutoNum) {
      const typeAttr = getXmlAttr(buAutoNum, 'type') ?? 'arabicPeriod';
      const startAtAttr = getXmlAttr(buAutoNum, 'startAt');

      return {
        type: 'auto',
        autoNumType: typeAttr,
        ...(startAtAttr !== undefined && { startAt: parseInt(startAtAttr, 10) }),
      };
    }

    // Check for character bullet
    const buChar = getXmlChild(pPr, 'a:buChar');
    if (buChar) {
      const char = getXmlAttr(buChar, 'char') ?? '\u2022';

      // Parse bullet color
      const buClr = getXmlChild(pPr, 'a:buClr');
      const color = buClr ? this.colorResolver.resolveColorElement(buClr) : undefined;

      // Parse bullet size
      const buSzPct = getXmlChild(pPr, 'a:buSzPct');
      const sizePercent = buSzPct
        ? parseInt(getXmlAttr(buSzPct, 'val') ?? '100000', 10) / 1000
        : undefined;

      // Parse bullet font
      const buFont = getXmlChild(pPr, 'a:buFont');
      const font = buFont ? getXmlAttr(buFont, 'typeface') : undefined;

      return {
        type: 'char',
        char,
        color,
        sizePercent,
        font,
      };
    }

    // Check for picture bullet
    const buBlip = getXmlChild(pPr, 'a:buBlip');
    if (buBlip) {
      return {
        type: 'picture',
      };
    }

    return undefined;
  }

  /**
   * Parses a text run (a:r).
   */
  private parseTextRun(
    rNode: PptxXmlNode,
    defaultProps?: TextRunProperties
  ): TextRun | undefined {
    // Get text content
    const tNode = getXmlChild(rNode, 'a:t');
    if (!tNode) return undefined;

    const text = this.extractTextContent(tNode);

    // Parse run properties
    const rPr = getXmlChild(rNode, 'a:rPr');
    const runProps = rPr ? this.parseRunProperties(rPr) : undefined;

    // Merge run properties with defaults (run props override defaults)
    const properties = this.mergeRunProperties(runProps, defaultProps);

    return {
      text,
      properties,
    };
  }

  /**
   * Merges run properties, with primary overriding defaults.
   */
  private mergeRunProperties(
    primary?: TextRunProperties,
    defaults?: TextRunProperties
  ): TextRunProperties | undefined {
    if (!primary && !defaults) return undefined;
    if (!defaults) return primary;
    if (!primary) return defaults;

    // Merge with primary taking precedence
    return {
      bold: primary.bold ?? defaults.bold,
      italic: primary.italic ?? defaults.italic,
      underline: primary.underline ?? defaults.underline,
      strikethrough: primary.strikethrough ?? defaults.strikethrough,
      fontFamily: primary.fontFamily ?? defaults.fontFamily,
      fontSize: primary.fontSize ?? defaults.fontSize,
      color: primary.color ?? defaults.color,
      baseline: primary.baseline ?? defaults.baseline,
      spacing: primary.spacing ?? defaults.spacing,
    };
  }

  /**
   * Parses a text field (a:fld).
   */
  private parseTextField(
    fldNode: PptxXmlNode,
    defaultProps?: TextRunProperties
  ): TextRun | undefined {
    // Get text content (fallback display text)
    const tNode = getXmlChild(fldNode, 'a:t');
    const text = tNode ? this.extractTextContent(tNode) : '';

    // Parse run properties
    const rPr = getXmlChild(fldNode, 'a:rPr');
    const runProps = rPr ? this.parseRunProperties(rPr) : undefined;

    // Merge run properties with defaults
    const properties = this.mergeRunProperties(runProps, defaultProps);

    return {
      text,
      properties,
    };
  }

  /**
   * Parses run properties (a:rPr).
   */
  private parseRunProperties(rPr: PptxXmlNode): TextRunProperties {
    // Parse font size (sz attribute is in hundredths of a point)
    const szAttr = getXmlAttr(rPr, 'sz');
    const fontSize = szAttr ? parseInt(szAttr, 10) : undefined;

    // Parse bold
    const bAttr = getXmlAttr(rPr, 'b');
    const bold = bAttr === '1' || bAttr === 'true' ? true
      : bAttr === '0' || bAttr === 'false' ? false
        : undefined;

    // Parse italic
    const iAttr = getXmlAttr(rPr, 'i');
    const italic = iAttr === '1' || iAttr === 'true' ? true
      : iAttr === '0' || iAttr === 'false' ? false
        : undefined;

    // Parse underline
    const uAttr = getXmlAttr(rPr, 'u');
    const underline = uAttr !== undefined && uAttr !== 'none' ? true : undefined;

    // Parse strikethrough
    const strikeAttr = getXmlAttr(rPr, 'strike');
    const strikethrough = strikeAttr !== undefined && strikeAttr !== 'noStrike' ? true : undefined;

    // Parse baseline (for super/subscript)
    const baselineAttr = getXmlAttr(rPr, 'baseline');
    const baseline = baselineAttr ? parseInt(baselineAttr, 10) : undefined;

    // Parse character spacing
    const spcAttr = getXmlAttr(rPr, 'spc');
    const spacing = spcAttr ? parseInt(spcAttr, 10) : undefined;

    // Parse font family
    const latin = getXmlChild(rPr, 'a:latin');
    const ea = getXmlChild(rPr, 'a:ea');
    const cs = getXmlChild(rPr, 'a:cs');

    // Prefer Latin font, fall back to others
    const fontFamily = latin ? getXmlAttr(latin, 'typeface')
      : ea ? getXmlAttr(ea, 'typeface')
        : cs ? getXmlAttr(cs, 'typeface')
          : undefined;

    // Parse color
    const solidFill = getXmlChild(rPr, 'a:solidFill');
    const color = solidFill
      ? this.colorResolver.resolveColorElement(solidFill)
      : undefined;

    // Parse scheme color reference
    const schemeClr = solidFill ? getXmlChild(solidFill, 'a:schemeClr') : undefined;
    const schemeColor = schemeClr ? getXmlAttr(schemeClr, 'val') : undefined;

    if (schemeColor) {
      this.logger.debug('Parsed text color', { schemeColor, resolvedColor: color });
    }

    // Parse color transforms
    const colorTransforms = schemeClr
      ? this.colorResolver.extractTransforms(schemeClr)
      : undefined;

    return {
      fontSize,
      fontFamily,
      bold,
      italic,
      underline,
      strikethrough,
      color,
      schemeColor,
      colorTransforms: (colorTransforms && Object.keys(colorTransforms).length > 0)
        ? colorTransforms
        : undefined,
      baseline,
      spacing,
    };
  }

  /**
   * Parses spacing value (a:spcBef, a:spcAft).
   */
  private parseSpacing(spcNode: PptxXmlNode | undefined): number | undefined {
    if (!spcNode) return undefined;

    // Check for points
    const spcPts = getXmlChild(spcNode, 'a:spcPts');
    if (spcPts) {
      const val = getXmlAttr(spcPts, 'val');
      // Convert centipoints to EMU (1 point = 12700 EMU)
      return val ? parseInt(val, 10) * 127 : undefined;
    }

    // Check for percentage (of font size)
    const spcPct = getXmlChild(spcNode, 'a:spcPct');
    if (spcPct) {
      // Return as negative to indicate percentage mode
      const val = getXmlAttr(spcPct, 'val');
      return val ? -parseInt(val, 10) : undefined;
    }

    return undefined;
  }

  /**
   * Parses line spacing (a:lnSpc).
   */
  private parseLineSpacing(lnSpc: PptxXmlNode | undefined): number | undefined {
    if (!lnSpc) return undefined;

    // Check for percentage
    const spcPct = getXmlChild(lnSpc, 'a:spcPct');
    if (spcPct) {
      const val = getXmlAttr(spcPct, 'val');
      return val ? parseInt(val, 10) : undefined;
    }

    // Check for points (treat as fixed line height)
    const spcPts = getXmlChild(lnSpc, 'a:spcPts');
    if (spcPts) {
      const val = getXmlAttr(spcPts, 'val');
      // Return as negative to indicate fixed mode
      return val ? -parseInt(val, 10) : undefined;
    }

    return undefined;
  }

  /**
   * Extracts text content from a text node.
   */
  private extractTextContent(tNode: PptxXmlNode): string {
    if (typeof tNode === 'string') {
      return tNode;
    }

    // Check for #text property (common in parsed XML)
    const textContent = tNode['#text'];
    if (typeof textContent === 'string') {
      return textContent;
    }

    // Check for direct text
    if (typeof tNode === 'object') {
      const keys = Object.keys(tNode);
      for (const key of keys) {
        if (!key.startsWith('@_') && !key.startsWith('#')) {
          const value = tNode[key];
          if (typeof value === 'string') {
            return value;
          }
        }
      }
    }

    return '';
  }

  /**
   * Parses an integer attribute.
   */
  private parseIntAttr(node: PptxXmlNode, attr: string): number | undefined {
    const value = getXmlAttr(node, attr);
    return value !== undefined ? parseInt(value, 10) : undefined;
  }
}

/**
 * Creates a TextParser instance.
 */
export function createTextParser(theme: ResolvedTheme, logger?: ILogger): TextParser {
  return new TextParser({ theme, logger });
}
