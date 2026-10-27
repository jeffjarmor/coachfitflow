import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts';
import type { AriaComponentOption, GridComponentOption, TooltipComponentOption } from 'echarts/components';
import type { ComposeOption } from 'echarts/core';

export interface SiteChartPoint {
  date: string;
  label: string;
  value: number;
}

export type SiteChartKind = 'line' | 'bar';
export type SiteChartOption = ComposeOption<LineSeriesOption | BarSeriesOption | GridComponentOption | TooltipComponentOption | AriaComponentOption>;

export interface SiteChartTheme {
  ink: string;
  muted: string;
  accent: string;
  accentEmphasis: string;
  line: string;
  surface: string;
  fontFamily: string;
  fontSize: number;
  gap: number;
  radius: number;
  reducedMotion: boolean;
}

export function readSiteChartTheme(element: HTMLElement): SiteChartTheme {
  const style = getComputedStyle(element);
  const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  const token = (name: string) => style.getPropertyValue(name).trim();
  const pixels = (name: string) => {
    const value = token(name);
    return Number.parseFloat(value) * (value.endsWith('rem') ? rootSize : 1);
  };
  return {
    ink: token('--zm-ink'), muted: token('--zm-muted'), accent: token('--zm-accent'),
    accentEmphasis: token('--zm-accent-emphasis'), line: token('--zm-line'), surface: token('--zm-surface'),
    fontFamily: style.fontFamily, fontSize: pixels('--zm-type-meta-size'),
    gap: pixels('--zm-grid-gap'), radius: pixels('--zm-radius-control'),
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
  };
}

export function formatChartValue(value: number, unit: string, currency: string, compact = false): string {
  const options: Intl.NumberFormatOptions = {
    maximumFractionDigits: 2,
    ...(compact ? { notation: 'compact' } : {}),
    ...(currency ? { style: 'currency', currency } : {})
  };
  const formatted = new Intl.NumberFormat('es-CR', options).format(value);
  return unit && !currency ? `${formatted} ${unit}` : formatted;
}

export function siteChartOptions(points: readonly SiteChartPoint[], name: string, unit: string, currency: string, kind: SiteChartKind, theme: SiteChartTheme): SiteChartOption {
  const line = kind === 'line';
  const dates = new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short' });
  const fullDates = new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'long', year: 'numeric' });
  const timestamp = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`).getTime();
  const format = (value: number, compact = false) => formatChartValue(value, unit, currency, compact);
  return {
    backgroundColor: 'transparent',
    color: [theme.accentEmphasis],
    textStyle: { fontFamily: theme.fontFamily, fontSize: theme.fontSize, color: theme.ink },
    animation: !theme.reducedMotion,
    animationDuration: 400,
    animationDurationUpdate: 280,
    animationEasing: 'cubicOut',
    aria: { enabled: true, label: { enabled: true, description: `${name}. ${points.length} registros. Los valores exactos están disponibles en Ver datos de la gráfica.` } },
    grid: { left: theme.gap / 2, right: theme.gap, top: theme.gap, bottom: theme.gap / 2, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    tooltip: {
      trigger: 'axis', renderMode: 'richText', confine: true,
      backgroundColor: theme.surface, borderColor: theme.line, borderWidth: 1,
      padding: [theme.gap / 2, theme.gap * 2 / 3],
      textStyle: { color: theme.ink, fontFamily: theme.fontFamily, fontSize: theme.fontSize },
      axisPointer: { type: line ? 'line' : 'shadow', lineStyle: { color: theme.muted, type: 'dashed' }, shadowStyle: { color: theme.line, opacity: .4 } },
      formatter: parameters => {
        const item = Array.isArray(parameters) ? parameters[0] : parameters;
        const point = points[item?.dataIndex];
        if (!point) return '';
        const date = line ? fullDates.format(new Date(timestamp(point.date))) : point.label;
        return `${date}\n${name}: ${format(point.value)}`;
      }
    },
    xAxis: line ? {
      type: 'time', boundaryGap: ['2%', '2%'], splitNumber: 4,
      axisLine: { lineStyle: { color: theme.line } }, axisTick: { show: false }, splitLine: { show: false },
      axisLabel: { color: theme.muted, fontSize: theme.fontSize, hideOverlap: true, margin: theme.gap / 2, formatter: value => dates.format(new Date(value)) }
    } : {
      type: 'category', data: points.map(point => point.label),
      axisLine: { lineStyle: { color: theme.line } }, axisTick: { show: false },
      axisLabel: { color: theme.muted, fontSize: theme.fontSize, hideOverlap: true, margin: theme.gap / 2 }
    },
    yAxis: {
      type: 'value', scale: line, splitNumber: 4,
      boundaryGap: line ? ['10%', '10%'] : [0, 0],
      minInterval: !line && !currency && !unit ? 1 : undefined,
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: theme.line, type: 'dashed' } },
      axisLabel: { color: theme.muted, fontSize: theme.fontSize, formatter: value => format(value, !!currency) }
    },
    series: line ? [{
      name, type: 'line', data: points.map(point => [timestamp(point.date), point.value]),
      smooth: false, symbol: 'circle', symbolSize: 8, showSymbol: true,
      lineStyle: { color: theme.accentEmphasis, width: 3 },
      itemStyle: { color: theme.accent, borderColor: theme.ink, borderWidth: 2 },
      areaStyle: { color: theme.accent, opacity: .12 },
      emphasis: { scale: 1.4, focus: 'series' }
    }] : [{
      name, type: 'bar', data: points.map(point => point.value), barMaxWidth: 48,
      itemStyle: { color: theme.ink, borderRadius: [theme.radius / 2, theme.radius / 2, 0, 0] },
      emphasis: { itemStyle: { color: theme.accentEmphasis } }
    }]
  };
}
