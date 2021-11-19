module.exports = {
  mode: "jit",

  purge: {
    content: ["./**/*.html", "./src/**/*.{ts,js}"],
    options: {
      safelist: [/data-theme$/],
    },
  },
  plugins: [require("daisyui")],
  extract: {
    include: ["./src/**/*.{ts,js}"],
  },
};
