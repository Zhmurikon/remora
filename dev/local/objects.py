"""Потоковая копия объектов приложения. Ключи и имена пользователей в лог не выводятся."""

import json
import shutil
import sys
import zlib
from zipfile import ZIP_STORED, ZipFile

from app.core.config import get_settings
from app.core.storage import get_object_storage

settings = get_settings()
s3 = get_object_storage().client
buckets = [settings.s3_bucket_media, settings.s3_bucket_audio]
fields = (
    "ContentType",
    "ContentEncoding",
    "ContentLanguage",
    "CacheControl",
    "ContentDisposition",
    "Metadata",
)

if sys.argv[1] == "export":
    manifest = []
    with ZipFile(sys.stdout.buffer, "w", ZIP_STORED) as archive:
        for bucket in buckets:
            for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket):
                for obj in page.get("Contents", []):
                    key = obj["Key"]
                    response = s3.get_object(
                        Bucket=bucket, Key=key, IfMatch=obj["ETag"]
                    )
                    name = f"data/{len(manifest)}"
                    with (
                        response["Body"] as body,
                        archive.open(name, "w", force_zip64=True) as dest,
                    ):
                        shutil.copyfileobj(body, dest)
                    manifest.append(
                        {
                            "bucket": bucket,
                            "key": key,
                            "size": response["ContentLength"],
                            "member": name,
                            "headers": {
                                k: response[k] for k in fields if k in response
                            },
                        }
                    )
        archive.writestr("manifest.json", json.dumps(manifest))
elif sys.argv[1] == "restore":
    if settings.s3_endpoint != "http://s3.localhost:9100" or not settings.is_local:
        raise SystemExit("Восстановление допускается только в локальное хранилище")
    with ZipFile(sys.argv[2]) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        # Повторный запуск после обрыва пропускает только уже сверенные объекты.
        existing = {
            (bucket, obj["Key"])
            for bucket in buckets
            for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket)
            for obj in page.get("Contents", [])
        }
        expected = {(item["bucket"], item["key"]) for item in manifest}
        if existing - expected:
            raise SystemExit("В локальных бакетах есть объекты вне снимка")
        for item in manifest:
            if (
                item["bucket"] not in buckets
                or archive.getinfo(item["member"]).file_size != item["size"]
            ):
                raise ValueError("Некорректный объект в архиве")
            if (item["bucket"], item["key"]) in existing:
                response = s3.get_object(Bucket=item["bucket"], Key=item["key"])
                crc = 0
                with response["Body"] as body:
                    for chunk in iter(lambda: body.read(1024 * 1024), b""):
                        crc = zlib.crc32(chunk, crc)
                if crc != archive.getinfo(item["member"]).CRC or any(
                    response.get(k) != v for k, v in item["headers"].items()
                ):
                    raise SystemExit("Локальная копия объекта отличается от архива")
                continue
            with archive.open(item["member"]) as body:
                s3.upload_fileobj(
                    body, item["bucket"], item["key"], ExtraArgs=item["headers"]
                )
            if (
                s3.head_object(Bucket=item["bucket"], Key=item["key"])["ContentLength"]
                != item["size"]
            ):
                raise ValueError("Не совпал размер восстановленного объекта")
        print(f"Проверено объектов: {len(manifest)}")
else:
    raise SystemExit("export | restore <zip>")
