"""Small shared building blocks: camelCase JSON models and clock helpers."""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model whose JSON representation uses camelCase keys (the API's wire format).

    Python code keeps snake_case attribute names; both spellings are accepted on input.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
    )


def utc_now() -> datetime:
    """Timezone-aware current time in UTC."""
    return datetime.now(tz=UTC)


def iso_timestamp(moment: datetime | None = None) -> str:
    """RFC 3339 timestamp with millisecond precision and a `Z` suffix."""
    value = (moment or utc_now()).astimezone(UTC)
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"
