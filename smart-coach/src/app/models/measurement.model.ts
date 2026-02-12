export interface Measurement {
    id?: string;
    clientId: string;
    routineId?: string; // Optional: link measurement to a specific routine completion
    date: Date;

    // Body Measurements
    weight: number; // kg
    height: number; // cm
    bmi: number;
    bodyFatPercentage?: number;
    muscleMass?: number; // kg
    visceralFat?: number;
    metabolicAge?: number;
    calories?: number; // Daily caloric intake/expenditure
    boneMass?: number; // kg
    waterPercentage?: number; // Body water percentage

    // Circumference Measurements (Optional for future)
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
    calories?: number;
    boneMass?: number;
    waterPercentage?: number;

    // Circumferences
    waist?: number;
    hips?: number;
    chest?: number;
    arms?: number;
    legs?: number;
    calf?: number;
    thigh?: number;

    notes?: string;
}
