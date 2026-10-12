"""Actual localhost intake/market HTTP, isolated synthetic document; Agent disabled."""
import base64
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, ProxyHandler
import unittest
from london_office.data import ROOT


class IntakeHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = TemporaryDirectory()
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0))
            port=sock.getsockname()[1]
        cls.url=f"http://127.0.0.1:{port}"
        cls.opener=build_opener(ProxyHandler({}))
        cls.server=subprocess.Popen([sys.executable,"-m","london_office","serve","--port",str(port),"--no-agent"],cwd=ROOT,
            env={**os.environ,"LONDON_RESEARCH_DIR":str(Path(cls.directory.name)/"intake"),
                "LONDON_DISCOVERY_DIR":str(Path(cls.directory.name)/"discovery")},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(100):
            if cls.server.poll() is not None: raise RuntimeError("Dedicated test server exited")
            try:
                with cls.opener.open(cls.url+"/api/catalog",timeout=1): return
            except URLError: time.sleep(.03)
        cls.server.terminate(); cls.server.wait(timeout=5)
        raise RuntimeError("Dedicated test server failed to start")

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate(); cls.server.wait(timeout=5); cls.directory.cleanup()

    def request(self,path,body=None,*,origin=True):
        headers={"Content-Type":"application/json"}
        if body is not None and origin: headers.update({"Origin":self.url if origin is True else origin,"X-Office-User-Action":"confirm"})
        request=Request(self.url+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
        try:
            with self.opener.open(request,timeout=5) as response: return response.status,json.load(response)
        except HTTPError as response: return response.code,json.load(response)

    def test_actual_upload_staging_and_separate_batch_approval_refresh_market_without_restart(self):
        text="City office rent for 2026-Q3: Prime achieved rent is 110 GBP/sq ft."
        body={"documents":[{"id":"document-1","filename":"synthetic-report.txt","content_base64":base64.b64encode(text.encode()).decode(),
            "url":"https://example.test/synthetic-report","publisher":"Synthetic fixture publisher","title":"Synthetic document, not market evidence",
            "published_at":None,"usage_note":"Synthetic fixture for isolated offline HTTP testing only"}],
            "candidates":[{"id":"candidate-1","document_id":"document-1","topic_ids":["rents"],"kind":"reported_statistic",
                "metric":"prime_rent","label":"Synthetic uploaded rent","value":110,"unit":"GBP/sq ft","source_geography":"City",
                "statistical_window":"2026-Q3","definition":"Prime achieved rent","denominator":None,"billing_period":None,"release_vintage":None,
                "quote":text,"context_quote":"","section":"Synthetic report line 1","value_anchor":"110 GBP/sq ft"}]}
        before=self.request("/api/market")[1]
        original=(ROOT/"data/snapshot.json").read_bytes()
        self.assertEqual(self.request("/api/research/batches",body,origin=False)[0],403)
        code,staged=self.request("/api/research/batches",body)
        self.assertEqual(code,200)
        batch=staged["batches"][0]
        self.assertIsNone(batch["authorized_at"])
        self.assertEqual(self.request("/api/market")[1]["research"]["records"],before["research"]["records"])
        code, approved=self.request(f'/api/research/batches/{batch["id"]}/authorize',{"content_revision":batch["content_revision"]})
        self.assertEqual(code,200)
        self.assertEqual(approved["batches"][0]["candidates"][0]["state"],"accepted")
        after=self.request("/api/market")[1]
        self.assertEqual(len(after["research"]["records"]),133)
        self.assertEqual(after["observations"],before["observations"])
        self.assertEqual(after["geometry"],before["geometry"])
        self.assertEqual((ROOT/"data/snapshot.json").read_bytes(),original)
        self.assertEqual(self.request("/api/discovery/authorization")[1]["status"],"not_configured")
        self.assertNotIn("content_base64",json.dumps(approved))
        self.assertNotIn(self.directory.name,json.dumps(approved))
        # Replayed approval cannot add a duplicate, nor confer search/model permission.
        self.request(f'/api/research/batches/{batch["id"]}/authorize',{"content_revision":batch["content_revision"]})
        self.assertEqual(len(self.request("/api/market")[1]["research"]["records"]),133)

    def test_conflict_decisions_are_revision_bound_and_missing_original_cannot_be_confirmed(self):
        quotes = [f"City office rent for 2026-Q2: Prime achieved rent is {value} GBP/sq ft." for value in (95,96)]
        rows = [{"id":f"candidate-{value}","document_id":"doc","topic_ids":["rents"],"kind":"reported_statistic",
            "metric":"prime_rent","label":f"Synthetic conflicting rent {value}","value":value,"unit":"GBP/sq ft",
            "source_geography":"City","statistical_window":"2026-Q2","definition":"Prime achieved rent",
            "denominator":None,"billing_period":None,"release_vintage":None,"quote":quote,"context_quote":"",
            "section":"Synthetic lines","value_anchor":f"{value} GBP/sq ft"} for value,quote in zip((95,96),quotes)]
        rows.append({**rows[0],"id":"blocked","value":97,"quote":quotes[0].replace("95","97"),"value_anchor":"97 GBP/sq ft"})
        body={"documents":[{"id":"doc","filename":"synthetic-conflict.txt","content_base64":base64.b64encode(" ".join(quotes).encode()).decode(),
            "url":"https://example.test/synthetic-conflict","publisher":"Synthetic publisher","title":"Synthetic conflict only",
            "published_at":None,"usage_note":"Isolated HTTP fixture; not actual market research"}],"candidates":rows}
        before=self.request("/api/market")[1]
        code,staged=self.request("/api/research/batches",body)
        self.assertEqual(code,200)
        batch=staged["batches"][0]
        authorize=f'/api/research/batches/{batch["id"]}/authorize'
        self.assertEqual(self.request(authorize,{"content_revision":"0"*64})[0],409)
        self.assertEqual(self.request(authorize,{"content_revision":batch["content_revision"]},origin="http://127.0.0.1:1")[0],403)
        code,approved=self.request(authorize,{"content_revision":batch["content_revision"]})
        self.assertEqual(code,200)
        self.assertEqual([item["state"] for item in approved["batches"][0]["candidates"]],["awaiting_confirmation","awaiting_confirmation","blocked"])
        self.assertEqual(self.request("/api/market")[1]["research"]["records"],before["research"]["records"])
        decision=f'/api/research/batches/{batch["id"]}/decisions'
        def accept(item):
            return self.request(decision,{"content_revision":batch["content_revision"],"candidate_id":item["id"],"decision":"accept",
                "reason":"Synthetic reviewer preserved distinct same-definition source values."})
        items=approved["batches"][0]["candidates"]
        code,error=accept(items[2])
        self.assertEqual(code,422)
        self.assertEqual(error["error"]["code"],"candidate_not_eligible")
        self.assertEqual(accept(items[0])[0],200)
        code,result=accept(items[1])
        self.assertEqual(code,200)
        self.assertEqual(accept(items[1])[1]["revision"],result["revision"])
        after=self.request("/api/market")[1]
        conflict=[row for row in after["research"]["records"] if row["id"] in {items[0]["id"],items[1]["id"]}]
        self.assertEqual({row["value"] for row in conflict},{95,96})
        self.assertTrue(all(row["quality_status"]=="conflict" and row["conflict_record_ids"] for row in conflict))
        self.assertEqual(after["observations"],before["observations"])
        self.assertEqual(after["geometry"],before["geometry"])


if __name__ == "__main__": unittest.main()
