import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CoachService } from '../../services/coach.service';
import { ClientService } from '../../services/client.service';
import { ExerciseService } from '../../services/exercise.service';
import { ButtonComponent } from '../../components/ui/button/button.component';
import { Routine } from '../../models/routine.model';
import { RoutineService } from '../../services/routine.service';

interface RoutineProgress extends Routine {
    progress: number;
    daysRemaining: number;
    clientName?: string;
}

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [CommonModule, RouterLink, ButtonComponent],
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
    public authService = inject(AuthService);
    private coachService = inject(CoachService);
    private clientService = inject(ClientService);
    private routineService = inject(RoutineService);
    private exerciseService = inject(ExerciseService);
    private router = inject(Router);

    coachName = signal<string>('Coach');
    clientCount = signal<number>(0);
    exerciseCount = signal<number>(0);
    activeRoutines = signal<RoutineProgress[]>([]);
    activeRoutinesCount = signal<number>(0);
    newClientsThisMonth = signal<number>(0);
    newRoutinesThisMonth = signal<number>(0);
    loading = signal<boolean>(true);

    async ngOnInit() {
        const userId = this.authService.getCurrentUserId();

        if (!userId) {
            this.router.navigate(['/login']);
            return;
        }

        try {
            // Load coach profile
            const coach = await this.coachService.getCoachProfile(userId);
            if (coach) {
                this.coachName.set(coach.name);
            }

            // Load clients
            const clients = await this.clientService.getClients(userId);
            this.clientCount.set(clients.length);

            // Calculate new clients this month
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const newClients = clients.filter(c => {
                const createdAt = c.createdAt ? new Date(c.createdAt) : new Date(0);
                return createdAt >= startOfMonth;
            });
            this.newClientsThisMonth.set(newClients.length);

            // Load exercises count
            const coachExercises = await this.exerciseService.getCoachExercises(userId);
            const globalExercises = await this.exerciseService.getGlobalExercises();
            this.exerciseCount.set(coachExercises.length + globalExercises.length);

            // Create a map of client names for quick lookup
            const clientMap = new Map<string, string>();
            clients.forEach(c => clientMap.set(c.id, c.name));

            // Load routines and calculate progress
            const allRoutines = await this.routineService.getAllRoutines(userId);

            const active: RoutineProgress[] = [];
            let newRoutinesCount = 0;

            for (const routine of allRoutines) {
                // Calculate dates
                const startDate = routine.startDate ? new Date(routine.startDate) : new Date(routine.createdAt);
                const durationWeeks = routine.durationWeeks || 4;
                const endDate = routine.endDate ? new Date(routine.endDate) : new Date(startDate.getTime() + (durationWeeks * 7 * 24 * 60 * 60 * 1000));
                const createdAt = routine.createdAt ? new Date(routine.createdAt) : new Date(0);

                // Check for new routines this month
                if (createdAt >= startOfMonth) {
                    newRoutinesCount++;
                }

                // Check if active (startDate <= today <= endDate)
                if (endDate >= now) {
                    const totalDuration = endDate.getTime() - startDate.getTime();
                    const elapsed = now.getTime() - startDate.getTime();
                    let progress = 0;

                    if (totalDuration > 0) {
                        progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
                    }

                    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                    active.push({
                        ...routine,
                        progress,
                        daysRemaining,
                        clientName: clientMap.get(routine.clientId) || 'Cliente Desconocido'
                    });
                }
            }

            // Sort by days remaining (urgent first)
            active.sort((a, b) => a.daysRemaining - b.daysRemaining);

            this.activeRoutines.set(active);
            this.activeRoutinesCount.set(active.length);
            this.newRoutinesThisMonth.set(newRoutinesCount);

        } catch (error) {
            console.error('Error loading dashboard:', error);
        } finally {
            this.loading.set(false);
        }
    }

    async logout() {
        await this.authService.logout();
    }
}
