module.exports = {
  mode: 'jit',
  
  purge: {
    content: ['./*.html', './src/*.js'],
    options: {
      safelist: [
        /data-theme$/,
      ]
    },
  },
  plugins: [
    require('daisyui')
  ],
  extract: {
    include: ['./src/*.js'],
  },
};
