const plugin = require("tailwindcss/plugin");
module.exports = plugin(function ({ matchVariant }) {
  matchVariant("attr", (value) => `&[${value}]`);
  matchVariant("group-attr", (value) => `:merge(.group)[${value}] &`);
  matchVariant("peer-attr", (value) => `:merge(.peer)[${value}] ~ &`);
});
