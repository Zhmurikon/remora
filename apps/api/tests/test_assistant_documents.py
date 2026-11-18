from zipfile import ZipFile

import pytest
from pypdf import PdfWriter

from app.core.errors import ValidationError
from app.services.assistant_documents import extract_document


def test_text_and_office_sources(tmp_path):
    text = tmp_path / "note.md"
    text.write_text("\ufeff# Конспект\nТекст", encoding="utf-8")
    assert extract_document(text) == "# Конспект\nТекст"
    for suffix, names in [
        ("docx", ["word/document.xml"]),
        ("pptx", ["ppt/slides/slide10.xml", "ppt/slides/slide2.xml"]),
    ]:
        path = tmp_path / f"doc.{suffix}"
        with ZipFile(path, "w") as archive:
            for name in names:
                archive.writestr(name, f'<root xmlns:w="urn:test"><w:t>{name}</w:t></root>')
        result = extract_document(path)
        assert names[0] in result
        if suffix == "pptx":
            assert result.index("slide2.xml") < result.index("slide10.xml")


def test_empty_scan_encrypted_oversized_and_xml_entities_rejected(tmp_path):
    path = tmp_path / "scan.pdf"
    writer = PdfWriter()
    writer.add_blank_page(100, 100)
    writer.write(path)
    with pytest.raises(ValidationError, match="сканы"):
        extract_document(path)
    writer.encrypt("password")
    writer.write(path)
    with pytest.raises(ValidationError, match="пароль"):
        extract_document(path)
    text = tmp_path / "long.txt"
    text.write_text("a" * 100001)
    with pytest.raises(ValidationError, match="длинный"):
        extract_document(text)
    office = tmp_path / "malicious.docx"
    with ZipFile(office, "w") as archive:
        archive.writestr(
            "word/document.xml", '<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><x>&y;</x>'
        )
    from defusedxml.common import DefusedXmlException

    with pytest.raises(DefusedXmlException):
        extract_document(office)
