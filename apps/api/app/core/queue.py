"""Подключение к очереди фоновых задач ARQ."""

from arq import ArqRedis, create_pool
from arq.connections import RedisSettings

from app.core.config import get_settings


async def enqueue_import(job_id: str) -> None:
    pool: ArqRedis = await create_pool(RedisSettings.from_dsn(str(get_settings().redis_url)))
    try:
        await pool.enqueue_job("process_anki_import", job_id, _job_id=f"import:{job_id}")
    finally:
        await pool.aclose()


async def enqueue_account_export(job_id: str) -> None:
    pool: ArqRedis = await create_pool(RedisSettings.from_dsn(str(get_settings().redis_url)))
    try:
        await pool.enqueue_job("process_account_export", job_id, _job_id=f"account-export:{job_id}")
    finally:
        await pool.aclose()


async def enqueue_transcription(job_id: str) -> None:
    pool: ArqRedis = await create_pool(RedisSettings.from_dsn(str(get_settings().redis_url)))
    try:
        await pool.enqueue_job("process_transcription", job_id, _job_id=f"transcription:{job_id}")
    finally:
        await pool.aclose()
