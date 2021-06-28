from typing import List, Optional, TypeVar
from pydantic import BaseModel, UUID4, validator
from fastapi import APIRouter, Depends
from users import User
import uuid
from bson.objectid import ObjectId

class SimpleCrawl(BaseModel):
    url: str
    scopeType: str







