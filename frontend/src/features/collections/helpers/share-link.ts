import { RouteNamespace } from "@/routes";
import { CollectionAccess, type Collection } from "@/types/collection";

export function collectionShareLink(
  collection:
    | (Pick<Collection, "id" | "slug"> & Partial<Pick<Collection, "access">>)
    | undefined,
  privateSlug: string | null,
  publicSlug: string | null,
) {
  const baseUrl = `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}`;
  if (collection) {
    return `${baseUrl}/${
      collection.access === CollectionAccess.Private
        ? `${RouteNamespace.PrivateOrgs}/${privateSlug}/collections/view/${collection.id}`
        : `${RouteNamespace.PublicOrgs}/${publicSlug}/collections/${collection.slug}`
    }`;
  }
  return "";
}
