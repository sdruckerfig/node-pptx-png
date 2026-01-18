/**
 * Renders tables from PPTX graphicFrame elements.
 * Tables are contained in a:graphic/a:graphicData[@uri="...table"]/a:tbl.
 *
 * Handles:
 * - Column widths from a:tblGrid/a:gridCol[@w]
 * - Row heights from a:tr[@h]
 * - Cell backgrounds from a:tc/a:tcPr/a:solidFill
 * - Cell borders from a:tc/a:tcPr/a:ln*
 * - Cell text from a:tc/a:txBody (using TextParser and TextRenderer)
 * - Cell margins from a:tc/a:tcPr[@marL/marR/marT/marB]
 */

import type { CanvasRenderingContext2D } from 'skia-canvas';
import type { Rect, Rgba } from '../types/geometry.js';
import type { ResolvedTheme } from '../types/theme.js';
import type { TextBody } from '../types/elements.js';
import type { PptxXmlNode } from '../core/PptxParser.js';
import { getXmlChild, getXmlChildren, getXmlAttr } from '../core/PptxParser.js';
import { UnitConverter } from '../core/UnitConverter.js';
import { ColorResolver } from '../theme/ColorResolver.js';
import { TextParser } from '../parsers/TextParser.js';
import { TextRenderer } from './TextRenderer.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Default cell margin in EMU (91440 EMU = 0.1 inches).
 */
const DEFAULT_CELL_MARGIN_EMU = 91440;

/**
 * Default border width in EMU (12700 EMU = 1 point).
 */
const DEFAULT_BORDER_WIDTH_EMU = 12700;

/**
 * Parsed table structure.
 */
export interface ParsedTable {
  /** Column widths in EMU */
  columnWidths: number[];
  /** Row heights in EMU */
  rowHeights: number[];
  /** Table cells organized by row */
  rows: ParsedTableRow[];
  /** Table properties */
  properties: TableProperties;
}

/**
 * Table-level properties.
 */
export interface TableProperties {
  /** First row has special formatting */
  firstRow?: boolean;
  /** First column has special formatting */
  firstCol?: boolean;
  /** Last row has special formatting */
  lastRow?: boolean;
  /** Last column has special formatting */
  lastCol?: boolean;
  /** Banded rows (alternating row colors) */
  bandRow?: boolean;
  /** Banded columns (alternating column colors) */
  bandCol?: boolean;
}

/**
 * Parsed table row.
 */
export interface ParsedTableRow {
  /** Row height in EMU */
  height: number;
  /** Cells in this row */
  cells: ParsedTableCell[];
}

/**
 * Parsed table cell.
 */
export interface ParsedTableCell {
  /** Cell text body (parsed) */
  textBody?: TextBody;
  /** Cell background color */
  backgroundColor?: Rgba;
  /** Cell margins in EMU */
  margins: CellMargins;
  /** Cell borders */
  borders: CellBorders;
  /** Column span (gridSpan attribute) */
  colSpan: number;
  /** Row span (rowSpan attribute) */
  rowSpan: number;
  /** Whether this cell is merged horizontally (hMerge) */
  hMerge: boolean;
  /** Whether this cell is merged vertically (vMerge) */
  vMerge: boolean;
  /** Vertical text alignment */
  anchor?: 'top' | 'middle' | 'bottom';
}

/**
 * Cell margins in EMU.
 */
export interface CellMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Cell border definitions.
 */
export interface CellBorders {
  left?: CellBorder;
  right?: CellBorder;
  top?: CellBorder;
  bottom?: CellBorder;
}

/**
 * Single border definition.
 */
export interface CellBorder {
  /** Border width in EMU */
  width: number;
  /** Border color */
  color: Rgba;
}

/**
 * Configuration for TableRenderer.
 */
export interface TableRendererConfig {
  /** Resolved theme for color/font resolution */
  theme: ResolvedTheme;
  /** Horizontal scale factor */
  scaleX: number;
  /** Vertical scale factor */
  scaleY: number;
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Renders tables to canvas.
 */
export class TableRenderer {
  private readonly logger: ILogger;
  private readonly theme: ResolvedTheme;
  private readonly scaleX: number;
  private readonly scaleY: number;
  private readonly colorResolver: ColorResolver;
  private readonly unitConverter: UnitConverter;
  private readonly textParser: TextParser;
  private readonly textRenderer: TextRenderer;

  constructor(config: TableRendererConfig) {
    this.logger = config.logger ?? createLogger('warn', 'TableRenderer');
    this.theme = config.theme;
    this.scaleX = config.scaleX;
    this.scaleY = config.scaleY;
    this.colorResolver = new ColorResolver(config.theme.colors);
    this.unitConverter = new UnitConverter();
    this.textParser = new TextParser({
      theme: config.theme,
      logger: this.logger.child?.('TextParser'),
    });
    this.textRenderer = new TextRenderer({
      theme: config.theme,
      scaleX: config.scaleX,
      scaleY: config.scaleY,
      logger: this.logger.child?.('TextRenderer'),
    });
  }

  /**
   * Renders a table to the canvas.
   *
   * @param ctx Canvas 2D context
   * @param tableNode The a:tbl XML node
   * @param bounds The bounds to render within (in pixels)
   */
  renderTable(
    ctx: CanvasRenderingContext2D,
    tableNode: PptxXmlNode,
    bounds: Rect
  ): void {
    // Parse the table structure
    const table = this.parseTable(tableNode);
    if (!table || table.rows.length === 0) {
      this.logger.debug('No table data to render');
      return;
    }

    this.logger.debug('Rendering table', {
      rows: table.rows.length,
      columns: table.columnWidths.length,
      bounds,
    });

    ctx.save();

    // Calculate pixel positions for each cell
    const columnPixels = this.calculatePixelPositions(table.columnWidths, bounds.x, bounds.width);
    const rowPixels = this.calculatePixelPositions(table.rowHeights, bounds.y, bounds.height);

    // Render each cell
    for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex++) {
      const row = table.rows[rowIndex];
      if (!row) continue;

      for (let colIndex = 0; colIndex < row.cells.length; colIndex++) {
        const cell = row.cells[colIndex];
        if (!cell) continue;

        // Skip merged cells
        if (cell.hMerge || cell.vMerge) {
          continue;
        }

        // Calculate cell bounds
        const cellBounds = this.calculateCellBounds(
          columnPixels,
          rowPixels,
          colIndex,
          rowIndex,
          cell.colSpan,
          cell.rowSpan
        );

        // Render cell
        this.renderCell(ctx, cell, cellBounds);
      }
    }

    ctx.restore();
  }

  /**
   * Parses a table XML node into a structured format.
   */
  parseTable(tableNode: PptxXmlNode): ParsedTable | undefined {
    if (!tableNode) return undefined;

    // Parse table properties
    const tblPr = getXmlChild(tableNode, 'a:tblPr');
    const properties = this.parseTableProperties(tblPr);

    // Parse column widths from tblGrid
    const tblGrid = getXmlChild(tableNode, 'a:tblGrid');
    const columnWidths = this.parseColumnWidths(tblGrid);

    if (columnWidths.length === 0) {
      this.logger.debug('No columns defined in table');
      return undefined;
    }

    // Parse rows
    const trNodes = getXmlChildren(tableNode, 'a:tr');
    const rows: ParsedTableRow[] = [];

    for (const trNode of trNodes) {
      const row = this.parseRow(trNode, columnWidths.length);
      if (row) {
        rows.push(row);
      }
    }

    // Extract row heights
    const rowHeights = rows.map((r) => r.height);

    return {
      columnWidths,
      rowHeights,
      rows,
      properties,
    };
  }

  /**
   * Parses table properties.
   */
  private parseTableProperties(tblPr: PptxXmlNode | undefined): TableProperties {
    if (!tblPr) return {};

    return {
      firstRow: getXmlAttr(tblPr, 'firstRow') === '1',
      firstCol: getXmlAttr(tblPr, 'firstCol') === '1',
      lastRow: getXmlAttr(tblPr, 'lastRow') === '1',
      lastCol: getXmlAttr(tblPr, 'lastCol') === '1',
      bandRow: getXmlAttr(tblPr, 'bandRow') === '1',
      bandCol: getXmlAttr(tblPr, 'bandCol') === '1',
    };
  }

  /**
   * Parses column widths from tblGrid.
   */
  private parseColumnWidths(tblGrid: PptxXmlNode | undefined): number[] {
    if (!tblGrid) return [];

    const gridCols = getXmlChildren(tblGrid, 'a:gridCol');
    const widths: number[] = [];

    for (const gridCol of gridCols) {
      const w = getXmlAttr(gridCol, 'w');
      if (w) {
        widths.push(parseInt(w, 10));
      }
    }

    return widths;
  }

  /**
   * Parses a table row.
   */
  private parseRow(trNode: PptxXmlNode, columnCount: number): ParsedTableRow | undefined {
    // Get row height
    const hAttr = getXmlAttr(trNode, 'h');
    const height = hAttr ? parseInt(hAttr, 10) : 0;

    // Parse cells
    const tcNodes = getXmlChildren(trNode, 'a:tc');
    const cells: ParsedTableCell[] = [];

    for (const tcNode of tcNodes) {
      const cell = this.parseCell(tcNode);
      cells.push(cell);
    }

    return { height, cells };
  }

  /**
   * Parses a table cell.
   */
  private parseCell(tcNode: PptxXmlNode): ParsedTableCell {
    // Parse cell properties
    const tcPr = getXmlChild(tcNode, 'a:tcPr');

    // Parse text body
    const txBody = getXmlChild(tcNode, 'a:txBody');
    const textBody = this.textParser.parseTextBody(txBody);

    // Parse background color
    const backgroundColor = this.parseCellBackground(tcPr);

    // Parse margins
    const margins = this.parseCellMargins(tcPr);

    // Parse borders
    const borders = this.parseCellBorders(tcPr);

    // Parse span attributes
    const gridSpan = getXmlAttr(tcNode, 'gridSpan');
    const rowSpan = getXmlAttr(tcNode, 'rowSpan');
    const hMerge = getXmlAttr(tcNode, 'hMerge') === '1';
    const vMerge = getXmlAttr(tcNode, 'vMerge') === '1';

    // Parse anchor (vertical alignment)
    let anchor: 'top' | 'middle' | 'bottom' | undefined;
    if (tcPr) {
      const anchorAttr = getXmlAttr(tcPr, 'anchor');
      if (anchorAttr === 't') anchor = 'top';
      else if (anchorAttr === 'ctr') anchor = 'middle';
      else if (anchorAttr === 'b') anchor = 'bottom';
    }

    // Also check body properties for anchor
    if (!anchor && txBody) {
      const bodyPr = getXmlChild(txBody, 'a:bodyPr');
      if (bodyPr) {
        const anchorAttr = getXmlAttr(bodyPr, 'anchor');
        if (anchorAttr === 't') anchor = 'top';
        else if (anchorAttr === 'ctr') anchor = 'middle';
        else if (anchorAttr === 'b') anchor = 'bottom';
      }
    }

    return {
      textBody,
      backgroundColor,
      margins,
      borders,
      colSpan: gridSpan ? parseInt(gridSpan, 10) : 1,
      rowSpan: rowSpan ? parseInt(rowSpan, 10) : 1,
      hMerge,
      vMerge,
      anchor,
    };
  }

  /**
   * Parses cell background color.
   */
  private parseCellBackground(tcPr: PptxXmlNode | undefined): Rgba | undefined {
    if (!tcPr) return undefined;

    // Check for solid fill
    const solidFill = getXmlChild(tcPr, 'a:solidFill');
    if (solidFill) {
      return this.colorResolver.resolveColorElement(solidFill);
    }

    // Check for no fill (transparent)
    if (getXmlChild(tcPr, 'a:noFill')) {
      return undefined;
    }

    return undefined;
  }

  /**
   * Parses cell margins.
   */
  private parseCellMargins(tcPr: PptxXmlNode | undefined): CellMargins {
    const defaultMargin = DEFAULT_CELL_MARGIN_EMU;

    if (!tcPr) {
      return {
        left: defaultMargin,
        right: defaultMargin,
        top: defaultMargin,
        bottom: defaultMargin,
      };
    }

    const marL = getXmlAttr(tcPr, 'marL');
    const marR = getXmlAttr(tcPr, 'marR');
    const marT = getXmlAttr(tcPr, 'marT');
    const marB = getXmlAttr(tcPr, 'marB');

    return {
      left: marL !== undefined ? parseInt(marL, 10) : defaultMargin,
      right: marR !== undefined ? parseInt(marR, 10) : defaultMargin,
      top: marT !== undefined ? parseInt(marT, 10) : defaultMargin,
      bottom: marB !== undefined ? parseInt(marB, 10) : defaultMargin,
    };
  }

  /**
   * Parses cell borders.
   */
  private parseCellBorders(tcPr: PptxXmlNode | undefined): CellBorders {
    if (!tcPr) return {};

    const borders: CellBorders = {};

    // Parse each border direction
    borders.left = this.parseBorder(getXmlChild(tcPr, 'a:lnL'));
    borders.right = this.parseBorder(getXmlChild(tcPr, 'a:lnR'));
    borders.top = this.parseBorder(getXmlChild(tcPr, 'a:lnT'));
    borders.bottom = this.parseBorder(getXmlChild(tcPr, 'a:lnB'));

    return borders;
  }

  /**
   * Parses a single border line.
   */
  private parseBorder(lnNode: PptxXmlNode | undefined): CellBorder | undefined {
    if (!lnNode) return undefined;

    // Check for no fill (no border)
    if (getXmlChild(lnNode, 'a:noFill')) {
      return undefined;
    }

    // Get border width
    const wAttr = getXmlAttr(lnNode, 'w');
    const width = wAttr ? parseInt(wAttr, 10) : DEFAULT_BORDER_WIDTH_EMU;

    // Get border color from solid fill
    const solidFill = getXmlChild(lnNode, 'a:solidFill');
    const color = solidFill
      ? this.colorResolver.resolveColorElement(solidFill)
      : { r: 0, g: 0, b: 0, a: 255 }; // Default to black

    if (!color) return undefined;

    return { width, color };
  }

  /**
   * Calculates pixel positions from EMU sizes.
   */
  private calculatePixelPositions(
    sizes: number[],
    startPixel: number,
    totalPixels: number
  ): number[] {
    // Calculate total EMU size
    const totalEmu = sizes.reduce((sum, s) => sum + s, 0);
    if (totalEmu === 0) return sizes.map(() => startPixel);

    // Scale factor to fit into total pixels
    const scale = totalPixels / (this.unitConverter.emuToPixels(totalEmu) * this.scaleX);

    // Calculate cumulative positions
    const positions: number[] = [startPixel];
    let current = startPixel;

    for (const size of sizes) {
      const pixelSize = this.unitConverter.emuToPixels(size) * this.scaleX * scale;
      current += pixelSize;
      positions.push(current);
    }

    return positions;
  }

  /**
   * Calculates bounds for a cell accounting for spans.
   */
  private calculateCellBounds(
    columnPixels: number[],
    rowPixels: number[],
    colIndex: number,
    rowIndex: number,
    colSpan: number,
    rowSpan: number
  ): Rect {
    const x = columnPixels[colIndex] ?? 0;
    const y = rowPixels[rowIndex] ?? 0;
    const endColIndex = Math.min(colIndex + colSpan, columnPixels.length - 1);
    const endRowIndex = Math.min(rowIndex + rowSpan, rowPixels.length - 1);
    const width = (columnPixels[endColIndex] ?? x) - x;
    const height = (rowPixels[endRowIndex] ?? y) - y;

    return { x, y, width, height };
  }

  /**
   * Renders a single cell.
   */
  private renderCell(
    ctx: CanvasRenderingContext2D,
    cell: ParsedTableCell,
    bounds: Rect
  ): void {
    // Render cell background
    if (cell.backgroundColor) {
      ctx.fillStyle = this.colorResolver.rgbaToCss(cell.backgroundColor);
      ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    // Render cell borders
    this.renderCellBorders(ctx, cell.borders, bounds);

    // Render cell text
    if (cell.textBody && cell.textBody.paragraphs.length > 0) {
      // Calculate text bounds with margins
      const marginLeft = this.unitConverter.emuToPixels(cell.margins.left) * this.scaleX;
      const marginRight = this.unitConverter.emuToPixels(cell.margins.right) * this.scaleX;
      const marginTop = this.unitConverter.emuToPixels(cell.margins.top) * this.scaleY;
      const marginBottom = this.unitConverter.emuToPixels(cell.margins.bottom) * this.scaleY;

      const textBounds: Rect = {
        x: bounds.x + marginLeft,
        y: bounds.y + marginTop,
        width: Math.max(0, bounds.width - marginLeft - marginRight),
        height: Math.max(0, bounds.height - marginTop - marginBottom),
      };

      // Apply vertical alignment if specified
      if (cell.anchor && cell.textBody.bodyProperties) {
        cell.textBody.bodyProperties.anchor = cell.anchor;
      }

      this.textRenderer.renderText(ctx, cell.textBody, textBounds);
    }
  }

  /**
   * Renders cell borders.
   */
  private renderCellBorders(
    ctx: CanvasRenderingContext2D,
    borders: CellBorders,
    bounds: Rect
  ): void {
    ctx.save();

    // Left border
    if (borders.left) {
      const width = this.unitConverter.emuToPixels(borders.left.width) * this.scaleX;
      ctx.strokeStyle = this.colorResolver.rgbaToCss(borders.left.color);
      ctx.lineWidth = Math.max(width, 0.5);
      ctx.beginPath();
      ctx.moveTo(bounds.x, bounds.y);
      ctx.lineTo(bounds.x, bounds.y + bounds.height);
      ctx.stroke();
    }

    // Right border
    if (borders.right) {
      const width = this.unitConverter.emuToPixels(borders.right.width) * this.scaleX;
      ctx.strokeStyle = this.colorResolver.rgbaToCss(borders.right.color);
      ctx.lineWidth = Math.max(width, 0.5);
      ctx.beginPath();
      ctx.moveTo(bounds.x + bounds.width, bounds.y);
      ctx.lineTo(bounds.x + bounds.width, bounds.y + bounds.height);
      ctx.stroke();
    }

    // Top border
    if (borders.top) {
      const width = this.unitConverter.emuToPixels(borders.top.width) * this.scaleY;
      ctx.strokeStyle = this.colorResolver.rgbaToCss(borders.top.color);
      ctx.lineWidth = Math.max(width, 0.5);
      ctx.beginPath();
      ctx.moveTo(bounds.x, bounds.y);
      ctx.lineTo(bounds.x + bounds.width, bounds.y);
      ctx.stroke();
    }

    // Bottom border
    if (borders.bottom) {
      const width = this.unitConverter.emuToPixels(borders.bottom.width) * this.scaleY;
      ctx.strokeStyle = this.colorResolver.rgbaToCss(borders.bottom.color);
      ctx.lineWidth = Math.max(width, 0.5);
      ctx.beginPath();
      ctx.moveTo(bounds.x, bounds.y + bounds.height);
      ctx.lineTo(bounds.x + bounds.width, bounds.y + bounds.height);
      ctx.stroke();
    }

    ctx.restore();
  }
}

/**
 * Creates a TableRenderer instance.
 */
export function createTableRenderer(
  theme: ResolvedTheme,
  scaleX: number,
  scaleY: number,
  logger?: ILogger
): TableRenderer {
  return new TableRenderer({ theme, scaleX, scaleY, logger });
}
