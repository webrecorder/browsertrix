class ExampleComBehavior {
  static id = "ExampleComBehavior";

  static isMatch() {
    return !!window.location.href.match(/^https?:\/\/example-com.webrecorder.net/);
  }

  static init() {
    return {};
  }

  async *run(ctx) {
    const { addLink, xpathNode } = ctx.Lib;

    ctx.log("Adding link");
    const link = xpathNode("//a");
    if (link) {
      await addLink(link.href);
    }
  }

  async awaitPageLoad(ctx) {
    const { assertContentValid } = ctx.Lib;

    ctx.log("Asserting not logged in");
    assertContentValid(() => false, "not_logged_in");
  }
}
