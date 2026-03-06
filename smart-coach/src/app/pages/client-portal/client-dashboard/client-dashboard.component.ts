import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { GymClientService } from '../../../services/gym-client.service';
import { GymService } from '../../../services/gym.service';
import { Client } from '../../../models/client.model';
import { Payment } from '../../../models/payment.model';
import { Routine } from '../../../models/routine.model';

@Component({
    selector: 'app-client-dashboard',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './client-dashboard.component.html',
    styleUrls: ['./client-dashboard.component.scss']
})
export class ClientDashboardComponent implements OnInit {
    private authService = inject(AuthService);
    private gymClientSvc = inject(GymClientService);
    private gymService = inject(GymService);
    private router = inject(Router);

    profile = this.authService.gymClientProfile;
    clientData = signal<Client | null>(null);
    latestPayment = signal<Payment | null>(null);
    activeRoutine = signal<{ id: string; routine: Routine } | null>(null);
    gymName = signal<string>('');
    loading = signal(true);

    async ngOnInit() {
        // Wait for gymClientProfile to be hydrated from Firebase (handles page refresh)
        let p = this.profile();
        if (!p) {
            p = await this.waitForProfile();
        }
        if (!p) { this.router.navigate(['/login']); return; }

        // Fetch gym name live from Firestore (don't rely on stored gymName which may be stale)
        const [gym, client, routines, payments] = await Promise.all([
            this.gymService.getGym(p.gymId),
            this.gymClientSvc.getMyClientData(p.gymId, p.clientId),
            this.gymClientSvc.getMyRoutines(p.gymId, p.clientId),
            this.gymClientSvc.getMyPayments(p.gymId, p.clientId)
        ]);

        // Use real gym name, then fall back to stored gymName, then default
        this.gymName.set(gym?.name || p.gymName || '');

        this.clientData.set(client);
        this.activeRoutine.set(routines[0] ?? null);

        // Pick the next upcoming/pending payment
        const upcoming = payments
            .filter(pay => pay.status === 'pending' || pay.status === 'overdue')
            .sort((a, b) => {
                const da = this.parseDate(a.dueDate)?.getTime() ?? 0;
                const db = this.parseDate(b.dueDate)?.getTime() ?? 0;
                return da - db;
            });
        this.latestPayment.set(upcoming[0] ?? payments[0] ?? null);

        this.loading.set(false);
    }

    /** Poll the gymClientProfile signal until it's set or a 2.5s timeout elapses */
    private waitForProfile(): Promise<typeof this.profile extends () => infer T ? T : never> {
        return new Promise(resolve => {
            let attempts = 0;
            const interval = setInterval(() => {
                const p = this.profile();
                if (p || attempts >= 25) {
                    clearInterval(interval);
                    resolve(p as any);
                }
                attempts++;
            }, 100);
        });
    }

    private parseDate(d: any): Date | null {
        if (!d) return null;
        if (typeof d.toDate === 'function') return d.toDate();
        const parsed = new Date(d);
        return isNaN(parsed.getTime()) ? null : parsed;
    }

    get nextPaymentDate(): string {
        const p = this.latestPayment();
        if (!p) return 'No hay pagos';
        const d = this.parseDate(p.dueDate);
        if (!d) return 'Sin fecha';
        return d.toLocaleDateString('es-MX', {
            day: '2-digit', month: 'long', year: 'numeric'
        });
    }

    get paymentStatusLabel(): { text: string; cls: string } {
        const s = this.latestPayment()?.status;
        if (!s) return { text: 'Sin pagos', cls: 'neutral' };
        const map: Record<string, { text: string; cls: string }> = {
            paid: { text: 'Al corriente', cls: 'paid' },
            pending: { text: 'Pendiente', cls: 'pending' },
            overdue: { text: 'Vencido', cls: 'overdue' },
            cancelled: { text: 'Cancelado', cls: 'neutral' }
        };
        return map[s] ?? { text: s, cls: 'neutral' };
    }

    logout() { this.authService.logout(); }
}
