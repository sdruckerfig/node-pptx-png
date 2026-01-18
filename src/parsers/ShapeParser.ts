/**
 * Parses shape elements (p:sp, p:cxnSp) from slide XML.
 * Extracts structured shape data for rendering.
 *
 * Note: Fill and stroke parsing is handled by FillRenderer and StrokeRenderer
 * respectively. This parser extracts raw XML nodes for those components.
 */

import type { ShapeTransform, Path, PathSegment, Point } from '../types/geometry.js';
import type {
  ShapeElement,
  TextBody,
  Paragraph,
  TextRun,
  PlaceholderReference,
  PlaceholderType,
} from '../types/elements.js';
import type { ResolvedTheme } from '../types/theme.js';
import type { PptxXmlNode } from '../core/PptxParser.js';
import { getXmlChild, getXmlAttr, getXmlChildren } from '../core/PptxParser.js';
import { ANGLE_UNIT_PER_DEGREE } from '../core/UnitConverter.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Configuration for ShapeParser.
 */
export interface ShapeParserConfig {
  /** Resolved theme for color resolution */
  theme: ResolvedTheme;
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Parses shape elements from slide XML.
 * Note: Fill and stroke are returned as raw XML nodes (spPrNode).
 * Use FillRenderer.parseFill() and StrokeRenderer.parseStroke() for actual parsing.
 */
export class ShapeParser {
  private readonly logger: ILogger;

  constructor(config: ShapeParserConfig) {
    this.logger = config.logger ?? createLogger('warn', 'ShapeParser');
  }

  /**
   * Parses a shape element (p:sp) from XML.
   * @param spNode Shape XML node
   * @returns Parsed ShapeElement or undefined if invalid
   */
  parseShape(spNode: PptxXmlNode): ShapeElement | undefined {
    // Parse non-visual properties
    const nvSpPr = getXmlChild(spNode, 'p:nvSpPr');
    if (!nvSpPr) {
      this.logger.debug('Shape missing nvSpPr');
      return undefined;
    }

    const cNvPr = getXmlChild(nvSpPr, 'p:cNvPr');
    const id = cNvPr ? getXmlAttr(cNvPr, 'id') ?? '0' : '0';
    const name = cNvPr ? getXmlAttr(cNvPr, 'name') : undefined;
    const hidden = cNvPr ? getXmlAttr(cNvPr, 'hidden') === '1' : false;

    // Parse placeholder reference
    const nvPr = getXmlChild(nvSpPr, 'p:nvPr');
    const placeholder = this.parsePlaceholder(nvPr);

    // Parse shape properties
    const spPr = getXmlChild(spNode, 'p:spPr');
    if (!spPr) {
      this.logger.debug('Shape missing spPr', { id });
      return undefined;
    }

    // Parse transform
    const transform = this.parseTransform(spPr);
    if (!transform) {
      this.logger.debug('Shape missing transform', { id });
      return undefined;
    }

    // Parse geometry
    const { presetGeometry, customGeometry } = this.parseGeometry(spPr);

    // Note: Fill and stroke parsing is delegated to FillRenderer and StrokeRenderer
    // The spPr node is available for external parsing if needed

    // Parse text body
    const txBody = getXmlChild(spNode, 'p:txBody');
    const textBody = txBody ? this.parseTextBody(txBody) : undefined;

    return {
      type: 'shape',
      id,
      name,
      transform,
      presetGeometry,
      customGeometry,
      textBody,
      hidden,
    };
  }

  /**
   * Parses a placeholder reference from non-visual properties.
   */
  private parsePlaceholder(nvPr: PptxXmlNode | undefined): PlaceholderReference | undefined {
    if (!nvPr) return undefined;

    const ph = getXmlChild(nvPr, 'p:ph');
    if (!ph) return undefined;

    const typeAttr = getXmlAttr(ph, 'type');
    const idxAttr = getXmlAttr(ph, 'idx');

    return {
      type: typeAttr as PlaceholderType | undefined,
      idx: idxAttr !== undefined ? parseInt(idxAttr, 10) : undefined,
    };
  }

  /**
   * Parses transform (xfrm) from shape properties.
   */
  private parseTransform(spPr: PptxXmlNode): ShapeTransform | undefined {
    const xfrm = getXmlChild(spPr, 'a:xfrm');
    if (!xfrm) return undefined;

    const off = getXmlChild(xfrm, 'a:off');
    const ext = getXmlChild(xfrm, 'a:ext');

    const offX = off ? parseInt(getXmlAttr(off, 'x') ?? '0', 10) : 0;
    const offY = off ? parseInt(getXmlAttr(off, 'y') ?? '0', 10) : 0;
    const extCx = ext ? parseInt(getXmlAttr(ext, 'cx') ?? '0', 10) : 0;
    const extCy = ext ? parseInt(getXmlAttr(ext, 'cy') ?? '0', 10) : 0;

    const rotAttr = getXmlAttr(xfrm, 'rot');
    const rotation = rotAttr ? parseInt(rotAttr, 10) / ANGLE_UNIT_PER_DEGREE : undefined;

    const flipH = getXmlAttr(xfrm, 'flipH') === '1';
    const flipV = getXmlAttr(xfrm, 'flipV') === '1';

    return {
      offX,
      offY,
      extCx,
      extCy,
      rotation,
      flipH,
      flipV,
    };
  }

  /**
   * Parses geometry from shape properties.
   */
  private parseGeometry(spPr: PptxXmlNode): {
    presetGeometry?: string;
    customGeometry?: Path[];
  } {
    // Check for preset geometry
    const prstGeom = getXmlChild(spPr, 'a:prstGeom');
    if (prstGeom) {
      const prst = getXmlAttr(prstGeom, 'prst') ?? 'rect';
      return { presetGeometry: prst };
    }

    // Check for custom geometry
    const custGeom = getXmlChild(spPr, 'a:custGeom');
    if (custGeom) {
      const customGeometry = this.parseCustomGeometry(custGeom);
      return { customGeometry };
    }

    return { presetGeometry: 'rect' };
  }

  /**
   * Parses custom geometry paths.
   */
  private parseCustomGeometry(custGeom: PptxXmlNode): Path[] {
    const paths: Path[] = [];

    const pathLst = getXmlChild(custGeom, 'a:pathLst');
    if (!pathLst) return paths;

    const pathNodes = getXmlChildren(pathLst, 'a:path');
    for (const pathNode of pathNodes) {
      const path = this.parsePath(pathNode);
      if (path) {
        paths.push(path);
      }
    }

    return paths;
  }

  /**
   * Parses a single custom path.
   *
   * LIMITATION: This parser iterates by segment type rather than document order.
   * Paths with interleaved segment types (e.g., moveTo, lineTo, moveTo, lineTo)
   * may not render correctly. Most PPTX custom geometries don't have interleaved
   * segments, so this works for the majority of cases.
   *
   * To properly fix this, the raw XML would need to be passed and parsed with
   * fast-xml-parser's preserveOrder: true option.
   */
  private parsePath(pathNode: PptxXmlNode): Path | undefined {
    const segments: PathSegment[] = [];

    // Process segments in a typical path order
    // Most paths follow: moveTo, then series of drawing commands, then close
    // This handles the majority of real-world cases correctly
    const segmentTypes = ['a:moveTo', 'a:lnTo', 'a:cubicBezTo', 'a:quadBezTo', 'a:arcTo', 'a:close'] as const;

    for (const segType of segmentTypes) {
      const nodes = getXmlChildren(pathNode, segType);
      for (const node of nodes) {
        const segment = this.parsePathSegment(segType, node);
        if (segment) {
          segments.push(segment);
        }
      }
    }

    if (segments.length === 0) return undefined;

    const fillAttr = getXmlAttr(pathNode, 'fill');
    const strokeAttr = getXmlAttr(pathNode, 'stroke');

    return {
      segments,
      fill: fillAttr !== 'none',
      stroke: strokeAttr !== 'false',
    };
  }

  /**
   * Parses a single path segment.
   */
  private parsePathSegment(type: string, node: PptxXmlNode): PathSegment | undefined {
    switch (type) {
      case 'a:moveTo': {
        const pt = getXmlChild(node, 'a:pt');
        if (!pt) return undefined;
        return {
          type: 'moveTo',
          points: [this.parsePoint(pt)],
        };
      }

      case 'a:lnTo': {
        const pt = getXmlChild(node, 'a:pt');
        if (!pt) return undefined;
        return {
          type: 'lineTo',
          points: [this.parsePoint(pt)],
        };
      }

      case 'a:cubicBezTo': {
        const pts = getXmlChildren(node, 'a:pt');
        if (pts.length < 3) return undefined;
        return {
          type: 'cubicBezierTo',
          points: pts.slice(0, 3).map((pt) => this.parsePoint(pt)),
        };
      }

      case 'a:quadBezTo': {
        const pts = getXmlChildren(node, 'a:pt');
        if (pts.length < 2) return undefined;
        return {
          type: 'quadBezierTo',
          points: pts.slice(0, 2).map((pt) => this.parsePoint(pt)),
        };
      }

      case 'a:arcTo': {
        const wR = getXmlAttr(node, 'wR');
        const hR = getXmlAttr(node, 'hR');
        const stAng = getXmlAttr(node, 'stAng');
        const swAng = getXmlAttr(node, 'swAng');

        // OpenXML uses startAngle/swingAngle format (legacy arc representation)
        return {
          type: 'arcTo',
          legacyArc: {
            rx: wR ? parseInt(wR, 10) : 0,
            ry: hR ? parseInt(hR, 10) : 0,
            startAngle: stAng ? parseInt(stAng, 10) / ANGLE_UNIT_PER_DEGREE : 0,
            swingAngle: swAng ? parseInt(swAng, 10) / ANGLE_UNIT_PER_DEGREE : 0,
          },
        };
      }

      case 'a:close':
        return { type: 'close' };

      default:
        return undefined;
    }
  }

  /**
   * Parses a point from XML.
   */
  private parsePoint(pt: PptxXmlNode): Point {
    return {
      x: parseInt(getXmlAttr(pt, 'x') ?? '0', 10),
      y: parseInt(getXmlAttr(pt, 'y') ?? '0', 10),
    };
  }

  // Note: Fill and stroke parsing methods have been removed from ShapeParser.
  // Use FillRenderer.parseFill() and StrokeRenderer.parseStroke() for fill/stroke parsing.
  // This eliminates code duplication between the parser and renderers.

  /**
   * Parses text body from shape.
   */
  private parseTextBody(txBody: PptxXmlNode): TextBody | undefined {
    const paragraphs: Paragraph[] = [];

    const pNodes = getXmlChildren(txBody, 'a:p');
    for (const pNode of pNodes) {
      const paragraph = this.parseParagraph(pNode);
      if (paragraph) {
        paragraphs.push(paragraph);
      }
    }

    if (paragraphs.length === 0) return undefined;

    return { paragraphs };
  }

  /**
   * Parses a paragraph.
   */
  private parseParagraph(pNode: PptxXmlNode): Paragraph {
    const runs: TextRun[] = [];

    // Parse text runs
    const rNodes = getXmlChildren(pNode, 'a:r');
    for (const rNode of rNodes) {
      const run = this.parseTextRun(rNode);
      if (run) {
        runs.push(run);
      }
    }

    return { runs };
  }

  /**
   * Parses a text run.
   */
  private parseTextRun(rNode: PptxXmlNode): TextRun | undefined {
    const tNode = getXmlChild(rNode, 'a:t');
    if (!tNode) return undefined;

    // Get text content
    const text = typeof tNode === 'string' ? tNode : (tNode['#text'] as string) ?? '';

    return { text };
  }
}

/**
 * Creates a ShapeParser instance.
 */
export function createShapeParser(theme: ResolvedTheme, logger?: ILogger): ShapeParser {
  return new ShapeParser({ theme, logger });
}
