"""Доступ к S3-совместимому хранилищу через небольшой тестируемый адаптер."""

import asyncio
from functools import lru_cache

import boto3
from botocore.config import Config
from mypy_boto3_s3 import S3Client

from app.core.config import get_settings


class ObjectStorage:
    def __init__(self, client: S3Client, bucket: str) -> None:
        self.client = client
        self.bucket = bucket

    def upload_url(self, key: str, mime: str, ttl: int) -> str:
        return self.client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self.bucket, "Key": key, "ContentType": mime},
            ExpiresIn=ttl,
        )

    def download_url(self, key: str, ttl: int) -> str:
        return self.client.generate_presigned_url(
            "get_object", Params={"Bucket": self.bucket, "Key": key}, ExpiresIn=ttl
        )

    async def read(self, key: str, max_bytes: int) -> tuple[bytes, int]:
        def load() -> tuple[bytes, int]:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
            size = int(response["ContentLength"])
            if size > max_bytes:
                response["Body"].close()
                raise ValueError("object exceeds allowed size")
            return response["Body"].read(max_bytes + 1), size

        return await asyncio.to_thread(load)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=key)

    async def delete_many(self, keys: list[str]) -> None:
        if not keys:
            return

        def remove() -> None:
            self.client.delete_objects(
                Bucket=self.bucket,
                Delete={"Objects": [{"Key": key} for key in keys], "Quiet": True},
            )

        await asyncio.to_thread(remove)

    async def put(self, key: str, payload: bytes, mime: str) -> None:
        await asyncio.to_thread(
            self.client.put_object,
            Bucket=self.bucket,
            Key=key,
            Body=payload,
            ContentType=mime,
        )


def _client() -> S3Client:
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key.get_secret_value(),
        region_name="us-east-1",
        config=Config(proxies={}),
    )


@lru_cache
def get_object_storage() -> ObjectStorage:
    return ObjectStorage(_client(), get_settings().s3_bucket_media)


@lru_cache
def get_audio_storage() -> ObjectStorage:
    """Аудио лежит в отдельном бакете: у него другой жизненный цикл и кэш общий."""
    return ObjectStorage(_client(), get_settings().s3_bucket_audio)
