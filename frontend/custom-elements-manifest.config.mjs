export default {
  /** Globs to analyze */
  globs: ["src/components/**/*.ts", "src/features/**/*.ts"],
  /** Globs to exclude */
  exclude: ["src/**/*.stories.ts"],
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
  /** Provide custom plugins */
  plugins: [filterPrivateFields()],
};

// Filter private fields
// Based on https://github.com/storybookjs/storybook/issues/15436#issuecomment-1856333227
function filterPrivateFields() {
  return {
    name: "web-components-private-fields-filter",
    analyzePhase({ ts, node, moduleDoc }) {
      switch (node.kind) {
        case ts.SyntaxKind.ClassDeclaration: {
          const className = node.name.getText();
          const classDoc = moduleDoc?.declarations?.find(
            (declaration) => declaration.name === className,
          );

          if (classDoc?.members) {
            // Filter both private and static members
            // TODO May be able to avoid some of this with `#` private member prefix
            // https://github.com/webrecorder/browsertrix/issues/2563
            classDoc.members = classDoc.members.filter(
              (member) => !member.privacy && !member.static,
            );
          }
        }
      }
    },
  };
}
