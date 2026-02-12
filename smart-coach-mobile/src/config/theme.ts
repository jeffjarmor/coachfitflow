export const theme = {
    colors: {
        primary: '#1e88e5', // $primary-600 from web
        secondary: '#d81b60', // $secondary-600 from web
        text: '#212121', // $neutral-900
        textSecondary: '#757575', // $neutral-600
        textTertiary: '#9e9e9e', // $neutral-500
        surface: '#ffffff', // $bg-primary
        background: '#fafafa', // $bg-secondary
        accent: '#1976d2', // $primary-700
        error: '#f44336', // $error
        success: '#4caf50', // $success
        border: '#e0e0e0', // Added for consistency
    },
    spacing: {
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32,
        xxl: 40
    },
    fontSize: {
        xs: 12,
        sm: 14,
        md: 16,
        base: 16,
        lg: 18,
        xl: 20,
        xxl: 24,
        xxxl: 32
    },
    borderRadius: {
        sm: 4,
        md: 8,
        lg: 16,
        xl: 24,
        full: 9999
    },
    fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700'
    },
    shadows: {
        sm: {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.18,
            shadowRadius: 1.00,
            elevation: 1,
        },
        md: {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            elevation: 5,
        },
        lg: {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 5 },
            shadowOpacity: 0.34,
            shadowRadius: 6.27,
            elevation: 10,
        }
    }
} as const;
