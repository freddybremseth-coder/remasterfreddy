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

    def test_storyboard_cuts_cover_entire_song(self):
        plan = composer.scene_plan(240, False, [
            Path("scene-a.mp4"), Path("scene-b.mp4"), Path("scene-c.mp4")
        ])
        self.assertEqual([entry["kind"] for entry in plan],
                         ["jukebox_intro", "music_video", "music_video",
                          "music_video", "jukebox_outro"])
        self.assertEqual(plan[0]["duration"], 30)
        self.assertEqual(plan[-1]["start"], 225)
        self.assertEqual(plan[-1]["duration"], 15)
        for current, following in zip(plan, plan[1:]):
            self.assertAlmostEqual(current["start"] + current["duration"],
                                   following["start"], places=2)
        self.assertEqual(plan[2]["clip"], "scene-b.mp4")

    def test_storyboard_rejects_missing_scenes(self):
        with self.assertRaises(ValueError):
            composer.scene_plan(240, False, [])

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
            second_content = directory / "visual-second.mp4"
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=3", audio], check=True)
            for target, color in ((jukebox, "red"), (content, "blue"), (second_content, "green")):
                subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "lavfi", "-i", f"color=c={color}:s=320x180:d=1:r=25",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", target], check=True)
            intro, middle, outro = composer.compose(
                audio, jukebox, content, output, False, seconds=2.0)
            self.assertAlmostEqual(intro + middle + outro, 2.0)
            self.assertTrue(output.is_file())
            self.assertGreater(output.stat().st_size, 20_000)
            self.assertLess(abs(composer.media_duration(output) - 2), .5)
            # A varied middle must also render with two distinct supplied clips.
            intro, middle, outro = composer.compose(
                audio, jukebox, [content, second_content], output, False, seconds=2.0)
            self.assertAlmostEqual(intro + middle + outro, 2.0)
            self.assertLess(abs(composer.media_duration(output) - 2), .5)

    def test_preflight_rejects_wrong_stream_types_and_corrupt_files(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            audio = directory / "sound.wav"
            video = directory / "silent.mp4"
            corrupt = directory / "broken.mp4"
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
                audio], check=True)
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "color=c=blue:s=320x180:d=1",
                "-an", "-c:v", "libx264", video], check=True)
            corrupt.write_bytes(b"not a media file")
            self.assertGreater(composer.probe_media(audio, "audio"), 0)
            self.assertGreater(composer.probe_media(video, "video"), 0)
            with self.assertRaisesRegex(ValueError, "Missing valid video"):
                composer.probe_media(audio, "video")
            with self.assertRaisesRegex(ValueError, "Missing valid audio"):
                composer.probe_media(video, "audio")
            with self.assertRaisesRegex(ValueError, "Cannot read video"):
                composer.probe_media(corrupt, "video")
            with self.assertRaisesRegex(ValueError, "Missing valid video"):
                composer.compose(audio, audio, [video], directory / "out.mp4",
                                 False, seconds=1)

    def test_requires_approved_middle_clips(self):
        with self.assertRaises(ValueError):
            composer.compose(Path("audio.wav"), Path("jukebox.mp4"), [],
                             Path("hybrid.mp4"), False)


if __name__ == "__main__":
    unittest.main()
