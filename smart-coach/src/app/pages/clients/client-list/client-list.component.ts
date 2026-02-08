import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, startWith, tap } from 'rxjs/operators';
import { ClientService } from '../../../services/client.service';
import { AuthService } from '../../../services/auth.service';
import { CoachService } from '../../../services/coach.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { TutorialButtonComponent } from '../../../components/tutorial/tutorial-button/tutorial-button.component';
import { TutorialService } from '../../../services/tutorial.service';
import { Client } from '../../../models/client.model';

@Component({
    selector: 'app-client-list',
    standalone: true,
    imports: [CommonModule, RouterLink, ReactiveFormsModule, ButtonComponent, PageHeaderComponent, TutorialButtonComponent],
    templateUrl: './client-list.component.html',
    styleUrls: ['./client-list.component.scss']
})
export class ClientListComponent {
    private clientService = inject(ClientService);
    private authService = inject(AuthService);
    private coachService = inject(CoachService);
    private tutorialService = inject(TutorialService);

    // Search control
    searchControl = new FormControl('');
    searchQuery = toSignal(
        this.searchControl.valueChanges.pipe(
            startWith(''),
            debounceTime(300),
            distinctUntilChanged(),
            // Side effect to reset page
            tap(() => this.currentPage.set(1))
        ),
        { initialValue: '' }
    );

    // Signals
    loading = signal<boolean>(true);
    clients = signal<Client[]>([]);

    // Pagination
    currentPage = signal<number>(1);
    itemsPerPage = 10;

    // Computed filtered clients (All matches)
    filteredClients = computed(() => {
        const query = this.searchQuery()?.toLowerCase() || '';
        const allClients = this.clients();

        if (!query) return allClients;

        // Reset to page 1 on search
        // Note: We can't set signal inside computed. 
        // Need to handle page reset in searchQuery subscription or effect. 
        // For now, let's keep it simple. Effect below.

        return allClients.filter(client =>
            client.name.toLowerCase().includes(query) ||
            client.email.toLowerCase().includes(query)
        );
    });

    // Computed Paginated Clients (Display slice)
    paginatedClients = computed(() => {
        const clients = this.filteredClients();
        const start = (this.currentPage() - 1) * this.itemsPerPage;
        const end = start + this.itemsPerPage;
        return clients.slice(start, end);
    });

    totalPages = computed(() => {
        return Math.ceil(this.filteredClients().length / this.itemsPerPage) || 1;
    });

    constructor() {
        this.loadClients();


    }

    async loadClients() {
        try {
            this.loading.set(true);
            const userId = this.authService.getCurrentUserId();
            if (!userId) return;

            // GYM MULTI-TENANCY: Check if coach belongs to a gym
            const coach = await this.coachService.getCoachProfile(userId);

            // Determine gymId (only for non-admin gym coaches)
            const isAdmin = coach?.role === 'admin';
            const gymId = (coach && coach.gymId && !isAdmin) ? coach.gymId : undefined;

            // Use unified method: automatically routes to correct storage based on gymId
            const data = await this.clientService.getClients(userId, gymId);

            this.clients.set(data);
        } catch (error) {
            console.error('Error loading clients:', error);
        } finally {
            this.loading.set(false);
        }
    }

    calculateAge(birthDate: any): number {
        if (!birthDate) return 0;

        // Handle Firestore Timestamp
        const dob = birthDate.toDate ? birthDate.toDate() : new Date(birthDate);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();

        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
            age--;
        }

        return age;
    }

    getAvatarGradient(index: number): string {
        const gradients = [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
            'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
            'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
        ];
        return gradients[index % gradients.length];
    }

    startTutorial(): void {
        this.tutorialService.startTutorial('client-list');
    }

    nextPage() {
        if (this.currentPage() < this.totalPages()) {
            this.currentPage.update(p => p + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    prevPage() {
        if (this.currentPage() > 1) {
            this.currentPage.update(p => p - 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
}
