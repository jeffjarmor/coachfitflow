import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CoachService } from '../../../services/coach.service';
import { AdminService } from '../../../services/admin.service';
import { GymService } from '../../../services/gym.service';
import { Coach } from '../../../models/coach.model';
import { Gym } from '../../../models/gym.model';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { ConfirmService } from '../../../services/confirm.service';
import { ToastService } from '../../../services/toast.service';

interface CoachWithStats extends Coach {
    clientCount: number;
    routineCount: number;
}

type TabType = 'resumen' | 'gyms' | 'personal' | 'owners' | 'staff';

@Component({
    selector: 'app-admin-dashboard',
    standalone: true,
    imports: [CommonModule, ButtonComponent, PageHeaderComponent],
    template: `
        <div class="admin-dashboard">
            <app-page-header 
                title="Panel de Administración" 
                subtitle="Gestión centralizada de Gimnasios y Entrenadores"
                [backRoute]="'/dashboard'">
                <div headerActions>
                    <app-button (click)="navigateToCreateGym()" variant="secondary" class="desktop-only">
                        🏋️ Crear Gimnasio
                    </app-button>
                    <app-button (click)="navigateToExercises()" variant="primary" class="desktop-only">
                        Gestionar Ejercicios Globales
                    </app-button>
                </div>
            </app-page-header>

            <div class="page-content">
                <!-- Stats Overview -->
                <div class="stats-grid">
                    <div class="stat-card" [class.active]="activeTab() === 'gyms'" (click)="setActiveTab('gyms')">
                        <div class="stat-icon gyms">🏢</div>
                        <div class="stat-info">
                            <span class="stat-label">Gimnasios</span>
                            <span class="stat-value">{{ gyms().length }}</span>
                        </div>
                    </div>
                    <div class="stat-card" [class.active]="activeTab() === 'owners'" (click)="setActiveTab('owners')">
                        <div class="stat-icon owners">👑</div>
                        <div class="stat-info">
                            <span class="stat-label">Dueños de Gym</span>
                            <span class="stat-value">{{ gymOwners().length }}</span>
                        </div>
                    </div>
                    <div class="stat-card" [class.active]="activeTab() === 'staff'" (click)="setActiveTab('staff')">
                        <div class="stat-icon staff">👷</div>
                        <div class="stat-info">
                            <span class="stat-label">Staff de Gym</span>
                            <span class="stat-value">{{ gymStaff().length }}</span>
                        </div>
                    </div>
                    <div class="stat-card" [class.active]="activeTab() === 'personal'" (click)="setActiveTab('personal')">
                        <div class="stat-icon personal">🏃</div>
                        <div class="stat-info">
                            <span class="stat-label">Entrenadores Personales</span>
                            <span class="stat-value">{{ personalCoaches().length }}</span>
                        </div>
                    </div>
                    <div class="stat-card total">
                        <div class="stat-icon clients">👥</div>
                        <div class="stat-info">
                            <span class="stat-label">Total Clientes</span>
                            <span class="stat-value">{{ totalClients() }}</span>
                        </div>
                    </div>
                </div>

                <!-- Tabs Navigation -->
                <div class="tabs">
                    <button class="tab-btn" [class.active]="activeTab() === 'gyms'" (click)="setActiveTab('gyms')">
                        🏢 Gimnasios
                    </button>
                    <button class="tab-btn" [class.active]="activeTab() === 'personal'" (click)="setActiveTab('personal')">
                        🏃 Entrenadores Personales
                    </button>
                    <button class="tab-btn" [class.active]="activeTab() === 'owners'" (click)="setActiveTab('owners')">
                        👑 Dueños
                    </button>
                    <button class="tab-btn" [class.active]="activeTab() === 'staff'" (click)="setActiveTab('staff')">
                        👷 Staff
                    </button>
                </div>

                <!-- Content Area -->
                <div class="content-area" *ngIf="!loading(); else loadingTpl">
                    
                    <!-- GYMS LIST -->
                    <div *ngIf="activeTab() === 'gyms'" class="list-section animate-in">
                        <div class="section-header">
                            <h2>Gimnasios Registrados</h2>
                        </div>
                        <div class="grid-layout">
                            <div class="card-item gym-card" *ngFor="let gym of gyms()">
                                <div class="item-header">
                                    <div class="item-avatar gym-avatar">
                                        <img *ngIf="gym.logoUrl" [src]="gym.logoUrl" [alt]="gym.name">
                                        <span *ngIf="!gym.logoUrl">🏢</span>
                                    </div>
                                    <div class="item-info">
                                        <h3>{{ gym.name }}</h3>
                                        <p class="code">Código: <strong>{{ gym.accessCode }}</strong></p>
                                        <span *ngIf="!gym.ownerId" class="badge warning">⚠️ Sin Dueño</span>
                                        <span *ngIf="gym.ownerId" class="badge success">✓ Asignado</span>
                                    </div>
                                    <div class="item-actions">
                                        <button *ngIf="!gym.ownerId" class="action-btn assign" (click)="openAssignOwnerModal(gym)" title="Asignar Dueño">👑</button>
                                        <button class="action-btn" (click)="viewGymDetails(gym.id)" title="Ver Detalles">👁️</button>
                                        <button class="action-btn delete" (click)="deleteGym(gym)" title="Eliminar Gimnasio">🗑️</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <p *ngIf="gyms().length === 0" class="empty-state">No hay gimnasios registrados.</p>
                    </div>

                    <!-- COACHES LIST (Generic for Owners, Staff, Personal) -->
                    <div *ngIf="activeTab() !== 'gyms'" class="list-section animate-in">
                        <div class="section-header">
                            <h2>
                                {{ activeTab() === 'personal' ? 'Entrenadores Personales' : 
                                   activeTab() === 'owners' ? 'Dueños de Gimnasio' : 'Staff de Gimnasio' }}
                            </h2>
                        </div>

                        <div class="grid-layout">
                            <div class="card-item coach-card" *ngFor="let coach of currentList()">
                                <div class="item-header">
                                    <div class="item-avatar coach-avatar" [style.background-color]="coach.brandColor || '#3b82f6'">
                                        <span *ngIf="!coach.logoUrl">{{ coach.name.charAt(0).toUpperCase() }}</span>
                                        <img *ngIf="coach.logoUrl" [src]="coach.logoUrl" [alt]="coach.name">
                                    </div>
                                    <div class="item-info">
                                        <h3>{{ coach.name }}</h3>
                                        <p class="email">{{ coach.email }}</p>
                                        <div class="stats-row">
                                            <span class="badge clients">👥 {{ coach.clientCount }} Clientes</span>
                                            <span class="badge routines">📋 {{ coach.routineCount }} Rutinas</span>
                                            <span *ngIf="coach.gymId && activeTab() !== 'owners'" class="badge gym-badge">
                                                🏢 {{ getGymName(coach.gymId) }}
                                            </span>
                                        </div>
                                    </div>
                                    <div class="item-actions">
                                        <button class="action-btn" (click)="viewClients(coach.id)" title="Ver Clientes">👥</button>
                                        <button class="action-btn delete" (click)="deleteCoach(coach)" title="Eliminar Usuario">🗑️</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <p *ngIf="currentList().length === 0" class="empty-state">No se encontraron usuarios en esta categoría.</p>
                    </div>

                </div>

                <!-- Assignment Modal -->
                <div class="modal-overlay" *ngIf="assigningGym()" (click)="closeAssignOwnerModal()">
                    <div class="modal-content" (click)="$event.stopPropagation()">
                        <div class="modal-header">
                            <h3>Asignar Dueño a {{ assigningGym()?.name }}</h3>
                            <button class="close-btn" (click)="closeAssignOwnerModal()">✕</button>
                        </div>
                        <div class="modal-body">
                            <p class="modal-subtitle">Selecciona un entrenador independiente para convertirlo en dueño del gimnasio:</p>
                            <div class="coach-list">
                                <div class="coach-option" *ngFor="let coach of availableCoaches()" (click)="confirmAssignOwner(coach.id)">
                                    <div class="coach-avatar-small" [style.background-color]="coach.brandColor || '#3b82f6'">
                                        <span *ngIf="!coach.logoUrl">{{ coach.name.charAt(0).toUpperCase() }}</span>
                                        <img *ngIf="coach.logoUrl" [src]="coach.logoUrl" [alt]="coach.name">
                                    </div>
                                    <div class="coach-details">
                                        <h4>{{ coach.name }}</h4>
                                        <span class="coach-email">{{ coach.email }}</span>
                                        <div class="coach-stats">
                                            <span>👥 {{ coach.clientCount }}</span>
                                            <span>📋 {{ coach.routineCount }}</span>
                                        </div>
                                    </div>
                                    <button class="select-btn">Seleccionar →</button>
                                </div>
                            </div>
                            <p *ngIf="availableCoaches().length === 0" class="empty-state-modal">
                                No hay entrenadores independientes disponibles. Primero debes crear un entrenador que no esté asignado a ningún gimnasio.
                            </p>
                        </div>
                    </div>
                </div>

                <ng-template #loadingTpl>
                    <div class="loading-state">
                        <div class="spinner"></div>
                        <p>Cargando información del sistema...</p>
                    </div>
                </ng-template>
            </div>
        </div>
    `,
    styles: [`
        .admin-dashboard {
            min-height: 100vh;
            background: #f8fafc;
            padding-bottom: 80px;
        }

        .page-content {
            max-width: 1200px;
            margin: 0 auto;
            padding: 32px 24px;
        }

        /* Stats Grid */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 32px;
        }

        .stat-card {
            background: white;
            border-radius: 12px;
            padding: 16px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            border: 1px solid #e2e8f0;
            cursor: pointer;
            transition: all 0.2s;

            &:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            }

            &.active {
                border-color: #3b82f6;
                background-color: #eff6ff;
            }

            &.total {
                cursor: default;
                background-color: #f1f5f9;
                &:hover { transform: none; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
            }
        }

        .stat-icon {
            font-size: 24px;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f1f5f9;
            border-radius: 8px;

            &.gyms { background: #e0f2fe; color: #0284c7; }
            &.owners { background: #fef3c7; color: #d97706; }
            &.staff { background: #f3e8ff; color: #7e22ce; }
            &.personal { background: #dcfce7; color: #16a34a; }
        }

        .stat-info {
            display: flex;
            flex-direction: column;
        }

        .stat-label { font-size: 13px; color: #64748b; font-weight: 500; }
        .stat-value { font-size: 20px; color: #0f172a; font-weight: 700; }

        /* Tabs */
        .tabs {
            display: flex;
            gap: 12px;
            margin-bottom: 24px;
            overflow-x: auto;
            padding-bottom: 8px;

            .tab-btn {
                padding: 8px 16px;
                border-radius: 999px;
                border: 1px solid #e2e8f0;
                background: white;
                color: #64748b;
                font-weight: 500;
                font-size: 14px;
                cursor: pointer;
                white-space: nowrap;
                transition: all 0.2s;

                &:hover { background: #f8fafc; }
                &.active {
                    background: #0f172a;
                    color: white;
                    border-color: #0f172a;
                }
            }
        }

        /* Grid Layout for Lists */
        .grid-layout {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 16px;
        }

        .card-item {
            background: white;
            border-radius: 12px;
            padding: 16px;
            border: 1px solid #e2e8f0;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }

        .item-header {
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .item-avatar {
            width: 48px;
            height: 48px;
            border-radius: 12px;
            background: #f1f5f9;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            flex-shrink: 0;
            font-size: 20px;
            font-weight: 700;
            color: white;

            img { width: 100%; height: 100%; object-fit: cover; }
        }

        .item-info {
            flex: 1;
            min-width: 0;

            h3 {
                font-size: 16px;
                font-weight: 600;
                color: #0f172a;
                margin: 0 0 4px 0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            p { font-size: 13px; color: #64748b; margin: 0; }
        }

        .item-actions {
            display: flex;
            gap: 8px;
        }

        .action-btn {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
            background: white;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;

            &:hover { background: #f1f5f9; }
            &.delete:hover { background: #fee2e2; border-color: #fee2e2; }
        }

        .stats-row {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 6px;
        }

        .badge {
            font-size: 11px;
            padding: 2px 6px;
            border-radius: 4px;
            background: #f1f5f9;
            color: #475569;
            font-weight: 500;

            &.gym-badge { 
                background: #e0f2fe; 
                color: #0369a1; 
                max-width: 100%; 
                overflow: hidden; 
                text-overflow: ellipsis; 
                white-space: nowrap; 
            }
            
            &.warning {
                background: #fef3c7;
                color: #d97706;
            }
            
            &.success {
                background: #dcfce7;
                color: #16a34a;
            }
        }
        
        .action-btn.assign {
            &:hover {
                background: #fef3c7;
                border-color: #fef3c7;
            }
        }

        .empty-state { text-align: center; color: #94a3b8; padding: 40px; }
        
        /* Assignment Modal */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 20px;
        }
        
        .modal-content {
            background: white;
            border-radius: 16px;
            max-width: 500px;
            width: 100%;
            max-height: 80vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }
        
        .modal-header {
            padding: 20px 24px;
            border-bottom: 1px solid #e2e8f0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            
            h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
                color: #0f172a;
            }
            
            .close-btn {
                width: 32px;
                height: 32px;
                border-radius: 8px;
                border: none;
                background: #f1f5f9;
                cursor: pointer;
                font-size: 18px;
                color: #64748b;
                transition: all 0.2s;
                
                &:hover {
                    background: #e2e8f0;
                }
            }
        }
        
        .modal-body {
            padding: 24px;
            overflow-y: auto;
            flex: 1;
        }
        
        .modal-subtitle {
            font-size: 14px;
            color: #64748b;
            margin: 0 0 16px 0;
        }
        
        .coach-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .coach-option {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            border-radius: 12px;
            background: #f8fafc;
            border: 2px solid transparent;
            cursor: pointer;
            transition: all 0.2s;
            
            &:hover {
                background: white;
                border-color: #3b82f6;
                transform: translateY(-2px);
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            }
        }
        
        .coach-avatar-small {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            background: #3b82f6;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 16px;
            flex-shrink: 0;
            overflow: hidden;
            
            img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
        }
        
        .coach-details {
            flex: 1;
            min-width: 0;
            
            h4 {
                margin: 0 0 2px 0;
                font-size: 14px;
                font-weight: 600;
                color: #0f172a;
            }
            
            .coach-email {
                font-size: 12px;
                color: #64748b;
                display: block;
                margin-bottom: 4px;
            }
            
            .coach-stats {
                display: flex;
                gap: 8px;
                font-size: 11px;
                color: #64748b;
            }
        }
        
        .select-btn {
            padding: 6px 12px;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
            background: white;
            color: #3b82f6;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            white-space: nowrap;
            
            &:hover {
                background: #3b82f6;
                color: white;
                border-color: #3b82f6;
            }
        }
        
        .empty-state-modal {
            text-align: center;
            color: #94a3b8;
            padding: 40px 20px;
            font-size: 14px;
        }
        
        .loading-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 60px;
            color: #64748b;

            .spinner {
                width: 32px; height: 32px;
                border: 3px solid #e2e8f0; border-top-color: #3b82f6;
                border-radius: 50%; animation: spin 1s linear infinite;
                margin-bottom: 12px;
            }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
    `]
})
export class AdminDashboardComponent implements OnInit {
    private coachService = inject(CoachService);
    private adminService = inject(AdminService);
    private gymService = inject(GymService);
    private router = inject(Router);
    private confirmService = inject(ConfirmService);
    private toastService = inject(ToastService);

    // Initial Data
    allCoaches = signal<CoachWithStats[]>([]);
    gyms = signal<Gym[]>([]);
    totalClients = signal<number>(0);
    loading = signal<boolean>(true);

    // Filtered Lists - EXCLUDING ADMINS from all operational lists
    personalCoaches = computed(() => this.allCoaches().filter(c => !c.gymId && c.role !== 'admin'));

    // STRICT OWNER CHECK: Only if they are listed as owner of a gym (using isGymOwner) AND not an admin
    gymOwners = computed(() => this.allCoaches().filter(c => this.isGymOwner(c) && c.role !== 'admin'));

    // STAFF CHECK: Has gymId, is NOT an owner, and NOT an admin
    gymStaff = computed(() => this.allCoaches().filter(c => c.gymId && !this.isGymOwner(c) && c.role !== 'admin'));

    // UI State
    activeTab = signal<TabType>('gyms');
    assigningGym = signal<Gym | null>(null); // For the assignment modal

    // Display helpers
    currentList = computed(() => {
        switch (this.activeTab()) {
            case 'personal': return this.personalCoaches();
            case 'owners': return this.gymOwners();
            case 'staff': return this.gymStaff();
            default: return []; // Gyms are handled separately
        }
    });

    // COACHES ELIGIBLE TO BE OWNERS
    // Must be independent (no gymId) AND not an admin
    availableCoaches = computed(() => this.allCoaches().filter(c => !c.gymId && c.role !== 'admin'));

    async ngOnInit() {
        await this.loadData();
    }

    async loadData() {
        try {
            this.loading.set(true);

            // Parallel Fetching for max speed
            const [coachesData, clientsData, gymsData] = await Promise.all([
                this.coachService.getAllCoaches(),
                this.adminService.getAllClients(),
                this.gymService.getAllGyms()
            ]);

            this.gyms.set(gymsData);
            this.totalClients.set(clientsData.length);

            // Calculate stats for each coach
            const coachesWithStats: CoachWithStats[] = coachesData.map(coach => {
                const coachClients = clientsData.filter(c => c.coachId === coach.id);
                // Also count routines? Optimization: Skip routine count deep dive for now unless needed for specific display
                const clientCount = coachClients.length;

                // Simplified routine count to avoid re-fetching
                // const routineCount = coachClients.reduce((acc, curr) => acc + curr.routinesCount, 0); 
                // We actually have routinesCount in clientsData from the optimized getAllClients!
                const routineCount = coachClients.reduce((acc, curr) => acc + (curr.routinesCount || 0), 0);

                return {
                    ...coach,
                    clientCount,
                    routineCount
                };
            });

            // Sort by client count desc initially
            coachesWithStats.sort((a, b) => b.clientCount - a.clientCount);
            this.allCoaches.set(coachesWithStats);

        } catch (error) {
            console.error('Error loading dashboard data:', error);
            this.toastService.error('Error al cargar los datos');
        } finally {
            this.loading.set(false);
        }
    }

    // Helper to verify owner (backup check against gyms list)
    isGymOwner(coach: Coach): boolean {
        // Check if this coach ID is listed as an owner in any of the fetched gyms
        return this.gyms().some(g => g.ownerId === coach.id);
    }

    getGymName(gymId: string): string {
        return this.gyms().find(g => g.id === gymId)?.name || 'Gym Desconocido';
    }

    setActiveTab(tab: TabType) {
        this.activeTab.set(tab);
    }

    // Navigation and Actions
    navigateToExercises() {
        this.router.navigate(['/exercises/admin']);
    }

    navigateToCreateGym() {
        this.router.navigate(['/gym/onboarding']);
    }

    viewGymDetails(gymId: string) {
        // If there's no specific gym detail page for admin, we could reuse gym dashboard 
        // or create a simple edit modal. For now assuming route exists or we use gym dashboard.
        // User asked to "edit everything".
        // Let's go to the Gym Dashboard but identifying as Admin.
        this.router.navigate(['/gym/dashboard', gymId]);
    }

    viewClients(coachId: string) {
        this.router.navigate(['/admin/coaches', coachId]);
    }

    async deleteGym(gym: Gym) {
        const confirmed = await this.confirmService.confirm({
            title: '¿Eliminar Gimnasio?',
            message: `⚠ PELIGRO: Al eliminar "${gym.name}" se eliminarán PERMANENTEMENTE:\n- Todos sus clientes\n- Todas sus rutinas\n- Historial de pagos\n\nLos entrenadores asociados pasarán a ser independientes. ¿Estás seguro?`,
            confirmText: 'ELIMINAR TODO',
            cancelText: 'Cancelar',
            type: 'danger'
        });

        if (confirmed) {
            try {
                this.loading.set(true);
                await this.adminService.deleteGymFully(gym.id);
                this.toastService.success('Gimnasio eliminado correctamente');
                await this.loadData();
            } catch (error) {
                console.error('Error deleting gym:', error);
                this.toastService.error('Error al eliminar el gimnasio');
            } finally {
                this.loading.set(false);
            }
        }
    }

    async deleteCoach(coach: Coach) {
        const isOwner = coach.gymId && (coach.role === 'owner' || coach.accountType === 'gym');

        let message = `¿Estás seguro de que deseas eliminar a ${coach.name}? Se eliminarán todos sus clientes y rutinas personales.`;

        if (isOwner) {
            message = `⚠ ATENCIÓN: Este usuario es DUEÑO de un gimnasio. Al eliminarlo, SE ELIMINARÁ TAMBIÉN EL GIMNASIO y todos sus datos relacionados (clientes, staff, rutinas). ¿Deseas proceder?`;
        }

        const confirmed = await this.confirmService.confirm({
            title: isOwner ? '¿Eliminar Dueño y Gimnasio?' : '¿Eliminar Usuario?',
            message: message,
            confirmText: 'Eliminar Definitivamente',
            cancelText: 'Cancelar',
            type: 'danger'
        });

        if (confirmed) {
            try {
                this.loading.set(true);
                await this.adminService.deleteCoachFully(coach.id);
                this.toastService.success('Usuario eliminado correctamente');
                await this.loadData();
            } catch (error) {
                console.error('Error deleting coach:', error);
                this.toastService.error('Error al eliminar el usuario');
            } finally {
                this.loading.set(false);
            }
        }
    }

    // Owner Assignment Methods
    openAssignOwnerModal(gym: Gym) {
        this.assigningGym.set(gym);
    }

    closeAssignOwnerModal() {
        this.assigningGym.set(null);
    }

    async confirmAssignOwner(coachId: string) {
        const gym = this.assigningGym();
        if (!gym || !coachId) return;

        const coach = this.allCoaches().find(c => c.id === coachId);
        if (!coach) return;

        const confirmed = await this.confirmService.confirm({
            title: '¿Confirmar Asignación?',
            message: `Vas a asignar a "${coach.name}" como DUEÑO de "${gym.name}".\n\nEste usuario obtendrá control total sobre el gimnasio.`,
            confirmText: 'Sí, Asignar',
            type: 'warning'
        });

        if (confirmed) {
            try {
                this.loading.set(true);
                await this.gymService.assignGymOwner(gym.id, coachId);
                this.toastService.success(`Dueño asignado correctamente a ${gym.name}`);
                this.closeAssignOwnerModal();
                await this.loadData();
            } catch (error) {
                console.error('Error assigning owner:', error);
                this.toastService.error('Error al asignar dueño');
            } finally {
                this.loading.set(false);
            }
        }
    }
}
