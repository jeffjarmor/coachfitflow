import React, { useState, useEffect, useMemo } from 'react';
import {
    View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
    Alert, ActivityIndicator, Modal, FlatList, Dimensions
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../config/theme';
import { useAuth } from '../../contexts/AuthContext';
import { routineService } from '../../services/RoutineService';
import { clientService } from '../../services/ClientService';
import { exerciseService } from '../../services/ExerciseService';
import { Client } from '../../types/Client';
import { CreateRoutineData, TrainingDay, DayExercise } from '../../types/Routine';
import { Exercise } from '../../types/Exercise';
import { MUSCLE_GROUPS } from '../../utils/muscleGroups';

const { width } = Dimensions.get('window');

// Wizard Steps
const STEPS = ['Detalles', 'Planificación', 'Revisión'];

export default function RoutineWizardScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { user } = useAuth();

    // Global State
    const [currentStep, setCurrentStep] = useState(0);
    const [loading, setLoading] = useState(false);

    // --- STEP 1 STATE: Details ---
    const [name, setName] = useState('');
    const [objective, setObjective] = useState('');
    const [durationWeeks, setDurationWeeks] = useState('4');
    const [daysCount, setDaysCount] = useState('3');
    const [notes, setNotes] = useState('');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [clients, setClients] = useState<Client[]>([]);
    const [isClientModalVisible, setClientModalVisible] = useState(false);

    // --- STEP 2 STATE: Planning ---
    // We maintain an array of Day objects
    interface WizardDay {
        dayNumber: number;
        muscleGroups: string[];
        exercises: DayExercise[];
    }
    const [planningDays, setPlanningDays] = useState<WizardDay[]>([]);
    const [currentDayIndex, setCurrentDayIndex] = useState(0);
    const [isCopyModalVisible, setIsCopyModalVisible] = useState(false);
    const [selectedCopyTargets, setSelectedCopyTargets] = useState<number[]>([]);

    // Data for Step 2
    const [allExercises, setAllExercises] = useState<Exercise[]>([]);

    // Edit Exercise Modal State
    const [editingExercise, setEditingExercise] = useState<{ dayIndex: number, exIndex: number, data: DayExercise } | null>(null);
    const [editSets, setEditSets] = useState('3');
    const [editReps, setEditReps] = useState('10-12');
    const [editRest, setEditRest] = useState('60s');
    const [editNotes, setEditNotes] = useState('');

    // --- INITIALIZATION ---
    useEffect(() => {
        loadClients();
        loadExercises();
    }, []);

    // Load Routine for Editing
    useEffect(() => {
        if (route.params?.routineId && user?.uid && !loading) {
            loadRoutineForEdit(route.params.routineId);
        }
    }, [route.params?.routineId, user?.uid]);

    const loadRoutineForEdit = async (routineId: string) => {
        if (!user?.uid) return;
        setLoading(true);
        try {
            const routine = await routineService.getRoutineWithDays(user.uid, routineId);
            if (!routine) {
                Alert.alert('Error', 'No se encontró la rutina');
                navigation.goBack();
                return;
            }

            // Populate State
            setName(routine.name);
            setObjective(routine.objective);
            setDurationWeeks(routine.durationWeeks.toString());
            setDaysCount(routine.trainingDaysCount.toString());
            setNotes(routine.notes || '');

            // We need to wait for clients to load to set selectedClient properly
            // Or just set it if we have potential clients
            // For now, let's try to match from loaded list or fetch specific client
            if (routine.clientId) {
                // If clients list is already loaded, find it
                const found = clients.find(c => c.id === routine.clientId);
                if (found) setSelectedClient(found);
                else {
                    // Fetch specifically (not implemented in service but we can rely on list for now)
                    // If list not loaded yet, this might fail. Ideally list should load first.
                }
            }

            // Populate Days
            const days: WizardDay[] = routine.days.map(d => ({
                dayNumber: d.dayNumber,
                muscleGroups: d.muscleGroups || [],
                exercises: d.exercises || []
            }));
            setPlanningDays(days);

            // If editing, start at step 0 to review, or maybe directly to planning?
            // Let's stick to start at 0 so they review details first.
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Error al cargar la rutina');
        } finally {
            setLoading(false);
        }
    };

    // Updates selected client when clients list loads if we are editing
    useEffect(() => {
        if (route.params?.routineId && clients.length > 0 && !selectedClient) {
            // Re-attempt to find client if data loaded late
            // ... logic would be complex here without storing initial clientId. 
            // Simpler: assume clients load fast or user re-selects if empty.
        }
    }, [clients]);


    // When daysCount changes, resize planningDays array
    useEffect(() => {
        // Only resize if not loading initial data to avoid overwriting fetched days
        if (loading && route.params?.routineId) return;

        const count = parseInt(daysCount) || 0;
        if (count > 0 && count <= 7) {
            setPlanningDays(prev => {
                const newDays = [...prev];
                // If growing, add new days
                if (count > prev.length) {
                    for (let i = prev.length; i < count; i++) {
                        newDays.push({
                            dayNumber: i + 1,
                            muscleGroups: [],
                            exercises: []
                        });
                    }
                }
                // If shrinking, slice
                else if (count < prev.length) {
                    return newDays.slice(0, count);
                }
                return newDays;
            });
        }
    }, [daysCount]);

    const loadClients = () => {
        if (!user?.uid) return;
        const unsubscribe = clientService.subscribeToClients(
            user.uid,
            (data) => {
                setClients(data);
                // Try to auto-select client if editing 
                if (route.params?.routineId) {
                    // We need the routine data first... complicated async flow.
                    // Handled partly in loadRoutineForEdit
                }
            },
            (error) => console.error('Error fetching clients', error)
        );
        return () => unsubscribe();
    };

    const loadExercises = async () => {
        if (!user?.uid) return;
        try {
            const data = await exerciseService.getAllExercises(user.uid);
            setAllExercises(data);
        } catch (error) {
            console.error('Error loading exercises', error);
        }
    };

    // --- COMPUTED HELPERS ---
    const availableExercisesForCurrentDay = useMemo(() => {
        const currentDay = planningDays[currentDayIndex];
        if (!currentDay || !currentDay.muscleGroups || currentDay.muscleGroups.length === 0) return [];

        return allExercises.filter(ex =>
            currentDay.muscleGroups.includes(ex.muscleGroup)
        ).sort((a, b) => {
            // Sort by muscle group order of selection
            const idxA = currentDay.muscleGroups.indexOf(a.muscleGroup);
            const idxB = currentDay.muscleGroups.indexOf(b.muscleGroup);
            return idxA - idxB;
        });
    }, [allExercises, planningDays, currentDayIndex]);

    // --- ACTIONS ---

    const handleNext = () => {
        if (currentStep === 0) {
            // Validate Step 1
            if (!name.trim()) return Alert.alert('Error', 'Nombre requerido');
            if (!selectedClient) {
                // Try to recover from list if we have clientId but object missing?
                return Alert.alert('Error', 'Cliente requerido');
            }

            const d = parseInt(daysCount);
            if (isNaN(d) || d < 1 || d > 7) return Alert.alert('Error', 'Días deben ser 1-7');

            // Proceed
            setCurrentStep(1);
        } else if (currentStep === 1) {
            // Validate Step 2: STRICT CHECK
            // Use for loop to find first invalid day
            for (let i = 0; i < planningDays.length; i++) {
                const day = planningDays[i];
                if (day.exercises.length === 0) {
                    Alert.alert(
                        'Día incompleto',
                        `El Día ${day.dayNumber} no tiene ejercicios asignados. Debes completar todos los días antes de continuar.`
                    );
                    setCurrentDayIndex(i); // Jump to invalid day
                    return;
                }
            }
            setCurrentStep(2);
        } else {
            // Save
            saveRoutine();
        }
    };

    const handleBack = () => {
        if (currentStep > 0) setCurrentStep(currentStep - 1);
        else navigation.goBack();
    };

    const saveRoutine = async () => {
        if (!user?.uid || !selectedClient) return;
        setLoading(true);
        try {
            const duration = parseInt(durationWeeks);
            const days = parseInt(daysCount);
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

            // Convert WizardDay to TrainingDay (excluding ID/RoutineID)
            const finalDays: Omit<TrainingDay, 'id' | 'routineId'>[] = planningDays.map((d, idx) => ({
                dayNumber: d.dayNumber,
                dayName: `Día ${d.dayNumber}`,
                muscleGroups: d.muscleGroups,
                exercises: d.exercises.map((ex, exIdx) => ({
                    ...ex,
                    order: exIdx
                })),
                notes: ''
            }));

            if (route.params?.routineId) {
                // UPDATE
                await routineService.updateRoutine(user.uid, route.params.routineId, routineData, finalDays);
                Alert.alert('Éxito', 'Rutina actualizada correctamente', [
                    { text: 'OK', onPress: () => navigation.goBack() }
                ]);
            } else {
                // CREATE
                await routineService.createRoutine(user.uid, routineData, finalDays);
                Alert.alert('Éxito', 'Rutina creada correctamente', [
                    { text: 'OK', onPress: () => navigation.goBack() }
                ]);
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo guardar la rutina');
        } finally {
            setLoading(false);
        }
    };

    // --- STEP 2 LOGIC ---

    const toggleMuscleGroup = (group: string) => {
        setPlanningDays(prev => {
            const newDays = [...prev];
            const day = { ...newDays[currentDayIndex] };
            if (day.muscleGroups.includes(group)) {
                day.muscleGroups = day.muscleGroups.filter(g => g !== group);
                // Optional: Remove exercises associated with this group? Angular app keeps them.
            } else {
                day.muscleGroups = [...day.muscleGroups, group];
            }
            newDays[currentDayIndex] = day;
            return newDays;
        });
    };

    const toggleExercise = (exercise: Exercise) => {
        setPlanningDays(prev => {
            const newDays = [...prev];
            const day = { ...newDays[currentDayIndex] };
            // CRITICAL FIX: Copy the exercises array to avoid direct mutation of state
            const currentExercises = [...day.exercises];

            const existsIdx = currentExercises.findIndex(e => e.exerciseId === exercise.id);

            if (existsIdx >= 0) {
                // Remove
                currentExercises.splice(existsIdx, 1);
            } else {
                // Add
                currentExercises.push({
                    exerciseId: exercise.id,
                    exerciseSource: exercise.isGlobal ? 'global' : 'coach',
                    exerciseName: exercise.name,
                    muscleGroup: exercise.muscleGroup,
                    sets: 3,
                    reps: '10-12',
                    rest: '60s',
                    isSuperset: false,
                    imageUrl: exercise.imageUrl,
                    videoUrl: exercise.videoUrl,
                    order: currentExercises.length
                });
            }
            // Assign the new array back to the day object
            day.exercises = currentExercises;
            newDays[currentDayIndex] = day;
            return newDays;
        });
    };

    const isExerciseSelected = (exerciseId: string) => {
        const day = planningDays[currentDayIndex];
        return day?.exercises.some(e => e.exerciseId === exerciseId);
    };

    const openEditExercise = (index: number, ex: DayExercise) => {
        setEditingExercise({ dayIndex: currentDayIndex, exIndex: index, data: ex });
        setEditSets(ex.sets.toString());
        setEditReps(ex.reps);
        setEditRest(ex.rest);
        setEditNotes(ex.notes || '');
    };

    const saveExerciseEdit = () => {
        if (!editingExercise) return;
        setPlanningDays(prev => {
            const newDays = [...prev];
            const day = { ...newDays[editingExercise.dayIndex] };
            const ex = { ...day.exercises[editingExercise.exIndex] };
            ex.sets = parseInt(editSets) || 3;
            ex.reps = editReps;
            ex.rest = editRest;
            ex.notes = editNotes;
            day.exercises[editingExercise.exIndex] = ex;
            newDays[editingExercise.dayIndex] = day;
            return newDays;
        });
        setEditingExercise(null);
    };

    const openCopyModal = () => {
        if (!planningDays[currentDayIndex]?.exercises?.length) {
            Alert.alert('Sin ejercicios', 'Primero agrega ejercicios en este día para poder duplicarlo.');
            return;
        }
        setSelectedCopyTargets([]);
        setIsCopyModalVisible(true);
    };

    const toggleCopyTarget = (dayIndex: number) => {
        if (dayIndex === currentDayIndex) return;
        setSelectedCopyTargets(prev => (
            prev.includes(dayIndex)
                ? prev.filter(index => index !== dayIndex)
                : [...prev, dayIndex]
        ));
    };

    const applyCopyToTargets = () => {
        if (selectedCopyTargets.length === 0) {
            Alert.alert('Selecciona destino', 'Selecciona al menos un día destino.');
            return;
        }

        setPlanningDays(prev => {
            const sourceDay = prev[currentDayIndex];
            const sourceExercises: DayExercise[] = sourceDay.exercises.map((ex, index) => ({
                ...JSON.parse(JSON.stringify(ex)),
                order: index
            }));

            return prev.map((day, index) => {
                if (!selectedCopyTargets.includes(index)) return day;
                return {
                    ...day,
                    exercises: sourceExercises.map((ex, exIndex) => ({
                        ...JSON.parse(JSON.stringify(ex)),
                        order: exIndex
                    }))
                };
            });
        });

        setIsCopyModalVisible(false);
        setSelectedCopyTargets([]);
    };

    // --- RENDERS ---

    const renderStep1 = () => (
        <ScrollView style={styles.stepContainer}>
            <View style={styles.formGroup}>
                <Text style={styles.label}>Nombre de la Rutina *</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ej. Hipertrofia Fase 1" />
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Cliente *</Text>
                <TouchableOpacity style={styles.selector} onPress={() => setClientModalVisible(true)}>
                    <Text style={[styles.selectorText, !selectedClient && styles.placeholderText]}>
                        {selectedClient ? selectedClient.name : 'Seleccionar Cliente'}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Objetivo</Text>
                <TextInput style={styles.input} value={objective} onChangeText={setObjective} placeholder="Ej. Ganar masa muscular" />
            </View>

            <View style={styles.row}>
                <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.label}>Duración (semanas)</Text>
                    <TextInput style={styles.input} value={durationWeeks} onChangeText={setDurationWeeks} keyboardType="numeric" />
                </View>
                <View style={[styles.formGroup, styles.halfWidth]}>
                    <Text style={styles.label}>Días por semana</Text>
                    <TextInput style={styles.input} value={daysCount} onChangeText={setDaysCount} keyboardType="numeric" />
                </View>
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Notas</Text>
                <TextInput style={[styles.input, styles.textArea]} value={notes} onChangeText={setNotes} multiline numberOfLines={3} />
            </View>
        </ScrollView>
    );

    const renderStep2 = () => (
        <View style={styles.stepContainer}>
            {/* Day Navigation */}
            <View style={styles.dayTabs}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {planningDays.map((day, idx) => (
                        <TouchableOpacity
                            key={idx}
                            style={[styles.dayTab, currentDayIndex === idx && styles.dayTabActive]}
                            onPress={() => setCurrentDayIndex(idx)}
                        >
                            <Text style={[styles.dayTabText, currentDayIndex === idx && styles.dayTabActiveText]}>
                                Día {day.dayNumber}
                            </Text>
                            {day.exercises.length > 0 && <View style={styles.dot} />}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            <View style={styles.copyDayActions}>
                <TouchableOpacity
                    style={[
                        styles.copyDayButton,
                        !planningDays[currentDayIndex]?.exercises?.length && styles.copyDayButtonDisabled
                    ]}
                    onPress={openCopyModal}
                    disabled={!planningDays[currentDayIndex]?.exercises?.length}
                >
                    <Ionicons name="copy-outline" size={16} color="white" />
                    <Text style={styles.copyDayButtonText}>
                        Duplicar Día {planningDays[currentDayIndex]?.dayNumber || currentDayIndex + 1}
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.planningContent}>
                {/* Muscle Groups */}
                <Text style={styles.sectionTitle}>Grupos Musculares</Text>
                <View style={styles.chipsContainer}>
                    {MUSCLE_GROUPS.map(group => {
                        const isSelected = planningDays[currentDayIndex]?.muscleGroups.includes(group);
                        return (
                            <TouchableOpacity
                                key={group}
                                style={[styles.chip, isSelected && styles.chipSelected]}
                                onPress={() => toggleMuscleGroup(group)}
                            >
                                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{group}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Available Exercises */}
                {planningDays[currentDayIndex]?.muscleGroups?.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle}>
                            Ejercicios Disponibles ({availableExercisesForCurrentDay.length})
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                            {availableExercisesForCurrentDay.length === 0 ? (
                                <Text style={styles.emptyText}>No hay ejercicios para estos grupos.</Text>
                            ) : (
                                availableExercisesForCurrentDay.map(ex => {
                                    const isSelected = isExerciseSelected(ex.id);
                                    return (
                                        <TouchableOpacity
                                            key={ex.id}
                                            style={[styles.miniCard, isSelected && styles.miniCardSelected]}
                                            onPress={() => toggleExercise(ex)}
                                        >
                                            <Text style={styles.miniCardTitle} numberOfLines={2}>{ex.name}</Text>
                                            <Text style={styles.miniCardSubtitle}>{ex.muscleGroup}</Text>
                                            {isSelected && (
                                                <View style={styles.checkBadge}>
                                                    <Ionicons name="checkmark" size={12} color="white" />
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    );
                                })
                            )}
                        </ScrollView>
                    </>
                )}

                {/* Selected Exercises List */}
                <Text style={styles.sectionTitle}>
                    Ejercicios Seleccionados ({planningDays[currentDayIndex]?.exercises?.length || 0})
                </Text>
                {!planningDays[currentDayIndex]?.exercises || planningDays[currentDayIndex]?.exercises.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>Selecciona grupos musculares y agrega ejercicios.</Text>
                    </View>
                ) : (
                    planningDays[currentDayIndex].exercises.map((ex, idx) => (
                        <View key={`${ex.exerciseId}-${idx}`} style={styles.exerciseRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.exerciseRowName}>{ex.exerciseName}</Text>
                                <Text style={styles.exerciseRowDetails}>
                                    {ex.sets}x{ex.reps} | {ex.rest} descanso
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => openEditExercise(idx, ex)} style={styles.iconButton}>
                                <Ionicons name="create-outline" size={20} color={theme.colors.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => {
                                // reuse toggle logic to remove, we need duplicate safety if we allowed duplicates, but toggle handles ID checking
                                const originalEx = allExercises.find(a => a.id === ex.exerciseId);
                                if (originalEx) toggleExercise(originalEx);
                            }} style={styles.iconButton}>
                                <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                            </TouchableOpacity>
                        </View>
                    ))
                )}
                <View style={{ height: 100 }} />
            </ScrollView>
        </View>
    );

    const renderStep3 = () => (
        <ScrollView style={styles.stepContainer}>
            <View style={styles.reviewCard}>
                <Text style={styles.reviewLabel}>Rutina</Text>
                <Text style={styles.reviewValue}>{name}</Text>

                <Text style={styles.reviewLabel}>Cliente</Text>
                <Text style={styles.reviewValue}>{selectedClient?.name}</Text>

                <Text style={styles.reviewLabel}>Configuración</Text>
                <Text style={styles.reviewValue}>{durationWeeks} semanas | {daysCount} días/sem</Text>
            </View>

            <Text style={styles.sectionTitle}>Resumen</Text>
            {planningDays.map((day, idx) => (
                <View key={idx} style={styles.reviewDay}>
                    <Text style={styles.reviewDayHeader}>
                        Día {day.dayNumber} ({day.exercises.length} ejercicios)
                    </Text>
                    <Text style={styles.reviewMuscleGroups}>
                        {day.muscleGroups.join(', ')}
                    </Text>
                </View>
            ))}
        </ScrollView>
    );

    return (
        <View style={styles.container}>
            {/* Header Steps */}
            <View style={styles.stepsHeader}>
                {STEPS.map((step, idx) => (
                    <View key={idx} style={styles.stepIndicator}>
                        <View style={[styles.stepDot, currentStep >= idx && styles.stepDotActive]}>
                            <Text style={[styles.stepNumber, currentStep >= idx && styles.stepNumberActive]}>
                                {idx + 1}
                            </Text>
                        </View>
                        <Text style={[styles.stepLabel, currentStep >= idx && styles.stepLabelActive]}>
                            {step}
                        </Text>
                        {idx < STEPS.length - 1 && <View style={styles.stepLine} />}
                    </View>
                ))}
            </View>

            {/* Content */}
            <View style={styles.contentContainer}>
                {currentStep === 0 && renderStep1()}
                {currentStep === 1 && renderStep2()}
                {currentStep === 2 && renderStep3()}
            </View>

            {/* Footer */}
            <View style={styles.footer}>
                <TouchableOpacity style={styles.footerButtonSecondary} onPress={handleBack}>
                    <Text style={styles.footerButtonTextSecondary}>
                        {currentStep === 0 ? 'Cancelar' : 'Atrás'}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.footerButtonPrimary, loading && styles.disabled]}
                    onPress={handleNext}
                    disabled={loading}
                >
                    {loading ? <ActivityIndicator color="white" /> : (
                        <Text style={styles.footerButtonTextPrimary}>
                            {currentStep === 2 ? 'Guardar Rutina' : 'Siguiente'}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Client Modal */}
            <Modal visible={isClientModalVisible} animationType="slide" presentationStyle="pageSheet">
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Seleccionar Cliente</Text>
                    <TouchableOpacity onPress={() => setClientModalVisible(false)}>
                        <Text style={styles.closeText}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
                <FlatList
                    data={clients}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.modalItem} onPress={() => { setSelectedClient(item); setClientModalVisible(false); }}>
                            <Text style={styles.modalItemText}>{item.name}</Text>
                        </TouchableOpacity>
                    )}
                />
            </Modal>

            {/* Edit Exercise Modal */}
            <Modal visible={!!editingExercise} animationType="slide" transparent>
                <View style={styles.centeredView}>
                    <View style={styles.modalView}>
                        <Text style={styles.modalTitle}>Editar Ejercicio</Text>
                        <Text style={styles.modalSubtitle}>{editingExercise?.data.exerciseName}</Text>

                        <View style={styles.editRow}>
                            <View style={[styles.formGroup, styles.thirdWidth]}>
                                <Text style={styles.label}>Series</Text>
                                <TextInput style={styles.input} value={editSets} onChangeText={setEditSets} keyboardType="numeric" />
                            </View>
                            <View style={[styles.formGroup, styles.thirdWidth]}>
                                <Text style={styles.label}>Reps</Text>
                                <TextInput style={styles.input} value={editReps} onChangeText={setEditReps} />
                            </View>
                            <View style={[styles.formGroup, styles.thirdWidth]}>
                                <Text style={styles.label}>Descanso</Text>
                                <TextInput style={styles.input} value={editRest} onChangeText={setEditRest} />
                            </View>
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Notas</Text>
                            <TextInput style={[styles.input, { height: 60 }]} value={editNotes} onChangeText={setEditNotes} multiline />
                        </View>

                        <View style={styles.modalButtons}>
                            <TouchableOpacity onPress={() => setEditingExercise(null)} style={styles.footerButtonSecondary}>
                                <Text style={styles.footerButtonTextSecondary}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={saveExerciseEdit} style={styles.footerButtonPrimary}>
                                <Text style={styles.footerButtonTextPrimary}>Guardar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Copy Day Modal */}
            <Modal visible={isCopyModalVisible} animationType="fade" transparent>
                <View style={styles.centeredView}>
                    <View style={styles.modalView}>
                        <Text style={styles.modalTitle}>
                            Duplicar Día {planningDays[currentDayIndex]?.dayNumber || currentDayIndex + 1}
                        </Text>
                        <Text style={styles.modalSubtitle}>
                            Selecciona los días destino. Se reemplazarán sus ejercicios actuales.
                        </Text>

                        <View style={styles.copyTargetsList}>
                            {planningDays.map((day, idx) => {
                                const isSource = idx === currentDayIndex;
                                const isSelected = selectedCopyTargets.includes(idx);
                                return (
                                    <TouchableOpacity
                                        key={`copy-target-${idx}`}
                                        style={[
                                            styles.copyTargetItem,
                                            isSource && styles.copyTargetItemSource,
                                            isSelected && styles.copyTargetItemSelected
                                        ]}
                                        disabled={isSource}
                                        onPress={() => toggleCopyTarget(idx)}
                                    >
                                        <View style={styles.copyTargetInfo}>
                                            <Text style={styles.copyTargetTitle}>Día {day.dayNumber}</Text>
                                            <Text style={styles.copyTargetMeta}>{day.exercises.length} ejercicios</Text>
                                        </View>
                                        {isSource ? (
                                            <Text style={styles.copyTargetBadge}>Origen</Text>
                                        ) : (
                                            <Ionicons
                                                name={isSelected ? 'checkbox' : 'square-outline'}
                                                size={22}
                                                color={isSelected ? theme.colors.primary : theme.colors.textSecondary}
                                            />
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                onPress={() => {
                                    setIsCopyModalVisible(false);
                                    setSelectedCopyTargets([]);
                                }}
                                style={styles.footerButtonSecondary}
                            >
                                <Text style={styles.footerButtonTextSecondary}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={applyCopyToTargets}
                                style={[
                                    styles.footerButtonPrimary,
                                    selectedCopyTargets.length === 0 && styles.disabled
                                ]}
                                disabled={selectedCopyTargets.length === 0}
                            >
                                <Text style={styles.footerButtonTextPrimary}>
                                    Duplicar ({selectedCopyTargets.length})
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    stepsHeader: { flexDirection: 'row', padding: theme.spacing.lg, backgroundColor: theme.colors.surface, justifyContent: 'space-between', alignItems: 'center' },
    stepIndicator: { alignItems: 'center', flex: 1 },
    stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: theme.colors.textSecondary + '20', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
    stepDotActive: { backgroundColor: theme.colors.primary },
    stepNumber: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: 'bold' },
    stepNumberActive: { color: 'white' },
    stepLabel: { fontSize: 10, color: theme.colors.textSecondary },
    stepLabelActive: { color: theme.colors.primary, fontWeight: 'bold' },
    stepLine: { position: 'absolute', top: 12, right: -50, width: 100, height: 1, backgroundColor: theme.colors.textSecondary + '20', zIndex: -1 }, // Simplified

    contentContainer: { flex: 1 },
    stepContainer: { flex: 1, padding: theme.spacing.lg },
    footer: { flexDirection: 'row', padding: theme.spacing.lg, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.textSecondary + '20', gap: theme.spacing.md },
    footerButtonPrimary: { flex: 1, backgroundColor: theme.colors.primary, padding: theme.spacing.md, borderRadius: theme.borderRadius.md, alignItems: 'center' },
    footerButtonSecondary: { flex: 1, backgroundColor: 'transparent', padding: theme.spacing.md, borderRadius: theme.borderRadius.md, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.textSecondary + '40' },
    footerButtonTextPrimary: { color: 'white', fontWeight: 'bold' },
    footerButtonTextSecondary: { color: theme.colors.textSecondary },
    disabled: { opacity: 0.5 },

    // Forms
    formGroup: { marginBottom: theme.spacing.md },
    label: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginBottom: 4 },
    input: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.textSecondary + '40', borderRadius: theme.borderRadius.md, padding: theme.spacing.md },
    textArea: { height: 80, textAlignVertical: 'top' },
    selector: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.textSecondary + '40', borderRadius: theme.borderRadius.md, padding: theme.spacing.md, flexDirection: 'row', justifyContent: 'space-between' },
    selectorText: { color: theme.colors.text },
    placeholderText: { color: theme.colors.textTertiary },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    halfWidth: { width: '48%' },
    thirdWidth: { width: '31%' },

    // Step 2
    dayTabs: { flexDirection: 'row', paddingBottom: theme.spacing.sm },
    dayTab: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.surface, marginRight: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.textSecondary + '20' },
    dayTabActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    dayTabText: { color: theme.colors.textSecondary, fontWeight: '600' },
    dayTabActiveText: { color: 'white' },
    copyDayActions: { marginBottom: theme.spacing.sm },
    copyDayButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.primary,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.borderRadius.md
    },
    copyDayButtonDisabled: {
        opacity: 0.5
    },
    copyDayButtonText: {
        color: 'white',
        fontWeight: 'bold',
        marginLeft: 8
    },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.success, position: 'absolute', top: 5, right: 8 },

    planningContent: { flex: 1 },
    sectionTitle: { fontSize: theme.fontSize.md, fontWeight: 'bold', color: theme.colors.text, marginTop: theme.spacing.md, marginBottom: theme.spacing.sm },
    chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.textSecondary + '30' },
    chipSelected: { backgroundColor: theme.colors.primary + '20', borderColor: theme.colors.primary },
    chipText: { fontSize: 12, color: theme.colors.textSecondary },
    chipTextSelected: { color: theme.colors.primary, fontWeight: 'bold' },

    horizontalScroll: { marginHorizontal: -theme.spacing.lg, paddingHorizontal: theme.spacing.lg, paddingBottom: 10 },
    miniCard: { width: 120, height: 100, backgroundColor: theme.colors.surface, borderRadius: 8, padding: 8, marginRight: 8, justifyContent: 'space-between', shadowColor: '#000', elevation: 2 },
    miniCardSelected: { borderWidth: 2, borderColor: theme.colors.primary },
    miniCardTitle: { fontSize: 12, fontWeight: 'bold', color: theme.colors.text },
    miniCardSubtitle: { fontSize: 10, color: theme.colors.textSecondary },
    checkBadge: { position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
    emptyText: { color: theme.colors.textTertiary, fontStyle: 'italic', marginTop: 10 },
    emptyContainer: { alignItems: 'center', padding: 20 },

    exerciseRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, padding: 12, borderRadius: 8, marginBottom: 8 },
    exerciseRowName: { fontWeight: 'bold', color: theme.colors.text },
    exerciseRowDetails: { fontSize: 12, color: theme.colors.textSecondary },
    iconButton: { padding: 8 },

    // Modal
    modalHeader: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#eee' },
    modalTitle: { fontSize: 18, fontWeight: 'bold' },
    closeText: { color: theme.colors.primary },
    modalItem: { padding: 20, borderBottomWidth: 1, borderColor: '#eee' },
    modalItemText: { fontSize: 16 },

    centeredView: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalView: { width: '90%', backgroundColor: 'white', borderRadius: 20, padding: 20, shadowColor: '#000', elevation: 5 },
    modalSubtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 20 },
    copyTargetsList: { width: '100%', marginBottom: theme.spacing.md, maxHeight: 260 },
    copyTargetItem: {
        borderWidth: 1,
        borderColor: theme.colors.textSecondary + '30',
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.sm
    },
    copyTargetItemSource: { backgroundColor: theme.colors.textSecondary + '10' },
    copyTargetItemSelected: {
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.primary + '10'
    },
    copyTargetInfo: { flexDirection: 'column' },
    copyTargetTitle: { fontWeight: 'bold', color: theme.colors.text },
    copyTargetMeta: { color: theme.colors.textSecondary, marginTop: 2 },
    copyTargetBadge: { color: theme.colors.textSecondary, fontWeight: '600' },
    editRow: { flexDirection: 'row', justifyContent: 'space-between' },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 20 },

    // Review
    reviewCard: { backgroundColor: theme.colors.surface, padding: 16, borderRadius: 8, marginBottom: 20 },
    reviewLabel: { fontSize: 12, color: theme.colors.textSecondary },
    reviewValue: { fontSize: 16, fontWeight: 'bold', marginBottom: 12, color: theme.colors.text },
    reviewDay: { marginBottom: 12 },
    reviewDayHeader: { fontWeight: 'bold' },
    reviewMuscleGroups: { color: theme.colors.textSecondary, fontSize: 12 },
});
