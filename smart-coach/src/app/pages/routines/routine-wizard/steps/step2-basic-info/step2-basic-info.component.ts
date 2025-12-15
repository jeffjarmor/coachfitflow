import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RoutineService } from '../../../../../services/routine.service';

@Component({
  selector: 'app-step2-basic-info',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="step-container">
      <h2>Detalles de la Rutina</h2>
      <p class="subtitle">Establece la información básica para esta rutina</p>

      <form [formGroup]="form">
        <div class="form-group">
          <label for="name">Nombre de la Rutina *</label>
          <input 
            id="name" 
            type="text" 
            formControlName="name" 
            placeholder="ej. Hipertrofia 4 Semanas Fase 1"
          >
        </div>

        <div class="form-group">
          <label for="objective">Objetivo / Meta</label>
          <input 
            id="objective" 
            type="text" 
            formControlName="objective" 
            placeholder="ej. Ganar masa muscular y fuerza"
          >
        </div>

        <div class="form-group">
          <label for="daysCount">Número de Días de Entrenamiento *</label>
          <select id="daysCount" formControlName="daysCount">
            <option [value]="1">1 Día</option>
            <option [value]="2">2 Días</option>
            <option [value]="3">3 Días</option>
            <option [value]="4">4 Días</option>
            <option [value]="5">5 Días</option>
            <option [value]="6">6 Días</option>
            <option [value]="7">7 Días</option>
          </select>
          <p class="hint">¿Cuántos días de entrenamiento únicos en esta división?</p>
        </div>

        <div class="form-group">
          <label for="durationWeeks">Duración de la Rutina (Semanas) *</label>
          <input 
            id="durationWeeks" 
            type="number" 
            formControlName="durationWeeks" 
            min="1" 
            max="12"
          >
          <p class="hint">Máximo 12 semanas.</p>
        </div>

        <div class="form-group">
          <label for="notes">Notas Generales</label>
          <textarea 
            id="notes" 
            formControlName="notes" 
            rows="4" 
            placeholder="Cualquier instrucción general para el cliente..."
          ></textarea>
        </div>
      </form>
    </div>
  `,
  styleUrls: ['./step2-basic-info.component.scss']
})
export class Step2BasicInfoComponent {
  private routineService = inject(RoutineService);
  private fb = inject(FormBuilder);

  form = this.fb.group({
    name: ['', Validators.required],
    objective: [''],
    daysCount: [3, [Validators.required, Validators.min(1), Validators.max(7)]],
    durationWeeks: [4, [Validators.required, Validators.min(1), Validators.max(12)]],
    notes: ['']
  });

  constructor() {
    // Load existing state
    const state = this.routineService.wizardState();
    this.form.patchValue({
      name: state.routineName,
      objective: state.objective,
      daysCount: state.daysCount || 3,
      durationWeeks: state.durationWeeks || 4,
      notes: state.notes
    });

    // Subscribe to changes and update state
    this.form.valueChanges.subscribe(value => {
      const updates: any = {
        routineName: value.name || '',
        objective: value.objective || '',
        daysCount: Number(value.daysCount) || 3, // Convert to number!
        durationWeeks: Number(value.durationWeeks) || 4, // Convert to number!
        notes: value.notes || ''
      };

      // Initialize days array when daysCount changes
      const currentState = this.routineService.wizardState();
      const newDaysCount = Number(value.daysCount) || 3; // Convert to number!

      if (currentState.daysCount !== newDaysCount) {
        // Create new days array with the correct length
        updates.days = Array.from({ length: newDaysCount }, (_, i) => {
          // Preserve existing day data if available
          const existingDay = currentState.days[i];
          return existingDay || {
            muscleGroups: [],
            exercises: []
          };
        });
      }

      this.routineService.updateWizardState(updates);
    });
  }
}
