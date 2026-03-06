import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { GymClientService } from '../../../services/gym-client.service';
import { Payment } from '../../../models/payment.model';

@Component({
    selector: 'app-client-payments',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './client-payments.component.html',
    styleUrls: ['./client-payments.component.scss']
})
export class ClientPaymentsComponent implements OnInit {
    private authService = inject(AuthService);
    private gymClientSvc = inject(GymClientService);
    private router = inject(Router);

    profile = this.authService.gymClientProfile;
    payments = signal<Payment[]>([]);
    loading = signal(true);

    async ngOnInit() {
        const p = this.profile();
        if (!p) { this.router.navigate(['/login']); return; }

        const list = await this.gymClientSvc.getMyPayments(p.gymId, p.clientId);
        this.payments.set(list);
        this.loading.set(false);
    }

    private parseDate(d: any): Date | null {
        if (!d) return null;
        if (typeof d.toDate === 'function') return d.toDate();
        const parsed = new Date(d);
        return isNaN(parsed.getTime()) ? null : parsed;
    }

    formatDate(d: any): string {
        const date = this.parseDate(d);
        if (!date) return '—';
        return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    }

    statusLabel(status: string): { text: string; cls: string } {
        const map: Record<string, { text: string; cls: string }> = {
            paid: { text: 'Pagado', cls: 'status-paid' },
            pending: { text: 'Pendiente', cls: 'status-pending' },
            overdue: { text: 'Vencido', cls: 'status-overdue' },
            cancelled: { text: 'Cancelado', cls: 'status-neutral' }
        };
        return map[status] ?? { text: status, cls: 'status-neutral' };
    }

    get totalPaid(): number {
        return this.payments()
            .filter(p => p.status === 'paid')
            .reduce((s, p) => s + (p.amount ?? 0), 0);
    }
}
