#!/usr/bin/env python3
"""Tests for matching photo-editor scene choices to private staged image bytes."""
import base64
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

def load(name):
    spec=importlib.util.spec_from_file_location(name.replace("-","_"),
        Path(__file__).with_name(name))
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

handoff=load("prepare-jukebox-private-photo-plan.py")
fixtures=load("test-jukebox-staged-private.py")
renderer=load("render-jukebox-staged-private.py")

def make_project(root,stage):
    clips=[]
    for index,section in enumerate(("Refreng","Avslutning")):
        data=(stage/f"photo-{index:02d}.png").read_bytes()
        clips.append({"name":f"photo-{index:02d}.png","kind":"image","mime":"image/png",
                      "finale":index==1,"section":section,
                      "weight":2 if index==0 else 3,
                      "data":"data:image/png;base64,"+base64.b64encode(data).decode()})
    project={"format":"remaster-jukebox-portable","version":1,"songId":fixtures.SONG,
             "videoFormat":"landscape","seconds":"full","sceneCount":2,
             "endWithLastScene":True,"clips":clips}
    path=root/"project.json"
    path.write_text(json.dumps(project),encoding="utf-8")
    return path,project

class PrivatePhotoHandoffTests(unittest.TestCase):
    def test_generates_exact_private_scene_plan(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            stage,_,_,_=fixtures.prepare(root)
            project,_=make_project(root,stage)
            output=root/"scene-plan.json"
            result=handoff.create_plan(stage,project,output,fixtures.JOB,fixtures.SONG,fixtures.MASTER)
            self.assertEqual(result["sceneCount"],2)
            plan=json.loads(output.read_text())
            self.assertFalse(plan["publish"])
            self.assertEqual([s["section"] for s in plan["scenes"]],["chorus","outro"])
            self.assertEqual([s["weight"] for s in plan["scenes"]],[2,3])
            images,scenes,details=renderer.validate_staged_scene_plan(
                stage,output,fixtures.JOB,fixtures.SONG,fixtures.MASTER)
            self.assertEqual(len(images),2)
            self.assertEqual(renderer.timed_assignments(scenes,100,False,True)[-1]["end"],100)

    def test_mismatched_and_swapped_images_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            stage,_,_,_=fixtures.prepare(root)
            project,data=make_project(root,stage)
            data["clips"][0]["data"]="data:image/png;base64,"+base64.b64encode(b"WRONG"+bytes(2043)).decode()
            project.write_text(json.dumps(data))
            new_plan=root/"rejected-handoff-plan.json"
            with self.assertRaisesRegex(ValueError,"does not match"):
                handoff.create_plan(stage,project,new_plan,fixtures.JOB,fixtures.SONG,fixtures.MASTER)
            self.assertFalse(new_plan.exists())
    def test_wrong_song_or_multiple_finales_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            stage,_,_,_=fixtures.prepare(root)
            project,data=make_project(root,stage)
            with self.assertRaisesRegex(ValueError,"Untrusted staged receipt identity"):
                handoff.create_plan(stage,project,root/"plan.json",fixtures.JOB,
                                    "123e4567-e89b-42d3-a456-426614174002",fixtures.MASTER)
            data["clips"][0]["finale"]=True
            project.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,"Only one"):
                handoff.create_plan(stage,project,root/"plan.json",fixtures.JOB,fixtures.SONG,fixtures.MASTER)
    def test_never_overwrites_existing_plan(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            stage,_,_,_=fixtures.prepare(root)
            project,_=make_project(root,stage)
            output=root/"plan.json"
            output.write_text("DO NOT OVERWRITE")
            with self.assertRaisesRegex(ValueError,"overwrite"):
                handoff.create_plan(stage,project,output,fixtures.JOB,fixtures.SONG,fixtures.MASTER)
            self.assertEqual(output.read_text(),"DO NOT OVERWRITE")

if __name__=="__main__":
    unittest.main()
