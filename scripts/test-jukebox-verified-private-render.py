#!/usr/bin/env python3
"""Guardrails for the one-command private Jukebox render handoff."""
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

def load(filename):
    spec=importlib.util.spec_from_file_location(filename.replace("-","_"),
        Path(__file__).with_name(filename))
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

worker=load("run-jukebox-verified-private-render.py")
fixtures=load("test-jukebox-staged-private.py")
photo_plan=load("test-jukebox-private-photo-plan.py")
renderer=load("render-jukebox-staged-private.py")


def sources(root):
    audio=root/"audio.wav"
    cabinet=root/"rockola.mp4"
    subprocess.run(["ffmpeg","-nostdin","-hide_banner","-loglevel","error",
                    "-f","lavfi","-i","sine=frequency=440:duration=5",
                    "-c:a","pcm_s16le",str(audio)],check=True,timeout=30)
    subprocess.run(["ffmpeg","-nostdin","-hide_banner","-loglevel","error",
                    "-f","lavfi","-i","color=c=blue:s=320x180:d=1:r=12",
                    "-c:v","libx264","-pix_fmt","yuv420p",str(cabinet)],
                   check=True,timeout=30)
    return audio,cabinet,renderer.file_sha256(audio),renderer.file_sha256(cabinet)


class OneCommandPrivateRenderTests(unittest.TestCase):
    def test_real_media_preflight_is_private_and_does_not_create_mp4(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            audio,cabinet,master_sha,cabinet_sha=sources(root)
            stage,_,receipt,_=fixtures.prepare(root)
            receipt["masterSha256"]=master_sha
            (stage/"private-stage-receipt.json").write_text(json.dumps(receipt))
            project,_=photo_plan.make_project(root,stage)
            output=root/"new-video.mp4"
            report=root/"review-receipt.json"
            result=worker.run(stage,project,audio,cabinet,output,report,
                              fixtures.JOB,fixtures.SONG,master_sha,cabinet_sha,True)
            self.assertEqual(result["status"],"preflight_verified")
            self.assertFalse(result["approvedForPublication"])
            self.assertFalse(result["youtubePublished"])
            self.assertEqual(result["assignments"][-1]["section"],"outro")
            self.assertFalse(output.exists())
            self.assertFalse(report.exists())

    def test_wrong_master_and_rockola_abort_without_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            audio,cabinet,master_sha,cabinet_sha=sources(root)
            stage,_,receipt,_=fixtures.prepare(root)
            receipt["masterSha256"]=master_sha
            (stage/"private-stage-receipt.json").write_text(json.dumps(receipt))
            project,_=photo_plan.make_project(root,stage)
            output=root/"video.mp4"
            report=root/"review.json"
            with self.assertRaisesRegex(ValueError,"checksum"):
                worker.run(stage,project,audio,cabinet,output,report,
                           fixtures.JOB,fixtures.SONG,master_sha,"0"*64,True)
            self.assertFalse(output.exists())
            with self.assertRaisesRegex(ValueError,"receipt"):
                worker.run(stage,project,audio,cabinet,output,report,
                           fixtures.JOB,fixtures.SONG,"a"*64,cabinet_sha,True)
            self.assertFalse(report.exists())

    def test_cannot_overwrite_existing_private_video_or_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            output=root/"video.mp4"
            output.write_text("keep original")
            with self.assertRaisesRegex(ValueError,"already exists"):
                worker.run(root,root/"project.json",root/"song.wav",root/"rockola.mp4",
                           output,root/"receipt.json",fixtures.JOB,fixtures.SONG,
                           "a"*64,"b"*64,True)
            self.assertEqual(output.read_text(),"keep original")

if __name__=="__main__":
    unittest.main()
