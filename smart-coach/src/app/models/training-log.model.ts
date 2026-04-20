export type TrainingSessionStatus = 'in_progress' | 'completed';

export interface TrainingSession {
    id: string;
    routineId: string;
    routineDayId: string;
    clientId: string;
    coachId: string;
    clientGymMembershipId?: string | null;
    portalScope: 'gym' | 'independent';
    sessionDate: string;
    status: TrainingSessionStatus;
    startedAt: Date;
    completedAt?: Date | null;
    updatedAt?: Date;
}

export interface TrainingSessionSet {
    id: string;
    trainingSessionId: string;
    routineDayId: string;
    exerciseId: string;
    exerciseName: string;
    exerciseOrder: number;
    setNumber: number;
    plannedReps?: string;
    actualReps?: number | null;
    rir?: number | null;
    load?: number | null;
    loadUnit?: string;
    notes?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface TrainingSetEntryInput {
    actualReps?: number | null;
    rir?: number | null;
    load?: number | null;
    loadUnit?: string;
    notes?: string | null;
}

export interface TrainingHistoryItem {
    session: TrainingSession;
    sets: TrainingSessionSet[];
}

export interface RecentCoachRirActivity {
    sessionId: string;
    clientId: string;
    clientName: string;
    routineDayId: string;
    dayName: string;
    sessionDate: string;
    updatedAt?: Date | string | null;
    rirEntriesCount: number;
    exerciseNames: string[];
}
