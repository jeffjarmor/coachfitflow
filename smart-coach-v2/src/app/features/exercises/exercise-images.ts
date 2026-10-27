const GROUP_STYLES: Record<string, { symbol: string; background: string }> = {
  'Pecho': { symbol: '🏋️', background: '#f4dada' },
  'Espalda': { symbol: '🏋️', background: '#dce8f2' },
  'Hombros': { symbol: '🏋️', background: '#f1e1cc' },
  'Bíceps': { symbol: '🏋️', background: '#dcebd7' },
  'Tríceps': { symbol: '🏋️', background: '#e9e0ef' },
  'Antebrazos': { symbol: '🏋️', background: '#e4e5e1' },
  'Core': { symbol: '🧘', background: '#eee9c8' },
  'Glúteos': { symbol: '🏋️', background: '#f1d9df' },
  'Cuádriceps': { symbol: '🏋️', background: '#dce8f2' },
  'Isquiotibiales': { symbol: '🏋️', background: '#dcebd7' },
  'Aductores': { symbol: '🏋️', background: '#e9e0ef' },
  'Abductores': { symbol: '🏋️', background: '#e9e0ef' },
  'Pantorrillas': { symbol: '🏋️', background: '#f1e1cc' },
  'Cuello': { symbol: '🏋️', background: '#e4e5e1' },
  'Cardio': { symbol: '♥', background: '#f1d9df' },
  'Potencia': { symbol: '⚡', background: '#eee5a9' },
  'Rehabilitación': { symbol: '◎', background: '#dde3df' },
  'Full Body': { symbol: '🏋️', background: '#dfe4dc' }
};

export const MUSCLE_GROUPS = Object.keys(GROUP_STYLES);

export function getExerciseImage(muscleGroup?: string | null): string {
  const style = GROUP_STYLES[(muscleGroup || '').trim()] || GROUP_STYLES['Full Body'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400">
    <rect width="640" height="400" fill="${style.background}"/>
    <circle cx="320" cy="200" r="112" fill="#f8faf5" opacity=".58"/>
    <text x="320" y="218" font-family="Arial, sans-serif" font-size="112" text-anchor="middle" dominant-baseline="middle">${style.symbol}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
