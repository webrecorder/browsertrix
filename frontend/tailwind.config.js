import theme from "@webrecorder/hickory/tokens/tailwind";
import { tailwindTransform } from "postcss-lit";

import attributes from "./config/tailwind/plugins/attributes";
import containPlugin from "./config/tailwind/plugins/contain";
import contentVisibilityPlugin from "./config/tailwind/plugins/content-visibility";
import cssPartsPlugin from "./config/tailwind/plugins/parts";

/**
 * Merge Shoelace and hickory themes
 *
 * @returns {import('tailwindcss').Config['theme']}
 */
function makeTheme() {
  // Map color grading:
  const colorGrades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

  /**
   * @param {string} color
   * @returns {Record<string, string>}
   */
  const shoelaceColorPalette = (color) =>
    colorGrades.reduce(
      /**
       * @param {Record<string, string>} acc
       * @param {number} v
       * @returns
       */
      (acc, v) => ({
        ...acc,
        [v]: `var(--sl-color-${color}-${v})`,
      }),
      {},
    );

  return {
    // https://github.com/tailwindlabs/tailwindcss/blob/52ab3154392ba3d7a05cae643694384e72dc24b2/stubs/defaultConfig.stub.js
    colors: {
      current: "currentColor",
      ...theme.colors,
      primary: {
        ...theme.colors.cyan,
        DEFAULT: theme.colors.cyan[500],
      },
      brand: theme.colors.brand,
      success: {
        ...shoelaceColorPalette("success"),
        DEFAULT: `var(--success)`,
      },
      warning: {
        ...shoelaceColorPalette("warning"),
        DEFAULT: `var(--warning)`,
      },
      danger: {
        ...shoelaceColorPalette("danger"),
        DEFAULT: `var(--danger)`,
      },
      neutral: {
        ...shoelaceColorPalette("neutral"),
        // Shoelace supports additional neutral variables:
        0: `var(--sl-color-neutral-0)`,
        950: `var(--sl-color-neutral-950)`,
        1000: `var(--sl-color-neutral-1000)`,
      },
    },
    borderColor: {
      DEFAULT: `var(--sl-panel-border-color)`,
    },
    fontFamily: {
      sans: `var(--sl-font-sans)`,
      serif: `var(--sl-font-serif)`,
      mono: `var(--sl-font-mono)`,
    },
    fontSize: {
      xs: ["var(--sl-font-size-x-small)", { lineHeight: "1.33" }],
      sm: ["var(--sl-font-size-small)", { lineHeight: "1.25rem" }],
      // base: ["var(--sl-font-size-medium)", { lineHeight: "1.5" }],
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
    // TODO see if there's a way to use Shoelace's box shadows with customizable colors
    // boxShadow: {
    //   sm: `var(--sl-shadow-small)`,
    //   DEFAULT: `var(--sl-shadow-medium)`,
    //   md: `var(--sl-shadow-medium)`,
    //   lg: `var(--sl-shadow-large)`,
    //   xl: `var(--sl-shadow-x-large)`,
    // },
    aspectRatio: {
      "4/3": "4 / 3", // For Browsertrix watch/replay
    },
    gridTemplateColumns: {
      13: "repeat(13, minmax(0, 1fr))",
      14: "repeat(14, minmax(0, 1fr))",
    },
    screens: {
      desktop: "82.5rem", // 14 4.5rem columns with 1.5rem gutter
      // Override default of:
      // => @media (min-width: 1024px) { ... }
    },
    transitionDuration: {
      "x-slow": "var(--sl-transition-x-slow)",
      slow: "var(--sl-transition-slow)",
      medium: "var(--sl-transition-medium)",
      fast: "var(--sl-transition-fast)",
      "x-fast": "var(--sl-transition-x-fast)",
    },
    outlineWidth: {
      3: "3px",
    },
    outlineOffset: {
      3: "3px",
    },
  };
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: makeTheme(),
  },

  content: {
    files: ["./src/**/*.html", "./src/**/*.{ts,js,ejs}"],
    transform: {
      ts: tailwindTransform,
    },
  },

  extract: {
    include: ["./src/**/*.{ts,js}"],
  },

  plugins: [
    require("@tailwindcss/container-queries"),
    attributes,
    containPlugin,
    contentVisibilityPlugin,
    cssPartsPlugin,
  ],
};
