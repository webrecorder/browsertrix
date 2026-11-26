import { expect } from "@open-wc/testing";

import {
  STORAGE_FOLDER_PATTERN,
  storageFolderFromTemplate,
  templateFromStorageFolder,
} from "./workflow";

describe("storageFolderFromTemplate", () => {
  it("returns an empty folder when there is no template", () => {
    expect(storageFolderFromTemplate(null)).to.deep.equal({
      storageFolder: "",
      customFilenameTemplate: null,
    });
    expect(storageFolderFromTemplate("")).to.deep.equal({
      storageFolder: "",
      customFilenameTemplate: null,
    });
  });

  it("reads the folder from a storage folder template", () => {
    expect(
      storageFolderFromTemplate("le-devoir/@ts-@hostsuffix.wacz"),
    ).to.deep.equal({
      storageFolder: "le-devoir",
      customFilenameTemplate: null,
    });
  });

  it("reads nested folders", () => {
    expect(
      storageFolderFromTemplate("news/le-devoir/@ts-@hostsuffix.wacz"),
    ).to.deep.equal({
      storageFolder: "news/le-devoir",
      customFilenameTemplate: null,
    });
  });

  it("keeps a template the field can't show as custom", () => {
    for (const template of [
      "@ts-@hostsuffix.wacz",
      "UNT-@ts-@hostname.wacz",
      "Le-Devoir/@ts-@hostsuffix.wacz",
      "le-devoir/@id.wacz",
      "le-devoir/@ts-@hostsuffixXwacz",
    ]) {
      expect(storageFolderFromTemplate(template)).to.deep.equal({
        storageFolder: "",
        customFilenameTemplate: template,
      });
    }
  });
});

describe("templateFromStorageFolder", () => {
  it("returns null for an empty folder, so the default template applies", () => {
    expect(templateFromStorageFolder("")).to.equal(null);
    expect(templateFromStorageFolder("   ")).to.equal(null);
  });

  it("builds the template from the folder", () => {
    expect(templateFromStorageFolder(" le-devoir ")).to.equal(
      "le-devoir/@ts-@hostsuffix.wacz",
    );
  });

  it("returns null for an invalid folder", () => {
    for (const folder of ["../le-devoir", "/le-devoir", "Le-Devoir", "a//b"]) {
      expect(templateFromStorageFolder(folder), folder).to.equal(null);
    }
  });

  it("round trips with storageFolderFromTemplate", () => {
    const template = templateFromStorageFolder("news/le-devoir");
    expect(storageFolderFromTemplate(template).storageFolder).to.equal(
      "news/le-devoir",
    );
  });
});

describe("STORAGE_FOLDER_PATTERN", () => {
  // Browsers compile the `pattern` attribute as ^(?:pattern)$ with the v flag
  const pattern = new RegExp(`^(?:${STORAGE_FOLDER_PATTERN})$`, "v");

  it("accepts lowercase folders with dashes and subfolders", () => {
    for (const value of ["le-devoir", "11310073-amf", "news/le-devoir", "a"]) {
      expect(pattern.test(value), value).to.equal(true);
    }
  });

  it("rejects anything that could escape or break the path", () => {
    for (const value of [
      "",
      "/le-devoir",
      "le-devoir/",
      "le//devoir",
      "../le-devoir",
      "-le-devoir",
      "Le-Devoir",
      "le devoir",
      "le_devoir",
    ]) {
      expect(pattern.test(value), value).to.equal(false);
    }
  });
});
