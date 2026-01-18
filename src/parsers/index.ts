/**
 * Parser module for PPTX element parsing.
 */

export { ShapeParser, createShapeParser, type ShapeParserConfig } from './ShapeParser.js';

export { TextParser, createTextParser, type TextParserConfig } from './TextParser.js';

export {
  RelationshipParser,
  createRelationshipParser,
  RelationshipTypes,
  type RelationshipParserConfig,
} from './RelationshipParser.js';

// Phase 5: Chart parsing
export {
  ChartParser,
  createChartParser,
  type ChartParserConfig,
  type ChartData,
  type ChartSeries,
  type ChartType,
  type LegendData,
  type LegendEntry,
  type ChartRect,
} from './ChartParser.js';
