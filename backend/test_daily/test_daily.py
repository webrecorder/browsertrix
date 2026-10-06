import datetime
import requests
import os
import subprocess
import sys

try:
    DEV_DAILY_TEST_USER = os.environ['DEV_DAILY_TEST_USER']
except KeyError:
    print('DEV_DAILY_TEST_USER is unset!')
    sys.exit(1)

try:
    DEV_DAILY_TEST_PASSWORD = os.environ['DEV_DAILY_TEST_PASSWORD']
except KeyError:
    print('DEV_DAILY_TEST_PASSWORD is unset!')
    sys.exit(1)

DEV_DAILY_TEST_ORG_ID = "85449160-6632-419a-a9fc-bac35a3d6d73"
DEV_DAILY_TEST_ORG_CRAWLCONFIG = "a1d07112-85f2-4182-aa69-fdf597c4c0cc"

HOST = "https://dev.browsertrix.com"

def authentication_headers():
    session = requests.Session()
    response = session.post(f"{HOST}/api/auth/jwt/login", data = {
        "username": DEV_DAILY_TEST_USER,
        "password": DEV_DAILY_TEST_PASSWORD,
        "grant_type": "password",    
    })
    data = response.json()
    return {"Authorization": f"Bearer {data['access_token']}"}


headers = authentication_headers()
crawls = requests.get(f"{HOST}/api/orgs/{DEV_DAILY_TEST_ORG_ID}/crawls?cid={DEV_DAILY_TEST_ORG_CRAWLCONFIG}&sortBy=started&state=complete", headers=headers)

if crawls.json() < 0:
    print(f"No crawls found in org {DEV_DAILY_TEST_ORG_ID} with crawl config {DEV_DAILY_TEST_ORG_CRAWLCONFIG}!")
    sys.exit(1)

crawl = crawls.json()['items'][0]
finished = datetime.datetime.strptime(crawl['finished'], "%Y-%m-%dT%H:%M:%S%z")
one_day_ago = datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=1)
if finished < one_day_ago:
    print(f"Last crawl is more than one day ago; scheduled crawl failed")
    sys.exit(1)

if crawl['state'] != 'complete':
    print('Last crawl did not complete successfully!')
    sys.exit(1)

crawl_id = crawl['id']
response = requests.get(f"{HOST}/api/orgs/{DEV_DAILY_TEST_ORG_ID}/crawls/{crawl_id}/download?preferSingleWACZ=true", headers=headers)
with open("/tmp/crawl.wacz", "wb") as f:
    f.write(response.body)

subprocess.check_call(["wacz", "validate", "--verify-auth", "-f", "/tmp/crawl.wacz"])
