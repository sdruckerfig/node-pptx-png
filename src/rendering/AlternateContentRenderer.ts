/**
 * Handles mc:AlternateContent elements (SmartArt, diagrams, etc.).
 * Parses mc:Choice and mc:Fallback elements, rendering fallback content
 * when primary content is not supported.
 */

import type { CanvasRenderingContext2D } from 'skia-canvas';
import type { PptxXmlNode } from '../core/PptxParser.js';
import { getXmlChild, getXmlAttr } from '../core/PptxParser.js';
import { SHAPE_ELEMENT_TYPES } from '../core/constants.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Supported namespace requirements that we can render.
 */
const SUPPORTED_NAMESPACES = new Set([
  // We can render basic drawing ML content
  'http://schemas.openxmlformats.org/drawingml/2006/main',
  // We can render presentation shapes
  'http://schemas.openxmlformats.org/presentationml/2006/main',
]);

/**
 * Configuration for AlternateContentRenderer.
 */
export interface AlternateContentRendererConfig {
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Result of parsing AlternateContent.
 */
export interface AlternateContentResult {
  /** Whether we should render the Choice content */
  useChoice: boolean;
  /** The content to render (either Choice or Fallback) */
  content: PptxXmlNode | undefined;
  /** The namespace requirement (if Choice) */
  requires?: string;
  /** List of child elements to render */
  children: PptxXmlNode[];
}

/**
 * Callback function type for rendering child elements.
 */
export type AlternateContentRenderCallback = (
  ctx: CanvasRenderingContext2D,
  tagName: string,
  node: PptxXmlNode
) => Promise<void>;

/**
 * Renders mc:AlternateContent elements by selecting and rendering
 * the appropriate content (Choice or Fallback).
 */
export class AlternateContentRenderer {
  private readonly logger: ILogger;

  constructor(config: AlternateContentRendererConfig = {}) {
    this.logger = config.logger ?? createLogger('warn', 'AlternateContentRenderer');
  }

  /**
   * Checks if we support rendering the content specified by a namespace.
   * @param requires The namespace requirement string
   * @returns True if we can render this content
   */
  supportsNamespace(requires: string | undefined): boolean {
    if (!requires) {
      return false;
    }
    return SUPPORTED_NAMESPACES.has(requires);
  }

  /**
   * Parses an mc:AlternateContent element and determines what to render.
   * @param alternateContentNode The mc:AlternateContent XML node
   * @returns The parsed result indicating what content to render
   */
  parseAlternateContent(alternateContentNode: PptxXmlNode): AlternateContentResult {
    // Look for mc:Choice first
    const choice = getXmlChild(alternateContentNode, 'mc:Choice');
    if (choice) {
      const requires = getXmlAttr(choice, 'Requires');
      this.logger.debug('Found mc:Choice', { requires });

      // Check if we support the required namespace
      if (this.supportsNamespace(requires)) {
        const children = this.extractChildren(choice);
        return {
          useChoice: true,
          content: choice,
          requires,
          children,
        };
      }
    }

    // Fall back to mc:Fallback
    const fallback = getXmlChild(alternateContentNode, 'mc:Fallback');
    if (fallback) {
      this.logger.debug('Using mc:Fallback content');
      const children = this.extractChildren(fallback);
      return {
        useChoice: false,
        content: fallback,
        children,
      };
    }

    // No usable content found
    this.logger.debug('No usable content in AlternateContent');
    return {
      useChoice: false,
      content: undefined,
      children: [],
    };
  }

  /**
   * Extracts renderable child elements from a Choice or Fallback node.
   * @param node The mc:Choice or mc:Fallback node
   * @returns Array of child element nodes
   */
  private extractChildren(node: PptxXmlNode): PptxXmlNode[] {
    const children: PptxXmlNode[] = [];

    // Use the shared element type constant
    // Note: We filter out mc:AlternateContent since nested alternate content
    // is not expected within Choice/Fallback nodes
    const elementTypes = SHAPE_ELEMENT_TYPES.filter(t => t !== 'mc:AlternateContent');

    for (const elementType of elementTypes) {
      const elements = node[elementType];
      if (!elements) continue;

      const elementArray = Array.isArray(elements) ? elements : [elements];
      for (const element of elementArray) {
        children.push(element as PptxXmlNode);
      }
    }

    return children;
  }

  /**
   * Gets the tag name for a child element.
   * @param node The child node
   * @param fallbackNode The fallback node containing the child
   * @returns The tag name of the child
   */
  getChildTagName(node: PptxXmlNode, fallbackNode: PptxXmlNode): string {
    // Check which property of fallbackNode contains this node
    // Use the shared constant, filtering out mc:AlternateContent
    const elementTypes = SHAPE_ELEMENT_TYPES.filter(t => t !== 'mc:AlternateContent');

    for (const elementType of elementTypes) {
      const elements = fallbackNode[elementType];
      if (!elements) continue;

      const elementArray = Array.isArray(elements) ? elements : [elements];
      if (elementArray.includes(node)) {
        return elementType;
      }
    }

    return 'unknown';
  }

  /**
   * Renders the content of an mc:AlternateContent element.
   * @param ctx Canvas 2D context
   * @param alternateContentNode The mc:AlternateContent XML node
   * @param renderChild Callback to render individual child elements
   */
  async renderAlternateContent(
    ctx: CanvasRenderingContext2D,
    alternateContentNode: PptxXmlNode,
    renderChild: AlternateContentRenderCallback
  ): Promise<void> {
    // Parse and determine what to render
    const result = this.parseAlternateContent(alternateContentNode);

    if (!result.content || result.children.length === 0) {
      this.logger.debug('No content to render in AlternateContent');
      return;
    }

    this.logger.debug('Rendering AlternateContent', {
      useChoice: result.useChoice,
      childCount: result.children.length,
    });

    // Render each child element
    for (const child of result.children) {
      try {
        const tagName = this.getChildTagName(child, result.content);
        await renderChild(ctx, tagName, child);
      } catch (error) {
        this.logger.warn('Failed to render AlternateContent child', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Checks if a node is an mc:AlternateContent element.
   * @param tagName The tag name to check
   * @returns True if this is an AlternateContent element
   */
  static isAlternateContent(tagName: string): boolean {
    return tagName === 'mc:AlternateContent';
  }
}

/**
 * Creates an AlternateContentRenderer instance.
 */
export function createAlternateContentRenderer(logger?: ILogger): AlternateContentRenderer {
  return new AlternateContentRenderer({ logger });
}
