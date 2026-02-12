import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../config/theme';

import DashboardScreen from '../screens/dashboard/DashboardScreen';
import ClientsStack from '../screens/clients/ClientsStack';
import RoutinesStack from '../screens/routines/RoutinesStack';
import ExercisesStack from '../screens/exercises/ExercisesStack';
import ProfileScreen from '../screens/profile/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function MainNavigator() {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarActiveTintColor: theme.colors.primary,
                tabBarInactiveTintColor: theme.colors.textSecondary,
                tabBarStyle: {
                    borderTopWidth: 0,
                    backgroundColor: theme.colors.background,
                    elevation: 5,
                    height: 60,
                    paddingBottom: 10,
                },
                tabBarIcon: ({ focused, color, size }) => {
                    let iconName: keyof typeof Ionicons.glyphMap;

                    if (route.name === 'Dashboard') {
                        iconName = focused ? 'home' : 'home-outline';
                    } else if (route.name === 'ClientsTab') {
                        iconName = focused ? 'people' : 'people-outline';
                    } else if (route.name === 'RoutinesTab') {
                        iconName = focused ? 'fitness' : 'fitness-outline';
                    } else if (route.name === 'Profile') {
                        iconName = focused ? 'person' : 'person-outline';
                    } else {
                        iconName = 'help-circle';
                    }

                    return <Ionicons name={iconName} size={size} color={color} />;
                },
            })}
        >
            <Tab.Screen name="Dashboard" component={DashboardScreen} />
            <Tab.Screen
                name="ClientsTab"
                component={ClientsStack}
                options={{ title: 'Clientes' }}
            />
            <Tab.Screen
                name="ExercisesTab"
                component={ExercisesStack}
                options={{ title: 'Ejercicios' }}
            />
            <Tab.Screen
                name="RoutinesTab"
                component={RoutinesStack}
                options={{ title: 'Rutinas' }}
            />
            <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>
    );
}
