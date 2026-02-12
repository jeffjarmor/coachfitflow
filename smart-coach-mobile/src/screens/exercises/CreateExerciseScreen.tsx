import React, { useState } from 'react';
import {
    View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
    Alert, ActivityIndicator
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../../config/theme';
import { useAuth } from '../../contexts/AuthContext';
import { exerciseService } from '../../services/ExerciseService';
import { CreateExerciseData } from '../../types/Exercise';

export default function CreateExerciseScreen() {
    const navigation = useNavigation();
    const { user } = useAuth();

    const [name, setName] = useState('');
    const [muscleGroup, setMuscleGroup] = useState('');
    const [description, setDescription] = useState('');
    const [videoUrl, setVideoUrl] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        if (!user?.uid) return;

        if (!name.trim()) {
            Alert.alert('Error', 'El nombre del ejercicio es obligatorio');
            return;
        }
        if (!muscleGroup.trim()) {
            Alert.alert('Error', 'El grupo muscular es obligatorio');
            return;
        }

        setLoading(true);
        try {
            const exerciseData: CreateExerciseData = {
                name,
                muscleGroup,
                description,
                videoUrl,
                isGlobal: false // Always false for coach exercises
            };

            await exerciseService.createExercise(user.uid, exerciseData);

            Alert.alert('Éxito', 'Ejercicio creado correctamente', [
                { text: 'OK', onPress: () => navigation.goBack() }
            ]);
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo crear el ejercicio');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.formGroup}>
                <Text style={styles.label}>Nombre del Ejercicio *</Text>
                <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Ej. Press Banca"
                />
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Grupo Muscular *</Text>
                <TextInput
                    style={styles.input}
                    value={muscleGroup}
                    onChangeText={setMuscleGroup}
                    placeholder="Ej. Pecho"
                />
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Video URL (opcional)</Text>
                <TextInput
                    style={styles.input}
                    value={videoUrl}
                    onChangeText={setVideoUrl}
                    placeholder="Ej. https://youtube.com/..."
                    autoCapitalize="none"
                    keyboardType="url"
                />
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Descripción / Instrucciones</Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={4}
                    placeholder="Pasos para realizar el ejercicio..."
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
                    <Text style={styles.buttonText}>Guardar Ejercicio</Text>
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
