# /// script
# requires-python = ">=3.11"
# dependencies = ["beautifulsoup4>=4.12,<5", "protego>=0.4,<1", "requests>=2.32,<3"]
# ///
"""Инвентаризация публичного HTML. См. ../tools.md; вывод — один JSON на строку."""

import argparse
import json
import re
import sys
import time
from collections import deque
from urllib.parse import urldefrag, urljoin, urlsplit
from xml.etree import ElementTree as ET

import requests
from bs4 import BeautifulSoup
from protego import Protego

AGENT = "ZapominalnyaSeoAudit"
LIMIT = 8 * 1024 * 1024
# Автоматически посещаем только известные публичные семейства URL без параметров.
PUBLIC = re.compile(
    r"/(?:|kursy|tarify|privacy|terms|en/(?:terms|privacy)|(?:kurs|avtor|nabor)/[^/]+|podborki(?:/[^/]+)?|blog(?:/[^/]+|/stranitsa/[0-9]+)?)/?$"
)


def emit(kind, **data):
    print(json.dumps({"kind": kind, **data}, ensure_ascii=False), flush=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--base", default="https://zapominalnya.ru")
    p.add_argument(
        "--limit", type=int, default=100, help="предельное число запросов страниц"
    )
    opt = p.parse_args()
    root = opt.base.rstrip("/") + "/"
    origin = urlsplit(root)
    if (
        origin.scheme not in ("http", "https")
        or not origin.hostname
        or origin.username
        or origin.path != "/"
        or origin.query
        or origin.fragment
        or not 1 <= opt.limit <= 10000
    ):
        p.error("ожидаются origin без пути и limit от 1 до 10000")
    session = requests.Session()
    # Для гостевого обхода не нужны сохранённые в netrc учётные данные.
    session.trust_env = False
    session.headers["User-Agent"] = AGENT
    rules = Protego.parse("")
    delay = 1.0
    queued = {root}
    todo = deque([root])
    seen_maps = set()
    attempted = failures = 0

    def get(url):
        time.sleep(delay)
        session.cookies.clear()
        with session.get(url, timeout=(5, 15), allow_redirects=False, stream=True) as r:
            if r.status_code == 429 or r.status_code >= 500:
                raise RuntimeError(f"{url}: HTTP {r.status_code}, обход остановлен")
            body = bytearray()
            for part in r.iter_content(65536):
                body.extend(part)
                if len(body) > LIMIT:
                    raise ValueError("ответ больше 8 МиБ")
            return r, bytes(body)

    def same(url):
        u = urlsplit(url)
        return (u.scheme, u.netloc) == (origin.scheme, origin.netloc)

    def eligible(url):
        u = urlsplit(url)
        return same(url) and not u.query and PUBLIC.fullmatch(u.path)

    def enqueue(url):
        if eligible(url) and url not in queued:
            queued.add(url)
            todo.append(url)

    def read_map(url):
        if url in seen_maps:
            return
        if len(seen_maps) >= 50 or not same(url) or not rules.can_fetch(url, AGENT):
            raise ValueError("карта вне области обхода или запрещена")
        seen_maps.add(url)
        r, body = get(url)
        if r.status_code != 200:
            raise ValueError(f"sitemap: HTTP {r.status_code}")
        tree = ET.fromstring(body)
        tag = tree.tag.split("}")[-1]
        if tag not in ("urlset", "sitemapindex"):
            raise ValueError("неизвестный формат sitemap")
        for loc in tree.findall("./{*}*/{*}loc"):
            target = (loc.text or "").strip()
            if tag == "sitemapindex":
                read_map(target)
            else:
                emit("sitemap", url=target, source=url)
                enqueue(target)

    r, body = get(urljoin(root, "robots.txt"))
    emit(
        "robots",
        status=r.status_code,
        text=body.decode("utf-8-sig", "replace") if r.ok else "",
    )
    if r.status_code == 200:
        rules = Protego.parse(body.decode("utf-8-sig", "replace"))
        delay = max(delay, rules.crawl_delay(AGENT) or 0)
    elif r.status_code not in (404, 410):
        raise ValueError(f"robots: HTTP {r.status_code}")
    for sitemap in list(rules.sitemaps) or [urljoin(root, "sitemap.xml")]:
        read_map(sitemap)
    while todo and attempted < opt.limit:
        url = todo.popleft()
        if not rules.can_fetch(url, AGENT):
            emit("blocked", url=url)
            continue
        attempted += 1
        try:
            r, body = get(url)
        except (ValueError, requests.RequestException) as exc:
            emit("error", url=url, message=str(exc))
            failures += 1
            continue
        row = {
            "url": url,
            "status": r.status_code,
            "location": r.headers.get("Location"),
            "x_robots": r.headers.get("X-Robots-Tag"),
            "content_type": r.headers.get("Content-Type"),
        }
        if r.is_redirect:
            enqueue(urldefrag(urljoin(url, r.headers["Location"]))[0])
        if r.status_code == 200 and "text/html" in (row["content_type"] or "").lower():
            soup = BeautifulSoup(
                body,
                "html.parser",
                from_encoding=r.encoding
                if "charset=" in row["content_type"].lower()
                else None,
            )
            row.update(
                title=[t.get_text(strip=True) for t in soup.select("title")],
                h1=[t.get_text(" ", strip=True) for t in soup.select("h1")],
                description=[
                    t.get("content") for t in soup.select('meta[name="description" i]')
                ],
                robots=[
                    (t.get("name"), t.get("content"))
                    for t in soup.select(
                        'meta[name="robots" i],meta[name="googlebot" i],meta[name="yandex" i]'
                    )
                ],
                canonical=[
                    t.get("href") for t in soup.select('link[rel~="canonical" i]')
                ],
                jsonld_blocks=len(soup.select('script[type="application/ld+json" i]')),
            )
            base_tag = soup.select_one("base[href]")
            base = urljoin(url, base_tag["href"]) if base_tag else url
            targets = {
                urldefrag(urljoin(base, a["href"]))[0] for a in soup.select("a[href]")
            }
            for target in sorted(t for t in targets if eligible(t)):
                emit("link", source=url, target=target)
                enqueue(target)
        emit("page", **row)
    emit("end", attempted=attempted, pending=len(todo), errors=failures)
    return int(bool(failures or todo))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, RuntimeError, requests.RequestException, ET.ParseError) as exc:
        emit("aborted", message=str(exc))
        sys.exit(2)
