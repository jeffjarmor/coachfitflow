import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminService, ClientWithCoach } from '../../../services/admin.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';

@Component({
    selector: 'app-admin-clients',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonComponent],
    templateUrl: './admin-clients.component.html',
    styleUrls: ['./admin-clients.component.scss']
})
export class AdminClientsComponent implements OnInit {
    private adminService = inject(AdminService);
    private router = inject(Router);

    // State
    allClients = signal<ClientWithCoach[]>([]);
    loading = signal(true);
    searchTerm = signal('');
    selectedCoachFilter = signal<string>('all');

    // Computed
    coaches = computed(() => {
        const clients = this.allClients();
        const uniqueCoaches = new Map<string, { id: string; name: string }>();

        clients.forEach(c => {
            if (!uniqueCoaches.has(c.coachId)) {
                uniqueCoaches.set(c.coachId, {
                    id: c.coachId,
                    name: c.coach.name
                });
            }
        });

        return Array.from(uniqueCoaches.values()).sort((a, b) =>
            a.name.localeCompare(b.name)
        );
    });

    filteredClients = computed(() => {
        let clients = this.allClients();
        const search = this.searchTerm().toLowerCase();
        const coachFilter = this.selectedCoachFilter();

        // Filter by coach
        if (coachFilter !== 'all') {
            clients = clients.filter(c => c.coachId === coachFilter);
        }

        // Filter by search term
        if (search) {
            clients = clients.filter(c =>
                c.client.name.toLowerCase().includes(search) ||
                c.coach.name.toLowerCase().includes(search)
            );
        }

        return clients;
    });

    async ngOnInit() {
        console.log('AdminClientsComponent initialized');
        await this.loadClients();
    }

    async loadClients() {
        try {
            this.loading.set(true);
            const clients = await this.adminService.getAllClients();
            this.allClients.set(clients);
        } catch (error) {
            console.error('Error loading clients:', error);
        } finally {
            this.loading.set(false);
        }
    }

    viewClientDetail(coachId: string, clientId: string) {
        this.router.navigate(['/admin/clients', coachId, clientId]);
    }

    createRoutine(coachId: string, clientId: string) {
        this.router.navigate(['/admin/clients', coachId, clientId, 'routine', 'new']);
    }

    // Clone state
    showCloneModal = signal(false);
    selectedClientForClone = signal<ClientWithCoach | null>(null);
    targetCoachId = signal<string>('');
    cloning = signal(false);

    editClient(coachId: string, clientId: string) {
        this.router.navigate(['/admin/clients', coachId, clientId, 'edit']);
    }

    openCloneModal(client: ClientWithCoach) {
        console.log('openCloneModal called for client:', client);
        this.selectedClientForClone.set(client);
        this.targetCoachId.set('');
        this.showCloneModal.set(true);
        console.log('showCloneModal set to true. Current value:', this.showCloneModal());
    }

    closeCloneModal() {
        this.showCloneModal.set(false);
        this.selectedClientForClone.set(null);
        this.targetCoachId.set('');
    }

    async confirmClone() {
        const client = this.selectedClientForClone();
        const targetId = this.targetCoachId();

        if (!client || !targetId) return;

        // Validate: Can't clone to same coach
        if (client.coachId === targetId) {
            alert('No puedes clonar un cliente al mismo entrenador');
            return;
        }

        try {
            this.cloning.set(true);
            await this.adminService.cloneClient(client.coachId, client.clientId, targetId);

            // Close modal and refresh list
            this.closeCloneModal();
            await this.loadClients();

            // Ideally show a success message toast here
            alert('Cliente clonado exitosamente');
        } catch (error) {
            console.error('Error cloning client:', error);
            alert('Error al clonar cliente');
        } finally {
            this.cloning.set(false);
        }
    }
}
