#!/usr/bin/env python3
"""Offline checks for private stage receipt to rendered MP4 handoff."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

script=Path(__file__).with_name("render-jukebox-staged-private.py")
spec=importlib.util.spec_from_file_location("staged_private",script)
render=importlib.util.module_from_spec(spec)
spec.loader.exec_module(render)
JOB="123e4567-e89b-42d3-a456-426614174000"
SONG="123e4567-e89b-42d3-a456-426614174001"
MASTER="a"*64

def prepare(root:Path):
    stage=root/"stage";stage.mkdir()
    data=b"\x89PNG\r\n\x1a\n"+bytes(2040)
    photos=[]
    scenes=[]
    for i,section in enumerate(["chorus","outro"]):
        name=f"photo-{i:02d}.png"
        (stage/name).write_bytes(data)
        photos.append({"index":i,"filename":name,"mime":"image/png","bytes":len(data),
                       "sha256":hashlib.sha256(data).hexdigest()})
        scenes.append({"filename":name,"section":section,"weight":2 if i==0 else 3})
    receipt={"version":1,"jobId":JOB,"songId":SONG,"masterSha256":MASTER,
             "imageCount":2,"images":photos,"publish":False,
             "workerStatus":"images_decoded_staged_only"}
    plan={"version":1,"jobId":JOB,"songId":SONG,"format":"landscape",
          "seconds":"full","endWithLastScene":True,"publish":False,"scenes":scenes}
    (stage/"private-stage-receipt.json").write_text(json.dumps(receipt))
    path=root/"plan.json";path.write_text(json.dumps(plan))
    return stage,path,receipt,plan

class StagedPrivateTests(unittest.TestCase):
    def test_checks_exact_order_digest_and_end_scene(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            stage,path,_,_=prepare(root)
            images,scenes,plan=render.validate_staged_scene_plan(stage,path,JOB,SONG,MASTER)
            self.assertEqual(len(images),2)
            timeline=render.timed_assignments(scenes,100,False,True)
            self.assertEqual(timeline[0]["start"],20)
            self.assertEqual(timeline[-1]["end"],100)
            self.assertEqual(timeline[-1]["section"],"outro")
            self.assertGreater(timeline[1]["end"]-timeline[1]["start"],
                               timeline[0]["end"]-timeline[0]["start"])

    def test_rejects_tampered_file_and_wrong_song(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);stage,path,_,_=prepare(root)
            with self.assertRaisesRegex(ValueError,"receipt"):
                render.validate_staged_scene_plan(stage,path,JOB,"123e4567-e89b-42d3-a456-426614174002",MASTER)
            (stage/"photo-01.png").write_bytes(b"tampered"+bytes(2040))
            with self.assertRaisesRegex(ValueError,"checksum"):
                render.validate_staged_scene_plan(stage,path,JOB,SONG,MASTER)

    def test_rejects_untrusted_path_and_public_plan(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);stage,path,receipt,plan=prepare(root)
            plan["publish"]=True
            path.write_text(json.dumps(plan))
            with self.assertRaisesRegex(ValueError,"Invalid private render"):
                render.validate_staged_scene_plan(stage,path,JOB,SONG,MASTER)
            plan["publish"]=False
            plan["scenes"][0]["filename"]="../../bad.png"
            path.write_text(json.dumps(plan))
            with self.assertRaisesRegex(ValueError,"unsafe photo"):
                render.validate_staged_scene_plan(stage,path,JOB,SONG,MASTER)

    def test_refuses_oversized_scene_duration_and_overlap(self):
        scenes=[{"section":"verse1","weight":3}]
        with self.assertRaises(ValueError):
            render.timed_assignments(scenes,1000,False,True)

if __name__=="__main__":
    unittest.main()
