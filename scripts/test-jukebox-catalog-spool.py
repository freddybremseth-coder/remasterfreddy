#!/usr/bin/env python3
"""Unit tests for canonical Jukebox music catalog and staged audio."""
import hashlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from unittest.mock import patch

def load(file,name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file))
    o=importlib.util.module_from_spec(s);s.loader.exec_module(o)
    return o

stage=load("stage-jukebox-master.py","master_stager")
spool=load("prepare-jukebox-catalog-spool.py","catalog_spool")
JOB="123e4567-e89b-42d3-a456-426614174000"
SONG="e3158f1d-ada7-4332-8218-b313d5fe8ffa"
ORIGIN="https://ereapsfcsqtdmzosgnnn.supabase.co"
URL=ORIGIN+"/storage/v1/object/public/assets/remaster/test-master.mp3"
AUDIO=b"ID3"+b"1"*3000
SHA=hashlib.sha256(AUDIO).hexdigest()

class Response(io.BytesIO):
    def __init__(self,blob,mime="audio/mpeg"):
        super().__init__(blob)
        self.status=200
        self.headers={"Content-Type":mime}
    def __enter__(self): return self
    def __exit__(self,*a): self.close()

class CanonicalMasterTests(unittest.TestCase):
    def test_real_catalog_url_shape_is_allowlisted(self):
        path,ext=stage.validate_master_path(URL,ORIGIN)
        self.assertEqual(path,"assets/remaster/test-master.mp3")
        self.assertEqual(ext,".mp3")

    def test_rejects_foreign_hosts_odd_urls_and_traversal(self):
        for url in (URL.replace("ereapsfcsqtdmzosgnnn","untrustedexample0001"),
                    URL+"?download=1", URL.replace("test-master","../test-master"),
                    URL.replace("public/assets/","public/other/"),
                    URL.replace(".mp3",".html")):
            with self.subTest(url=url):
                with self.assertRaises(ValueError):
                    stage.validate_master_path(url,ORIGIN)

    def test_download_pinned_audio_and_reject_changed_bytes(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp)
            opener=type("FakeOpener",(),{"open":lambda self,request,timeout:Response(AUDIO)})()
            with patch.object(stage.urllib.request,"build_opener",return_value=opener):
                item=stage.stage_master(URL,ORIGIN,SHA,folder)
            self.assertEqual(item["sha256"],SHA)
            self.assertEqual((folder/"master.mp3").read_bytes(),AUDIO)
            (folder/"master.mp3").unlink()
            with patch.object(stage.urllib.request,"build_opener",return_value=opener):
                with self.assertRaisesRegex(ValueError,"changed since queue"):
                    stage.stage_master(URL,ORIGIN,"0"*64,folder)
            self.assertFalse((folder/"master.mp3").exists())

    def test_reject_invalid_header_and_cleans_partial_file(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);invalid=b"NOTAUDIO"+b"x"*3000
            opener=type("FakeOpener",(),{"open":lambda self,request,timeout:Response(invalid)})()
            with patch.object(stage.urllib.request,"build_opener",return_value=opener):
                with self.assertRaisesRegex(ValueError,"valid audio headers"):
                    stage.stage_master(URL,ORIGIN,hashlib.sha256(invalid).hexdigest(),folder)
            self.assertFalse((folder/"master.mp3").exists())

    def test_catalog_lookup_is_brand_and_id_scoped(self):
        observed=[]
        class Catalog:
            def open(self,request,timeout):
                observed.append(parse_qs(urlsplit(request.full_url).query))
                return Response(json.dumps([{"id":SONG,"brand":"remasterfreddy","file_url":URL,"name":"Drømmer"}]).encode(),"application/json")
        with patch.object(spool.urllib.request,"build_opener",return_value=Catalog()):
            result=spool.lookup_song(ORIGIN,"fake-test-key",SONG)
        self.assertEqual(result["id"],SONG)
        self.assertEqual(observed[0]["id"],["eq."+SONG])
        self.assertEqual(observed[0]["brand"],["eq.remasterfreddy"])

class CatalogSpoolTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.folder=Path(temp.name)/JOB
        self.folder.mkdir()
        (self.folder/"cabinet.mp4").write_bytes(b"approved cabinet test")
        self.export={
            "jobId":JOB,"publish":False,"approved_for_render":False,"clips":[],
            "handoff":{"songId":SONG,"masterSha256":SHA,
                       "format":"landscape","seconds":None,
                       "templateVersion":"photo-v1-test",
                       "imagePaths":["neural-beat/portrait.jpg"]}
        }
        self.write()

    def write(self):
        (self.folder/"clip-export.json").write_text(json.dumps(self.export),encoding="utf-8")

    def test_stages_catalog_master_and_exact_spool_identity(self):
        with (patch.object(spool,"lookup_song",return_value={"id":SONG,"file_url":URL}),
              patch.object(spool.masters,"stage_master",side_effect=self.fake_stage)):
            result=spool.prepare(self.folder,ORIGIN,"test-key")
        self.assertEqual(result["state"],"staged_private")
        self.assertFalse(result["published"])
        config=json.loads((self.folder/"job.json").read_text())
        self.assertEqual(config,{"jobId":JOB,"audio":"master.mp3","jukebox":"cabinet.mp4"})

    def fake_stage(self,_,__,expected,destination):
        self.assertEqual(expected,SHA)
        (destination/"master.mp3").write_bytes(AUDIO)
        return {"file":"master.mp3","sha256":SHA,"bytes":len(AUDIO)}

    def test_duplicate_job_never_stages_twice(self):
        (self.folder/"job.json").write_text("{}")
        with patch.object(spool,"lookup_song",side_effect=AssertionError("no lookup")):
            with self.assertRaisesRegex(ValueError,"already staged"):
                spool.prepare(self.folder,ORIGIN,"test-key")

    def test_rejects_unpinned_or_mismatched_song(self):
        for value in ("not-a-uuid",None):
            self.export["handoff"]["songId"]=value;self.write()
            with self.assertRaisesRegex(ValueError,"catalog song ID"):
                spool.prepare(self.folder,ORIGIN,"test-key")

if __name__=="__main__":
    unittest.main()
