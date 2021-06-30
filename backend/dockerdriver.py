import aiodocker


class DockerDriver(BaseDriver):
    def __init__(self):
        self.docker = aiodocker.Docker()
        self.crawl_image = os.environ.get(
            "CRAWLER_IMAGE", "webrecorder/browsertrix-crawler"
        )

    def start_crawl(self):
        container = await self.docker.containers.create(config=config)
