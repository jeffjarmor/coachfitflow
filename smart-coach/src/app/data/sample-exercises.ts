// Sample exercises data to populate the global exercise library
// Run this script once to add exercises to Firestore

export const SAMPLE_EXERCISES = [
    // PECHO
    {
        name: "Press de Banca con Barra",
        description: "Ejercicio compuesto clásico para pecho. Acuéstate en la banca, baja la barra al pecho y empuja hacia arriba.",
        muscleGroup: "Pecho",
        videoUrl: "https://www.youtube.com/watch?v=rT7DgCr-3pg",
        imageUrl: "https://placehold.co/400x300/3b82f6/white?text=Press+Banca"
    },
    {
        name: "Press Inclinado con Mancuernas",
        description: "Enfoque en pecho superior. Ajusta la banca a 30-45 grados, presiona las mancuernas sobre la cabeza.",
        muscleGroup: "Pecho",
        videoUrl: "https://www.youtube.com/watch?v=8iPEnn-ltC8",
        imageUrl: "https://placehold.co/400x300/3b82f6/white?text=Press+Inclinado"
    },
    {
        name: "Aperturas con Cable",
        description: "Ejercicio de aislamiento para pecho. Mantén una ligera flexión en los codos, junta las manijas.",
        muscleGroup: "Pecho",
        videoUrl: "https://www.youtube.com/watch?v=Iwe6AmxVf7o",
        imageUrl: "https://placehold.co/400x300/3b82f6/white?text=Aperturas"
    },
    {
        name: "Flexiones",
        description: "Ejercicio de pecho con peso corporal. Mantén el core firme, baja el pecho al suelo y empuja.",
        muscleGroup: "Pecho",
        videoUrl: "https://www.youtube.com/watch?v=IODxDxX7oi4",
        imageUrl: "https://placehold.co/400x300/3b82f6/white?text=Flexiones"
    },

    // ESPALDA
    {
        name: "Peso Muerto",
        description: "El rey de los ejercicios de espalda. Bisagra de cadera, agarra la barra, empuja con los talones, párate derecho.",
        muscleGroup: "Espalda",
        videoUrl: "https://www.youtube.com/watch?v=op9kVnSso6Q",
        imageUrl: "https://placehold.co/400x300/10b981/white?text=Peso+Muerto"
    },
    {
        name: "Dominadas",
        description: "Constructor de espalda con peso corporal. Cuélgate de la barra, sube la barbilla sobre la barra, baja con control.",
        muscleGroup: "Espalda",
        videoUrl: "https://www.youtube.com/watch?v=eGo4IYlbE5g",
        imageUrl: "https://placehold.co/400x300/10b981/white?text=Dominadas"
    },
    {
        name: "Remo con Barra",
        description: "Ejercicio compuesto de espalda. Inclínate desde las caderas, tira la barra hacia la parte baja del pecho, aprieta los omóplatos.",
        muscleGroup: "Espalda",
        videoUrl: "https://www.youtube.com/watch?v=FWJR5Ve8bnQ",
        imageUrl: "https://placehold.co/400x300/10b981/white?text=Remo+Barra"
    },
    {
        name: "Jalón al Pecho",
        description: "Aislamiento de dorsales. Tira la barra hacia la parte superior del pecho, controla la negativa, estira completo arriba.",
        muscleGroup: "Espalda",
        videoUrl: "https://www.youtube.com/watch?v=CAwf7n6Luuc",
        imageUrl: "https://placehold.co/400x300/10b981/white?text=Jalon+Pecho"
    },

    // PIERNAS
    {
        name: "Sentadilla con Barra",
        description: "El rey de los ejercicios de pierna. Barra en la espalda alta, baja profundo, empuja con los talones.",
        muscleGroup: "Piernas",
        videoUrl: "https://www.youtube.com/watch?v=ultWZbUMPL8",
        imageUrl: "https://placehold.co/400x300/f59e0b/white?text=Sentadilla"
    },
    {
        name: "Peso Muerto Rumano",
        description: "Enfoque en isquiotibiales. Bisagra de cadera, baja la barra pegada a las espinillas, siente el estiramiento.",
        muscleGroup: "Piernas",
        videoUrl: "https://www.youtube.com/watch?v=2SHsk9AzdjA",
        imageUrl: "https://placehold.co/400x300/f59e0b/white?text=PMR"
    },
    {
        name: "Prensa de Piernas",
        description: "Constructor de cuádriceps. Pies al ancho de hombros, baja la plataforma, empuja con los talones.",
        muscleGroup: "Piernas",
        videoUrl: "https://www.youtube.com/watch?v=IZxyjW7MPJQ",
        imageUrl: "https://placehold.co/400x300/f59e0b/white?text=Prensa"
    },
    {
        name: "Zancadas Caminando",
        description: "Ejercicio unilateral de pierna. Da un paso adelante, baja la rodilla trasera, empuja con el talón delantero.",
        muscleGroup: "Piernas",
        videoUrl: "https://www.youtube.com/watch?v=L8fvypPrzzs",
        imageUrl: "https://placehold.co/400x300/f59e0b/white?text=Zancadas"
    },

    // HOMBROS
    {
        name: "Press Militar",
        description: "Ejercicio compuesto de hombros. Presiona la barra sobre la cabeza, bloquea los brazos, baja con control.",
        muscleGroup: "Hombros",
        videoUrl: "https://www.youtube.com/watch?v=2yjwXTZQDDI",
        imageUrl: "https://placehold.co/400x300/ef4444/white?text=Press+Militar"
    },
    {
        name: "Elevaciones Laterales",
        description: "Aislamiento de deltoides lateral. Levanta mancuernas a los lados, ligera flexión en codos, controla el descenso.",
        muscleGroup: "Hombros",
        videoUrl: "https://www.youtube.com/watch?v=3VcKaXpzqRo",
        imageUrl: "https://placehold.co/400x300/ef4444/white?text=Elevaciones"
    },
    {
        name: "Face Pulls",
        description: "Deltoides posterior y espalda alta. Tira la cuerda hacia la cara, rota externamente, aprieta omóplatos.",
        muscleGroup: "Hombros",
        videoUrl: "https://www.youtube.com/watch?v=rep-qVOkqgk",
        imageUrl: "https://placehold.co/400x300/ef4444/white?text=Face+Pulls"
    },

    // BÍCEPS
    {
        name: "Curl con Barra",
        description: "Constructor clásico de bíceps. Sube la barra a los hombros, aprieta bíceps, baja con control.",
        muscleGroup: "Bíceps",
        videoUrl: "https://www.youtube.com/watch?v=kwG2ipFRgfo",
        imageUrl: "https://placehold.co/400x300/8b5cf6/white?text=Curl+Barra"
    },
    {
        name: "Curl Martillo",
        description: "Enfoque en braquial. Agarre neutro, sube mancuernas, mantén codos estables.",
        muscleGroup: "Bíceps",
        videoUrl: "https://www.youtube.com/watch?v=zC3nLlEvin4",
        imageUrl: "https://placehold.co/400x300/8b5cf6/white?text=Curl+Martillo"
    },

    // TRÍCEPS
    {
        name: "Press de Banca Agarre Cerrado",
        description: "Ejercicio compuesto de tríceps. Agarre estrecho, baja al pecho, empuja hacia arriba.",
        muscleGroup: "Tríceps",
        videoUrl: "https://www.youtube.com/watch?v=nEF0bv2FW94",
        imageUrl: "https://placehold.co/400x300/ec4899/white?text=Press+Cerrado"
    },
    {
        name: "Fondos de Tríceps",
        description: "Constructor de tríceps con peso corporal. Baja el cuerpo, codos hacia atrás, empuja hasta bloquear.",
        muscleGroup: "Tríceps",
        videoUrl: "https://www.youtube.com/watch?v=6kALZikXxLc",
        imageUrl: "https://placehold.co/400x300/ec4899/white?text=Fondos"
    },
    {
        name: "Extensión de Tríceps sobre Cabeza",
        description: "Enfoque en cabeza larga. Mancuerna sobre la cabeza, baja detrás de la nuca, extiende brazos.",
        muscleGroup: "Tríceps",
        videoUrl: "https://www.youtube.com/watch?v=YbX7Wd8jQ-Q",
        imageUrl: "https://placehold.co/400x300/ec4899/white?text=Ext+Triceps"
    },

    // ABDOMINALES
    {
        name: "Elevación de Piernas Colgado",
        description: "Enfoque en abdomen bajo. Cuélgate de la barra, sube piernas a 90 grados, baja con control.",
        muscleGroup: "Abdominales",
        videoUrl: "https://www.youtube.com/watch?v=Pr1ieGZ5atk",
        imageUrl: "https://placehold.co/400x300/06b6d4/white?text=Elev+Piernas"
    },
    {
        name: "Plancha",
        description: "Estabilidad del core. Antebrazos en el suelo, cuerpo recto, mantén la posición.",
        muscleGroup: "Core",
        videoUrl: "https://www.youtube.com/watch?v=ASdvN_XEl_c",
        imageUrl: "https://placehold.co/400x300/06b6d4/white?text=Plancha"
    },

    // CARDIO
    {
        name: "Correr en Cinta",
        description: "Ejercicio cardiovascular. Ajusta velocidad e inclinación para intensidad.",
        muscleGroup: "Cardio",
        videoUrl: "",
        imageUrl: "https://placehold.co/400x300/64748b/white?text=Cinta"
    },
    {
        name: "Máquina de Remo",
        description: "Cardio de cuerpo completo. Empuja con piernas, tira con brazos, controla el retorno.",
        muscleGroup: "Cardio",
        videoUrl: "https://www.youtube.com/watch?v=zQ82RYIFLN8",
        imageUrl: "https://placehold.co/400x300/64748b/white?text=Remo"
    }
];
