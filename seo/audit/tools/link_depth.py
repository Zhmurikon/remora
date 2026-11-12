"""Расстояние от главной по HTML-ссылкам на основе crawl.jsonl."""

import argparse
import csv
import json
import sys
from collections import defaultdict, deque
from urllib.parse import urldefrag, urljoin

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("crawl")
p.add_argument("--root", default="https://zapominalnya.ru/")
args = p.parse_args()
edges = defaultdict(set)
incoming = defaultdict(set)
redirects = {}
urls = set()
pages = set()
in_map = set()
end = {}
with open(args.crawl, encoding="utf-8") as src:
    for line in src:
        row = json.loads(line)
        kind = row["kind"]
        if kind == "sitemap":
            in_map.add(row["url"])
            urls.add(row["url"])
        elif kind == "page":
            pages.add(row["url"])
            urls.add(row["url"])
            if row["status"] in (301, 302, 303, 307, 308) and row["location"]:
                redirects[row["url"]] = urldefrag(urljoin(row["url"], row["location"]))[
                    0
                ]
        elif kind == "link":
            a, b = row["source"], row["target"]
            edges[a].add(b)
            urls.update((a, b))
            if a != b:
                incoming[b].add(a)
        elif kind in ("end", "aborted"):
            end = row
if args.root not in pages:
    sys.exit("Нет ответа главной: проверьте --root и состояние обхода.")
# Редирект не требует клика и не считается отдельной входящей HTML-ссылкой.
dist = {args.root: 0}
queue = deque([args.root])
while queue:
    url = queue.popleft()
    if url in redirects:
        dest = redirects[url]
        if dest in urls and dist[url] < dist.get(dest, float("inf")):
            dist[dest] = dist[url]
            queue.appendleft(dest)
    for dest in edges[url]:
        if dist[url] + 1 < dist.get(dest, float("inf")):
            dist[dest] = dist[url] + 1
            queue.append(dest)
writer = csv.writer(sys.stdout)
writer.writerow(["url", "in_sitemap", "incoming_html_sources", "clicks_from_root"])
for url in sorted(urls):
    writer.writerow([url, int(url in in_map), len(incoming[url]), dist.get(url, "")])
if end.get("kind") != "end" or end.get("pending") or end.get("errors"):
    sys.exit("Неполный обход: недостижимость нельзя интерпретировать.")
