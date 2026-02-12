import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    RefreshControl,
    Dimensions
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { theme } from '../../config/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../types/navigation';
import { clientService } from '../../services/ClientService';
import { routineService } from '../../services/RoutineService';
import { exerciseService } from '../../services/ExerciseService';
import { Routine } from '../../types/Routine';

// Interface for Dashboard Routine with progress
interface RoutineProgress extends Routine {
    progress: number;
    daysRemaining: number;
    clientName?: string;
}

export default function DashboardScreen() {
    const { user, coach, logout } = useAuth();
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

    // State
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        clientCount: 0,
        newClientsThisMonth: 0,
        activeRoutinesCount: 0,
        newRoutinesThisMonth: 0,
        exerciseCount: 0
    });
    const [activeRoutines, setActiveRoutines] = useState<RoutineProgress[]>([]);

    const loadDashboardData = async () => {
        if (!user?.uid) return;

        try {
            // 1. Fetch Clients
            const clients = await clientService.getClients(user.uid);

            // Calculate new clients this month
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const newClients = clients.filter(c => {
                const createdAt = c.createdAt;
                if (!createdAt) return false;
                return createdAt >= startOfMonth;
            }).length;

            // 2. Fetch Exercises
            const globalExercises = await exerciseService.getGlobalExercises();
            const coachExercises = await exerciseService.getCoachExercises(user.uid);
            const totalExercises = globalExercises.length + coachExercises.length;

            // 3. Fetch Routines
            const allRoutines = await routineService.getAllRoutines(user.uid);

            // Create client map for names
            const clientMap = new Map(clients.map(c => [c.id, c.name]));

            const active: RoutineProgress[] = [];
            let newRoutinesCount = 0;

            for (const routine of allRoutines) {
                // Determine dates
                const startDate = routine.startDate || routine.createdAt || new Date();
                const durationWeeks = routine.durationWeeks || 4;
                const endDate = routine.endDate || new Date(startDate.getTime() + (durationWeeks * 7 * 24 * 60 * 60 * 1000));
                const createdAt = routine.createdAt || new Date(0);

                // New routines stats
                if (createdAt >= startOfMonth) {
                    newRoutinesCount++;
                }

                // Check if active
                if (endDate >= now) {
                    const totalDuration = endDate.getTime() - startDate.getTime();
                    const elapsed = now.getTime() - startDate.getTime();
                    let progress = 0;

                    if (totalDuration > 0) {
                        progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
                    }

                    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                    active.push({
                        ...routine,
                        progress,
                        daysRemaining,
                        clientName: clientMap.get(routine.clientId) || 'Cliente'
                    });
                }
            }

            // Sort by urgent days remaining
            active.sort((a, b) => a.daysRemaining - b.daysRemaining);

            setStats({
                clientCount: clients.length,
                newClientsThisMonth: newClients,
                activeRoutinesCount: active.length,
                newRoutinesThisMonth: newRoutinesCount,
                exerciseCount: totalExercises
            });
            setActiveRoutines(active);

        } catch (error) {
            console.error('Error loading dashboard:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadDashboardData();
        }, [user])
    );

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadDashboardData();
    }, []);

    const navigateTo = (screen: any) => {
        navigation.navigate(screen);
    };

    const isAdmin = coach?.role === 'admin';
    const hasGym = !!coach?.gymId;

    return (
        <ScrollView
            style={styles.container}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
            }
        >
            {/* Hero Header */}
            <LinearGradient
                colors={[theme.colors.primary, '#1565c0']}
                style={styles.heroHeader}
            >
                <View style={styles.heroContent}>
                    <View>
                        <View style={styles.welcomeBadge}>
                            <Text style={styles.welcomeBadgeText}>PANEL DE CONTROL</Text>
                        </View>
                        <Text style={styles.heroTitle}>Hola, {coach?.name?.split(' ')[0] || 'Coach'} 👋</Text>
                        <Text style={styles.heroSubtitle}>
                            {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </Text>
                    </View>
                    {/* Logout Button removed from here, usually in Profile or Settings */}
                </View>

                {/* Decorative Circles */}
                <View style={[styles.circle, styles.circle1]} />
                <View style={[styles.circle, styles.circle2]} />
            </LinearGradient>

            <View style={styles.contentContainer}>
                {/* Stats Grid */}
                <View style={styles.statsGrid}>
                    {/* Clients Stat */}
                    <View style={styles.statCard}>
                        <LinearGradient
                            colors={['#42a5f5', '#1976d2']}
                            style={styles.statIconContainer}
                        >
                            <Ionicons name="people" size={24} color="white" />
                        </LinearGradient>
                        <View style={styles.statInfo}>
                            <Text style={styles.statValue}>{stats.clientCount}</Text>
                            <Text style={styles.statLabel}>Clientes</Text>
                            <Text style={styles.statTrend}>+{stats.newClientsThisMonth} este mes</Text>
                        </View>
                    </View>

                    {/* Routines Stat */}
                    <View style={styles.statCard}>
                        <LinearGradient
                            colors={['#66bb6a', '#388e3c']}
                            style={styles.statIconContainer}
                        >
                            <Ionicons name="clipboard" size={24} color="white" />
                        </LinearGradient>
                        <View style={styles.statInfo}>
                            <Text style={styles.statValue}>{stats.activeRoutinesCount}</Text>
                            <Text style={styles.statLabel}>Rutinas Activas</Text>
                            <Text style={styles.statTrend}>+{stats.newRoutinesThisMonth} este mes</Text>
                        </View>
                    </View>

                    {/* Exercises Stat */}
                    <View style={styles.statCard}>
                        <LinearGradient
                            colors={['#ab47bc', '#7b1fa2']}
                            style={styles.statIconContainer}
                        >
                            <Ionicons name="fitness" size={24} color="white" />
                        </LinearGradient>
                        <View style={styles.statInfo}>
                            <Text style={styles.statValue}>{stats.exerciseCount}</Text>
                            <Text style={styles.statLabel}>Ejercicios</Text>
                            <Text style={styles.statTrend}>Biblioteca</Text>
                        </View>
                    </View>
                </View>

                {/* Gym Banner */}
                {hasGym && (
                    <View style={styles.gymBanner}>
                        <View style={styles.gymContent}>
                            <Ionicons name="business" size={24} color={theme.colors.primary} />
                            <View style={styles.gymText}>
                                <Text style={styles.gymTitle}>Modo Gimnasio Activo</Text>
                                <Text style={styles.gymSubtitle}>Gestionando {coach?.gymId ? 'tu gimnasio' : 'gimnasio'}</Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Active Routines Section */}
                {activeRoutines.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Rutinas Activas</Text>
                            <Text style={styles.sectionSubtitle}>Progreso de clientes</Text>
                        </View>

                        {activeRoutines.map((routine, index) => (
                            <TouchableOpacity
                                key={routine.id}
                                style={styles.routineCard}
                                onPress={() => navigation.navigate('RoutineDetail', { routineId: routine.id })}
                            >
                                <View style={styles.routineHeader}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.routineClientName}>{routine.clientName}</Text>
                                        <Text style={styles.routineName}>{routine.name}</Text>
                                    </View>
                                    <View style={[
                                        styles.daysBadge,
                                        routine.daysRemaining <= 7 && styles.daysBadgeUrgent
                                    ]}>
                                        <Text style={[
                                            styles.daysText,
                                            routine.daysRemaining <= 7 && styles.daysTextUrgent
                                        ]}>
                                            {routine.daysRemaining} días
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.progressContainer}>
                                    <View style={styles.progressBarBg}>
                                        <LinearGradient
                                            colors={[theme.colors.primary, '#64b5f6']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={[
                                                styles.progressBarFill,
                                                { width: `${routine.progress}%` }
                                            ]}
                                        />
                                    </View>
                                    <Text style={styles.progressText}>{Math.round(routine.progress)}% completado</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Quick Actions */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
                    <View style={styles.actionsGrid}>
                        <TouchableOpacity style={styles.actionCard} onPress={() => navigateTo('ClientsTab')}>
                            <View style={[styles.actionIcon, { backgroundColor: '#e3f2fd' }]}>
                                <Ionicons name="people" size={24} color="#1976d2" />
                            </View>
                            <Text style={styles.actionTitle}>Clientes</Text>
                            <Ionicons name="arrow-forward" size={16} color={theme.colors.textSecondary} />
                        </TouchableOpacity>

                        {/* Note: CreateRoutine is nested in RoutinesTab. 
                            If plain navigation fails, we might need a composite type or specific stack navigation 
                        */}
                        <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('RoutinesTab', { screen: 'CreateRoutine' })}>
                            <View style={[styles.actionIcon, { backgroundColor: '#f3e5f5' }]}>
                                <Ionicons name="add-circle" size={24} color="#7b1fa2" />
                            </View>
                            <Text style={styles.actionTitle}>Crear Rutina</Text>
                            <Ionicons name="arrow-forward" size={16} color={theme.colors.textSecondary} />
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.actionCard} onPress={() => navigateTo('ExercisesTab')}>
                            <View style={[styles.actionIcon, { backgroundColor: '#e8f5e9' }]}>
                                <Ionicons name="fitness" size={24} color="#388e3c" />
                            </View>
                            <Text style={styles.actionTitle}>Ejercicios</Text>
                            <Ionicons name="arrow-forward" size={16} color={theme.colors.textSecondary} />
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.actionCard} onPress={() => navigateTo('Profile')}>
                            <View style={[styles.actionIcon, { backgroundColor: '#ffebee' }]}>
                                <Ionicons name="person" size={24} color="#d32f2f" />
                            </View>
                            <Text style={styles.actionTitle}>Perfil</Text>
                            <Ionicons name="arrow-forward" size={16} color={theme.colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f7fa',
    },
    heroHeader: {
        paddingTop: 60,
        paddingBottom: 40,
        paddingHorizontal: theme.spacing.lg,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        overflow: 'hidden',
        marginBottom: 20,
    },
    heroContent: {
        position: 'relative',
        zIndex: 10,
    },
    welcomeBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        alignSelf: 'flex-start',
        marginBottom: 10,
    },
    welcomeBadgeText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 10,
    },
    heroTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 5,
    },
    heroSubtitle: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 14,
        textTransform: 'capitalize',
    },
    circle: {
        position: 'absolute',
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.1)',
        zIndex: 1,
    },
    circle1: {
        width: 200,
        height: 200,
        top: -50,
        right: -50,
    },
    circle2: {
        width: 150,
        height: 150,
        bottom: -30,
        left: -30,
    },
    contentContainer: {
        paddingHorizontal: theme.spacing.lg,
        marginTop: -30, // Pull up to overlap header
        paddingBottom: 40,
        zIndex: 20,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 25,
    },
    statCard: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 12,
        width: '31%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
        alignItems: 'center',
    },
    statIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    statInfo: {
        alignItems: 'center',
    },
    statValue: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    statLabel: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginBottom: 2,
    },
    statTrend: {
        fontSize: 9,
        color: '#4caf50',
        fontWeight: '600',
    },
    gymBanner: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 15,
        marginBottom: 25,
        flexDirection: 'row',
        alignItems: 'center',
        borderLeftWidth: 4,
        borderLeftColor: theme.colors.primary,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    gymContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    gymText: {
        marginLeft: 15,
    },
    gymTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    gymSubtitle: {
        fontSize: 12,
        color: theme.colors.textSecondary,
    },
    section: {
        marginBottom: 25,
    },
    sectionHeader: {
        marginBottom: 15,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    sectionSubtitle: {
        fontSize: 13,
        color: theme.colors.textSecondary,
    },
    routineCard: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#f0f0f0',
    },
    routineHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    routineClientName: {
        fontSize: 14,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 2,
    },
    routineName: {
        fontSize: 12,
        color: theme.colors.textSecondary,
    },
    daysBadge: {
        backgroundColor: '#f5f5f5',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    daysBadgeUrgent: {
        backgroundColor: '#ffebee',
    },
    daysText: {
        fontSize: 10,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    daysTextUrgent: {
        color: '#c62828',
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    progressBarBg: {
        flex: 1,
        height: 6,
        backgroundColor: '#eee',
        borderRadius: 3,
        overflow: 'hidden',
        marginRight: 10,
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 3,
    },
    progressText: {
        fontSize: 10,
        color: theme.colors.textSecondary,
        width: 80,
        textAlign: 'right',
    },
    actionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 12,
    },
    actionCard: {
        width: '48%',
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
        marginBottom: 12,
    },
    actionIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    actionTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 4,
    },
});
