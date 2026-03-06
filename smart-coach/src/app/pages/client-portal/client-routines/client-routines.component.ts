import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { GymClientService } from '../../../services/gym-client.service';
import { Routine } from '../../../models/routine.model';

@Component({
    selector: 'app-client-routines',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './client-routines.component.html',
    styleUrls: ['./client-routines.component.scss']
})
export class ClientRoutinesComponent implements OnInit {
    private authService = inject(AuthService);
    private gymClientSvc = inject(GymClientService);
    private router = inject(Router);

    profile = this.authService.gymClientProfile;
    routines = signal<Array<{ id: string; routine: Routine }>>([]);
    loading = signal(true);

    async ngOnInit() {
        const p = this.profile();
        if (!p) { this.router.navigate(['/login']); return; }

        const list = await this.gymClientSvc.getMyRoutines(p.gymId, p.clientId);
        this.routines.set(list);
        this.loading.set(false);
    }

    formatDate(d: any): string {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    }
}
