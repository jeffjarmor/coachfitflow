import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RoutineService } from '../../../services/routine.service';
import { AuthService } from '../../../services/auth.service';
import { PdfService } from '../../../services/pdf.service';
import { ClientService } from '../../../services/client.service';
import { CoachService } from '../../../services/coach.service';
import { ToastService } from '../../../services/toast.service';
import { RoutineWithDays } from '../../../models/routine.model';
import { ButtonComponent } from '../../../components/ui/button/button.component';

@Component({
  selector: 'app-routine-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonComponent, FormsModule],
  template: `
    <div class="page-container" *ngIf="routine(); else loadingTpl">
      <div class="header-section">
        <div class="title-area">
          <app-button routerLink="../../" variant="outline" size="small">← Volver al Cliente</app-button>
          <h1>{{ routine()!.name }}</h1>
          <p class="subtitle">{{ routine()!.objective }}</p>
        </div>
        
        <div class="actions">
          <ng-container *ngIf="!isEditing()">
            <app-button (click)="toggleEditMode()" variant="outline">
              Editar Rutina
            </app-button>
            <app-button (click)="downloadPdf()" [loading]="generatingPdf()" variant="primary">
              Descargar PDF
            </app-button>
          </ng-container>
          
          <ng-container *ngIf="isEditing()">
            <app-button (click)="cancelEdit()" variant="outline" [disabled]="saving()">
              Cancelar
            </app-button>
            <app-button (click)="saveChanges()" [loading]="saving()" variant="primary">
              Guardar Cambios
            </app-button>
          </ng-container>
        </div>
      </div>

      <div class="content-grid">
        <div class="meta-card">
          <div class="meta-item">
            <span class="label">Duración</span>
            <span class="value">{{ routine()!.trainingDaysCount }} Días / Semana</span>
          </div>
          <div class="meta-item">
            <span class="label">Creado</span>
            <span class="value">{{ routine()!.createdAt | date:'mediumDate' }}</span>
          </div>
          <div class="meta-item" *ngIf="routine()!.notes">
            <span class="label">Notas</span>
            <span class="value">{{ routine()!.notes }}</span>
          </div>
        </div>

        <div class="days-list">
          <div *ngFor="let day of routine()!.days" class="day-card">
            <div class="day-header">
              <h3>{{ day.dayName }}</h3>
              <div class="muscles">
                <span *ngFor="let m of day.muscleGroups" class="muscle-tag">{{ m }}</span>
              </div>
            </div>

            <div class="exercises-table">
              <div class="table-header">
                <div class="col-name">Ejercicio</div>
                <div class="col-sets">Series</div>
                <div class="col-reps">Reps</div>
                <div class="col-rest">Descanso</div>
                <div class="col-notes">Notas</div>
              </div>
              
              <div *ngFor="let ex of day.exercises" class="table-row">
                <div class="col-name">
                  {{ ex.exerciseName }}
                  <a *ngIf="ex.videoUrl" [href]="ex.videoUrl" target="_blank" class="video-link">📺</a>
                </div>
                
                <!-- View Mode -->
                <ng-container *ngIf="!isEditing()">
                  <div class="col-sets">{{ ex.sets }}</div>
                  <div class="col-reps">{{ ex.reps }}</div>
                  <div class="col-rest">{{ ex.rest }}</div>
                  <div class="col-notes">{{ ex.notes || '-' }}</div>
                </ng-container>

                <!-- Edit Mode -->
                <ng-container *ngIf="isEditing()">
                  <div class="col-sets">
                    <input type="number" [(ngModel)]="ex.sets" class="edit-input small">
                  </div>
                  <div class="col-reps">
                    <input type="text" [(ngModel)]="ex.reps" class="edit-input">
                  </div>
                  <div class="col-rest">
                    <input type="text" [(ngModel)]="ex.rest" class="edit-input">
                  </div>
                  <div class="col-notes">
                    <input type="text" [(ngModel)]="ex.notes" class="edit-input" placeholder="Notas...">
                  </div>
                </ng-container>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ng-template #loadingTpl>
      <div class="loading-container">
        Cargando detalles de la rutina...
      </div>
    </ng-template>
  `,
  styleUrls: ['./routine-detail.component.scss']
})
export class RoutineDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private routineService = inject(RoutineService);
  private authService = inject(AuthService);
  private pdfService = inject(PdfService);
  private clientService = inject(ClientService);
  private coachService = inject(CoachService);
  private toastService = inject(ToastService);

  routine = signal<RoutineWithDays | null>(null);
  generatingPdf = signal<boolean>(false);

  isEditing = signal<boolean>(false);
  saving = signal<boolean>(false);
  originalRoutine: RoutineWithDays | null = null;

  async ngOnInit() {
    console.log('RoutineDetailComponent initialized');
    const routineId = this.route.snapshot.paramMap.get('id');
    const coachId = this.authService.getCurrentUserId();

    if (routineId && coachId) {
      try {
        const data = await this.routineService.getRoutineWithDays(coachId, routineId);
        // Ensure exercises is an array (fix for previous data corruption)
        if (data && data.days) {
          data.days.forEach(day => {
            if (!Array.isArray(day.exercises)) {
              day.exercises = [];
            }
          });
        }
        this.routine.set(data);
        console.log('Routine loaded:', data);
      } catch (error) {
        console.error('Error loading routine:', error);
      }
    }
  }

  toggleEditMode() {
    console.log('Toggling edit mode. Current:', this.isEditing());
    if (!this.isEditing()) {
      // Enter edit mode: clone current routine to original for rollback
      this.originalRoutine = JSON.parse(JSON.stringify(this.routine()));
      this.isEditing.set(true);
    }
  }

  cancelEdit() {
    // Revert changes
    if (this.originalRoutine) {
      this.routine.set(this.originalRoutine);
      this.originalRoutine = null;
    }
    this.isEditing.set(false);
  }

  async saveChanges() {
    const routine = this.routine();
    const coachId = this.authService.getCurrentUserId();

    if (!routine || !coachId) return;

    this.saving.set(true);
    try {
      // Update each day that has changes
      // For simplicity, we'll update all days since we don't track dirty state per day yet
      const updatePromises = routine.days.map(day =>
        this.routineService.updateTrainingDay(coachId, routine.id!, day.id!, {
          exercises: day.exercises
        })
      );

      await Promise.all(updatePromises);

      this.isEditing.set(false);
      this.originalRoutine = null;
      // Optional: Show success message
    } catch (error) {
      console.error('Error saving routine:', error);
      this.toastService.error('Error al guardar los cambios');
    } finally {
      this.saving.set(false);
    }
  }

  async downloadPdf() {
    const routine = this.routine();
    const coachId = this.authService.getCurrentUserId();

    if (!routine || !coachId) return;

    this.generatingPdf.set(true);
    try {
      const [client, coach] = await Promise.all([
        this.clientService.getClient(coachId, routine.clientId),
        this.coachService.getCoachProfile(coachId)
      ]);

      if (client && coach) {
        await this.pdfService.generateRoutinePDF(routine, client, coach);
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      this.toastService.error('Error al generar el PDF');
    } finally {
      this.generatingPdf.set(false);
    }
  }
}
