export const MUSCLE_GROUPS = [
    'Pecho',
    'Espalda',
    'Hombros',
    'Bíceps',
    'Tríceps',
    'Antebrazos',
    'Core',
    'Glúteos',
    'Cuádriceps',
    'Isquiotibiales',
    'Aductores',
    'Abductores',
    'Pantorrillas',
    'Cuello',
    'Cardio',
    'Potencia',
    'Rehabilitación',
    'Full Body'
] as const;

export type MuscleGroup = typeof MUSCLE_GROUPS[number];
