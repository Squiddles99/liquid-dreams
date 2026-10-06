"""Run: python -m unittest tools/test_plateArt.py"""
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import plateArt  # noqa: E402


def synthetic():
    """Flat magenta with a sand block and a leafy green disc, edges blended into the magenta like a real render."""
    h, w = 120, 160
    img = np.zeros((h, w, 3), np.float32)
    img[:] = (255, 0, 255)
    yy, xx = np.mgrid[0:h, 0:w]
    sand = (yy > 80).astype(np.float32)
    leaf = np.clip(20 - np.hypot(xx - 80, yy - 60), 0, 1)  # 1 inside, a 1 px blended rim
    for cover, colour in ((sand, (200, 170, 130)), (leaf, (70, 120, 50))):
        img = img * (1 - cover[..., None]) + np.array(colour, np.float32) * cover[..., None]
    return img.astype(np.uint8)


class KeyTest(unittest.TestCase):
    def test_background_is_transparent(self):
        out = plateArt.key(synthetic())
        self.assertLess(out[:10, :10, 3].max(), 0.01)

    def test_no_magenta_left_on_any_visible_pixel(self):
        out = plateArt.key(synthetic())
        rgb, a = out[..., :3] * 255, out[..., 3]
        score = np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1]
        self.assertEqual(int(((score > 40) & (a > 0.05)).sum()), 0)

    def test_sand_and_leaves_keep_their_colour(self):
        out = plateArt.key(synthetic())
        np.testing.assert_allclose(out[100, 20, :3] * 255, (200, 170, 130), atol=1)
        np.testing.assert_allclose(out[60, 80, :3] * 255, (70, 120, 50), atol=1)
        self.assertGreater(out[100, 20, 3], 0.99)


class FlowPackTest(unittest.TestCase):
    def test_pack_round_trips_to_a_sixteenth_of_a_pixel(self):
        rng = np.random.default_rng(1)
        flow = rng.uniform(-7.9, 7.9, (80, 135, 240, 2)).astype(np.float32)
        atlas = plateArt.pack_flow(flow)
        self.assertEqual(atlas.size, (2400, 1080))
        back = plateArt.unpack_flow(atlas)
        self.assertLess(float(np.abs(back - flow).max()), 1 / 32 + 1e-6)


if __name__ == "__main__":
    unittest.main()
