#!/usr/bin/env python3
"""Guardrails for the one-command private Jukebox render handoff."""
import importlib.util
import base64
import hashlib
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

    def test_exact_editor_cues_control_real_mp4_pixels_and_song(self):
        """Five-second real FFmpeg MP4: blue Rock-Ola to red at 0.5s, green at 3s."""
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            audio,cabinet,master_sha,cabinet_sha=sources(root)
            stage,_,receipt,_=fixtures.prepare(root)
            receipt["masterSha256"]=master_sha
            # Produce real color PNG files; earlier unit fixtures only contain
            # synthetic non-decodable bytes and cannot prove visual handoff.
            for index,color in enumerate(("red","green")):
                photo=stage/f"photo-{index:02d}.png"
                subprocess.run([
                    "ffmpeg","-nostdin","-hide_banner","-loglevel","error","-y",
                    "-f","lavfi","-i",f"color=c={color}:s=1280x720:r=1:d=1",
                    "-frames:v","1",str(photo)
                ],check=True,timeout=30)
                raw=photo.read_bytes()
                self.assertGreater(len(raw),1024)
                receipt["images"][index]["bytes"]=len(raw)
                receipt["images"][index]["sha256"]=hashlib.sha256(raw).hexdigest()
            (stage/"private-stage-receipt.json").write_text(json.dumps(receipt))
            project,exported=photo_plan.make_project(root,stage)
            exported["clips"][0]["cueStart"]=0.5
            exported["clips"][1]["cueStart"]=3.0
            project.write_text(json.dumps(exported))
            output=root/"actual-private.mp4"
            review=root/"actual-private-review.json"
            result=worker.run(stage,project,audio,cabinet,output,review,
                              fixtures.JOB,fixtures.SONG,master_sha,cabinet_sha)
            self.assertEqual(result["status"],"rendered_private")
            self.assertFalse(result["approvedForPublication"])
            self.assertFalse(result["youtubePublished"])
            self.assertEqual([v["start"] for v in result["assignments"]],[0.5,3.0])
            self.assertEqual(result["assignments"][-1]["end"],5.0)
            self.assertTrue(review.is_file())
            self.assertEqual(result["videoSha256"],renderer.file_sha256(output))
            # A one-frame sample tests actual visual pixels, not only metadata.
            def pixel(at):
                return tuple(subprocess.check_output([
                    "ffmpeg","-nostdin","-hide_banner","-loglevel","error",
                    "-ss",str(at),"-i",str(output),"-frames:v","1",
                    "-vf","crop=2:2:(iw-2)/2:(ih-2)/2,scale=1:1,format=rgb24",
                    "-f","rawvideo","-pix_fmt","rgb24","-"
                ],timeout=30))
            blue=pixel(0.2)
            red=pixel(1.2)
            green=pixel(4.0)
            self.assertGreater(blue[2],blue[0]+60)
            self.assertGreater(red[0],red[1]+60)
            self.assertGreater(green[1],green[0]+40)
            pcm=subprocess.check_output([
                "ffmpeg","-nostdin","-hide_banner","-loglevel","error",
                "-ss","3.5","-i",str(output),"-t","0.3","-vn",
                "-ac","1","-ar","16000","-f","s16le","-"
            ],timeout=30)
            self.assertGreater(len(pcm),5000)
            self.assertNotEqual(pcm,bytes(len(pcm)))

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
