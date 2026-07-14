import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        background: '#10131a',
        surface: '#151820',
        'surface-low': '#191c22',
        'surface-high': '#222631',
        'surface-bright': '#32353c',
        outline: '#4c4355',
        muted: '#cec2d8',
        primary: '#d8b9ff',
        'primary-strong': '#9945ff',
        secondary: '#a0ffc3',
        tertiary: '#00e290',
        cyan: '#65d9ff',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular'],
      },
      maxWidth: {
        app: '1280px',
      },
      boxShadow: {
        glow: '0 0 28px rgba(216, 185, 255, 0.08)',
        green: '0 0 28px rgba(0, 226, 144, 0.12)',
      },
    },
  },
  plugins: [],
} satisfies Config
