import { SiteChartPoint } from './site-chart.theme';

export type MeasurementMetric = 'weight' | 'bodyFatPercentage' | 'muscleMass';
type Measurement = { date: string } & Partial<Record<MeasurementMetric, number | null>>;

export function measurementChartPoints(measurements: readonly Measurement[], metric: MeasurementMetric, limit: number): SiteChartPoint[] {
  const dates = new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', year: 'numeric' });
  return measurements.flatMap(measurement => {
    const value = measurement[metric];
    const date = measurement.date.slice(0, 10);
    const parsed = new Date(`${date}T12:00:00`);
    return value == null || !Number.isFinite(Number(value)) || !Number.isFinite(parsed.getTime())
      ? [] : [{ date, value: Number(value), label: dates.format(parsed) }];
  }).sort((a, b) => a.date.localeCompare(b.date)).slice(-limit);
}
