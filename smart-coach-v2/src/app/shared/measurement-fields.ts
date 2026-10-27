import type { ClientMeasurementInput } from '../core/data/coach-data.service';

// Capture fields and ranges from the original measurement form. `legs` is a
// legacy stored value, not an input; callers preserve it when editing a record.
export type MeasurementFieldKey = Exclude<keyof ClientMeasurementInput, 'date' | 'weight' | 'height' | 'notes' | 'legs'>;
export interface MeasurementField {
  key: MeasurementFieldKey;
  label: string;
  min: number;
  max?: number;
  step: number;
  error: string;
}

export const MEASUREMENT_INDICATORS: readonly MeasurementField[] = [
  { key: 'bodyFatPercentage', label: 'Grasa corporal (%)', min: 0, max: 100, step: 0.1, error: 'Ingresa un porcentaje entre 0 y 100.' },
  { key: 'muscleMass', label: 'Masa muscular (kg)', min: 0, step: 0.1, error: 'Ingresa una masa igual o mayor que 0 kg.' },
  { key: 'visceralFat', label: 'Grasa visceral', min: 0, step: 1, error: 'Ingresa un valor igual o mayor que 0.' },
  { key: 'metabolicAge', label: 'Edad metabólica', min: 10, max: 100, step: 1, error: 'Ingresa una edad entre 10 y 100 años.' },
  { key: 'calories', label: 'Calorías', min: 0, step: 1, error: 'Ingresa un valor igual o mayor que 0.' },
  { key: 'boneMass', label: 'Masa ósea (kg)', min: 0, step: 0.1, error: 'Ingresa una masa igual o mayor que 0 kg.' },
  { key: 'waterPercentage', label: 'Agua corporal (%)', min: 0, max: 100, step: 0.1, error: 'Ingresa un porcentaje entre 0 y 100.' }
];

export const MEASUREMENT_CIRCUMFERENCES: readonly MeasurementField[] = [
  { key: 'calf', label: 'Pantorrilla (cm)', min: 0, step: 0.1, error: 'Ingresa una medida igual o mayor que 0 cm.' },
  { key: 'thigh', label: 'Cuádriceps (cm)', min: 0, step: 0.1, error: 'Ingresa una medida igual o mayor que 0 cm.' },
  { key: 'hips', label: 'Glúteos / Cadera (cm)', min: 0, step: 0.1, error: 'Ingresa una medida igual o mayor que 0 cm.' },
  { key: 'waist', label: 'Abdomen (cm)', min: 0, step: 0.1, error: 'Ingresa una medida igual o mayor que 0 cm.' },
  { key: 'chest', label: 'Pecho / Espalda (cm)', min: 0, step: 0.1, error: 'Ingresa una medida igual o mayor que 0 cm.' },
  { key: 'arms', label: 'Bíceps (cm)', min: 0, step: 0.1, error: 'Ingresa una medida igual o mayor que 0 cm.' }
];

export const MEASUREMENT_FIELDS = [...MEASUREMENT_INDICATORS, ...MEASUREMENT_CIRCUMFERENCES];

export function localMeasurementDate(reference = new Date()): string {
  return `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, '0')}-${String(reference.getDate()).padStart(2, '0')}`;
}
