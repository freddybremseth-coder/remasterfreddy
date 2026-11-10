#!/usr/bin/env python3
"""Tests for the optional hybrid Jukebox + music-video composer."""
import importlib.util
import math
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

script = Path(__file__).with_name("compose-jukebox-video.py")
spec = importlib.util.spec_from_file_location("compose_jukebox_video", script)
composer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(composer)


class HybridTimingTest(unittest.TestCase):
    def test_long_video_has_30_second_intro_and_15_second_outro(self):
        self.assertEqual(composer.timings(240, False), (30, 195, 15))

    def test_short_uses_short_caps(self):
        intro, main, outro = composer.timings(30, True)
        self.assertEqual((intro, main, outro), (3, 24, 3))

    def test_short_songs_preserve_middle(self):
        for portrait in (False, True):
            opening, middle, ending = composer.timings(20, portrait)
            self.assertGreater(middle, 0)
            self.assertAlmostEqual(opening + middle + ending, 20)

    def test_invalid_audio_duration(self):
        with self.assertRaises(ValueError):
            composer.timings(.01, False)


@unittest.skipUnless(all(shutil.which(x) for x in ("ffmpeg", "ffprobe")), "FFmpeg unavailable")
class HybridVideoSmokeTest(unittest.TestCase):
    def test_composition_keeps_audio_and_dimensions(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            audio = directory / "audio.wav"
            jukebox = directory / "jukebox.mp4"
            content = directory / "visual.mp4"
            output = directory / "hybrid.mp4"
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=3", audio], check=True)
            for target, color in ((jukebox, "red"), (content, "blue")):
                subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "lavfi", "-i", f"color=c={color}:s=320x180:d=1:r=25",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", target], check=True)
            intro, middle, outro = composer.compose(
                audio, jukebox, content, output, False, seconds=2.0)
            self.assertAlmostEqual(intro + middle + outro, 2.0)
            self.assertTrue(output.is_file())
            self.assertGreater(output.stat().st_size, 20_000)
            self.assertLess(abs(composer.media_duration(output) - 2), .5)


if __name__ == "__main__":
    unittest.main()
