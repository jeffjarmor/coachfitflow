import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExerciseService } from '../../../services/exercise.service';
import { ConfirmService } from '../../../services/confirm.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { SPANISH_EXERCISES } from '../../../utils/spanish-exercises';

@Component({
  selector: 'app-global-exercise-admin',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  template: `
    <div class="page-container">
      <header class="page-header">
        <div class="header-content">
          <h1>Administración Global de Ejercicios</h1>
          <p>Gestionar la biblioteca global de ejercicios</p>
        </div>
      </header>

      <div class="page-content">
        <div class="admin-card">
          <h2>Datos de Semilla</h2>
          <p>Poblar la biblioteca global con {{ seedExercises.length }} ejercicios predeterminados.</p>
          
          <div class="stats">
            <div class="stat">
              <span class="label">Total de Ejercicios:</span>
              <span class="value">{{ seedExercises.length }}</span>
            </div>
          </div>

          <div class="actions">
            <app-button 
              (click)="seedData()" 
              [loading]="loading()"
              [disabled]="loading()"
              variant="primary"
            >
              Poblar Biblioteca Global
            </app-button>
          </div>

          <div *ngIf="message()" class="message" [class.error]="isError()">
            {{ message() }}
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    @import 'styles/variables';
    @import 'styles/mixins';

    .page-container {
      min-height: 100vh;
      background: $bg-secondary;
    }

    .page-header {
      background: $bg-primary;
      padding: $spacing-8 0;
      border-bottom: 1px solid $border-light;
      
      .header-content {
        @include container;
        
        h1 {
          font-size: $font-size-3xl;
          color: $text-primary;
          margin-bottom: $spacing-2;
        }
        
        p {
          color: $text-secondary;
        }
      }
    }

    .page-content {
      @include container;
      padding-top: $spacing-8;
    }

    .admin-card {
      @include card;
      padding: $spacing-8;
      max-width: 600px;
      margin: 0 auto;
      text-align: center;
      
      h2 {
        font-size: $font-size-xl;
        margin-bottom: $spacing-4;
        color: $text-primary;
      }
      
      p {
        color: $text-secondary;
        margin-bottom: $spacing-6;
      }
      
      .stats {
        background: $neutral-100;
        padding: $spacing-4;
        border-radius: $radius-lg;
        margin-bottom: $spacing-8;
        
        .stat {
          display: flex;
          justify-content: center;
          gap: $spacing-2;
          font-weight: $font-weight-medium;
          
          .label { color: $text-secondary; }
          .value { color: $primary-600; }
        }
      }
      
      .message {
        margin-top: $spacing-6;
        padding: $spacing-3;
        border-radius: $radius-md;
        background: $success-light;
        color: $success;
        
        &.error {
          background: $error-light;
          color: $error;
        }
      }
    }
  `]
})
export class GlobalExerciseAdminComponent {
  private exerciseService = inject(ExerciseService);
  private confirmService = inject(ConfirmService);

  seedExercises = SPANISH_EXERCISES;
  loading = signal<boolean>(false);
  message = signal<string>('');
  isError = signal<boolean>(false);

  async seedData() {
    const confirmed = await this.confirmService.confirm({
      title: '¿Reemplazar biblioteca?',
      message: `Esta acción ELIMINARÁ TODOS los ejercicios globales existentes y agregará ${this.seedExercises.length} nuevos ejercicios en español. ¿Estás seguro?`,
      confirmText: 'Reemplazar Todo',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (!confirmed) {
      return;
    }

    this.loading.set(true);
    this.message.set('');
    this.isError.set(false);

    try {
      // 1. Delete all existing global exercises
      await this.exerciseService.deleteAllGlobalExercises();

      // 2. Add new exercises
      let count = 0;
      for (const exercise of this.seedExercises) {
        // Create a copy without ID to let Firestore generate it
        const { id, ...exerciseData } = exercise as any;

        // Add createdAt timestamp
        const data = {
          ...exerciseData,
          createdAt: new Date(),
          isGlobal: true
        };

        // We'll use the service but we might need to bypass the "coachId" requirement 
        // or just use the current user as the "creator" but flag it as global.
        // The service's createExercise handles isGlobal flag.
        await this.exerciseService.createExercise(data);
        count++;
      }

      this.message.set(`¡Se agregaron exitosamente ${count} ejercicios!`);
    } catch (error: any) {
      console.error('Error seeding data:', error);
      this.isError.set(true);
      this.message.set(`Error: ${error.message}`);
    } finally {
      this.loading.set(false);
    }
  }
}
