import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CoachService } from '../../../services/coach.service';
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

            <div class="coaches-section">
                <h2>Coaches Registrados</h2>
                
                <div class="coaches-grid" *ngIf="!loading(); else loadingTpl">
                    <div class="coach-card" *ngFor="let coach of coaches()">
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
                                Ver Clientes
                            </app-button>
                            <button class="btn-icon" (click)="deleteCoach(coach)" title="Eliminar Coach">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <ng-template #loadingTpl>
                    <div class="loading-state">
                        <div class="spinner"></div>
                        <p>Cargando coaches...</p>
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

        .coaches-section {
            padding: 24px;
            max-width: 1200px;
            margin: 0 auto;

            @media (max-width: 640px) {
                padding: 16px;
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
    private router = inject(Router);
    private confirmService = inject(ConfirmService);
    private toastService = inject(ToastService);

    coaches = signal<Coach[]>([]);
    loading = signal<boolean>(true);

    async ngOnInit() {
        await this.loadCoaches();
    }

    async loadCoaches() {
        try {
            this.loading.set(true);
            const data = await this.coachService.getAllCoaches();
            this.coaches.set(data);
        } catch (error) {
            console.error('Error loading coaches:', error);
            this.toastService.error('Error al cargar los coaches');
        } finally {
            this.loading.set(false);
        }
    }

    navigateToExercises() {
        this.router.navigate(['/exercises/admin']);
    }

    viewClients(coachId: string) {
        this.router.navigate(['/admin/coaches', coachId, 'clients']);
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
                await this.loadCoaches();
            } catch (error) {
                console.error('Error deleting coach:', error);
                this.toastService.error('Error al eliminar el coach');
            }
        }
    }
}
