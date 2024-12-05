import { expect } from "@esm-bundle/chai";

import APIRouter from "./APIRouter";

import { ROUTES } from "@/routes";

describe("APIRouter", () => {
  describe("match", () => {
    it("matches org", () => {
      const apiRouter = new APIRouter(ROUTES);
      const viewState = apiRouter.match("/orgs/_fake_org_id_");

      expect(viewState.route).to.equal("org");
      expect(viewState.params).to.deep.equal({
        slug: "_fake_org_id_",
      });
    });

    it("matches join", () => {
      const apiRouter = new APIRouter(ROUTES);
      const viewState = apiRouter.match(
        "/join/_fake_token_?email=_fake_email_",
      );

      expect(viewState.route).to.equal("join");
      expect(viewState.params).to.deep.equal({
        token: "_fake_token_",
        email: "_fake_email_",
      });
    });

    it("matches join with email comment", () => {
      const apiRouter = new APIRouter(ROUTES);
      const viewState = apiRouter.match(
        "/join/_fake_token_?email=fake+comment@email.com",
      );

      expect(viewState.route).to.equal("join");
      expect(viewState.params).to.deep.equal({
        token: "_fake_token_",
        email: "fake+comment@email.com",
      });
    });

    it("matches join with encoded email", () => {
      const apiRouter = new APIRouter(ROUTES);
      const viewState = apiRouter.match(
        "/join/_fake_token_?email=fake%2Bcomment%40email.com",
      );

      expect(viewState.route).to.equal("join");
      expect(viewState.params).to.deep.equal({
        token: "_fake_token_",
        email: "fake+comment@email.com",
      });
    });
    describe("archived items", () => {
      it("matches item", () => {
        const apiRouter = new APIRouter(ROUTES);
        const viewState = apiRouter.match(
          "/orgs/fake-org-id/items/crawl/manual-22061402406423-79beb9d3-1df",
        );

        expect(viewState.route).to.equal("org");
        expect(viewState.params).to.deep.equal({
          itemId: "manual-22061402406423-79beb9d3-1df",
          itemType: "crawl",
          slug: "fake-org-id",
        });
      });

      it("matches item QA", () => {
        const apiRouter = new APIRouter(ROUTES);
        const viewState = apiRouter.match(
          "/orgs/fake-org-id/items/crawl/manual-22061402406423-79beb9d3-1df/review/screenshots?qaRunId=qa-20241126175717-75f211dc-a5b",
        );

        expect(viewState.route).to.equal("org");
        expect(viewState.params).to.deep.equal({
          itemId: "manual-22061402406423-79beb9d3-1df",
          itemType: "crawl",
          qaRunId: "qa-20241126175717-75f211dc-a5b",
          reviewType: "screenshots",
          slug: "fake-org-id",
        });
      });
    });
  });
});
