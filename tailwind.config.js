/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#e8f0fb',
          100: '#c5d8f5',
          500: '#1a5fa8',
          600: '#145090',
          700: '#0d3d6e',
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
