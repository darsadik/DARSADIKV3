/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#e8f0fb',
          100: '#c5d8f5',
          200: '#a0bfee',  // ← FIXED: this was missing!
          300: '#7aa6e6',
          400: '#4d8bdc',
          500: '#1a5fa8',
          600: '#145090',
          700: '#0d3d6e',
          800: '#0a2d52',
          900: '#071f3a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'sans-serif'],
      }
    }
  },
  plugins: [],
}
