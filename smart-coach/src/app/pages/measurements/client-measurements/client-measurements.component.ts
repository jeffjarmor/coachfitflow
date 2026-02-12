import { Component, inject, signal, input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MeasurementService } from '../../../services/measurement.service';
import { AuthService } from '../../../services/auth.service';
import { CoachService } from '../../../services/coach.service';
import { ToastService } from '../../../services/toast.service';
import { ConfirmService } from '../../../services/confirm.service';
import { Measurement, CreateMeasurementData } from '../../../models/measurement.model';
import { MeasurementFormComponent } from '../measurement-form/measurement-form.component';

@Component({
    selector: 'app-client-measurements',
    standalone: true,
    imports: [CommonModule, MeasurementFormComponent],
    templateUrl: './client-measurements.component.html',
    styleUrls: ['./client-measurements.component.scss']
})
export class ClientMeasurementsComponent implements OnInit {
    private measurementService = inject(MeasurementService);
    private authService = inject(AuthService);
    private toastService = inject(ToastService);
    private confirmService = inject(ConfirmService);
    private coachService = inject(CoachService); // Inject CoachService

    clientId = input.required<string>();
    clientName = input<string>('Cliente');

    measurements = signal<Measurement[]>([]);
    loading = signal<boolean>(true);
    showForm = signal<boolean>(false);
    editingMeasurement = signal<Measurement | null>(null);
    selectedMetric = signal<'weight' | 'bodyFat' | 'muscleMass'>('weight');

    async ngOnInit() {
        await this.loadMeasurements();
    }

    async loadMeasurements() {
        const coachId = this.authService.getCurrentUserId();
        if (!coachId) return;

        try {
            this.loading.set(true);

            // Get coach profile to determine gymId (for gym owners/coaches)
            const coachProfile = await this.coachService.getCoachProfile(coachId);
            const gymId = coachProfile?.gymId;

            const data = await this.measurementService.getClientMeasurements(coachId, this.clientId(), gymId || undefined);
            this.measurements.set(data);
        } catch (error) {
            console.error('Error loading measurements:', error);
        } finally {
            this.loading.set(false);
        }
    }

    async handleSaveMeasurement(data: CreateMeasurementData) {
        const coachId = this.authService.getCurrentUserId();
        if (!coachId) return;

        try {
            // Get coach profile to determine gymId
            const coachProfile = await this.coachService.getCoachProfile(coachId);
            const gymId = coachProfile?.gymId;

            const editingMeasurement = this.editingMeasurement();
            if (editingMeasurement && editingMeasurement.id) {
                // Update existing measurement
                await this.measurementService.updateMeasurement(coachId, this.clientId(), editingMeasurement.id, data, gymId || undefined);
                this.toastService.success('Medición actualizada correctamente');
            } else {
                // Create new measurement
                await this.measurementService.addMeasurement(coachId, data, gymId || undefined);
                this.toastService.success('Medición guardada correctamente');
            }
            await this.loadMeasurements();
            this.showForm.set(false);
            this.editingMeasurement.set(null);
        } catch (error) {
            console.error('Error saving measurement:', error);
            this.toastService.error('Error al guardar la medición');
        }
    }

    handleEditMeasurement(measurement: Measurement) {
        this.editingMeasurement.set(measurement);
        this.showForm.set(true);
    }

    async deleteMeasurement(measurementId: string) {
        const coachId = this.authService.getCurrentUserId();
        if (!coachId) return;

        const confirmed = await this.confirmService.confirm({
            title: '¿Eliminar medición?',
            message: '¿Estás seguro de eliminar esta medición?',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            type: 'danger'
        });

        if (!confirmed) return;

        try {
            // Get coach profile to determine gymId
            const coachProfile = await this.coachService.getCoachProfile(coachId);
            const gymId = coachProfile?.gymId;

            await this.measurementService.deleteMeasurement(coachId, this.clientId(), measurementId, gymId || undefined);
            await this.loadMeasurements();
            this.toastService.success('Medición eliminada correctamente');
        } catch (error) {
            console.error('Error deleting measurement:', error);
            this.toastService.error('Error al eliminar la medición');
        }
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
                date: new Date(m.date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }),
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

    getMetricLabel(metric: 'weight' | 'bodyFat' | 'muscleMass'): string {
        const labels = {
            weight: 'Peso (kg)',
            bodyFat: '% Grasa Corporal',
            muscleMass: 'Masa Muscular (kg)'
        };
        return labels[metric];
    }

    getMetricKey(metric: 'weight' | 'bodyFat' | 'muscleMass'): 'weight' | 'bodyFatPercentage' | 'muscleMass' {
        const keys = {
            weight: 'weight' as const,
            bodyFat: 'bodyFatPercentage' as const,
            muscleMass: 'muscleMass' as const
        };
        return keys[metric];
    }
}
