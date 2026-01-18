import JSZip from 'jszip';
import { XMLParser, XMLBuilder, type X2jOptions } from 'fast-xml-parser';
import * as fs from 'fs/promises';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Represents an element in an ordered XML structure.
 * Used by the preserveOrder parser to maintain document order.
 */
export interface OrderedXmlElement {
  /** The tag name of the element */
  tagName: string;
  /** The element's attributes (prefixed with @_) */
  attributes: Record<string, string>;
  /** The element node itself */
  node: PptxXmlNode;
}

/**
 * Raw slide data extracted from PPTX.
 */
export interface SlideData {
  /** Slide index (0-based) */
  index: number;
  /** Slide XML content parsed as object */
  content: PptxXmlNode;
  /** Slide layout relationship ID */
  layoutRelId?: string;
  /** Path to the slide file within the PPTX */
  path: string;
}

/**
 * Raw slide layout data.
 */
export interface SlideLayoutData {
  /** Layout name */
  name?: string;
  /** Layout XML content */
  content: PptxXmlNode;
  /** Master relationship ID */
  masterRelId?: string;
  /** Path to the layout file */
  path: string;
}

/**
 * Raw slide master data.
 */
export interface SlideMasterData {
  /** Master name */
  name?: string;
  /** Master XML content */
  content: PptxXmlNode;
  /** Theme relationship ID */
  themeRelId?: string;
  /** Path to the master file */
  path: string;
}

/**
 * Theme data extracted from PPTX.
 */
export interface ThemeData {
  /** Theme XML content */
  content: PptxXmlNode;
  /** Path to the theme file */
  path: string;
}

/**
 * Presentation-level data.
 */
export interface PresentationData {
  /** Slide width in EMU */
  slideWidth: number;
  /** Slide height in EMU */
  slideHeight: number;
  /** Slide IDs in order */
  slideIds: string[];
  /** Number of slides */
  slideCount: number;
  /** Presentation XML content */
  content: PptxXmlNode;
}

/**
 * Relationship entry from .rels file.
 */
export interface Relationship {
  id: string;
  type: string;
  target: string;
}

/**
 * Generic XML node type from fast-xml-parser.
 */
export type PptxXmlNode = Record<string, unknown>;

/**
 * XML attribute prefix used by fast-xml-parser.
 */
const ATTR_PREFIX = '@_';

/**
 * Common namespace prefixes in PPTX XML.
 */
const NAMESPACES = {
  presentation: 'p:presentation',
  slide: 'p:sld',
  slideLayout: 'p:sldLayout',
  slideMaster: 'p:sldMaster',
  theme: 'a:theme',
  relationships: 'Relationships',
  relationship: 'Relationship',
};

/**
 * XML element names that should always be parsed as arrays.
 * These elements can appear multiple times in PPTX XML.
 */
const ARRAY_ELEMENTS = [
  'p:sp',
  'p:pic',
  'p:grpSp',
  'p:cxnSp',
  'p:graphicFrame',
  'a:p',
  'a:r',
  'a:gs',
  'p:sldId',
  'Relationship',
  'a:path',
  'a:moveTo',
  'a:lnTo',
  'a:cubicBezTo',
  'a:arcTo',
  'a:close',
] as const;

/**
 * Default XML parser options.
 */
const XML_PARSER_OPTIONS: Partial<X2jOptions> = {
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  removeNSPrefix: false,
  parseAttributeValue: false,
  trimValues: true,
  parseTagValue: false,
  isArray: (name: string): boolean => {
    return ARRAY_ELEMENTS.some((el) => name.endsWith(el) || name === el);
  },
};

/**
 * XML parser options with preserveOrder enabled.
 * This returns elements in document order as an array structure.
 * Format: [{ tagName: [...children], ':@': { attrs } }, ...]
 */
const ORDERED_XML_PARSER_OPTIONS: Partial<X2jOptions> = {
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  removeNSPrefix: false,
  parseAttributeValue: false,
  trimValues: true,
  parseTagValue: false,
  preserveOrder: true,
};

/**
 * Parser for PPTX files.
 * Handles ZIP extraction and XML parsing.
 *
 * **Caching Behavior:**
 * This parser maintains internal caches for parsed XML content and relationships
 * to avoid redundant parsing of the same files within a PPTX. The caches are:
 * - `xmlCache`: Caches parsed XML nodes by file path
 * - `relationshipCache`: Caches parsed relationship arrays by .rels file path
 *
 * **Important:** Caches are cleared when:
 * - A new PPTX file is opened via `open()`
 * - The parser is explicitly closed via `close()`
 *
 * **Lifecycle:** This class is designed to be short-lived, typically used for
 * a single rendering operation. Create a new instance for each PPTX file you
 * process, and call `close()` when done to release resources and clear caches.
 *
 * @example
 * ```typescript
 * const parser = new PptxParser();
 * try {
 *   await parser.open(pptxBuffer);
 *   const presentation = await parser.getPresentation();
 *   // ... process slides
 * } finally {
 *   parser.close(); // Always close to clear caches
 * }
 * ```
 */
export class PptxParser {
  private zip: JSZip | null = null;
  private readonly logger: ILogger;
  private readonly xmlParser: XMLParser;
  private readonly orderedXmlParser: XMLParser;
  /** Cache for parsed relationship arrays, keyed by .rels file path. */
  private relationshipCache: Map<string, Relationship[]> = new Map();
  /** Cache for parsed XML content, keyed by file path within the PPTX. */
  private xmlCache: Map<string, PptxXmlNode> = new Map();
  /** Cache for raw XML strings, keyed by file path within the PPTX. */
  private rawXmlCache: Map<string, string> = new Map();
  /** Path to the main presentation XML file, discovered from _rels/.rels */
  private presentationPath: string | null = null;

  constructor(logger?: ILogger) {
    this.logger = logger ?? createLogger('warn', 'PptxParser');
    this.xmlParser = new XMLParser(XML_PARSER_OPTIONS);
    this.orderedXmlParser = new XMLParser(ORDERED_XML_PARSER_OPTIONS);
  }

  /**
   * Opens a PPTX file from a file path or Buffer.
   */
  async open(input: Buffer | string): Promise<void> {
    let data: Buffer;

    if (typeof input === 'string') {
      this.logger.debug('Opening PPTX from file path', { path: input });
      data = await fs.readFile(input);
    } else {
      this.logger.debug('Opening PPTX from buffer', { size: input.length });
      data = input;
    }

    try {
      this.zip = await JSZip.loadAsync(data);
      this.relationshipCache.clear();
      this.xmlCache.clear();
      this.rawXmlCache.clear();
      this.presentationPath = null;
      this.logger.info('PPTX opened successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to open PPTX', { error: message });
      throw new Error(`Failed to open PPTX file: ${message}`);
    }
  }

  /**
   * Ensures the parser has an open PPTX file.
   */
  private ensureOpen(): JSZip {
    if (!this.zip) {
      throw new Error('No PPTX file is open. Call open() first.');
    }
    return this.zip;
  }

  /**
   * Reads and parses an XML file from the PPTX.
   */
  private async readXml(path: string): Promise<PptxXmlNode> {
    // Check cache first
    const cached = this.xmlCache.get(path);
    if (cached) {
      return cached;
    }

    const zip = this.ensureOpen();
    const file = zip.file(path);

    if (!file) {
      throw new Error(`File not found in PPTX: ${path}`);
    }

    const content = await file.async('string');

    // Cache the raw XML for potential ordered parsing later
    this.rawXmlCache.set(path, content);

    const parsed = this.xmlParser.parse(content) as PptxXmlNode;

    // Cache the parsed result
    this.xmlCache.set(path, parsed);

    return parsed;
  }

  /**
   * Gets the raw XML content for a file path.
   * Returns undefined if the file hasn't been read yet.
   */
  getRawXml(path: string): string | undefined {
    return this.rawXmlCache.get(path);
  }

  /**
   * Reads and parses an XML file with preserved element order.
   * This is used for z-order sensitive operations.
   */
  async readXmlOrdered(path: string): Promise<OrderedXmlOutput> {
    // Check raw cache first
    let content = this.rawXmlCache.get(path);

    if (!content) {
      const zip = this.ensureOpen();
      const file = zip.file(path);

      if (!file) {
        throw new Error(`File not found in PPTX: ${path}`);
      }

      content = await file.async('string');
      this.rawXmlCache.set(path, content);
    }

    return this.orderedXmlParser.parse(content) as OrderedXmlOutput;
  }

  /**
   * Reads a binary file from the PPTX.
   */
  async readBinary(path: string): Promise<Buffer> {
    const zip = this.ensureOpen();
    const file = zip.file(path);

    if (!file) {
      throw new Error(`File not found in PPTX: ${path}`);
    }

    const data = await file.async('nodebuffer');
    return data;
  }

  /**
   * Checks if a file exists in the PPTX.
   */
  fileExists(path: string): boolean {
    const zip = this.ensureOpen();
    return zip.file(path) !== null;
  }

  /**
   * Lists all files in the PPTX.
   */
  listFiles(): string[] {
    const zip = this.ensureOpen();
    const files: string[] = [];
    zip.forEach((relativePath) => {
      files.push(relativePath);
    });
    return files;
  }

  /**
   * Parses relationships from a .rels file.
   */
  async getRelationships(relPath: string): Promise<Relationship[]> {
    // Check cache
    const cached = this.relationshipCache.get(relPath);
    if (cached) {
      return cached;
    }

    if (!this.fileExists(relPath)) {
      this.logger.debug('Relationships file not found', { path: relPath });
      return [];
    }

    const xml = await this.readXml(relPath);
    const relationships: Relationship[] = [];

    const rels = xml[NAMESPACES.relationships] as PptxXmlNode | undefined;
    if (!rels) {
      return [];
    }

    const relElements = rels[NAMESPACES.relationship];
    if (!relElements) {
      return [];
    }

    const relArray = Array.isArray(relElements) ? relElements : [relElements];

    for (const rel of relArray) {
      const relNode = rel as PptxXmlNode;
      relationships.push({
        id: String(relNode[`${ATTR_PREFIX}Id`] ?? ''),
        type: String(relNode[`${ATTR_PREFIX}Type`] ?? ''),
        target: String(relNode[`${ATTR_PREFIX}Target`] ?? ''),
      });
    }

    // Cache the result
    this.relationshipCache.set(relPath, relationships);

    return relationships;
  }

  /**
   * Gets the relationship target for a given ID.
   */
  async getRelationshipTarget(relPath: string, relId: string): Promise<string | undefined> {
    const rels = await this.getRelationships(relPath);
    const rel = rels.find((r) => r.id === relId);
    return rel?.target;
  }

  /**
   * Resolves a relative path to an absolute path within the PPTX.
   */
  resolvePath(basePath: string, relativePath: string): string {
    if (relativePath.startsWith('/')) {
      return relativePath.slice(1);
    }

    const baseDir = basePath.substring(0, basePath.lastIndexOf('/') + 1);
    let resolved = baseDir + relativePath;

    // Handle ../ path segments
    while (resolved.includes('../')) {
      resolved = resolved.replace(/[^/]+\/\.\.\//g, '');
    }

    // Remove leading slashes
    resolved = resolved.replace(/^\/+/, '');

    return resolved;
  }

  /**
   * Finds the path to the main presentation XML file by reading _rels/.rels.
   * This handles non-standard PPTX files where the presentation is not at ppt/presentation.xml.
   */
  async findPresentationPath(): Promise<string> {
    // Return cached path if already discovered
    if (this.presentationPath) {
      return this.presentationPath;
    }

    const relsPath = '_rels/.rels';
    if (!this.fileExists(relsPath)) {
      this.logger.warn('Root .rels file not found, using default presentation path');
      this.presentationPath = 'ppt/presentation.xml';
      return this.presentationPath;
    }

    const relsContent = await this.readXml(relsPath);
    const relationships = getXmlChildren(relsContent, NAMESPACES.relationships);

    // If Relationships is the root, get its children
    let relElements: PptxXmlNode[] = [];
    if (relationships.length > 0) {
      relElements = getXmlChildren(relationships[0], NAMESPACES.relationship);
    } else {
      // Try direct access if Relationships is the wrapper
      const rels = relsContent[NAMESPACES.relationships] as PptxXmlNode | undefined;
      if (rels) {
        const children = rels[NAMESPACES.relationship];
        relElements = children ? (Array.isArray(children) ? children as PptxXmlNode[] : [children as PptxXmlNode]) : [];
      }
    }

    for (const rel of relElements) {
      const type = getXmlAttr(rel, 'Type') ?? '';
      // Look for the main officeDocument relationship (ends with /officeDocument)
      // This avoids matching extended-properties or other relationships that contain 'officeDocument' in the URL
      if (type.endsWith('/officeDocument')) {
        let target = getXmlAttr(rel, 'Target');
        if (target) {
          // Remove leading slash if present (some PPTX files use /ppt/presentation.xml)
          if (target.startsWith('/')) {
            target = target.substring(1);
          }
          this.presentationPath = target;
          this.logger.info('Found presentation path from .rels', { path: this.presentationPath });
          return this.presentationPath;
        }
      }
    }

    // Fallback to default path
    this.logger.warn('No officeDocument relationship found, using default presentation path');
    this.presentationPath = 'ppt/presentation.xml';
    return this.presentationPath;
  }

  /**
   * Gets the relationships file path for the presentation.
   */
  private getPresentationRelsPath(presPath: string): string {
    // Convert ppt/presentation.xml to ppt/_rels/presentation.xml.rels
    const lastSlash = presPath.lastIndexOf('/');
    if (lastSlash === -1) {
      return `_rels/${presPath}.rels`;
    }
    const dir = presPath.substring(0, lastSlash);
    const filename = presPath.substring(lastSlash + 1);
    return `${dir}/_rels/${filename}.rels`;
  }

  /**
   * Gets presentation data.
   */
  async getPresentation(): Promise<PresentationData> {
    const presentationPath = await this.findPresentationPath();
    const xml = await this.readXml(presentationPath);

    const presentation = xml[NAMESPACES.presentation] as PptxXmlNode | undefined;
    if (!presentation) {
      throw new Error('Invalid PPTX: missing presentation element');
    }

    // Get slide size
    const sldSz = presentation['p:sldSz'] as PptxXmlNode | undefined;
    const slideWidth = sldSz
      ? parseInt(String(sldSz[`${ATTR_PREFIX}cx`] ?? '9144000'), 10)
      : 9144000;
    const slideHeight = sldSz
      ? parseInt(String(sldSz[`${ATTR_PREFIX}cy`] ?? '6858000'), 10)
      : 6858000;

    // Get slide IDs
    const sldIdLst = presentation['p:sldIdLst'] as PptxXmlNode | undefined;
    const slideIds: string[] = [];

    if (sldIdLst) {
      const sldIdElements = sldIdLst['p:sldId'];
      if (sldIdElements) {
        const sldIdArray = Array.isArray(sldIdElements) ? sldIdElements : [sldIdElements];
        for (const sldId of sldIdArray) {
          const idNode = sldId as PptxXmlNode;
          const rId = idNode[`${ATTR_PREFIX}r:id`];
          if (rId) {
            slideIds.push(String(rId));
          }
        }
      }
    }

    this.logger.info('Presentation data loaded', {
      slideWidth,
      slideHeight,
      slideCount: slideIds.length,
    });

    return {
      slideWidth,
      slideHeight,
      slideIds,
      slideCount: slideIds.length,
      content: presentation,
    };
  }

  /**
   * Gets the number of slides in the presentation.
   */
  async getSlideCount(): Promise<number> {
    const presentation = await this.getPresentation();
    return presentation.slideCount;
  }

  /**
   * Gets slide data by index (0-based).
   */
  async getSlide(index: number): Promise<SlideData> {
    const presentation = await this.getPresentation();
    const presentationPath = await this.findPresentationPath();

    if (index < 0 || index >= presentation.slideCount) {
      throw new Error(`Slide index ${index} out of range (0-${presentation.slideCount - 1})`);
    }

    const slideRelId = presentation.slideIds[index];
    if (!slideRelId) {
      throw new Error(`No relationship ID found for slide ${index}`);
    }

    // Get the slide path from relationships using the dynamic presentation path
    const presRelsPath = this.getPresentationRelsPath(presentationPath);
    const rels = await this.getRelationships(presRelsPath);
    const slideRel = rels.find((r) => r.id === slideRelId);

    if (!slideRel) {
      throw new Error(`Relationship not found for slide ${index}: ${slideRelId}`);
    }

    const slidePath = this.resolvePath(presentationPath, slideRel.target);
    const xml = await this.readXml(slidePath);

    const slide = xml[NAMESPACES.slide] as PptxXmlNode | undefined;
    if (!slide) {
      throw new Error(`Invalid slide XML: missing slide element in ${slidePath}`);
    }

    // Get layout relationship
    const slideRelsPath = slidePath.replace('slides/', 'slides/_rels/').replace('.xml', '.xml.rels');
    const slideRels = await this.getRelationships(slideRelsPath);
    const layoutRel = slideRels.find((r) =>
      r.type.includes('slideLayout')
    );

    this.logger.debug('Slide loaded', { index, path: slidePath });

    return {
      index,
      content: slide,
      layoutRelId: layoutRel?.id,
      path: slidePath,
    };
  }

  /**
   * Gets slide layout data.
   */
  async getSlideLayout(slidePath: string, layoutRelId: string): Promise<SlideLayoutData> {
    const slideRelsPath = slidePath.replace('slides/', 'slides/_rels/').replace('.xml', '.xml.rels');
    const target = await this.getRelationshipTarget(slideRelsPath, layoutRelId);

    if (!target) {
      throw new Error(`Layout relationship not found: ${layoutRelId}`);
    }

    const layoutPath = this.resolvePath(slidePath, target);
    const xml = await this.readXml(layoutPath);

    const layout = xml[NAMESPACES.slideLayout] as PptxXmlNode | undefined;
    if (!layout) {
      throw new Error(`Invalid layout XML: missing slideLayout element in ${layoutPath}`);
    }

    // Get master relationship
    const layoutRelsPath = layoutPath.replace('slideLayouts/', 'slideLayouts/_rels/').replace('.xml', '.xml.rels');
    const layoutRels = await this.getRelationships(layoutRelsPath);
    const masterRel = layoutRels.find((r) =>
      r.type.includes('slideMaster')
    );

    return {
      name: layout[`${ATTR_PREFIX}name`] as string | undefined,
      content: layout,
      masterRelId: masterRel?.id,
      path: layoutPath,
    };
  }

  /**
   * Gets slide master data.
   */
  async getSlideMaster(layoutPath: string, masterRelId: string): Promise<SlideMasterData> {
    const layoutRelsPath = layoutPath.replace('slideLayouts/', 'slideLayouts/_rels/').replace('.xml', '.xml.rels');
    const target = await this.getRelationshipTarget(layoutRelsPath, masterRelId);

    if (!target) {
      throw new Error(`Master relationship not found: ${masterRelId}`);
    }

    const masterPath = this.resolvePath(layoutPath, target);
    const xml = await this.readXml(masterPath);

    const master = xml[NAMESPACES.slideMaster] as PptxXmlNode | undefined;
    if (!master) {
      throw new Error(`Invalid master XML: missing slideMaster element in ${masterPath}`);
    }

    // Get theme relationship
    const masterRelsPath = masterPath.replace('slideMasters/', 'slideMasters/_rels/').replace('.xml', '.xml.rels');
    const masterRels = await this.getRelationships(masterRelsPath);
    const themeRel = masterRels.find((r) =>
      r.type.includes('theme')
    );

    return {
      name: master[`${ATTR_PREFIX}name`] as string | undefined,
      content: master,
      themeRelId: themeRel?.id,
      path: masterPath,
    };
  }

  /**
   * Gets theme data.
   */
  async getTheme(): Promise<ThemeData> {
    // First, try to get theme from the first slide master
    const presentationPath = await this.findPresentationPath();
    const presRelsPath = this.getPresentationRelsPath(presentationPath);
    const rels = await this.getRelationships(presRelsPath);
    const masterRel = rels.find((r) => r.type.includes('slideMaster'));

    if (masterRel) {
      const masterPath = this.resolvePath(presentationPath, masterRel.target);
      const masterRelsPath = masterPath.replace('slideMasters/', 'slideMasters/_rels/').replace('.xml', '.xml.rels');
      const masterRels = await this.getRelationships(masterRelsPath);
      const themeRel = masterRels.find((r) => r.type.includes('theme'));

      if (themeRel) {
        const themePath = this.resolvePath(masterPath, themeRel.target);
        const xml = await this.readXml(themePath);

        const theme = xml[NAMESPACES.theme] as PptxXmlNode | undefined;
        if (theme) {
          this.logger.debug('Theme loaded', { path: themePath });
          return { content: theme, path: themePath };
        }
      }
    }

    // Fallback: try default theme path
    const defaultThemePath = 'ppt/theme/theme1.xml';
    if (this.fileExists(defaultThemePath)) {
      const xml = await this.readXml(defaultThemePath);
      const theme = xml[NAMESPACES.theme] as PptxXmlNode | undefined;
      if (theme) {
        this.logger.debug('Theme loaded from default path', { path: defaultThemePath });
        return { content: theme, path: defaultThemePath };
      }
    }

    throw new Error('No theme found in presentation');
  }

  /**
   * Gets media file by relationship ID.
   */
  async getMedia(slidePath: string, relationshipId: string): Promise<Buffer> {
    const slideRelsPath = slidePath.replace('slides/', 'slides/_rels/').replace('.xml', '.xml.rels');
    const target = await this.getRelationshipTarget(slideRelsPath, relationshipId);

    if (!target) {
      throw new Error(`Media relationship not found: ${relationshipId}`);
    }

    const mediaPath = this.resolvePath(slidePath, target);
    return this.readBinary(mediaPath);
  }

  /**
   * Closes the PPTX file and clears all internal caches.
   *
   * This method should always be called when you are done with the parser
   * to release the ZIP file reference and clear the XML and relationship caches.
   * Failure to call this method may result in memory not being released.
   *
   * After calling `close()`, the parser cannot be used until `open()` is called again.
   */
  close(): void {
    this.zip = null;
    this.relationshipCache.clear();
    this.xmlCache.clear();
    this.rawXmlCache.clear();
    this.presentationPath = null;
    this.logger.debug('PPTX closed');
  }
}

/**
 * Utility function to extract attribute value from XML node.
 */
export function getXmlAttr(node: PptxXmlNode | undefined, attr: string): string | undefined {
  if (!node) return undefined;
  const value = node[`${ATTR_PREFIX}${attr}`];
  return value !== undefined ? String(value) : undefined;
}

/**
 * Utility function to get a child element from XML node.
 */
export function getXmlChild(node: PptxXmlNode | undefined, path: string): PptxXmlNode | undefined {
  if (!node) return undefined;
  return node[path] as PptxXmlNode | undefined;
}

/**
 * Utility function to get a child element as array.
 */
export function getXmlChildren(node: PptxXmlNode | undefined, path: string): PptxXmlNode[] {
  if (!node) return [];
  const child = node[path];
  if (!child) return [];
  return Array.isArray(child) ? (child as PptxXmlNode[]) : [child as PptxXmlNode];
}

/**
 * Ordered XML parser singleton for use by external modules.
 * Used for parsing XML with preserveOrder to maintain document order.
 */
const orderedXmlParserSingleton = new XMLParser(ORDERED_XML_PARSER_OPTIONS);

/**
 * XML builder options for converting nodes back to XML.
 */
const XML_BUILDER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  suppressEmptyNode: false,
  format: false,
};

/**
 * XML builder singleton for serializing nodes back to XML strings.
 */
const xmlBuilderSingleton = new XMLBuilder(XML_BUILDER_OPTIONS);

/**
 * Represents a single element in the ordered XML output from fast-xml-parser.
 * Each element has one key (the tag name) with children as value, and optionally ':@' for attributes.
 */
export interface OrderedXmlNode {
  [tagName: string]: OrderedXmlOutput | string | Record<string, string> | undefined;
}

/**
 * Type representing the output of fast-xml-parser with preserveOrder: true.
 * Returns an array of elements in document order.
 */
export type OrderedXmlOutput = OrderedXmlNode[];

/**
 * Parses an XML string with preserved document order.
 * Returns an array of elements in the order they appear in the document.
 *
 * @param xmlString Raw XML string to parse
 * @returns Parsed XML with preserved order
 */
export function parseXmlPreservingOrder(xmlString: string): OrderedXmlOutput {
  return orderedXmlParserSingleton.parse(xmlString) as OrderedXmlOutput;
}

/**
 * Recursively converts an ordered XML element to a standard PptxXmlNode structure.
 * This handles arbitrary nesting depth, which is required for shape properties.
 *
 * @param orderedChildren Array of ordered child elements
 * @returns A PptxXmlNode containing all children in standard format
 */
function convertOrderedToStandardNode(orderedChildren: OrderedXmlOutput): PptxXmlNode {
  const result: PptxXmlNode = {};

  for (const child of orderedChildren) {
    if (typeof child !== 'object' || child === null) {
      continue;
    }

    // Get the attributes (stored in ':@')
    const childAttrs = (child[':@'] ?? {}) as Record<string, string>;

    // Get the tag name(s) - each child object has one tag key plus optional ':@'
    const childKeys = Object.keys(child).filter(k => k !== ':@');

    for (const childTag of childKeys) {
      const childContent = child[childTag];

      // Build the child node starting with its attributes
      const childNode: PptxXmlNode = { ...childAttrs };

      // Handle text content (#text)
      if (childTag === '#text') {
        // Text content is stored directly
        result['#text'] = childContent as string;
        continue;
      }

      // Recursively process nested children
      if (Array.isArray(childContent) && childContent.length > 0) {
        const nestedResult = convertOrderedToStandardNode(childContent as OrderedXmlOutput);
        // Merge nested children into the child node
        Object.assign(childNode, nestedResult);
      }

      // Add the child to the result (handle multiple elements with same tag)
      if (!result[childTag]) {
        result[childTag] = childNode;
      } else if (Array.isArray(result[childTag])) {
        (result[childTag] as PptxXmlNode[]).push(childNode);
      } else {
        result[childTag] = [result[childTag] as PptxXmlNode, childNode];
      }
    }
  }

  return result;
}

/**
 * Extracts ordered child elements from an ordered XML node.
 * Filters to only include specified tag names.
 * Fully converts nested ordered XML structures to standard PptxXmlNode format.
 *
 * @param orderedNode Array of ordered XML elements
 * @param tagNames Tag names to include (e.g., ['a:moveTo', 'a:lnTo'])
 * @returns Array of OrderedXmlElement in document order
 */
export function getOrderedChildren(
  orderedNode: OrderedXmlOutput,
  tagNames: readonly string[]
): OrderedXmlElement[] {
  const result: OrderedXmlElement[] = [];
  const tagSet = new Set(tagNames);

  for (const element of orderedNode) {
    // Each element has one key (tag name) plus optional ':@' for attributes
    const keys = Object.keys(element).filter(k => k !== ':@');
    for (const tagName of keys) {
      if (tagSet.has(tagName)) {
        const attributes = (element[':@'] ?? {}) as Record<string, string>;
        const children = element[tagName];

        // Build a node that matches the PptxXmlNode structure
        // Start with the element's own attributes
        const node: PptxXmlNode = { ...attributes };

        // Recursively convert all children to standard format
        if (Array.isArray(children) && children.length > 0) {
          const convertedChildren = convertOrderedToStandardNode(children as OrderedXmlOutput);
          Object.assign(node, convertedChildren);
        }

        result.push({ tagName, attributes, node });
      }
    }
  }

  return result;
}

/**
 * Extracts ordered child elements from an XML node, handling the raw ordered output.
 * Use this for getting children of any element in document order.
 *
 * @param parentChildren The children array from an ordered element
 * @param tagNames Tag names to filter by
 * @returns Ordered elements matching the specified tags
 */
export function extractOrderedElements(
  parentChildren: OrderedXmlOutput | undefined,
  tagNames: readonly string[]
): OrderedXmlElement[] {
  if (!parentChildren || !Array.isArray(parentChildren)) {
    return [];
  }
  return getOrderedChildren(parentChildren, tagNames);
}

/**
 * Converts a parsed XML node back to an XML string.
 * This is useful for re-parsing a node with different options (e.g., preserveOrder).
 *
 * @param node The parsed XML node
 * @param wrapperTag Tag name to wrap the node content with
 * @returns XML string representation of the node
 */
export function nodeToXmlString(node: PptxXmlNode, wrapperTag: string): string {
  const wrapped = { [wrapperTag]: node };
  return xmlBuilderSingleton.build(wrapped) as string;
}

/**
 * Gets children of a parsed XML node in document order by re-parsing with preserveOrder.
 * This is the main function to use when you need to iterate over child elements
 * in their original document order (for z-order or path segment order).
 *
 * @param node The parent node containing children to iterate
 * @param wrapperTag The tag name of the parent node (needed for XML serialization)
 * @param childTagNames Array of child tag names to filter and return in order
 * @returns Array of ordered child elements
 *
 * @example
 * ```typescript
 * // Get path segments in document order
 * const segments = getChildrenInDocumentOrder(
 *   pathNode,
 *   'a:path',
 *   ['a:moveTo', 'a:lnTo', 'a:cubicBezTo', 'a:arcTo', 'a:close']
 * );
 *
 * // Get shape tree elements in document order
 * const shapes = getChildrenInDocumentOrder(
 *   spTree,
 *   'p:spTree',
 *   ['p:sp', 'p:cxnSp', 'p:pic', 'p:grpSp']
 * );
 * ```
 */
export function getChildrenInDocumentOrder(
  node: PptxXmlNode,
  wrapperTag: string,
  childTagNames: readonly string[]
): OrderedXmlElement[] {
  // Convert the node to XML string
  const xmlString = nodeToXmlString(node, wrapperTag);

  // Re-parse with preserveOrder to get elements in document order
  const orderedParsed = orderedXmlParserSingleton.parse(xmlString) as OrderedXmlOutput;

  // The result is an array with one element (the wrapper)
  // We need to get its children
  if (!orderedParsed || orderedParsed.length === 0) {
    return [];
  }

  const wrapper = orderedParsed[0];
  if (!wrapper) {
    return [];
  }

  // Get the children array from the wrapper
  const children = wrapper[wrapperTag] as OrderedXmlOutput | undefined;
  if (!children || !Array.isArray(children)) {
    return [];
  }

  // Extract the ordered elements matching our filter
  return getOrderedChildren(children, childTagNames);
}
