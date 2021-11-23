// Use Shoelace CSS variables in Tailwind theme for consistency
function makeTheme() {
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

  return {
    colors: {
      ...colors.map(makeColorPalette),
      primary: `var(--primary)`,
      success: `var(--success)`,
      warning: `var(--warning)`,
      danger: `var(--danger)`,
    },
    fontFamily: {
      sans: `var(--sl-font-sans)`,
      serif: `var(--sl-font-serif)`,
    },
    borderRadius: {
      sm: `var(--sl-border-radius-small)`,
      DEFAULT: `var(--sl-border-radius-medium)`,
      md: `var(--sl-border-radius-medium)`,
      lg: `var(--sl-border-radius-large)`,
      xl: `var(--sl-border-radius-x-large)`,
    },
    boxShadow: {
      sm: `var(--sl-shadow-small)`,
      DEFAULT: `var(--sl-shadow-medium)`,
      md: `var(--sl-shadow-medium)`,
      lg: `var(--sl-shadow-large)`,
      xl: `var(--sl-shadow-x-large)`,
    },
  };
}

module.exports = {
  theme: {
    extend: makeTheme(),
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
