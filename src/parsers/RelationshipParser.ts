/**
 * Parses .rels files to resolve relationship IDs to file paths.
 * Handles slide, layout, and master relationships.
 * Resolves image references (r:embed) to media file paths.
 */

import type { PptxParser, Relationship } from '../core/PptxParser.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Relationship types commonly found in PPTX files.
 */
export const RelationshipTypes = {
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
  slideLayout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
  slideMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
  theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
  hyperlink: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
  chart: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart',
  oleObject: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject',
} as const;

/**
 * Configuration for RelationshipParser.
 */
export interface RelationshipParserConfig {
  /** PPTX parser instance for accessing files */
  parser: PptxParser;
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Cached relationship data for a specific source file.
 */
interface CachedRelationships {
  /** Path to the .rels file */
  relsPath: string;
  /** Base directory for resolving relative paths */
  baseDir: string;
  /** Map of relationship ID to Relationship object */
  relationships: Map<string, Relationship>;
}

/**
 * Parser for PPTX relationship files (.rels).
 * Provides methods to resolve relationship IDs to actual file paths within the PPTX.
 */
export class RelationshipParser {
  private readonly logger: ILogger;
  private readonly parser: PptxParser;
  /** Cache of parsed relationships, keyed by source file path */
  private readonly cache: Map<string, CachedRelationships> = new Map();

  constructor(config: RelationshipParserConfig) {
    this.parser = config.parser;
    this.logger = config.logger ?? createLogger('warn', 'RelationshipParser');
  }

  /**
   * Gets the .rels file path for a given source file.
   * For example:
   * - ppt/slides/slide1.xml -> ppt/slides/_rels/slide1.xml.rels
   * - ppt/slideLayouts/slideLayout1.xml -> ppt/slideLayouts/_rels/slideLayout1.xml.rels
   */
  getRelsPath(sourcePath: string): string {
    const lastSlash = sourcePath.lastIndexOf('/');
    const dir = sourcePath.substring(0, lastSlash);
    const filename = sourcePath.substring(lastSlash + 1);
    return `${dir}/_rels/${filename}.rels`;
  }

  /**
   * Gets the base directory for resolving relative paths from a source file.
   */
  private getBaseDir(sourcePath: string): string {
    const lastSlash = sourcePath.lastIndexOf('/');
    return lastSlash >= 0 ? sourcePath.substring(0, lastSlash + 1) : '';
  }

  /**
   * Loads and caches relationships for a source file.
   */
  private async loadRelationships(sourcePath: string): Promise<CachedRelationships> {
    // Check cache first
    const cached = this.cache.get(sourcePath);
    if (cached) {
      return cached;
    }

    const relsPath = this.getRelsPath(sourcePath);
    const baseDir = this.getBaseDir(sourcePath);
    const relationships = new Map<string, Relationship>();

    try {
      const rels = await this.parser.getRelationships(relsPath);
      for (const rel of rels) {
        relationships.set(rel.id, rel);
      }
      this.logger.debug('Loaded relationships', {
        source: sourcePath,
        count: relationships.size,
      });
    } catch {
      this.logger.debug('No relationships file found', { path: relsPath });
    }

    const result: CachedRelationships = {
      relsPath,
      baseDir,
      relationships,
    };

    this.cache.set(sourcePath, result);
    return result;
  }

  /**
   * Resolves a relationship ID to a full file path within the PPTX.
   *
   * @param sourcePath The source file path (e.g., ppt/slides/slide1.xml)
   * @param relationshipId The relationship ID (e.g., rId1)
   * @returns The resolved file path or undefined if not found
   */
  async resolveRelationshipId(
    sourcePath: string,
    relationshipId: string
  ): Promise<string | undefined> {
    const cached = await this.loadRelationships(sourcePath);
    const rel = cached.relationships.get(relationshipId);

    if (!rel) {
      this.logger.debug('Relationship not found', {
        source: sourcePath,
        id: relationshipId,
      });
      return undefined;
    }

    // Resolve the target path relative to the source file
    const resolvedPath = this.parser.resolvePath(sourcePath, rel.target);

    this.logger.debug('Resolved relationship', {
      id: relationshipId,
      target: rel.target,
      resolved: resolvedPath,
      type: rel.type,
    });

    return resolvedPath;
  }

  /**
   * Resolves an image relationship ID to the media file path.
   *
   * @param sourcePath The source file path (e.g., ppt/slides/slide1.xml)
   * @param relationshipId The relationship ID (e.g., rId2)
   * @returns The resolved media file path or undefined if not found
   */
  async resolveImageRelationship(
    sourcePath: string,
    relationshipId: string
  ): Promise<string | undefined> {
    const cached = await this.loadRelationships(sourcePath);
    const rel = cached.relationships.get(relationshipId);

    if (!rel) {
      this.logger.debug('Image relationship not found', {
        source: sourcePath,
        id: relationshipId,
      });
      return undefined;
    }

    // Verify it's an image relationship
    if (rel.type !== RelationshipTypes.image) {
      this.logger.warn('Relationship is not an image type', {
        id: relationshipId,
        type: rel.type,
        expected: RelationshipTypes.image,
      });
    }

    return this.parser.resolvePath(sourcePath, rel.target);
  }

  /**
   * Gets all image relationships for a source file.
   *
   * @param sourcePath The source file path
   * @returns Array of {id, path} for all image relationships
   */
  async getImageRelationships(
    sourcePath: string
  ): Promise<Array<{ id: string; path: string }>> {
    const cached = await this.loadRelationships(sourcePath);
    const images: Array<{ id: string; path: string }> = [];

    for (const [id, rel] of cached.relationships) {
      if (rel.type === RelationshipTypes.image) {
        const resolvedPath = this.parser.resolvePath(sourcePath, rel.target);
        images.push({ id, path: resolvedPath });
      }
    }

    return images;
  }

  /**
   * Gets a relationship by ID.
   *
   * @param sourcePath The source file path
   * @param relationshipId The relationship ID
   * @returns The relationship object or undefined
   */
  async getRelationship(
    sourcePath: string,
    relationshipId: string
  ): Promise<Relationship | undefined> {
    const cached = await this.loadRelationships(sourcePath);
    return cached.relationships.get(relationshipId);
  }

  /**
   * Gets all relationships for a source file.
   *
   * @param sourcePath The source file path
   * @returns Array of all relationships
   */
  async getAllRelationships(sourcePath: string): Promise<Relationship[]> {
    const cached = await this.loadRelationships(sourcePath);
    return Array.from(cached.relationships.values());
  }

  /**
   * Gets relationships of a specific type.
   *
   * @param sourcePath The source file path
   * @param type The relationship type to filter by
   * @returns Array of relationships matching the type
   */
  async getRelationshipsByType(
    sourcePath: string,
    type: string
  ): Promise<Relationship[]> {
    const cached = await this.loadRelationships(sourcePath);
    const result: Relationship[] = [];

    for (const rel of cached.relationships.values()) {
      if (rel.type === type || rel.type.includes(type)) {
        result.push(rel);
      }
    }

    return result;
  }

  /**
   * Clears the relationship cache.
   * Call this when switching to a new PPTX file.
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug('Relationship cache cleared');
  }
}

/**
 * Creates a RelationshipParser instance.
 */
export function createRelationshipParser(
  parser: PptxParser,
  logger?: ILogger
): RelationshipParser {
  return new RelationshipParser({ parser, logger });
}
