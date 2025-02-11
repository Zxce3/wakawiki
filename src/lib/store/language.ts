/**
 * Language Store
 * 
 * This module provides a Svelte store to manage the application's language setting.
 * It includes functionality to persist the language setting across sessions.
 */

import { writable } from 'svelte/store';
import type { SupportedLanguage } from '../types';
import { getBrowserLanguage, getStoredLanguage, setStoredLanguage } from '../storage/utils';
import { browser } from '$app/environment';

const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

/**
 * Creates a language store with persistence.
 */
function createLanguageStore() {
    const { subscribe, set, update } = writable<SupportedLanguage>(DEFAULT_LANGUAGE);
    
    async function initializeLanguage() {
        if (browser) {
            const storedLang = await getStoredLanguage();
            if (storedLang) {
                set(storedLang);
                return storedLang;
            }
            const browserLang = getBrowserLanguage() as SupportedLanguage;
            if (browserLang) {
                set(browserLang);
                await setStoredLanguage(browserLang);
                return browserLang;
            }
        }
        return DEFAULT_LANGUAGE;
    }
    
    return {
        subscribe,
        set: async (lang: SupportedLanguage) => {
            set(lang);
            if (browser) {
                await setStoredLanguage(lang);
            }
        },
        update,
        initialize: initializeLanguage
    };
}

export const language = createLanguageStore();

// Initialize language immediately
if (browser) {
    language.initialize();
}

/**
 * Sets the initial language for the application.
 */
export async function setInitialLanguage(lang: SupportedLanguage) {
    language.set(lang);
    await setStoredLanguage(lang);
}
