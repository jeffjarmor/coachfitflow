import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExerciseService } from '../../services/exercise.service';
import { AuthService } from '../../services/auth.service';
import { SAMPLE_EXERCISES } from '../../data/sample-exercises';
import { ButtonComponent } from '../../components/ui/button/button.component';

@Component({
    selector: 'app-seed-exercises',
    standalone: true,
    imports: [CommonModule, ButtonComponent],
    template: `
    <div class="seed-container">
      <div class="card">
        <h2>Base de Datos de Ejercicios</h2>
        <p>Haz clic en el botón para agregar {{ SAMPLE_EXERCISES.length }} ejercicios de prueba a la biblioteca global.</p>
        
        <div class="status" *ngIf="status()">
          <p [class.success]="!error()" [class.error]="error()">
            {{ status() }}
          </p>
        </div>

        <div class="progress" *ngIf="loading()">
          <p>Agregando ejercicios... {{ progress() }} / {{ SAMPLE_EXERCISES.length }}</p>
          <div class="progress-bar">
            <div class="progress-fill" [style.width.%]="(progress() / SAMPLE_EXERCISES.length) * 100"></div>
          </div>
        </div>

        <app-button 
          variant="primary" 
          (click)="seedExercises()" 
          [disabled]="loading()"
          [loading]="loading()">
          {{ loading() ? 'Agregando...' : 'Agregar Ejercicios de Prueba' }}
        </app-button>
      </div>
    </div>
  `,
    styles: [`
    .seed-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      background: #f3f4f6;
    }

    .card {
      background: white;
      padding: 3rem;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      max-width: 500px;
      width: 100%;
      text-align: center;
    }

    h2 {
      font-size: 1.75rem;
      margin-bottom: 1rem;
      color: #1f2937;
    }

    p {
      color: #6b7280;
      margin-bottom: 1.5rem;
    }

    .status {
      margin: 1.5rem 0;
      padding: 1rem;
      border-radius: 8px;
      
      &.success {
        background: #d1fae5;
        color: #065f46;
      }
      
      &.error {
        background: #fee2e2;
        color: #991b1b;
      }
    }

    .progress {
      margin: 1.5rem 0;
      
      .progress-bar {
        height: 8px;
        background: #e5e7eb;
        border-radius: 4px;
        overflow: hidden;
        margin-top: 0.5rem;
        
        .progress-fill {
          height: 100%;
          background: #3b82f6;
          transition: width 0.3s ease;
        }
      }
    }
  `]
})
export class SeedExercisesComponent {
    private exerciseService = inject(ExerciseService);
    private authService = inject(AuthService);

    SAMPLE_EXERCISES = SAMPLE_EXERCISES;
    loading = signal(false);
    status = signal('');
    error = signal(false);
    progress = signal(0);

    async seedExercises() {
        const userId = this.authService.getCurrentUserId();
        if (!userId) {
            this.status.set('Error: No hay usuario conectado');
            this.error.set(true);
            return;
        }

        this.loading.set(true);
        this.error.set(false);
        this.progress.set(0);
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < SAMPLE_EXERCISES.length; i++) {
            try {
                const exercise = SAMPLE_EXERCISES[i];
                await this.exerciseService.createGlobalExercise(exercise);
                successCount++;
                this.progress.set(i + 1);
            } catch (error) {
                console.error('Error adding exercise:', error);
                errorCount++;
            }
        }

        this.loading.set(false);

        if (errorCount === 0) {
            this.status.set(`✅ ¡Se agregaron exitosamente ${successCount} ejercicios a la biblioteca global!`);
            this.error.set(false);
        } else {
            this.status.set(`⚠️ Se agregaron ${successCount} ejercicios, ${errorCount} fallaron.`);
            this.error.set(true);
        }
    }
}
