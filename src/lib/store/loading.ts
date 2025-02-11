/**
 * Loading State Store
 * 
 * This module provides a Svelte store to manage loading states across different parts of the application.
 * It includes stores for initial loading, article loading, and language loading states.
 */

import { writable, derived } from 'svelte/store';

interface LoadingState {
    isLoading: boolean;
    message: string | null;
}

/**
 * Creates a loading store with initial state.
 */
function createLoadingStore(initialState: boolean = false) {
    const { subscribe, set, update } = writable<LoadingState>({
        isLoading: initialState,
        message: null
    });

    return {
        subscribe,
        set: (isLoading: boolean, message?: string) => 
            set({ isLoading, message: message || null }),
        reset: () => set({ isLoading: false, message: null }),
        update
    };
}

export const initialLoading = createLoadingStore(true);
export const articleLoading = createLoadingStore(false);
export const languageLoading = createLoadingStore(false);

/**
 * Derived store to check if any loading state is active.
 */
export const isLoading = derived(
    [initialLoading, articleLoading, languageLoading],
    ([$initial, $article, $language]) => 
        $initial.isLoading || $article.isLoading || $language.isLoading
);

/**
 * Sets the loading state for a specific type.
 */
export function setLoading(type: 'initial' | 'article' | 'language', isLoading: boolean, message?: string) {
    const store = {
        initial: initialLoading,
        article: articleLoading,
        language: languageLoading
    }[type];

    store.set(isLoading, message);
}
