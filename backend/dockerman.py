from archives import Archive
from crawls import CrawlConfig


class DockerManager:
    def __init__(self):
        pass

    async def add_crawl_config(
        self,
        userid: str,
        aid: str,
        storage,
        crawlconfig,
        extra_crawl_params: list = None,
    ):
        print("add_crawl_config")
        print(storage)
        print(crawlconfig)
        print(aid)
        print(extra_crawl_params)
