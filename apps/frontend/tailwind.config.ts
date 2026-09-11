import { type Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class', // 'media' or 'class' (media uses system settings, class uses .dark{} in globals.css)
  theme: {
    extend: {
      fontFamily: {
        montserratHeading: ['var(--font-montserratHeading)'],
        montserratParagraph: ['var(--font-montserratParagraph)'],
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--accordion-panel-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--accordion-panel-height)',
          },
          to: {
            height: '0',
          },
        },
        'caret-blink': {
          '0%,70%,100%': {
            opacity: '1',
          },
          '20%,50%': {
            opacity: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'caret-blink': 'caret-blink 1.25s ease-out infinite',
      },
      transitionDuration: {
        '350': '350ms',
      },
      transitionTimingFunction: {
        base: 'ease',
        emphasized: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      colors: {
        // Using HSL variables defined in @layer base for Tailwind classes
        // These work alongside the existing hex variables used by inline styles
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        'ring-offset-background': 'hsl(var(--ring-offset-background))',
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  plugins: [
    require('tailwindcss-animate'),
    // Backports v4's built-in container queries to Tailwind 3.x, so the
    // regenerated shadcn components can keep using `@container/<name>` and
    // `@<size>/<name>:` variants (see field.tsx) instead of viewport breakpoints.
    require('@tailwindcss/container-queries'),
  ],
} satisfies Config
