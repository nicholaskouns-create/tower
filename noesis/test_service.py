import io,json,tempfile,unittest
from pathlib import Path
from auth_kernel import live,register_tool,register_schema,grant,sign_act,Record,sign_record,issue
from auth_bridge import receipt_digest
from service import make_app
class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path=Path(self.tmp.name)/"receipt.json"
        receipt={"status":"PASS","result":{"kernel_dimension":47}}
        self.path.write_text(json.dumps(receipt))
        self.digest=receipt_digest(receipt)
        self.ledger,_,_=live()
        register_tool(self.ledger,"noesis.consume_receipt")
        register_schema(self.ledger,"noesis.consume_receipt",{"receipt_sha256"})
        grant(self.ledger,"a|b","noesis.consume_receipt","auth-1",sign_act("auth-key","GRANT",{"subj":"a|b","tool":"noesis.consume_receipt"}))
        self.record=sign_record(Record("a|b","noesis.consume_receipt",{"receipt_sha256":self.digest},"service-nonce","iss-1",0,50),"iss-key")
        assert issue(self.ledger,self.record)[0]
        self.calls=[]
        self.app=make_app(self.ledger,self.path,lambda r:self.calls.append(r) or "consumed")
    def call(self,requester=None):
        payload=json.dumps({"record":self.record.__dict__,"expected_digest":self.digest}).encode()
        env={"PATH_INFO":"/noesis/consume","REQUEST_METHOD":"POST","CONTENT_LENGTH":str(len(payload)),"wsgi.input":io.BytesIO(payload)}
        if requester is not None:env["REMOTE_USER"]=requester
        statuses=[]
        data=self.app(env,lambda status,headers:statuses.append(status))
        return statuses[0],json.loads(b"".join(data))
    def test_unauthenticated(self):self.assertTrue(self.call()[0].startswith("401"))
    def test_wrong_principal(self):self.assertTrue(self.call("wrong")[0].startswith("403"))
    def test_allow_then_replay_denied(self):
        self.assertTrue(self.call("p")[0].startswith("200"))
        self.assertTrue(self.call("p")[0].startswith("403"))
        self.assertEqual(len(self.calls),1)
