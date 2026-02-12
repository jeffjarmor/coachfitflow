import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    Alert,
    Image,
    ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../config/theme';
import { useAuth } from '../../contexts/AuthContext';
import { CoachService } from '../../services/CoachService';
import { Coach } from '../../types/coach';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function ProfileScreen() {
    const { user, logout } = useAuth();

    // State
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [coach, setCoach] = useState<Coach | null>(null);
    const [gym, setGym] = useState<any | null>(null); // Placeholder for gym type

    // Form state
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [brandColor, setBrandColor] = useState<string>(theme.colors.primary);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);

    // Validation state
    const [errors, setErrors] = useState<{ name?: string; brandColor?: string }>({});

    useEffect(() => {
        loadProfile();
    }, [user]);

    const loadProfile = async () => {
        if (!user?.uid) return;

        try {
            setLoading(true);
            const coachData = await CoachService.getCoachProfile(user.uid);

            if (coachData) {
                setCoach(coachData);
                setName(coachData.name);
                setEmail(coachData.email);
                setPhone(coachData.phone || '');
                setBrandColor(coachData.brandColor || theme.colors.primary);
                setLogoPreview(coachData.logoUrl || null);

                // If we implemented GymService, we would load gym data here
                // For now, simulate or leave empty
                if (coachData.gymId) {
                    // const gymData = await GymService.getGym(coachData.gymId);
                    // setGym(gymData);
                }
            } else {
                // Should not happen if registered correctly, but handle anyway
                // Maybe redirect to setup?
            }
        } catch (error) {
            console.error('Error loading profile:', error);
            Alert.alert('Error', 'No se pudo cargar el perfil');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        Alert.alert(
            'Cerrar Sesión',
            '¿Estás seguro de que quieres salir?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Salir',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await logout();
                        } catch (error: any) {
                            Alert.alert('Error', error.message);
                        }
                    }
                }
            ]
        );
    };

    const validateForm = () => {
        const newErrors: { name?: string; brandColor?: string } = {};

        if (!name.trim() || name.length < 2) {
            newErrors.name = 'El nombre debe tener al menos 2 caracteres';
        }

        const hexRegex = /^#[0-9A-Fa-f]{6}$/;
        if (!hexRegex.test(brandColor)) {
            newErrors.brandColor = 'Ingresa un color hexadecimal válido (ej. #2196f3)';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const pickImage = async () => {
        // Request permission
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería para subir el logo');
            return;
        }

        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });

        if (!result.canceled) {
            const asset = result.assets[0];
            // Check file size (approximate) or type if needed
            setLogoPreview(asset.uri);
        }
    };

    const handleSave = async () => {
        if (!validateForm() || !user?.uid) return;

        try {
            setSaving(true);

            // Upload logo if changed (and it's a local URI, not http URL)
            let newLogoUrl = coach?.logoUrl;
            if (logoPreview && !logoPreview.startsWith('http')) {
                newLogoUrl = await CoachService.uploadLogo(user.uid, logoPreview);
            }

            // Update profile
            await CoachService.updateCoachProfile(user.uid, {
                name,
                phone,
                brandColor,
                logoUrl: newLogoUrl
            });

            Alert.alert('Éxito', 'Perfil actualizado correctamente');

            // Reload to refresh state
            await loadProfile();
        } catch (error) {
            console.error('Error saving profile:', error);
            Alert.alert('Error', 'No se pudo actualizar el perfil');
        } finally {
            setSaving(false);
        }
    };

    const handleLeaveGym = async () => {
        if (!gym || !coach) return;

        Alert.alert(
            'Salir del Gimnasio',
            `¿Estás seguro de que quieres salir de ${gym.name}? Tu cuenta volverá a ser independiente.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Salir',
                    style: 'destructive',
                    onPress: async () => {
                        // Call GymService.removeCoachFromGym
                        Alert.alert('Pendiente', 'Funcionalidad de salir de gimnasio pendiente de implementar');
                    }
                }
            ]
        );
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Cargando perfil...</Text>
            </View>
        );
    }

    const isGymOwner = coach?.role === 'owner' && gym?.ownerId === coach?.id;
    const isAdmin = coach?.role === 'admin';

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>Perfil del Coach</Text>
                    <Text style={styles.headerSubtitle}>Personaliza tu marca e información</Text>
                </View>
                <TouchableOpacity onPress={handleLogout} style={styles.logoutIconBtn}>
                    <Ionicons name="log-out-outline" size={24} color={theme.colors.error} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Gym Info Card (if exists) */}
                {gym && (
                    <LinearGradient
                        colors={['#f8fafc', '#edf2f7']}
                        style={styles.gymCard}
                    >
                        <View style={styles.gymInfo}>
                            <Text style={styles.gymLabel}>MIEMBRO DEL EQUIPO</Text>
                            <Text style={styles.gymName}>{gym.name}</Text>
                            <Text style={styles.gymRole}>
                                {coach?.role === 'owner' ? 'Dueño / Administrador' : 'Entrenador'}
                            </Text>
                        </View>

                        <View style={styles.gymActions}>
                            {coach?.role === 'owner' ? (
                                <View style={styles.ownerBadge}>
                                    <Text style={styles.ownerBadgeText}>👑 Propietario</Text>
                                </View>
                            ) : (
                                <TouchableOpacity
                                    style={styles.leaveGymBtn}
                                    onPress={handleLeaveGym}
                                >
                                    <Text style={styles.leaveGymText}>Salir</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </LinearGradient>
                )}

                {/* Personal Info Card */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <View style={styles.cardIcon}>
                            <Text style={styles.cardIconText}>👤</Text>
                        </View>
                        <View>
                            <Text style={styles.cardTitle}>Información Personal</Text>
                            <Text style={styles.cardSubtitle}>Tus detalles de contacto</Text>
                        </View>
                    </View>

                    <View style={styles.cardBody}>
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Nombre Completo <Text style={styles.required}>*</Text></Text>
                            <TextInput
                                style={[styles.input, errors.name ? styles.inputError : null]}
                                value={name}
                                onChangeText={setName}
                                placeholder="Juan Pérez"
                            />
                            {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Correo Electrónico</Text>
                            <View style={[styles.inputContainer, styles.inputDisabled]}>
                                <TextInput
                                    style={[styles.input, styles.inputDisabled]}
                                    value={email}
                                    editable={false}
                                />
                                <Ionicons name="lock-closed-outline" size={16} color={theme.colors.textTertiary} style={styles.inputIcon} />
                            </View>
                            <Text style={styles.helperText}>El correo no se puede cambiar</Text>
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Teléfono</Text>
                            <TextInput
                                style={styles.input}
                                value={phone}
                                onChangeText={setPhone}
                                placeholder="+52 (555) 123-4567"
                                keyboardType="phone-pad"
                            />
                        </View>
                    </View>
                </View>

                {/* Branding Card */}
                {!isGymOwner && (
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <LinearGradient
                                colors={[theme.colors.primary, theme.colors.accent]}
                                style={[styles.cardIcon, styles.cardIconGradient]}
                            >
                                <Text style={styles.cardIconText}>🎨</Text>
                            </LinearGradient>
                            <View>
                                <Text style={styles.cardTitle}>Marca y Personalización</Text>
                                <Text style={styles.cardSubtitle}>
                                    {!gym || isAdmin ? 'Haz que tus rutinas destaquen' : `Gestionado por ${gym.name}`}
                                </Text>
                            </View>
                        </View>

                        <View style={[styles.cardBody, (gym && !isAdmin) && styles.lockedBody]}>
                            {(gym && !isAdmin) && (
                                <View style={styles.lockedOverlay}>
                                    <View style={styles.lockedMessage}>
                                        <Text style={styles.lockedText}>Personalización definida por el gimnasio</Text>
                                    </View>
                                </View>
                            )}

                            {/* Logo Upload */}
                            <View style={styles.logoSection}>
                                <Text style={styles.sectionLabel}>Logo del Coach</Text>
                                <View style={styles.logoUploadWrapper}>
                                    <View style={[styles.logoCircle, !!logoPreview && styles.logoCircleActive]}>
                                        {logoPreview ? (
                                            <Image source={{ uri: logoPreview }} style={styles.logoImage} />
                                        ) : (
                                            <Text style={styles.logoPlaceholder}>📷</Text>
                                        )}
                                    </View>

                                    <View style={styles.logoControls}>
                                        <TouchableOpacity style={styles.uploadBtn} onPress={pickImage}>
                                            <Ionicons name="cloud-upload-outline" size={20} color={theme.colors.primary} />
                                            <Text style={styles.uploadBtnText}>
                                                {logoPreview ? 'Cambiar Logo' : 'Subir Logo'}
                                            </Text>
                                        </TouchableOpacity>
                                        <Text style={styles.logoInfo}>Max 5MB • PNG, JPG</Text>
                                    </View>
                                </View>
                            </View>

                            {/* Brand Color */}
                            <View style={styles.colorSection}>
                                <Text style={styles.sectionLabel}>Color de Marca</Text>
                                <View style={styles.colorPickerWrapper}>
                                    <View style={[styles.colorSwatch, { backgroundColor: brandColor }]} />
                                    <View style={styles.colorInputWrapper}>
                                        <TextInput
                                            style={[styles.hexInput, errors.brandColor ? styles.inputError : null]}
                                            value={brandColor}
                                            onChangeText={(text) => {
                                                setBrandColor(text);
                                                if (text.length === 7) setErrors({ ...errors, brandColor: undefined });
                                            }}
                                            placeholder="#2196f3"
                                            maxLength={7}
                                            autoCapitalize="none"
                                        />
                                        <Text style={styles.hexLabel}>HEX</Text>
                                    </View>
                                </View>
                                {errors.brandColor && <Text style={styles.errorText}>{errors.brandColor}</Text>}
                                <Text style={styles.helperText}>Usado en encabezados de PDF y acentos</Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Save Button */}
                <TouchableOpacity
                    style={[styles.saveButton, (saving || Object.keys(errors).length > 0) && styles.saveButtonDisabled]}
                    onPress={handleSave}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <>
                            <Text style={styles.saveButtonText}>Guardar Cambios</Text>
                        </>
                    )}
                </TouchableOpacity>

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.background,
    },
    loadingText: {
        marginTop: 10,
        color: theme.colors.textSecondary,
        fontSize: theme.fontSize.md,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        backgroundColor: theme.colors.background,
    },
    headerTitle: {
        fontSize: theme.fontSize.xxl,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    headerSubtitle: {
        fontSize: theme.fontSize.sm,
        color: theme.colors.textSecondary,
    },
    logoutIconBtn: {
        padding: 8,
    },
    scrollContent: {
        padding: theme.spacing.lg,
    },
    // Gym Card
    gymCard: {
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.lg,
        marginBottom: theme.spacing.lg,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    gymInfo: {
        flex: 1,
    },
    gymLabel: {
        fontSize: theme.fontSize.xs,
        fontWeight: '600',
        color: '#64748b',
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    gymName: {
        fontSize: theme.fontSize.lg,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 2,
    },
    gymRole: {
        fontSize: theme.fontSize.sm,
        color: theme.colors.textSecondary,
    },
    gymActions: {
        marginLeft: 16,
    },
    ownerBadge: {
        backgroundColor: '#fef3c7',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#fcd34d',
    },
    ownerBadgeText: {
        color: '#d97706',
        fontSize: theme.fontSize.xs,
        fontWeight: 'bold',
    },
    leaveGymBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        backgroundColor: 'white',
    },
    leaveGymText: {
        color: '#64748b',
        fontSize: theme.fontSize.xs,
        fontWeight: '600',
    },
    // Cards
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.xl,
        marginBottom: theme.spacing.lg,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        overflow: 'hidden',
        ...theme.shadows.sm,
    },
    cardHeader: {
        flexDirection: 'row',
        padding: theme.spacing.lg,
        backgroundColor: '#f8fafc', // Light gray background for header
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        alignItems: 'center',
    },
    cardIcon: {
        width: 48,
        height: 48,
        borderRadius: theme.borderRadius.lg,
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: theme.spacing.md,
    },
    cardIconGradient: {
        // Gradient handling is done via props
    },
    cardIconText: {
        fontSize: 24,
    },
    cardTitle: {
        fontSize: theme.fontSize.lg,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 2,
    },
    cardSubtitle: {
        fontSize: theme.fontSize.sm,
        color: theme.colors.textSecondary,
    },
    cardBody: {
        padding: theme.spacing.lg,
    },
    // Forms
    formGroup: {
        marginBottom: theme.spacing.md,
    },
    label: {
        fontSize: theme.fontSize.sm,
        fontWeight: '600',
        color: theme.colors.text,
        marginBottom: theme.spacing.xs,
    },
    required: {
        color: theme.colors.error,
    },
    input: {
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        fontSize: theme.fontSize.base,
        color: theme.colors.text,
    },
    inputError: {
        borderColor: theme.colors.error,
        backgroundColor: '#fff5f5',
    },
    inputContainer: {
        position: 'relative',
    },
    inputDisabled: {
        backgroundColor: '#f8fafc',
        color: theme.colors.textSecondary,
    },
    inputIcon: {
        position: 'absolute',
        right: 12,
        top: 14,
    },
    errorText: {
        color: theme.colors.error,
        fontSize: theme.fontSize.xs,
        marginTop: 4,
    },
    helperText: {
        color: theme.colors.textTertiary,
        fontSize: theme.fontSize.xs,
        marginTop: 4,
    },
    // Logo
    logoSection: {
        marginBottom: theme.spacing.xl,
    },
    sectionLabel: {
        fontSize: theme.fontSize.base,
        fontWeight: '600',
        color: theme.colors.text,
        marginBottom: theme.spacing.md,
    },
    logoUploadWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: theme.spacing.md,
        backgroundColor: '#f8fafc',
        borderRadius: theme.borderRadius.lg,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderStyle: 'dashed',
    },
    logoCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        marginRight: theme.spacing.lg,
    },
    logoCircleActive: {
        borderColor: theme.colors.primary,
        borderWidth: 2,
    },
    logoImage: {
        width: '100%',
        height: '100%',
    },
    logoPlaceholder: {
        fontSize: 32,
        opacity: 0.5,
    },
    logoControls: {
        flex: 1,
    },
    uploadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: theme.colors.primary,
        borderRadius: theme.borderRadius.md,
        alignSelf: 'flex-start',
        marginBottom: 8,
    },
    uploadBtnText: {
        color: theme.colors.primary,
        fontWeight: '600',
        marginLeft: 8,
    },
    logoInfo: {
        fontSize: theme.fontSize.xs,
        color: theme.colors.textTertiary,
    },
    // Color Picker
    colorSection: {
        marginBottom: theme.spacing.sm,
    },
    colorPickerWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    colorSwatch: {
        width: 48,
        height: 48,
        borderRadius: theme.borderRadius.md,
        borderWidth: 3,
        borderColor: 'white',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 2,
        marginRight: theme.spacing.md,
    },
    colorInputWrapper: {
        flex: 1,
        position: 'relative',
    },
    hexInput: {
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        fontSize: theme.fontSize.lg,
        fontFamily: 'Courier',
        color: theme.colors.text,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    hexLabel: {
        position: 'absolute',
        right: 12,
        top: 14,
        fontSize: theme.fontSize.xs,
        fontWeight: 'bold',
        color: theme.colors.textTertiary,
    },
    // Locked State
    lockedBody: {
        opacity: 0.7,
    },
    lockedOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.6)',
        zIndex: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    lockedMessage: {
        backgroundColor: 'white',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 8,
        ...theme.shadows.sm,
    },
    lockedText: {
        fontWeight: '600',
        color: theme.colors.textSecondary,
        fontSize: theme.fontSize.sm,
    },
    // Save Button
    saveButton: {
        backgroundColor: theme.colors.primary,
        paddingVertical: theme.spacing.lg,
        borderRadius: theme.borderRadius.lg,
        alignItems: 'center',
        ...theme.shadows.md,
    },
    saveButtonDisabled: {
        opacity: 0.7,
    },
    saveButtonText: {
        color: 'white',
        fontSize: theme.fontSize.lg,
        fontWeight: 'bold',
    },
});
