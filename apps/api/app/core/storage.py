"""Доступ к S3-совместимому хранилищу через небольшой тестируемый адаптер."""

import asyncio
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

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

    async def create_multipart_upload(self, key: str, mime: str) -> str:
        response = await asyncio.to_thread(
            self.client.create_multipart_upload,
            Bucket=self.bucket,
            Key=key,
            ContentType=mime,
        )
        return str(response["UploadId"])

    def upload_part_url(self, key: str, upload_id: str, part_number: int, ttl: int) -> str:
        return self.client.generate_presigned_url(
            "upload_part",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                "UploadId": upload_id,
                "PartNumber": part_number,
            },
            ExpiresIn=ttl,
        )

    async def list_multipart_parts(self, key: str, upload_id: str) -> list[dict[str, int | str]]:
        def load() -> list[dict[str, int | str]]:
            response = self.client.list_parts(Bucket=self.bucket, Key=key, UploadId=upload_id)
            return [
                {
                    "part_number": int(part["PartNumber"]),
                    "size_bytes": int(part["Size"]),
                    "etag": str(part["ETag"]),
                }
                for part in response.get("Parts", [])
            ]

        return await asyncio.to_thread(load)

    async def complete_multipart_upload(
        self, key: str, upload_id: str, parts: list[dict[str, int | str]]
    ) -> None:
        await asyncio.to_thread(
            self.client.complete_multipart_upload,
            Bucket=self.bucket,
            Key=key,
            UploadId=upload_id,
            MultipartUpload={
                "Parts": [
                    {
                        "PartNumber": int(part["part_number"]),
                        "ETag": str(part["etag"]),
                    }
                    for part in parts
                ]
            },
        )

    async def abort_multipart_upload(self, key: str, upload_id: str) -> None:
        await asyncio.to_thread(
            self.client.abort_multipart_upload,
            Bucket=self.bucket,
            Key=key,
            UploadId=upload_id,
        )

    async def download_to(self, key: str, target: Path) -> None:
        await asyncio.to_thread(self.client.download_file, self.bucket, key, str(target))

    def attachment_download_url(self, key: str, filename: str, ttl: int) -> str:
        """Принудительное скачивание с сохранением Unicode-имени файла."""
        fallback = "".join(
            c if c.isascii() and (c.isalnum() or c in "._-") else "_" for c in filename
        )
        disposition = (
            f'attachment; filename="{fallback or "attachment"}"; '
            f"filename*=UTF-8''{quote(filename)}"
        )
        return self.client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                "ResponseContentDisposition": disposition,
            },
            ExpiresIn=ttl,
        )

    async def size(self, key: str) -> int:
        response = await asyncio.to_thread(self.client.head_object, Bucket=self.bucket, Key=key)
        return int(response["ContentLength"])

    async def health(self) -> None:
        """Проверить доступ к бакету без чтения пользовательских объектов."""
        await asyncio.to_thread(self.client.head_bucket, Bucket=self.bucket)

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
            # Некоторые S3-совместимые прокси не реализуют DeleteObjects.
            # Частей у загрузки не больше 64, поэтому совместимость важнее батча.
            for key in keys:
                self.client.delete_object(Bucket=self.bucket, Key=key)

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
