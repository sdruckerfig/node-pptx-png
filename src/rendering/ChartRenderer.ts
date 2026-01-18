/**
 * Renders charts to canvas using basic canvas primitives.
 * Supports bar, column, line, and pie charts.
 */

import type { CanvasRenderingContext2D } from 'skia-canvas';
import type { Rect, Rgba } from '../types/geometry.js';
import type { ChartData, ChartSeries, ChartType } from '../parsers/ChartParser.js';
import type { ILogger } from '../utils/Logger.js';
import { createLogger } from '../utils/Logger.js';

/**
 * Default colors for chart series (similar to Office theme accents).
 */
const DEFAULT_SERIES_COLORS: Rgba[] = [
  { r: 68, g: 114, b: 196, a: 255 },   // Blue
  { r: 237, g: 125, b: 49, a: 255 },   // Orange
  { r: 165, g: 165, b: 165, a: 255 },  // Gray
  { r: 255, g: 192, b: 0, a: 255 },    // Yellow
  { r: 91, g: 155, b: 213, a: 255 },   // Light Blue
  { r: 112, g: 173, b: 71, a: 255 },   // Green
  { r: 158, g: 72, b: 14, a: 255 },    // Dark Orange
  { r: 153, g: 115, b: 0, a: 255 },    // Dark Yellow
];

/**
 * Chart layout areas.
 */
interface ChartLayout {
  /** Area for the chart title */
  titleArea: Rect;
  /** Area for the legend */
  legendArea: Rect;
  /** Area for the actual chart (bars, lines, etc.) */
  plotArea: Rect;
  /** Area for X-axis labels */
  xAxisArea: Rect;
  /** Area for Y-axis labels */
  yAxisArea: Rect;
}

/**
 * Configuration for ChartRenderer.
 */
export interface ChartRendererConfig {
  /** Logger instance */
  logger?: ILogger;
}

/**
 * Layout constants for chart rendering.
 */
const LAYOUT = {
  titleHeight: 30,
  legendHeight: 25,
  axisLabelWidth: 50,
  axisLabelHeight: 25,
  padding: 10,
  barGap: 0.2, // Gap between bars as fraction of bar width
  fontSize: {
    title: 14,
    axis: 9,
    legend: 10,
  },
};

/**
 * Renders charts to canvas.
 */
export class ChartRenderer {
  private readonly logger: ILogger;

  constructor(config: ChartRendererConfig = {}) {
    this.logger = config.logger ?? createLogger('warn', 'ChartRenderer');
  }

  /**
   * Renders a chart to the canvas.
   * @param ctx Canvas 2D context
   * @param chartData Parsed chart data
   * @param bounds The bounds to render within
   */
  renderChart(ctx: CanvasRenderingContext2D, chartData: ChartData, bounds: Rect): void {
    if (chartData.series.length === 0) {
      this.logger.debug('No series data, skipping chart render');
      return;
    }

    this.logger.debug('Rendering chart', {
      type: chartData.type,
      seriesCount: chartData.series.length,
      categoryCount: chartData.categories.length,
    });

    // Calculate layout areas
    const layout = this.calculateLayout(chartData, bounds);

    // Fill background with white
    ctx.save();
    ctx.fillStyle = 'white';
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);

    // Render title if present
    if (chartData.title) {
      this.renderTitle(ctx, chartData.title, layout.titleArea);
    }

    // Render the chart based on type
    switch (chartData.type) {
      case 'bar':
      case 'stackedBar':
        this.renderBarChart(ctx, chartData, layout, true);
        break;

      case 'column':
      case 'stackedColumn':
        this.renderBarChart(ctx, chartData, layout, false);
        break;

      case 'line':
      case 'area':
        this.renderLineChart(ctx, chartData, layout);
        break;

      case 'pie':
        this.renderPieChart(ctx, chartData, layout);
        break;

      case 'scatter':
        // Scatter rendered as line for simplicity
        this.renderLineChart(ctx, chartData, layout);
        break;

      default:
        // Default to column chart
        this.renderBarChart(ctx, chartData, layout, false);
    }

    // Render legend if enabled
    if (chartData.showLegend && chartData.series.length > 0) {
      this.renderLegend(ctx, chartData, layout.legendArea);
    }

    ctx.restore();
  }

  /**
   * Calculates the layout areas for the chart.
   */
  private calculateLayout(chartData: ChartData, bounds: Rect): ChartLayout {
    let top = bounds.y + LAYOUT.padding;
    let bottom = bounds.y + bounds.height - LAYOUT.padding;
    let left = bounds.x + LAYOUT.padding;
    let right = bounds.x + bounds.width - LAYOUT.padding;

    const layout: ChartLayout = {
      titleArea: { x: left, y: top, width: 0, height: 0 },
      legendArea: { x: left, y: top, width: 0, height: 0 },
      plotArea: { x: left, y: top, width: 0, height: 0 },
      xAxisArea: { x: left, y: top, width: 0, height: 0 },
      yAxisArea: { x: left, y: top, width: 0, height: 0 },
    };

    // Reserve space for title
    if (chartData.title) {
      layout.titleArea = {
        x: left,
        y: top,
        width: right - left,
        height: LAYOUT.titleHeight,
      };
      top += LAYOUT.titleHeight;
    }

    // Reserve space for legend
    if (chartData.showLegend && chartData.series.length > 0) {
      const legendPos = chartData.legend?.position ?? 'bottom';

      if (legendPos === 'bottom') {
        layout.legendArea = {
          x: left,
          y: bottom - LAYOUT.legendHeight,
          width: right - left,
          height: LAYOUT.legendHeight,
        };
        bottom -= LAYOUT.legendHeight;
      } else if (legendPos === 'top') {
        layout.legendArea = {
          x: left,
          y: top,
          width: right - left,
          height: LAYOUT.legendHeight,
        };
        top += LAYOUT.legendHeight;
      } else if (legendPos === 'right') {
        const legendWidth = 100;
        layout.legendArea = {
          x: right - legendWidth,
          y: top,
          width: legendWidth,
          height: bottom - top,
        };
        right -= legendWidth;
      } else if (legendPos === 'left') {
        const legendWidth = 100;
        layout.legendArea = {
          x: left,
          y: top,
          width: legendWidth,
          height: bottom - top,
        };
        left += legendWidth;
      }
    }

    // Reserve space for axes (except pie charts)
    if (chartData.type !== 'pie') {
      // Y-axis labels on left
      layout.yAxisArea = {
        x: left,
        y: top,
        width: LAYOUT.axisLabelWidth,
        height: bottom - top - LAYOUT.axisLabelHeight,
      };
      left += LAYOUT.axisLabelWidth;

      // X-axis labels on bottom
      layout.xAxisArea = {
        x: left,
        y: bottom - LAYOUT.axisLabelHeight,
        width: right - left,
        height: LAYOUT.axisLabelHeight,
      };
      bottom -= LAYOUT.axisLabelHeight;
    }

    // Remaining area is the plot area
    layout.plotArea = {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };

    return layout;
  }

  /**
   * Renders the chart title.
   */
  private renderTitle(ctx: CanvasRenderingContext2D, title: string, area: Rect): void {
    ctx.save();
    ctx.font = `${LAYOUT.fontSize.title}px Calibri, Arial, sans-serif`;
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const x = area.x + area.width / 2;
    const y = area.y + area.height / 2;
    ctx.fillText(title, x, y);

    ctx.restore();
  }

  /**
   * Renders a bar or column chart.
   */
  private renderBarChart(
    ctx: CanvasRenderingContext2D,
    chartData: ChartData,
    layout: ChartLayout,
    isHorizontal: boolean
  ): void {
    if (chartData.categories.length === 0) return;

    const plotArea = layout.plotArea;
    const isStacked = chartData.type === 'stackedBar' || chartData.type === 'stackedColumn';

    // Calculate value range
    let minValue = 0;
    let maxValue: number;

    if (isStacked) {
      // For stacked charts, max is the sum of all series at each category
      maxValue = Math.max(
        ...chartData.categories.map((_, i) =>
          chartData.series.reduce(
            (sum, s) => sum + (i < s.values.length ? (s.values[i] ?? 0) : 0),
            0
          )
        )
      );
    } else {
      maxValue = Math.max(
        ...chartData.series.flatMap((s) => s.values),
        0
      );
    }

    // Ensure we have a range
    if (maxValue <= minValue) maxValue = minValue + 1;
    maxValue *= 1.1; // Add 10% padding

    const categoryCount = chartData.categories.length;
    const seriesCount = chartData.series.length;

    ctx.save();

    if (isHorizontal) {
      // Horizontal bar chart
      const barHeight = plotArea.height / categoryCount;
      const barGroupHeight = barHeight * (1 - LAYOUT.barGap);
      const singleBarHeight = isStacked ? barGroupHeight : barGroupHeight / seriesCount;

      for (let catIndex = 0; catIndex < categoryCount; catIndex++) {
        const categoryY = plotArea.y + catIndex * barHeight + (barHeight - barGroupHeight) / 2;

        if (isStacked) {
          let currentX = plotArea.x;
          for (let seriesIndex = 0; seriesIndex < seriesCount; seriesIndex++) {
            const series = chartData.series[seriesIndex];
            if (!series) continue;
            const value = catIndex < series.values.length ? (series.values[catIndex] ?? 0) : 0;
            const barWidth = (value / maxValue) * plotArea.width;
            const color = this.getSeriesColor(series, seriesIndex);

            ctx.fillStyle = this.rgbaToString(color);
            ctx.fillRect(currentX, categoryY, barWidth, singleBarHeight);
            currentX += barWidth;
          }
        } else {
          for (let seriesIndex = 0; seriesIndex < seriesCount; seriesIndex++) {
            const series = chartData.series[seriesIndex];
            if (!series) continue;
            const value = catIndex < series.values.length ? (series.values[catIndex] ?? 0) : 0;
            const barWidth = (value / maxValue) * plotArea.width;
            const color = this.getSeriesColor(series, seriesIndex);

            const barY = categoryY + seriesIndex * singleBarHeight;
            ctx.fillStyle = this.rgbaToString(color);
            ctx.fillRect(plotArea.x, barY, barWidth, singleBarHeight * 0.9);
          }
        }
      }

      // Render axes
      this.renderCategoryLabelsVertical(ctx, chartData.categories, layout.yAxisArea, plotArea);
      this.renderValueLabelsHorizontal(ctx, minValue, maxValue, layout.xAxisArea, plotArea);
    } else {
      // Vertical column chart
      const barWidth = plotArea.width / categoryCount;
      const barGroupWidth = barWidth * (1 - LAYOUT.barGap);
      const singleBarWidth = isStacked ? barGroupWidth : barGroupWidth / seriesCount;

      for (let catIndex = 0; catIndex < categoryCount; catIndex++) {
        const categoryX = plotArea.x + catIndex * barWidth + (barWidth - barGroupWidth) / 2;

        if (isStacked) {
          let currentY = plotArea.y + plotArea.height;
          for (let seriesIndex = 0; seriesIndex < seriesCount; seriesIndex++) {
            const series = chartData.series[seriesIndex];
            if (!series) continue;
            const value = catIndex < series.values.length ? (series.values[catIndex] ?? 0) : 0;
            const barHeight = (value / maxValue) * plotArea.height;
            const color = this.getSeriesColor(series, seriesIndex);

            ctx.fillStyle = this.rgbaToString(color);
            ctx.fillRect(categoryX, currentY - barHeight, singleBarWidth, barHeight);
            currentY -= barHeight;
          }
        } else {
          for (let seriesIndex = 0; seriesIndex < seriesCount; seriesIndex++) {
            const series = chartData.series[seriesIndex];
            if (!series) continue;
            const value = catIndex < series.values.length ? (series.values[catIndex] ?? 0) : 0;
            const barHeight = (value / maxValue) * plotArea.height;
            const color = this.getSeriesColor(series, seriesIndex);

            const barX = categoryX + seriesIndex * singleBarWidth;
            ctx.fillStyle = this.rgbaToString(color);
            ctx.fillRect(
              barX,
              plotArea.y + plotArea.height - barHeight,
              singleBarWidth * 0.9,
              barHeight
            );
          }
        }
      }

      // Render axes
      this.renderCategoryLabelsHorizontal(ctx, chartData.categories, layout.xAxisArea, plotArea);
      this.renderValueLabelsVertical(ctx, minValue, maxValue, layout.yAxisArea, plotArea);
    }

    // Draw axis lines
    ctx.strokeStyle = 'gray';
    ctx.lineWidth = 1;

    // X-axis
    ctx.beginPath();
    ctx.moveTo(plotArea.x, plotArea.y + plotArea.height);
    ctx.lineTo(plotArea.x + plotArea.width, plotArea.y + plotArea.height);
    ctx.stroke();

    // Y-axis
    ctx.beginPath();
    ctx.moveTo(plotArea.x, plotArea.y);
    ctx.lineTo(plotArea.x, plotArea.y + plotArea.height);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Renders a line chart.
   */
  private renderLineChart(
    ctx: CanvasRenderingContext2D,
    chartData: ChartData,
    layout: ChartLayout
  ): void {
    if (chartData.categories.length === 0) return;

    const plotArea = layout.plotArea;

    // Calculate value range
    const minValue = 0;
    let maxValue = Math.max(...chartData.series.flatMap((s) => s.values), 0);
    if (maxValue <= minValue) maxValue = minValue + 1;
    maxValue *= 1.1;

    const categoryCount = chartData.categories.length;
    const pointSpacing = plotArea.width / Math.max(1, categoryCount - 1);

    ctx.save();

    // Draw each series
    for (let seriesIndex = 0; seriesIndex < chartData.series.length; seriesIndex++) {
      const series = chartData.series[seriesIndex];
      if (!series) continue;
      const color = this.getSeriesColor(series, seriesIndex);

      const points: Array<{ x: number; y: number }> = [];

      for (let i = 0; i < series.values.length && i < categoryCount; i++) {
        const x = plotArea.x + i * pointSpacing;
        const yValue = series.values[i] ?? 0;
        const y = plotArea.y + plotArea.height - (yValue / maxValue) * plotArea.height;
        points.push({ x, y });
      }

      if (points.length > 1) {
        // Draw line
        ctx.strokeStyle = this.rgbaToString(color);
        ctx.lineWidth = 2;
        ctx.beginPath();
        const firstPoint = points[0];
        if (firstPoint) {
          ctx.moveTo(firstPoint.x, firstPoint.y);
          for (let i = 1; i < points.length; i++) {
            const pt = points[i];
            if (pt) {
              ctx.lineTo(pt.x, pt.y);
            }
          }
        }
        ctx.stroke();

        // Draw points
        ctx.fillStyle = this.rgbaToString(color);
        for (const point of points) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Render axes
    this.renderCategoryLabelsHorizontal(ctx, chartData.categories, layout.xAxisArea, plotArea);
    this.renderValueLabelsVertical(ctx, minValue, maxValue, layout.yAxisArea, plotArea);

    // Draw axis lines
    ctx.strokeStyle = 'gray';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(plotArea.x, plotArea.y + plotArea.height);
    ctx.lineTo(plotArea.x + plotArea.width, plotArea.y + plotArea.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(plotArea.x, plotArea.y);
    ctx.lineTo(plotArea.x, plotArea.y + plotArea.height);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Renders a pie chart.
   */
  private renderPieChart(
    ctx: CanvasRenderingContext2D,
    chartData: ChartData,
    layout: ChartLayout
  ): void {
    if (chartData.series.length === 0) return;

    const series = chartData.series[0];
    if (!series || series.values.length === 0) return;

    const plotArea = layout.plotArea;
    const centerX = plotArea.x + plotArea.width / 2;
    const centerY = plotArea.y + plotArea.height / 2;
    const radius = Math.min(plotArea.width, plotArea.height) / 2 * 0.9;

    const total = series.values.reduce((sum, v) => sum + v, 0);
    if (total <= 0) return;

    ctx.save();

    let currentAngle = -Math.PI / 2; // Start from top

    for (let i = 0; i < series.values.length; i++) {
      const value = series.values[i] ?? 0;
      const sweepAngle = (value / total) * Math.PI * 2;
      const color = this.getSeriesColor(undefined, i);

      // Draw pie slice
      ctx.fillStyle = this.rgbaToString(color);
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sweepAngle);
      ctx.closePath();
      ctx.fill();

      // Draw slice border
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1;
      ctx.stroke();

      currentAngle += sweepAngle;
    }

    ctx.restore();
  }

  /**
   * Renders the legend.
   */
  private renderLegend(
    ctx: CanvasRenderingContext2D,
    chartData: ChartData,
    area: Rect
  ): void {
    const boxSize = 12;
    const spacing = 10;
    const itemWidth = 80;

    let x = area.x + spacing;
    let y = area.y + (area.height - boxSize) / 2;

    ctx.save();

    for (let i = 0; i < chartData.series.length; i++) {
      const series = chartData.series[i];
      if (!series) continue;
      const color = this.getSeriesColor(series, i);

      // Draw color box
      ctx.fillStyle = this.rgbaToString(color);
      ctx.fillRect(x, y, boxSize, boxSize);

      // Draw label
      ctx.font = `${LAYOUT.fontSize.legend}px Arial, sans-serif`;
      ctx.fillStyle = 'black';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(this.truncateLabel(series.name, 10), x + boxSize + 4, y + boxSize / 2);

      x += itemWidth;
      if (x + itemWidth > area.x + area.width) {
        x = area.x + spacing;
        y += boxSize + 4;
      }
    }

    ctx.restore();
  }

  /**
   * Renders horizontal category labels (for column charts).
   */
  private renderCategoryLabelsHorizontal(
    ctx: CanvasRenderingContext2D,
    categories: string[],
    area: Rect,
    plotArea: Rect
  ): void {
    if (categories.length === 0) return;

    const labelWidth = plotArea.width / categories.length;

    ctx.save();
    ctx.font = `${LAYOUT.fontSize.axis}px Arial, sans-serif`;
    ctx.fillStyle = 'gray';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < categories.length; i++) {
      const x = plotArea.x + i * labelWidth + labelWidth / 2;
      const y = area.y + area.height / 2;
      ctx.fillText(this.truncateLabel(categories[i] ?? '', 10), x, y);
    }

    ctx.restore();
  }

  /**
   * Renders vertical category labels (for bar charts).
   */
  private renderCategoryLabelsVertical(
    ctx: CanvasRenderingContext2D,
    categories: string[],
    area: Rect,
    plotArea: Rect
  ): void {
    if (categories.length === 0) return;

    const labelHeight = plotArea.height / categories.length;

    ctx.save();
    ctx.font = `${LAYOUT.fontSize.axis}px Arial, sans-serif`;
    ctx.fillStyle = 'gray';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < categories.length; i++) {
      const x = area.x + area.width - 4;
      const y = plotArea.y + i * labelHeight + labelHeight / 2;
      ctx.fillText(this.truncateLabel(categories[i] ?? '', 8), x, y);
    }

    ctx.restore();
  }

  /**
   * Renders vertical value labels (Y-axis for column/line charts).
   */
  private renderValueLabelsVertical(
    ctx: CanvasRenderingContext2D,
    minValue: number,
    maxValue: number,
    area: Rect,
    plotArea: Rect
  ): void {
    const tickCount = 5;

    ctx.save();
    ctx.font = `${LAYOUT.fontSize.axis}px Arial, sans-serif`;
    ctx.fillStyle = 'gray';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= tickCount; i++) {
      const value = minValue + ((maxValue - minValue) * i) / tickCount;
      const y = plotArea.y + plotArea.height - (i * plotArea.height) / tickCount;
      const x = area.x + area.width - 4;
      ctx.fillText(this.formatValue(value), x, y);
    }

    ctx.restore();
  }

  /**
   * Renders horizontal value labels (X-axis for bar charts).
   */
  private renderValueLabelsHorizontal(
    ctx: CanvasRenderingContext2D,
    minValue: number,
    maxValue: number,
    area: Rect,
    plotArea: Rect
  ): void {
    const tickCount = 5;

    ctx.save();
    ctx.font = `${LAYOUT.fontSize.axis}px Arial, sans-serif`;
    ctx.fillStyle = 'gray';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= tickCount; i++) {
      const value = minValue + ((maxValue - minValue) * i) / tickCount;
      const x = plotArea.x + (i * plotArea.width) / tickCount;
      const y = area.y + area.height / 2;
      ctx.fillText(this.formatValue(value), x, y);
    }

    ctx.restore();
  }

  /**
   * Gets the color for a series.
   */
  private getSeriesColor(series: ChartSeries | undefined, index: number): Rgba {
    if (series?.color) {
      return series.color;
    }
    const defaultColor = DEFAULT_SERIES_COLORS[index % DEFAULT_SERIES_COLORS.length];
    // Fallback to first color if somehow undefined (should never happen)
    return defaultColor ?? DEFAULT_SERIES_COLORS[0] ?? { r: 68, g: 114, b: 196, a: 255 };
  }

  /**
   * Converts RGBA to CSS color string.
   */
  private rgbaToString(color: Rgba): string {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
  }

  /**
   * Truncates a label to max length.
   */
  private truncateLabel(label: string, maxLength: number): string {
    if (!label) return '';
    if (label.length <= maxLength) return label;
    return label.substring(0, maxLength - 1) + '...';
  }

  /**
   * Formats a numeric value for display.
   */
  private formatValue(value: number): string {
    if (Math.abs(value) >= 1_000_000) {
      return (value / 1_000_000).toFixed(1) + 'M';
    }
    if (Math.abs(value) >= 1_000) {
      return (value / 1_000).toFixed(1) + 'K';
    }
    if (Math.abs(value) < 1 && value !== 0) {
      return value.toFixed(2);
    }
    return value.toFixed(0);
  }
}

/**
 * Creates a ChartRenderer instance.
 */
export function createChartRenderer(logger?: ILogger): ChartRenderer {
  return new ChartRenderer({ logger });
}
