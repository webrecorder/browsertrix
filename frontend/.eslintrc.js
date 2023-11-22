/** @type {import('eslint').Linter.Config} */
module.exports = {
  parser: "@typescript-eslint/parser",
  env: {
    browser: true,
    commonjs: true,
    es2017: true,
  },
  extends: [
    "plugin:wc/recommended",
    "plugin:lit/recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  plugins: ["@typescript-eslint", "lit"],
  parserOptions: {
    project: ["./tsconfig.eslint.json"],
    tsconfigRootDir: __dirname,
  },
  root: true,
  rules: {
    "no-restricted-globals": [2, "event", "error"],
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      },
    ],
    "@typescript-eslint/consistent-type-imports": "error",
    "@typescript-eslint/consistent-type-exports": "error",
  },
  reportUnusedDisableDirectives: true,
  ignorePatterns: ["__generated__", "__mocks__"],
};
