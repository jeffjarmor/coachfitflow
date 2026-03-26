const getEmojiImage = (emoji: string, color: string = '#f3f4f6') => {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect width="100" height="100" fill="${color}"/>
        <text x="50" y="50" font-family="Arial" font-size="60" text-anchor="middle" dy=".35em">${emoji}</text>
    </svg>`;
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
};

export const MUSCLE_GROUP_IMAGES: Record<string, string> = {
    'Pecho': getEmojiImage('🏋️', '#fee2e2'),
    'Espalda': getEmojiImage('🏋️', '#dbeafe'),
    'Hombros': getEmojiImage('🏋️', '#ffedd5'),
    'Bíceps': getEmojiImage('🏋️', '#dcfce7'),
    'Tríceps': getEmojiImage('🏋️', '#f3e8ff'),
    'Antebrazos': getEmojiImage('🏋️', '#f5f5f4'),
    'Core': getEmojiImage('🧘', '#fef9c3'),
    'Glúteos': getEmojiImage('🍑', '#fee2e2'),
    'Cuádriceps': getEmojiImage('🏋️', '#dbeafe'),
    'Isquiotibiales': getEmojiImage('🏋️', '#dcfce7'),
    'Aductores': getEmojiImage('🏋️', '#f3e8ff'),
    'Abductores': getEmojiImage('🏋️', '#f3e8ff'),
    'Pantorrillas': getEmojiImage('🏋️', '#ffedd5'),
    'Cuello': getEmojiImage('🏋️', '#f3f4f6'),
    'Cardio': getEmojiImage('❤️', '#f3f4f6'),
    'Potencia': getEmojiImage('⚡', '#fef08a'),
    'Rehabilitación': getEmojiImage('♿', '#e5e7eb'),
    'Full Body': getEmojiImage('🏋️', '#f3f4f6')
};

export const getDefaultExerciseImage = (muscleGroup?: string | null): string => {
    const group = (muscleGroup || '').trim();
    return MUSCLE_GROUP_IMAGES[group] || MUSCLE_GROUP_IMAGES['Full Body'];
};

