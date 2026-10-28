"""Build a coverage comparison from the saved Bun LCOV reports (Python + Pillow)."""
import json
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
KEYS = ("LH", "LF", "FNH", "FNF")
TARGET = "packages/utils/src/peek-file.ts"


def read_report(name):
    result = {}
    for block in (ROOT / name / "lcov.info").read_text().split("end_of_record"):
        source = re.search(r"^SF:(.+)$", block, re.M)
        if source:
            filename = source[1].strip().replace("\\", "/")
            result[filename] = {
                key: int(re.search(r"^" + key + r":(\d+)$", block, re.M)[1])
                for key in KEYS
            }
    return result


reports = {name: read_report(name) for name in (
    "before-focused", "after-focused", "before-package", "after-package"
)}
before_files = {f for f in reports["before-package"] if f.startswith("packages/utils/src/")}
after_files = {f for f in reports["after-package"] if f.startswith("packages/utils/src/")}
assert before_files == after_files, "The measured package file sets must match"
assert all(reports["before-package"][f]["LF"] == reports["after-package"][f]["LF"] for f in before_files)
assert reports["before-focused"][TARGET]["LF"] == reports["after-focused"][TARGET]["LF"]


def total(name):
    return {key: sum(reports[name][f][key] for f in before_files) for key in KEYS}


metrics = {
    "commit": "4c6f8bb53df5bff45d3bf148ea45c79c22c60825",
    "runtime": "Bun 1.4.4; Windows x64",
    "target": TARGET,
    "target_before": reports["before-focused"][TARGET],
    "target_after": reports["after-focused"][TARGET],
    "package_before": total("before-package"),
    "package_after": total("after-package"),
    "package_measured_source_files": len(before_files),
    "package_failures_before": 2,
    "package_failures_after": 2,
    "package_skips_before": 38,
    "package_skips_after": 38,
}
(ROOT / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
print(json.dumps(metrics, indent=2))

def pct(row, numerator="LH", denominator="LF"):
    return 100 * row[numerator] / row[denominator]


image = Image.new("RGB", (1500, 1060), "#f4f6fa")
draw = ImageDraw.Draw(image)
def font(size, bold=False):
    return ImageFont.truetype("C:/Windows/Fonts/" + ("segoeuib.ttf" if bold else "segoeui.ttf"), size)
def text(x, y, value, size=25, bold=False, color="#18283b"):
    draw.text((x, y), value, font=font(size, bold), fill=color)

draw.rectangle((0, 0, 1500, 155), fill="#17304c")
text(60, 28, "ESS · Pokrytie testami pred a po zmene", 40, True, "white")
text(60, 94, "Oh My Pi | 9 nových testov | Bun 1.4.4 | 28. 10. 2026", 25, color="#dce6f1")
text(60, 182, "VYBRANÝ SÚBOR: packages/utils/src/peek-file.ts", 25, True)
b, a = metrics["target_before"], metrics["target_after"]
for x, label, row, color in ((60, "PRED · 13 testov", b, "#687c94"), (780, "PO · 22 testov", a, "#087f75")):
    draw.rounded_rectangle((x, 236, x + 660, 510), 18, fill="white")
    text(x + 30, 258, label, 27, True)
    text(x + 30, 305, f"{pct(row):.2f} %", 62, True, color)
    text(x + 30, 392, f"Pokryté riadky: {row['LH']} / {row['LF']}", 29)
    text(x + 30, 444, f"Funkcie: {row['FNH']} / {row['FNF']} (100 %)", 26)
text(60, 535, f"Zlepšenie: +{a['LH'] - b['LH']} riadky · +{pct(a) - pct(b):.2f} percentuálneho bodu", 30, True, "#087f75")
text(60, 593, "Všetkých 9 nových testov prešlo; vo vybranej sade nebol žiadny preskočený.", 25)
text(60, 639, "Zostáva 1 nepokrytý riadok: vnútorná kontrola nedosiahnuteľná cez verejné API.", 24)
text(60, 711, f"ŠIRŠIE MERANIE: {len(before_files)} načítaných súborov packages/utils/src", 25, True)
b, a = metrics["package_before"], metrics["package_after"]
text(60, 758, f"Riadky: {b['LH']} / {b['LF']} ({pct(b):.2f} %)  →  {a['LH']} / {a['LF']} ({pct(a):.2f} %)", 28)
text(60, 804, f"Funkcie: {b['FNH']} / {b['FNF']} ({pct(b, 'FNH', 'FNF'):.2f} %)  →  {a['FNH']} / {a['FNF']} ({pct(a, 'FNH', 'FNF'):.2f} %)", 26)
text(60, 858, "Širší beh: 2 pôvodné zlyhania a 38 preskočených testov pred aj po zmene.", 24)
text(60, 903, "Ide o merané TypeScript súbory, nie celý OMP ani jeho Rust časť.", 24)
draw.line((60, 967, 1440, 967), fill="#cbd4e1", width=2)
text(60, 986, "Zdroj: uložené Bun LCOV reporty · základ main@4c6f8bb53df5 · bez úpravy produkčného kódu", 21)
image.save(ROOT / "coverage-porovnanie.png")
