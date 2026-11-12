#!/usr/bin/env python3
"""Offline private cabinet staging safeguards."""
import hashlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location("cabinet_stage",
    Path(__file__).with_name("stage-jukebox-cabinet.py"))
cabinet=importlib.util.module_from_spec(spec)
spec.loader.exec_module(cabinet)
ORIGIN="https://ereapsfcsqtdmzosgnnn.supabase.co"
OBJECT="jukebox/approved/rockola-cabinet.mp4"
BLOB=b"\x00\x00\x00\x18ftypisom"+b"0"*22000
SHA=hashlib.sha256(BLOB).hexdigest()


class Response(io.BytesIO):
    status=200
    headers={"Content-Type":"video/mp4"}
    def __enter__(self): return self
    def __exit__(self,*_): self.close()


class CabinetTests(unittest.TestCase):
    def test_pinned_cabinet_downloads_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            class Opener:
                def open(self,request,timeout):
                    self_url=request.full_url
                    self.assertTrue(self_url.startswith(ORIGIN+"/storage/v1/object/public/assets/jukebox/"))
                    return Response(BLOB)
            opener=Opener()
            opener.assertTrue=self.assertTrue
            with (patch.object(cabinet.urllib.request,"build_opener",return_value=opener),
                  patch.object(cabinet,"verify_cabinet_video",
                               return_value={"duration_seconds":12.0,"width":1920,"height":1080})):
                result=cabinet.stage_cabinet(OBJECT,SHA,ORIGIN,folder)
            self.assertEqual(result["sha256"],SHA)
            self.assertEqual((folder/"cabinet.mp4").read_bytes(),BLOB)
            self.assertFalse(result["published"])
            with self.assertRaisesRegex(ValueError,"Existing cabinet"):
                cabinet.stage_cabinet(OBJECT,SHA,ORIGIN,folder)

    def test_rejects_corrupted_mp4_even_if_hash_matches(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            class Opener:
                def open(self,request,timeout): return Response(BLOB)
            with patch.object(cabinet.urllib.request,"build_opener",return_value=Opener()):
                with self.assertRaisesRegex(ValueError,"video cannot be probed"):
                    cabinet.stage_cabinet(OBJECT,SHA,ORIGIN,folder)
            self.assertFalse((folder/"cabinet.mp4").exists())

    def test_requires_video_stream_suitable_for_cabinet(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/"cabinet.mp4"
            p.write_bytes(BLOB)
            for info in (
                {"format":{"duration":"1.0"},"streams":[{"codec_type":"video","width":1920,"height":1080}]},
                {"format":{"duration":"8.0"},"streams":[{"codec_type":"audio"}]},
                {"format":{"duration":"8.0"},"streams":[{"codec_type":"video","width":200,"height":100}]},
            ):
                class Result:
                    stdout=json.dumps(info)
                with patch.object(cabinet.subprocess,"run",return_value=Result()):
                    with self.assertRaisesRegex(ValueError,"unsupported video metadata"):
                        cabinet.verify_cabinet_video(p)

    def test_blocks_unapproved_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            for path in ("../other.mp4","neural-beat/clip.mp4",
                         "jukebox/approved/../../private.mp4",
                         "https://external.example/movie.mp4","jukebox/approved/not-video.jpg"):
                with self.subTest(path=path):
                    with self.assertRaisesRegex(ValueError,"approved cabinet path"):
                        cabinet.stage_cabinet(path,SHA,ORIGIN,Path(tmp))

    def test_fails_closed_and_cleans_changed_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            class Opener:
                def open(self,request,timeout): return Response(BLOB)
            with patch.object(cabinet.urllib.request,"build_opener",return_value=Opener()):
                with self.assertRaisesRegex(ValueError,"digest mismatch"):
                    cabinet.stage_cabinet(OBJECT,"0"*64,ORIGIN,folder)
            self.assertFalse((folder/"cabinet.mp4").exists())


if __name__=="__main__":
    unittest.main()
