import { Component, inject, input, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { RoutineService } from '../../../services/routine.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { ConfirmService } from '../../../services/confirm.service';
import { Routine } from '../../../models/routine.model';
import { ButtonComponent } from '../../../components/ui/button/button.component';

import { CoachService } from '../../../services/coach.service';

@Component({
  selector: 'app-routine-list',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonComponent],
  template: `
    <div class="routines-section">
      <div class="header">
        <h3>Rutinas de Entrenamiento</h3>
        <app-button routerLink="/routines/new" variant="primary" size="small">
          + Nueva Rutina
        </app-button>
      </div>

      <div *ngIf="loading()" class="loading-state">
        Cargando rutinas...
      </div>

      <div *ngIf="!loading() && routines().length === 0" class="empty-state">
        <p>No se encontraron rutinas para este cliente.</p>
        <app-button routerLink="/routines/new" variant="outline" size="small">
          Crear Primera Rutina
        </app-button>
      </div>

      <div *ngIf="!loading() && routines().length > 0" class="routines-grid">
        <div *ngFor="let routine of routines()" class="routine-card">
          <div class="card-content">
            <h4>{{ routine.name }}</h4>
            <p class="objective">{{ routine.objective }}</p>
            <div class="meta">
              <span class="badge">{{ routine.trainingDaysCount }} Días/Semana</span>
              <span class="date">Actualizado: {{ routine.updatedAt | date:'mediumDate' }}</span>
            </div>
          </div>
          
          <div class="card-actions">
            <app-button [routerLink]="['/routines', routine.id]" variant="outline" size="small">
              Ver
            </app-button>
            <button class="icon-btn delete" (click)="deleteRoutine(routine)">
              🗑️
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    @import 'styles/variables';
    @import 'styles/mixins';

    .routines-section {
      margin-top: $spacing-8;
    }

    .header {
      @include flex-between;
      margin-bottom: $spacing-4;
      
      h3 {
        font-size: $font-size-lg;
        color: $text-primary;
        font-weight: $font-weight-bold;
      }
    }

    .loading-state, .empty-state {
      text-align: center;
      padding: $spacing-8;
      background: $neutral-50;
      border-radius: $radius-lg;
      color: $text-secondary;
      border: 1px dashed $border-medium;
    }

    .empty-state {
      p { margin-bottom: $spacing-4; }
    }

    .routines-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: $spacing-4;
    }

    .routine-card {
      background: $bg-primary;
      border: 1px solid $border-light;
      border-radius: $radius-lg;
      padding: $spacing-4;
      transition: all $transition-base;
      @include flex-between;

      &:hover {
        transform: translateY(-2px);
        box-shadow: $shadow-md;
        border-color: $primary-200;
      }

      .card-content {
        flex: 1;
        
        h4 {
          font-size: $font-size-base;
          font-weight: $font-weight-semibold;
          color: $text-primary;
          margin-bottom: $spacing-1;
        }
        
        .objective {
          font-size: $font-size-sm;
          color: $text-secondary;
          margin-bottom: $spacing-3;
          @include truncate;
        }
        
        .meta {
          display: flex;
          gap: $spacing-3;
          align-items: center;
          
          .badge {
            font-size: $font-size-xs;
            background: $primary-50;
            color: $primary-700;
            padding: 2px 8px;
            border-radius: $radius-full;
          }
          
          .date {
            font-size: 10px;
            color: $text-tertiary;
          }
        }
      }

      .card-actions {
        display: flex;
        flex-direction: column;
        gap: $spacing-2;
        margin-left: $spacing-4;
        
        .icon-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: $font-size-lg;
          opacity: 0.5;
          transition: opacity $transition-base;
          
          &:hover { opacity: 1; }
          &.delete:hover { color: $error; }
        }
      }
    }
  `]
})
export class RoutineListComponent implements OnInit {
  clientId = input.required<string>();

  private routineService = inject(RoutineService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private confirmService = inject(ConfirmService);
  private coachService = inject(CoachService); // Inject CoachService

  routines = signal<Routine[]>([]);
  loading = signal<boolean>(true);

  async ngOnInit() {
    await this.loadRoutines();
  }

  async loadRoutines() {
    const coachId = this.authService.getCurrentUserId();
    if (!coachId) return;

    try {
      this.loading.set(true);

      // Get coach profile to determine gymId
      const coach = await this.coachService.getCoachProfile(coachId);
      const gymId = coach?.gymId;

      // Pass gymId to get routines from correct path
      const data = await this.routineService.getClientRoutines(coachId, this.clientId(), gymId);
      this.routines.set(data);
    } catch (error) {
      console.error('Error loading routines:', error);
    } finally {
      this.loading.set(false);
    }
  }

  async deleteRoutine(routine: Routine) {
    const confirmed = await this.confirmService.confirm({
      title: '¿Eliminar rutina?',
      message: '¿Estás seguro de que quieres eliminar esta rutina? Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (!confirmed) return;

    const coachId = this.authService.getCurrentUserId();
    if (!coachId) return;

    try {
      // Get coach profile to determine gymId
      const coach = await this.coachService.getCoachProfile(coachId);
      const gymId = coach?.gymId;

      await this.routineService.deleteRoutine(coachId, routine.id, gymId);
      await this.loadRoutines();
      this.toastService.success('Rutina eliminada correctamente');
    } catch (error) {
      console.error('Error deleting routine:', error);
      this.toastService.error('Error al eliminar la rutina');
    }
  }
}

