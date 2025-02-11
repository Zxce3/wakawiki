/**
 * Language Store
 * 
 * This module provides a Svelte store to manage the application's language setting.
 * It includes functionality to persist the language setting across sessions.
 */

import { writable } from 'svelte/store';
import type { SupportedLanguage } from '../types';
import { getStoredLanguage, setStoredLanguage } from '../storage/utils';

/**
 * Creates a language store with persistence.
 */
function createLanguageStore() {
    const { subscribe, set, update } = writable<SupportedLanguage>('en');
    
    return {
        subscribe,
        set: (lang: SupportedLanguage) => {
            set(lang);
            if (typeof window !== 'undefined') {
                setStoredLanguage(lang);
            }
        },
        update
    };
}

export const language = createLanguageStore();

/**
 * Sets the initial language for the application.
 */
export function setInitialLanguage(lang: SupportedLanguage) {
    language.set(lang);
}
