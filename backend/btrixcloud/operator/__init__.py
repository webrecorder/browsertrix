""" operators module """

from .profiles import ProfileOperator
from .bgjobs import BgJobOperator
from .cronjobs import CronJobOperator
from .crawls import CrawlOperator

operator_classes = [ProfileOperator, BgJobOperator, CronJobOperator, CrawlOperator]


# ============================================================================
def init_operator_api(app, *args):
    """regsiters webhook handlers for metacontroller"""

    operators = []
    for cls in operator_classes:
        oper = cls(*args)
        oper.init_routes(app)
        operators.append(oper)

    @app.get("/healthz", include_in_schema=False)
    async def healthz():
        return {}

    return operators
