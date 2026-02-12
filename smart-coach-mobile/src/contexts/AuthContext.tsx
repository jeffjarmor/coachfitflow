import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
    User,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendEmailVerification,
    sendPasswordResetEmail,
    signInWithCredential,
    AuthCredential,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { Coach } from '../types/coach';

interface AuthContextType {
    user: User | null;
    coach: Coach | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (email: string, password: string, name: string) => Promise<void>;
    logout: () => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
    signInWithGoogle: (credential: AuthCredential) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [coach, setCoach] = useState<Coach | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);

            if (firebaseUser) {
                // Load coach profile from Firestore
                try {
                    console.log('🔄 Auth state changed: Loading coach profile for', firebaseUser.uid);
                    const coachDoc = await getDoc(doc(db, 'coaches', firebaseUser.uid));
                    if (coachDoc.exists()) {
                        const coachData = { id: coachDoc.id, ...coachDoc.data() } as Coach;
                        console.log('✅ Coach profile loaded:', coachData);
                        setCoach(coachData);
                    } else {
                        console.warn('⚠️ Coach document does not exist for user:', firebaseUser.uid);
                    }
                } catch (error) {
                    console.error('❌ Error loading coach profile:', error);
                }
            } else {
                setCoach(null);
            }

            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const signIn = async (email: string, password: string) => {
        try {
            console.log('🔑 Attempting sign in with email/password');
            await signInWithEmailAndPassword(auth, email, password);
            console.log('✅ Sign in successful');
        } catch (error: any) {
            console.error('❌ Sign in error:', error);
            throw new Error(error.message || 'Error al iniciar sesión');
        }
    };

    const signUp = async (email: string, password: string, name: string) => {
        console.log('📝 Starting sign up process for:', email);
        try {
            console.log('🔐 Creating user with email/password...');
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            console.log('✅ User created successfully:', user.uid);

            // Create coach profile in Firestore
            const newCoach: Omit<Coach, 'id'> = {
                email: user.email || email,
                name,
                role: 'coach',
                accountType: 'independent',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            console.log('💾 Saving coach profile to Firestore...');
            await setDoc(doc(db, 'coaches', user.uid), newCoach);
            console.log('✅ Coach profile saved');

            // Send email verification
            console.log('📧 Sending email verification...');
            await sendEmailVerification(user);
            console.log('✅ Email verification sent');
        } catch (error: any) {
            console.error('❌ Sign up error:', error);
            console.error('❌ Error code:', error.code);
            console.error('❌ Error message:', error.message);
            throw new Error(error.message || 'Error al crear cuenta');
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (error: any) {
            throw new Error(error.message || 'Error al cerrar sesión');
        }
    };

    const resetPassword = async (email: string) => {
        try {
            await sendPasswordResetEmail(auth, email);
        } catch (error: any) {
            throw new Error(error.message || 'Error al enviar email de recuperación');
        }
    };

    const signInWithGoogle = async (credential: AuthCredential) => {
        try {
            console.log('🔑 Attempting Google sign in');
            const userCredential = await signInWithCredential(auth, credential);
            const user = userCredential.user;
            console.log('✅ Google Auth successful:', user.uid);

            // Check if coach profile exists, if not create it
            const docRef = doc(db, 'coaches', user.uid);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                console.log('🆕 Creating new coach profile for Google user');
                const newCoach: Omit<Coach, 'id'> = {
                    email: user.email || '',
                    name: user.displayName || 'Coach',
                    role: 'coach',
                    accountType: 'independent',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    photoUrl: user.photoURL || undefined
                };
                await setDoc(docRef, newCoach);
                console.log('✅ New coach profile saved');
            } else {
                console.log('✅ Coach profile already exists');
            }
        } catch (error: any) {
            console.error('❌ Google sign in error:', error);
            throw new Error(error.message || 'Error al iniciar sesión con Google');
        }
    };

    const value: AuthContextType = {
        user,
        coach,
        loading,
        signIn,
        signUp,
        logout,
        resetPassword,
        signInWithGoogle,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
