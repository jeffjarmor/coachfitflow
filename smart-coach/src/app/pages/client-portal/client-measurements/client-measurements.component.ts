import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { GymClientService } from '../../../services/gym-client.service';
import { Measurement } from '../../../models/measurement.model';

@Component({
    selector: 'app-client-measurements',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './client-measurements.component.html',
    styleUrls: ['./client-measurements.component.scss']
})
export class ClientMeasurementsComponent implements OnInit {
    private authService = inject(AuthService);
    private gymClientSvc = inject(GymClientService);
    private router = inject(Router);

    profile = this.authService.gymClientProfile;
    measurements = signal<Measurement[]>([]);
    loading = signal(true);
    selectedMetric = signal<'weight' | 'bodyFat' | 'muscleMass'>('weight');

    async ngOnInit() {
        let p = this.profile();
        if (!p) {
            p = await this.waitForProfile();
        }
        if (!p) { this.router.navigate(['/login']); return; }

        const list = await this.gymClientSvc.getMyMeasurementsForProfile(p);
        this.measurements.set(list);
        this.loading.set(false);
    }

    private waitForProfile(): Promise<typeof this.profile extends () => infer T ? T : never> {
        return new Promise(resolve => {
            let attempts = 0;
            const interval = setInterval(() => {
                const p = this.profile();
                if (p || attempts >= 25) {
                    clearInterval(interval);
                    resolve(p as any);
                }
                attempts++;
            }, 100);
        });
    }

    formatDate(d: any): string {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    }

    getLatestMeasurement(): Measurement | null {
        const measurements = this.measurements();
        return measurements.length > 0 ? measurements[0] : null;
    }

    getMetricChange(metric: 'weight' | 'bodyFatPercentage' | 'muscleMass'): { value: number; isPositive: boolean } | null {
        const measurements = this.measurements();
        if (measurements.length < 2) return null;

        const latest = measurements[0][metric];
        const previous = measurements[1][metric];

        if (latest === undefined || previous === undefined) return null;

        const change = latest - previous;
        const isPositive = metric === 'muscleMass' ? change > 0 : change < 0;

        return { value: Math.abs(change), isPositive };
    }

    getChartData(metric: 'weight' | 'bodyFatPercentage' | 'muscleMass'): { date: string; value: number }[] {
        return this.measurements()
            .filter(m => m[metric] !== undefined)
            .reverse()
            .map(m => ({
                date: new Date(m.date).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }),
                value: m[metric]!
            }));
    }

    getMaxValue(metric: 'weight' | 'bodyFatPercentage' | 'muscleMass'): number {
        const values = this.measurements()
            .filter(m => m[metric] !== undefined)
            .map(m => m[metric]!);
        return values.length > 0 ? Math.max(...values) : 100;
    }

    selectMetric(metric: 'weight' | 'bodyFat' | 'muscleMass') {
        this.selectedMetric.set(metric);
    }

    getMetricKey(metric: 'weight' | 'bodyFat' | 'muscleMass'): 'weight' | 'bodyFatPercentage' | 'muscleMass' {
        const keys = {
            weight: 'weight' as const,
            bodyFat: 'bodyFatPercentage' as const,
            muscleMass: 'muscleMass' as const
        };
        return keys[metric];
    }

    getBmiCategory(bmi: number): { label: string; cls: string } {
        if (bmi < 18.5) return { label: 'Bajo peso', cls: 'bmi-low' };
        if (bmi < 25) return { label: 'Normal', cls: 'bmi-ok' };
        if (bmi < 30) return { label: 'Sobrepeso', cls: 'bmi-warn' };
        return { label: 'Obesidad', cls: 'bmi-high' };
    }
}
