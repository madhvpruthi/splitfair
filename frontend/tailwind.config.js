/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#f5f7ff',
          100: '#ebf0ff',
          200: '#d6e0ff',
          300: '#b3c7ff',
          400: '#85a3ff',
          500: '#5c7aff',
          600: '#3d52f5',
          700: '#2d3ce0',
          800: '#2530b8',
          900: '#232c94',
        },
        dark: {
          50: '#f6f6f9',
          100: '#eef1f6',
          200: '#dbe1ed',
          300: '#bdcbdc',
          400: '#97aec6',
          500: '#7993b0',
          600: '#607897',
          700: '#4e617d',
          800: '#435168',
          900: '#111827', // Deep slate for background
          950: '#030712',
        }
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
