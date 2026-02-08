import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, startWith, tap } from 'rxjs/operators';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { GymService } from '../../../services/gym.service';
import { ToastService } from '../../../services/toast.service';
import { GymCoach } from '../../../models/gym-coach.model';
import { Gym } from '../../../models/gym.model';
import { ButtonComponent } from '../../../components/ui/button/button.component';

@Component({
  selector: 'app-gym-staff',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, ButtonComponent, ReactiveFormsModule],
  templateUrl: './gym-staff.component.html',
  styleUrls: ['./gym-staff.component.scss']
})
export class GymStaffComponent {
  private route = inject(ActivatedRoute);
  private gymService = inject(GymService);
  private toastService = inject(ToastService);

  gymId = signal<string>('');
  gym = signal<Gym | null>(null);
  staff = signal<GymCoach[]>([]);
  loading = signal(true);

  showInviteModal = signal(false);

  // Search
  searchControl = new FormControl('');
  searchQuery = toSignal(
    this.searchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      distinctUntilChanged(),
      tap(() => this.currentPage.set(1))
    ),
    { initialValue: '' }
  );

  // Pagination
  currentPage = signal(1);
  itemsPerPage = 10;

  // Computed: Filtered Staff
  filteredStaff = computed(() => {
    const query = this.searchQuery()?.toLowerCase() || '';
    const all = this.staff();

    if (!query) return all;

    return all.filter(coach =>
      coach.name.toLowerCase().includes(query) ||
      coach.email.toLowerCase().includes(query)
    );
  });

  // Computed: Paginated
  paginatedStaff = computed(() => {
    const staff = this.filteredStaff();
    const start = (this.currentPage() - 1) * this.itemsPerPage;
    return staff.slice(start, start + this.itemsPerPage);
  });

  totalPages = computed(() => Math.ceil(this.filteredStaff().length / this.itemsPerPage) || 1);

  constructor() {
    this.route.params.subscribe(params => {
      this.gymId.set(params['id']);
      this.loadData();
    });
  }

  async loadData() {
    const id = this.gymId();
    if (!id) return;

    try {
      this.loading.set(true);
      // Load both Gym Info (for access code) and Staff
      const [staffList, gymInfo] = await Promise.all([
        this.gymService.getGymCoaches(id),
        this.gymService.getGym(id)
      ]);

      // Filter out admins (super-admins) so they don't appear in the gym staff list
      const filteredStaff = staffList.filter(s => (s.role as string) !== 'admin');

      this.staff.set(filteredStaff);
      this.gym.set(gymInfo || null);

    } catch (error) {
      console.error('Error loading data', error);
    } finally {
      this.loading.set(false);
    }
  }

  inviteStaff() {
    this.showInviteModal.set(true);
  }

  closeInviteModal() {
    this.showInviteModal.set(false);
  }

  copyAccessCode() {
    const code = this.gym()?.accessCode;
    if (code) {
      navigator.clipboard.writeText(code).then(() => {
        this.toastService.success('Código copiado al portapapeles');
      });
    }
  }

  async removeStaff(member: GymCoach) {
    if (!confirm(`¿Estás seguro de que deseas eliminar a ${member.name} del gimnasio? esta acción no se puede deshacer.`)) {
      return;
    }

    const gymId = this.gymId();
    if (!gymId) return;

    try {
      this.loading.set(true);
      await this.gymService.removeCoachFromGym(gymId, member.coachId);

      // Refresh list
      await this.loadData();
      this.toastService.success(`${member.name} ha sido eliminado del gimnasio.`);

    } catch (error) {
      console.error('Error removing staff:', error);
      this.toastService.error('Error al eliminar personal. Inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      'owner': 'Dueño',
      'trainer': 'Entrenador',
      'receptionist': 'Recepcionista'
    };
    return labels[role] || role;
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) this.currentPage.update(p => p + 1);
  }

  prevPage() {
    if (this.currentPage() > 1) this.currentPage.update(p => p - 1);
  }
}
