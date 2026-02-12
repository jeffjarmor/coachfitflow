import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ClientsListScreen from './ClientsListScreen';
import AddClientScreen from './AddClientScreen';
import ClientDetailScreen from './ClientDetailScreen';
import EditClientScreen from './EditClientScreen';
import MeasurementsListScreen from '../measurements/MeasurementsListScreen';
import AddMeasurementScreen from '../measurements/AddMeasurementScreen';
import { theme } from '../../config/theme';

const Stack = createNativeStackNavigator();

export default function ClientsStack() {
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
                headerShadowVisible: false, // Cleaner look
            }}
        >
            <Stack.Screen
                name="ClientsList"
                component={ClientsListScreen}
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="AddClient"
                component={AddClientScreen}
                options={{ title: 'Nuevo Cliente' }}
            />
            <Stack.Screen
                name="ClientDetail"
                component={ClientDetailScreen}
                options={{ title: 'Detalles del Cliente' }}
            />
            <Stack.Screen
                name="EditClient"
                component={EditClientScreen}
                options={{ title: 'Editar Cliente' }}
            />
            <Stack.Screen
                name="MeasurementsList"
                component={MeasurementsListScreen}
                options={{ title: 'Historial de Mediciones' }}
            />
            <Stack.Screen
                name="AddMeasurement"
                component={AddMeasurementScreen}
                options={{ title: 'Nueva Medición' }}
            />
        </Stack.Navigator>
    );
}
