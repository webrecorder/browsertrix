// Switch Tailwind colors to use Shoelace CSS variables
const colorGrades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const blue = colorGrades.reduce((acc, v) => ({
  ...acc,
  [v]: `var(--sl-color-blue-${v})`,
}));

module.exports = {
  theme: {
    extend: {
      colors: {
        blue,
      },
    },
  },

  mode: "jit",

  purge: {
    content: ["./**/*.html", "./src/**/*.{ts,js}"],
    options: {
      safelist: [/data-theme$/],
    },
  },

  extract: {
    include: ["./src/**/*.{ts,js}"],
  },
};
