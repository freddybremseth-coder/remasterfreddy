#!/usr/bin/env python3
"""Offline checks for private Jukebox photo session import, no credentials."""
import base64
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location("jukebox_portable",Path(__file__).with_name("render-jukebox-portable-project.py"))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
# Minimal PNG-signature fixture used only for validation; real FFmpeg
# decoding is exercised separately by the existing photo composition suite.
PNG=b"\x89PNG\r\n\x1a\n"+bytes(200)


def fixture(finale=True):
    return {
        "format":"remaster-jukebox-portable","version":1,"songId":"song-123",
        "videoFormat":"landscape","seconds":"full","sceneCount":2,
        "endWithLastScene":finale,
        "clips":[
            {"name":"Kai Reidun.png","kind":"image","mime":"image/png",
             "finale":False,"section":"Refreng","weight":2,
             "data":"data:image/png;base64,"+base64.b64encode(PNG).decode()},
            {"name":"Kai Kari.png","kind":"image","mime":"image/png",
             "finale":finale,"section":"Avslutning","weight":3,
             "data":"data:image/png;base64,"+base64.b64encode(PNG).decode()}
        ]
    }


class PortableImportTests(unittest.TestCase):
    def project(self,root,content):
        p=root/"session.json"
        p.write_text(json.dumps(content),encoding="utf-8")
        return p

    def test_timed_chorus_and_pinned_finale(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            data=module.validate_backup(self.project(root,fixture()),"song-123")
            photos=module.extract_images(data,root/"stage")
            self.assertEqual([p["section"] for p in photos],["Refreng","Avslutning"])
            plan=module.build_assignments(photos,50,False,True)
            self.assertEqual([x["section"] for x in plan],["chorus","outro"])
            self.assertEqual(plan[0]["start"],10)
            self.assertEqual(plan[-1]["end"],50)
            self.assertGreater(plan[1]["end"]-plan[1]["start"],
                               plan[0]["end"]-plan[0]["start"])
            self.assertTrue((root/"stage"/"photo-01.png").exists())

    def test_wrong_song_and_traversal_cannot_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            p=self.project(root,fixture())
            with self.assertRaisesRegex(ValueError,"expected song"):
                module.validate_backup(p,"another-song")
            altered=fixture()
            altered["clips"][0]["name"]="../../danger.png"
            photos=module.extract_images(module.validate_backup(
                self.project(root,altered)),root/"stage")
            self.assertEqual(photos[0]["file"],"photo-00.png")
            self.assertFalse((root/"danger.png").exists())

    def test_rejects_bad_encoding_and_wrong_final_position(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            bad=fixture()
            bad["clips"][0]["finale"]=True
            with self.assertRaisesRegex(ValueError,"Multiple pinned"):
                module.validate_backup(self.project(root,bad))
            bad=fixture()
            bad["clips"][1]["data"]="data:image/png;base64,not_valid!"
            verified=module.validate_backup(self.project(root,bad))
            with self.assertRaisesRegex(ValueError,"Corrupt image"):
                module.extract_images(verified,root/"stage")

    def test_fallback_jukebox_outro_not_pinned(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            data=module.validate_backup(self.project(root,fixture(False)))
            photos=module.extract_images(data,root/"stage")
            plan=module.build_assignments(photos,50,False,False)
            self.assertEqual(plan[0]["start"],10)
            self.assertEqual(plan[-1]["end"],45)


if __name__=="__main__":
    unittest.main()
