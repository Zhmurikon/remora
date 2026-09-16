"""Распределённый sliding-window rate limiter на Redis."""

from __future__ import annotations

import hashlib
import secrets
import time

import redis.asyncio as redis
import structlog

from app.core.config import get_settings
from app.core.errors import RateLimitError

log = structlog.get_logger()

_SLIDING_WINDOW = """
local key = KEYS[1]
local cutoff = ARGV[1]
local now = ARGV[2]
local member = ARGV[3]
local limit = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])

redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, oldest[2] or now}
end
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, ttl)
return {1, now}
"""


def _key(scope: str, ip: str, identity: str) -> str:
    digest = hashlib.sha256(f"{ip}:{identity.lower()}".encode()).hexdigest()
    return f"remora:rate-limit:{scope}:{digest}"


async def enforce_rate_limit(
    *,
    scope: str,
    ip: str,
    identity: str,
    limit: int,
    window_seconds: int,
) -> None:
    """Учитывает попытку и бросает RATE_LIMITED при заполненном окне."""
    settings = get_settings()
    client = redis.from_url(  # type: ignore[no-untyped-call]
        str(settings.redis_url), decode_responses=True
    )
    now = time.time()
    try:
        result = await client.eval(
            _SLIDING_WINDOW,
            1,
            _key(scope, ip, identity),
            now - window_seconds,
            now,
            secrets.token_urlsafe(12),
            limit,
            window_seconds,
        )
    except redis.RedisError as exc:
        # Сбой Redis не должен полностью блокировать вход пользователей.
        log.warning("rate_limit.unavailable", scope=scope, error=type(exc).__name__)
        return
    finally:
        await client.aclose()

    if int(result[0]) == 0:
        retry_after = max(1, int(float(result[1]) + window_seconds - now))
        raise RateLimitError(details={"retry_after_seconds": retry_after, "scope": scope})
