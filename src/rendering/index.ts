export { SlideRenderer } from './SlideRenderer.js';
export type { SlideRenderContext, SlideRenderOutput } from './SlideRenderer.js';

export { BackgroundRenderer } from './BackgroundRenderer.js';
export type { BackgroundType, ParsedBackground } from './BackgroundRenderer.js';

export { ShapeRenderer, createShapeRenderer } from './ShapeRenderer.js';
export type { ShapeRendererConfig, ParsedShape } from './ShapeRenderer.js';

export { FillRenderer, createFillRenderer } from './FillRenderer.js';
export type { FillRendererConfig, ExtendedPictureFill } from './FillRenderer.js';

export { StrokeRenderer, createStrokeRenderer } from './StrokeRenderer.js';
export type { StrokeRendererConfig } from './StrokeRenderer.js';

export { TextRenderer, createTextRenderer } from './TextRenderer.js';
export type { TextRendererConfig } from './TextRenderer.js';

export {
  ImageRenderer,
  createImageRenderer,
  type ImageRendererConfig,
  type PictureData,
  type CropRect,
  type TileInfo,
} from './ImageRenderer.js';

// Phase 5: Advanced features
export { GroupShapeRenderer, createGroupShapeRenderer } from './GroupShapeRenderer.js';
export type {
  GroupShapeRendererConfig,
  GroupTransform,
  ChildRenderCallback,
} from './GroupShapeRenderer.js';

export { AlternateContentRenderer, createAlternateContentRenderer } from './AlternateContentRenderer.js';
export type {
  AlternateContentRendererConfig,
  AlternateContentResult,
  AlternateContentRenderCallback,
} from './AlternateContentRenderer.js';

export { ChartRenderer, createChartRenderer } from './ChartRenderer.js';
export type { ChartRendererConfig } from './ChartRenderer.js';

export { TableRenderer, createTableRenderer } from './TableRenderer.js';
export type {
  TableRendererConfig,
  ParsedTable,
  ParsedTableRow,
  ParsedTableCell,
  TableProperties,
  CellMargins,
  CellBorders,
  CellBorder,
} from './TableRenderer.js';
