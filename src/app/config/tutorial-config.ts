import { TutorialModule } from '../models/tutorial.model';

/**
 * Tutorial configurations for all modules
 */
export const TUTORIAL_MODULES: TutorialModule[] = [
    {
        id: 'client-list',
        name: 'Gestión de Clientes',
        description: 'Aprende a gestionar tus clientes',
        steps: [
            {
                title: '¡Bienvenido a la Gestión de Clientes!',
                description: 'Aquí puedes ver todos tus clientes, buscarlos y crear nuevos. Te guiaré paso a paso.',
                targetSelector: '.page-header',
                position: 'bottom',
                action: 'none'
            },
            {
                title: 'Crear un Nuevo Cliente',
                description: 'Haz clic en este botón para agregar un nuevo cliente a tu lista.',
                targetSelector: '[data-tutorial="create-client-btn"]',
                position: 'bottom',
                action: 'click',
                highlightPadding: 8
            },
            {
                title: 'Buscar Clientes',
                description: 'Usa esta barra de búsqueda para encontrar clientes rápidamente por nombre.',
                targetSelector: '[data-tutorial="search-input"]',
                position: 'bottom',
                action: 'none'
            }
        ]
    },
    {
        id: 'routine-wizard',
        name: 'Creación de Rutinas',
        description: 'Aprende a crear rutinas personalizadas',
        steps: [
            {
                title: 'Asistente de Rutinas',
                description: 'Este asistente te guiará para crear una rutina completa paso a paso.',
                targetSelector: '.wizard-container',
                position: 'center',
                action: 'none'
            },
            {
                title: 'Selecciona un Cliente',
                description: 'Primero, elige para qué cliente es esta rutina.',
                targetSelector: '[data-tutorial="client-select"]',
                position: 'bottom',
                action: 'none'
            },
            {
                title: 'Información Básica',
                description: 'Dale un nombre descriptivo a la rutina y establece los objetivos.',
                targetSelector: '[data-tutorial="routine-name"]',
                position: 'bottom',
                action: 'none'
            },
            {
                title: 'Agregar Ejercicios',
                description: 'Aquí puedes buscar y agregar ejercicios a la rutina. Configura series, repeticiones y descansos.',
                targetSelector: '[data-tutorial="exercise-search"]',
                position: 'top',
                action: 'none'
            },
            {
                title: 'Vista Previa',
                description: 'Revisa toda la rutina antes de guardarla. Puedes volver atrás si necesitas hacer cambios.',
                targetSelector: '[data-tutorial="preview-section"]',
                position: 'top',
                action: 'none'
            }
        ]
    },
    {
        id: 'exercise-library',
        name: 'Biblioteca de Ejercicios',
        description: 'Explora y gestiona ejercicios',
        steps: [
            {
                title: 'Biblioteca de Ejercicios',
                description: 'Aquí encontrarás ejercicios globales y podrás crear tus propios ejercicios personalizados.',
                targetSelector: '.page-header',
                position: 'bottom',
                action: 'none'
            },
            {
                title: 'Pestañas de Ejercicios',
                description: 'Cambia entre ejercicios globales (disponibles para todos) y tus ejercicios personalizados.',
                targetSelector: '.tabs',
                position: 'bottom',
                action: 'none'
            },
            {
                title: 'Buscar y Filtrar',
                description: 'Usa la búsqueda y los filtros por grupo muscular para encontrar ejercicios específicos.',
                targetSelector: '.filters-bar',
                position: 'bottom',
                action: 'none'
            },
            {
                title: 'Crear Ejercicio',
                description: 'Crea tus propios ejercicios personalizados con videos e imágenes.',
                targetSelector: '[data-tutorial="create-exercise-btn"]',
                position: 'bottom',
                action: 'click',
                highlightPadding: 8
            }
        ]
    },
    {
        id: 'client-detail',
        name: 'Detalle del Cliente',
        description: 'Gestiona la información del cliente',
        steps: [
            {
                title: 'Vista del Cliente',
                description: 'Aquí puedes ver toda la información de tu cliente: datos personales, mediciones y rutinas.',
                targetSelector: '.client-header',
                position: 'bottom',
                action: 'none'
            },
            {
                title: 'Mediciones',
                description: 'Registra y da seguimiento a las mediciones corporales de tu cliente a lo largo del tiempo.',
                targetSelector: '[data-tutorial="measurements-section"]',
                position: 'top',
                action: 'none'
            },
            {
                title: 'Rutinas Asignadas',
                description: 'Ve todas las rutinas que has creado para este cliente y su progreso.',
                targetSelector: '[data-tutorial="routines-section"]',
                position: 'top',
                action: 'none'
            },
            {
                title: 'Acciones',
                description: 'Edita la información del cliente o elimínalo si ya no lo necesitas.',
                targetSelector: '[data-tutorial="client-actions"]',
                position: 'left',
                action: 'none'
            }
        ]
    }
];

/**
 * Get tutorial module by ID
 */
export function getTutorialModule(moduleId: string): TutorialModule | undefined {
    return TUTORIAL_MODULES.find(m => m.id === moduleId);
}
