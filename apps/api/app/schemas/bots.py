from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BotPlatform(StrEnum):
    telegram = "telegram"
    vk = "vk"


class BotLinkPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    platform: BotPlatform
    actor_id: str
    created_at: datetime


class BotCodeRequest(BaseModel):
    platform: BotPlatform


class BotCodeCreated(BaseModel):
    code: str
    expires_at: datetime
    bot_url: str | None


class BotEventIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_id: str = Field(min_length=1, max_length=128)
    actor_id: str = Field(pattern=r"^[1-9][0-9]{0,19}$")
    command: str = Field(default="help", min_length=1, max_length=96)
    input: str | None = Field(default=None, max_length=10_000)
    code_hash: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    callback_id: str | None = Field(default=None, min_length=1, max_length=128)


class BotDelivery(BaseModel):
    id: UUID
    lease_token: UUID
    actor_id: str
    text: str
    callback_id: str | None
    keyboard: list[list[dict[str, str]]] = Field(default_factory=list)
    audio_url: str | None = None


class BotDeliveryAck(BaseModel):
    lease_token: UUID
    success: bool
