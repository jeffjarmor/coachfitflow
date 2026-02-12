import 'react-native-get-random-values';
import { Platform, LogBox } from 'react-native';

// Use react-native-url-polyfill to fix network issues on iOS/Android
import 'react-native-url-polyfill/auto';

// Ignore specific warnings
LogBox.ignoreLogs([
    'AsyncStorage has been extracted from react-native',
    'You are initializing Firebase Auth',
    'Non-serializable values were found in the navigation state',
]);
