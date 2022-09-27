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
    // https://github.com/tailwindlabs/tailwindcss/blob/52ab3154392ba3d7a05cae643694384e72dc24b2/stubs/defaultConfig.stub.js
    colors: {
      current: "currentColor",
      ...colors.map(makeColorPalette),
      primary: `var(--primary)`,
      success: `var(--success)`,
      warning: `var(--warning)`,
      danger: `var(--danger)`,
    },
    fontFamily: {
      sans: `var(--sl-font-sans)`,
      serif: `var(--sl-font-serif)`,
      mono: `var(--sl-font-mono)`,
    },
    fontSize: {
      xs: ["var(--sl-font-size-x-small)", { lineHeight: "1.33" }],
      sm: ["var(--sl-font-size-small)", { lineHeight: "1.25rem" }],
      base: ["var(--sl-font-size-medium)", { lineHeight: "1.5" }],
      lg: ["var(--sl-font-size-large)", { lineHeight: "1.6" }],
      xl: ["var(--sl-font-size-x-large)", { lineHeight: "1.5" }],
      "2xl": ["var(--sl-font-size-2x-large)", { lineHeight: "1.5" }],
      "3xl": ["var(--sl-font-size-3x-large)", { lineHeight: "1" }],
      "4xl": ["var(--sl-font-size-4x-large)", { lineHeight: "1" }],
    },
    fontWeight: {
      light: "var(--sl-font-weight-light)",
      normal: "var(--sl-font-weight-normal)",
      medium: "var(--sl-font-weight-medium)",
      semibold: "var(--sl-font-weight-semibold)",
      bold: "var(--sl-font-weight-bold)",
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
    aspectRatio: {
      "4/3": "4 / 3", // For Browsertrix watch/replay
    },
  };
}

module.exports = {
  theme: {
    extend: makeTheme(),
  },

  content: ["./**/*.html", "./src/**/*.{ts,js,ejs}"],

  extract: {
    include: ["./src/**/*.{ts,js}"],
  },
};
