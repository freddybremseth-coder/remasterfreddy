#!/usr/bin/env python3
"""Real FFmpeg test of exact photo windows, opening/outro and original soundtrack."""
import importlib.util
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

def load(name, alias):
    spec = importlib.util.spec_from_file_location(alias,Path(__file__).with_name(name))
    obj = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj

sections = load("compose-jukebox-sections.py","jukebox_sections")
composer = load("compose-jukebox-video.py","jukebox_main")


class TimedSectionTests(unittest.TestCase):
    def test_no_overlap_and_exact_gaps(self):
        rows = [
            {"clip":"photo-scene-00.mp4","section":"opening","start":0.0,"end":1.5},
            {"clip":"photo-scene-01.mp4","section":"verse1","start":2.0,"end":4.5},
            {"clip":"photo-scene-02.mp4","section":"outro","start":5.0,"end":6.0},
        ]
        plan = sections.build_section_plan(6.0,rows)
        self.assertEqual([row["kind"] for row in plan],
                         ["photo","jukebox","photo","jukebox","photo"])
        self.assertEqual(plan[1]["start"],1.5)
        self.assertEqual(plan[1]["end"],2.0)
        self.assertEqual(plan[-1]["section"],"outro")
        for invalid in (
            [rows[0],{**rows[1],"start":1.0}],
            [rows[0],{**rows[1],"end":12.0}],
            [{**rows[0],"clip":"../steal.mp4"}],
            [rows[0],{**rows[1],"clip":rows[0]["clip"]}],
        ):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    sections.build_section_plan(6.0,invalid)

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                         "FFmpeg not installed")
    def test_render_timed_sections_has_one_uninterrupted_song(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            song=root/"song.wav"
            cabinet=root/"jukebox.mp4"
            photos=[]
            subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y",
                "-f","lavfi","-i","sine=frequency=440:duration=6",
                str(song)],check=True,capture_output=True)
            def visual(name,color):
                output=root/name
                subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y",
                    "-f","lavfi","-i",f"color=c={color}:s=320x180:r=25:d=6",
                    "-c:v","libx264","-pix_fmt","yuv420p",str(output)],
                    check=True,capture_output=True)
                return output
            visual("jukebox.mp4","red")
            for i,color in enumerate(("blue","yellow","green")):
                photos.append(visual(f"photo-scene-{i:02d}.mp4",color))
            rows=[
              {"section":"opening","clip":photos[0].name,"start":0.0,"end":1.5},
              {"section":"verse1","clip":photos[1].name,"start":2.0,"end":4.5},
              {"section":"outro","clip":photos[2].name,"start":5.0,"end":6.0},
            ]
            output=root/"result.mp4"
            plan=sections.compose_sections(song,cabinet,photos,rows,output,False)
            self.assertEqual(len(plan),5)
            probe=json.loads(subprocess.check_output([
                "ffprobe","-v","error","-show_entries",
                "format=duration:stream=codec_type,codec_name,width,height",
                "-of","json",str(output)],text=True))
            self.assertLess(abs(float(probe["format"]["duration"])-6.0),0.5)
            self.assertEqual([t["codec_type"] for t in probe["streams"]],
                             ["video","audio"])
            self.assertEqual(probe["streams"][1]["codec_name"],"aac")
            self.assertEqual(probe["streams"][0]["width"],1920)
            self.assertEqual(probe["streams"][0]["height"],1080)


if __name__ == "__main__":
    unittest.main()
