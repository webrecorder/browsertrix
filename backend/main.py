from fastapi import FastAPI, Depends

import logging
import os
import sys
import json

from users import init_users_api, User
from db import init_db
from archives import init_archives_api


db = init_db()

app = FastAPI()

fastapi_users = init_users_api(app, db)

current_active_user = fastapi_users.current_user(active=True)

init_archives_api(app, db, current_active_user)


@app.get("/")
async def root():
    return {"message": "Hello World"}


@app.get("/protected-route")
def protected_route(user: User = Depends(current_active_user)):
    return f"Hello, {user.email}"
