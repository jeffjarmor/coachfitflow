import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Linking, TouchableOpacity } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../config/theme';
import { Exercise } from '../../types/Exercise';

export default function ExerciseDetailScreen() {
    const route = useRoute<any>();
    const { exercise } = route.params as { exercise: Exercise };

    const handleOpenVideo = () => {
        if (exercise.videoUrl) {
            Linking.openURL(exercise.videoUrl).catch(err =>
                console.error("Couldn't load page", err)
            );
        }
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.imageContainer}>
                {exercise.imageUrl ? (
                    <Image source={{ uri: exercise.imageUrl }} style={styles.image} resizeMode="cover" />
                ) : (
                    <View style={styles.placeholderImage}>
                        <Ionicons name="images-outline" size={60} color={theme.colors.textSecondary} />
                        <Text style={styles.placeholderText}>Sin imagen disponible</Text>
                    </View>
                )}
            </View>

            <View style={styles.content}>
                <Text style={styles.title}>{exercise.name}</Text>

                <View style={styles.tagContainer}>
                    <View style={styles.tag}>
                        <Text style={styles.tagText}>{exercise.muscleGroup}</Text>
                    </View>
                    {exercise.isGlobal && (
                        <View style={[styles.tag, styles.globalTag]}>
                            <Text style={[styles.tagText, styles.globalTagText]}>Global</Text>
                        </View>
                    )}
                </View>

                {exercise.description && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Instrucciones</Text>
                        <Text style={styles.description}>{exercise.description}</Text>
                    </View>
                )}

                {exercise.videoUrl && (
                    <TouchableOpacity style={styles.videoButton} onPress={handleOpenVideo}>
                        <Ionicons name="logo-youtube" size={24} color="white" />
                        <Text style={styles.videoButtonText}>Ver Video Demostrativo</Text>
                    </TouchableOpacity>
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
    imageContainer: {
        width: '100%',
        height: 250,
        backgroundColor: '#e0e0e0',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    placeholderImage: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
    },
    placeholderText: {
        color: theme.colors.textSecondary,
        marginTop: theme.spacing.sm,
    },
    content: {
        padding: theme.spacing.lg,
    },
    title: {
        fontSize: theme.fontSize.xxl,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: theme.spacing.sm,
    },
    tagContainer: {
        flexDirection: 'row',
        gap: theme.spacing.sm,
        marginBottom: theme.spacing.lg,
    },
    tag: {
        backgroundColor: theme.colors.primary + '20',
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 4,
        borderRadius: theme.borderRadius.full,
    },
    tagText: {
        color: theme.colors.primary,
        fontWeight: '600',
        fontSize: theme.fontSize.sm,
    },
    globalTag: {
        backgroundColor: theme.colors.secondary + '20',
    },
    globalTagText: {
        color: theme.colors.secondary,
    },
    section: {
        marginBottom: theme.spacing.lg,
    },
    sectionTitle: {
        fontSize: theme.fontSize.lg,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: theme.spacing.sm,
    },
    description: {
        fontSize: theme.fontSize.md,
        color: theme.colors.textSecondary,
        lineHeight: 24,
    },
    videoButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FF0000', // Youtube Red
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.md,
        gap: theme.spacing.sm,
    },
    videoButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: theme.fontSize.md,
    },
});
