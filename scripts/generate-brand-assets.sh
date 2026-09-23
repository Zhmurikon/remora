#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
source_png="$repo_root/packages/ui/src/assets/remora-mascot-source.png"
assets_dir="$repo_root/packages/ui/src/assets"
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

for command_name in convert potrace; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Для генерации бренд-ассетов нужна команда $command_name" >&2
    exit 1
  fi
done

if [[ ! -f "$source_png" ]]; then
  echo "Не найден исходник: $source_png" >&2
  exit 1
fi

convert xc:none xc:'#0D8285' xc:white xc:'#EA8D2F' +append "$work_dir/palette.png"
convert "$source_png" +dither -remap "$work_dir/palette.png" "$assets_dir/remora-mark.png"

trace_layer() {
  local name=$1
  local red=$2
  local green=$3
  local blue=$4

  convert "$assets_dir/remora-mark.png" \
    -fx "(a>0.5 && abs(r-$red)<0.01 && abs(g-$green)<0.01 && abs(b-$blue)<0.01)?0:1" \
    -threshold 50% "$work_dir/$name.pgm"
  potrace "$work_dir/$name.pgm" --svg --flat --turdsize 8 --alphamax 1.0 \
    --opttolerance 0.25 -o "$work_dir/$name.svg"
}

trace_layer teal 0.05098 0.50980 0.52157
trace_layer white 1 1 1
trace_layer orange 0.91765 0.55294 0.18431

{
  printf '%s\n' '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254" role="img" aria-labelledby="remora-mark-title remora-mark-description">'
  printf '%s\n' '  <title id="remora-mark-title">Remora</title>'
  printf '%s\n' '  <desc id="remora-mark-description">Серьёзная рыба-ремора в очках читает книгу</desc>'
  for layer in teal white orange; do
    case "$layer" in
      teal) color='#0D8285' ;;
      white) color='#FFFFFF' ;;
      orange) color='#EA8D2F' ;;
    esac
    sed -n '/<g /,/<\/g>/p' "$work_dir/$layer.svg" | sed "s/fill=\"#000000\"/fill=\"$color\"/"
  done
  printf '%s\n' '</svg>'
} > "$assets_dir/remora-mark.svg"

convert "$assets_dir/remora-mark.png" -crop 620x620+500+180 +repage \
  "$assets_dir/remora-mark-compact.png"
sed \
  -e 's/viewBox="0 0 1254 1254"/viewBox="500 180 620 620"/' \
  -e 's/Серьёзная рыба-ремора в очках читает книгу/Лицо серьёзной реморы в очках над книгой/' \
  "$assets_dir/remora-mark.svg" > "$assets_dir/remora-mark-compact.svg"

write_horizontal_logo() {
  local output=$1
  local text_color=$2
  {
    printf '%s\n' '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 512" role="img" aria-label="Remora">'
    printf '%s\n' '  <g transform="scale(0.40829346)">'
    sed -n '/<g /,/<\/g>/p' "$assets_dir/remora-mark.svg"
    printf '%s\n' '  </g>'
    printf '%s\n' "  <text x=\"560\" y=\"336\" fill=\"$text_color\" font-family=\"Inter, 'Segoe UI', sans-serif\" font-size=\"230\" font-weight=\"700\">Remora</text>"
    printf '%s\n' '</svg>'
  } > "$output"
}

write_stacked_logo() {
  local output=$1
  local text_color=$2
  {
    printf '%s\n' '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1180" role="img" aria-label="Remora">'
    printf '%s\n' '  <g transform="translate(112 0) scale(0.63795853)">'
    sed -n '/<g /,/<\/g>/p' "$assets_dir/remora-mark.svg"
    printf '%s\n' '  </g>'
    printf '%s\n' "  <text x=\"512\" y=\"1060\" fill=\"$text_color\" text-anchor=\"middle\" font-family=\"Inter, 'Segoe UI', sans-serif\" font-size=\"230\" font-weight=\"700\">Remora</text>"
    printf '%s\n' '</svg>'
  } > "$output"
}

write_horizontal_logo "$assets_dir/remora-logo-horizontal.svg" '#1C2424'
write_horizontal_logo "$assets_dir/remora-logo-horizontal-inverse.svg" '#FFFFFF'
write_stacked_logo "$assets_dir/remora-logo-stacked.svg" '#1C2424'
write_stacked_logo "$assets_dir/remora-logo-stacked-inverse.svg" '#FFFFFF'

convert -background none "$assets_dir/remora-logo-horizontal.svg" "$assets_dir/remora-logo-horizontal.png"
convert -background none "$assets_dir/remora-logo-horizontal-inverse.svg" "$assets_dir/remora-logo-horizontal-inverse.png"
convert -background none "$assets_dir/remora-logo-stacked.svg" "$assets_dir/remora-logo-stacked.png"
convert -background none "$assets_dir/remora-logo-stacked-inverse.svg" "$assets_dir/remora-logo-stacked-inverse.png"

for app_dir in "$repo_root/apps/web/public" "$repo_root/apps/app/public"; do
  mkdir -p "$app_dir/icons"
  for size in 16 32 48 192 512; do
    convert "$assets_dir/remora-mark-compact.png" -resize "${size}x${size}" \
      "$app_dir/icons/icon-$size.png"
  done
  for size in 192 512; do
    inner_size=$((size * 72 / 100))
    convert -size "${size}x${size}" xc:'#FAFAF9' \
      \( "$assets_dir/remora-mark-compact.png" -resize "${inner_size}x${inner_size}" \) \
      -gravity center -compose over -composite "$app_dir/icons/icon-maskable-$size.png"
  done
done

for apple_icon in \
  "$repo_root/apps/web/src/app/apple-icon.png" \
  "$repo_root/apps/app/public/apple-touch-icon.png"; do
  convert -size 180x180 xc:'#FAFAF9' \
    \( "$assets_dir/remora-mark-compact.png" -resize 162x162 \) \
    -gravity center -compose over -composite "$apple_icon"
done

cp "$assets_dir/remora-mark-compact.svg" "$repo_root/apps/web/src/app/icon.svg"
cp "$assets_dir/remora-mark-compact.svg" "$repo_root/apps/app/public/favicon.svg"
cp "$assets_dir/remora-mark-compact.svg" "$repo_root/apps/mobile/assets/remora-mark.svg"

convert \
  "$repo_root/apps/app/public/icons/icon-16.png" \
  "$repo_root/apps/app/public/icons/icon-32.png" \
  "$repo_root/apps/app/public/icons/icon-48.png" \
  "$repo_root/apps/app/public/favicon.ico"
cp "$repo_root/apps/app/public/favicon.ico" "$repo_root/apps/web/src/app/favicon.ico"

brand_dir="$repo_root/assets/brand"
mkdir -p "$brand_dir/source" "$brand_dir/mark" "$brand_dir/lockups" "$brand_dir/icons"
cp "$source_png" "$brand_dir/source/remora-mascot-source.png"
cp "$assets_dir/remora-mark.svg" "$assets_dir/remora-mark.png" \
  "$assets_dir/remora-mark-compact.svg" "$assets_dir/remora-mark-compact.png" \
  "$brand_dir/mark/"
cp "$assets_dir"/remora-logo-horizontal*.svg "$assets_dir"/remora-logo-horizontal*.png \
  "$assets_dir"/remora-logo-stacked*.svg "$assets_dir"/remora-logo-stacked*.png \
  "$brand_dir/lockups/"
cp "$repo_root/apps/app/public/favicon.svg" "$repo_root/apps/app/public/favicon.ico" \
  "$repo_root/apps/app/public/apple-touch-icon.png" "$repo_root/apps/app/public/icons"/*.png \
  "$brand_dir/icons/"
