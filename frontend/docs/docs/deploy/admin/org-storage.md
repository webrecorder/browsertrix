# Org Storage

This guide covers configuring storage for an organization in Browsertrix.

By default, all organizations will use the default storage and default replica locations (if any are configured) set in the Helm chart.

The Browsertrix API supports adding custom storage locations per organization and configuring the organization to use custom storages for primary and/or replica storage. These endpoints are available to superusers only.

## Adding Custom Storage

The first step to configuring custom storage with an organization is to add the S3 buckets to the organization, e.g.:

```sh
curl -X POST -H "Content-type: application/json" -H "Authorization: Bearer <jwt token>" https://app.browsertrix.com/api/orgs/<org-id>/custom-storage --data '{"name": "new-custom-storage", "access_key": "<access-key>", "secret_key": "<secret-key>", "bucket": "new-custom-storage", "endpoint_url": "https://s3-provider.example.com/"}'
```

Verify that the custom storage has been added to the organization by checking the `/all-storages` API endpoint:

```sh
curl -H "Content-type: application/json" -H "Authorization: Bearer <jwt token>" https://app.browsertrix.com/api/orgs/<org-id>/all-storages
```

The storage reference for our new custom storage should be present in the returned JSON, e.g.:

```json
{
	"allStorages": [
		{"name": "default", "custom": false},
		{"name": "default-replica", "custom": false},
		{"name": "new-custom-storage", "custom": true},
	]
}
```

The custom storage is now ready to be configured.


## Updating Org Storage

Each organization has one primary storage location. It is possible to configure the organization to use any of the storage options listed in the `/all-storages` API endpoint as primary storage, e.g.:

```sh
curl -X POST -H "Content-type: application/json" -H "Authorization: Bearer <jwt token>" https://app.browsertrix.com/api/orgs/<org-id>/storage --data '{"storage": {"name": "new-custom-storage", "custom": true}}'
```

If any crawls, uploads, or browser profiles have been created on the organization, modifying the primary storage will disable archiving on the organization while files are migrated from the previous to the new storage location. Archiving is re-enabled when the migration completes.

At this time, all files are copied from the previous storage location to the new storage location, and are not automatically deleted from their source location.


## Updating Org Replica Storage

Each organization can have any number of replica storage locations. These locations serve as replicas of the content in the primary storage location, and are most commonly used as backups.

It is possible to configure the organization to use any of the storage options listed in the `/all-storages` API endpoint as replica storage, e.g.:

```sh
curl -X POST -H "Content-type: application/json" -H "Authorization: Bearer <jwt token>" https://app.browsertrix.com/api/orgs/<org-id>/storage-replicas --data '{"storageReplicas": [{"name": "default-replica", "custom": false}, {"new-custom-storage": true}]}'
```

If any crawls, uploads, or browser profiles have been created on the organization, adding a new replica location will result in a background job to replicate all of the organization's files from primary storage to the new replica location. Unlike with updating primary storage, this process will not disable archiving on the organization.

If any crawls, uploads, or browser profiles have been created on the organization, removing a previously used replica location will result in database updates to reflect that the prior replica location is no longer available. At this time, no files are automatically deleted from the removed replica location.


## Removing Custom Storage

It is also possible to remove a custom storage from an organization, referencing the storage to be deleted's name in the API endpoint, e.g.:

```sh
curl -X DELETE -H "Content-type: application/json" -H "Authorization: Bearer <jwt token>" https://app.browsertrix.com/api/orgs/<org-id>/custom-storage/new-custom-storage
```

The custom storage location to be deleted must not be in use on the organization, or else the endpoint will return `400`. Default storage locations shared between organizations cannot be deleted with this endpoint.
