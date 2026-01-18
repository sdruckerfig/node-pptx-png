/**
 * Text module for text layout and rendering.
 */

export {
  FontResolver,
  createFontResolver,
  type FontResolverConfig,
  type FontMetrics,
  type ResolvedFont,
} from './FontResolver.js';

export {
  BulletFormatter,
  createBulletFormatter,
  type BulletFormatterConfig,
  type BulletType,
  type AutoNumType,
  type BulletProps,
  type FormattedBullet,
} from './BulletFormatter.js';

export {
  WordWrapper,
  createWordWrapper,
  type WordWrapperConfig,
  type WrapMode,
  type TextFragment,
  type WrappedLine,
  type WrapResult,
} from './WordWrapper.js';

export {
  TextLayoutEngine,
  createTextLayoutEngine,
  type TextLayoutEngineConfig,
  type PositionedTextRun,
  type PositionedBullet,
  type LayoutLine,
  type TextLayout,
} from './TextLayoutEngine.js';
