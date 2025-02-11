import containerQueries from '@tailwindcss/container-queries';
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      containers: {
        'xs': '320px',
        'sm': '400px',
        'md': '480px',
        'lg': '560px',
        'xl': '640px',
      }
    }
  },
  plugins: [
    typography, 
    forms, 
    containerQueries,
    function({ addUtilities }) {
      addUtilities({
        '.backdrop-blur': {
          'backdrop-filter': 'blur(8px)',
        }
      })
    }
  ]
} satisfies Config;
