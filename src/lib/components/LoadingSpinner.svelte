<!-- 
    This Svelte component displays a loading spinner with optional text.
    It can be configured to be fullscreen, overlay, or within a specific container.
    The spinner rotates and shows progress visually.
-->

<script lang="ts">
    import { onMount } from 'svelte';
    import { initialLoading } from '../store/loading';
    
    export let fullscreen = true; // Determines if the spinner covers the entire screen
    export let size: 'sm' | 'md' | 'lg' = 'lg'; // Size of the spinner
    export let message: string | null = null; // Optional loading message
    export let overlay = false; // Determines if the spinner has an overlay background
    export let show = true; // Controls the visibility of the spinner
    export let position: 'center' | 'top' | 'bottom' = 'center'; // Position of the spinner
    export let ariaLabel = 'Loading content'; // Accessibility label
    
    let progress = 0; // Progress percentage
    let rotation = 0; // Rotation angle for the spinner

    // onMount lifecycle function to start the progress and rotation animation
    onMount(() => {
        const interval = setInterval(() => {
            progress = Math.min(progress + 1, 100); // Increment progress
            rotation += 6; // Increment rotation
        }, 50);

        return () => clearInterval(interval); // Cleanup interval on component unmount
    });

    // Reactive statement to set the dimensions based on the size prop
    $: dimensions = {
        sm: 'w-16 h-16',
        md: 'w-24 h-24',
        lg: 'w-32 h-32'
    }[size];

    // Reactive statement to set the display message
    $: displayMessage = message || $initialLoading.message || 'Loading';

    // Reactive statement to set the position classes based on the position prop
    $: positionClasses = {
        center: 'items-center justify-center',
        top: 'items-start pt-4 justify-center',
        bottom: 'items-end pb-4 justify-center'
    }[position];

    // Reactive statement to set the container classes based on various props
    $: containerClasses = `
        flex ${positionClasses}
        ${fullscreen ? 'fixed inset-0 bg-black' : 'w-full h-full'}
        ${overlay ? 'bg-black/50 backdrop-blur-sm' : ''}
        ${fullscreen || overlay ? 'z-50' : ''}
    `;
</script>

{#if show}
<div 
    class={containerClasses}
    role="progressbar"
    aria-label={ariaLabel}
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={progress}
>
    <div class={`relative ${dimensions}`}>
        <!-- Rotating W with pulsing effect -->
        <div 
            class="absolute inset-0 flex items-center justify-center"
            style="transform: rotate({rotation}deg)"
        >
            <span class="text-6xl font-bold text-white opacity-90 transform-gpu animate-pulse">
                W
            </span>
        </div>
        
        <!-- Outer ring with gradient -->
        <svg 
            class="absolute inset-0 w-full h-full rotate-[-90deg]" 
            viewBox="0 0 100 100"
        >
            <!-- Gradient definition -->
            <defs>
                <linearGradient id="spinnerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.2" />
                    <stop offset="50%" style="stop-color:#ffffff;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0.2" />
                </linearGradient>
            </defs>

            <!-- Background circle with subtle glow -->
            <circle 
                class="text-white/5 filter blur-[1px]"
                cx="50" cy="50" r="45" 
                fill="none" 
                stroke="currentColor" 
                stroke-width="4"
            />

            <!-- Animated progress circle -->
            <circle 
                cx="50" cy="50" r="45" 
                fill="none" 
                stroke="url(#spinnerGradient)" 
                stroke-width="4"
                stroke-linecap="round"
                stroke-dasharray="283"
                stroke-dashoffset={283 - (283 * progress) / 100}
                class="transition-all duration-300 animate-pulse"
            >
                <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 50 50"
                    to="360 50 50"
                    dur="2s"
                    repeatCount="indefinite"
                />
            </circle>

            <!-- Loading dots -->
            <g class="loading-dots">
                {#each Array(3) as _, i}
                    <circle
                        cx={50 + Math.cos(2 * Math.PI * i / 3) * 45}
                        cy={50 + Math.sin(2 * Math.PI * i / 3) * 45}
                        r="3"
                        fill="white"
                        class="animate-pulse"
                        style="animation-delay: {i * 200}ms" 
                    />
                {/each}
            </g>
        </svg>

        <!-- Optional loading text -->
        {#if displayMessage}
            <div 
                class="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap"
                aria-live="polite"
            >
                <span class="text-white/70 text-sm font-medium tracking-wider">
                    {displayMessage}
                    <span class="dots">
                        {#each Array(3) as _, i}
                            <span style="animation-delay: {i * 200}ms">.</span> <!-- Delay animation for each dot -->
                        {/each}
                    </span>
                </span>
            </div>
        {/if}
    </div>
</div>
{/if}

<style>
    @keyframes dot {
        0%, 20% { opacity: 0; }
        50% { opacity: 1; }
        100% { opacity: 0; }
    }

    .dots span {
        animation: dot 1.4s infinite;
        opacity: 0;
        display: inline-block;
    }

    .loading-dots circle {
        animation: dot 1.4s infinite;
    }

    svg circle {
        filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.3));
    }
</style>
