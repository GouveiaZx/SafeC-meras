/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        primary: {
          50: '#f8f7f5',
          100: '#f0eeea',
          200: '#e1ddd4',
          300: '#cfc7b8',
          400: '#b4ac9c',
          500: '#a39889',
          600: '#958a7a',
          700: '#7d7366',
          800: '#675f56',
          900: '#544e47',
          950: '#2c2823',
        },
      },
    },
  },
  plugins: [],
};
