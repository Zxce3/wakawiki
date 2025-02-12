<script lang="ts">
    import { fade } from "svelte/transition";
    import { SHARE_OPTIONS, shareArticle } from "$lib/config/share";
    import type { WikiArticle } from "$lib/types";

    export let article: WikiArticle;
    export let isOpen = false;
    export let onClose: () => void;
    let toast = false;

    function handleShare(optionId: string) {
        const option = SHARE_OPTIONS.find((opt) => opt.id === optionId);
        if (!option) return;

        shareArticle(option, article.title, article.url);
        if (optionId === "copy") {
            toast = true;
            setTimeout(() => {
                toast = false;
            }, 2000);
        }
        onClose();
    }


    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            onClose();
        }
    }

    function handleModalClose(event: Event) {
        const target = event.target as HTMLElement;
        // Check if click is on the overlay by checking the data attribute
        if (target.hasAttribute("data-overlay")) {
            onClose();
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />
{#if toast}
    <div
        transition:fade={{ duration: 200 }}
        class="fixed bottom-4 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg z-[400]"
    >
        Link copied!
    </div>
{/if}
{#if isOpen}
    <div class="fixed inset-0 z-[300]" transition:fade={{ duration: 200 }}>
        <!-- Clickable overlay - using button for accessibility -->
        <button
            class="absolute inset-0 w-full h-full bg-black/80 backdrop-blur-sm"
            on:click={handleModalClose}
            data-overlay
            aria-label="Close share dialog"
        ></button>

        <!-- Dialog content -->
        <dialog
            class="relative z-10 bg-neutral-900 rounded-xl w-full max-w-sm mx-auto mt-[20vh] overflow-hidden"
            aria-modal="true"
            aria-labelledby="share-title"
            open
        >
            <!-- Header -->
            <header
                class="flex justify-between items-center p-4 border-b border-white/10"
            >
                <h3 id="share-title" class="text-lg font-medium text-white">
                    Share Article
                </h3>
                <button
                    class="p-2 rounded-full hover:bg-white/10 transition-colors"
                    on:click={onClose}
                    aria-label="Close share dialog"
                >
                    <svg class="w-5 h-5 text-white" viewBox="0 0 24 24">
                        <path
                            stroke="currentColor"
                            stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            </header>

            <!-- Share options grid -->
            <div class="p-4 grid grid-cols-4 gap-4">
                {#each SHARE_OPTIONS as option}
                    <button
                        class="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-white/5 transition-colors"
                        on:click={() => handleShare(option.id)}
                        aria-label={`Share on ${option.name}`}
                    >
                        <div
                            class="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center"
                        >
                            <svg
                                class="w-6 h-6 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d={option.icon}
                                />
                            </svg>
                        </div>
                        <span class="text-sm text-white/90">{option.name}</span>
                    </button>
                {/each}
            </div>
        </dialog>
    </div>
{/if}

<style>
    dialog {
        border: none;
        background: transparent;
        padding: 0;
    }

    dialog::backdrop {
        display: none;
    }
</style>
