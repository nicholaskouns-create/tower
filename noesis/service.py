"""Trusted WSGI adapter; REMOTE_USER must come from authenticated server middleware."""
import json
from dataclasses import fields
from auth_kernel import Record
from auth_bridge import dispatch

def make_app(ledger, receipt_path, operation):
    def app(env, start_response):
        def respond(status, data):
            body=json.dumps(data,sort_keys=True).encode()
            start_response(status,[("Content-Type","application/json"),("Content-Length",str(len(body))),("Cache-Control","no-store")])
            return [body]
        if env.get("PATH_INFO")!="/noesis/consume":return respond("404 Not Found",{"error":"NotFound"})
        if env.get("REQUEST_METHOD")!="POST":return respond("405 Method Not Allowed",{"error":"MethodNotAllowed"})
        requester=env.get("REMOTE_USER")
        if not isinstance(requester,str) or not requester:return respond("401 Unauthorized",{"error":"Unauthenticated"})
        try:
            length=int(env.get("CONTENT_LENGTH","0"))
            if not 0<length<=16384:raise ValueError("length")
            payload=json.loads(env["wsgi.input"].read(length))
            if not isinstance(payload,dict) or set(payload)!={"record","expected_digest"}:raise ValueError("payload")
            obj=payload["record"]
            if not isinstance(obj,dict) or set(obj)!={f.name for f in fields(Record)}:raise ValueError("record")
            record=Record(**obj)
            digest=payload["expected_digest"]
            if not isinstance(digest,str) or len(digest)!=64 or any(c not in "0123456789abcdef" for c in digest):raise ValueError("digest")
        except (ValueError,TypeError,KeyError,OverflowError,UnicodeError):
            return respond("400 Bad Request",{"error":"InvalidRequest"})
        result=dispatch(receipt_path,record,ledger,requester,operation,expected_digest=digest)
        return respond("200 OK" if result["allowed"] else "403 Forbidden",result)
    return app
