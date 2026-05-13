export const orgUploadsContextKey = Symbol("org-uploads");

export type OrgUpload = {
  itemId?: string;
  canceled?: boolean;
  itemName: string;
  filename: string;
  loaded: number;
  total: number;
};

export type OrgUploadEventDetail = {
  uploadId?: string;
  itemName: string;
  apiPath: string;
  file: File;
};

export type OrgUploadCancelRemoveEventDetail = {
  uploadIds: string[];
};

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-org-upload": CustomEvent<OrgUploadEventDetail>;
    "btrix-org-upload-cancel": CustomEvent<OrgUploadCancelRemoveEventDetail>;
    "btrix-org-upload-remove": CustomEvent<OrgUploadCancelRemoveEventDetail>;
  }
}
