import requests
import json
import hashlib
import yaml

desc = "A chart for Browsertrix integrated web archiving system"

URL = "https://api.github.com/repos/webrecorder/browsertrix/releases"

source_prefix = "https://github.com/webrecorder/browsertrix/tree/"

home = "https://github.com/webrecorder/browsertrix"

def compute_hash(url):
    h = hashlib.sha256()
    with requests.get(url, stream=True) as resp:
        for chunk in resp.iter_content():
            h.update(chunk)

    return h.hexdigest()

def main():
    result = requests.get(URL)
    index_releases = []
    for release in result.json():
        asset = release["assets"][0]
        url = asset["browser_download_url"]
        tag = release["tag_name"]
        data = {
            "apiVersion": "v2",
            "created": asset["created_at"],
            "name": release["name"],
            "digest": compute_hash(url),
            "description": desc,
            "urls": [url],
            "sources": [source_prefix + tag],
            "type": "application",
            "home": home,
            "appVersion": tag.replace("v", ""),
            "version": tag.replace("v", "")
        }
        index_releases.append(data)

    root = {
        "apiVersion": "v1",
        "entries": {
            "browsertrix": index_releases
        }
    }

    print(yaml.dump(root))


main()


