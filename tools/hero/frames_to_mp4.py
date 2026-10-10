"""A clip's rendered PNG frames as an H.264 MP4 (Blender's own ffmpeg, through the sequencer), so Andrew can review a
clip on any device: blender --background --python tools/hero/frames_to_mp4.py -- <frames dir> <out.mp4> [fps] [loops]"""
import glob
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
d, out = argv[:2]
fps = int(argv[2]) if len(argv) > 2 else 24
loops = int(argv[3]) if len(argv) > 3 else 1
frames = sorted(glob.glob(os.path.join(d, "*.png")))
scene = bpy.context.scene
scene.sequence_editor_create()
seqs = scene.sequence_editor.strips if hasattr(scene.sequence_editor, "strips") else scene.sequence_editor.sequences
start = 1
for i in range(loops):  # a looping clip played a few times over, so it reads as a loop
    s = seqs.new_image(f"clip{i}", frames[0], channel=1, frame_start=start)
    for f in frames[1:]:
        s.elements.append(os.path.basename(f))
    start += len(frames)
img = bpy.data.images.load(frames[0])
scene.render.resolution_x, scene.render.resolution_y = img.size
scene.render.resolution_percentage = 100
scene.render.fps = fps
scene.frame_start, scene.frame_end = 1, start - 1
st = scene.render.image_settings
if hasattr(st, "media_type"):
    st.media_type = "VIDEO"
st.file_format = "FFMPEG"
scene.render.ffmpeg.format = "MPEG4"
scene.render.ffmpeg.codec = "H264"
scene.render.ffmpeg.constant_rate_factor = "HIGH"
scene.render.filepath = out
bpy.ops.render.render(animation=True)
print("wrote", out)
