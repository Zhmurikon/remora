"""Контракт безопасной обработки SVG не зависит от S3 и HTTP."""

import pytest

from app.core.svg import sanitize_svg


def test_keeps_graphics_internal_references_and_viewbox_dimensions() -> None:
    payload = b"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
      <defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs>
      <rect width="320" height="180" fill="url(#g)"/>
      <use href="#shape" x="10" y="10"/>
    </svg>"""

    cleaned, width, height = sanitize_svg(payload, 100_000)

    assert (width, height) == (320, 180)
    assert b"linearGradient" in cleaned
    assert b"url(#g)" in cleaned
    assert b'href="#shape"' in cleaned


@pytest.mark.parametrize(
    "payload",
    [
        b'<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="10"></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg" width="0" height="10"></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 nope 10"></svg>',
        b'<html xmlns="http://www.w3.org/1999/xhtml"></html>',
    ],
)
def test_rejects_svg_without_safe_dimensions(payload: bytes) -> None:
    with pytest.raises(ValueError):
        sanitize_svg(payload, 100_000)


def test_rejects_svg_exceeding_pixel_limit() -> None:
    with pytest.raises(ValueError, match="dimensions"):
        sanitize_svg(b'<svg width="1000" height="1000"></svg>', 999_999)
