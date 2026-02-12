import React, { useState, useEffect } from 'react';
import {
    View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
    Alert, ActivityIndicator, Modal, FlatList
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../config/theme';
import { useAuth } from '../../contexts/AuthContext';
import { routineService } from '../../services/RoutineService';
import { clientService } from '../../services/ClientService';
import { Client } from '../../types/Client';
import { CreateRoutineData } from '../../types/Routine';

export default function CreateRoutineScreen() {
    const navigation = useNavigation();
    const { user } = useAuth();

    const [loading, setLoading] = useState(false);
    const [clients, setClients] = useState<Client[]>([]);

    // Form State
    const [name, setName] = useState('');
    const [objective, setObjective] = useState('');
    const [durationWeeks, setDurationWeeks] = useState('4');
    const [daysCount, setDaysCount] = useState('3');
    const [notes, setNotes] = useState('');

    // Client Selection
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [isClientModalVisible, setClientModalVisible] = useState(false);

    useEffect(() => {
        loadClients();
    }, []);

    const loadClients = () => {
        if (!user?.uid) return;
        // Subscribe to clients for selection list
        // In a real app with many clients, we might want a search or just a one-time fetch
        const unsubscribe = clientService.subscribeToClients(
            user.uid,
            (data) => setClients(data),
            (error) => console.error('Error fetching clients', error)
        );
        return () => unsubscribe();
    };

    const handleSave = async () => {
        if (!user?.uid) return;

        if (!name.trim()) {
            Alert.alert('Error', 'El nombre de la rutina es obligatorio');
            return;
        }
        if (!selectedClient) {
            Alert.alert('Error', 'Debes seleccionar un cliente');
            return;
        }

        const duration = parseInt(durationWeeks);
        const days = parseInt(daysCount);

        if (isNaN(duration) || duration < 1) {
            Alert.alert('Error', 'Duración inválida');
            return;
        }
        if (isNaN(days) || days < 1 || days > 7) {
            Alert.alert('Error', 'Días por semana inválidos (1-7)');
            return;
        }

        setLoading(true);
        try {
            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(startDate.getDate() + (duration * 7));

            const routineData: CreateRoutineData = {
                clientId: selectedClient.id,
                name,
                objective,
                trainingDaysCount: days,
                durationWeeks: duration,
                startDate,
                endDate,
                notes
            };

            // Create routine with 0 days for now (empty shell)
            await routineService.createRoutine(user.uid, routineData, []);

            Alert.alert('Éxito', 'Rutina creada correctamente', [
                { text: 'OK', onPress: () => navigation.goBack() }
            ]);
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo crear la rutina');
        } finally {
            setLoading(false);
        }
    };

    const renderClientItem = ({ item }: { item: Client }) => (
        <TouchableOpacity
            style={styles.clientItem}
            onPress={() => {
                setSelectedClient(item);
                setClientModalVisible(false);
            }}
        >
            <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View>
                <Text style={styles.clientName}>{item.name}</Text>
                <Text style={styles.clientEmail}>{item.email}</Text>
            </View>
            {selectedClient?.id === item.id && (
                <Ionicons name="checkmark" size={24} color={theme.colors.success} style={{ marginLeft: 'auto' }} />
            )}
        </TouchableOpacity>
    );

    return (
        <ScrollView style={styles.container}>
            <View style={styles.formGroup}>
                <Text style={styles.label}>Nombre de la Rutina *</Text>
                <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Ej. Hipertrofia Fase 1"
                />
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Cliente *</Text>
                <TouchableOpacity
                    style={styles.selector}
                    onPress={() => setClientModalVisible(true)}
                >
                    <Text style={[styles.selectorText, !selectedClient && styles.placeholderText]}>
                        {selectedClient ? selectedClient.name : 'Seleccionar Cliente'}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Objetivo</Text>
                <TextInput
                    style={styles.input}
                    value={objective}
                    onChangeText={setObjective}
                    placeholder="Ej. Ganar masa muscular"
                />
            </View>

            <View style={styles.row}>
                <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.label}>Duración (semanas)</Text>
                    <TextInput
                        style={styles.input}
                        value={durationWeeks}
                        onChangeText={setDurationWeeks}
                        keyboardType="numeric"
                    />
                </View>
                <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.label}>Días por semana</Text>
                    <TextInput
                        style={styles.input}
                        value={daysCount}
                        onChangeText={setDaysCount}
                        keyboardType="numeric"
                    />
                </View>
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Notas</Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    numberOfLines={4}
                    placeholder="Instrucciones adicionales..."
                />
            </View>

            <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={loading}
            >
                {loading ? (
                    <ActivityIndicator color="white" />
                ) : (
                    <Text style={styles.buttonText}>Crear Rutina</Text>
                )}
            </TouchableOpacity>

            {/* Client Selection Modal */}
            <Modal
                visible={isClientModalVisible}
                animationType="slide"
                presentationStyle="pageSheet"
            >
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Seleccionar Cliente</Text>
                    <TouchableOpacity onPress={() => setClientModalVisible(false)}>
                        <Text style={styles.closeText}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
                <FlatList
                    data={clients}
                    keyExtractor={item => item.id}
                    renderItem={renderClientItem}
                    contentContainerStyle={styles.listContent}
                />
            </Modal>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
        padding: theme.spacing.lg,
    },
    formGroup: {
        marginBottom: theme.spacing.lg,
    },
    label: {
        fontSize: theme.fontSize.sm,
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.xs,
    },
    input: {
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.textSecondary + '40',
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        fontSize: theme.fontSize.md,
        color: theme.colors.text,
    },
    textArea: {
        height: 100,
        textAlignVertical: 'top',
    },
    selector: {
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.textSecondary + '40',
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    selectorText: {
        fontSize: theme.fontSize.md,
        color: theme.colors.text,
    },
    placeholderText: {
        color: theme.colors.textTertiary,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    halfWidth: {
        width: '48%',
    },
    button: {
        backgroundColor: theme.colors.primary,
        padding: theme.spacing.lg,
        borderRadius: theme.borderRadius.md,
        alignItems: 'center',
        marginTop: theme.spacing.md,
        marginBottom: theme.spacing.xxl,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: 'white',
        fontSize: theme.fontSize.lg,
        fontWeight: theme.fontWeight.bold,
    },
    // Modal Styles
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: theme.spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.textSecondary + '20',
        backgroundColor: theme.colors.surface,
    },
    modalTitle: {
        fontSize: theme.fontSize.xl,
        fontWeight: 'bold',
    },
    closeText: {
        color: theme.colors.primary,
        fontSize: theme.fontSize.md,
    },
    listContent: {
        padding: theme.spacing.md,
    },
    clientItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.background,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: theme.spacing.md,
    },
    avatarText: {
        color: 'white',
        fontWeight: 'bold',
    },
    clientName: {
        fontSize: theme.fontSize.md,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    clientEmail: {
        fontSize: theme.fontSize.sm,
        color: theme.colors.textSecondary,
    },
});
