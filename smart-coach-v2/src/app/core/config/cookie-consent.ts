import * as CookieConsent from 'vanilla-cookieconsent';

const optionalCategories: Record<string, {
  title: string;
  description: string;
  settings: CookieConsent.Category;
}> = {
  functional: {
    title: 'Funciones opcionales',
    description: 'Habilitan funciones adicionales ofrecidas por servicios externos.',
    settings: {}
  },
  analytics: {
    title: 'Analítica',
    description: 'Permite medir el uso de la plataforma para identificar mejoras.',
    settings: {}
  },
  marketing: {
    title: 'Marketing',
    description: 'Permite medir campañas y mostrar publicidad.',
    settings: {}
  }
};

export function startCookieConsent(): Promise<void> {
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[type="text/plain"][data-category]');
  const configuredCategories = new Set(Array.from(scripts, script => script.dataset['category']));
  const enabledOptions = Object.entries(optionalCategories).filter(([key]) => configuredCategories.has(key));
  const hasOptionalScripts = enabledOptions.length > 0;
  const choiceButtons = hasOptionalScripts
    ? { acceptAllBtn: 'Aceptar todas', acceptNecessaryBtn: 'Solo necesarias' }
    : {};

  return CookieConsent.run({
    mode: 'opt-in',
    revision: 1,
    manageScriptTags: true,
    disablePageInteraction: false,
    cookie: {
      name: 'zummith_cookie_preferences',
      domain: '',
      expiresAfterDays: 182
    },
    categories: {
      necessary: { enabled: true, readOnly: true },
      ...Object.fromEntries(enabledOptions.map(([key, category]) => [key, category.settings]))
    },
    language: {
      default: 'es',
      translations: {
        es: {
          consentModal: {
            title: 'Cookies y almacenamiento',
            description: hasOptionalScripts
              ? 'Usamos almacenamiento para mantener tu sesión y guardar tu elección. Podés elegir qué servicios opcionales permitir.'
              : 'Usamos almacenamiento para mantener tu sesión, recordar preferencias y recuperar borradores.',
            ...choiceButtons,
            acceptAllBtn: choiceButtons.acceptAllBtn ?? 'Entendido',
            showPreferencesBtn: 'Configurar preferencias',
            footer: '<a href="/privacidad#cookies">Ver información sobre cookies</a>'
          },
          preferencesModal: {
            title: 'Preferencias de cookies',
            closeIconLabel: 'Cerrar preferencias',
            serviceCounterLabel: 'Servicios',
            ...choiceButtons,
            savePreferencesBtn: hasOptionalScripts ? 'Guardar selección' : 'Entendido',
            sections: [
              {
                title: 'Necesarias',
                description: 'Mantienen tu sesión, recuerdan preferencias del espacio de trabajo y guardan tu elección sobre cookies.',
                linkedCategory: 'necessary'
              },
              ...enabledOptions.map(([key, { title, description }]) => ({ title, description, linkedCategory: key })),
              {
                description: 'Podés cambiar tu elección desde el pie de página. <a href="/privacidad#cookies">Más información sobre cookies</a>.'
              }
            ]
          }
        }
      }
    },
    onChange: ({ changedCategories, changedServices }) => {
      const categoryRevoked = changedCategories.some(category => !CookieConsent.acceptedCategory(category));
      const serviceRevoked = Object.entries(changedServices).some(([category, services]) =>
        services.some(service => !CookieConsent.acceptedService(service, category))
      );

      // A reload stops code that was already running with the previous consent.
      if (categoryRevoked || serviceRevoked) window.location.reload();
    }
  });
}
