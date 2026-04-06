/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./*.html", // Скануватиме файли типу upload-page.html в корені
    "./public/**/*.html", // Скануватиме всі HTML-файли в папці public
    "./public/**/*.js",   // Скануватиме всі JS-файли в папці public
  ],
  theme: {
    extend: {},
  },
  plugins: [require('daisyui')],
}
