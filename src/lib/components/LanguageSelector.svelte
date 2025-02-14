<script lang="ts">
    import { language } from "$lib/store/language";
    import { setStoredLanguage } from "$lib/storage/utils";
    import type { SupportedLanguage } from "$lib/types";
    import { LANGUAGE_CONFIG } from "$lib/types";
    import { onMount } from "svelte";
    import { X } from 'lucide-svelte';  // Add Lucide import

    export let isOpen = false;
    export let onClose: () => void;
    // svelte-ignore export_let_unused
    export let onSelect: (lang: SupportedLanguage) => Promise<void>;

    let loading = true;
    let error: string | null = null;

    async function selectLanguage(code: SupportedLanguage) {
        try {
            loading = true;
            await language.set(code);
            onClose();
        } catch (err) {
            error = "Failed to change language. Please try again.";
            console.error("Language change error:", err);
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        loading = false;
    });
</script>

<div
    class="fixed inset-0 z-[100] bg-black/90 transition-opacity"
    class:opacity-0={!isOpen}
    class:pointer-events-none={!isOpen}
>
    <div class="fixed top-4 right-4 flex gap-4 items-center z-[101]">
        <span class="text-white text-lg font-medium">
            {#if loading}Loading...
            {:else if error}{error}
            {:else}Select Language
            {/if}
        </span>
        <button
            class="p-2 rounded-full bg-white/10 hover:bg-white/20"
            on:click={onClose}
            disabled={loading}
            aria-label="Close language selector"
        >
            <X class="w-6 h-6" />
        </button>
    </div>

    <div class="h-screen pt-20 px-4 flex items-center justify-center">
        <div
            class="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 gap-4 max-w-2xl"
        >
            {#each LANGUAGE_CONFIG as { code, name, flag }}
                <button
                    class="aspect-square rounded-2xl transition-all hover:scale-105 bg-white/10 hover:bg-white/20 flex flex-col items-center justify-center gap-2"
                    class:ring-2={$language === code}
                    class:ring-white={$language === code}
                    disabled={loading}
                    on:click={() => selectLanguage(code)}
                >
                    <span class="text-3xl">{flag}</span>
                    <span class="text-xs text-white/90">{name}</span>
                </button>
            {/each}
        </div>
    </div>

    {#if error}
        <div
            class="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-4 py-2 rounded-lg"
        >
            {error}
        </div>
    {/if}
</div>
