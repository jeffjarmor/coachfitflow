import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs/operators';
import { ClientService } from '../../../services/client.service';
import { CoachService } from '../../../services/coach.service';
import { Client } from '../../../models/client.model';
import { Coach } from '../../../models/coach.model';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { ToastService } from '../../../services/toast.service';

@Component({
    selector: 'app-coach-clients',
    standalone: true,
    imports: [CommonModule, ButtonComponent, PageHeaderComponent, ReactiveFormsModule],
    template: `
        <div class="coach-clients-page">
            <app-page-header 
                [title]="'Clientes de ' + (coach()?.name || 'Coach')"
                [subtitle]="coach()?.email || ''"
                [showBackButton]="true"
                backRoute="/admin/coaches">
            </app-page-header>

            <div class="search-container">
                <div class="search-input-wrapper">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input 
                        [formControl]="searchControl"
                        type="text" 
                        placeholder="Buscar por nombre o correo..."
                        class="search-input">
                </div>
            </div>

            <div class="clients-grid" *ngIf="!loading(); else loadingTpl">
                <div class="client-card" *ngFor="let client of filteredClients()">
                    <div class="client-info">
                        <div class="client-avatar">
                            {{ client.name.charAt(0).toUpperCase() }}
                        </div>
                        <div class="client-details">
                            <h3>{{ client.name }}</h3>
                            <p class="email">{{ client.email }}</p>
                            <p class="meta">
                                Registrado: {{ client.createdAt | date:'mediumDate' }}
                            </p>
                        </div>
                    </div>
                    
                    <div class="client-actions">
                        <app-button variant="secondary" size="small" (click)="viewClientDetails(client.id)">
                            Ver Detalles
                        </app-button>
                    </div>
                </div>

                <div class="empty-state" *ngIf="filteredClients().length === 0">
                    <p *ngIf="clients().length === 0">Este coach no tiene clientes registrados.</p>
                    <p *ngIf="clients().length > 0">No se encontraron clientes con esa búsqueda.</p>
                </div>
            </div>

            <ng-template #loadingTpl>
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Cargando clientes...</p>
                </div>
            </ng-template>
        </div>
    `,
    styles: [`
        .coach-clients-page {
            padding: 24px;
            max-width: 1200px;
            margin: 0 auto;
            padding-bottom: 80px;
            
            @media (max-width: 640px) {
                padding: 16px;
            }
        }

        .search-container {
            margin-bottom: 24px;
        }

        .search-input-wrapper {
            position: relative;
            
            .search-icon {
                position: absolute;
                left: 16px;
                top: 50%;
                transform: translateY(-50%);
                color: #9ca3af;
                pointer-events: none;
            }

            .search-input {
                width: 100%;
                padding: 12px 16px 12px 48px;
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                font-size: 16px;
                color: #1f2937;
                background: white;
                transition: all 0.2s;

                &:focus {
                    outline: none;
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }

                &::placeholder {
                    color: #9ca3af;
                }
            }
        }

        .clients-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 16px;
        }

        .client-card {
            background: white;
            border-radius: 16px;
            padding: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            display: flex;
            flex-direction: column;
            gap: 16px;
            border: 1px solid #f3f4f6;
        }

        .client-info {
            display: flex;
            gap: 16px;
            align-items: center;
        }

        .client-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: #e0e7ff;
            color: #4338ca;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 20px;
            flex-shrink: 0;
        }

        .client-details {
            flex: 1;
            min-width: 0;

            h3 {
                margin: 0 0 4px 0;
                font-size: 16px;
                font-weight: 600;
                color: #111827;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .email {
                margin: 0 0 4px 0;
                font-size: 14px;
                color: #6b7280;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .meta {
                margin: 0;
                font-size: 12px;
                color: #9ca3af;
            }
        }

        .client-actions {
            padding-top: 16px;
            border-top: 1px solid #f3f4f6;
            display: flex;
            justify-content: flex-end;
        }

        .empty-state, .loading-state {
            text-align: center;
            padding: 48px 24px;
            color: #6b7280;
            background: #f9fafb;
            border-radius: 12px;
            border: 1px dashed #e5e7eb;
        }

        .loading-state {
            display: flex;
            flex-direction: column;
            align-items: center;

            .spinner {
                width: 32px;
                height: 32px;
                border: 3px solid #e5e7eb;
                border-top-color: #3b82f6;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-bottom: 16px;
            }
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `]
})
export class CoachClientsComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private clientService = inject(ClientService);
    private coachService = inject(CoachService);
    private toastService = inject(ToastService);

    coachId = signal<string>('');
    coach = signal<Coach | null>(null);
    clients = signal<Client[]>([]);
    loading = signal<boolean>(true);

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

    // Filtered clients
    filteredClients = computed(() => {
        const query = this.searchQuery()?.toLowerCase() || '';
        const allClients = this.clients();

        if (!query) return allClients;

        return allClients.filter(client =>
            client.name.toLowerCase().includes(query) ||
            client.email.toLowerCase().includes(query)
        );
    });

    async ngOnInit() {
        this.route.params.subscribe(async params => {
            const id = params['id'];
            if (id) {
                this.coachId.set(id);
                await this.loadData(id);
            }
        });
    }

    async loadData(coachId: string) {
        try {
            this.loading.set(true);

            // Load coach details
            const coachData = await this.coachService.getCoachProfile(coachId);
            this.coach.set(coachData);

            // Load clients
            const clientsData = await this.clientService.getClients(coachId);
            this.clients.set(clientsData);
        } catch (error) {
            console.error('Error loading data:', error);
            this.toastService.error('Error al cargar la información');
        } finally {
            this.loading.set(false);
        }
    }

    viewClientDetails(clientId: string) {
        // Navigate to client detail
        // Note: ClientDetailComponent might need updates to handle admin view if it relies on auth context
        console.log('View client:', clientId);
        // this.router.navigate(['/clients', clientId]); 
    }
}
