import { ExerciseItem } from '../../core/data/coach-data.service';

export const COLLECTIONS = [
  { id: 'upper', name: 'Tren superior', description: 'Empuja. Tira. Fortalece.', image: '/assets/exercises-astra/strength.jpg', groups: ['Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps', 'Antebrazos', 'Cuello'] },
  { id: 'lower', name: 'Tren inferior', description: 'Una base más fuerte.', image: '/assets/exercises-astra/training.jpg', groups: ['Piernas', 'Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Aductores', 'Abductores', 'Pantorrillas'] },
  { id: 'core', name: 'Core y movimiento', description: 'Estabilidad en cada repetición.', image: '/assets/exercises-astra/movement.jpg', groups: ['Core', 'Abdominales', 'Cardio', 'Potencia', 'Rehabilitación', 'Full Body'] }
];

export function referenceImage(group: string): string {
  return (COLLECTIONS.find((collection) => collection.groups.includes(group)) || COLLECTIONS[2]).image;
}

// Legacy records contain emoji SVG placeholders. Keep actual exercise media;
// use explicitly labelled collection photography for those placeholders.
export function hasExercisePhoto(exercise: ExerciseItem): boolean {
  const url = exercise.imageUrl?.trim() || '';
  if (/^data:image\/svg\+xml[;,]/i.test(url)) {
    try {
      const comma = url.indexOf(',');
      const svg = url.slice(0, comma).includes(';base64')
        ? new TextDecoder().decode(Uint8Array.from(atob(url.slice(comma + 1)), (char) => char.charCodeAt(0)))
        : decodeURIComponent(url.slice(comma + 1));
      return !/\p{Extended_Pictographic}/u.test(svg);
    } catch { return false; }
  }
  return /^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url) || /^data:image\/(png|jpeg|webp|gif);base64,/i.test(url);
}

export function safeVideoUrl(value?: string | null): string | null {
  try {
    const url = new URL(value || '');
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
