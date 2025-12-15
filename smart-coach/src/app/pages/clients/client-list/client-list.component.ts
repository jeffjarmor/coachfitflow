import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs/operators';
import { ClientService } from '../../../services/client.service';
import { AuthService } from '../../../services/auth.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { Client } from '../../../models/client.model';

@Component({
    selector: 'app-client-list',
    standalone: true,
    imports: [CommonModule, RouterLink, ReactiveFormsModule, ButtonComponent, PageHeaderComponent],
    templateUrl: './client-list.component.html',
    styleUrls: ['./client-list.component.scss']
})
export class ClientListComponent {
    private clientService = inject(ClientService);
    private authService = inject(AuthService);

    // Search control
    searchControl = new FormControl('');
    searchQuery = toSignal(
        this.searchControl.valueChanges.pipe(
            startWith(''),
            debounceTime(300),
            distinctUntilChanged()
        ),
        { initialValue: '' }
    );

    // Signals
    loading = signal<boolean>(true);
    clients = signal<Client[]>([]);

    // Computed filtered clients
    filteredClients = computed(() => {
        const query = this.searchQuery()?.toLowerCase() || '';
        const allClients = this.clients();

        if (!query) return allClients;

        return allClients.filter(client =>
            client.name.toLowerCase().includes(query) ||
            client.email.toLowerCase().includes(query)
        );
    });

    constructor() {
        this.loadClients();
    }

    async loadClients() {
        try {
            this.loading.set(true);
            const userId = this.authService.getCurrentUserId();
            if (userId) {
                const data = await this.clientService.getClients(userId);
                this.clients.set(data);
            }
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
}
