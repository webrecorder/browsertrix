// Switch Tailwind colors to use Shoelace CSS variables
// Map color palettes:
const colors = [
  "gray",
  "red",
  "yellow",
  "green",
  "blue",
  "indigo",
  "purple",
  "pink",
];
// Map color grading:
const colorGrades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

const makeColorPalette = (color) =>
  colorGrades.reduce((acc, v) => ({
    ...acc,
    [v]: `var(--sl-color-${color}-${v})`,
  }));

module.exports = {
  theme: {
    extend: {
      colors: colors.map(makeColorPalette),
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
