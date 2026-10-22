#!/usr/bin/env python3
"""NOESIS exact, deterministic E47 discovery cycle."""
import json,hashlib,pathlib
root=pathlib.Path(__file__).resolve().parent
def digest(x):return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def run():
 w={0:1}
 for _ in range(3):
  q={}
  for a,n in w.items():
   for b in range(-2,3):q[a+b]=q.get(a+b,0)+n
  w=q
 m={str(j):w.get(j,0)-w.get(j+1,0) for j in range(7)}
 selected=[j for j in range(7) if (j*(j+1)-6)*(j*(j+1)-30)==0]
 result={"spin_multiplicities":m,"selected_spins":selected,"carrier_dimension":sum((2*j+1)*m[str(j)] for j in range(7)),"kernel_dimension":sum((2*j+1)*m[str(j)] for j in selected)}
 assert result=={"spin_multiplicities":{"0":1,"1":3,"2":5,"3":4,"4":3,"5":2,"6":1},"selected_spins":[2,5],"carrier_dimension":125,"kernel_dimension":47}
 receipt={"schema":"noesis-v1","discovery":"E47 Casimir-selected sectors on V2 tensor cubed","experiment":"exact integer weight inversion","result":result,"result_sha256":digest(result),"status":"PASS"}
 (root/"receipt.json").write_text(json.dumps(receipt,indent=2,sort_keys=True)+"\n")
 record={"title":"NOESIS E47 integer weight census","evidence":"exact integer computation","receipt_sha256":digest(receipt),"reproduce":"python3 noesis/cycle.py","result":result}
 (root/"record.json").write_text(json.dumps(record,indent=2,sort_keys=True)+"\n")
 print(json.dumps(record,indent=2))
if __name__=="__main__":run()
