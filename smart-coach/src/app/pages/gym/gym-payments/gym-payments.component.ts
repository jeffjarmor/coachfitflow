import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, startWith, tap } from 'rxjs/operators';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { PaymentService } from '../../../services/payment.service';
import { ClientService } from '../../../services/client.service';
import { Client } from '../../../models/client.model';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { CreatePaymentData } from '../../../models/payment.model';

@Component({
  selector: 'app-gym-payments',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, ButtonComponent, ReactiveFormsModule],
  templateUrl: './gym-payments.component.html',
  styleUrls: ['./gym-payments.component.scss']
})
export class GymPaymentsComponent {
  private route = inject(ActivatedRoute);
  private paymentService = inject(PaymentService);
  private clientService = inject(ClientService);

  gymId = signal<string>('');
  clients = signal<Client[]>([]);
  loading = signal(true);

  // Search & Filter
  searchControl = new FormControl('');
  filterStatus = signal<'all' | 'overdue' | 'due-soon' | 'paid'>('all');

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

  // Computed: Filtered Clients
  filteredClients = computed(() => {
    const query = this.searchQuery()?.toLowerCase() || '';
    const status = this.filterStatus();
    const all = this.clients();

    return all.filter(c => {
      // 1. Filter by Search Text
      const matchesSearch = !query ||
        c.name.toLowerCase().includes(query) ||
        c.email.toLowerCase().includes(query);

      // 2. Filter by Status
      let matchesStatus = true;
      if (status !== 'all') {
        const clientStatus = this.getClientStatus(c);
        matchesStatus = clientStatus === status;
      }

      return matchesSearch && matchesStatus;
    });
  });

  // Computed: Paginated
  paginatedClients = computed(() => {
    const clients = this.filteredClients();
    const start = (this.currentPage() - 1) * this.itemsPerPage;
    return clients.slice(start, start + this.itemsPerPage);
  });

  totalPages = computed(() => Math.ceil(this.filteredClients().length / this.itemsPerPage) || 1);

  // Filter Actions
  setFilter(status: 'all' | 'overdue' | 'due-soon' | 'paid') {
    this.filterStatus.set(status);
    this.currentPage.set(1); // Reset to first page
  }

  constructor() {
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.gymId.set(params['id']);
        this.loadClients();
      }
    });
  }

  async loadClients() {
    const id = this.gymId();
    if (!id) return;

    try {
      this.loading.set(true);
      const clientsData = await this.clientService.getGymClients(id);
      this.clients.set(clientsData);
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      this.loading.set(false);
    }
  }

  // Helper to determine status for UI
  getClientStatus(client: Client): 'overdue' | 'due-soon' | 'paid' {
    if (!client.nextPaymentDueDate) return 'overdue'; // Default if no date

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const date = client.nextPaymentDueDate instanceof Date ? client.nextPaymentDueDate : new Date(client.nextPaymentDueDate);

    // If older than today -> Overdue
    if (date < now) return 'overdue';

    // If within next 3 days -> Due Soon
    const threeDays = new Date(now);
    threeDays.setDate(now.getDate() + 3);

    if (date <= threeDays) return 'due-soon';

    return 'paid';
  }

  async updateDueDate(client: Client, event: any) {
    const newDateStr = event.target.value;
    if (!newDateStr) return;

    const newDate = new Date(newDateStr);
    // Adjust logic if needed (e.g. set time to end of day or keep 00:00)
    // Firestore stores Date or Timestamp.

    try {
      await this.clientService.updateGymClient(this.gymId(), client.id, {
        nextPaymentDueDate: newDate
      });
      // Reload to refresh UI/Sort if needed, or simple local update
      await this.loadClients();
    } catch (err) {
      console.error("Error updating date", err);
    }
  }

  async registerPayment(client: Client) {
    if (!confirm(`¿Registrar pago para ${client.name}? Esto extenderá su fecha 1 mes.`)) return;

    try {
      this.loading.set(true);
      const paymentData: CreatePaymentData = {
        clientId: client.id || '',
        amount: 0,
        method: 'cash',
        notes: 'Mensualidad',
        dueDate: new Date()
      };

      await this.paymentService.registerPayment(this.gymId(), paymentData);
      await this.loadClients();

    } catch (error) {
      console.error('Error registering payment', error);
    } finally {
      this.loading.set(false);
    }
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) this.currentPage.update(p => p + 1);
  }

  prevPage() {
    if (this.currentPage() > 1) this.currentPage.update(p => p - 1);
  }
}
