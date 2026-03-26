import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CoachService } from '../../../services/coach.service';
import { AdminService, CoachGymAffiliation } from '../../../services/admin.service';
import { GymService } from '../../../services/gym.service';
import { UsageService } from '../../../services/usage.service';
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

type TabType = 'resumen' | 'gyms' | 'personal' | 'owners' | 'staff' | 'actividad';

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
                <div headerActions class="admin-header-actions">
                    <app-button (click)="navigateToCreateGym()" variant="secondary" class="desktop-only">
                        Crear Gimnasio
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
                        <div class="stat-icon gyms">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="10" width="6" height="10"></rect>
                                <rect x="9" y="6" width="6" height="14"></rect>
                                <rect x="15" y="3" width="6" height="17"></rect>
                            </svg>
                        </div>
                        <div class="stat-info">
                            <span class="stat-label">Gimnasios</span>
                            <span class="stat-value">{{ gyms().length }}</span>
                        </div>
                    </div>
                    <div class="stat-card" [class.active]="activeTab() === 'owners'" (click)="setActiveTab('owners')">
                        <div class="stat-icon owners">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 18h16"></path>
                                <path d="m5 18 1.5-10 5.5 5 5.5-5L19 18"></path>
                                <path d="M8 6a1 1 0 1 0 0 .01"></path>
                                <path d="M16 6a1 1 0 1 0 0 .01"></path>
                            </svg>
                        </div>
                        <div class="stat-info">
                            <span class="stat-label">Dueños</span>
                            <span class="stat-value">{{ gymOwners().length }}</span>
                        </div>
                    </div>
                    <div class="stat-card" [class.active]="activeTab() === 'staff'" (click)="setActiveTab('staff')">
                        <div class="stat-icon staff">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="8" r="4"></circle>
                                <path d="M4 20a8 8 0 0 1 16 0"></path>
                            </svg>
                        </div>
                        <div class="stat-info">
                            <span class="stat-label">Staff</span>
                            <span class="stat-value">{{ gymStaff().length }}</span>
                        </div>
                    </div>
                    <div class="stat-card" [class.active]="activeTab() === 'personal'" (click)="setActiveTab('personal')">
                        <div class="stat-icon personal">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M13 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"></path>
                                <path d="m7 21 2.5-7 2.5 2 3-5"></path>
                                <path d="m13 10 2 2 3-2"></path>
                            </svg>
                        </div>
                        <div class="stat-info">
                            <span class="stat-label">Personal</span>
                            <span class="stat-value">{{ personalCoaches().length }}</span>
                        </div>
                    </div>
                    <div class="stat-card" [class.active]="activeTab() === 'actividad'" (click)="setActiveTab('actividad')">
                        <div class="stat-icon activity">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 3v18h18"></path>
                                <path d="m7 14 4-4 3 3 5-6"></path>
                            </svg>
                        </div>
                        <div class="stat-info">
                            <span class="stat-label">Actividad</span>
                            <span class="stat-value">{{ activityToday().totalLogins }}</span>
                        </div>
                    </div>
                    <div class="stat-card total">
                        <div class="stat-icon clients">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="9" cy="8" r="3"></circle>
                                <circle cx="17" cy="10" r="2"></circle>
                                <path d="M3 19a6 6 0 0 1 12 0"></path>
                                <path d="M15 19a4 4 0 0 1 6 0"></path>
                            </svg>
                        </div>
                        <div class="stat-info">
                            <span class="stat-label">Total Clientes</span>
                            <span class="stat-value">{{ totalClients() }}</span>
                        </div>
                    </div>
                </div>

                <!-- Tabs Navigation -->
                <div class="tabs">
                    <button class="tab-btn" [class.active]="activeTab() === 'gyms'" (click)="setActiveTab('gyms')">
                        Gimnasios
                    </button>
                    <button class="tab-btn" [class.active]="activeTab() === 'personal'" (click)="setActiveTab('personal')">
                        Personal
                    </button>
                    <button class="tab-btn" [class.active]="activeTab() === 'owners'" (click)="setActiveTab('owners')">
                        Dueños
                    </button>
                    <button class="tab-btn" [class.active]="activeTab() === 'staff'" (click)="setActiveTab('staff')">
                        Staff
                    </button>
                    <button class="tab-btn" [class.active]="activeTab() === 'actividad'" (click)="setActiveTab('actividad')">
                        Actividad
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
                                        <span *ngIf="!gym.logoUrl"></span>
                                    </div>
                                    <div class="item-info">
                                        <h3>{{ gym.name }}</h3>
                                        <p class="code">Código: <strong>{{ gym.accessCode }}</strong></p>
                                        <span *ngIf="!gym.ownerId" class="badge warning">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M12 9v4"></path>
                                                <path d="M12 17h.01"></path>
                                                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path>
                                            </svg>
                                            Sin Dueño
                                        </span>
                                        <span *ngIf="gym.ownerId" class="badge success">✓ Asignado</span>
                                    </div>
                                    <div class="item-actions">
                                        <button *ngIf="!gym.ownerId" class="action-btn assign" (click)="openAssignOwnerModal(gym)" title="Asignar Dueño">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M4 18h16"></path>
                                                <path d="m5 18 1.5-10 5.5 5 5.5-5L19 18"></path>
                                            </svg>
                                        </button>
                                        <button class="action-btn" (click)="viewGymDetails(gym.id)" title="Ver Detalles">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"></path>
                                                <circle cx="12" cy="12" r="3"></circle>
                                            </svg>
                                        </button>
                                        <button class="action-btn delete" (click)="deleteGym(gym)" title="Eliminar Gimnasio">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M3 6h18"></path>
                                                <path d="M8 6V4h8v2"></path>
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                                            </svg>
                                        </button>
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
                                    <div class="item-avatar coach-avatar" [style.background-color]="coach.brandColor || '#ccff00'">
                                        <span *ngIf="!coach.logoUrl">{{ coach.name.charAt(0).toUpperCase() }}</span>
                                        <img *ngIf="coach.logoUrl" [src]="coach.logoUrl" [alt]="coach.name">
                                    </div>
                                    <div class="item-info">
                                        <h3>{{ coach.name }}</h3>
                                        <p class="email">{{ coach.email }}</p>
                                        <div class="stats-row">
                                            <span class="badge clients">{{ coach.clientCount }} Clientes</span>
                                            <span class="badge routines">{{ coach.routineCount }} Rutinas</span>
                                            <span *ngIf="coach.gymId && activeTab() !== 'owners'" class="badge gym-badge">
                                                {{ getGymName(coach.gymId) }}
                                            </span>
                                        </div>
                                    </div>
                                    <div class="item-actions">
                                        <button class="action-btn" (click)="viewClients(coach.id)" title="Ver Clientes">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <circle cx="9" cy="8" r="3"></circle>
                                                <circle cx="17" cy="10" r="2"></circle>
                                                <path d="M3 19a6 6 0 0 1 12 0"></path>
                                                <path d="M15 19a4 4 0 0 1 6 0"></path>
                                            </svg>
                                        </button>
                                        <button class="action-btn delete" (click)="deleteCoach(coach)" title="Eliminar Usuario">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M3 6h18"></path>
                                                <path d="M8 6V4h8v2"></path>
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <p *ngIf="currentList().length === 0" class="empty-state">No se encontraron usuarios en esta categoría.</p>
                    </div>

                    <!-- ACTIVITY LIST -->
                    <div *ngIf="activeTab() === 'actividad'" class="list-section animate-in">
                        <div class="section-header">
                            <h2>Resumen de Actividad (Últimos 30 días)</h2>
                        </div>

                        <div class="activity-summary-grid">
                            <div class="activity-stat-box">
                                <span class="box-label">Logins Hoy</span>
                                <span class="box-value">{{ activityToday().totalLogins }}</span>
                                <span class="box-sub">({{ activityToday().uniqueUsers }} usuarios únicos)</span>
                            </div>
                            <div class="activity-stat-box">
                                <span class="box-label">Rutinas Hoy</span>
                                <span class="box-value">{{ activityToday().newRoutines }}</span>
                            </div>
                            <div class="activity-stat-box">
                                <span class="box-label">Total Logins (30d)</span>
                                <span class="box-value">{{ loginStats().total }}</span>
                            </div>
                            <div class="activity-stat-box">
                                <span class="box-label">Nuevas Rutinas (30d)</span>
                                <span class="box-value">{{ routineStats().total }}</span>
                            </div>
                        </div>

                        <div class="activity-history">
                            <h3>Actividad Diaria</h3>
                            <div class="activity-table-wrapper">
                                <table class="activity-table">
                                    <thead>
                                        <tr>
                                            <th>Fecha</th>
                                            <th>Logins</th>
                                            <th>Rutinas Creadas</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr *ngFor="let day of activityStats()">
                                            <td>{{ day.date | date:'mediumDate' }}</td>
                                            <td>
                                                <div class="bar-container">
                                                    <div class="bar logins" [style.width.%]="(day.logins / 20) * 100"></div>
                                                    <span>{{ day.logins }}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div class="bar-container">
                                                    <div class="bar routines" [style.width.%]="(day.routines / 10) * 100"></div>
                                                    <span>{{ day.routines }}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <p class="disclaimer">
                                * Nota: El seguimiento de Logins comenzó a registrarse hoy. Los datos previos pueden aparecer en 0.
                            </p>
                        </div>
                    </div>

                </div>

                <!-- Assignment Modal -->
                <div class="modal-overlay" *ngIf="assigningGym()" (click)="closeAssignOwnerModal()">
                    <div class="modal-content" (click)="$event.stopPropagation()">
                        <div class="modal-header">
                            <h3>Asignar Dueño a {{ assigningGym()?.name }}</h3>
                            <button class="close-btn" (click)="closeAssignOwnerModal()">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="m18 6-12 12"></path>
                                    <path d="m6 6 12 12"></path>
                                </svg>
                            </button>
                        </div>
                        <div class="modal-body">
                            <p class="modal-subtitle">Selecciona un entrenador independiente para convertirlo en dueño del gimnasio:</p>
                            <div class="coach-list">
                                <div class="coach-option" *ngFor="let coach of availableCoaches()" (click)="confirmAssignOwner(coach.id)">
                                    <div class="coach-avatar-small" [style.background-color]="coach.brandColor || '#ccff00'">
                                        <span *ngIf="!coach.logoUrl">{{ coach.name.charAt(0).toUpperCase() }}</span>
                                        <img *ngIf="coach.logoUrl" [src]="coach.logoUrl" [alt]="coach.name">
                                    </div>
                                    <div class="coach-details">
                                        <h4>{{ coach.name }}</h4>
                                        <span class="coach-email">{{ coach.email }}</span>
                                        <div class="coach-stats">
                                            <span>{{ coach.clientCount }}</span>
                                            <span>{{ coach.routineCount }}</span>
                                        </div>
                                    </div>
                                    <button class="select-btn">
                                        Seleccionar
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M5 12h14"></path>
                                            <path d="m13 5 7 7-7 7"></path>
                                        </svg>
                                    </button>
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
            background: var(--sc-bg);
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
            background: var(--sc-surface);
            border-radius: 12px;
            padding: 16px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            border: 1px solid var(--sc-border);
            cursor: pointer;
            transition: all 0.2s;

            &:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            }

            &.active {
                border-color: var(--sc-accent);
                background-color: rgba(204, 255, 0, 0.12);
            }

            &.total {
                cursor: default;
                background-color: var(--sc-surface-2);
                &:hover { transform: none; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
            }
        }

        .stat-icon {
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--sc-surface-2);
            border-radius: 8px;

            svg {
                width: 20px;
                height: 20px;
                stroke-linecap: round;
                stroke-linejoin: round;
            }

            &.gyms { background: rgba(86, 116, 165, 0.22); color: var(--sc-text-primary); }
            &.owners { background: rgba(255, 184, 77, 0.2); color: var(--sc-text-primary); }
            &.staff { background: rgba(86, 116, 165, 0.25); color: var(--sc-text-primary); }
            &.personal { background: rgba(204, 255, 0, 0.2); color: #0b0e14; }
            &.activity { background: rgba(255, 76, 76, 0.18); color: var(--sc-text-primary); }
        }

        .stat-info {
            display: flex;
            flex-direction: column;
        }

        .stat-label { font-size: 13px; color: var(--sc-text-secondary); font-weight: 500; }
        .stat-value { font-size: 20px; color: var(--sc-text-primary); font-weight: 700; }

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
                border: 1px solid var(--sc-border);
                background: var(--sc-surface);
                color: var(--sc-text-secondary);
                font-weight: 500;
                font-size: 14px;
                cursor: pointer;
                white-space: nowrap;
                transition: all 0.2s;

                &:hover { background: var(--sc-bg); }
                &.active {
                    background: var(--sc-accent);
                    color: #0b0e14;
                    border-color: var(--sc-accent);
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
            background: var(--sc-surface);
            border-radius: 12px;
            padding: 16px;
            border: 1px solid var(--sc-border);
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
            background: var(--sc-surface-2);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            flex-shrink: 0;
            font-size: 20px;
            font-weight: 700;
            color: #0b0e14;

            img { width: 100%; height: 100%; object-fit: cover; }
        }

        .item-info {
            flex: 1;
            min-width: 0;

            h3 {
                font-size: 16px;
                font-weight: 600;
                color: var(--sc-text-primary);
                margin: 0 0 4px 0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            p { font-size: 13px; color: var(--sc-text-secondary); margin: 0; }
        }

        .item-actions {
            display: flex;
            gap: 8px;
        }

        .action-btn {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            border: 1px solid var(--sc-border);
            background: var(--sc-surface);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;

            &:hover { background: var(--sc-surface-2); }
            &.delete:hover { background: rgba(255, 76, 76, 0.18); border-color: rgba(255, 76, 76, 0.45); }

            svg {
                width: 16px;
                height: 16px;
                stroke-linecap: round;
                stroke-linejoin: round;
            }
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
            background: var(--sc-surface-2);
            color: var(--sc-text-secondary);
            font-weight: 500;

            &.gym-badge { 
                background: rgba(86, 116, 165, 0.22); 
                color: var(--sc-text-primary); 
                max-width: 100%; 
                overflow: hidden; 
                text-overflow: ellipsis; 
                white-space: nowrap; 
            }
            
            &.warning {
                background: rgba(255, 184, 77, 0.2);
                color: #ffd08a;
                display: inline-flex;
                align-items: center;
                gap: 4px;

                svg {
                    width: 12px;
                    height: 12px;
                    stroke-linecap: round;
                    stroke-linejoin: round;
                }
            }
            
            &.success {
                background: rgba(204, 255, 0, 0.2);
                color: #ccff00;
            }
        }
        
        .action-btn.assign {
            &:hover {
                background: rgba(255, 184, 77, 0.2);
                border-color: rgba(255, 184, 77, 0.45);
            }
        }

        .empty-state { text-align: center; color: var(--sc-text-muted); padding: 40px; }
        
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
            background: var(--sc-surface);
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
            border-bottom: 1px solid var(--sc-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
            
            h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
                color: var(--sc-text-primary);
            }
            
            .close-btn {
                width: 32px;
                height: 32px;
                border-radius: 8px;
                border: none;
                background: var(--sc-surface-2);
                cursor: pointer;
                color: var(--sc-text-secondary);
                transition: all 0.2s;
                display: inline-flex;
                align-items: center;
                justify-content: center;

                svg {
                    width: 16px;
                    height: 16px;
                    stroke-linecap: round;
                    stroke-linejoin: round;
                }
                
                &:hover {
                    background: var(--sc-border);
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
            color: var(--sc-text-secondary);
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
            background: var(--sc-bg);
            border: 2px solid transparent;
            cursor: pointer;
            transition: all 0.2s;
            
            &:hover {
                background: var(--sc-surface);
                border-color: var(--sc-accent);
                transform: translateY(-2px);
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            }
        }
        
        .coach-avatar-small {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            background: var(--sc-accent);
            color: #0b0e14;
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
                color: var(--sc-text-primary);
            }
            
            .coach-email {
                font-size: 12px;
                color: var(--sc-text-secondary);
                display: block;
                margin-bottom: 4px;
            }
            
            .coach-stats {
                display: flex;
                gap: 8px;
                font-size: 11px;
                color: var(--sc-text-secondary);
            }
        }
        
        .select-btn {
            padding: 6px 12px;
            border-radius: 6px;
            border: 1px solid var(--sc-border);
            background: var(--sc-surface);
            color: var(--sc-accent);
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            gap: 6px;

            svg {
                width: 12px;
                height: 12px;
                stroke-linecap: round;
                stroke-linejoin: round;
            }
            
            &:hover {
                background: var(--sc-accent);
                color: #0b0e14;
                border-color: var(--sc-accent);
            }
        }
        
        .empty-state-modal {
            text-align: center;
            color: var(--sc-text-muted);
            padding: 40px 20px;
            font-size: 14px;
        }

        /* Activity Tab Styles */
        .activity-summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 32px;
        }

        .activity-stat-box {
            background: var(--sc-surface);
            padding: 24px;
            border-radius: 16px;
            border: 1px solid var(--sc-border);
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);

            .box-label { font-size: 14px; color: var(--sc-text-secondary); margin-bottom: 8px; font-weight: 500; }
            .box-value { font-size: 32px; font-weight: 800; color: var(--sc-text-primary); line-height: 1; }
            .box-sub { font-size: 11px; color: var(--sc-text-muted); margin-top: 4px; }
        }

        .activity-history {
            background: var(--sc-surface);
            border-radius: 16px;
            padding: 24px;
            border: 1px solid var(--sc-border);

            h3 { margin: 0 0 16px 0; font-size: 18px; font-weight: 700; color: var(--sc-text-primary); }
        }

        .activity-table-wrapper { overflow-x: auto; }

        .activity-table {
            width: 100%;
            border-collapse: collapse;
            
            th { text-align: left; padding: 12px; border-bottom: 1px solid var(--sc-border); color: var(--sc-text-secondary); font-size: 13px; font-weight: 600; }
            td { padding: 12px; border-bottom: 1px solid var(--sc-border); color: var(--sc-text-primary); font-size: 14px; }
        }

        .bar-container {
            display: flex;
            align-items: center;
            gap: 12px;

            .bar {
                height: 8px;
                border-radius: 4px;
                min-width: 4px;
                max-width: 200px;
                
                &.logins { background: #dc2626; }
                &.routines { background: var(--sc-accent); }
            }

            span { font-weight: 600; font-size: 13px; color: var(--sc-text-primary); }
        }

        .disclaimer {
            font-size: 12px;
            color: var(--sc-text-muted);
            font-style: italic;
            margin-top: 16px;
        }

        .loading-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 60px;
            color: var(--sc-text-secondary);

            .spinner {
                width: 32px; height: 32px;
                border: 3px solid var(--sc-border); border-top-color: var(--sc-accent);
                border-radius: 50%; animation: spin 1s linear infinite;
                margin-bottom: 12px;
            }
        }

        .admin-header-actions {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
    `]
})
export class AdminDashboardComponent implements OnInit {
    private coachService = inject(CoachService);
    private adminService = inject(AdminService);
    private gymService = inject(GymService);
    private usageService = inject(UsageService);
    private router = inject(Router);
    private confirmService = inject(ConfirmService);
    private toastService = inject(ToastService);

    // Initial Data
    allCoaches = signal<CoachWithStats[]>([]);
    gyms = signal<Gym[]>([]);
    coachAffiliations = signal<CoachGymAffiliation[]>([]);
    totalClients = signal<number>(0);
    loading = signal<boolean>(true);

    // Activity Stats
    loginStats = signal<{ total: number, logins: any[] }>({ total: 0, logins: [] });
    routineStats = signal<{ total: number, routines: any[] }>({ total: 0, routines: [] });

    private asDate(value: any): Date | null {
        if (!value) return null;
        if (value instanceof Date) return value;
        if (typeof value?.toDate === 'function') return value.toDate();

        const fromMs = typeof value?.seconds === 'number'
            ? new Date(value.seconds * 1000)
            : null;
        if (fromMs && !Number.isNaN(fromMs.getTime())) return fromMs;

        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    activityToday = computed(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const todayLogins = this.loginStats().logins.filter(l => {
            const date = this.asDate(l.timestamp);
            return !!date && date >= today;
        });

        const todayRoutines = this.routineStats().routines.filter(r => {
            const date = this.asDate(r.createdAt ?? r.created_at);
            return !!date && date >= today;
        });

        return {
            totalLogins: todayLogins.length,
            uniqueUsers: new Set(todayLogins.map(l => l.userId)).size,
            newRoutines: todayRoutines.length
        };
    });

    activityStats = computed(() => {
        const logins = this.loginStats().logins;
        const routines = this.routineStats().routines;

        // Group by day for simple history (last 7 days)
        const last7Days = Array.from({ length: 7 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            return date;
        });

        const chartData = last7Days.map(day => {
            const dayEnd = new Date(day);
            dayEnd.setDate(dayEnd.getDate() + 1);

            const dayLogins = logins.filter(l => {
                const d = this.asDate(l.timestamp);
                return !!d && d >= day && d < dayEnd;
            });

            const dayRoutines = routines.filter(r => {
                const d = this.asDate(r.createdAt ?? r.created_at);
                return !!d && d >= day && d < dayEnd;
            });

            return {
                date: day,
                logins: dayLogins.length,
                routines: dayRoutines.length
            };
        }).reverse();

        return chartData;
    });

    private ownerCoachIds = computed(() => {
        const ids = new Set<string>();
        for (const gym of this.gyms()) {
            if (gym.ownerId) ids.add(gym.ownerId);
        }
        return ids;
    });

    private staffCoachIds = computed(() => {
        const ownerIds = this.ownerCoachIds();
        const ids = new Set<string>();
        for (const aff of this.coachAffiliations()) {
            if (!ownerIds.has(aff.coachId)) ids.add(aff.coachId);
        }
        return ids;
    });

    // Mutually exclusive classification: Owner > Staff > Personal (excluding admins).
    personalCoaches = computed(() => {
        const ownerIds = this.ownerCoachIds();
        const staffIds = this.staffCoachIds();
        return this.allCoaches().filter(c => c.role !== 'admin' && !ownerIds.has(c.id) && !staffIds.has(c.id));
    });

    gymOwners = computed(() => {
        const ownerIds = this.ownerCoachIds();
        return this.allCoaches().filter(c => c.role !== 'admin' && ownerIds.has(c.id));
    });

    gymStaff = computed(() => {
        const ownerIds = this.ownerCoachIds();
        const staffIds = this.staffCoachIds();
        return this.allCoaches().filter(c => c.role !== 'admin' && !ownerIds.has(c.id) && staffIds.has(c.id));
    });

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
    availableCoaches = computed(() => this.personalCoaches());

    async ngOnInit() {
        await this.loadData();
    }

    async loadData() {
        try {
            this.loading.set(true);

            // Parallel Fetching for max speed
            const [coachesData, clientsData, gymsData, affiliationsData, loginData, routineData] = await Promise.all([
                this.coachService.getAllCoaches(),
                this.adminService.getAllClients(),
                this.gymService.getAllGyms(),
                this.adminService.getCoachGymAffiliations(),
                this.usageService.getLoginStats(30),
                this.usageService.getRoutineCreationStats(30)
            ]);

            this.gyms.set(gymsData);
            this.coachAffiliations.set(affiliationsData);
            this.totalClients.set(clientsData.length);
            this.loginStats.set(loginData);
            this.routineStats.set(routineData);
            const primaryGymMap = new Map<string, string>();
            for (const aff of affiliationsData) {
                if (!primaryGymMap.has(aff.coachId)) {
                    primaryGymMap.set(aff.coachId, aff.gymId);
                }
            }

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
                    gymId: primaryGymMap.get(coach.id) || null,
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
        return this.ownerCoachIds().has(coach.id);
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
            message: `PELIGRO: Al eliminar "${gym.name}" se eliminarán PERMANENTEMENTE:\n- Todos sus clientes\n- Todas sus rutinas\n- Historial de pagos\n\nLos entrenadores asociados pasarán a ser independientes. ¿Estás seguro?`,
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
            message = `ATENCIÓN: Este usuario es DUEÑO de un gimnasio. Al eliminarlo, SE ELIMINARÁ TAMBIÉN EL GIMNASIO y todos sus datos relacionados (clientes, staff, rutinas). ¿Deseas proceder?`;
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
