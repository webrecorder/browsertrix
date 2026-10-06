import argparse
import requests  # ty: ignore[unresolved-import]
import os
import sys

try:
    BROWSERTRIX_USER = os.environ["BROWSERTRIX_USER"]
except KeyError:
    print("BROWSERTRIX_USER is unset!")
    sys.exit(1)

try:
    BROWSERTRIX_PASSWORD = os.environ["BROWSERTRIX_PASSWORD"]
except KeyError:
    print("BROWSERTRIX_PASSWORD is unset!")
    sys.exit(1)

BROWSERTRIX_HOST = os.environ.get("BROWSERTRIX_HOST", "https://dev.browsertrix.com")


def authentication_headers():
    session = requests.Session()
    response = session.post(
        f"{BROWSERTRIX_HOST}/api/auth/jwt/login",
        data={
            "username": BROWSERTRIX_USER,
            "password": BROWSERTRIX_PASSWORD,
            "grant_type": "password",
        },
    )
    data = response.json()
    return {"Authorization": f"Bearer {data['access_token']}"}


def print_tabular(headers, data):
    print("\t".join(headers))
    for datum in data:
        print("\t".join([datum[header] for header in headers]))


def process_crawls(args):
    headers = authentication_headers()

    if args.crawl_command == "list-in-org":
        response = requests.get(
            f"{BROWSERTRIX_HOST}/api/orgs/{args.org_id}/crawls", headers=headers
        )
        response.raise_for_status()
        print_tabular(["id", "type", "state", "finished"], response.json()["items"])
    elif args.crawl_command == "list-from-crawlconfig":
        response = requests.get(
            f"{BROWSERTRIX_HOST}/api/orgs/{args.org_id}/crawls?cid={args.crawl_config_id}",
            headers=headers,
        )
        response.raise_for_status()
        print_tabular(["id", "type", "state", "finished"], response.json()["items"])
    elif args.crawl_command == "download":
        response = requests.get(
            f"{BROWSERTRIX_HOST}/api/orgs/{args.org_id}/crawls/{args.crawl_id}/download?preferSingleWACZ=true",
            headers=headers,
        )
        response.raise_for_status()
        with open(args.download_path, "wb") as f:
            f.write(response.content)


parser = argparse.ArgumentParser()
subparsers = parser.add_subparsers(required=True, dest="command")
crawls = subparsers.add_parser("crawls")
crawls.add_argument(
    "crawl_command", choices=["list-in-org", "list-from-crawlconfig", "download"]
)
crawls.add_argument("--crawl-id", action="store")
crawls.add_argument("--crawl-config-id", action="store")
crawls.add_argument("--org-id", action="store")
crawls.add_argument("--download-path", action="store")
args = parser.parse_args()

if args.command == "crawls":
    process_crawls(args)
