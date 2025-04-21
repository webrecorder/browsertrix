export default {
  /** Globs to analyze */
  globs: ["src/**/*.ts"],
  /** Globs to exclude */
  exclude: ["__generated__", "__mocks__"],
  /** Directory to output CEM to */
  outdir: "src/__generated__",
  /** Run in dev mode, provides extra logging */
  // dev: true,
  /** Run in watch mode, runs on file changes */
  // watch: true,
  /** Include third party custom elements manifests */
  // dependencies: true,
  /** Output CEM path to `package.json`, defaults to true */
  packagejson: false,
  /** Enable special handling for litelement */
  litelement: true,
};
