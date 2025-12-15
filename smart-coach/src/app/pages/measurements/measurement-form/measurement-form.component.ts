import { Component, inject, signal, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CreateMeasurementData } from '../../../models/measurement.model';

@Component({
    selector: 'app-measurement-form',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './measurement-form.component.html',
    styleUrls: ['./measurement-form.component.scss']
})
export class MeasurementFormComponent {
    private fb = inject(FormBuilder);

    clientId = input.required<string>();
    routineId = input<string>();

    onSave = output<CreateMeasurementData>();
    onCancel = output<void>();

    form: FormGroup;
    calculatedBMI = signal<number | null>(null);

    constructor() {
        this.form = this.fb.group({
            weight: [null, [Validators.required, Validators.min(20), Validators.max(300)]],
            height: [null, [Validators.required, Validators.min(100), Validators.max(250)]],
            bodyFatPercentage: [null, [Validators.min(0), Validators.max(100)]],
            muscleMass: [null, [Validators.min(0)]],
            visceralFat: [null, [Validators.min(0)]],
            metabolicAge: [null, [Validators.min(10), Validators.max(100)]],
            notes: ['']
        });

        // Auto-calculate BMI when weight or height changes
        this.form.get('weight')?.valueChanges.subscribe(() => this.calculateBMI());
        this.form.get('height')?.valueChanges.subscribe(() => this.calculateBMI());
    }

    calculateBMI(): void {
        const weight = this.form.get('weight')?.value;
        const height = this.form.get('height')?.value;

        if (weight && height) {
            const heightInMeters = height / 100;
            const bmi = weight / (heightInMeters * heightInMeters);
            this.calculatedBMI.set(Math.round(bmi * 10) / 10);
        } else {
            this.calculatedBMI.set(null);
        }
    }

    getBMICategory(bmi: number): string {
        if (bmi < 18.5) return 'Bajo peso';
        if (bmi < 25) return 'Normal';
        if (bmi < 30) return 'Sobrepeso';
        return 'Obesidad';
    }

    getBMIColor(bmi: number): string {
        if (bmi < 18.5) return '#f59e0b';
        if (bmi < 25) return '#10b981';
        if (bmi < 30) return '#f59e0b';
        return '#ef4444';
    }

    handleSubmit(): void {
        if (this.form.valid && this.calculatedBMI()) {
            const formValue = this.form.value;
            const measurementData: CreateMeasurementData = {
                clientId: this.clientId(),
                routineId: this.routineId(),
                date: new Date(),
                weight: formValue.weight,
                height: formValue.height,
                bmi: this.calculatedBMI()!,
                bodyFatPercentage: formValue.bodyFatPercentage || undefined,
                muscleMass: formValue.muscleMass || undefined,
                visceralFat: formValue.visceralFat || undefined,
                metabolicAge: formValue.metabolicAge || undefined,
                notes: formValue.notes || undefined
            };

            this.onSave.emit(measurementData);
            this.form.reset();
            this.calculatedBMI.set(null);
        }
    }

    handleCancel(): void {
        this.onCancel.emit();
    }
}
