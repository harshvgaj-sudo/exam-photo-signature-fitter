import sys
from pypdf import PdfReader

src = r"C:\Users\harsh\Downloads\photo_upload_guide.pdf"
out = r"C:\Users\harsh\WorkBuddy AI\2026-09-14-10-03-21\govdocs-review\_verify\pdf_text.txt"

reader = PdfReader(src)
lines = []
lines.append("pages: %d" % len(reader.pages))
for i, page in enumerate(reader.pages, 1):
    lines.append("")
    lines.append("=" * 70)
    lines.append("PAGE %d" % i)
    lines.append("=" * 70)
    try:
        txt = page.extract_text() or ""
    except Exception as e:
        txt = "<<extract error: %r>>" % (e,)
    lines.append(txt)

with open(out, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print("wrote", out)
print("chars:", sum(len(l) for l in lines))
