import json, urllib.request
from pathlib import Path
import numpy as np
from scipy import sparse
from scipy.linalg import eigh
from sklearn.decomposition import PCA
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score

base="https://raw.githubusercontent.com/tkipf/pygcn/master/data/cora/"
cache=Path("/tmp/noesis-cora"); cache.mkdir(exist_ok=True)
def get(name):
 p=cache/name
 if not p.exists(): urllib.request.urlretrieve(base+name,p)
 return p
def projector():
 m=np.array([2,1,0,-1,-2]); z=np.diag(m); up=np.zeros((5,5))
 for i in range(1,5):up[i-1,i]=np.sqrt(6-m[i]*(m[i]+1))
 x=(up+up.T)/2; y=(up-up.T)/(2j); eye=np.eye(5)
 ops=[np.kron(np.kron(a,eye),eye)+np.kron(np.kron(eye,a),eye)+np.kron(np.kron(eye,eye),a) for a in (x,y,z)]
 c=sum(a@a for a in ops)
 w,v=eigh(c); selected=(abs(w-6)<1e-7)|(abs(w-30)<1e-7)
 assert selected.sum()==47
 return np.asarray(v[:,selected], dtype=np.complex128)
def main():
 raw=np.loadtxt(get("cora.content"),dtype=str)
 X=raw[:,1:-1].astype(float); _,y=np.unique(raw[:,-1],return_inverse=True)
 assert X.shape==(2708,1433)
 edges=np.loadtxt(get("cora.cites"),dtype=str); ids={s:i for i,s in enumerate(raw[:,0])}
 pairs=np.array([(ids[a],ids[b]) for a,b in edges if a in ids and b in ids])
 A=sparse.coo_matrix((np.ones(2*len(pairs)),(np.r_[pairs[:,0],pairs[:,1]],np.r_[pairs[:,1],pairs[:,0]])),shape=(2708,2708)).tocsr()
 A.data[:]=1; A.setdiag(1); d=np.asarray(A.sum(1)).ravel()
 G=sparse.diags(1/np.sqrt(d))@A@sparse.diags(1/np.sqrt(d))
 rng=np.random.default_rng(47)
 Q,_=np.linalg.qr(rng.standard_normal((1433,125)))
 Z=X@Q; U=projector(); E=Z@U
 pca=PCA(n_components=47,svd_solver="full").fit(Z); P=pca.transform(Z)
 # Fixed label-stratified 140/500/1000 split; not official Planetoid masks.
 rng=np.random.default_rng(2026)
 tr=np.concatenate([rng.choice(np.where(y==k)[0],20,replace=False) for k in range(7)])
 remain=np.setdiff1d(np.arange(2708),tr);rng.shuffle(remain);val=remain[:500];test=remain[500:1500]
 def score(H):
  H=np.column_stack((H.real,H.imag)) if np.iscomplexobj(H) else H
  H=G@H; H=H/(np.linalg.norm(H,axis=1,keepdims=True)+1e-12)
  clf=LogisticRegression(max_iter=1500,random_state=0).fit(H[tr],y[tr])
  return {"validation_accuracy":float(accuracy_score(y[val],clf.predict(H[val]))),"test_accuracy":float(accuracy_score(y[test],clf.predict(H[test])))}
 result={"dataset":"Cora","nodes":2708,"input_features":1433,"carrier_dimension":125,"compressed_dimension":47,"embedding":"Gaussian QR seed 47","split":"stratified seed 2026, 140 train / 500 val / 1000 test, not official Planetoid","E47":{"mse":float(np.mean(np.abs(Z-E@U.conj().T)**2)),**score(E)},"PCA":{"mse":float(np.mean((Z-pca.inverse_transform(P))**2)),**score(P)}}
 print(json.dumps(result,indent=2));Path("cora-e47-results.json").write_text(json.dumps(result,indent=2))
if __name__=="__main__":main()
