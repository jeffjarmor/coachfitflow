import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CoachDataService } from '../../core/data/coach-data.service';
import { GymContextService } from './gym-context.service';
import { GymDashboardData } from './gym.models';

@Component({
  selector: 'app-gym-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './gym-dashboard.component.html',
  styleUrl: './gym-dashboard.component.scss'
})
export class GymDashboardComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly coachData = inject(CoachDataService);
  private readonly gyms = inject(GymContextService);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly copied = signal(false);
  readonly context = this.gyms.activeGym;
  readonly data = signal<GymDashboardData | null>(null);
  readonly permissionItems = computed(() => {
    const permissions = this.context()?.permissions;
    if (!permissions) return [];
    return [
      { label: 'Clientes', enabled: permissions.canEditClients, detail: permissions.canEditClients ? 'Consultar y actualizar perfiles' : 'Acceso de consulta según asignación' },
      { label: 'Rutinas', enabled: permissions.canCreateRoutines, detail: permissions.canCreateRoutines ? 'Crear y editar planes del gimnasio' : 'Sin permiso para crear planes' },
      { label: 'Pagos', enabled: permissions.canViewPayments, detail: permissions.canViewPayments ? 'Consultar vencimientos y mensualidades' : 'Información financiera restringida' },
      { label: 'Personal', enabled: permissions.canManageStaff, detail: permissions.canManageStaff ? 'Administrar roles y permisos' : 'Administración reservada al propietario' }
    ];
  });

  async ngOnInit(): Promise<void> {
    if (this.route.snapshot.queryParamMap.get('joined') === '1') {
      this.notice.set('Ya formas parte del gimnasio. Tu acceso quedó listo.');
    } else if (this.route.snapshot.queryParamMap.get('created') === '1') {
      this.notice.set('Tu gimnasio quedó creado. Ya puedes agregar clientes e invitar a tu equipo.');
    } else if (this.route.snapshot.queryParamMap.get('access') === 'permission-required') {
      this.notice.set('Tu rol no permite abrir esa sección. Puedes continuar desde este panel.');
    }
    await this.load();
  }

  async load(): Promise<void> {
    const userId = this.auth.user()?.id;
    const gymId = this.route.snapshot.paramMap.get('id');
    if (!userId || !gymId) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.ensureCoachProfileForCurrentUser();
      const profile = await this.coachData.getProfile(userId);
      await this.gyms.loadAccessibleGyms(userId, profile.role);
      const context = this.gyms.activateGym(gymId, userId);
      if (!context) throw new Error('Acceso no disponible');
      this.data.set(await this.gyms.loadDashboard(context));
    } catch {
      this.data.set(null);
      this.error.set('No pudimos cargar el gimnasio. Revisa tu conexión o selecciona otro espacio.');
    } finally {
      this.loading.set(false);
    }
  }

  async copyAccessCode(): Promise<void> {
    const code = this.context()?.gym.accessCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(true);
      window.setTimeout(() => this.copied.set(false), 2200);
    } catch {
      this.notice.set(`Código del gimnasio: ${code}`);
    }
  }
}
