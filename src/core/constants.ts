/**
 * Shared constants for PPTX element types and other common values.
 */

/**
 * Element types that can appear in a shape tree (p:spTree) or group shape (p:grpSp).
 * These represent the different kinds of visual elements in a PowerPoint slide.
 * Order is significant for iteration but not for z-order (document order determines z-order).
 */
export const SHAPE_ELEMENT_TYPES = [
  'p:sp',                   // Regular shapes
  'p:cxnSp',                // Connection shapes (connectors)
  'p:pic',                  // Pictures/images
  'p:grpSp',                // Group shapes
  'p:graphicFrame',         // Charts, tables, diagrams
  'mc:AlternateContent',    // SmartArt and other alternate content
] as const;

/**
 * Type representing a valid shape element type.
 */
export type ShapeElementType = (typeof SHAPE_ELEMENT_TYPES)[number];
