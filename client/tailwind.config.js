export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      colors: {
        ink: '#0a0a0b',
        mist: '#f6f7f9',
        line: '#e7e9ee',
        blueSoft: '#dbeafe',
        blueAction: '#2563eb'
      },
      boxShadow: {
        soft: '0 16px 45px rgba(15, 23, 42, 0.08)'
      }
    }
  },
  plugins: []
};
