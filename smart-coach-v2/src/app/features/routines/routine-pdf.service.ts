import { Injectable, inject } from '@angular/core';
import { CoachDataService, CoachProfile } from '../../core/data/coach-data.service';
import { RoutinePlan } from './routine.models';
import { routinePlanForPdf } from './routine-pdf.adapters';
import { RoutinePdfContext, RoutineWithDays } from './routine-pdf.models';
import { RoutinePdfRenderer } from './routine-pdf-renderer';

@Injectable({ providedIn: 'root' })
export class RoutinePdfService {
  private readonly data = inject(CoachDataService);
  private readonly renderer = new RoutinePdfRenderer();

  async download(plan: RoutinePlan, coach: CoachProfile | null, gymId?: string): Promise<void> {
    if (!coach) throw new Error('No se pudo cargar el perfil del entrenador.');
    const context = await this.data.getRoutinePdfContext(plan.clientId, coach.id, gymId);
    await this.downloadDocument(routinePlanForPdf(plan), context);
  }

  async downloadDocument(routine: RoutineWithDays, context: RoutinePdfContext): Promise<void> {
    await this.renderer.generateRoutinePDF(routine, context.client, context.coach);
  }
}
