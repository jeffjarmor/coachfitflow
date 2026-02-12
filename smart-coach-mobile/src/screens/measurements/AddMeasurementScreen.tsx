import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { theme } from '../../config/theme';
import { useAuth } from '../../contexts/AuthContext';
import { measurementService } from '../../services/MeasurementService';
import { CreateMeasurementData } from '../../types/Measurement';

export default function AddMeasurementScreen() {
    const navigation = useNavigation();
    const route = useRoute<any>();
    const { clientId } = route.params;
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);

    // Form State
    const [weight, setWeight] = useState('');
    const [height, setHeight] = useState('');
    const [bodyFat, setBodyFat] = useState('');
    const [muscleMass, setMuscleMass] = useState('');
    const [visceralFat, setVisceralFat] = useState('');
    const [metabolicAge, setMetabolicAge] = useState('');

    // Circumferences
    const [waist, setWaist] = useState('');
    const [hips, setHips] = useState('');
    const [chest, setChest] = useState('');
    const [arms, setArms] = useState('');
    const [legs, setLegs] = useState('');

    const calculateBMI = (w: number, h: number) => {
        if (h === 0) return 0;
        const hInMeters = h / 100;
        return Number((w / (hInMeters * hInMeters)).toFixed(1));
    };

    const handleSave = async () => {
        if (!user?.uid || !clientId) return;

        const wVal = Number(weight);
        const hVal = Number(height);

        if (!wVal || !hVal) {
            Alert.alert('Error', 'Peso y Altura son obligatorios');
            return;
        }

        setLoading(true);
        try {
            const bmiVal = calculateBMI(wVal, hVal);

            const data: CreateMeasurementData = {
                clientId,
                date: new Date(),
                weight: wVal,
                height: hVal,
                bmi: bmiVal,
                bodyFatPercentage: bodyFat ? Number(bodyFat) : undefined,
                muscleMass: muscleMass ? Number(muscleMass) : undefined,
                visceralFat: visceralFat ? Number(visceralFat) : undefined,
                metabolicAge: metabolicAge ? Number(metabolicAge) : undefined,
                waist: waist ? Number(waist) : undefined,
                hips: hips ? Number(hips) : undefined,
                chest: chest ? Number(chest) : undefined,
                arms: arms ? Number(arms) : undefined,
                legs: legs ? Number(legs) : undefined,
            };

            await measurementService.addMeasurement(user.uid, data);
            Alert.alert('Éxito', 'Medición guardada', [
                { text: 'OK', onPress: () => navigation.goBack() }
            ]);
        } catch (error: any) {
            console.error(error);
            Alert.alert('Error', 'No se pudo guardar la medición');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.sectionTitle}>Datos Corporales</Text>

            <View style={styles.row}>
                <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.label}>Peso (kg) *</Text>
                    <TextInput
                        style={styles.input}
                        value={weight}
                        onChangeText={setWeight}
                        keyboardType="numeric"
                        placeholder="0.0"
                    />
                </View>
                <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.label}>Altura (cm) *</Text>
                    <TextInput
                        style={styles.input}
                        value={height}
                        onChangeText={setHeight}
                        keyboardType="numeric"
                        placeholder="0"
                    />
                </View>
            </View>

            <View style={styles.row}>
                <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.label}>% Grasa Corporal</Text>
                    <TextInput
                        style={styles.input}
                        value={bodyFat}
                        onChangeText={setBodyFat}
                        keyboardType="numeric"
                        placeholder="Opcional"
                    />
                </View>
                <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.label}>Masa Muscular (kg)</Text>
                    <TextInput
                        style={styles.input}
                        value={muscleMass}
                        onChangeText={setMuscleMass}
                        keyboardType="numeric"
                        placeholder="Opcional"
                    />
                </View>
            </View>

            <View style={styles.row}>
                <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.label}>Grasa Visceral</Text>
                    <TextInput
                        style={styles.input}
                        value={visceralFat}
                        onChangeText={setVisceralFat}
                        keyboardType="numeric"
                        placeholder="1-59"
                    />
                </View>
                <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.label}>Edad Metabólica</Text>
                    <TextInput
                        style={styles.input}
                        value={metabolicAge}
                        onChangeText={setMetabolicAge}
                        keyboardType="numeric"
                        placeholder="Años"
                    />
                </View>
            </View>

            <Text style={[styles.sectionTitle, { marginTop: theme.spacing.lg }]}>Circunferencias (cm)</Text>

            <View style={styles.row}>
                <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.label}>Cintura</Text>
                    <TextInput
                        style={styles.input}
                        value={waist}
                        onChangeText={setWaist}
                        keyboardType="numeric"
                    />
                </View>
                <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.label}>Cadera</Text>
                    <TextInput
                        style={styles.input}
                        value={hips}
                        onChangeText={setHips}
                        keyboardType="numeric"
                    />
                </View>
            </View>

            <View style={styles.row}>
                <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.label}>Pecho</Text>
                    <TextInput
                        style={styles.input}
                        value={chest}
                        onChangeText={setChest}
                        keyboardType="numeric"
                    />
                </View>
                <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.label}>Brazos</Text>
                    <TextInput
                        style={styles.input}
                        value={arms}
                        onChangeText={setArms}
                        keyboardType="numeric"
                    />
                </View>
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Piernas</Text>
                <TextInput
                    style={styles.input}
                    value={legs}
                    onChangeText={setLegs}
                    keyboardType="numeric"
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
                    <Text style={styles.buttonText}>Guardar Medición</Text>
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
    sectionTitle: {
        fontSize: theme.fontSize.lg,
        fontWeight: theme.fontWeight.bold,
        color: theme.colors.primary,
        marginBottom: theme.spacing.md,
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
