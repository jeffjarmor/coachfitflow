import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { GymClientService } from '../../../services/gym-client.service';
import { Measurement } from '../../../models/measurement.model';

@Component({
    selector: 'app-client-measurements',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './client-measurements.component.html',
    styleUrls: ['./client-measurements.component.scss']
})
export class ClientMeasurementsComponent implements OnInit {
    private authService = inject(AuthService);
    private gymClientSvc = inject(GymClientService);
    private router = inject(Router);

    profile = this.authService.gymClientProfile;
    measurements = signal<Measurement[]>([]);
    loading = signal(true);

    async ngOnInit() {
        const p = this.profile();
        if (!p) { this.router.navigate(['/login']); return; }

        const list = await this.gymClientSvc.getMyMeasurements(p.gymId, p.clientId);
        this.measurements.set(list);
        this.loading.set(false);
    }

    formatDate(d: any): string {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    }

    getBmiCategory(bmi: number): { label: string; cls: string } {
        if (bmi < 18.5) return { label: 'Bajo peso', cls: 'bmi-low' };
        if (bmi < 25) return { label: 'Normal', cls: 'bmi-ok' };
        if (bmi < 30) return { label: 'Sobrepeso', cls: 'bmi-warn' };
        return { label: 'Obesidad', cls: 'bmi-high' };
    }
}
