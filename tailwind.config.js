/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        'surface-hover': 'var(--bg-surface-hover)',
        inverted: 'var(--bg-inverted)',
        'inverted-hover': 'var(--bg-inverted-hover)',
        fg: {
          DEFAULT: 'var(--fg-primary)',
          secondary: 'var(--fg-secondary)',
          muted: 'var(--fg-muted)',
          inverted: 'var(--fg-inverted)',
        },
        line: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
        },
        scrim: 'var(--scrim)',
        status: {
          'success-fg': 'var(--status-success-fg)',
          'success-bg': 'var(--status-success-bg)',
          'success-border': 'var(--status-success-border)',
          'warning-fg': 'var(--status-warning-fg)',
          'warning-bg': 'var(--status-warning-bg)',
          'warning-border': 'var(--status-warning-border)',
          'danger-fg': 'var(--status-danger-fg)',
          'danger-bg': 'var(--status-danger-bg)',
          'danger-border': 'var(--status-danger-border)',
          'info-fg': 'var(--status-info-fg)',
          'info-bg': 'var(--status-info-bg)',
          'info-border': 'var(--status-info-border)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        none: '0px',
        sm: '0px',
        DEFAULT: '0px',
        md: '0px',
        lg: '0px',
        xl: '0px',
        '2xl': '0px',
        '3xl': '0px',
      },
      boxShadow: {
        sm: 'none',
        DEFAULT: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
        inner: 'none',
        none: 'none',
      },
      transitionTimingFunction: {
        crisp: 'var(--ease-crisp)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
      },
    },
  },
  plugins: [],
}
