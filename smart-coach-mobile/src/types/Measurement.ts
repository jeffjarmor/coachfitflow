export interface Measurement {
    id: string;
    clientId: string;
    routineId?: string;
    date: Date;

    // Body Measurements
    weight: number; // kg
    height: number; // cm
    bmi: number;
    bodyFatPercentage?: number;
    muscleMass?: number; // kg
    visceralFat?: number;
    metabolicAge?: number;

    // Circumference Measurements
    waist?: number;
    hips?: number;
    chest?: number;
    arms?: number;
    legs?: number;
    calf?: number;
    thigh?: number;

    notes?: string;
    createdAt: Date;
}

export interface CreateMeasurementData {
    clientId: string;
    routineId?: string;
    date: Date;
    weight: number;
    height: number;
    bmi: number;
    bodyFatPercentage?: number;
    muscleMass?: number;
    visceralFat?: number;
    metabolicAge?: number;

    waist?: number;
    hips?: number;
    chest?: number;
    arms?: number;
    legs?: number;
    calf?: number;
    thigh?: number;

    notes?: string;
}
