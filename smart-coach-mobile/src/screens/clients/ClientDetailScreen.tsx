import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Dimensions } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../config/theme';
import { useAuth } from '../../contexts/AuthContext';
import { clientService } from '../../services/ClientService';
import { Client } from '../../types/Client';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../../types/navigation';
// We will import RoutinesList component logic here or reuse specialized list
import { routineService } from '../../services/RoutineService';
import { Routine } from '../../types/Routine';

// Tab Component
const Tabs = ({ activeTab, onTabChange }: { activeTab: string, onTabChange: (tab: string) => void }) => (
    <View style={styles.tabsContainer}>
        <TouchableOpacity
            style={[styles.tab, activeTab === 'info' && styles.activeTab]}
            onPress={() => onTabChange('info')}
        >
            <Text style={[styles.tabText, activeTab === 'info' && styles.activeTabText]}>Información</Text>
        </TouchableOpacity>
        <TouchableOpacity
            style={[styles.tab, activeTab === 'routines' && styles.activeTab]}
            onPress={() => onTabChange('routines')}
        >
            <Text style={[styles.tabText, activeTab === 'routines' && styles.activeTabText]}>Rutinas</Text>
        </TouchableOpacity>
        <TouchableOpacity
            style={[styles.tab, activeTab === 'measurements' && styles.activeTab]}
            onPress={() => onTabChange('measurements')}
        >
            <Text style={[styles.tabText, activeTab === 'measurements' && styles.activeTabText]}>Mediciones</Text>
        </TouchableOpacity>
    </View>
);

export default function ClientDetailScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const route = useRoute<any>();
    const { clientId } = route.params;
    const { user } = useAuth();

    const [client, setClient] = useState<Client | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('info');

    // Routines state (fetched when tab is active)
    const [routines, setRoutines] = useState<Routine[]>([]);
    const [loadingRoutines, setLoadingRoutines] = useState(false);

    const fetchClient = async () => {
        if (!user?.uid || !clientId) return;
        try {
            const docRef = doc(db, 'coaches', user.uid, 'clients', clientId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                setClient({
                    id: docSnap.id,
                    ...data,
                    birthDate: data.birthDate?.toDate(),
                    nextPaymentDueDate: data.nextPaymentDueDate?.toDate(),
                    createdAt: data.createdAt?.toDate(),
                    updatedAt: data.updatedAt?.toDate()
                } as Client);
            } else {
                Alert.alert('Error', 'Cliente no encontrado');
                navigation.goBack();
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Error al cargar detalles del cliente');
        } finally {
            setLoading(false);
        }
    };

    const fetchRoutines = async () => {
        if (!user?.uid || !clientId) return;
        setLoadingRoutines(true);
        try {
            const allRoutines = await routineService.getAllRoutines(user.uid);
            const clientRoutines = allRoutines.filter(r => r.clientId === clientId);
            const sortedData = clientRoutines.sort((a, b) => {
                const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
                const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
                return dateB.getTime() - dateA.getTime();
            });
            setRoutines(sortedData);
        } catch (error) {
            console.error(error);
        } finally {
            setLoadingRoutines(false);
        }
    }

    useEffect(() => {
        fetchClient();
        const unsubscribe = navigation.addListener('focus', () => {
            if (!loading) fetchClient();
        });
        return unsubscribe;
    }, [clientId, user]);

    useEffect(() => {
        if (activeTab === 'routines' && client) {
            fetchRoutines();
        }
    }, [activeTab]);

    const handleDelete = () => {
        Alert.alert(
            'Eliminar Cliente',
            '¿Estás seguro de que quieres eliminar a este cliente? Esta acción no se puede deshacer.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            if (user?.uid && client?.id) {
                                await clientService.deleteClient(user.uid, client.id);
                                navigation.goBack();
                            }
                        } catch (error) {
                            Alert.alert('Error', 'No se pudo eliminar el cliente');
                        }
                    }
                }
            ]
        );
    };

    const getAvatarColors = (name: string) => {
        const gradients = [
            ['#667eea', '#764ba2'],
            ['#f093fb', '#f5576c'],
            ['#4facfe', '#00f2fe'],
            ['#43e97b', '#38f9d7'],
            ['#fa709a', '#fee140'],
            ['#30cfd0', '#330867'],
            ['#a8edea', '#fed6e3'],
            ['#ff9a9e', '#fecfef'],
        ];
        const index = name.length % gradients.length;
        return gradients[index] as [string, string, ...string[]];
    };

    const formatDate = (date?: Date | string) => {
        if (!date) return '';
        const d = date instanceof Date ? date : new Date(date);
        return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    if (loading || !client) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    const renderInfoTab = () => (
        <ScrollView style={styles.tabContent}>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Información Personal</Text>
                <View style={styles.card}>
                    <View style={styles.infoRow}>
                        <View style={styles.infoItem}>
                            <Text style={styles.label}>Edad</Text>
                            <Text style={styles.value}>{client.age} años</Text>
                        </View>
                        <View style={styles.separator} />
                        <View style={styles.infoItem}>
                            <Text style={styles.label}>Teléfono</Text>
                            <Text style={styles.value}>{client.phone || '--'}</Text>
                        </View>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.infoRow}>
                        <View style={styles.infoItem}>
                            <Text style={styles.label}>Se unió</Text>
                            <Text style={styles.value}>{formatDate(client.createdAt)}</Text>
                        </View>
                    </View>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Métricas Físicas</Text>
                <View style={styles.card}>
                    <View style={styles.infoRow}>
                        <View style={styles.infoItem}>
                            <Text style={styles.label}>Altura</Text>
                            <Text style={styles.value}>{client.height} cm</Text>
                        </View>
                        <View style={styles.separator} />
                        <View style={styles.infoItem}>
                            <Text style={styles.label}>Peso</Text>
                            <Text style={styles.value}>{client.weight} kg</Text>
                        </View>
                    </View>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Meta Principal</Text>
                <View style={styles.card}>
                    <Text style={styles.goalText}>{client.goal}</Text>
                </View>
            </View>

            {client.notes && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Notas</Text>
                    <View style={styles.card}>
                        <Text style={styles.notesText}>{client.notes}</Text>
                    </View>
                </View>
            )}
            <View style={{ height: 20 }} />
        </ScrollView>
    );

    const renderRoutinesTab = () => (
        <ScrollView style={styles.tabContent}>
            {loadingRoutines ? (
                <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: 20 }} />
            ) : routines.length === 0 ? (
                <View style={styles.emptyTab}>
                    <Text style={styles.emptyTabText}>No hay rutinas asignadas</Text>
                    <TouchableOpacity
                        style={styles.createButtonSmall}
                        onPress={() => navigation.navigate('CreateRoutine')}
                    >
                        <Text style={styles.createButtonSmallText}>Crear Rutina</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                routines.map((routine) => (
                    <TouchableOpacity
                        key={routine.id}
                        style={styles.routineCard}
                        onPress={() => navigation.navigate('RoutineDetail', { routineId: routine.id })}
                    >
                        <View style={styles.routineHeader}>
                            <Text style={styles.routineName}>{routine.name}</Text>
                            <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
                        </View>
                        <Text style={styles.routineObjective} numberOfLines={1}>{routine.objective}</Text>
                        <View style={styles.routineMeta}>
                            <View style={styles.routineBadge}>
                                <Text style={styles.routineBadgeText}>{routine.trainingDaysCount} días/sem</Text>
                            </View>
                            <Text style={styles.routineDate}>{formatDate(routine.updatedAt || routine.createdAt)}</Text>
                        </View>
                    </TouchableOpacity>
                ))
            )}
            <View style={{ height: 20 }} />
        </ScrollView>
    );

    const renderMeasurementsTab = () => (
        <View style={styles.emptyTab}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>📊</Text>
            <Text style={styles.emptyTabText}>Historial de mediciones</Text>
            <Text style={{ color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 20 }}>
                Próximamente podrás ver el progreso de tu cliente aquí.
            </Text>
            <TouchableOpacity
                style={styles.createButtonSmall}
                onPress={() => navigation.navigate('AddMeasurement', { clientId: client.id })}
            >
                <Text style={styles.createButtonSmallText}>Registrar Medición</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.primary} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle} numberOfLines={1}>{client.name}</Text>
                        <Text style={styles.headerSubtitle}>{client.email}</Text>
                    </View>
                    <TouchableOpacity style={styles.iconButton} onPress={handleDelete}>
                        <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.heroSection}>
                <LinearGradient
                    colors={getAvatarColors(client.name)}
                    style={styles.avatarLarge}
                >
                    <Text style={styles.avatarTextLarge}>{client.name.charAt(0).toUpperCase()}</Text>
                </LinearGradient>
            </View>

            <Tabs activeTab={activeTab} onTabChange={setActiveTab} />

            <View style={styles.contentContainer}>
                {activeTab === 'info' && renderInfoTab()}
                {activeTab === 'routines' && renderRoutinesTab()}
                {activeTab === 'measurements' && renderMeasurementsTab()}
            </View>

            {activeTab === 'info' && (
                <TouchableOpacity
                    style={styles.fab}
                    onPress={() => navigation.navigate('EditClient', { clientId: client.id, clientData: client })}
                >
                    <Ionicons name="pencil" size={24} color="white" />
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f7fa',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollContent: {
        paddingBottom: 100,
    },
    header: {
        backgroundColor: 'white',
        paddingTop: 50,
        paddingBottom: 16,
        paddingHorizontal: theme.spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    backButton: {
        marginRight: 16,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    headerSubtitle: {
        fontSize: 12,
        color: theme.colors.textSecondary,
    },
    iconButton: {
        padding: 8,
    },
    heroSection: {
        alignItems: 'center',
        paddingVertical: 24,
        backgroundColor: 'white',
    },
    avatarLarge: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 5,
    },
    avatarTextLarge: {
        color: 'white',
        fontSize: 32,
        fontWeight: 'bold',
    },
    name: {
        fontSize: 24,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginTop: 16,
        textAlign: 'center',
    },
    email: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        marginBottom: 16,
        textAlign: 'center',
    },
    tabsContainer: {
        flexDirection: 'row',
        backgroundColor: 'white',
        paddingHorizontal: theme.spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: theme.colors.primary,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.textSecondary,
    },
    activeTabText: {
        color: theme.colors.primary,
        fontWeight: '700',
    },
    contentContainer: {
        flex: 1,
    },
    tabContent: {
        flex: 1,
        padding: theme.spacing.lg,
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    card: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#eee',
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    infoItem: {
        flex: 1,
        alignItems: 'center',
    },
    label: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginBottom: 4,
    },
    value: {
        fontSize: 16,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    separator: {
        width: 1,
        backgroundColor: theme.colors.border,
        marginHorizontal: 16,
    },
    divider: {
        height: 1,
        backgroundColor: theme.colors.border,
        marginVertical: 16,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    detailText: {
        marginLeft: 8,
        fontSize: 14,
        color: theme.colors.text,
    },
    goalText: {
        fontSize: 14,
        color: theme.colors.text,
        lineHeight: 20,
        fontStyle: 'italic',
    },
    notesText: {
        fontSize: 14,
        color: theme.colors.text,
        lineHeight: 20,
    },
    measurementsButton: {
        flexDirection: 'row',
        backgroundColor: theme.colors.primary,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
    },
    measurementsButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
        marginLeft: 8,
    },
    footer: {
        flexDirection: 'row',
        padding: 16,
        backgroundColor: 'white',
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        gap: 12,
    },
    button: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
    },
    editButton: {
        backgroundColor: theme.colors.secondary,
    },
    deleteButton: {
        backgroundColor: theme.colors.error,
    },
    buttonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 14,
        marginLeft: 8,
    },
    fab: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: theme.colors.secondary,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 6,
    },
    routineCard: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#eee',
    },
    routineHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    routineName: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.text,
    },
    routineObjective: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginBottom: 10,
    },
    routineMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    routineBadge: {
        backgroundColor: '#e3f2fd',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    routineBadgeText: {
        fontSize: 11,
        color: theme.colors.primary,
        fontWeight: '500',
    },
    routineDate: {
        fontSize: 11,
        color: theme.colors.textTertiary,
    },
    emptyTab: {
        alignItems: 'center',
        padding: 40,
    },
    emptyTabText: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        marginBottom: 16,
    },
    createButtonSmall: {
        borderWidth: 1,
        borderColor: theme.colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    createButtonSmallText: {
        color: theme.colors.primary,
        fontWeight: '600',
        fontSize: 14,
    },
});
