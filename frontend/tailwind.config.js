/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07080d',
          900: '#0b0d14',
          850: '#11141c',
          800: '#1a1e28',
          700: '#252b3a',
          600: '#343c50',
        },
        text: {
          primary: '#eef0f5',
          secondary: '#a3a9b8',
          muted: '#7a8296',
        },
        accent: {
          DEFAULT: '#f59e0b',
          muted: '#b45309',
        },
        semantic: {
          positive: '#4cc38a',
          negative: '#e5484d',
          warning: '#f59e0b',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Geist Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
