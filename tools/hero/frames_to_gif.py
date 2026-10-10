"""A clip's rendered frames as a looping GIF: py -3.11 tools/hero/frames_to_gif.py <frames dir> <out.gif> [fps]"""
import glob
import sys

from PIL import Image

d, out = sys.argv[1:3]
fps = int(sys.argv[3]) if len(sys.argv) > 3 else 24
frames = [Image.open(p).convert("RGB") for p in sorted(glob.glob(f"{d}/*.png"))]
frames[0].save(out, save_all=True, append_images=frames[1:], duration=round(1000 / fps), loop=0, optimize=True)
print(f"{out}: {len(frames)} frames")
