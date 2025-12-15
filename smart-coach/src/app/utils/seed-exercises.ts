import { Exercise } from '../models/exercise.model';

/**
 * Seed data for global exercises
 * This can be imported and used to populate the global exercise library
 */
export const SEED_EXERCISES: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'>[] = [
    // CHEST EXERCISES
    {
        name: 'Barbell Bench Press',
        muscleGroup: 'Chest',
        description: 'Classic compound chest exercise using a barbell',
        videoUrl: 'https://www.youtube.com/watch?v=rT7DgCr-3pg',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Dumbbell Bench Press',
        muscleGroup: 'Chest',
        description: 'Chest press using dumbbells for greater range of motion',
        videoUrl: 'https://www.youtube.com/watch?v=VmB1G1K7v94',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Incline Dumbbell Press',
        muscleGroup: 'Chest',
        description: 'Upper chest focused press on incline bench',
        videoUrl: 'https://www.youtube.com/watch?v=8iPEnn-ltC8',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Cable Chest Fly',
        muscleGroup: 'Chest',
        description: 'Isolation exercise for chest using cables',
        videoUrl: 'https://www.youtube.com/watch?v=Iwe6AmxVf7o',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Push-ups',
        muscleGroup: 'Chest',
        description: 'Bodyweight chest exercise',
        videoUrl: 'https://www.youtube.com/watch?v=IODxDxX7oi4',
        imageUrl: '',
        isGlobal: true
    },

    // BACK EXERCISES
    {
        name: 'Deadlift',
        muscleGroup: 'Back',
        description: 'Compound exercise targeting entire posterior chain',
        videoUrl: 'https://www.youtube.com/watch?v=op9kVnSso6Q',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Pull-ups',
        muscleGroup: 'Back',
        description: 'Bodyweight back exercise',
        videoUrl: 'https://www.youtube.com/watch?v=eGo4IYlbE5g',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Barbell Row',
        muscleGroup: 'Back',
        description: 'Compound rowing movement for back thickness',
        videoUrl: 'https://www.youtube.com/watch?v=FWJR5Ve8bnQ',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Lat Pulldown',
        muscleGroup: 'Back',
        description: 'Machine exercise for lat development',
        videoUrl: 'https://www.youtube.com/watch?v=CAwf7n6Luuc',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Seated Cable Row',
        muscleGroup: 'Back',
        description: 'Cable rowing for mid-back',
        videoUrl: 'https://www.youtube.com/watch?v=GZbfZ033f74',
        imageUrl: '',
        isGlobal: true
    },

    // LEG EXERCISES
    {
        name: 'Barbell Squat',
        muscleGroup: 'Legs',
        description: 'King of leg exercises',
        videoUrl: 'https://www.youtube.com/watch?v=ultWZbUMPL8',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Leg Press',
        muscleGroup: 'Legs',
        description: 'Machine-based leg exercise',
        videoUrl: 'https://www.youtube.com/watch?v=IZxyjW7MPJQ',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Romanian Deadlift',
        muscleGroup: 'Hamstrings',
        description: 'Hamstring and glute focused deadlift variation',
        videoUrl: 'https://www.youtube.com/watch?v=2SHsk9AzdjA',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Leg Curl',
        muscleGroup: 'Hamstrings',
        description: 'Isolation exercise for hamstrings',
        videoUrl: 'https://www.youtube.com/watch?v=ELOCsoDSmrg',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Leg Extension',
        muscleGroup: 'Quadriceps',
        description: 'Isolation exercise for quadriceps',
        videoUrl: 'https://www.youtube.com/watch?v=YyvSfVjQeL0',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Walking Lunges',
        muscleGroup: 'Legs',
        description: 'Dynamic leg exercise',
        videoUrl: 'https://www.youtube.com/watch?v=D7KaRcUTQeE',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Calf Raises',
        muscleGroup: 'Calves',
        description: 'Isolation exercise for calves',
        videoUrl: 'https://www.youtube.com/watch?v=gwLzBJYoWlI',
        imageUrl: '',
        isGlobal: true
    },

    // SHOULDER EXERCISES
    {
        name: 'Overhead Press',
        muscleGroup: 'Shoulders',
        description: 'Compound shoulder press',
        videoUrl: 'https://www.youtube.com/watch?v=2yjwXTZQDDI',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Lateral Raises',
        muscleGroup: 'Shoulders',
        description: 'Isolation for side delts',
        videoUrl: 'https://www.youtube.com/watch?v=3VcKaXpzqRo',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Front Raises',
        muscleGroup: 'Shoulders',
        description: 'Isolation for front delts',
        videoUrl: 'https://www.youtube.com/watch?v=qsl6Johjqc8',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Face Pulls',
        muscleGroup: 'Shoulders',
        description: 'Rear delt and upper back exercise',
        videoUrl: 'https://www.youtube.com/watch?v=rep-qVOkqgk',
        imageUrl: '',
        isGlobal: true
    },

    // ARM EXERCISES
    {
        name: 'Barbell Curl',
        muscleGroup: 'Biceps',
        description: 'Classic bicep exercise',
        videoUrl: 'https://www.youtube.com/watch?v=kwG2ipFRgfo',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Hammer Curls',
        muscleGroup: 'Biceps',
        description: 'Bicep and forearm exercise',
        videoUrl: 'https://www.youtube.com/watch?v=zC3nLlEvin4',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Tricep Dips',
        muscleGroup: 'Triceps',
        description: 'Bodyweight tricep exercise',
        videoUrl: 'https://www.youtube.com/watch?v=6kALZikXxLc',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Tricep Pushdown',
        muscleGroup: 'Triceps',
        description: 'Cable tricep isolation',
        videoUrl: 'https://www.youtube.com/watch?v=2-LAMcpzODU',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Overhead Tricep Extension',
        muscleGroup: 'Triceps',
        description: 'Overhead tricep exercise',
        videoUrl: 'https://www.youtube.com/watch?v=YbX7Wd8jQ-Q',
        imageUrl: '',
        isGlobal: true
    },

    // CORE EXERCISES
    {
        name: 'Plank',
        muscleGroup: 'Core',
        description: 'Isometric core exercise',
        videoUrl: 'https://www.youtube.com/watch?v=ASdvN_XEl_c',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Russian Twists',
        muscleGroup: 'Abs',
        description: 'Rotational core exercise',
        videoUrl: 'https://www.youtube.com/watch?v=wkD8rjkodUI',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Hanging Leg Raises',
        muscleGroup: 'Abs',
        description: 'Advanced ab exercise',
        videoUrl: 'https://www.youtube.com/watch?v=Pr1ieGZ5atk',
        imageUrl: '',
        isGlobal: true
    },
    {
        name: 'Cable Crunches',
        muscleGroup: 'Abs',
        description: 'Weighted ab exercise',
        videoUrl: 'https://www.youtube.com/watch?v=Xyd_fa5zoEU',
        imageUrl: '',
        isGlobal: true
    }
];
