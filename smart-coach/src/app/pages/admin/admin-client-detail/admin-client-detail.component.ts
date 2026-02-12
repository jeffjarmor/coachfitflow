import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminService, ClientWithCoach } from '../../../services/admin.service';
import { RoutineService } from '../../../services/routine.service';
import { PdfService } from '../../../services/pdf.service';
import { CoachService } from '../../../services/coach.service';
import { ConfirmService } from '../../../services/confirm.service';
import { ToastService } from '../../../services/toast.service';
import { Routine, RoutineWithDays } from '../../../models/routine.model';
import { Client } from '../../../models/client.model';
import { Coach } from '../../../models/coach.model';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';

@Component({
    selector: 'app-admin-client-detail',
    standalone: true,
    imports: [CommonModule, ButtonComponent, PageHeaderComponent],
    templateUrl: './admin-client-detail.component.html',
    styleUrls: ['./admin-client-detail.component.scss']
})
export class AdminClientDetailComponent implements OnInit {
    private adminService = inject(AdminService);
    private routineService = inject(RoutineService);
    private pdfService = inject(PdfService);
    private coachService = inject(CoachService);
    private confirmService = inject(ConfirmService);
    private toastService = inject(ToastService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);

    coachId = signal<string>('');
    clientId = signal<string>('');
    client = signal<Client | null>(null);
    coach = signal<Coach | null>(null);
    routines = signal<Routine[]>([]);
    loading = signal(true);
    activeTab = signal<'overview' | 'routines' | 'measurements'>('overview');

    // Computed properties
    clientInfo = computed(() => {
        const c = this.client();
        if (!c) return null;
        return {
            ...c,
            age: c.age || 0,
            weight: c.weight || 0,
            height: c.height || 0
        };
    });

    async ngOnInit() {
        const coachId = this.route.snapshot.paramMap.get('coachId');
        const clientId = this.route.snapshot.paramMap.get('clientId');

        if (coachId && clientId) {
            this.coachId.set(coachId);
            this.clientId.set(clientId);
            await this.loadAllData();
        }
    }

    async loadAllData() {
        try {
            this.loading.set(true);

            // Load client, coach, and routines
            const [clientWithCoach, routinesData, coachData] = await Promise.all([
                this.adminService.getClientWithCoach(this.coachId(), this.clientId()),
                this.adminService.getClientRoutines(this.coachId(), this.clientId()),
                this.coachService.getCoachProfile(this.coachId())
            ]);

            if (clientWithCoach) {
                this.client.set(clientWithCoach.client);
            } else {
                this.toastService.error('Cliente no encontrado');
                this.goBack();
                return;
            }
            this.coach.set(coachData);
            this.routines.set(routinesData.map(r => ({ ...r.routine, id: r.id })));
        } catch (error) {
            console.error('Error loading client data:', error);
            this.toastService.error('Error al cargar la información del cliente');
        } finally {
            this.loading.set(false);
        }
    }

    setActiveTab(tab: 'overview' | 'routines' | 'measurements') {
        this.activeTab.set(tab);
    }

    goBack() {
        this.router.navigate(['/admin/coaches', this.coachId()]);
    }

    async editClient() {
        this.router.navigate(['/admin/clients', this.coachId(), this.clientId(), 'edit']);
    }

    async deleteClient() {
        const client = this.client();
        if (!client) return;

        const confirmed = await this.confirmService.confirm({
            title: '¿Eliminar Cliente?',
            message: `¿Estás seguro de que deseas eliminar a ${client.name}? Esta acción eliminará todas sus rutinas y mediciones. No se puede deshacer.`,
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            type: 'danger'
        });

        if (confirmed) {
            try {
                // TODO: Implement delete client in admin service
                await this.adminService.deleteClient(this.coachId(), this.clientId());
                this.toastService.success('Cliente eliminado correctamente');
                this.goBack();
            } catch (error) {
                console.error('Error deleting client:', error);
                this.toastService.error('Error al eliminar el cliente');
            }
        }
    }

    // Routine Actions
    createRoutine() {
        this.router.navigate(['/admin/clients', this.coachId(), this.clientId(), 'routine', 'new']);
    }

    viewRoutine(routineId: string) {
        this.router.navigate(['/routines', routineId], {
            queryParams: { coachId: this.coachId() }
        });
    }

    async deleteRoutine(routineId: string, routineName: string) {
        const confirmed = await this.confirmService.confirm({
            title: '¿Eliminar Rutina?',
            message: `¿Estás seguro de que deseas eliminar la rutina "${routineName}"?`,
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            type: 'danger'
        });

        if (confirmed) {
            try {
                await this.routineService.deleteRoutine(this.coachId(), routineId);
                this.toastService.success('Rutina eliminada correctamente');
                await this.loadAllData(); // Reload data
            } catch (error) {
                console.error('Error deleting routine:', error);
                this.toastService.error('Error al eliminar la rutina');
            }
        }
    }

    async generatePDF(routineId: string) {
        try {
            const client = this.client();
            const coach = this.coach();

            if (!client || !coach) {
                this.toastService.error('Faltan datos para generar el PDF');
                return;
            }

            this.toastService.info('Generando PDF...');

            const routine = await this.routineService.getRoutineWithDays(this.coachId(), routineId);

            if (routine) {
                await this.pdfService.generateRoutinePDF(routine, client, coach);
                this.toastService.success('PDF generado correctamente');
            }
        } catch (error) {
            console.error('Error generating PDF:', error);
            this.toastService.error('Error al generar el PDF');
        }
    }

    // Measurement Actions
    addMeasurement() {
        this.toastService.info('Función de mediciones próximamente');
        // TODO: Open measurement modal
    }

    editMeasurement(measurementId: string) {
        this.toastService.info('Función de mediciones próximamente');
        // TODO: Open measurement modal with data
    }

    async deleteMeasurement(measurementId: string) {
        this.toastService.info('Función de mediciones próximamente');
        // TODO: Implement delete measurement
    }
}
