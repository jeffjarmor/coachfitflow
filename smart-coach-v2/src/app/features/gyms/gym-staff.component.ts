import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';
import { gymHome } from './gym-access.guard';
import { CustomSelectComponent } from '../../shared/custom-select.component';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CoachDataService } from '../../core/data/coach-data.service';
import { GymContextService } from './gym-context.service';
import { EditableGymStaffRole, GymStaffInput, GymStaffMember, GymStaffPermissions } from './gym-staff.models';
import { GymStaffService } from './gym-staff.service';

@Component({
  selector: 'app-gym-staff',
  standalone: true,
  imports: [ListPaginationComponent, ReactiveFormsModule, RouterLink, CustomSelectComponent],
  templateUrl: './gym-staff.component.html',
  styleUrl: './gym-staff.component.scss'
})
export class GymStaffComponent implements OnInit {
  readonly pagination = createListPagination(() => this.filteredMembers(), () => this.search());

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly coachData = inject(CoachDataService);
  private readonly gyms = inject(GymContextService);
  private readonly staffData = inject(GymStaffService);

  readonly gymId = this.route.snapshot.paramMap.get('id') || '';
  readonly context = this.gyms.activeGym;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly search = signal('');
  readonly members = signal<GymStaffMember[]>([]);
  readonly dialogOpen = signal(false);
  readonly editingMember = signal<GymStaffMember | null>(null);
  readonly removeTarget = signal<GymStaffMember | null>(null);
  readonly copied = signal(false);
  readonly canGrantOwner = computed(() => {
    const role = this.context()?.role;
    return role === 'owner' || role === 'admin';
  });
  readonly staffRoleSelectOptions = computed(() => [
    { value: 'trainer', label: 'Entrenador' },
    { value: 'receptionist', label: 'Recepción' },
    ...(this.canGrantOwner() ? [{ value: 'owner', label: 'Copropietario' }] : [])
  ]);
  readonly filteredMembers = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('es');
    if (!query) return this.members();
    return this.members().filter((member) =>
      `${member.name} ${member.email} ${this.roleLabel(member)}`.toLocaleLowerCase('es').includes(query)
    );
  });
  readonly metrics = computed(() => ({
    total: this.members().length,
    owners: this.members().filter((member) => member.role === 'owner').length,
    trainers: this.members().filter((member) => member.role === 'trainer').length,
    reception: this.members().filter((member) => member.role === 'receptionist').length
  }));

  readonly staffForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    role: ['trainer' as EditableGymStaffRole, Validators.required],
    canEditClients: [true],
    canCreateRoutines: [true],
    canViewPayments: [false],
    canManageStaff: [false]
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    if (!this.gymId) return;
    this.loading.set(true);
    this.error.set('');
    try {
      this.members.set(await this.staffData.load(this.gymId, this.context()?.gym.ownerId));
    } catch {
      this.error.set('No pudimos cargar el equipo. Revisa tu conexión e inténtalo nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  openEdit(member: GymStaffMember): void {
    if (!this.canModify(member)) return;
    this.editingMember.set(member);
    this.staffForm.reset({
      email: member.email,
      role: member.role,
      canEditClients: member.permissions.canEditClients,
      canCreateRoutines: member.permissions.canCreateRoutines,
      canViewPayments: member.permissions.canViewPayments,
      canManageStaff: member.permissions.canManageStaff
    });
    this.staffForm.controls.email.disable();
    this.updatePermissionControlState(member.role);
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    if (!this.saving()) {
      this.dialogOpen.set(false);
      this.editingMember.set(null);
      this.staffForm.controls.email.enable();
    }
  }

  applyRolePreset(): void {
    const role = this.staffForm.controls.role.value;
    const preset = this.permissionsForRole(role);
    this.staffForm.patchValue(preset);
    this.updatePermissionControlState(role);
  }

  async submit(): Promise<void> {
    if (!this.editingMember() || !this.canGrantOwner()) return;
    if (this.staffForm.invalid || this.saving()) {
      this.staffForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const member = this.editingMember();
    const value = this.staffForm.getRawValue();
    const input: GymStaffInput = {
      email: value.email,
      role: value.role,
      permissions: {
        canEditClients: value.canEditClients,
        canCreateRoutines: value.canCreateRoutines,
        canViewPayments: value.canViewPayments,
        canManageStaff: value.canManageStaff
      }
    };
    try {
      if (!member) return;
      await this.staffData.update(this.gymId, member.coachId, input);
      this.dialogOpen.set(false);
      this.editingMember.set(null);
      this.staffForm.controls.email.enable();
      await this.refreshContextAndList();
      this.notice.set(member ? `El acceso de ${member.name} quedó actualizado.` : 'La persona se agregó al equipo.');
    } catch (error) {
      this.error.set(this.humanError(error));
    } finally {
      this.saving.set(false);
    }
  }

  requestRemove(member: GymStaffMember): void {
    if (this.canRemove(member)) this.removeTarget.set(member);
  }

  async confirmRemove(): Promise<void> {
    const member = this.removeTarget();
    if (!member || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.staffData.remove(this.gymId, member.coachId);
      this.removeTarget.set(null);
      const stayed = await this.refreshContextAndList();
      if (stayed) this.notice.set(`${member.name} ya no forma parte de este gimnasio.`);
    } catch (error) {
      this.error.set(this.humanError(error));
    } finally {
      this.saving.set(false);
    }
  }

  canModify(member: GymStaffMember): boolean {
    if (member.primaryOwner) return false;
    return this.canGrantOwner();
  }

  canRemove(member: GymStaffMember): boolean {
    return !member.primaryOwner && (this.canGrantOwner() || (member.role !== 'owner' && !member.permissions.canManageStaff));
  }

  roleLabel(member: GymStaffMember): string {
    if (member.primaryOwner) return 'Dueño principal';
    if (member.role === 'owner') return 'Copropietario';
    if (member.role === 'receptionist') return 'Recepción';
    return 'Entrenador';
  }

  permissionLabels(member: GymStaffMember): string[] {
    const labels: string[] = [];
    if (member.permissions.canEditClients) labels.push('Clientes');
    if (member.permissions.canCreateRoutines) labels.push('Rutinas');
    if (member.permissions.canViewPayments) labels.push('Pagos');
    if (member.permissions.canManageStaff) labels.push('Personal');
    return labels;
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(value));
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

  private permissionsForRole(role: EditableGymStaffRole): GymStaffPermissions {
    if (role === 'owner') {
      return { canEditClients: true, canCreateRoutines: true, canViewPayments: true, canManageStaff: true };
    }
    if (role === 'receptionist') {
      return { canEditClients: true, canCreateRoutines: false, canViewPayments: true, canManageStaff: false };
    }
    return { canEditClients: true, canCreateRoutines: true, canViewPayments: false, canManageStaff: false };
  }

  private updatePermissionControlState(role: EditableGymStaffRole): void {
    const operationalControls = [
      this.staffForm.controls.canEditClients,
      this.staffForm.controls.canCreateRoutines,
      this.staffForm.controls.canViewPayments
    ];
    for (const control of operationalControls) role === 'owner' ? control.disable() : control.enable();
    if (role === 'owner' || !this.canGrantOwner()) {
      this.staffForm.controls.canManageStaff.disable();
      if (!this.canGrantOwner()) this.staffForm.controls.canManageStaff.setValue(false);
    } else {
      this.staffForm.controls.canManageStaff.enable();
    }
  }

  private async refreshContextAndList(): Promise<boolean> {
    const userId = this.auth.user()?.id;
    if (!userId) return false;
    const profile = await this.coachData.getProfile(userId);
    await this.gyms.loadAccessibleGyms(userId, profile.role, true);
    const context = this.gyms.activateGym(this.gymId, userId);
    if (!context) {
      await this.router.navigate(['/gyms']);
      return false;
    }
    if (!context.permissions.canManageStaff) {
      await this.router.navigate(gymHome(context), { queryParams: { access: 'permission-required' } });
      return false;
    }
    await this.load();
    return true;
  }

  private humanError(error: unknown): string {
    const message = error instanceof Error ? error.message.toLocaleLowerCase('es') : '';
    if (message.includes('coach account not found')) {
      return 'No encontramos una cuenta de entrenador con ese correo. Comparte el código para que se una primero.';
    }
    if (message.includes('already gym staff') || message.includes('duplicate')) {
      return 'Esta persona ya forma parte del gimnasio.';
    }
    if (message.includes('primary owner')) {
      return 'El dueño principal no se puede modificar ni retirar desde Personal.';
    }
    if (message.includes('owner') || message.includes('permission') || message.includes('insufficient')) {
      return 'Tu acceso no permite realizar ese cambio. Un propietario puede revisar los permisos.';
    }
    return 'No pudimos guardar el cambio. Revisa los datos e inténtalo nuevamente.';
  }
}
