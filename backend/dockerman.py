# pylint: skip-file
import asyncio


class DockerManager:
    def __init__(self):
        pass

        async def test():
            print("test async", flush=True)

        loop = asyncio.get_running_loop()
        loop.create_task(test())
        print("starting")

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
