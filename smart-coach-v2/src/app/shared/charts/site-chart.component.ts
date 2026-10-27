import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, signal } from '@angular/core';
import { BarChart, LineChart } from 'echarts/charts';
import { AriaComponent, GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import { formatChartValue, readSiteChartTheme, SiteChartKind, SiteChartPoint, siteChartOptions, SiteChartTheme } from './site-chart.theme';

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, AriaComponent, SVGRenderer]);

@Component({
  selector: 'app-site-chart',
  standalone: true,
  imports: [NgxEchartsDirective],
  providers: [provideEchartsCore({ echarts })],
  templateUrl: './site-chart.component.html',
  styleUrl: './site-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SiteChartComponent {
  readonly points = input.required<readonly SiteChartPoint[]>();
  readonly label = input.required<string>();
  readonly unit = input('');
  readonly currency = input('');
  readonly kind = input<SiteChartKind>('line');
  readonly theme = signal<SiteChartTheme | null>(null);
  readonly initOptions = { renderer: 'svg', useCoarsePointer: true };
  readonly options = computed(() => {
    const theme = this.theme();
    return theme ? siteChartOptions(this.points(), this.label(), this.unit(), this.currency(), this.kind(), theme) : {};
  });

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const refresh = () => {
        if (destroy.destroyed) return;
        const next = readSiteChartTheme(host.nativeElement);
        if (JSON.stringify(next) !== JSON.stringify(this.theme())) this.theme.set(next);
      };
      const motion = matchMedia('(prefers-reduced-motion: reduce)');
      refresh();
      void document.fonts.ready.then(refresh);
      window.addEventListener('resize', refresh);
      motion.addEventListener('change', refresh);
      destroy.onDestroy(() => {
        window.removeEventListener('resize', refresh);
        motion.removeEventListener('change', refresh);
      });
    });
  }

  formatValue(value: number): string {
    return formatChartValue(value, this.unit(), this.currency());
  }
}
