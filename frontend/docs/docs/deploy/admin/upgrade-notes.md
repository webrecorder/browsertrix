# Upgrade Notes

Some Browsertrix releases include long-running data migrations that may need to be monitored. This guide covers important information for such releases.

## Browsertrix 1.14

Browsertrix 1.14, which introduces public collections, has several data migrations which affect crawl and upload objects as well as their pages.

Migration 0042 in particular annotates all crawl pages in the database with information which is used to optimize loading times for crawl and collection replay. Because it must iterate through all crawl pages, this process can take a long time in deployments with many crawls and pages.

In order to keep this optimization from blocking deployment, migration 0042 starts a parallelized background job that migrates the important data.

If this background job fail for any reason, the superadmin will receive a background job failure notification. The status of the background job can also be checked or retried at any time using superadmin-only background job API endpoints as needed:

- List all background jobs: `GET /orgs/all/jobs`
- Get background job: `GET /orgs/all/jobs/{job_id}`
- Retry background job: `POST /orgs/all/jobs/{job_id}/retry`

For more details on these and other available API endpoints, consult the [Browsertrix API documentation](/api).
