"""Tests for BaseMongoModel.from_dict lenient read via LENIENT_ON_READ"""

from typing import Annotated
from uuid import uuid4

import pytest
from pydantic import Field, ValidationError

from btrixcloud.db import LENIENT_ON_READ, BaseMongoModel


# ---------------------------------------------------------------------------
# Minimal test models
# ---------------------------------------------------------------------------

LenientStr = Annotated[str, Field(max_length=10), LENIENT_ON_READ]
StrictStr = Annotated[str, Field(max_length=10)]
LenientOptionalStr = Annotated[str | None, Field(max_length=10), LENIENT_ON_READ]


class _LenientModel(BaseMongoModel):
    name: LenientStr
    strict_field: StrictStr


class _LenientOptionalModel(BaseMongoModel):
    name: LenientOptionalStr = None


class _NonLenientModel(BaseMongoModel):
    strict_field: StrictStr


class _AllOptionalModel(BaseMongoModel):
    id: str | None = None
    name: LenientStr | None = "default"
    strict_field: StrictStr | None = "default"


# ---------------------------------------------------------------------------
# from_dict -- normal path
# ---------------------------------------------------------------------------


def test_from_dict_valid():
    obj = _LenientModel.from_dict(
        {"_id": str(uuid4()), "name": "hello", "strict_field": "world"}
    )
    assert obj.name == "hello"
    assert obj.strict_field == "world"


def test_from_dict_empty():
    obj = _AllOptionalModel.from_dict({})
    assert obj.name == "default"
    assert obj.strict_field == "default"


# ---------------------------------------------------------------------------
# from_dict -- lenient path (over-limit data is allowed)
# ---------------------------------------------------------------------------


def test_from_dict_lenient_field_over_limit():
    obj = _LenientModel.from_dict(
        {"_id": str(uuid4()), "name": "x" * 50, "strict_field": "ok"}
    )
    assert len(obj.name) == 50
    assert obj.strict_field == "ok"


def test_from_dict_lenient_optional_over_limit():
    obj = _LenientOptionalModel.from_dict({"_id": str(uuid4()), "name": "x" * 50})
    assert len(obj.name) == 50


# ---------------------------------------------------------------------------
# from_dict -- non-lenient field errors still propagate
# ---------------------------------------------------------------------------


def test_from_dict_non_lenient_field_raises():
    with pytest.raises(ValidationError):
        _LenientModel.from_dict(
            {"_id": str(uuid4()), "name": "ok", "strict_field": "x" * 50}
        )


def test_from_dict_mixed_errors_raises():
    with pytest.raises(ValidationError):
        _LenientModel.from_dict(
            {"_id": str(uuid4()), "name": "x" * 50, "strict_field": "x" * 50}
        )


def test_from_dict_non_lenient_model_raises():
    with pytest.raises(ValidationError):
        _NonLenientModel.from_dict({"_id": str(uuid4()), "strict_field": "x" * 50})


# ---------------------------------------------------------------------------
# Strict constructor -- validation always enforced
# ---------------------------------------------------------------------------


def test_strict_constructor_lenient_field_over_limit_raises():
    with pytest.raises(ValidationError):
        _LenientModel(id=uuid4(), name="x" * 50, strict_field="ok")


def test_strict_constructor_optional_lenient_over_limit_raises():
    with pytest.raises(ValidationError):
        _LenientOptionalModel(id=uuid4(), name="x" * 50)
