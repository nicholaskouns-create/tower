"""Regression checks against the real sibling auth-kernel implementation."""
import json
import tempfile
import unittest
from pathlib import Path
from dataclasses import replace
from auth_kernel import live, Record, sign_record, issue, grant, sign_act
from auth_bridge import dispatch, receipt_digest

class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path=Path(self.tmp.name)/"receipt.json"
        self.receipt={"status":"PASS","result":{"kernel_dimension":47}}
        self.path.write_text(json.dumps(self.receipt))
        self.digest=receipt_digest(self.receipt)
        self.s,self.old,_=live()
        from auth_kernel import register_tool, register_schema
        register_tool(self.s,"noesis.consume_receipt")
        register_schema(self.s,"noesis.consume_receipt",{"receipt_sha256"})
        grant(self.s,"a|b","noesis.consume_receipt","auth-1",sign_act("auth-key","GRANT",{"subj":"a|b","tool":"noesis.consume_receipt"}))
        self.d=sign_record(Record("a|b","noesis.consume_receipt",{"receipt_sha256":self.digest},"bridge-nonce","iss-1",0,50),"iss-key")
        assert issue(self.s,self.d)[0]
        self.calls=[]
    def go(self,record=None,requester="p",digest=None):
        return dispatch(self.path,record or self.d,self.s,requester,lambda r:self.calls.append(r) or "executed",expected_digest=digest or self.digest)
    def test_authorized_once(self):
        self.assertTrue(self.go()["allowed"])
        self.assertFalse(self.go()["allowed"])
        self.assertEqual(len(self.calls),1)
    def test_wrong_principal(self):
        self.assertFalse(self.go(requester="other")["allowed"])
        self.assertEqual(self.calls,[])
    def test_tampered_receipt(self):
        self.path.write_text(json.dumps({"status":"PASS","result":{"kernel_dimension":48}}))
        self.assertFalse(self.go()["allowed"])
        self.assertEqual(self.calls,[])
    def test_wrong_target(self):
        self.assertFalse(self.go(record=replace(self.d,args={"receipt_sha256":"bad"}))["allowed"])
        self.assertEqual(self.calls,[])
    def test_failed_receipt(self):
        self.receipt["status"]="FAIL"
        self.path.write_text(json.dumps(self.receipt))
        self.assertFalse(self.go(digest=receipt_digest(self.receipt))["allowed"])
        self.assertEqual(self.calls,[])
if __name__=="__main__":
    unittest.main()
