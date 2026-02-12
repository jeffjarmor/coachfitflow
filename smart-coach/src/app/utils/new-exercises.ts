import { Exercise } from '../models/exercise.model';

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
 * Nuevos ejercicios para agregar a la biblioteca global
 * TOTAL: 142 ejercicios nuevos
 */
export const NEW_EXERCISES: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'>[] = [
    // 💪 PECHO (10 nuevos) - Color: #fee2e2
    {
        name: 'Aperturas con Mancuernas Plano',
        muscleGroup: 'Pecho',
        description: 'Estiramiento del pectoral en banco plano.',
        videoUrl: getSearchUrl('Dumbbell flys flat bench'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Aperturas con Mancuernas Inclinado',
        muscleGroup: 'Pecho',
        description: 'Enfocado en la parte superior del pecho.',
        videoUrl: getSearchUrl('Incline dumbbell flys'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Aperturas con Mancuernas Declinado',
        muscleGroup: 'Pecho',
        description: 'Enfocado en la parte inferior del pecho.',
        videoUrl: getSearchUrl('Decline dumbbell flys'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Pullover con Mancuerna',
        muscleGroup: 'Pecho',
        description: 'Expansión de la caja torácica y trabajo de serratos.',
        videoUrl: getSearchUrl('Dumbbell pullover chest'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Press Svend',
        muscleGroup: 'Pecho',
        description: 'Contracción isométrica para pecho interno.',
        videoUrl: getSearchUrl('Svend press'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Landmine Press',
        muscleGroup: 'Pecho',
        description: 'Press unilateral en ángulo para pecho superior.',
        videoUrl: getSearchUrl('Landmine press chest'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Flexiones Arqueras',
        muscleGroup: 'Pecho',
        description: 'Variación de flexión con énfasis unilateral.',
        videoUrl: getSearchUrl('Archer push ups'),
        imageUrl: getEmojiImage('🤸', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Flexiones con Palmada',
        muscleGroup: 'Pecho',
        description: 'Ejercicio pliométrico para potencia.',
        videoUrl: getSearchUrl('Clap push ups'),
        imageUrl: getEmojiImage('⚡', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Flexiones Hindú',
        muscleGroup: 'Pecho',
        description: 'Movimiento fluido para fuerza y movilidad.',
        videoUrl: getSearchUrl('Hindu push ups'),
        imageUrl: getEmojiImage('🤸', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Cable Fly Alto a Bajo',
        muscleGroup: 'Pecho',
        description: 'Cruce de cables enfocado en fibras inferiores.',
        videoUrl: getSearchUrl('High to low cable fly'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },

    // 🔷 ESPALDA (10 nuevos) - Color: #dbeafe
    {
        name: 'Remo en T (T-Bar Row)',
        muscleGroup: 'Espalda',
        description: 'Excelente para grosor y densidad de espalda.',
        videoUrl: getSearchUrl('T bar row'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Remo Meadows',
        muscleGroup: 'Espalda',
        description: 'Remo unilateral enfocado en dorsales.',
        videoUrl: getSearchUrl('Meadows row'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Remo con Apoyo en Pecho',
        muscleGroup: 'Espalda',
        description: 'Aura el impulso para aislar la espalda.',
        videoUrl: getSearchUrl('Chest supported row'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Jalón con Agarre Cerrado',
        muscleGroup: 'Espalda',
        description: 'Enfocado en la parte baja de los dorsales.',
        videoUrl: getSearchUrl('Close grip lat pulldown'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Jalón con Agarre Ancho',
        muscleGroup: 'Espalda',
        description: 'Para desarrollar amplitud de espalda.',
        videoUrl: getSearchUrl('Wide grip lat pulldown'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Remo Invertido',
        muscleGroup: 'Espalda',
        description: 'Ejercicio de peso corporal efectivo.',
        videoUrl: getSearchUrl('Inverted row'),
        imageUrl: getEmojiImage('🤸', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Hiperextensiones',
        muscleGroup: 'Espalda',
        description: 'Fortalecimiento de espalda baja y cadena posterior.',
        videoUrl: getSearchUrl('Hyperextensions back'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Peso Muerto Piernas Rígidas',
        muscleGroup: 'Espalda',
        description: 'Enfocado en espalda baja e isquiotibiales.',
        videoUrl: getSearchUrl('Stiff legged deadlift'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Shrugs con Barra',
        muscleGroup: 'Espalda',
        description: 'Para desarrollar trapecios grandes.',
        videoUrl: getSearchUrl('Barbell shrugs'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Remo Kroc',
        muscleGroup: 'Espalda',
        description: 'Remo con mancuerna a altas repeticiones.',
        videoUrl: getSearchUrl('Kroc rows'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },

    // 🔶 HOMBROS (10 nuevos) - Color: #ffedd5
    {
        name: 'Press en Máquina',
        muscleGroup: 'Hombros',
        description: 'Press seguro y controlado.',
        videoUrl: getSearchUrl('Machine shoulder press'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Press Bradford',
        muscleGroup: 'Hombros',
        description: 'Tensión constante en deltoides.',
        videoUrl: getSearchUrl('Bradford press'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Elevaciones Laterales en Polea',
        muscleGroup: 'Hombros',
        description: 'Tensión constante en todo el rango.',
        videoUrl: getSearchUrl('Cable lateral raises'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Elevaciones Posteriores en Polea',
        muscleGroup: 'Hombros',
        description: 'Aislamiento superior para deltoides posterior.',
        videoUrl: getSearchUrl('Cable rear delt fly'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Remo al Mentón',
        muscleGroup: 'Hombros',
        description: 'Trabaja deltoides y trapecios.',
        videoUrl: getSearchUrl('Upright row'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Shrugs con Mancuernas',
        muscleGroup: 'Hombros',
        description: 'Aislamiento de trapecios.',
        videoUrl: getSearchUrl('Dumbbell shrugs'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Elevaciones en Y',
        muscleGroup: 'Hombros',
        description: 'Activación de trapecio inferior y deltoides.',
        videoUrl: getSearchUrl('Y raises'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Elevaciones en W',
        muscleGroup: 'Hombros',
        description: 'Fortalecimiento de manguito rotador.',
        videoUrl: getSearchUrl('W raises'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Rotación Externa con Cables',
        muscleGroup: 'Hombros',
        description: 'Salud del hombro.',
        videoUrl: getSearchUrl('Cable external rotation'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Flexiones Verticales (Handstand Push-ups)',
        muscleGroup: 'Hombros',
        description: 'Ejercicio avanzado de peso corporal.',
        videoUrl: getSearchUrl('Handstand push ups'),
        imageUrl: getEmojiImage('🤸', '#ffedd5'),
        isGlobal: true
    },

    // 💚 BÍCEPS (10 nuevos) - Color: #dcfce7
    {
        name: 'Curl Concentrado',
        muscleGroup: 'Bíceps',
        description: 'Aislamiento total eliminando impulso.',
        videoUrl: getSearchUrl('Concentration curl'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Curl Inclinado con Mancuernas',
        muscleGroup: 'Bíceps',
        description: 'Estiramiento máximo de la cabeza larga.',
        videoUrl: getSearchUrl('Incline dumbbell curl'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Curl 21s',
        muscleGroup: 'Bíceps',
        description: 'Técnica de intensidad con rangos parciales.',
        videoUrl: getSearchUrl('21s bicep curl'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Curl Zottman',
        muscleGroup: 'Bíceps',
        description: 'Trabaja bíceps en subida y antebrazos en bajada.',
        videoUrl: getSearchUrl('Zottman curl'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Curl Spider',
        muscleGroup: 'Bíceps',
        description: 'Enfocado en el pico del bíceps.',
        videoUrl: getSearchUrl('Spider curl'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Curl en Banco Scott (Barra Z)',
        muscleGroup: 'Bíceps',
        description: 'Estricto aislamiento.',
        videoUrl: getSearchUrl('Preacher curl ez bar'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Curl con Barra Z',
        muscleGroup: 'Bíceps',
        description: 'Más cómodo para las muñecas que la barra recta.',
        videoUrl: getSearchUrl('EZ bar curl'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Curl Cruzado (Cross Body)',
        muscleGroup: 'Bíceps',
        description: 'Enfocado en el braquial y pico.',
        videoUrl: getSearchUrl('Cross body hammer curl'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Curl Isométrico (Sostener)',
        muscleGroup: 'Bíceps',
        description: 'Construye fuerza estática.',
        videoUrl: getSearchUrl('Isometric bicep hold'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Drag Curl',
        muscleGroup: 'Bíceps',
        description: 'Mantiene la barra pegada al cuerpo, énfasis en contracción.',
        videoUrl: getSearchUrl('Drag curl'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },

    // 💜 TRÍCEPS (10 nuevos) - Color: #f3e8ff
    {
        name: 'Patada de Tríceps (Kickback)',
        muscleGroup: 'Tríceps',
        description: 'Aislamiento de la cabeza larga.',
        videoUrl: getSearchUrl('Tricep kickback'),
        imageUrl: getEmojiImage('🏋️', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Fondos en Banco',
        muscleGroup: 'Tríceps',
        description: 'Efectivo ejercicio de peso corporal.',
        videoUrl: getSearchUrl('Bench dips'),
        imageUrl: getEmojiImage('🏋️', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'JM Press',
        muscleGroup: 'Tríceps',
        description: 'Híbrido entre press cerrado y rompecráneos.',
        videoUrl: getSearchUrl('JM press'),
        imageUrl: getEmojiImage('🏋️', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Extensión con Mancuerna a Dos Manos (Copa)',
        muscleGroup: 'Tríceps',
        description: 'Gran estiramiento de la cabeza larga.',
        videoUrl: getSearchUrl('Two arm dumbbell tricep extension'),
        imageUrl: getEmojiImage('🏋️', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Extensión de Tríceps con Cuerda',
        muscleGroup: 'Tríceps',
        description: 'Enfocado en la cabeza lateral.',
        videoUrl: getSearchUrl('Rope tricep pushdown'),
        imageUrl: getEmojiImage('🏋️', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Press Francés con Mancuernas',
        muscleGroup: 'Tríceps',
        description: 'Permite un rango más natural que la barra.',
        videoUrl: getSearchUrl('Dumbbell skull crushers'),
        imageUrl: getEmojiImage('🏋️', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Kickback en Polea',
        muscleGroup: 'Tríceps',
        description: 'Tensión constante durante todo el movimiento.',
        videoUrl: getSearchUrl('Cable tricep kickback'),
        imageUrl: getEmojiImage('🏋️', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Extensión Unilateral en Polea',
        muscleGroup: 'Tríceps',
        description: 'Para corregir desequilibrios.',
        videoUrl: getSearchUrl('Single arm tricep pushdown'),
        imageUrl: getEmojiImage('🏋️', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Tate Press',
        muscleGroup: 'Tríceps',
        description: 'Movimiento único para tríceps.',
        videoUrl: getSearchUrl('Tate press'),
        imageUrl: getEmojiImage('🏋️', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Fondos en Anillas',
        muscleGroup: 'Tríceps',
        description: 'Requiere gran estabilidad.',
        videoUrl: getSearchUrl('Ring dips'),
        imageUrl: getEmojiImage('🤸', '#f3e8ff'),
        isGlobal: true
    },

    // 🤎 ANTEBRAZOS (8 nuevos) - Color: #f5f5f4
    {
        name: 'Curl de Muñeca Inverso',
        muscleGroup: 'Antebrazos',
        description: 'Trabaja los extensores de la muñeca.',
        videoUrl: getSearchUrl('Reverse wrist curl'),
        imageUrl: getEmojiImage('🏋️', '#f5f5f4'),
        isGlobal: true
    },
    {
        name: 'Agarre de Discos (Pinch Grip)',
        muscleGroup: 'Antebrazos',
        description: 'Desarrolla fuerza de pinza.',
        videoUrl: getSearchUrl('Plate pinch'),
        imageUrl: getEmojiImage('🏋️', '#f5f5f4'),
        isGlobal: true
    },
    {
        name: 'Curl Inverso con Barra',
        muscleGroup: 'Antebrazos',
        description: 'Trabaja braquiorradial y extensores.',
        videoUrl: getSearchUrl('Reverse barbell curl'),
        imageUrl: getEmojiImage('🏋️', '#f5f5f4'),
        isGlobal: true
    },
    {
        name: 'Rodillo de Muñeca (Wrist Roller)',
        muscleGroup: 'Antebrazos',
        description: 'Quema garantizada para antebrazos.',
        videoUrl: getSearchUrl('Wrist roller exercise'),
        imageUrl: getEmojiImage('🏋️', '#f5f5f4'),
        isGlobal: true
    },
    {
        name: 'Colgado en Barra (Dead Hang)',
        muscleGroup: 'Antebrazos',
        description: 'Resistencia isométrica de agarre.',
        videoUrl: getSearchUrl('Dead hang'),
        imageUrl: getEmojiImage('🤸', '#f5f5f4'),
        isGlobal: true
    },
    {
        name: 'Agarre con Toalla',
        muscleGroup: 'Antebrazos',
        description: 'Variante de dominada más difícil para agarre.',
        videoUrl: getSearchUrl('Towel pull ups'),
        imageUrl: getEmojiImage('🤸', '#f5f5f4'),
        isGlobal: true
    },
    {
        name: 'Flexión Radial de Muñeca',
        muscleGroup: 'Antebrazos',
        description: 'Movimiento lateral de muñeca (martillo solo muñeca).',
        videoUrl: getSearchUrl('Radial deviation exercise'),
        imageUrl: getEmojiImage('🏋️', '#f5f5f4'),
        isGlobal: true
    },
    {
        name: 'Flexión Ulnar de Muñeca',
        muscleGroup: 'Antebrazos',
        description: 'Movimiento lateral opuesto.',
        videoUrl: getSearchUrl('Ulnar deviation exercise'),
        imageUrl: getEmojiImage('🏋️', '#f5f5f4'),
        isGlobal: true
    },

    // 🟡 CORE (15 nuevos) - Color: #fef9c3
    {
        name: 'Escaladores (Mountain Climbers)',
        muscleGroup: 'Core',
        description: 'Cardio y core combinados.',
        videoUrl: getSearchUrl('Mountain climbers'),
        imageUrl: getEmojiImage('⚡', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'Abdominales Bicicleta',
        muscleGroup: 'Core',
        description: 'Uno de los mejores para oblicuos.',
        videoUrl: getSearchUrl('Bicycle crunches'),
        imageUrl: getEmojiImage('🤸', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'Press Pallof',
        muscleGroup: 'Core',
        description: 'Anti-rotación fundamental.',
        videoUrl: getSearchUrl('Pallof press'),
        imageUrl: getEmojiImage('🏋️', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'Leñadores (Woodchoppers)',
        muscleGroup: 'Core',
        description: 'Fuerza rotacional funcional.',
        videoUrl: getSearchUrl('Cable woodchoppers'),
        imageUrl: getEmojiImage('🏋️', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'Bandera del Dragón (Dragon Flag)',
        muscleGroup: 'Core',
        description: 'Ejercicio avanzado (estilo Bruce Lee).',
        videoUrl: getSearchUrl('Dragon flag'),
        imageUrl: getEmojiImage('🤸', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'L-Sit',
        muscleGroup: 'Core',
        description: 'Isométrico avanzado.',
        videoUrl: getSearchUrl('L-sit exercise'),
        imageUrl: getEmojiImage('🤸', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'Hollow Body Hold',
        muscleGroup: 'Core',
        description: 'Fundamento gimnástico.',
        videoUrl: getSearchUrl('Hollow body hold'),
        imageUrl: getEmojiImage('🤸', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'V-Ups',
        muscleGroup: 'Core',
        description: 'Dinámico y explosivo.',
        videoUrl: getSearchUrl('V ups'),
        imageUrl: getEmojiImage('🤸', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'Toes to Bar (Pies a la Barra)',
        muscleGroup: 'Core',
        description: 'Elevación completa colgado.',
        videoUrl: getSearchUrl('Toes to bar'),
        imageUrl: getEmojiImage('🤸', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'Windshield Wipers (Limpiaparabrisas)',
        muscleGroup: 'Core',
        description: 'Control rotacional avanzado.',
        videoUrl: getSearchUrl('Windshield wipers exercise'),
        imageUrl: getEmojiImage('🤸', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'Crunch Inverso',
        muscleGroup: 'Core',
        description: 'Menos estrés en cuello, bueno para abdomen bajo.',
        videoUrl: getSearchUrl('Reverse crunch'),
        imageUrl: getEmojiImage('🤸', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'Plancha con Toque de Hombro',
        muscleGroup: 'Core',
        description: 'Anti-rotación dinámica.',
        videoUrl: getSearchUrl('Plank shoulder taps'),
        imageUrl: getEmojiImage('🤸', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'Bird Dog',
        muscleGroup: 'Core',
        description: 'Estabilidad de columna y coordinación.',
        videoUrl: getSearchUrl('Bird dog exercise'),
        imageUrl: getEmojiImage('🧘', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'Sit-ups (Abdominales)',
        muscleGroup: 'Core',
        description: 'Clásico levantamiento de tronco.',
        videoUrl: getSearchUrl('Sit ups'),
        imageUrl: getEmojiImage('🤸', '#fef9c3'),
        isGlobal: true
    },
    {
        name: 'Cable Crunch',
        muscleGroup: 'Core',
        description: 'De rodillas con polea.',
        videoUrl: getSearchUrl('Kneeling cable crunch'),
        imageUrl: getEmojiImage('🏋️', '#fef9c3'),
        isGlobal: true
    },

    // 🍑 GLÚTEOS (12 nuevos) - Color: #fee2e2
    {
        name: 'Peso Muerto Sumo',
        muscleGroup: 'Glúteos',
        description: 'Gran activación de glúteos y aductores.',
        videoUrl: getSearchUrl('Sumo deadlift'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Hidrantes (Fire Hydrants)',
        muscleGroup: 'Glúteos',
        description: 'Activación de glúteo medio.',
        videoUrl: getSearchUrl('Fire hydrant exercise'),
        imageUrl: getEmojiImage('🍑', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Bombas de Rana (Frog Pumps)',
        muscleGroup: 'Glúteos',
        description: 'Variación de puente para mayor activación.',
        videoUrl: getSearchUrl('Frog pumps'),
        imageUrl: getEmojiImage('🍑', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Hip Thrust a Una Pierna',
        muscleGroup: 'Glúteos',
        description: 'Desafiante variación unilateral.',
        videoUrl: getSearchUrl('Single leg hip thrust'),
        imageUrl: getEmojiImage('🍑', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Hiperextensión Inversa',
        muscleGroup: 'Glúteos',
        description: 'Excelente para glúteos y espalda baja saludable.',
        videoUrl: getSearchUrl('Reverse hyperextension'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Patada con Banda',
        muscleGroup: 'Glúteos',
        description: 'Activación con resistencia elástica.',
        videoUrl: getSearchUrl('Banded glute kickback'),
        imageUrl: getEmojiImage('🍑', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Donkey Kicks',
        muscleGroup: 'Glúteos',
        description: 'Clásico de peso corporal.',
        videoUrl: getSearchUrl('Donkey kicks'),
        imageUrl: getEmojiImage('🍑', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Step-ups (Subidas al Cajón)',
        muscleGroup: 'Glúteos',
        description: 'Unilateral funcional.',
        videoUrl: getSearchUrl('Step ups'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Abducción de Cadera en Polea',
        muscleGroup: 'Glúteos',
        description: 'Aislamiento de glúteo medio.',
        videoUrl: getSearchUrl('Cable hip abduction'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Puente con Una Pierna',
        muscleGroup: 'Glúteos',
        description: 'Variación unilateral en suelo.',
        videoUrl: getSearchUrl('Single leg glute bridge'),
        imageUrl: getEmojiImage('🍑', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Curtsy Lunge (Zancada Reverencia)',
        muscleGroup: 'Glúteos',
        description: 'Impacta glúteo medio desde otro ángulo.',
        videoUrl: getSearchUrl('Curtsy lunge'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },
    {
        name: 'Cable Pull-Through',
        muscleGroup: 'Glúteos',
        description: 'Patrón de bisagra con tensión constante.',
        videoUrl: getSearchUrl('Cable pull through'),
        imageUrl: getEmojiImage('🏋️', '#fee2e2'),
        isGlobal: true
    },

    // 🔵 CUÁDRICEPS (8 nuevos) - Color: #dbeafe
    {
        name: 'Sentadilla Goblet',
        muscleGroup: 'Cuádriceps',
        description: 'Sentadilla frontal accesible con mancuerna/kettlebell.',
        videoUrl: getSearchUrl('Goblet squat'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Hack Squat',
        muscleGroup: 'Cuádriceps',
        description: 'Sentadilla guiada con soporte de espalda.',
        videoUrl: getSearchUrl('Hack squat machine'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Sissy Squat',
        muscleGroup: 'Cuádriceps',
        description: 'Aislamiento extremo de cuádriceps.',
        videoUrl: getSearchUrl('Sissy squat'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Box Squat',
        muscleGroup: 'Cuádriceps',
        description: 'Desarrolla potencia explosiva.',
        videoUrl: getSearchUrl('Box squat'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Sentadilla Ciclista',
        muscleGroup: 'Cuádriceps',
        description: 'Talones elevados para énfasis en cuádriceps.',
        videoUrl: getSearchUrl('Cyclist squat'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Zancadas Caminando',
        muscleGroup: 'Cuádriceps',
        description: 'Constructor dinámico de piernas.',
        videoUrl: getSearchUrl('Walking lunges'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Zancadas Inversas',
        muscleGroup: 'Cuádriceps',
        description: 'Menos estrés en la rodilla que las frontales.',
        videoUrl: getSearchUrl('Reverse lunges'),
        imageUrl: getEmojiImage('🏋️', '#dbeafe'),
        isGlobal: true
    },
    {
        name: 'Pistol Squat',
        muscleGroup: 'Cuádriceps',
        description: 'Sentadilla a una pierna avanzada.',
        videoUrl: getSearchUrl('Pistol squat'),
        imageUrl: getEmojiImage('🤸', '#dbeafe'),
        isGlobal: true
    },

    // 🟢 ISQUIOTIBIALES (9 nuevos) - Color: #dcfce7
    {
        name: 'Curl Nórdico',
        muscleGroup: 'Isquiotibiales',
        description: 'El mejor ejercicio excéntrico para prevención de lesiones.',
        videoUrl: getSearchUrl('Nordic curl'),
        imageUrl: getEmojiImage('🤸', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Glute Ham Raise (GHR)',
        muscleGroup: 'Isquiotibiales',
        description: 'Fortalece toda la cadena posterior.',
        videoUrl: getSearchUrl('Glute ham raise'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Peso Muerto a Una Pierna',
        muscleGroup: 'Isquiotibiales',
        description: 'Trabaja equilibrio y fuerza unilateral.',
        videoUrl: getSearchUrl('Single leg deadlift'),
        imageUrl: getEmojiImage('⚖️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Curl Femoral Sentado',
        muscleGroup: 'Isquiotibiales',
        description: 'A menudo superior a la versión tumbada por el estiramiento.',
        videoUrl: getSearchUrl('Seated leg curl'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Curl con Pelota Suiza',
        muscleGroup: 'Isquiotibiales',
        description: 'Suma inestabilidad y trabajo de core.',
        videoUrl: getSearchUrl('Swiss ball hamstring curl'),
        imageUrl: getEmojiImage('🔵', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Slider Curl',
        muscleGroup: 'Isquiotibiales',
        description: 'Versión casera efectiva usando deslizadores.',
        videoUrl: getSearchUrl('Slider hamstring curl'),
        imageUrl: getEmojiImage('🤸', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Single Leg RDL',
        muscleGroup: 'Isquiotibiales',
        description: 'Peso muerto rumano a una pierna.',
        videoUrl: getSearchUrl('Single leg RDL'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Peso Muerto Piernas Rígidas',
        muscleGroup: 'Isquiotibiales',
        description: 'Énfasis máximo en estiramiento.',
        videoUrl: getSearchUrl('Stiff legged deadlift'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },
    {
        name: 'Good Morning Sentado',
        muscleGroup: 'Isquiotibiales',
        description: 'Aisla espalda baja e isquios sin rodillas involucradas.',
        videoUrl: getSearchUrl('Seated good morning'),
        imageUrl: getEmojiImage('🏋️', '#dcfce7'),
        isGlobal: true
    },

    // 🟣 ADUCTORES (5 nuevos) - Color: #f3e8ff
    {
        name: 'Plancha Copenhagen',
        muscleGroup: 'Aductores',
        description: 'Isométrico de alto nivel para ingle.',
        videoUrl: getSearchUrl('Copenhagen plank'),
        imageUrl: getEmojiImage('🤸', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Zancadas Laterales (Side Lunges)',
        muscleGroup: 'Aductores',
        description: 'Movimiento en plano frontal.',
        videoUrl: getSearchUrl('Side lunges'),
        imageUrl: getEmojiImage('🏋️', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Sentadilla Cosaca',
        muscleGroup: 'Aductores',
        description: 'Gran rango de movimiento y movilidad.',
        videoUrl: getSearchUrl('Cossack squat'),
        imageUrl: getEmojiImage('🤸', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Squeeze con Pelota',
        muscleGroup: 'Aductores',
        description: 'Isométrico apretando entre rodillas.',
        videoUrl: getSearchUrl('Ball squeeze exercise'),
        imageUrl: getEmojiImage('🔵', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Aducción en Polea',
        muscleGroup: 'Aductores',
        description: 'Aducción de cadera de pie con cable.',
        videoUrl: getSearchUrl('Cable hip adduction'),
        imageUrl: getEmojiImage('🏋️', '#f3e8ff'),
        isGlobal: true
    },

    // 🟣 ABDUCTORES (5 nuevos) - Color: #f3e8ff
    {
        name: 'Caminata Lateral con Banda',
        muscleGroup: 'Abductores',
        description: 'Activación clásica de glúteo medio.',
        videoUrl: getSearchUrl('Lateral band walk'),
        imageUrl: getEmojiImage('🎗️', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Elevación Lateral Tumbado',
        muscleGroup: 'Abductores',
        description: 'Aislamiento simple estilo Jane Fonda.',
        videoUrl: getSearchUrl('Side lying leg raise'),
        imageUrl: getEmojiImage('🤸', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Monster Walks',
        muscleGroup: 'Abductores',
        description: 'Caminata con banda resistida.',
        videoUrl: getSearchUrl('Monster walks'),
        imageUrl: getEmojiImage('🎗️', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Fire Hydrant con Banda',
        muscleGroup: 'Abductores',
        description: 'Hidrantes resistidos.',
        videoUrl: getSearchUrl('Banded fire hydrant'),
        imageUrl: getEmojiImage('🎗️', '#f3e8ff'),
        isGlobal: true
    },
    {
        name: 'Abducción de Cadera de Pie',
        muscleGroup: 'Abductores',
        description: 'Sin máquina, con peso corporal o banda.',
        videoUrl: getSearchUrl('Standing hip abduction'),
        imageUrl: getEmojiImage('🤸', '#f3e8ff'),
        isGlobal: true
    },

    // 🟠 PANTORRILLAS (6 nuevos) - Color: #ffedd5
    {
        name: 'Elevación de Talones en Prensa',
        muscleGroup: 'Pantorrillas',
        description: 'Permite manejar grandes cargas de forma segura.',
        videoUrl: getSearchUrl('Calf raise on leg press'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Elevación de Talones a Una Pierna',
        muscleGroup: 'Pantorrillas',
        description: 'Unilateral con peso corporal o mancuerna.',
        videoUrl: getSearchUrl('Single leg calf raise'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Saltos de Pantorrilla (Pogo Jumps)',
        muscleGroup: 'Pantorrillas',
        description: 'Trabajo pliométrico y rigidez del tendón.',
        videoUrl: getSearchUrl('Pogo jumps'),
        imageUrl: getEmojiImage('⚡', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Elevación Tipo Burro (Donkey Calf Raise)',
        muscleGroup: 'Pantorrillas',
        description: 'Gran estiramiento del gastrocnemio.',
        videoUrl: getSearchUrl('Donkey calf raise'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Elevación en Smith Machine',
        muscleGroup: 'Pantorrillas',
        description: 'Estable y permite carga pesada.',
        videoUrl: getSearchUrl('Smith machine calf raise'),
        imageUrl: getEmojiImage('🏋️', '#ffedd5'),
        isGlobal: true
    },
    {
        name: 'Elevación de Tibial (Tibialis Raise)',
        muscleGroup: 'Pantorrillas',
        description: 'Antagonista vital para salud de rodilla y tobillo.',
        videoUrl: getSearchUrl('Tibialis anterior raise'),
        imageUrl: getEmojiImage('🦶', '#ffedd5'),
        isGlobal: true
    },

    // 🦴 CUELLO (6 nuevos) - Color: #e5e7eb
    {
        name: 'Flexión de Cuello',
        muscleGroup: 'Cuello',
        description: 'Fortalecimiento frontal (esternocleidomastoideo).',
        videoUrl: getSearchUrl('Neck flexion exercise'),
        imageUrl: getEmojiImage('👤', '#e5e7eb'),
        isGlobal: true
    },
    {
        name: 'Extensión de Cuello',
        muscleGroup: 'Cuello',
        description: 'Fortalecimiento posterior.',
        videoUrl: getSearchUrl('Neck extension exercise'),
        imageUrl: getEmojiImage('👤', '#e5e7eb'),
        isGlobal: true
    },
    {
        name: 'Flexión Lateral de Cuello',
        muscleGroup: 'Cuello',
        description: 'Fortalecimiento lateral.',
        videoUrl: getSearchUrl('Lateral neck flexion'),
        imageUrl: getEmojiImage('👤', '#e5e7eb'),
        isGlobal: true
    },
    {
        name: 'Isométricos de Cuello',
        muscleGroup: 'Cuello',
        description: 'Resistencia estática en 4 direcciones.',
        videoUrl: getSearchUrl('Isometric neck exercises'),
        imageUrl: getEmojiImage('👤', '#e5e7eb'),
        isGlobal: true
    },
    {
        name: 'Neck Curl con Disco',
        muscleGroup: 'Cuello',
        description: 'Flexión con peso libre.',
        videoUrl: getSearchUrl('Plate neck curl'),
        imageUrl: getEmojiImage('🏋️', '#e5e7eb'),
        isGlobal: true
    },
    {
        name: 'Arnes de Cuello',
        muscleGroup: 'Cuello',
        description: 'Entrenamiento avanzado con accesorio.',
        videoUrl: getSearchUrl('Neck harness exercises'),
        imageUrl: getEmojiImage('⛓️', '#e5e7eb'),
        isGlobal: true
    },

    // ❤️ CARDIO (8 nuevos) - Color: #f3f4f6
    {
        name: 'Remo en Máquina (Concept2)',
        muscleGroup: 'Cardio',
        description: 'Cardio de cuerpo completo sin impacto.',
        videoUrl: getSearchUrl('Rowing machine technique'),
        imageUrl: getEmojiImage('🚣', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Escaladora (Stair Climber)',
        muscleGroup: 'Cardio',
        description: 'Gran quema calórica y trabajo de glúteos.',
        videoUrl: getSearchUrl('Stair climber workout'),
        imageUrl: getEmojiImage('🪜', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Cuerdas de Batalla (Battle Ropes)',
        muscleGroup: 'Cardio',
        description: 'Cardio de alta intensidad para tren superior.',
        videoUrl: getSearchUrl('Battle ropes exercises'),
        imageUrl: getEmojiImage('〰️', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Sprints',
        muscleGroup: 'Cardio',
        description: 'Máxima intensidad y potencia.',
        videoUrl: getSearchUrl('Sprinting technique'),
        imageUrl: getEmojiImage('🏃', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Jumping Jacks',
        muscleGroup: 'Cardio',
        description: 'Clásico para elevar pulsaciones.',
        videoUrl: getSearchUrl('Jumping jacks'),
        imageUrl: getEmojiImage('🤸', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Rodillas al Pecho (High Knees)',
        muscleGroup: 'Cardio',
        description: 'Correr en el sitio intensamente.',
        videoUrl: getSearchUrl('High knees exercise'),
        imageUrl: getEmojiImage('🏃', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Talones al Glúteo (Butt Kicks)',
        muscleGroup: 'Cardio',
        description: 'Activación dinámica de isquios.',
        videoUrl: getSearchUrl('Butt kicks exercise'),
        imageUrl: getEmojiImage('🏃', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Saltos de Tijera (Split Jumps)',
        muscleGroup: 'Cardio',
        description: 'Pliometría cardiovascular.',
        videoUrl: getSearchUrl('Split jumps'),
        imageUrl: getEmojiImage('⚡', '#f3f4f6'),
        isGlobal: true
    },

    // ⚡ POTENCIA (9 nuevos) - Color: #fef08a
    {
        name: 'Cargada y Envión (Clean & Jerk)',
        muscleGroup: 'Potencia',
        description: 'Rey de los ejercicios de potencia.',
        videoUrl: getSearchUrl('Clean and jerk technique'),
        imageUrl: getEmojiImage('🏋️', '#fef08a'),
        isGlobal: true
    },
    {
        name: 'Arrancada (Snatch)',
        muscleGroup: 'Potencia',
        description: 'Movimiento olímpico técnico y explosivo.',
        videoUrl: getSearchUrl('Snatch technique'),
        imageUrl: getEmojiImage('🏋️', '#fef08a'),
        isGlobal: true
    },
    {
        name: 'Push Press',
        muscleGroup: 'Potencia',
        description: 'Press sobre la cabeza con impulso de piernas.',
        videoUrl: getSearchUrl('Push press'),
        imageUrl: getEmojiImage('🏋️', '#fef08a'),
        isGlobal: true
    },
    {
        name: 'Golpe con Balón Medicinal (Slam)',
        muscleGroup: 'Potencia',
        description: 'Potencia pura sin fase excéntrica.',
        videoUrl: getSearchUrl('Medicine ball slam'),
        imageUrl: getEmojiImage('🏐', '#fef08a'),
        isGlobal: true
    },
    {
        name: 'Salto Horizontal (Broad Jump)',
        muscleGroup: 'Potencia',
        description: 'Potencia horizontal de piernas.',
        videoUrl: getSearchUrl('Broad jump'),
        imageUrl: getEmojiImage('🐇', '#fef08a'),
        isGlobal: true
    },
    {
        name: 'Salto Vertical',
        muscleGroup: 'Potencia',
        description: 'Máxima altura posible.',
        videoUrl: getSearchUrl('Vertical jump training'),
        imageUrl: getEmojiImage('⬆️', '#fef08a'),
        isGlobal: true
    },
    {
        name: 'Hang Clean',
        muscleGroup: 'Potencia',
        description: 'Cargada comenzando desde las rodillas.',
        videoUrl: getSearchUrl('Hang clean'),
        imageUrl: getEmojiImage('🏋️', '#fef08a'),
        isGlobal: true
    },
    {
        name: 'Hang Snatch',
        muscleGroup: 'Potencia',
        description: 'Arrancada desde suspensión.',
        videoUrl: getSearchUrl('Hang snatch'),
        imageUrl: getEmojiImage('🏋️', '#fef08a'),
        isGlobal: true
    },
    {
        name: 'Muscle Snatch',
        muscleGroup: 'Potencia',
        description: 'Arrancada sin meterse debajo de la barra.',
        videoUrl: getSearchUrl('Muscle snatch'),
        imageUrl: getEmojiImage('🏋️', '#fef08a'),
        isGlobal: true
    },

    // ♿ REHABILITACIÓN (9 nuevos) - Color: #e5e7eb
    {
        name: 'Separación con Banda (Band Pull Apart)',
        muscleGroup: 'Rehabilitación',
        description: 'Salud de hombros y postura.',
        videoUrl: getSearchUrl('Band pull apart'),
        imageUrl: getEmojiImage('🎗️', '#e5e7eb'),
        isGlobal: true
    },
    {
        name: 'Deslizamientos en Pared (Wall Slides)',
        muscleGroup: 'Rehabilitación',
        description: 'Movilidad escapular y torácica.',
        videoUrl: getSearchUrl('Wall slides'),
        imageUrl: getEmojiImage('🧱', '#e5e7eb'),
        isGlobal: true
    },
    {
        name: 'Elevaciones YTW',
        muscleGroup: 'Rehabilitación',
        description: 'Fortalecimiento de trapecio inferior y medio.',
        videoUrl: getSearchUrl('YTW exercise'),
        imageUrl: getEmojiImage('🙆', '#e5e7eb'),
        isGlobal: true
    },
    {
        name: 'Rotación Interna con Banda',
        muscleGroup: 'Rehabilitación',
        description: 'Manguito rotador.',
        videoUrl: getSearchUrl('Internal rotation shoulder'),
        imageUrl: getEmojiImage('🔄', '#e5e7eb'),
        isGlobal: true
    },
    {
        name: 'Rotación Externa con Banda',
        muscleGroup: 'Rehabilitación',
        description: 'Manguito rotador (esencial).',
        videoUrl: getSearchUrl('External rotation shoulder'),
        imageUrl: getEmojiImage('🔄', '#e5e7eb'),
        isGlobal: true
    },
    {
        name: 'Flexiones Escapulares',
        muscleGroup: 'Rehabilitación',
        description: 'Activación del serrato anterior.',
        videoUrl: getSearchUrl('Scapular push ups'),
        imageUrl: getEmojiImage('🐢', '#e5e7eb'),
        isGlobal: true
    },
    {
        name: 'Colgado Pasivo (Dead Hang)',
        muscleGroup: 'Rehabilitación',
        description: 'Descompresión espinal y salud de hombros.',
        videoUrl: getSearchUrl('Dead hang'),
        imageUrl: getEmojiImage('🐒', '#e5e7eb'),
        isGlobal: true
    },
    {
        name: 'Estiramiento de Isquiotibiales',
        muscleGroup: 'Rehabilitación',
        description: 'Flexibilidad básica posterior.',
        videoUrl: getSearchUrl('Hamstring stretch'),
        imageUrl: getEmojiImage('🧘', '#e5e7eb'),
        isGlobal: true
    },
    {
        name: 'Movilidad de Cadera 90/90',
        muscleGroup: 'Rehabilitación',
        description: 'Rotación interna y externa de cadera.',
        videoUrl: getSearchUrl('90 90 hip stretch'),
        imageUrl: getEmojiImage('🧘', '#e5e7eb'),
        isGlobal: true
    },

    // 🌍 FULL BODY (12 nuevos) - Color: #f3f4f6
    {
        name: 'Thruster',
        muscleGroup: 'Full Body',
        description: 'Sentadilla + Press Militar en un movimiento.',
        videoUrl: getSearchUrl('Thruster exercise'),
        imageUrl: getEmojiImage('🏋️', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Man Maker',
        muscleGroup: 'Full Body',
        description: 'Combo brutal: Remo + Flexión + Clean + Thruster.',
        videoUrl: getSearchUrl('Man maker exercise'),
        imageUrl: getEmojiImage('😈', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Levantamiento Turco (Turkish Get-up)',
        muscleGroup: 'Full Body',
        description: 'Fuerza, estabilidad y movilidad total.',
        videoUrl: getSearchUrl('Turkish get up'),
        imageUrl: getEmojiImage('🇹🇷', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Cargada del Granjero (Farmer Carry)',
        muscleGroup: 'Full Body',
        description: 'Transporte pesado para fuerza funcional.',
        videoUrl: getSearchUrl('Farmers carry'),
        imageUrl: getEmojiImage('🚶', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Empuje de Trineo (Sled Push)',
        muscleGroup: 'Full Body',
        description: 'Acondicionamiento y fuerza de piernas.',
        videoUrl: getSearchUrl('Sled push'),
        imageUrl: getEmojiImage('🛒', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Jalón de Trineo (Sled Pull)',
        muscleGroup: 'Full Body',
        description: 'Cadena posterior y agarre.',
        videoUrl: getSearchUrl('Sled pull'),
        imageUrl: getEmojiImage('🛒', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Gateo de Oso (Bear Crawl)',
        muscleGroup: 'Full Body',
        description: 'Coordinación y core dinámico.',
        videoUrl: getSearchUrl('Bear crawl'),
        imageUrl: getEmojiImage('🐻', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Carga de Saco (Sandbag Carry)',
        muscleGroup: 'Full Body',
        description: 'Fuerza con objeto irregular.',
        videoUrl: getSearchUrl('Sandbag carry'),
        imageUrl: getEmojiImage('🎒', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Burpee con Dominada',
        muscleGroup: 'Full Body',
        description: 'Calistenia completa.',
        videoUrl: getSearchUrl('Burpee pull up'),
        imageUrl: getEmojiImage('🤸', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Devil Press',
        muscleGroup: 'Full Body',
        description: 'Burpee con mancuernas + Snatch.',
        videoUrl: getSearchUrl('Devil press'),
        imageUrl: getEmojiImage('😈', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Complejo con Barra (Bear Complex)',
        muscleGroup: 'Full Body',
        description: 'Serie continua de movimientos compuestos.',
        videoUrl: getSearchUrl('Bear complex'),
        imageUrl: getEmojiImage('🐻', '#f3f4f6'),
        isGlobal: true
    },
    {
        name: 'Wall Balls',
        muscleGroup: 'Full Body',
        description: 'Sentadilla + lanzamiento de balón.',
        videoUrl: getSearchUrl('Wall balls'),
        imageUrl: getEmojiImage('🏐', '#f3f4f6'),
        isGlobal: true
    }
];
