import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExerciseService } from '../../../services/exercise.service';
import { ConfirmService } from '../../../services/confirm.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { SPANISH_EXERCISES } from '../../../utils/spanish-exercises';
import { NEW_EXERCISES } from '../../../utils/new-exercises';

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
              <span class="label">Total de Ejercicios Base:</span>
              <span class="value">{{ seedExercises.length }}</span>
            </div>
            <div class="stat">
              <span class="label">Nuevos Ejercicios Disponibles:</span>
              <span class="value">{{ newExercises.length }}</span>
            </div>
          </div>

          <div class="actions">
            <!-- PELIGRO: ESTE BORRA TODO -->
            <app-button 
              (click)="seedData()" 
              [loading]="loading()"
              [disabled]="loading()"
              variant="danger"
            >
              ⚠️ Reemplazar TODO (Borra Existentes)
            </app-button>

            <!-- SEGURO: SOLO AGREGA -->
            <app-button 
              (click)="appendNewExercises()" 
              [loading]="loading()"
              [disabled]="loading()"
              variant="primary"
            >
              ✅ Agregar Solo Faltantes (Seguro)
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
        display: flex;
        flex-direction: column;
        gap: $spacing-2;
        
        .stat {
          display: flex;
          justify-content: space-between;
          font-weight: $font-weight-medium;
          
          .label { color: $text-secondary; }
          .value { color: $primary-600; font-weight: bold; }
        }
      }

      .actions {
        display: flex;
        flex-direction: column;
        gap: $spacing-4;
      }
      
      .message {
        margin-top: $spacing-6;
        padding: $spacing-3;
        border-radius: $radius-md;
        background: $success-light;
        color: $success;
        white-space: pre-line;
        
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
  newExercises = NEW_EXERCISES;

  loading = signal<boolean>(false);
  message = signal<string>('');
  isError = signal<boolean>(false);

  async seedData() {
    const confirmed = await this.confirmService.confirm({
      title: '¿Reemplazar biblioteca?',
      message: `¡CUIDADO! Esta acción ELIMINARÁ TODOS los ejercicios globales existentes. Si tienes rutinas creadas, SE ROMPERÁN. ¿Estás absolutamente seguro?`,
      confirmText: 'SÍ, Reemplazar Todo',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (!confirmed) return;

    this.loading.set(true);
    this.message.set('');
    this.isError.set(false);

    try {
      await this.exerciseService.deleteAllGlobalExercises();

      let count = 0;
      for (const exercise of this.seedExercises) {
        const { id, ...exerciseData } = exercise as any;
        const data = { ...exerciseData, createdAt: new Date(), isGlobal: true };
        await this.exerciseService.createExercise(data);
        count++;
      }

      this.message.set(`¡Se reemplazó todo exitosamente con ${count} ejercicios!`);
    } catch (error: any) {
      console.error('Error seeding data:', error);
      this.isError.set(true);
      this.message.set(`Error: ${error.message}`);
    } finally {
      this.loading.set(false);
    }
  }

  async appendNewExercises() {
    const confirmed = await this.confirmService.confirm({
      title: '¿Agregar ejercicios faltantes?',
      message: `Esta acción agregará SOLO los ejercicios nuevos (${this.newExercises.length}) a la biblioteca. Los ejercicios existentes NO serán tocados ni borrados. Es seguro para tus rutinas.`,
      confirmText: 'Agregar Faltantes',
      cancelText: 'Cancelar',
      type: 'info'
    });

    if (!confirmed) return;

    this.loading.set(true);
    this.message.set('Iniciando carga segura...');
    this.isError.set(false);

    try {
      // 1. Obtener ejercicios existentes para evitar duplicados
      const existingExercises = await this.exerciseService.getGlobalExercises();
      const existingNames = new Set(existingExercises.map(e => e.name.toLowerCase().trim()));

      let addedCount = 0;
      let skippedCount = 0;

      // 2. Recorrer nuevos ejercicios y agregar solo si no existen
      for (const exercise of this.newExercises) {
        const normalizedName = exercise.name.toLowerCase().trim();

        if (existingNames.has(normalizedName)) {
          console.log(`Saltando duplicado: ${exercise.name}`);
          skippedCount++;
          continue;
        }

        const data = {
          ...exercise,
          createdAt: new Date(),
          isGlobal: true
        };

        await this.exerciseService.createExercise(data as any);
        addedCount++;
      }

      this.message.set(`✅ Proceso Finalizado:\n\n➕ Agregados: ${addedCount} ejercicios\n⏭️ Omitidos (ya existían): ${skippedCount} ejercicios\n\nTotal en biblioteca: ${existingExercises.length + addedCount}`);
    } catch (error: any) {
      console.error('Error appending data:', error);
      this.isError.set(true);
      this.message.set(`Error: ${error.message}`);
    } finally {
      this.loading.set(false);
    }
  }
}
