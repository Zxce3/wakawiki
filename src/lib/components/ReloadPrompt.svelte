<script lang="ts">
    import { useRegisterSW } from 'virtual:pwa-register/svelte';
    
    const {
        needRefresh,
        updateServiceWorker,
        offlineReady
    } = useRegisterSW({
        onRegistered(r: any) {
            console.log(`SW Registered: ${r}`);
        },
        onRegisterError(error: any) {
            console.error('SW registration error:', error);
        },
    });

    const close = () => {
        offlineReady.set(false);
        needRefresh.set(false);
    };

    $: toast = $offlineReady || $needRefresh;
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
                    class="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                    on:click={() => updateServiceWorker(true)}>
                    Reload
                </button>
            {/if}
            <button 
                class="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                on:click={close}>
                Close
            </button>
        </div>
    </div>
{/if}
