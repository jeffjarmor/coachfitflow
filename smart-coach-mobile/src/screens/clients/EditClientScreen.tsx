import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { theme } from '../../config/theme';
import { useAuth } from '../../contexts/AuthContext';
import { clientService } from '../../services/ClientService';
import { Client, UpdateClientData } from '../../types/Client';

export default function EditClientScreen() {
    const navigation = useNavigation();
    const route = useRoute<any>();
    const { clientId, clientData } = route.params;
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState<UpdateClientData>({
        name: '',
        email: '',
        age: 0,
        weight: 0,
        height: 0,
        goal: '',
        phone: '',
        notes: '',
    });

    useEffect(() => {
        if (clientData) {
            setFormData({
                name: clientData.name,
                email: clientData.email,
                age: clientData.age,
                weight: clientData.weight,
                height: clientData.height,
                goal: clientData.goal,
                phone: clientData.phone || '',
                notes: clientData.notes || '',
            });
        }
    }, [clientData]);

    const handleSave = async () => {
        if (!user?.uid || !clientId) return;
        if (!formData.name || !formData.email) {
            Alert.alert('Error', 'Nombre y Email son obligatorios');
            return;
        }

        setLoading(true);
        try {
            await clientService.updateClient(user.uid, clientId, formData);
            Alert.alert('Éxito', 'Cliente actualizado correctamente', [
                { text: 'OK', onPress: () => navigation.goBack() }
            ]);
        } catch (error: any) {
            console.error(error);
            Alert.alert('Error', 'No se pudo actualizar el cliente');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.title}>Editar Cliente</Text>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Nombre Completo *</Text>
                <TextInput
                    style={styles.input}
                    value={formData.name}
                    onChangeText={(text) => setFormData({ ...formData, name: text })}
                />
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Email *</Text>
                <TextInput
                    style={styles.input}
                    value={formData.email}
                    onChangeText={(text) => setFormData({ ...formData, email: text })}
                    keyboardType="email-address"
                    autoCapitalize="none"
                />
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Teléfono</Text>
                <TextInput
                    style={styles.input}
                    value={formData.phone}
                    onChangeText={(text) => setFormData({ ...formData, phone: text })}
                    keyboardType="phone-pad"
                />
            </View>

            <View style={styles.row}>
                <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.label}>Edad</Text>
                    <TextInput
                        style={styles.input}
                        value={formData.age?.toString()}
                        onChangeText={(text) => setFormData({ ...formData, age: Number(text) || 0 })}
                        keyboardType="numeric"
                    />
                </View>
                <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.label}>Peso (kg)</Text>
                    <TextInput
                        style={styles.input}
                        value={formData.weight?.toString()}
                        onChangeText={(text) => setFormData({ ...formData, weight: Number(text) || 0 })}
                        keyboardType="numeric"
                    />
                </View>
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Altura (cm)</Text>
                <TextInput
                    style={styles.input}
                    value={formData.height?.toString()}
                    onChangeText={(text) => setFormData({ ...formData, height: Number(text) || 0 })}
                    keyboardType="numeric"
                />
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Meta Principal</Text>
                <TextInput
                    style={styles.input}
                    value={formData.goal}
                    onChangeText={(text) => setFormData({ ...formData, goal: text })}
                />
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Notas</Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    value={formData.notes}
                    onChangeText={(text) => setFormData({ ...formData, notes: text })}
                    multiline
                    numberOfLines={4}
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
                    <Text style={styles.buttonText}>Guardar Cambios</Text>
                )}
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
        padding: theme.spacing.lg,
    },
    title: {
        fontSize: theme.fontSize.xl,
        fontWeight: theme.fontWeight.bold,
        color: theme.colors.text,
        marginBottom: theme.spacing.xl,
    },
    formGroup: {
        marginBottom: theme.spacing.lg,
    },
    label: {
        fontSize: theme.fontSize.sm,
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.xs,
        fontWeight: theme.fontWeight.medium,
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
});
