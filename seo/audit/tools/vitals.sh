#!/usr/bin/env bash
# Одна публичная контрольная страница, одинаковые условия и отдельный отчёт на запуск.
set -euo pipefail
url=${1:?Передайте URL публичной страницы}
dest=${2:?Передайте новый каталог для результатов}
mkdir -p "$(dirname "$dest")"
mkdir "$dest"
lighthouse --version > "$dest/lighthouse-version.txt"
chrome_bin=${CHROME_PATH:-$(command -v google-chrome || command -v chromium)}
"$chrome_bin" --version > "$dest/chrome-version.txt"
export CHROME_PATH="$chrome_bin"
for profile in mobile desktop; do
  args=()
  if [[ $profile == desktop ]]; then args+=(--preset=desktop); fi
  for run in 1 2 3; do
    lighthouse "$url" "${args[@]}" --chrome-flags="--headless" --quiet \
      --only-categories=performance,seo --output=json --output-path="$dest/$profile-$run.json"
    jq -e '(.runtimeError == null) and (.categories.performance.score != null) and
        (.categories.seo.score != null) and (.audits["http-status-code"].score == 1)' \
      "$dest/$profile-$run.json" >/dev/null
  done
done
jq -s 'def median: sort | .[1];
  group_by(.configSettings.formFactor) | map({
    profile: .[0].configSettings.formFactor,
    final_urls: map(.finalDisplayedUrl) | unique,
    performance: map(.categories.performance.score * 100) | median,
    seo: map(.categories.seo.score * 100) | median,
    lcp_ms: map(.audits["largest-contentful-paint"].numericValue) | median,
    cls: map(.audits["cumulative-layout-shift"].numericValue) | median,
    tbt_ms: map(.audits["total-blocking-time"].numericValue) | median})' \
  "$dest"/{mobile,desktop}-{1,2,3}.json | tee "$dest/medians.json"
