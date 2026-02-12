import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ExercisesListScreen from './ExercisesListScreen';
import ExerciseDetailScreen from './ExerciseDetailScreen';
import CreateExerciseScreen from './CreateExerciseScreen';
import { theme } from '../../config/theme';

const Stack = createNativeStackNavigator();

export default function ExercisesStack() {
    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: true,
                headerStyle: {
                    backgroundColor: theme.colors.surface,
                },
                headerTintColor: theme.colors.primary,
                headerTitleStyle: {
                    fontWeight: 'bold',
                },
                headerShadowVisible: false,
            }}
        >
            <Stack.Screen
                name="ExercisesList"
                component={ExercisesListScreen}
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="ExerciseDetail"
                component={ExerciseDetailScreen}
                options={{ title: 'Detalle del Ejercicio' }}
            />
            <Stack.Screen
                name="CreateExercise"
                component={CreateExerciseScreen}
                options={{ title: 'Nuevo Ejercicio' }}
            />
        </Stack.Navigator>
    );
}
