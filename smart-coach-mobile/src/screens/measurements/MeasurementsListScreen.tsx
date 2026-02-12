import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../config/theme';
import { useAuth } from '../../contexts/AuthContext';
import { measurementService } from '../../services/MeasurementService';
import { Measurement } from '../../types/Measurement';

export default function MeasurementsListScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { clientId } = route.params;
    const { user } = useAuth();

    const [measurements, setMeasurements] = useState<Measurement[]>([]);
    const [loading, setLoading] = useState(true);

    const loadMeasurements = useCallback(async () => {
        if (!user?.uid || !clientId) return;
        setLoading(true);
        try {
            const data = await measurementService.getClientMeasurements(user.uid, clientId);
            setMeasurements(data);
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo cargar el historial de mediciones');
        } finally {
            setLoading(false);
        }
    }, [user, clientId]);

    useFocusEffect(
        useCallback(() => {
            loadMeasurements();
        }, [loadMeasurements])
    );

    const handleDelete = (measurementId: string) => {
        Alert.alert(
            'Eliminar Medición',
            '¿Estás seguro?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        if (!user?.uid) return;
                        try {
                            await measurementService.deleteMeasurement(user.uid, clientId, measurementId);
                            loadMeasurements();
                        } catch (error) {
                            Alert.alert('Error', 'No se pudo eliminar');
                        }
                    }
                }
            ]
        );
    };

    const renderItem = ({ item }: { item: Measurement }) => (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Text style={styles.date}>{item.date.toLocaleDateString()}</Text>
                <TouchableOpacity onPress={() => handleDelete(item.id)}>
                    <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                </TouchableOpacity>
            </View>

            <View style={styles.statsRow}>
                <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Peso</Text>
                    <Text style={styles.statValue}>{item.weight} kg</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.statLabel}>IMC</Text>
                    <Text style={styles.statValue}>{item.bmi.toFixed(1)}</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.statLabel}>% Grasa</Text>
                    <Text style={styles.statValue}>
                        {item.bodyFatPercentage ? `${item.bodyFatPercentage}%` : '-'}
                    </Text>
                </View>
            </View>

            {(item.waist || item.hips) && (
                <View style={styles.extraStats}>
                    {item.waist && <Text style={styles.extraText}>Cintura: {item.waist} cm</Text>}
                    {item.hips && <Text style={styles.extraText}>Cadera: {item.hips} cm</Text>}
                </View>
            )}
        </View>
    );

    if (loading && measurements.length === 0) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={measurements}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No hay mediciones registradas</Text>
                    </View>
                }
            />

            <TouchableOpacity
                style={styles.fab}
                onPress={() => navigation.navigate('AddMeasurement', { clientId })}
            >
                <Ionicons name="add" size={30} color="white" />
            </TouchableOpacity>
        </View>
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
    listContent: {
        padding: theme.spacing.lg,
    },
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.md,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.background,
        paddingBottom: theme.spacing.xs,
    },
    date: {
        fontSize: theme.fontSize.md,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statLabel: {
        fontSize: theme.fontSize.xs,
        color: theme.colors.textSecondary,
        marginBottom: 2,
    },
    statValue: {
        fontSize: theme.fontSize.lg,
        fontWeight: 'bold',
        color: theme.colors.primary,
    },
    extraStats: {
        marginTop: theme.spacing.md,
        flexDirection: 'row',
        gap: theme.spacing.lg,
    },
    extraText: {
        fontSize: theme.fontSize.sm,
        color: theme.colors.textSecondary,
    },
    emptyContainer: {
        padding: theme.spacing.xl,
        alignItems: 'center',
    },
    emptyText: {
        color: theme.colors.textSecondary,
        fontSize: theme.fontSize.md,
    },
    fab: {
        position: 'absolute',
        right: theme.spacing.lg,
        bottom: theme.spacing.lg,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: theme.colors.secondary,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        elevation: 8,
    },
});
