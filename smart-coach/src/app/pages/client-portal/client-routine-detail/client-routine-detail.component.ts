import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { GymClientService } from '../../../services/gym-client.service';
import {
    DayExercise,
    Routine,
    TrainingDay,
    RoutineWithDays,
    getRoutineExerciseBlockLabel
} from '../../../models/routine.model';
import { PdfService } from '../../../services/pdf.service';
import { CoachService } from '../../../services/coach.service';
import { GymService } from '../../../services/gym.service';
import { ToastService } from '../../../services/toast.service';
import { TrainingLogService } from '../../../services/training-log.service';
import { TrainingSession, TrainingSessionSet } from '../../../models/training-log.model';

@Component({
    selector: 'app-client-routine-detail',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './client-routine-detail.component.html',
    styleUrls: ['./client-routine-detail.component.scss']
})
export class ClientRoutineDetailComponent implements OnInit {
    private authService = inject(AuthService);
    private gymClientSvc = inject(GymClientService);
    private coachService = inject(CoachService);
    private gymService = inject(GymService);
    private pdfService = inject(PdfService);
    private toastService = inject(ToastService);
    private trainingLogService = inject(TrainingLogService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);

    profile = this.authService.gymClientProfile;
    routine = signal<Routine | null>(null);
    days = signal<TrainingDay[]>([]);
    loading = signal(true);
    downloadingPdf = signal(false);
    sessionByDay = signal<Record<string, TrainingSession>>({});
    setEntries = signal<Record<string, TrainingSessionSet>>({});
    savingEntries = signal<Record<string, boolean>>({});
    expandedTrackers = signal<Record<string, boolean>>({});
    activeDayId = signal<string | null>(null);

    async ngOnInit() {
        let p = this.profile();
        if (!p) {
            p = await this.waitForProfile();
        }
        if (!p) { this.router.navigate(['/login']); return; }

        const routineId = this.route.snapshot.paramMap.get('id');
        if (!routineId) { this.router.navigate(['/client/routines']); return; }

        const { routine, days } = await this.gymClientSvc.getMyRoutineDetailForProfile(p, routineId);

        // Security: only show if this routine belongs to the logged-in client
        if (!routine || routine.clientId !== p.clientId) {
            this.router.navigate(['/client/routines']);
            return;
        }

        const sortedDays = [...days].sort((a: any, b: any) => (a.dayNumber ?? 0) - (b.dayNumber ?? 0));
        this.routine.set(routine);
        this.days.set(sortedDays as TrainingDay[]);
        this.activeDayId.set(sortedDays[0]?.id ?? null);
        this.initializeExpandedTrackers(sortedDays as TrainingDay[]);
        if (p.rirEnabled) {
            await this.loadTrackingState(p, routine, sortedDays as TrainingDay[]);
        }
        this.loading.set(false);
    }

    private waitForProfile(): Promise<typeof this.profile extends () => infer T ? T : never> {
        return new Promise(resolve => {
            let attempts = 0;
            const interval = setInterval(() => {
                const p = this.profile();
                if (p || attempts >= 25) {
                    clearInterval(interval);
                    resolve(p as any);
                }
                attempts++;
            }, 100);
        });
    }

    private async loadTrackingState(profile: NonNullable<ReturnType<ClientRoutineDetailComponent['profile']>>, routine: Routine, days: TrainingDay[]) {
        const sessions: Record<string, TrainingSession> = {};
        const entries: Record<string, TrainingSessionSet> = {};

        for (const day of days) {
            const session = await this.trainingLogService.getSessionForToday(profile, routine, day);
            if (!session) {
                continue;
            }
            sessions[day.id] = session;

            const sets = await this.trainingLogService.getSessionSets(session.id);
            for (const set of sets) {
                entries[this.buildEntryKey(day.id, set.exerciseOrder, set.setNumber)] = set;
            }
        }

        this.sessionByDay.set(sessions);
        this.setEntries.set(entries);
    }

    private buildEntryKey(dayId: string, exerciseOrder: number, setNumber: number): string {
        return `${dayId}:${exerciseOrder}:${setNumber}`;
    }

    private buildTrackerKey(dayId: string, exerciseOrder: number): string {
        return `${dayId}:${exerciseOrder}`;
    }

    private initializeExpandedTrackers(days: TrainingDay[]) {
        const next: Record<string, boolean> = {};

        days.forEach((day) => {
            day.exercises.forEach((exercise) => {
                next[this.buildTrackerKey(day.id, exercise.order)] = false;
            });
        });

        this.expandedTrackers.set(next);
    }

    setNumbers(count: number): number[] {
        return Array.from({ length: count }, (_, i) => i + 1);
    }

    toggleTracker(day: TrainingDay, exercise: DayExercise) {
        const key = this.buildTrackerKey(day.id, exercise.order);
        const isOpen = !!this.expandedTrackers()[key];
        this.expandedTrackers.update((current) => ({
            ...Object.keys(current)
                .filter((currentKey) => currentKey.startsWith(`${day.id}:`))
                .reduce((acc, currentKey) => ({ ...acc, [currentKey]: false }), current),
            [key]: !isOpen
        }));
    }

    isTrackerExpanded(day: TrainingDay, exercise: DayExercise): boolean {
        return !!this.expandedTrackers()[this.buildTrackerKey(day.id, exercise.order)];
    }

    selectDay(day: TrainingDay) {
        this.activeDayId.set(day.id);
    }

    activeDay(): TrainingDay | null {
        const activeId = this.activeDayId();
        return this.days().find((day) => day.id === activeId) || this.days()[0] || null;
    }

    isDayActive(day: TrainingDay): boolean {
        return this.activeDay()?.id === day.id;
    }

    getCompletedExerciseCount(day: TrainingDay): number {
        return day.exercises.filter((exercise) => this.getCompletedSetCount(day, exercise) > 0).length;
    }

    buildExerciseLink(exercise: DayExercise): string {
        const raw = String(exercise.videoUrl || '').trim();
        if (raw) {
            return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        }

        const query = encodeURIComponent(`${exercise.exerciseName} ejercicio`);
        return `https://www.youtube.com/results?search_query=${query}`;
    }

    getBiserieLabel(exercise: DayExercise): string {
        const label = exercise.blockLabel || '';
        const position = exercise.blockPosition || '';
        return `${label}${position ? position : ''}`.trim();
    }

    getBlockDisplayLabel(exercise: DayExercise): string {
        const blockLabel = getRoutineExerciseBlockLabel(exercise.blockType);
        const positionLabel = this.getBiserieLabel(exercise);
        return `${blockLabel}${positionLabel ? ` ${positionLabel}` : ''}`.trim();
    }

    getCompletedSetCount(day: TrainingDay, exercise: DayExercise): number {
        return this.setNumbers(exercise.sets).filter((setNumber) => {
            const entry = this.getSetEntry(day, exercise, setNumber);
            return !!entry && (entry.actualReps !== null || entry.load !== null || entry.rir !== null);
        }).length;
    }

    hasTrackedValues(day: TrainingDay, exercise: DayExercise, setNumber: number): boolean {
        const entry = this.getSetEntry(day, exercise, setNumber);
        return !!entry && (entry.actualReps !== null || entry.load !== null || entry.rir !== null);
    }

    getSetEntry(day: TrainingDay, exercise: DayExercise, setNumber: number): TrainingSessionSet | null {
        return this.setEntries()[this.buildEntryKey(day.id, exercise.order, setNumber)] || null;
    }

    isSaving(day: TrainingDay, exercise: DayExercise, setNumber: number): boolean {
        return !!this.savingEntries()[this.buildEntryKey(day.id, exercise.order, setNumber)];
    }

    async updateSetValue(
        day: TrainingDay,
        exercise: DayExercise,
        setNumber: number,
        field: 'actualReps' | 'rir' | 'load',
        rawValue: string
    ) {
        const profile = this.profile();
        const routine = this.routine();
        if (!profile || !routine) return;

        const entryKey = this.buildEntryKey(day.id, exercise.order, setNumber);
        this.savingEntries.update((current) => ({ ...current, [entryKey]: true }));

        const currentEntry = this.getSetEntry(day, exercise, setNumber);
        const parsedNumber = rawValue === '' ? null : Number(rawValue);
        const nextInput = {
            actualReps: currentEntry?.actualReps ?? null,
            rir: currentEntry?.rir ?? null,
            load: currentEntry?.load ?? null,
            loadUnit: currentEntry?.loadUnit || 'kg',
            notes: currentEntry?.notes || null
        };

        (nextInput as any)[field] = Number.isNaN(parsedNumber) ? null : parsedNumber;
        const hasTrackedValues =
            nextInput.actualReps !== null ||
            nextInput.rir !== null ||
            nextInput.load !== null;

        try {
            let session = this.sessionByDay()[day.id];
            if (!session && !hasTrackedValues) {
                return;
            }

            if (!session) {
                session = await this.trainingLogService.getOrCreateSession(profile, routine, day);
                this.sessionByDay.update((current) => ({
                    ...current,
                    [day.id]: session
                }));
            }

            const saved = await this.trainingLogService.saveSetEntry(
                session.id,
                day,
                exercise,
                setNumber,
                nextInput
            );
            this.setEntries.update((current) => ({
                ...current,
                [entryKey]: saved
            }));
        } catch (error) {
            console.error('Error saving training set entry:', error);
            this.toastService.error('No se pudo guardar el registro de esta serie.');
        } finally {
            this.savingEntries.update((current) => ({ ...current, [entryKey]: false }));
        }
    }

    async downloadPdf() {
        const p = this.profile();
        const r = this.routine();
        if (!p || !r) return;

        try {
            this.downloadingPdf.set(true);

            // Fetch missing pieces for PDF (Client record)
            const client = await this.gymClientSvc.getMyClientDataForProfile(p);
            if (!client) throw new Error('Client data not found');

            // Find the coach/owner profile using gymId (coaches table might have the owner)
            const coachProfileId = p.scope === 'gym' ? p.gymId : p.coachId;
            const coach = coachProfileId ? await this.coachService.getCoachProfile(coachProfileId) : null;
            const gym = p.gymId ? await this.gymService.getGym(p.gymId) : null;

            // Build the branding data prioritizing gym settings over coach settings
            let brandingData: any = coach || {
                id: p.gymId || p.coachId,
                name: p.displayName,
                email: '',
                role: 'coach',
                accountType: p.scope
            };

            if (gym) {
                brandingData = {
                    ...brandingData,
                    name: gym.name,
                    logoUrl: gym.logoUrl || brandingData.logoUrl,
                    brandColor: gym.brandColor || brandingData.brandColor
                };
            }

            const routineWithDays: RoutineWithDays = {
                ...r,
                days: this.days()
            };

            await this.pdfService.generateRoutinePDF(routineWithDays, client, brandingData);
            this.toastService.success('El PDF se ha descargado correctamente');
        } catch (error) {
            console.error('Error generating PDF:', error);
            this.toastService.error('Hubo un error al generar el PDF de la rutina');
        } finally {
            this.downloadingPdf.set(false);
        }
    }
}
