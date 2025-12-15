import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RoutineService } from '../../../../../services/routine.service';
import { MUSCLE_GROUPS } from '../../../../../utils/muscle-groups';

@Component({
  selector: 'app-step3-muscle-groups',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="step-container">
      <h2>Asignar Grupos Musculares</h2>
      <p class="subtitle">Selecciona los grupos musculares objetivo para cada día de entrenamiento</p>

      <div class="days-grid">
        <div *ngFor="let day of days(); let i = index" class="day-card">
          <div class="day-header">
            <h3>Día {{ i + 1 }}</h3>
            <span class="badge" *ngIf="day.muscleGroups.length > 0">
              {{ day.muscleGroups.length }} Seleccionados
            </span>
          </div>

          <div class="muscle-groups">
            <div 
              *ngFor="let group of muscleGroups" 
              class="muscle-chip"
              [class.selected]="day.muscleGroups.includes(group)"
              (click)="toggleMuscleGroup(i, group)"
            >
              {{ group }}
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./step3-muscle-groups.component.scss']
})
export class Step3MuscleGroupsComponent {
  private routineService = inject(RoutineService);

  muscleGroups = MUSCLE_GROUPS;
  days = computed(() => this.routineService.wizardState().days);

  toggleMuscleGroup(dayIndex: number, group: string) {
    const currentDays = [...this.routineService.wizardState().days];
    const day = { ...currentDays[dayIndex] };
    const groups = [...day.muscleGroups];

    if (groups.includes(group)) {
      day.muscleGroups = groups.filter(g => g !== group);
    } else {
      day.muscleGroups = [...groups, group];
    }

    currentDays[dayIndex] = day;
    this.routineService.updateWizardState({ days: currentDays });
  }
}
