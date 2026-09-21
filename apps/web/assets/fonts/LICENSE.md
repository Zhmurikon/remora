# Шрифты OG-картинки

`dejavu-sans-subset.ttf` и `dejavu-sans-bold-subset.ttf` — сокращённые версии DejaVu Sans
и DejaVu Sans Bold. Оставлены только латиница, кириллица, цифры, знаки препинания,
типографские кавычки и тире (диапазоны `U+0020-007E`, `U+00A0`, `U+00AB`, `U+00BB`,
`U+0400-045F`, `U+2010-2015`, `U+2018-201F`, `U+2026`, `U+2116`, `U+00A9`), по 211 глифов
в каждом файле. Исходники — `fonts-dejavu-core`, сабсет сделан `pyftsubset`.

Шрифты нужны генератору `apps/web/src/app/opengraph-image.tsx`: без локального файла
Satori пытается загрузить шрифт с кириллицей из сети и сборка получает тайм-аут.
Публично файлы не отдаются, поэтому лежат вне `public/`.

Лицензия Bitstream Vera требует, чтобы изменённые шрифты не содержали в названии слов
«Bitstream» и «Vera», и чтобы текст лицензии сопровождал все копии.

---

Copyright (c) 2003 by Bitstream, Inc. All Rights Reserved.
Bitstream Vera is a trademark of Bitstream, Inc. DejaVu changes are in public domain.

Permission is hereby granted, free of charge, to any person obtaining a copy
of the fonts accompanying this license ("Fonts") and associated
documentation files (the "Font Software"), to reproduce and distribute the
Font Software, including without limitation the rights to use, copy, merge,
publish, distribute, and/or sell copies of the Font Software, and to permit
persons to whom the Font Software is furnished to do so, subject to the
following conditions:

The above copyright and trademark notices and this permission notice shall
be included in all copies of one or more of the Font Software typefaces.

The Font Software may be modified, altered, or added to, and in particular
the designs of glyphs or characters in the Fonts may be modified and
additional glyphs or characters may be added to the Fonts, only if the fonts
are renamed to names not containing either the words "Bitstream" or the word
"Vera".

This License becomes null and void to the extent applicable to Fonts or Font
Software that has been modified and is distributed under the "Bitstream
Vera" names.

The Font Software may be sold as part of a larger software package but no
copy of one or more of the Font Software typefaces may be sold by itself.

THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF COPYRIGHT, PATENT,
TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL BITSTREAM OR THE GNOME
FOUNDATION BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, INCLUDING
ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF
THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM OTHER DEALINGS IN THE
FONT SOFTWARE.

Except as contained in this notice, the names of Gnome, the Gnome
Foundation, and Bitstream Inc., shall not be used in advertising or
otherwise to promote the sale, use or other dealings in this Font Software
without prior written authorization from the Gnome Foundation or Bitstream
Inc., respectively. For further information, contact: fonts at gnome dot
org.
