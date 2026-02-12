import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RoutinesListScreen from './RoutinesListScreen';
import RoutineDetailScreen from './RoutineDetailScreen';
import RoutineWizardScreen from './RoutineWizardScreen';
import { theme } from '../../config/theme';

const Stack = createNativeStackNavigator();

export default function RoutinesStack() {
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
                name="RoutinesList"
                component={RoutinesListScreen}
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="RoutineDetail"
                component={RoutineDetailScreen}
                options={{ title: 'Detalles de la Rutina' }}
            />
            <Stack.Screen
                name="CreateRoutine"
                component={RoutineWizardScreen}
                options={{ title: 'Nueva Rutina', headerShown: false }}
            />
        </Stack.Navigator>
    );
}
