import React, { useState, useCallback, useMemo } from 'react';
import {
    View, Text, FlatList, StyleSheet, TouchableOpacity,
    TextInput, ActivityIndicator, Image, Dimensions, ScrollView
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../config/theme';
import { useAuth } from '../../contexts/AuthContext';
import { exerciseService } from '../../services/ExerciseService';
import { Exercise } from '../../types/Exercise';
import { RootStackParamList } from '../../types/navigation';
import { MUSCLE_GROUPS } from '../../utils/muscleGroups';

const SCREEN_WIDTH = Dimensions.get('window').width;
const COLUMN_COUNT = SCREEN_WIDTH > 600 ? 3 : 2; // Responsive columns

export default function ExercisesListScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { user, coach } = useAuth();

    const [activeTab, setActiveTab] = useState<'global' | 'coach'>('global');
    const [exercises, setExercises] = useState<Exercise[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [selectedMuscle, setSelectedMuscle] = useState<string>('');

    const loadExercises = useCallback(async () => {
        if (!user?.uid) return;
        setLoading(true);
        try {
            let data: Exercise[] = [];
            // In a real app we might cache this or use pagination
            const globalData = await exerciseService.getGlobalExercises();
            const coachData = await exerciseService.getCoachExercises(user.uid);

            // Combine but filter in memory for now to match Angular logic
            // Ideally service should handle this based on tab
            const allData = [...globalData, ...coachData];

            // For now, simpler approach matching original service call logic
            if (activeTab === 'global') {
                data = await exerciseService.getGlobalExercises();
            } else {
                data = await exerciseService.getCoachExercises(user.uid);
            }
            setExercises(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [user, activeTab]);

    useFocusEffect(
        useCallback(() => {
            loadExercises();
        }, [loadExercises])
    );

    const filteredExercises = useMemo(() => {
        return exercises.filter(ex => {
            const matchesSearch = ex.name.toLowerCase().includes(searchText.toLowerCase()) ||
                ex.description?.toLowerCase().includes(searchText.toLowerCase());
            const matchesMuscle = selectedMuscle ? ex.muscleGroup === selectedMuscle : true;
            return matchesSearch && matchesMuscle;
        });
    }, [exercises, searchText, selectedMuscle]);

    const isGymMode = !!coach?.gymId;

    const renderItem = ({ item }: { item: Exercise }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('ExerciseDetail', { exercise: item })}
        >
            <View style={styles.imageContainer}>
                {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.thumbnail} />
                ) : (
                    <View style={styles.placeholderImage}>
                        <Ionicons name="barbell-outline" size={32} color={theme.colors.textSecondary} />
                    </View>
                )}
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.muscleGroup}</Text>
                </View>
            </View>

            <View style={styles.cardContent}>
                <Text style={styles.exerciseName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.description} numberOfLines={2}>
                    {item.description || 'No hay descripción disponible.'}
                </Text>

                <View style={styles.cardActions}>
                    {item.videoUrl && (
                        <View style={styles.videoLink}>
                            <Ionicons name="play-circle" size={16} color={theme.colors.primary} />
                            <Text style={styles.videoText}>Ver Video</Text>
                        </View>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                {/* Custom Header matching Angular "Page Header" concept */}
                <View style={styles.headerTop}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.primary} />
                    </TouchableOpacity>
                    <View style={styles.headerTitles}>
                        <Text style={styles.headerTitle}>Biblioteca de Ejercicios</Text>
                        <Text style={styles.headerSubtitle}>Explora o gestiona tu colección</Text>
                    </View>
                </View>

                {/* Search Bar */}
                <View style={styles.searchContainer}>
                    <Ionicons name="search" size={20} color={theme.colors.textSecondary} style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Buscar ejercicios..."
                        value={searchText}
                        onChangeText={setSearchText}
                        placeholderTextColor={theme.colors.textSecondary}
                    />
                </View>
            </View>

            {/* Muscle Group Filter (Horizontal Scroll) */}
            <View style={styles.filtersContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.muscleScroll}>
                    <TouchableOpacity
                        style={[styles.chip, !selectedMuscle && styles.activeChip]}
                        onPress={() => setSelectedMuscle('')}
                    >
                        <Text style={[styles.chipText, !selectedMuscle && styles.activeChipText]}>Todos</Text>
                    </TouchableOpacity>
                    {MUSCLE_GROUPS.map((muscle) => (
                        <TouchableOpacity
                            key={muscle}
                            style={[styles.chip, selectedMuscle === muscle && styles.activeChip]}
                            onPress={() => setSelectedMuscle(muscle)}
                        >
                            <Text style={[styles.chipText, selectedMuscle === muscle && styles.activeChipText]}>{muscle}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Tabs */}
            <View style={styles.tabsContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'global' && styles.activeTab]}
                    onPress={() => setActiveTab('global')}
                >
                    <Text style={[styles.tabText, activeTab === 'global' && styles.activeTabText]}>Biblioteca Global</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'coach' && styles.activeTab]}
                    onPress={() => setActiveTab('coach')}
                >
                    <Text style={[styles.tabText, activeTab === 'coach' && styles.activeTabText]}>
                        {isGymMode ? 'Ejercicios Gym' : 'Mis Ejercicios'}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Content */}
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                    <Text style={styles.loadingText}>Cargando ejercicios...</Text>
                </View>
            ) : (
                <FlatList
                    data={filteredExercises}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    numColumns={2} // Grid layout
                    columnWrapperStyle={styles.listRow}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyIcon}>💪</Text>
                            <Text style={styles.emptyTitle}>No se encontraron ejercicios</Text>
                            {(searchText || selectedMuscle) ? (
                                <Text style={styles.emptyText}>Intenta ajustar tus filtros.</Text>
                            ) : (
                                <Text style={styles.emptyText}>
                                    {activeTab === 'coach'
                                        ? (isGymMode ? 'Aún no hay ejercicios en la biblioteca del gimnasio.' : 'Aún no has creado ningún ejercicio personalizado.')
                                        : 'La biblioteca global está vacía.'}
                                </Text>
                            )}
                        </View>
                    }
                />
            )}

            {/* FAB */}
            <TouchableOpacity
                style={styles.fab}
                onPress={() => navigation.navigate('CreateExercise')}
            >
                <Ionicons name="add" size={30} color="white" />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f7fa', // bg-secondary
    },
    header: {
        backgroundColor: 'white',
        paddingTop: 50, // Safe area
        paddingBottom: 15,
        paddingHorizontal: theme.spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 15,
    },
    backButton: {
        marginRight: 15,
    },
    headerTitles: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    headerSubtitle: {
        fontSize: 14,
        color: theme.colors.textSecondary,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f1f3f5', // bg-primary like
        borderRadius: 8,
        paddingHorizontal: 12,
        height: 48,
    },
    searchIcon: {
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: theme.colors.text,
        height: '100%',
    },
    filtersContainer: {
        backgroundColor: 'white',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    muscleScroll: {
        paddingHorizontal: theme.spacing.lg,
        gap: 8,
    },
    chip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f1f3f5',
        marginRight: 8,
    },
    activeChip: {
        backgroundColor: theme.colors.primary,
    },
    chipText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        fontWeight: '500',
    },
    activeChipText: {
        color: 'white',
        fontWeight: '600',
    },
    tabsContainer: {
        flexDirection: 'row',
        backgroundColor: 'white',
        paddingHorizontal: theme.spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    tab: {
        marginRight: 24,
        paddingVertical: 12,
        borderBottomWidth: 3,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: theme.colors.primary,
    },
    tabText: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        fontWeight: '500',
    },
    activeTabText: {
        color: theme.colors.primary,
        fontWeight: '600',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 10,
        color: theme.colors.textSecondary,
    },
    listContent: {
        padding: theme.spacing.md,
        paddingBottom: 80, // FAB space
    },
    listRow: {
        justifyContent: 'space-between',
    },
    card: {
        width: '48%', // Grid item
        backgroundColor: 'white',
        borderRadius: 12,
        marginBottom: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
        overflow: 'hidden',
    },
    imageContainer: {
        height: 120, // Smaller mobile height
        backgroundColor: '#e9ecef',
        position: 'relative',
    },
    thumbnail: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    placeholderImage: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    badge: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        // backdropFilter not supported in RN
    },
    badgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '600',
    },
    cardContent: {
        padding: 12,
    },
    exerciseName: {
        fontSize: 14,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 4,
    },
    description: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginBottom: 8,
        height: 32, // approx 2 lines
    },
    cardActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    videoLink: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    videoText: {
        fontSize: 10,
        color: theme.colors.primary,
        marginLeft: 4,
        fontWeight: '500',
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        lineHeight: 20,
    },
    fab: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
});
