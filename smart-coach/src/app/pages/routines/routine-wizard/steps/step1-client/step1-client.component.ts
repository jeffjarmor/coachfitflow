import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs/operators';
import { ClientService } from '../../../../../services/client.service';
import { RoutineService } from '../../../../../services/routine.service';
import { AuthService } from '../../../../../services/auth.service';
import { CoachService } from '../../../../../services/coach.service';
import { Client } from '../../../../../models/client.model';

@Component({
  selector: 'app-step1-client',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="step-container">
      <h2>Seleccionar Cliente</h2>
      <p class="subtitle">¿Para quién es esta rutina?</p>

      <div class="search-box">
        <span class="icon">🔍</span>
        <input 
          type="text" 
          [formControl]="searchControl" 
          placeholder="Buscar clientes..."
        >
      </div>

      <div class="clients-list">
        <div 
          *ngFor="let client of filteredClients()" 
          class="client-item"
          [class.selected]="selectedClientId() === client.id"
          (click)="selectClient(client)"
        >
          <div class="avatar">{{ client.name.charAt(0).toUpperCase() }}</div>
          <div class="info">
            <h3>{{ client.name }}</h3>
            <p>{{ client.email }}</p>
          </div>
          <div class="check" *ngIf="selectedClientId() === client.id">✓</div>
        </div>

        <div *ngIf="filteredClients().length === 0" class="no-results">
          <p>No se encontraron clientes.</p>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./step1-client.component.scss']
})
export class Step1ClientComponent {
  private clientService = inject(ClientService);
  private routineService = inject(RoutineService);
  private authService = inject(AuthService);
  private coachService = inject(CoachService);

  searchControl = new FormControl('');
  searchQuery = toSignal(
    this.searchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      distinctUntilChanged()
    ),
    { initialValue: '' }
  );

  clients = signal<Client[]>([]);
  selectedClientId = computed(() => this.routineService.wizardState().clientId);

  filteredClients = computed(() => {
    const query = this.searchQuery()?.toLowerCase() || '';
    return this.clients().filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.email.toLowerCase().includes(query)
    );
  });

  constructor() {
    this.loadClients();
  }

  async loadClients() {
    const userId = this.authService.getCurrentUserId();
    if (userId) {
      // Check if coach belongs to a gym
      const coach = await this.coachService.getCoachProfile(userId);
      const gymId = coach?.gymId;

      // Load clients (personal or gym clients based on gymId)
      const data = await this.clientService.getClients(userId, gymId);
      this.clients.set(data);
    }
  }

  selectClient(client: Client) {
    this.routineService.updateWizardState({
      clientId: client.id,
      clientName: client.name // Store name for easier display later
    });
  }
}
