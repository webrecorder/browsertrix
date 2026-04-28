const plugin = require("tailwindcss/plugin");
module.exports = plugin(function ({ addVariant, matchVariant }) {
  addVariant("host-hover", `:host(:hover) &`);
  addVariant("host-active", `:host(:active) &`);
  addVariant("host-focus", `:host(:focus) &`);
  addVariant("host-focus-within", `:host(:focus-within) &`);
  addVariant("host-focus-visible", `:host(:focus-visible) &`);
  matchVariant("host-", (value) => `:host(${value}) &`);
});
