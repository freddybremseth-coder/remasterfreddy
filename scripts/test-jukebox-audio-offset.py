#!/usr/bin/env python3
"""Fail-closed source-excerpt tests for private Jukebox composition."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

def load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"),
        Path(__file__).with_name(name))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

sections = load("compose-jukebox-sections.py")

class SourceOffsetTests(unittest.TestCase):
    def test_exact_audio_input_seek_preserves_local_scene_clock(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in ("original.wav", "cabinet.mp4", "photo-scene-00.mp4"):
                (root/name).write_bytes(b"test-only")
            assignments=[{"section":"outro","clip":"photo-scene-00.mp4",
                          "start":0.5,"end":2.0}]
            with patch.object(sections.composer,"probe_media",return_value=6.0), \
                 patch.object(sections.composer,"media_duration",return_value=2.0), \
                 patch.object(sections.subprocess,"run") as ffmpeg:
                plan = sections.compose_sections(root/"original.wav",
                    root/"cabinet.mp4",[root/"photo-scene-00.mp4"],
                    assignments,root/"result.mp4",True,seconds=2.0,audio_start=3.0)
                self.assertEqual(plan[0]["start"],0)
                self.assertEqual(plan[0]["end"],0.5)
                args=ffmpeg.call_args.args[0]
                audio_index=args.index(str(root/"original.wav"))
                self.assertEqual(args[audio_index-3:audio_index],["-ss","3.000","-i"])
                self.assertEqual(args[args.index("-t")+1],"2.000")
                self.assertIn("-map",args)
            # A 3-second offset into a six-second master leaves two seconds.
            with patch.object(sections.composer,"probe_media",return_value=6.0):
                with self.assertRaisesRegex(ValueError,"extends past"):
                    sections.compose_sections(root/"original.wav",
                        root/"cabinet.mp4",[root/"photo-scene-00.mp4"],
                        assignments,root/"invalid.mp4",True,seconds=4.0,audio_start=3.0)

    def test_offset_requires_bounded_short_and_finite_nonnegative_seconds(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for name in ("original.wav","cabinet.mp4","photo-scene-00.mp4"):
                (root/name).write_bytes(b"x")
            plan=[{"section":"opening","clip":"photo-scene-00.mp4","start":0,"end":2}]
            with patch.object(sections.composer,"probe_media",return_value=6.0):
                for start,duration in [(-1,2),(float("nan"),2),(3,None),(6,1)]:
                    with self.subTest(start=start,duration=duration):
                        with self.assertRaises(ValueError):
                            sections.compose_sections(root/"original.wav",
                                root/"cabinet.mp4",[root/"photo-scene-00.mp4"],
                                plan,root/"blocked.mp4",True,
                                seconds=duration,audio_start=start)

if __name__=="__main__":
    unittest.main()
