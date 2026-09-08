/**
 * Общий Tailwind-пресет Remora.
 * Цвета заданы через CSS-переменные (см. packages/ui/src/styles/tokens.css),
 * чтобы светлая и тёмная темы переключались без пересборки классов.
 */

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Поверхности
        bg: 'rgb(var(--rm-bg) / <alpha-value>)',
        surface: 'rgb(var(--rm-surface) / <alpha-value>)',
        'surface-muted': 'rgb(var(--rm-surface-muted) / <alpha-value>)',
        border: 'rgb(var(--rm-border) / <alpha-value>)',

        // Текст
        fg: 'rgb(var(--rm-fg) / <alpha-value>)',
        'fg-muted': 'rgb(var(--rm-fg-muted) / <alpha-value>)',
        'fg-subtle': 'rgb(var(--rm-fg-subtle) / <alpha-value>)',

        // Бренд
        primary: {
          DEFAULT: 'rgb(var(--rm-primary) / <alpha-value>)',
          hover: 'rgb(var(--rm-primary-hover) / <alpha-value>)',
          fg: 'rgb(var(--rm-primary-fg) / <alpha-value>)',
          subtle: 'rgb(var(--rm-primary-subtle) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--rm-accent) / <alpha-value>)',
          fg: 'rgb(var(--rm-accent-fg) / <alpha-value>)',
          subtle: 'rgb(var(--rm-accent-subtle) / <alpha-value>)',
        },

        // Семантика (в т.ч. состояния карточек в тренировке)
        success: {
          DEFAULT: 'rgb(var(--rm-success) / <alpha-value>)',
          subtle: 'rgb(var(--rm-success-subtle) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--rm-warning) / <alpha-value>)',
          subtle: 'rgb(var(--rm-warning-subtle) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--rm-danger) / <alpha-value>)',
          subtle: 'rgb(var(--rm-danger-subtle) / <alpha-value>)',
        },
      },
      borderRadius: {
        sm: '0.375rem',
        DEFAULT: '0.5rem',
        md: '0.625rem',
        lg: '0.875rem',
        xl: '1.125rem',
        '2xl': '1.5rem',
      },
      fontFamily: {
        sans: ['var(--rm-font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--rm-font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Шкала интерфейса
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.375rem', { lineHeight: '1.875rem' }],
        '2xl': ['1.75rem', { lineHeight: '2.125rem' }],
        '3xl': ['2.25rem', { lineHeight: '2.5rem' }],
        // Текст на карточке в тренировке — отдельная шкала, она крупнее интерфейсной
        'card-sm': ['1.5rem', { lineHeight: '2rem' }],
        'card-md': ['2rem', { lineHeight: '2.5rem' }],
        'card-lg': ['2.75rem', { lineHeight: '3.25rem' }],
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.04), 0 4px 16px rgb(0 0 0 / 0.06)',
        'card-hover': '0 2px 4px rgb(0 0 0 / 0.06), 0 8px 28px rgb(0 0 0 / 0.10)',
        pop: '0 8px 32px rgb(0 0 0 / 0.16)',
      },
      transitionDuration: {
        fast: '120ms',
        DEFAULT: '180ms',
      },
      keyframes: {
        'flip-in': {
          '0%': { transform: 'rotateX(-90deg)', opacity: '0' },
          '100%': { transform: 'rotateX(0deg)', opacity: '1' },
        },
      },
      animation: {
        'flip-in': 'flip-in 180ms ease-out',
      },
    },
  },
  plugins: [],
};
