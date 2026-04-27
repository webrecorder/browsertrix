export const orgUploadsContextKey = Symbol("org-uploads");

export type OrgUpload = {
  // TODO
};

export type OrgUploadsEventDetail = {
  // TODO
};

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-org-upload-start": CustomEvent<OrgUploadsEventDetail>;
  }
}
