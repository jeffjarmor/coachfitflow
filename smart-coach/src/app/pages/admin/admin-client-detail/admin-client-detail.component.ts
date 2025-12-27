import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminService, ClientWithCoach } from '../../../services/admin.service';
import { Routine } from '../../../models/routine.model';
import { ButtonComponent } from '../../../components/ui/button/button.component';

@Component({
    selector: 'app-admin-client-detail',
    standalone: true,
    imports: [CommonModule, ButtonComponent],
    templateUrl: './admin-client-detail.component.html',
    styleUrls: ['./admin-client-detail.component.scss']
})
export class AdminClientDetailComponent implements OnInit {
    private adminService = inject(AdminService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);

    coachId = signal<string>('');
    clientId = signal<string>('');
    clientWithCoach = signal<ClientWithCoach | null>(null);
    routines = signal<Array<{ id: string; routine: Routine }>>([]);
    loading = signal(true);

    async ngOnInit() {
        const coachId = this.route.snapshot.paramMap.get('coachId');
        const clientId = this.route.snapshot.paramMap.get('clientId');

        if (coachId && clientId) {
            this.coachId.set(coachId);
            this.clientId.set(clientId);
            await this.loadClientData();
        }
    }

    async loadClientData() {
        try {
            this.loading.set(true);
            const [clientData, routinesData] = await Promise.all([
                this.adminService.getClientWithCoach(this.coachId(), this.clientId()),
                this.adminService.getClientRoutines(this.coachId(), this.clientId())
            ]);

            this.clientWithCoach.set(clientData);
            this.routines.set(routinesData);
        } catch (error) {
            console.error('Error loading client data:', error);
        } finally {
            this.loading.set(false);
        }
    }

    goBack() {
        this.router.navigate(['/admin/clients']);
    }

    createRoutine() {
        this.router.navigate(['/admin/clients', this.coachId(), this.clientId(), 'routine', 'new']);
    }

    editClient() {
        this.router.navigate(['/admin/clients', this.coachId(), this.clientId(), 'edit']);
    }

    viewRoutine(routineId: string) {
        this.router.navigate(['/routines', routineId], {
            queryParams: { coachId: this.coachId() }
        });
    }
}
