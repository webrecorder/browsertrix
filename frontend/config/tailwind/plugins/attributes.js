const plugin = require("tailwindcss/plugin");
module.exports = plugin(function ({ matchVariant }) {
  matchVariant("attr", (value) => `&[${value}]`);
});
