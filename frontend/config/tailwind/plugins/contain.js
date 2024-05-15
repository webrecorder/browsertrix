const plugin = require("tailwindcss/plugin");
module.exports = plugin(
  ({ matchUtilities, theme }) => {
    matchUtilities(
      {
        contain: (value) => ({
          contain: value,
        }),
      },
      { values: theme("contain") },
    );
  },
  {
    theme: {
      contain: {
        none: "none",
        strict: "strict",
        content: "content",
        size: "size",
        "inline-size": "inline-size",
        layout: "layout",
        style: "style",
        paint: "paint",
      },
    },
  },
);
