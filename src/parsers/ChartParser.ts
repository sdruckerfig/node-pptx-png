/**
 * Parses chart XML (c:chartSpace) from PPTX files.
 * Extracts chart type, series data, categories, and styling information.
 */

import { XMLParser } from 'fast-xml-parser';
import type { PptxParser, PptxXmlNode } from '../core/PptxParser.js';
import { getXmlChild, getXmlChildren, getXmlAttr } from '../core/PptxParser.js';
import type { Rgba } from '../types/geometry.js';
import type { ResolvedTheme } from '../types/theme.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Chart types supported for rendering.
 */
export type ChartType = 'bar' | 'column' | 'line' | 'pie' | 'area' | 'scatter' | 'stackedBar' | 'stackedColumn';

/**
 * A single data series in a chart.
 */
export interface ChartSeries {
  /** Series name/label */
  name: string;
  /** Data values */
  values: number[];
  /** Series color (optional, uses theme if not specified) */
  color?: Rgba;
}

/**
 * Legend configuration.
 */
export interface LegendData {
  /** Legend position */
  position: 'top' | 'bottom' | 'left' | 'right';
  /** Legend entries */
  entries: LegendEntry[];
}

/**
 * A single legend entry.
 */
export interface LegendEntry {
  /** Entry name */
  name: string;
  /** Entry color */
  color?: Rgba;
}

/**
 * Rectangle for positioning.
 */
export interface ChartRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Complete chart data structure.
 */
export interface ChartData {
  /** Chart type */
  type: ChartType;
  /** Data series */
  series: ChartSeries[];
  /** Category labels (x-axis for bar/line, slice labels for pie) */
  categories: string[];
  /** Chart title */
  title?: string;
  /** Legend configuration */
  legend?: LegendData;
  /** Whether to show the legend */
  showLegend: boolean;
  /** Whether to show data labels */
  showDataLabels: boolean;
}

/**
 * Configuration for ChartParser.
 */
export interface ChartParserConfig {
  /** Resolved theme for color resolution */
  theme?: ResolvedTheme;
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Parses chart XML from PPTX.
 */
export class ChartParser {
  private readonly logger: ILogger;
  private readonly theme?: ResolvedTheme;
  private readonly xmlParser: XMLParser;

  constructor(config: ChartParserConfig = {}) {
    this.logger = config.logger ?? createLogger('warn', 'ChartParser');
    this.theme = config.theme;
    // Create XMLParser once in constructor for reuse across all chart parsing
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: false,
      parseAttributeValue: false,
      trimValues: true,
      isArray: (name: string) => {
        // Elements that can appear multiple times
        // Note: c:strRef and c:numRef are NOT arrays - they're single elements
        return ['c:ser', 'c:pt'].some(
          (tag) => name.endsWith(tag)
        );
      },
    });
  }

  /**
   * Parses a chart XML file and returns structured chart data.
   * @param parser The PPTX parser
   * @param chartPath Path to the chart XML file within the PPTX
   * @returns Parsed chart data or undefined if parsing fails
   */
  async parseChart(parser: PptxParser, chartPath: string): Promise<ChartData | undefined> {
    try {
      // Read the chart XML
      const chartXml = await parser.readBinary(chartPath);
      const chartString = chartXml.toString('utf-8');

      // Parse the XML using the reusable XMLParser instance
      const parsed = this.xmlParser.parse(chartString) as PptxXmlNode;

      // Navigate to chart space
      const chartSpace = getXmlChild(parsed, 'c:chartSpace');
      if (!chartSpace) {
        this.logger.warn('No chartSpace found in chart XML');
        return undefined;
      }

      return this.parseChartSpace(chartSpace);
    } catch (error) {
      this.logger.error('Failed to parse chart', {
        path: chartPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Parses the c:chartSpace element.
   */
  private parseChartSpace(chartSpace: PptxXmlNode): ChartData | undefined {
    const chart = getXmlChild(chartSpace, 'c:chart');
    if (!chart) {
      this.logger.warn('No chart element in chartSpace');
      return undefined;
    }

    // Parse title
    const title = this.parseTitle(chart);

    // Parse legend
    const legendData = this.parseLegend(chart);
    const showLegend = legendData !== undefined;

    // Parse plot area (contains the actual chart data)
    const plotArea = getXmlChild(chart, 'c:plotArea');
    if (!plotArea) {
      this.logger.warn('No plotArea in chart');
      return undefined;
    }

    // Determine chart type and extract data
    const chartTypeData = this.determineChartType(plotArea);
    if (!chartTypeData) {
      this.logger.warn('Could not determine chart type');
      return undefined;
    }

    const { type, series, categories, showDataLabels } = chartTypeData;

    this.logger.debug('Parsed chart', {
      type,
      seriesCount: series.length,
      categoryCount: categories.length,
      title,
    });

    return {
      type,
      series,
      categories,
      title,
      legend: legendData,
      showLegend,
      showDataLabels,
    };
  }

  /**
   * Parses the chart title.
   */
  private parseTitle(chart: PptxXmlNode): string | undefined {
    const title = getXmlChild(chart, 'c:title');
    if (!title) return undefined;

    // Check for auto-deleted title
    const autoTitleDeleted = getXmlChild(chart, 'c:autoTitleDeleted');
    if (autoTitleDeleted) {
      const val = getXmlAttr(autoTitleDeleted, 'val');
      if (val === '1' || val === 'true') return undefined;
    }

    // Extract text from rich text or string reference
    const tx = getXmlChild(title, 'c:tx');
    if (!tx) return undefined;

    // Try rich text first
    const rich = getXmlChild(tx, 'c:rich');
    if (rich) {
      return this.extractTextFromRichText(rich);
    }

    // Try string reference
    const strRef = getXmlChild(tx, 'c:strRef');
    if (strRef) {
      return this.extractTextFromStrRef(strRef);
    }

    return undefined;
  }

  /**
   * Extracts text from a rich text element.
   */
  private extractTextFromRichText(rich: PptxXmlNode): string {
    const texts: string[] = [];

    // Navigate through paragraphs
    const paragraphs = getXmlChildren(rich, 'a:p');
    for (const p of paragraphs) {
      const runs = getXmlChildren(p, 'a:r');
      for (const r of runs) {
        const t = getXmlChild(r, 'a:t');
        if (t) {
          const text = typeof t === 'string' ? t : (t['#text'] as string);
          if (text) texts.push(text);
        }
      }
    }

    return texts.join('');
  }

  /**
   * Extracts text from a string reference.
   */
  private extractTextFromStrRef(strRef: PptxXmlNode): string | undefined {
    const strCache = getXmlChild(strRef, 'c:strCache');
    if (!strCache) return undefined;

    const points = getXmlChildren(strCache, 'c:pt');
    if (points.length === 0) return undefined;

    const v = getXmlChild(points[0], 'c:v');
    if (!v) return undefined;

    return typeof v === 'string' ? v : (v['#text'] as string);
  }

  /**
   * Parses the legend configuration.
   */
  private parseLegend(chart: PptxXmlNode): LegendData | undefined {
    const legend = getXmlChild(chart, 'c:legend');
    if (!legend) return undefined;

    // Parse position
    const legendPos = getXmlChild(legend, 'c:legendPos');
    const posVal = legendPos ? getXmlAttr(legendPos, 'val') : 'b';

    let position: LegendData['position'] = 'bottom';
    switch (posVal) {
      case 't':
        position = 'top';
        break;
      case 'b':
        position = 'bottom';
        break;
      case 'l':
        position = 'left';
        break;
      case 'r':
      case 'tr':
        position = 'right';
        break;
    }

    return {
      position,
      entries: [], // Entries are determined from series data
    };
  }

  /**
   * Determines the chart type and extracts series/category data.
   */
  private determineChartType(plotArea: PptxXmlNode): {
    type: ChartType;
    series: ChartSeries[];
    categories: string[];
    showDataLabels: boolean;
  } | undefined {
    // Check for bar chart
    const barChart = getXmlChild(plotArea, 'c:barChart');
    if (barChart) {
      return this.parseBarChart(barChart);
    }

    // Check for line chart
    const lineChart = getXmlChild(plotArea, 'c:lineChart');
    if (lineChart) {
      return this.parseLineChart(lineChart);
    }

    // Check for pie chart
    const pieChart = getXmlChild(plotArea, 'c:pieChart');
    if (pieChart) {
      return this.parsePieChart(pieChart);
    }

    // Check for area chart (render as line)
    const areaChart = getXmlChild(plotArea, 'c:areaChart');
    if (areaChart) {
      return this.parseAreaChart(areaChart);
    }

    this.logger.warn('Unsupported chart type');
    return undefined;
  }

  /**
   * Parses a bar/column chart.
   */
  private parseBarChart(barChart: PptxXmlNode): {
    type: ChartType;
    series: ChartSeries[];
    categories: string[];
    showDataLabels: boolean;
  } {
    // Determine orientation and grouping
    const barDir = getXmlChild(barChart, 'c:barDir');
    const barDirVal = barDir ? getXmlAttr(barDir, 'val') : 'col';
    const isHorizontal = barDirVal === 'bar';

    const grouping = getXmlChild(barChart, 'c:grouping');
    const groupingVal = grouping ? getXmlAttr(grouping, 'val') : 'clustered';
    const isStacked = groupingVal === 'stacked' || groupingVal === 'percentStacked';

    let type: ChartType;
    if (isHorizontal) {
      type = isStacked ? 'stackedBar' : 'bar';
    } else {
      type = isStacked ? 'stackedColumn' : 'column';
    }

    // Parse series
    const seriesNodes = getXmlChildren(barChart, 'c:ser');
    const series = seriesNodes.map((ser, index) => this.parseSeries(ser, index));

    // Extract categories from first series
    const firstSeries = seriesNodes[0];
    const categories = firstSeries
      ? this.extractCategories(firstSeries)
      : [];

    // Check for data labels
    const showDataLabels = this.hasDataLabels(barChart);

    return { type, series, categories, showDataLabels };
  }

  /**
   * Parses a line chart.
   */
  private parseLineChart(lineChart: PptxXmlNode): {
    type: ChartType;
    series: ChartSeries[];
    categories: string[];
    showDataLabels: boolean;
  } {
    const seriesNodes = getXmlChildren(lineChart, 'c:ser');
    const series = seriesNodes.map((ser, index) => this.parseSeries(ser, index));

    const firstSeries = seriesNodes[0];
    const categories = firstSeries
      ? this.extractCategories(firstSeries)
      : [];

    const showDataLabels = this.hasDataLabels(lineChart);

    return { type: 'line', series, categories, showDataLabels };
  }

  /**
   * Parses a pie chart.
   */
  private parsePieChart(pieChart: PptxXmlNode): {
    type: ChartType;
    series: ChartSeries[];
    categories: string[];
    showDataLabels: boolean;
  } {
    const seriesNodes = getXmlChildren(pieChart, 'c:ser');
    const series = seriesNodes.map((ser, index) => this.parseSeries(ser, index));

    const firstSeries = seriesNodes[0];
    const categories = firstSeries
      ? this.extractCategories(firstSeries)
      : [];

    const showDataLabels = this.hasDataLabels(pieChart);

    return { type: 'pie', series, categories, showDataLabels };
  }

  /**
   * Parses an area chart (rendered as line).
   */
  private parseAreaChart(areaChart: PptxXmlNode): {
    type: ChartType;
    series: ChartSeries[];
    categories: string[];
    showDataLabels: boolean;
  } {
    const seriesNodes = getXmlChildren(areaChart, 'c:ser');
    const series = seriesNodes.map((ser, index) => this.parseSeries(ser, index));

    const firstSeries = seriesNodes[0];
    const categories = firstSeries
      ? this.extractCategories(firstSeries)
      : [];

    const showDataLabels = this.hasDataLabels(areaChart);

    return { type: 'area', series, categories, showDataLabels };
  }

  /**
   * Parses a single data series.
   */
  private parseSeries(ser: PptxXmlNode, index: number): ChartSeries {
    // Parse series name
    const tx = getXmlChild(ser, 'c:tx');
    let name = `Series ${index + 1}`;
    if (tx) {
      const strRef = getXmlChild(tx, 'c:strRef');
      if (strRef) {
        const extracted = this.extractTextFromStrRef(strRef);
        if (extracted) name = extracted;
      } else {
        const v = getXmlChild(tx, 'c:v');
        if (v) {
          const text = typeof v === 'string' ? v : (v['#text'] as string);
          if (text) name = text;
        }
      }
    }

    // Parse values
    const val = getXmlChild(ser, 'c:val');
    const values = this.extractValues(val);

    // Parse color (optional)
    const color = this.extractSeriesColor(ser, index);

    return { name, values, color };
  }

  /**
   * Extracts numeric values from a c:val element.
   * Values are sorted by index to ensure correct data alignment.
   */
  private extractValues(val: PptxXmlNode | undefined): number[] {
    if (!val) return [];

    const numRef = getXmlChild(val, 'c:numRef');
    if (!numRef) return [];

    const numCache = getXmlChild(numRef, 'c:numCache');
    if (!numCache) return [];

    const points = getXmlChildren(numCache, 'c:pt');

    // Sort by index to prevent data misalignment (consistent with extractCategories)
    const sortedPoints = [...points].sort((a, b) => {
      const aIdx = parseInt(getXmlAttr(a, 'idx') ?? '0', 10);
      const bIdx = parseInt(getXmlAttr(b, 'idx') ?? '0', 10);
      return aIdx - bIdx;
    });

    const values: number[] = [];

    for (const pt of sortedPoints) {
      const v = getXmlChild(pt, 'c:v');
      if (v !== undefined && v !== null) {
        // v can be a number, string, or object with #text
        let num: number;
        if (typeof v === 'number') {
          num = v;
        } else if (typeof v === 'string') {
          num = parseFloat(v);
        } else {
          const text = v['#text'] as string | number;
          num = typeof text === 'number' ? text : parseFloat(text || '0');
        }
        values.push(isNaN(num) ? 0 : num);
      }
    }

    return values;
  }

  /**
   * Extracts category labels from a series.
   */
  private extractCategories(ser: PptxXmlNode): string[] {
    const cat = getXmlChild(ser, 'c:cat');
    if (!cat) return [];

    const strRef = getXmlChild(cat, 'c:strRef');
    if (!strRef) return [];

    const strCache = getXmlChild(strRef, 'c:strCache');
    if (!strCache) return [];

    const points = getXmlChildren(strCache, 'c:pt');
    const categories: string[] = [];

    // Sort by index
    const sortedPoints = [...points].sort((a, b) => {
      const aIdx = parseInt(getXmlAttr(a, 'idx') ?? '0', 10);
      const bIdx = parseInt(getXmlAttr(b, 'idx') ?? '0', 10);
      return aIdx - bIdx;
    });

    for (const pt of sortedPoints) {
      const v = getXmlChild(pt, 'c:v');
      if (v) {
        const text = typeof v === 'string' ? v : (v['#text'] as string);
        categories.push(text || '');
      }
    }

    return categories;
  }

  /**
   * Extracts the color for a series.
   */
  private extractSeriesColor(ser: PptxXmlNode, index: number): Rgba | undefined {
    const spPr = getXmlChild(ser, 'c:spPr');
    if (!spPr) return this.getThemeAccentColor(index);

    // Check for solid fill
    const solidFill = getXmlChild(spPr, 'a:solidFill');
    if (solidFill) {
      // Try RGB color
      const srgbClr = getXmlChild(solidFill, 'a:srgbClr');
      if (srgbClr) {
        const val = getXmlAttr(srgbClr, 'val');
        if (val) {
          return this.hexToRgba(val);
        }
      }

      // Try scheme color
      const schemeClr = getXmlChild(solidFill, 'a:schemeClr');
      if (schemeClr && this.theme) {
        const val = getXmlAttr(schemeClr, 'val');
        if (val) {
          return this.resolveSchemeColor(val);
        }
      }
    }

    return this.getThemeAccentColor(index);
  }

  /**
   * Gets a theme accent color by index.
   */
  private getThemeAccentColor(index: number): Rgba | undefined {
    if (!this.theme) return undefined;

    const colors = this.theme.colors;
    const accents = [
      colors.accent1,
      colors.accent2,
      colors.accent3,
      colors.accent4,
      colors.accent5,
      colors.accent6,
    ];

    return accents[index % accents.length];
  }

  /**
   * Resolves a scheme color to RGBA.
   */
  private resolveSchemeColor(schemeValue: string): Rgba | undefined {
    if (!this.theme) return undefined;

    const colors = this.theme.colors;
    const colorMap: Record<string, Rgba | undefined> = {
      dk1: colors.dark1,
      lt1: colors.light1,
      dk2: colors.dark2,
      lt2: colors.light2,
      tx1: colors.dark1,
      tx2: colors.dark2,
      bg1: colors.light1,
      bg2: colors.light2,
      accent1: colors.accent1,
      accent2: colors.accent2,
      accent3: colors.accent3,
      accent4: colors.accent4,
      accent5: colors.accent5,
      accent6: colors.accent6,
      hlink: colors.hyperlink,
      folHlink: colors.followedHyperlink,
    };

    return colorMap[schemeValue];
  }

  /**
   * Converts a hex color string to RGBA.
   */
  private hexToRgba(hex: string): Rgba {
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return { r, g, b, a: 255 };
  }

  /**
   * Checks if data labels are enabled for the chart.
   */
  private hasDataLabels(chartNode: PptxXmlNode): boolean {
    const dLbls = getXmlChild(chartNode, 'c:dLbls');
    if (!dLbls) return false;

    const showVal = getXmlChild(dLbls, 'c:showVal');
    if (showVal) {
      const val = getXmlAttr(showVal, 'val');
      return val === '1' || val === 'true';
    }

    return false;
  }
}

/**
 * Creates a ChartParser instance.
 */
export function createChartParser(theme?: ResolvedTheme, logger?: ILogger): ChartParser {
  return new ChartParser({ theme, logger });
}
