import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CoachService } from '../../../services/coach.service';
import { AdminService } from '../../../services/admin.service';
import { Coach } from '../../../models/coach.model';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { ConfirmService } from '../../../services/confirm.service';
import { ToastService } from '../../../services/toast.service';

@Component({
    selector: 'app-admin-dashboard',
    standalone: true,
    imports: [CommonModule, ButtonComponent, PageHeaderComponent],
    template: `
        <div class="admin-dashboard">
            <app-page-header 
                title="Panel de Administración" 
                subtitle="Gestiona los coaches y ejercicios del sistema"
                [showBackButton]="false">
                <div headerActions>
                    <app-button (click)="navigateToExercises()">
                        Gestionar Ejercicios Globales
                    </app-button>
                </div>
            </app-page-header>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon coaches">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                    </div>
                    <div class="stat-info">
                        <span class="stat-label">Total Coaches</span>
                        <span class="stat-value">{{ coaches().length }}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon clients">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                        </svg>
                    </div>
                    <div class="stat-info">
                        <span class="stat-label">Total Clientes</span>
                        <span class="stat-value">{{ totalClients() }}</span>
                    </div>
                </div>
            </div>

            <div class="coaches-section">
                <h2>Coaches Registrados</h2>
                
                <div class="coaches-grid" *ngIf="!loading(); else loadingTpl">
                    <div class="coach-card" *ngFor="let coach of paginatedCoaches()">
                        <div class="coach-info">
                            <div class="coach-avatar">
                                {{ coach.name.charAt(0).toUpperCase() }}
                            </div>
                            <div class="coach-details">
                                <h3>{{ coach.name }}</h3>
                                <p class="email">{{ coach.email }}</p>
                                <span class="role-badge" [class.admin]="coach.role === 'admin'">
                                    {{ coach.role === 'admin' ? 'Administrador' : 'Coach' }}
                                </span>
                            </div>
                        </div>
                        
                        <div class="coach-actions">
                            <app-button variant="secondary" size="small" (click)="viewClients(coach.id)">
                                Ver Detalles
                            </app-button>
                            <button class="btn-icon" (click)="deleteCoach(coach)" title="Eliminar Coach">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Pagination Controls -->
                <div class="pagination" *ngIf="totalPages() > 1 && !loading()">
                    <button 
                        class="page-btn" 
                        [disabled]="currentPage() === 1"
                        (click)="prevPage()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                    </button>
                    
                    <span class="page-info">
                        Página {{ currentPage() }} de {{ totalPages() }}
                    </span>

                    <button 
                        class="page-btn" 
                        [disabled]="currentPage() === totalPages()"
                        (click)="nextPage()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </button>
                </div>

                <ng-template #loadingTpl>
                    <div class="loading-state">
                        <div class="spinner"></div>
                        <p>Cargando información...</p>
                    </div>
                </ng-template>
            </div>
        </div>
    `,
    styles: [`
        .admin-dashboard {
            min-height: 100vh;
            background: #f9fafb;
            padding-bottom: 80px;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 16px;
            padding: 0 24px;
            max-width: 1200px;
            margin: 0 auto 24px auto;

            @media (max-width: 640px) {
                padding: 16px 16px;
            }
        }

        .stat-card {
            background: white;
            border-radius: 16px;
            padding: 20px;
            display: flex;
            align-items: center;
            gap: 16px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            border: 1px solid #f3f4f6;
        }

        .stat-icon {
            width: 48px;
            height: 48px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            
            &.coaches {
                background: #eff6ff;
                color: #3b82f6;
            }

            &.clients {
                background: #ecfdf5;
                color: #10b981;
            }
        }

        .stat-info {
            display: flex;
            flex-direction: column;
        }

        .stat-label {
            font-size: 14px;
            color: #6b7280;
            font-weight: 500;
        }

        .stat-value {
            font-size: 24px;
            color: #111827;
            font-weight: 700;
        }

        .coaches-section {
            padding: 0 24px 24px 24px;
            max-width: 1200px;
            margin: 0 auto;

            @media (max-width: 640px) {
                padding: 0 16px 16px 16px;
            }

            h2 {
                font-size: 20px;
                font-weight: 700;
                color: #111827;
                margin: 0 0 16px 0;
            }
        }

        .coaches-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }

        .coach-card {
            background: white;
            border-radius: 16px;
            padding: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            display: flex;
            flex-direction: column;
            gap: 16px;
            border: 1px solid #f3f4f6;
            transition: transform 0.2s;

            &:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            }
        }

        .coach-info {
            display: flex;
            gap: 16px;
            align-items: center;
        }

        .coach-avatar {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 700;
            font-size: 24px;
            background: #3b82f6;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            flex-shrink: 0;
        }

        .coach-details {
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
                margin: 0 0 8px 0;
                font-size: 14px;
                color: #6b7280;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .role-badge {
                display: inline-flex;
                align-items: center;
                padding: 2px 10px;
                border-radius: 9999px;
                font-size: 12px;
                font-weight: 500;
                background: #f3f4f6;
                color: #4b5563;

                &.admin {
                    background: #dbeafe;
                    color: #1e40af;
                }
            }
        }

        .coach-actions {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-top: 16px;
            border-top: 1px solid #f3f4f6;
            margin-top: auto;
        }

        .btn-icon {
            background: none;
            border: none;
            cursor: pointer;
            padding: 8px;
            border-radius: 8px;
            transition: all 0.2s;
            color: #9ca3af;
            display: flex;
            align-items: center;
            justify-content: center;

            &:hover {
                background: #fee2e2;
                color: #ef4444;
            }
        }

        .pagination {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 16px;
            margin-top: 24px;
        }

        .page-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
            background: white;
            color: #374151;
            cursor: pointer;
            transition: all 0.2s;

            &:hover:not(:disabled) {
                background: #f3f4f6;
                color: #111827;
            }

            &:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
        }

        .page-info {
            font-size: 14px;
            font-weight: 500;
            color: #6b7280;
        }

        .loading-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 64px 24px;
            color: #6b7280;

            .spinner {
                width: 40px;
                height: 40px;
                border: 3px solid #e5e7eb;
                border-top-color: #2563eb;
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
export class AdminDashboardComponent implements OnInit {
    private coachService = inject(CoachService);
    private adminService = inject(AdminService);
    private router = inject(Router);
    private confirmService = inject(ConfirmService);
    private toastService = inject(ToastService);

    coaches = signal<Coach[]>([]);
    totalClients = signal<number>(0);
    loading = signal<boolean>(true);

    // Pagination
    currentPage = signal<number>(1);
    pageSize = signal<number>(12);

    paginatedCoaches = computed(() => {
        const startIndex = (this.currentPage() - 1) * this.pageSize();
        const endIndex = startIndex + this.pageSize();
        return this.coaches().slice(startIndex, endIndex);
    });

    totalPages = computed(() => {
        return Math.ceil(this.coaches().length / this.pageSize());
    });

    async ngOnInit() {
        await this.loadData();
    }

    async loadData() {
        try {
            this.loading.set(true);
            const [coachesData, clientsData] = await Promise.all([
                this.coachService.getAllCoaches(),
                this.adminService.getAllClients()
            ]);

            this.coaches.set(coachesData);
            this.totalClients.set(clientsData.length);
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            this.toastService.error('Error al cargar los datos');
        } finally {
            this.loading.set(false);
        }
    }

    nextPage() {
        if (this.currentPage() < this.totalPages()) {
            this.currentPage.update(p => p + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    prevPage() {
        if (this.currentPage() > 1) {
            this.currentPage.update(p => p - 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    navigateToExercises() {
        this.router.navigate(['/exercises/admin']);
    }

    viewClients(coachId: string) {
        this.router.navigate(['/admin/coaches', coachId]);
    }

    async deleteCoach(coach: Coach) {
        const confirmed = await this.confirmService.confirm({
            title: '¿Eliminar Coach?',
            message: `¿Estás seguro de que deseas eliminar a ${coach.name}? Esta acción no se puede deshacer.`,
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            type: 'danger'
        });

        if (confirmed) {
            try {
                await this.coachService.deleteCoach(coach.id);
                this.toastService.success('Coach eliminado correctamente');
                await this.loadData();
            } catch (error) {
                console.error('Error deleting coach:', error);
                this.toastService.error('Error al eliminar el coach');
            }
        }
    }
}
