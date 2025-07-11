/** @type {import('eslint').Linter.Config} */
module.exports = {
  parser: "@typescript-eslint/parser",
  env: {
    browser: true,
    commonjs: true,
    es2017: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:import-x/recommended",
    "plugin:wc/recommended",
    "plugin:lit/recommended",
    "plugin:storybook/recommended",
    "prettier",
  ],
  plugins: ["@typescript-eslint", "lit"],
  parserOptions: {
    project: ["./tsconfig.eslint.json"],
    tsconfigRootDir: __dirname,
  },
  root: true,
  rules: {
    /* start stylistic rules */
    "@typescript-eslint/adjacent-overload-signatures": "error",
    "@typescript-eslint/array-type": "error",
    "@typescript-eslint/consistent-type-imports": [
      "error",
      {
        fixStyle: "inline-type-imports",
      },
    ],
    "@typescript-eslint/consistent-type-exports": "error",
    "@typescript-eslint/prefer-readonly": "warn",
    "@typescript-eslint/class-literal-property-style": ["warn", "getters"],
    "@typescript-eslint/consistent-generic-constructors": "error",
    "@typescript-eslint/consistent-type-assertions": "error",
    "@typescript-eslint/no-confusing-non-null-assertion": "warn",
    "@typescript-eslint/no-inferrable-types": "warn",
    "@typescript-eslint/non-nullable-type-assertion-style": "warn",
    "@typescript-eslint/prefer-for-of": "warn",
    // "@typescript-eslint/prefer-nullish-coalescing": "warn",
    "@typescript-eslint/prefer-optional-chain": "warn",
    "@typescript-eslint/prefer-string-starts-ends-with": "error",
    "@typescript-eslint/no-meaningless-void-operator": "error",
    "@typescript-eslint/no-unnecessary-boolean-literal-compare": "warn",
    "@typescript-eslint/no-unnecessary-condition": "warn",
    "@typescript-eslint/no-unnecessary-qualifier": "warn",
    "@typescript-eslint/no-unnecessary-type-arguments": "warn",
    "@typescript-eslint/prefer-reduce-type-parameter": "warn",
    "@typescript-eslint/promise-function-async": "warn",
    /* end stylistic rules */

    /* start recommended rules */
    "no-restricted-globals": [2, "event", "error"],
    "@typescript-eslint/no-base-to-string": "warn",
    "@typescript-eslint/no-duplicate-enum-values": "error",
    "@typescript-eslint/no-duplicate-type-constituents": "warn",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-extra-non-null-assertion": "error",
    "@typescript-eslint/no-floating-promises": "warn",
    "@typescript-eslint/no-for-in-array": "warn",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      },
    ],
    "no-implied-eval": "off",
    "@typescript-eslint/no-implied-eval": "error",
    "no-loss-of-precision": "off",
    "@typescript-eslint/no-loss-of-precision": "warn",
    "@typescript-eslint/no-misused-new": "error",
    "@typescript-eslint/no-misused-promises": [
      "error",
      { checksVoidReturn: false },
    ],
    "@typescript-eslint/no-non-null-asserted-nullish-coalescing": "error",
    "@typescript-eslint/no-non-null-asserted-optional-chain": "warn",
    "@typescript-eslint/no-redundant-type-constituents": "warn",
    "@typescript-eslint/no-this-alias": "warn",
    "@typescript-eslint/no-unnecessary-type-assertion": "warn",
    "@typescript-eslint/no-unnecessary-type-constraint": "warn",
    /* TODO eventually turn all these on */
    "@typescript-eslint/no-unsafe-argument": "warn",
    // "@typescript-eslint/no-unsafe-assignment": "warn",
    // "@typescript-eslint/no-unsafe-call": "warn",
    "@typescript-eslint/no-unsafe-declaration-merging": "warn",
    "@typescript-eslint/no-unsafe-enum-comparison": "warn",
    // "@typescript-eslint/no-unsafe-member-access": "warn",
    "@typescript-eslint/no-unsafe-return": "warn",
    "@typescript-eslint/prefer-as-const": "warn",
    "require-await": "off",
    // "@typescript-eslint/require-await": "warn",
    "@typescript-eslint/restrict-template-expressions": "warn",
    "@typescript-eslint/unbound-method": "off",
    "@typescript-eslint/method-signature-style": "error",
    /* end recommended rules */

    /* start import rules */
    // "import-x/no-duplicates": ["error", { "prefer-inline": true }],
    "import-x/order": [
      "error",
      {
        "newlines-between": "always",
        pathGroups: [
          {
            pattern: "@/*",
            group: "internal",
          },
          {
            pattern: "~assets/*",
            group: "internal",
          },
        ],
        distinctGroup: false,
        alphabetize: {
          order: "asc",
          caseInsensitive: true,
        },
      },
    ],
    "import-x/no-relative-packages": "error",
    "import-x/no-useless-path-segments": [
      "error",
      {
        noUselessIndex: true,
      },
    ],
    "import-x/no-cycle": "error",
  },
  reportUnusedDisableDirectives: true,
  settings: {
    "import-x/resolver": {
      typescript: true,
    },
  },
  ignorePatterns: [
    "__generated__",
    "__mocks__",
    "dist",
    "docs",
    "!.storybook",
    "storybook-static",
  ],
  overrides: [
    {
      extends: ["plugin:@typescript-eslint/disable-type-checked"],
      files: [
        "webpack.*.js",
        "config/*.js",
        "scripts/*.js",
        ".*.js",
        "*.config.js",
      ],
      env: { node: true },
      rules: {
        "@typescript-eslint/no-var-requires": "off",
      },
    },
    {
      files: ["*.test.ts"],
      rules: {
        "@typescript-eslint/no-floating-promises": "off",
        "@typescript-eslint/no-unsafe-call": "off",
      },
    },
    {
      files: [".storybook/**/*.tsx"],
      extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:import-x/recommended",
        "plugin:storybook/recommended",
        "prettier",
      ],
      parserOptions: {
        project: [".storybook/tsconfig.json"],
      },
    },
  ],
};
