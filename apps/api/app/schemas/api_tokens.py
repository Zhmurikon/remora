from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

AgentScope = Literal["materials:read", "materials:write", "courses:publish"]


class ApiTokenCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    expires_in_days: int = Field(default=90, ge=1, le=365)
    scopes: list[AgentScope] = Field(
        default=["materials:read", "materials:write"], min_length=1, max_length=3
    )


class ApiTokenPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    prefix: str
    scopes: list[str]
    created_at: datetime
    expires_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


class ApiTokenCreated(ApiTokenPublic):
    token: str
