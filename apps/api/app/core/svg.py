"""Санитизация пользовательских SVG перед сохранением в объектное хранилище."""

import math
import re
from xml.etree import ElementTree

from defusedxml import ElementTree as SafeElementTree

SVG_NAMESPACE = "http://www.w3.org/2000/svg"
XLINK_NAMESPACE = "http://www.w3.org/1999/xlink"
MAX_ELEMENTS = 10_000

_LENGTH = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$", re.IGNORECASE)
_URL = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.IGNORECASE)

_ALLOWED_TAGS = {
    "svg",
    "g",
    "defs",
    "symbol",
    "use",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "text",
    "tspan",
    "title",
    "desc",
    "clipPath",
    "mask",
    "linearGradient",
    "radialGradient",
    "stop",
    "pattern",
    "marker",
}

_ALLOWED_ATTRIBUTES = {
    "id",
    "class",
    "viewBox",
    "width",
    "height",
    "x",
    "y",
    "x1",
    "y1",
    "x2",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "d",
    "points",
    "transform",
    "fill",
    "fill-opacity",
    "fill-rule",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-opacity",
    "opacity",
    "color",
    "stop-color",
    "stop-opacity",
    "offset",
    "font-family",
    "font-size",
    "font-style",
    "font-weight",
    "text-anchor",
    "dominant-baseline",
    "clip-path",
    "clip-rule",
    "mask",
    "gradientUnits",
    "gradientTransform",
    "patternUnits",
    "patternContentUnits",
    "patternTransform",
    "markerWidth",
    "markerHeight",
    "markerUnits",
    "orient",
    "refX",
    "refY",
    "preserveAspectRatio",
    "role",
    "aria-label",
    "aria-labelledby",
    "focusable",
    "href",
}


def sanitize_svg(payload: bytes, max_pixels: int) -> tuple[bytes, int, int]:
    """Возвращает безопасный SVG и его размеры или отклоняет файл целиком."""
    try:
        root = SafeElementTree.fromstring(payload)
    except (ElementTree.ParseError, ValueError) as exc:
        raise ValueError("invalid SVG") from exc
    if _local_name(root.tag) != "svg":
        raise ValueError("SVG root element is required")

    elements = list(root.iter())
    if len(elements) > MAX_ELEMENTS:
        raise ValueError("SVG has too many elements")
    for parent in elements:
        for child in list(parent):
            if _local_name(child.tag) not in _ALLOWED_TAGS:
                parent.remove(child)
    for element in root.iter():
        name = _local_name(element.tag)
        if name not in _ALLOWED_TAGS:
            raise ValueError("unsupported SVG element")
        # Единое пространство имён делает результат самостоятельным SVG-файлом,
        # даже если автор прислал разметку без xmlns или с чужим namespace.
        element.tag = f"{{{SVG_NAMESPACE}}}{name}"
        _sanitize_attributes(element)

    width, height = _dimensions(root)
    if width * height > max_pixels:
        raise ValueError("image dimensions exceed allowed size")

    ElementTree.register_namespace("", SVG_NAMESPACE)
    cleaned = ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)
    return cleaned, width, height


def _sanitize_attributes(element: ElementTree.Element) -> None:
    for raw_name, value in list(element.attrib.items()):
        name = _local_name(raw_name)
        if name.lower().startswith("on") or name == "style" or name not in _ALLOWED_ATTRIBUTES:
            del element.attrib[raw_name]
            continue
        if name == "href":
            if not value.strip().startswith("#"):
                del element.attrib[raw_name]
            elif raw_name != "href":
                del element.attrib[raw_name]
                element.set("href", value.strip())
            continue
        if _contains_external_url(value):
            del element.attrib[raw_name]


def _contains_external_url(value: str) -> bool:
    return any(not match.group(2).strip().startswith("#") for match in _URL.finditer(value))


def _dimensions(root: ElementTree.Element) -> tuple[int, int]:
    width = _length(root.get("width"))
    height = _length(root.get("height"))
    view_box = root.get("viewBox", "").replace(",", " ").split()
    if (width is None or height is None) and len(view_box) == 4:
        try:
            view_width = float(view_box[2])
            view_height = float(view_box[3])
        except ValueError as exc:
            raise ValueError("invalid SVG viewBox") from exc
        width = width or view_width
        height = height or view_height
    if width is None or height is None or width <= 0 or height <= 0:
        raise ValueError("SVG requires positive width and height or viewBox")
    return math.ceil(width), math.ceil(height)


def _length(value: str | None) -> float | None:
    if value is None:
        return None
    match = _LENGTH.fullmatch(value)
    return float(match.group(1)) if match else None


def _local_name(name: str) -> str:
    return name.rsplit("}", 1)[-1]
