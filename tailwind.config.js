/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['sans-serif'],
      },
      fontSize: {
        '2xs': ['12px', { lineHeight: '16px' }],
        xs: ['14px', { lineHeight: '20px' }],
        sm: ['16px', { lineHeight: '24px' }],
        base: ['18px', { lineHeight: '28px' }],
        lg: ['20px', { lineHeight: '28px' }],
        xl: ['22px', { lineHeight: '30px' }],
        '2xl': ['26px', { lineHeight: '34px' }],
      },
      colors: {
        acrylic: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0ea5e9',
          600: '#0284c7',
        }
      }
    },
  },
  plugins: [],
}
