import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { GymClientService } from '../../../services/gym-client.service';
import { Routine, TrainingDay, RoutineWithDays } from '../../../models/routine.model';
import { PdfService } from '../../../services/pdf.service';
import { CoachService } from '../../../services/coach.service';
import { GymService } from '../../../services/gym.service';
import { ToastService } from '../../../services/toast.service';

@Component({
    selector: 'app-client-routine-detail',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './client-routine-detail.component.html',
    styleUrls: ['./client-routine-detail.component.scss']
})
export class ClientRoutineDetailComponent implements OnInit {
    private authService = inject(AuthService);
    private gymClientSvc = inject(GymClientService);
    private coachService = inject(CoachService);
    private gymService = inject(GymService);
    private pdfService = inject(PdfService);
    private toastService = inject(ToastService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);

    profile = this.authService.gymClientProfile;
    routine = signal<Routine | null>(null);
    days = signal<TrainingDay[]>([]);
    loading = signal(true);
    downloadingPdf = signal(false);

    async ngOnInit() {
        const p = this.profile();
        if (!p) { this.router.navigate(['/login']); return; }

        const routineId = this.route.snapshot.paramMap.get('id');
        if (!routineId) { this.router.navigate(['/client/routines']); return; }

        const { routine, days } = await this.gymClientSvc.getMyRoutineDetail(p.gymId, routineId);

        // Security: only show if this routine belongs to the logged-in client
        if (!routine || routine.clientId !== p.clientId) {
            this.router.navigate(['/client/routines']);
            return;
        }

        const sortedDays = [...days].sort((a: any, b: any) => (a.dayNumber ?? 0) - (b.dayNumber ?? 0));
        this.routine.set(routine);
        this.days.set(sortedDays as TrainingDay[]);
        this.loading.set(false);
    }

    async downloadPdf() {
        const p = this.profile();
        const r = this.routine();
        if (!p || !r) return;

        try {
            this.downloadingPdf.set(true);

            // Fetch missing pieces for PDF (Client record)
            const client = await this.gymClientSvc.getMyClientData(p.gymId, p.clientId);
            if (!client) throw new Error('Client data not found');

            // Find the coach/owner profile using gymId (coaches table might have the owner)
            const coach = await this.coachService.getCoachProfile(p.gymId);
            const gym = await this.gymService.getGym(p.gymId);

            // Build the branding data prioritizing gym settings over coach settings
            let brandingData: any = coach || {
                id: p.gymId,
                name: p.gymName,
                email: '',
                role: 'coach',
                accountType: 'gym'
            };

            if (gym) {
                brandingData = {
                    ...brandingData,
                    name: gym.name,
                    logoUrl: gym.logoUrl || brandingData.logoUrl,
                    brandColor: gym.brandColor || brandingData.brandColor
                };
            }

            const routineWithDays: RoutineWithDays = {
                ...r,
                days: this.days()
            };

            await this.pdfService.generateRoutinePDF(routineWithDays, client, brandingData);
            this.toastService.success('El PDF se ha descargado correctamente');
        } catch (error) {
            console.error('Error generating PDF:', error);
            this.toastService.error('Hubo un error al generar el PDF de la rutina');
        } finally {
            this.downloadingPdf.set(false);
        }
    }
}
