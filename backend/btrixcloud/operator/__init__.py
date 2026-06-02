"""operators module"""

from .baseoperator import K8sOpAPI
from .bgjobs import BgJobOperator
from .collindexes import CollIndexOperator
from .collindexjob import CollIndexImportJobOperator
from .crawls import CrawlOperator
from .cronjobs import CronJobOperator
from .profiles import ProfileOperator

operator_classes = [
    ProfileOperator,
    BgJobOperator,
    CronJobOperator,
    CrawlOperator,
    CollIndexOperator,
    CollIndexImportJobOperator,
]


# ============================================================================
def init_operator_api(app, *args):
    """registers webhook handlers for metacontroller"""

    k8s = K8sOpAPI()

    operators = []
    for cls in operator_classes:
        oper = cls(k8s, *args)
        oper.init_routes(app)
        operators.append(oper)

    @app.get("/healthz", include_in_schema=False)
    async def healthz():
        return {}

    return k8s
