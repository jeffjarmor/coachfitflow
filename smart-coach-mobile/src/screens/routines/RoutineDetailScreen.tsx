import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../config/theme';
import { useAuth } from '../../contexts/AuthContext';
import { routineService } from '../../services/RoutineService';
import { clientService } from '../../services/ClientService';
import { pdfService } from '../../services/PdfService';
import { RoutineWithDays } from '../../types/Routine';
import { Client } from '../../types/Client';

export default function RoutineDetailScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { routineId } = route.params;
    const { user } = useAuth();

    const [routine, setRoutine] = useState<RoutineWithDays | null>(null);
    const [client, setClient] = useState<Client | null>(null);
    const [loading, setLoading] = useState(true);
    const [generatingPdf, setGeneratingPdf] = useState(false);

    useEffect(() => {
        loadRoutine();
    }, []);

    const loadRoutine = async () => {
        if (!user?.uid || !routineId) return;
        try {
            const data = await routineService.getRoutineWithDays(user.uid, routineId);
            setRoutine(data);

            // Load client data via subscription (get one-time snapshot)
            if (data?.clientId) {
                const unsubscribe = clientService.subscribeToClients(
                    user.uid,
                    (clients: Client[]) => {
                        const clientData = clients.find(c => c.id === data.clientId);
                        if (clientData) setClient(clientData);
                        unsubscribe(); // Unsubscribe after first load
                    },
                    (error) => console.error('Error loading client:', error)
                );
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo cargar la rutina');
        } finally {
            setLoading(false);
        }
    };

    const handleGeneratePDF = async () => {
        if (!routine || !client || !user) {
            Alert.alert('Error', 'Datos incompletos para generar el PDF');
            return;
        }

        setGeneratingPdf(true);
        try {
            // Create minimal coach object (not using full Coach type to avoid missing fields)
            await pdfService.generateRoutinePDF(routine, client, {
                id: user.uid,
                name: user.displayName || 'Coach',
                email: user.email || '',
                phone: '',
                brandColor: theme.colors.primary,
                logoUrl: user.photoURL || undefined
            });
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo generar el PDF');
        } finally {
            setGeneratingPdf(false);
        }
    };

    if (loading || !routine) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>{routine.name}</Text>
                <Text style={styles.objective}>{routine.objective}</Text>

                {/* PDF Export Button */}
                <TouchableOpacity
                    style={styles.pdfButton}
                    onPress={handleGeneratePDF}
                    disabled={generatingPdf || !client}
                >
                    {generatingPdf ? (
                        <ActivityIndicator size="small" color="white" />
                    ) : (
                        <>
                            <Ionicons name="document-text-outline" size={18} color="white" />
                            <Text style={styles.pdfButtonText}>Generar PDF</Text>
                        </>
                    )}
                </TouchableOpacity>

                <View style={styles.metaContainer}>
                    <View style={styles.metaItem}>
                        <Ionicons name="calendar-outline" size={16} color={theme.colors.textSecondary} />
                        <Text style={styles.metaText}>{routine.durationWeeks} semanas</Text>
                    </View>
                    <View style={styles.metaItem}>
                        <Ionicons name="barbell-outline" size={16} color={theme.colors.textSecondary} />
                        <Text style={styles.metaText}>{routine.trainingDaysCount} días/sem</Text>
                    </View>
                </View>

                {routine.notes && (
                    <View style={styles.notesContainer}>
                        <Text style={styles.notesTitle}>Notas:</Text>
                        <Text style={styles.notesText}>{routine.notes}</Text>
                    </View>
                )}
            </View>

            <View style={styles.daysSection}>
                <Text style={styles.sectionTitle}>Días de Entrenamiento</Text>
                {routine.days.length === 0 ? (
                    <View style={styles.emptyDays}>
                        <Text style={styles.emptyText}>No hay días de entrenamiento configurados.</Text>
                        <Text style={styles.emptySubText}>(La edición de días estará disponible próximamente)</Text>
                    </View>
                ) : (
                    routine.days.map((day) => (
                        <View key={day.id} style={styles.dayCard}>
                            <Text style={styles.dayTitle}>Día {day.dayNumber}: {day.dayName}</Text>
                            <Text style={styles.muscleGroups}>
                                {day.muscleGroups.join(', ')}
                            </Text>
                            <Text style={styles.exerciseCount}>
                                {day.exercises.length} ejercicios
                            </Text>
                        </View>
                    ))
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.textSecondary + '20',
    },
    title: {
        fontSize: theme.fontSize.xxl,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: theme.spacing.xs,
    },
    objective: {
        fontSize: theme.fontSize.md,
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.md,
    },
    metaContainer: {
        flexDirection: 'row',
        gap: theme.spacing.lg,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    metaText: {
        color: theme.colors.textSecondary,
        fontSize: theme.fontSize.sm,
    },
    pdfButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.primary,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: theme.borderRadius.md,
        marginVertical: theme.spacing.md,
        gap: 8,
    },
    pdfButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: theme.fontSize.sm,
    },
    notesContainer: {
        marginTop: theme.spacing.md,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background,
        borderRadius: theme.borderRadius.sm,
    },
    notesTitle: {
        fontWeight: 'bold',
        fontSize: theme.fontSize.sm,
        marginBottom: 2,
    },
    notesText: {
        fontSize: theme.fontSize.sm,
        color: theme.colors.text,
    },
    daysSection: {
        padding: theme.spacing.lg,
    },
    sectionTitle: {
        fontSize: theme.fontSize.lg,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: theme.spacing.md,
    },
    emptyDays: {
        alignItems: 'center',
        padding: theme.spacing.xl,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.md,
    },
    emptyText: {
        color: theme.colors.textSecondary,
        fontSize: theme.fontSize.md,
    },
    emptySubText: {
        color: theme.colors.textTertiary,
        fontSize: theme.fontSize.sm,
        marginTop: theme.spacing.xs,
    },
    dayCard: {
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.md,
        marginBottom: theme.spacing.md,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    dayTitle: {
        fontSize: theme.fontSize.md,
        fontWeight: 'bold',
        color: theme.colors.primary,
    },
    muscleGroups: {
        fontSize: theme.fontSize.sm,
        color: theme.colors.textSecondary,
        marginVertical: 4,
    },
    exerciseCount: {
        fontSize: theme.fontSize.xs,
        color: theme.colors.textTertiary,
        textAlign: 'right',
    },
});
