// Polyfill doesn't have an export--provide our own
require("@formatjs/intl-durationformat/lib/polyfill");

module.exports = window.Intl.DurationFormat;
