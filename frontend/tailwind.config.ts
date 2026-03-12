import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F0F2F7',
        'ink-1': '#141929',
        'ink-2': '#3D4560',
        'ink-3': '#7A839E',
        accent: '#E0185C',
        'accent-dim': '#fce8ef',
        'accent-mid': '#f4a3bc',
        violet: '#6C4EE8',
        'violet-dim': '#ede9fc',
        success: '#0D7A4E',
        'success-dim': '#e6f4ef',
        'success-mid': '#6ec4a0',
        warning: '#A05C00',
        'warning-dim': '#fef3e2',
        'warning-mid': '#f0b754',
        danger: '#C0152E',
        'danger-dim': '#fdecea',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      fontSize: {
        'page-title': ['18px', { fontWeight: '800' }],
        'section-title': ['14.5px', { fontWeight: '800' }],
        'nav-item': ['13px', { fontWeight: '500' }],
        'table-th': ['10.5px', { fontWeight: '700', letterSpacing: '0.9px' }],
        'table-body': ['13.5px', { fontWeight: '400' }],
        badge: ['11px', { fontWeight: '700' }],
        'nav-group': ['9.5px', { fontWeight: '800', letterSpacing: '0.9px' }],
        btn: ['13px', { fontWeight: '700' }],
      },
    },
  },
  plugins: [],
}

export default config
