import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../config/theme';
import { useAuth } from '../../contexts/AuthContext';
import { routineService } from '../../services/RoutineService';
import { Routine } from '../../types/Routine';
import { RootStackParamList } from '../../types/navigation';

export default function RoutinesListScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { user } = useAuth();
    const [routines, setRoutines] = useState<Routine[]>([]);
    const [loading, setLoading] = useState(true);

    const loadRoutines = useCallback(async () => {
        if (!user?.uid) return;
        setLoading(true);
        try {
            const data = await routineService.getAllRoutines(user.uid);
            const sortedData = data.sort((a, b) => {
                const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
                const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
                return dateB.getTime() - dateA.getTime();
            });
            setRoutines(sortedData);
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudieron cargar las rutinas');
        } finally {
            setLoading(false);
        }
    }, [user]);

    useFocusEffect(
        useCallback(() => {
            loadRoutines();
        }, [loadRoutines])
    );

    const confirmDelete = (id: string, event?: any) => {
        if (event) event.stopPropagation();

        Alert.alert(
            'Eliminar Rutina',
            '¿Estás seguro de que quieres eliminar esta rutina? Esta acción no se puede deshacer.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        if (!user?.uid) return;
                        try {
                            setLoading(true);
                            await routineService.deleteRoutine(user.uid, id);
                            loadRoutines();
                        } catch (error) {
                            console.error(error);
                            Alert.alert('Error', 'No se pudo eliminar la rutina');
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const formatDate = (date?: Date | string) => {
        if (!date) return '';
        const d = date instanceof Date ? date : new Date(date);
        return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const renderItem = ({ item }: { item: Routine }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('RoutineDetail', { routineId: item.id })}
            activeOpacity={0.9}
        >
            <View style={styles.cardContent}>
                <Text style={styles.routineName}>{item.name}</Text>
                <Text style={styles.objective} numberOfLines={2}>
                    {item.objective || 'Sin objetivo definido'}
                </Text>

                <View style={styles.metaContainer}>
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>{item.trainingDaysCount} Días/Semana</Text>
                    </View>
                    <Text style={styles.dateText}>
                        Actualizado: {formatDate(item.updatedAt || item.createdAt)}
                    </Text>
                </View>
            </View>

            <View style={styles.cardActions}>
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => navigation.navigate('RoutineDetail', { routineId: item.id })}
                >
                    <Text style={styles.actionButtonText}>Ver</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.iconButton}
                    onPress={(e) => confirmDelete(item.id, e)}
                >
                    <Ionicons name="trash-outline" size={20} color="#f44336" />
                </TouchableOpacity>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.primary} />
                    </TouchableOpacity>
                    <View style={styles.headerContent}>
                        <Text style={styles.headerTitle}>Rutinas</Text>
                        <TouchableOpacity
                            style={styles.newRoutineButton}
                            onPress={() => navigation.navigate('CreateRoutine')}
                        >
                            <Text style={styles.newRoutineButtonText}>+ Nueva</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            {/* List */}
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                    <Text style={styles.loadingText}>Cargando rutinas...</Text>
                </View>
            ) : (
                <FlatList
                    data={routines}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>No se encontraron rutinas para este cliente.</Text>
                            <TouchableOpacity
                                style={styles.createFirstButton}
                                onPress={() => navigation.navigate('CreateRoutine')}
                            >
                                <Text style={styles.createFirstButtonText}>Crear Primera Rutina</Text>
                            </TouchableOpacity>
                        </View>
                    }
                />
            )}

            {/* FAB */}
            <TouchableOpacity
                style={styles.fab}
                onPress={() => navigation.navigate('CreateRoutine')}
            >
                <Ionicons name="add" size={30} color="white" />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fafafa', // $neutral-50
    },
    header: {
        backgroundColor: 'white',
        paddingTop: 60, // Increased for safe area
        paddingBottom: 16,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#eeeeee',
        elevation: 2, // Added shadow for header separation
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 1,
        zIndex: 10,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    backButton: {
        marginRight: 12,
        padding: 4, // Hit slop
    },
    headerContent: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#212121',
    },
    newRoutineButton: {
        backgroundColor: '#1976d2',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8, // Slightly more rounded
        elevation: 0, // Flat on header
    },
    newRoutineButtonText: {
        fontSize: 13,
        color: 'white',
        fontWeight: '600',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 10,
        color: '#757575',
    },
    listContent: {
        padding: 16, // Reduced padding to match standard mobile spacing
        paddingBottom: 100,
    },
    card: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12, // Reduced gap
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 }, // Better shadow direction
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 3,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#f0f0f0', // Lighter border
    },
    cardContent: {
        flex: 1,
        marginRight: 12,
    },
    routineName: {
        fontSize: 17, // Larger title
        fontWeight: 'bold',
        color: '#212121',
        marginBottom: 6,
    },
    objective: {
        fontSize: 14,
        color: '#616161', // Darker gray for better readability
        marginBottom: 12,
        lineHeight: 20,
    },
    metaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    badge: {
        backgroundColor: '#e3f2fd',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    badgeText: {
        fontSize: 11,
        color: '#1565c0', // Darker blue text
        fontWeight: '600',
    },
    dateText: {
        fontSize: 11,
        color: '#9e9e9e',
    },
    cardActions: {
        flexDirection: 'column',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 8,
        borderLeftWidth: 1,
        borderLeftColor: '#f5f5f5',
    },
    actionButton: {
        // Removed border, just text
        padding: 4,
    },
    actionButtonText: {
        fontSize: 13,
        color: '#1976d2',
        fontWeight: '600',
    },
    iconButton: {
        padding: 4,
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 40,
    },
    emptyText: {
        fontSize: 16,
        color: '#757575',
        marginBottom: 20,
        textAlign: 'center',
    },
    createFirstButton: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: '#1976d2',
    },
    createFirstButtonText: {
        fontSize: 15,
        color: 'white',
        fontWeight: '600',
    },
    fab: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#1976d2',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
});
