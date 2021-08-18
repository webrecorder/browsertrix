from archives import Archive
from crawls import CrawlConfig
from baseman import BaseMan


class DockerManager(BaseMan):
    def __init__(self):
        pass

    async def add_crawl_config(
        self,
        userid: str,
        archive: Archive,
        crawlconfig: CrawlConfig,
        extra_crawl_params: list = None,
    ):
        print("add_crawl_config")
        print(crawlconfig)
        print(archive)
        print(extra_crawl_params)
