import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CoachService } from '../../../services/coach.service';
import { ClientService } from '../../../services/client.service';
import { RoutineService } from '../../../services/routine.service';
import { Coach } from '../../../models/coach.model';
import { Client } from '../../../models/client.model';
import { Gym } from '../../../models/gym.model'; // Import Gym
import { GymService } from '../../../services/gym.service'; // Import GymService
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { ConfirmService } from '../../../services/confirm.service';
import { ToastService } from '../../../services/toast.service';

@Component({
    selector: 'app-admin-coach-detail',
    standalone: true,
    imports: [CommonModule, ButtonComponent, PageHeaderComponent],
    templateUrl: './admin-coach-detail.component.html',
    styleUrls: ['./admin-coach-detail.component.scss']
})
export class AdminCoachDetailComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private coachService = inject(CoachService);
    private clientService = inject(ClientService);
    private routineService = inject(RoutineService);
    private gymService = inject(GymService); // Inject it
    private confirmService = inject(ConfirmService);
    private toastService = inject(ToastService);

    coachId = signal<string>('');
    coach = signal<Coach | null>(null);
    clients = signal<Client[]>([]);
    gyms = signal<any[]>([]); // List of available gyms
    selectedGymId = signal<string>(''); // For assignment
    loading = signal<boolean>(true);
    activeTab = signal<'overview' | 'clients'>('overview');

    // Computed stats
    clientCount = computed(() => this.clients().length);
    activeRoutinesCount = signal(0);

    async ngOnInit() {
        this.loadGyms(); // Start loading gyms
        this.route.params.subscribe(async params => {
            const id = params['id'];
            if (id) {
                this.coachId.set(id);
                await this.loadCoachData(id);
            }
        });
    }

    async loadCoachData(coachId: string) {
        try {
            this.loading.set(true);

            // Load coach profile
            const coachData = await this.coachService.getCoachProfile(coachId);
            this.coach.set(coachData);

            // Load clients
            const clientsData = await this.clientService.getClients(coachId);
            this.clients.set(clientsData);

            // Count active routines
            const routinePromises = clientsData.map(client =>
                this.routineService.getClientRoutines(coachId, client.id || '')
            );
            const routinesArrays = await Promise.all(routinePromises);
            const totalRoutines = routinesArrays.reduce((sum, routines) => sum + routines.length, 0);
            this.activeRoutinesCount.set(totalRoutines);

        } catch (error) {
            console.error('Error loading coach data:', error);
            this.toastService.error('Error al cargar la información del coach');
        } finally {
            this.loading.set(false);
        }
    }

    setActiveTab(tab: 'overview' | 'clients') {
        this.activeTab.set(tab);
    }

    navigateToClients() {
        this.router.navigate(['/admin/coaches', this.coachId(), 'clients']);
    }

    viewClientDetail(clientId: string) {
        this.router.navigate(['/admin/clients', this.coachId(), clientId]);
    }

    createClientForCoach() {
        // Navigate to client form with coachId pre-filled
        this.router.navigate(['/clients/new'], {
            queryParams: { coachId: this.coachId() }
        });
    }

    async deleteCoach() {
        const coach = this.coach();
        if (!coach) return;

        const confirmed = await this.confirmService.confirm({
            title: '¿Eliminar Coach?',
            message: `¿Estás seguro de que deseas eliminar a ${coach.name}? Esta acción eliminará todos sus clientes, rutinas y datos asociados. Esta acción no se puede deshacer.`,
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            type: 'danger'
        });

        if (confirmed) {
            try {
                await this.coachService.deleteCoach(this.coachId());
                this.toastService.success('Coach eliminado correctamente');
                this.router.navigate(['/admin/coaches']);
            } catch (error) {
                console.error('Error deleting coach:', error);
                this.toastService.error('Error al eliminar el coach');
            }
        }
    }

    editCoach() {
        // For now, show a toast. In the future, could implement edit modal/page
        this.toastService.info('Función de edición de coach próximamente');
    }

    async loadGyms() {
        const allGyms = await this.gymService.getAllGyms();
        this.gyms.set(allGyms);
    }

    async assignGym() {
        if (!this.selectedGymId()) {
            this.toastService.error('Selecciona un gimnasio primero');
            return;
        }

        const confirmed = await this.confirmService.confirm({
            title: '¿Asignar como Dueño?',
            message: 'Este coach se convertirá en el DUEÑO del gimnasio seleccionado. ¿Continuar?',
            confirmText: 'Asignar',
            type: 'warning'
        });

        if (confirmed) {
            try {
                this.loading.set(true);
                await this.gymService.assignGymOwner(this.selectedGymId(), this.coachId());
                this.toastService.success('Coach asignado como dueño correctamente');
                // Reload profile
                await this.loadCoachData(this.coachId());
            } catch (error) {
                console.error('Error assigning gym:', error);
                this.toastService.error('Error al asignar gimnasio');
            } finally {
                this.loading.set(false);
            }
        }
    }

    onGymSelect(event: any) {
        this.selectedGymId.set(event.target.value);
    }
}
