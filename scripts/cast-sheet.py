"""PIXEL CAST 2 look-dev: the two looks of one scene side by side, labelled.
   python3 scripts/cast-sheet.py <prefix> "<title>"   reads <prefix>-0.png and <prefix>-b.png, writes <prefix>-sheet.png"""
import sys
from PIL import Image, ImageDraw

prefix, title = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else ''
NAMES = {'0': '0  BEFORE (contour shading)', 'b': 'B  CEL'}
ims = {k: Image.open(f'{prefix}-{k}.png').convert('RGB') for k in '0b'}
w, h = ims['0'].size
pad, bar = 8, 22
sheet = Image.new('RGB', (w + pad * 2, (h + bar) * 2 + pad * 3 + 18), (16, 16, 22))
d = ImageDraw.Draw(sheet)
d.text((pad, 4), title, fill=(255, 220, 120))
for i, k in enumerate('0b'):
    x = pad
    y = 18 + pad + i * (h + bar + pad)
    d.text((x + 2, y + 4), NAMES[k], fill=(240, 240, 240))
    sheet.paste(ims[k], (x, y + bar))
sheet.save(f'{prefix}-sheet.png')
print(f'{prefix}-sheet.png', sheet.size)
