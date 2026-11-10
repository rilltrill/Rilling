"""PIXEL CAST 2 look-dev: the four looks of one scene side by side (2 x 2), labelled.
   python3 scripts/cast-sheet.py <prefix> "<title>"   reads <prefix>-0|a|b|c.png, writes <prefix>-sheet.png"""
import sys
from PIL import Image, ImageDraw

prefix, title = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else ''
NAMES = {'0': '0  BEFORE (contour shading)', 'a': 'A  STRICT CEL', 'b': 'B  CEL + ACCENTS', 'c': 'C  DRAWN + TEXTURED'}
ims = {k: Image.open(f'{prefix}-{k}.png').convert('RGB') for k in '0abc'}
w, h = ims['0'].size
pad, bar = 8, 22
sheet = Image.new('RGB', (w * 2 + pad * 3, (h + bar) * 2 + pad * 3 + 18), (16, 16, 22))
d = ImageDraw.Draw(sheet)
d.text((pad, 4), title, fill=(255, 220, 120))
for i, k in enumerate('0abc'):
    x = pad + (i % 2) * (w + pad)
    y = 18 + pad + (i // 2) * (h + bar + pad)
    d.text((x + 2, y + 4), NAMES[k], fill=(240, 240, 240))
    sheet.paste(ims[k], (x, y + bar))
sheet.save(f'{prefix}-sheet.png')
print(f'{prefix}-sheet.png', sheet.size)
