# pylint: skip-file
import asyncio


class DockerManager:
    def __init__(self):
        pass

    async def add_crawl_config(
        self,
        crawlconfig,
        storage,
        extra_crawl_params: list = None,
    ):
        print("add_crawl_config")
        print(crawlconfig)
        print(storage)
        print(extra_crawl_params)
