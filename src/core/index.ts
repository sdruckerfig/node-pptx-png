export {
  PptxParser,
  getXmlAttr,
  getXmlChild,
  getXmlChildren,
  parseXmlPreservingOrder,
  getOrderedChildren,
  nodeToXmlString,
} from './PptxParser.js';
export type {
  SlideData,
  SlideLayoutData,
  SlideMasterData,
  ThemeData,
  PresentationData,
  Relationship,
  PptxXmlNode,
  OrderedXmlElement,
  OrderedXmlOutput,
  OrderedXmlNode,
} from './PptxParser.js';

export {
  UnitConverter,
  defaultUnitConverter,
  emuToPixels,
  emuToPoints,
  pointsToEmu,
  angleToRadians,
  fontSizeToPoints,
  percentageToDecimal,
  EMU_PER_INCH,
  EMU_PER_POINT,
  EMU_PER_CM,
  ANGLE_UNIT_PER_DEGREE,
  STANDARD_SLIDE_WIDTH_EMU,
  STANDARD_SLIDE_HEIGHT_EMU,
  WIDESCREEN_SLIDE_WIDTH_EMU,
  WIDESCREEN_SLIDE_HEIGHT_EMU,
} from './UnitConverter.js';

export { PlaceholderResolver } from './PlaceholderResolver.js';
export type { ResolvedPlaceholder } from './PlaceholderResolver.js';

export { SHAPE_ELEMENT_TYPES } from './constants.js';
export type { ShapeElementType } from './constants.js';

export {
  PptxImageRenderer,
  createRenderer,
  renderPresentation,
  renderSlide,
} from './PptxImageRenderer.js';
export type { IPptxImageRenderer } from './PptxImageRenderer.js';
