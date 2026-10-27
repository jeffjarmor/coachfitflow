import { GlobalExerciseSeed } from '../global-exercise.models';

// Helper to create SVG data URI for emojis
const getEmojiImage = (emoji: string, color: string = '#f3f4f6') => {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect width="100" height="100" fill="${color}"/>
        <text x="50" y="50" font-family="Arial" font-size="60" text-anchor="middle" dy=".35em">${emoji}</text>
    </svg>`;
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
};

// Helper to create YouTube search URL
const getSearchUrl = (query: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' ejercicio tecnica')}`;

/**
 * Datos semilla para ejercicios globales en español
 */
export const SPANISH_EXERCISES: GlobalExerciseSeed[] = [
    // 🔴 PECHO (Chest)
    // Pesas / Máquinas
    {
        name: 'Press de Banca Plano',
        muscleGroup: 'Pecho',
        description: 'Ejercicio básico para desarrollo de pecho.',
        videoUrl: getSearchUrl('Press banca plano'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Press de Banca Inclinado',
        muscleGroup: 'Pecho',
        description: 'Enfocado en la porción superior del pectoral.',
        videoUrl: getSearchUrl('Press banca inclinado'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Press de Banca Declinado',
        muscleGroup: 'Pecho',
        description: 'Enfocado en la porción inferior del pectoral.',
        videoUrl: getSearchUrl('Press banca declinado'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Press con Mancuernas Plano',
        muscleGroup: 'Pecho',
        description: 'Mayor rango de movimiento con mancuernas.',
        videoUrl: getSearchUrl('Press mancuernas plano'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Press con Mancuernas Inclinado',
        muscleGroup: 'Pecho',
        description: 'Press superior con mancuernas.',
        videoUrl: getSearchUrl('Press mancuernas inclinado'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Press en Máquina',
        muscleGroup: 'Pecho',
        description: 'Press de pecho controlado en máquina.',
        videoUrl: getSearchUrl('Chest press machine'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Peck Deck (Mariposa)',
        muscleGroup: 'Pecho',
        description: 'Aislamiento de pecho en máquina.',
        videoUrl: getSearchUrl('Peck deck machine'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Cruces en Poleas (Crossover)',
        muscleGroup: 'Pecho',
        description: 'Ejercicio de aislamiento con cables.',
        videoUrl: getSearchUrl('Cable crossover chest'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Press Hammer Strength',
        muscleGroup: 'Pecho',
        description: 'Press en máquina convergente.',
        videoUrl: getSearchUrl('Hammer strength chest press'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Press Agarre Cerrado',
        muscleGroup: 'Pecho',
        description: 'Enfocado en tríceps y parte interna del pecho.',
        videoUrl: getSearchUrl('Close grip bench press'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    // Funcional / Calistenia Pecho
    {
        name: 'Flexiones (Push-ups)',
        muscleGroup: 'Pecho',
        description: 'Ejercicio clásico de peso corporal.',
        videoUrl: getSearchUrl('Push ups technique'),
        imageUrl: getEmojiImage('🤸', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Flexiones Inclinadas',
        muscleGroup: 'Pecho',
        description: 'Flexiones con manos elevadas (más fácil).',
        videoUrl: getSearchUrl('Incline push ups'),
        imageUrl: getEmojiImage('🤸', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Flexiones Declinadas',
        muscleGroup: 'Pecho',
        description: 'Flexiones con pies elevados (más difícil).',
        videoUrl: getSearchUrl('Decline push ups'),
        imageUrl: getEmojiImage('🤸', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Flexiones Diamante',
        muscleGroup: 'Pecho',
        description: 'Manos juntas para énfasis en tríceps.',
        videoUrl: getSearchUrl('Diamond push ups'),
        imageUrl: getEmojiImage('🤸', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Flexiones Explosivas',
        muscleGroup: 'Pecho',
        description: 'Flexiones con potencia.',
        videoUrl: getSearchUrl('Explosive push ups'),
        imageUrl: getEmojiImage('⚡', '#fee2e2'),
        isGlobal: true
    },

    // 🔵 ESPALDA (Back)
    // Pesas / Máquinas
    {
        name: 'Dominadas',
        muscleGroup: 'Espalda',
        description: 'Ejercicio rey para espalda.',
        videoUrl: getSearchUrl('Pull ups technique'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Jalón al Pecho (Lat Pulldown)',
        muscleGroup: 'Espalda',
        description: 'Ejercicio en máquina para amplitud.',
        videoUrl: getSearchUrl('Lat pulldown'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Remo con Barra',
        muscleGroup: 'Espalda',
        description: 'Constructor de masa para espalda.',
        videoUrl: getSearchUrl('Barbell row'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Remo Pendlay',
        muscleGroup: 'Espalda',
        description: 'Remo estricto desde el suelo.',
        videoUrl: getSearchUrl('Pendlay row'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Remo con Mancuerna',
        muscleGroup: 'Espalda',
        description: 'Remo unilateral.',
        videoUrl: getSearchUrl('Dumbbell row'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Remo en Máquina',
        muscleGroup: 'Espalda',
        description: 'Remo sentado en máquina.',
        videoUrl: getSearchUrl('Machine row'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Remo en Polea Baja',
        muscleGroup: 'Espalda',
        description: 'Remo sentado con cable.',
        videoUrl: getSearchUrl('Seated cable row'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Peso Muerto',
        muscleGroup: 'Espalda',
        description: 'Ejercicio compuesto total.',
        videoUrl: getSearchUrl('Deadlift technique'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Rack Pull',
        muscleGroup: 'Espalda',
        description: 'Peso muerto parcial.',
        videoUrl: getSearchUrl('Rack pull'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Pullover en Polea',
        muscleGroup: 'Espalda',
        description: 'Aislamiento de dorsales.',
        videoUrl: getSearchUrl('Cable pullover'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    // Funcional / Calistenia Espalda
    {
        name: 'Dominadas Australianas',
        muscleGroup: 'Espalda',
        description: 'Remo con peso corporal.',
        videoUrl: getSearchUrl('Australian pull ups'),
        imageUrl: getEmojiImage('🤸', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Superman Hold',
        muscleGroup: 'Espalda',
        description: 'Isométrico para espalda baja.',
        videoUrl: getSearchUrl('Superman exercise'),
        imageUrl: getEmojiImage('🤸', '#dbeafe'),
        isGlobal: true
    },

    // 🟠 HOMBROS (Shoulders)
    {
        name: 'Press Militar',
        muscleGroup: 'Hombros',
        description: 'Press estricto con barra.',
        videoUrl: getSearchUrl('Overhead press'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Press Arnold',
        muscleGroup: 'Hombros',
        description: 'Press con rotación.',
        videoUrl: getSearchUrl('Arnold press'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Press con Mancuernas',
        muscleGroup: 'Hombros',
        description: 'Press de hombros sentado.',
        videoUrl: getSearchUrl('Dumbbell shoulder press'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Elevaciones Laterales',
        muscleGroup: 'Hombros',
        description: 'Para deltoides lateral.',
        videoUrl: getSearchUrl('Lateral raises'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Elevaciones Frontales',
        muscleGroup: 'Hombros',
        description: 'Para deltoides frontal.',
        videoUrl: getSearchUrl('Front raises'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Pájaros (Posteriores)',
        muscleGroup: 'Hombros',
        description: 'Para deltoides posterior.',
        videoUrl: getSearchUrl('Rear delt fly'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Face Pull',
        muscleGroup: 'Hombros',
        description: 'Salud de hombro y deltoides posterior.',
        videoUrl: getSearchUrl('Face pull'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Pike Push-ups',
        muscleGroup: 'Hombros',
        description: 'Flexiones para hombros.',
        videoUrl: getSearchUrl('Pike push ups'),
        imageUrl: getEmojiImage('🤸', '#ffedd5'),
        isGlobal: true
    },

    // 🟢 BÍCEPS
    {
        name: 'Curl con Barra',
        muscleGroup: 'Bíceps',
        description: 'Básico de bíceps.',
        videoUrl: getSearchUrl('Barbell curl'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Curl con Mancuernas',
        muscleGroup: 'Bíceps',
        description: 'Curl alterno o simultáneo.',
        videoUrl: getSearchUrl('Dumbbell curl'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Curl Martillo',
        muscleGroup: 'Bíceps',
        description: 'Para braquial y antebrazo.',
        videoUrl: getSearchUrl('Hammer curl'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Curl Predicador',
        muscleGroup: 'Bíceps',
        description: 'Aislamiento en banco Scott.',
        videoUrl: getSearchUrl('Preacher curl'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Curl en Polea',
        muscleGroup: 'Bíceps',
        description: 'Tensión constante.',
        videoUrl: getSearchUrl('Cable curl'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Chin-ups',
        muscleGroup: 'Bíceps',
        description: 'Dominadas supinas.',
        videoUrl: getSearchUrl('Chin ups'),
        imageUrl: getEmojiImage('🤸', '#dcfce7'),
        isGlobal: true
    },

    // 🟣 TRÍCEPS
    {
        name: 'Fondos (Dips)',
        muscleGroup: 'Tríceps',
        description: 'Constructor de masa para tríceps.',
        videoUrl: getSearchUrl('Tricep dips'),
        imageUrl: getEmojiImage('🏋️', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Press Francés',
        muscleGroup: 'Tríceps',
        description: 'Skull crushers con barra Z.',
        videoUrl: getSearchUrl('Skull crushers'),
        imageUrl: getEmojiImage('🏋️', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Extensión en Polea',
        muscleGroup: 'Tríceps',
        description: 'Pushdowns con cable.',
        videoUrl: getSearchUrl('Tricep pushdown'),
        imageUrl: getEmojiImage('🏋️', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Extensión Overhead',
        muscleGroup: 'Tríceps',
        description: 'Extensión tras nuca.',
        videoUrl: getSearchUrl('Overhead tricep extension'),
        imageUrl: getEmojiImage('🏋️', '#f3e8ff'),
        isGlobal: true
    },

    // 🟤 ANTEBRAZOS
    {
        name: 'Curl de Muñeca',
        muscleGroup: 'Antebrazos',
        description: 'Flexión de muñeca.',
        videoUrl: getSearchUrl('Wrist curl'),
        imageUrl: getEmojiImage('🏋️', '#f5f5f4'),
        isGlobal: true
    },
    {
        name: 'Paseo del Granjero',
        muscleGroup: 'Antebrazos',
        description: 'Caminar con peso pesado.',
        videoUrl: getSearchUrl('Farmers walk'),
        imageUrl: getEmojiImage('🏋️', '#f5f5f4'),
        isGlobal: true
    },

    // 🟡 CORE / ABDOMEN
    {
        name: 'Crunch',
        muscleGroup: 'Core',
        description: 'Abdominal clásico.',
        videoUrl: getSearchUrl('Crunch exercise'),
        imageUrl: getEmojiImage('🧘', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'Elevación de Piernas',
        muscleGroup: 'Core',
        description: 'Para abdomen inferior.',
        videoUrl: getSearchUrl('Leg raises'),
        imageUrl: getEmojiImage('🧘', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'Plancha (Plank)',
        muscleGroup: 'Core',
        description: 'Estabilidad isométrica.',
        videoUrl: getSearchUrl('Plank exercise'),
        imageUrl: getEmojiImage('🧘', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'Plancha Lateral',
        muscleGroup: 'Core',
        description: 'Para oblicuos.',
        videoUrl: getSearchUrl('Side plank'),
        imageUrl: getEmojiImage('🧘', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'Russian Twists',
        muscleGroup: 'Core',
        description: 'Giros para oblicuos.',
        videoUrl: getSearchUrl('Russian twists'),
        imageUrl: getEmojiImage('🧘', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'Rueda Abdominal',
        muscleGroup: 'Core',
        description: 'Rollout intenso.',
        videoUrl: getSearchUrl('Ab wheel rollout'),
        imageUrl: getEmojiImage('🧘', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'Dead Bug',
        muscleGroup: 'Core',
        description: 'Control de core y coordinación.',
        videoUrl: getSearchUrl('Dead bug exercise'),
        imageUrl: getEmojiImage('🧘', '#fef9c3'),
        isGlobal: true
    },

    // 🔴 GLÚTEOS
    {
        name: 'Hip Thrust',
        muscleGroup: 'Glúteos',
        description: 'El mejor para glúteos.',
        videoUrl: getSearchUrl('Hip thrust'),
        imageUrl: getEmojiImage('🍑', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Puente de Glúteo',
        muscleGroup: 'Glúteos',
        description: 'Versión en suelo del hip thrust.',
        videoUrl: getSearchUrl('Glute bridge'),
        imageUrl: getEmojiImage('🍑', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Patada de Glúteo',
        muscleGroup: 'Glúteos',
        description: 'Aislamiento en polea o máquina.',
        videoUrl: getSearchUrl('Cable kickback'),
        imageUrl: getEmojiImage('🍑', '#fee2e2'),
        isGlobal: true
    },

    // 🔵 CUÁDRICEPS
    {
        name: 'Sentadilla (Squat)',
        muscleGroup: 'Cuádriceps',
        description: 'El rey de las piernas.',
        videoUrl: getSearchUrl('Barbell squat'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Sentadilla Frontal',
        muscleGroup: 'Cuádriceps',
        description: 'Énfasis en cuádriceps.',
        videoUrl: getSearchUrl('Front squat'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Prensa de Piernas',
        muscleGroup: 'Cuádriceps',
        description: 'Máquina para carga pesada.',
        videoUrl: getSearchUrl('Leg press'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Zancadas (Lunges)',
        muscleGroup: 'Cuádriceps',
        description: 'Unilateral dinámico.',
        videoUrl: getSearchUrl('Lunges exercise'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Sentadilla Búlgara',
        muscleGroup: 'Cuádriceps',
        description: 'Unilateral estático.',
        videoUrl: getSearchUrl('Bulgarian split squat'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Extensiones de Cuádriceps',
        muscleGroup: 'Cuádriceps',
        description: 'Aislamiento en máquina.',
        videoUrl: getSearchUrl('Leg extension'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },

    // 🟢 ISQUIOTIBIALES
    {
        name: 'Peso Muerto Rumano',
        muscleGroup: 'Isquiotibiales',
        description: 'Estiramiento bajo carga.',
        videoUrl: getSearchUrl('Romanian deadlift'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Curl Femoral Tumbado',
        muscleGroup: 'Isquiotibiales',
        description: 'Aislamiento en máquina.',
        videoUrl: getSearchUrl('Lying leg curl'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Buenos Días',
        muscleGroup: 'Isquiotibiales',
        description: 'Bisagra de cadera con barra.',
        videoUrl: getSearchUrl('Good mornings exercise'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },

    // 🟣 ADUCTORES / ABDUCTORES
    {
        name: 'Máquina de Aductores',
        muscleGroup: 'Aductores',
        description: 'Cerrar piernas.',
        videoUrl: getSearchUrl('Adductor machine'),
        imageUrl: getEmojiImage('🏋️', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Máquina de Abductores',
        muscleGroup: 'Abductores',
        description: 'Abrir piernas.',
        videoUrl: getSearchUrl('Abductor machine'),
        imageUrl: getEmojiImage('🏋️', '#f3e8ff'),
        isGlobal: true
    },

    // 🟠 PANTORRILLAS
    {
        name: 'Elevación de Talones de Pie',
        muscleGroup: 'Pantorrillas',
        description: 'Para gastrocnemio.',
        videoUrl: getSearchUrl('Standing calf raise'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Elevación de Talones Sentado',
        muscleGroup: 'Pantorrillas',
        description: 'Para sóleo.',
        videoUrl: getSearchUrl('Seated calf raise'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },

    // ⚫ CARDIO
    {
        name: 'Caminata',
        muscleGroup: 'Cardio',
        description: 'Cardio de bajo impacto.',
        videoUrl: getSearchUrl('Walking workout'),
        imageUrl: getEmojiImage('❤️', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Trote / Correr',
        muscleGroup: 'Cardio',
        description: 'Cardio clásico.',
        videoUrl: getSearchUrl('Running form'),
        imageUrl: getEmojiImage('❤️', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Bicicleta',
        muscleGroup: 'Cardio',
        description: 'Cardio sin impacto.',
        videoUrl: getSearchUrl('Cycling workout'),
        imageUrl: getEmojiImage('❤️', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Elíptica',
        muscleGroup: 'Cardio',
        description: 'Cardio de cuerpo completo.',
        videoUrl: getSearchUrl('Elliptical workout'),
        imageUrl: getEmojiImage('❤️', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'HIIT',
        muscleGroup: 'Cardio',
        description: 'Intervalos de alta intensidad.',
        videoUrl: getSearchUrl('HIIT workout'),
        imageUrl: getEmojiImage('❤️', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Burpees',
        muscleGroup: 'Cardio',
        description: 'Metabólico total.',
        videoUrl: getSearchUrl('Burpees'),
        imageUrl: getEmojiImage('❤️', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Saltar la Cuerda',
        muscleGroup: 'Cardio',
        description: 'Coordinación y resistencia.',
        videoUrl: getSearchUrl('Jump rope'),
        imageUrl: getEmojiImage('❤️', '#f3f4f6'),
        isGlobal: true
    },

    // ⚡ POTENCIA / EXPLOSIVOS
    {
        name: 'Box Jumps',
        muscleGroup: 'Potencia',
        description: 'Saltos al cajón.',
        videoUrl: getSearchUrl('Box jumps'),
        imageUrl: getEmojiImage('⚡', '#fef08a'),
        isGlobal: true
    },
    {
        name: 'Kettlebell Swing',
        muscleGroup: 'Potencia',
        description: 'Cadena posterior explosiva.',
        videoUrl: getSearchUrl('Kettlebell swing'),
        imageUrl: getEmojiImage('⚡', '#fef08a'),
        isGlobal: true
    },
    {
        name: 'Power Clean',
        muscleGroup: 'Potencia',
        description: 'Levantamiento olímpico.',
        videoUrl: getSearchUrl('Power clean'),
        imageUrl: getEmojiImage('⚡', '#fef08a'),
        isGlobal: true
    },

    // ♿ REHABILITACIÓN / MOVILIDAD
    {
        name: 'Rotadores con Banda',
        muscleGroup: 'Rehabilitación',
        description: 'Salud del manguito rotador.',
        videoUrl: getSearchUrl('Rotator cuff band exercises'),
        imageUrl: getEmojiImage('♿', '#e5e7eb'),
        isGlobal: true
    },
    {
        name: 'Clamshells',
        muscleGroup: 'Rehabilitación',
        description: 'Activación de glúteo medio.',
        videoUrl: getSearchUrl('Clamshells exercise'),
        imageUrl: getEmojiImage('♿', '#e5e7eb'),
        isGlobal: true
    },
    {
        name: 'Gato-Vaca',
        muscleGroup: 'Rehabilitación',
        description: 'Movilidad de columna.',
        videoUrl: getSearchUrl('Cat cow stretch'),
        imageUrl: getEmojiImage('♿', '#e5e7eb'),
        isGlobal: true
    }
];
