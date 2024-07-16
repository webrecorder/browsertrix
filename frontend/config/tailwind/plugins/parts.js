const plugin = require("tailwindcss/plugin");
module.exports = plugin(function ({ matchVariant }) {
  matchVariant("part", (value) => `&::part(${value})`);
});
