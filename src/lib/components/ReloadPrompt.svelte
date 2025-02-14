<script lang="ts">
    import { browser } from "$app/environment";
    import { useRegisterSW } from "virtual:pwa-register/svelte";
    import { RefreshCw, X } from 'lucide-svelte';  // Add Lucide imports

    import { type Writable } from 'svelte/store';
    
    let needRefresh: Writable<boolean>;
    let offlineReady: Writable<boolean>;
    let updateServiceWorker = (p0?: boolean) => {};

    if (browser) {
        const { needRefresh: _needRefresh, 
                offlineReady: _offlineReady, 
                updateServiceWorker: _updateServiceWorker } = useRegisterSW({
            onRegistered(r) {
                console.log("SW Registered");
            },
            onRegisterError(error) {
                console.log("SW registration error", error);
            },
        });

        needRefresh = _needRefresh;
        offlineReady = _offlineReady;
        updateServiceWorker = _updateServiceWorker;
    }

    $: toast = $offlineReady || $needRefresh;

    function close() {
        offlineReady.set(false);
        needRefresh.set(false);
    }
</script>

{#if toast}
    <div class="fixed bottom-4 right-4 z-[180] px-4 py-3 bg-black/40 backdrop-blur-sm rounded-full text-white/90 text-sm font-medium flex items-center gap-4">
        <span>
            {#if $offlineReady}
                App ready to work offline
            {:else}
                New content available
            {/if}
        </span>
        
        <div class="flex items-center gap-2">
            {#if $needRefresh}
                <button 
                    class="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors inline-flex items-center gap-2"
                    on:click={() => updateServiceWorker(true)}
                >
                    <RefreshCw class="w-4 h-4" />
                    <span>Reload</span>
                </button>
            {/if}
            <button 
                class="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors inline-flex items-center gap-2"
                on:click={close}
            >
                <X class="w-4 h-4" />
                <span>Close</span>
            </button>
        </div>
    </div>
{/if}
