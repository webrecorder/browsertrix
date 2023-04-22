""" entrypoint module for operator """


from fastapi import FastAPI

from .operator import init_operator_webhook

from .utils import register_exit_handler

app_root = FastAPI()


# ============================================================================
def main():
    """main init"""
    init_operator_webhook(app_root)


# ============================================================================
@app_root.on_event("startup")
async def startup():
    """init on startup"""
    register_exit_handler()
    main()
