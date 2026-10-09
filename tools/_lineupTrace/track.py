from PIL import Image
import numpy as np, json
R="C:/Dev/andrew-dev-personal-projects/liquid-dreaming/reference/place/new-sattelite-and-bathymetry-references/"  # never committed
im=np.array(Image.open(R+'8-contours-gracetown-to-ellensbrook.webp').convert('RGB')).astype(float)
reg=json.load(open('reg8.json')); S=reg['S']; Y0=reg['y0']; CX=reg['cx']; coast=reg['coast']
r,g,b=im[...,0],im[...,1],im[...,2]
water=(b-r>30)&(g-r>22)
text=im.sum(2)<300
# dilate text mask 3 px
textd=text.copy()
for dy in range(-3,4):
    for dx in range(-3,4):
        textd|=np.roll(np.roll(text,dy,0),dx,1)
def minima(y):
    c=int(coast[y]) if coast[y] is not None else 900
    br=im[y].mean(1).copy(); br[~water[y]]=255
    xs=[]
    for i in range(301,c-1):
        if br[i]<=br[i-1] and br[i]<br[i+1] and not textd[y,i]:
            lo=max(0,i-4); hi=i+5
            prom=min(br[lo:i].max(), br[i+1:hi].max())-br[i]
            if prom>=6 and br[i]<197:
                a,bb,cc=br[i-1],br[i],br[i+1]; den=a-2*bb+cc
                xs.append(i+(0.5*(a-cc)/den if den>0 else 0))
    return np.array(xs)
START=int(__import__('sys').argv[1]) if len(__import__('sys').argv)>1 else 1000
xs0=minima(START)[::-1]
# survey edge: drop eastern strays
k=0
while k+3<len(xs0) and not all(xs0[k+m]-xs0[k+m+1]<20 for m in range(3)): k+=1
xs0=xs0[k:]
NL=len(xs0)
print('start row',START,'lines',NL)
track={START:xs0.copy()}
def run(direction, stop):
    pos=xs0.copy(); vel=np.zeros(NL); y=START
    while y!=stop:
        y+=direction
        m=minima(y)
        pred=pos+vel
        new=pred.copy(); hit=np.zeros(NL,bool)
        # ordered one-to-one alignment (tracks run east->west, i.e. decreasing x); m sorted decreasing
        mm=np.sort(m)[::-1]; nm=len(mm); SKIP=2.5
        INF=1e9; D=np.full((NL+1,nm+1),INF); D[0,:]=0; P={}
        for i in range(1,NL+1):
            D[i,0]=D[i-1,0]+SKIP
            for j in range(1,nm+1):
                best=D[i,j-1]; arg=(i,j-1,False)          # skip minimum j
                if D[i-1,j]+SKIP<best: best=D[i-1,j]+SKIP; arg=(i-1,j,False)   # track i unmatched
                c=abs(mm[j-1]-pred[i-1])
                if c<2.5 and D[i-1,j-1]+c<best: best=D[i-1,j-1]+c; arg=(i-1,j-1,True)
                D[i,j]=best; P[(i,j)]=arg
        i,j=NL,int(np.argmin(D[NL]))
        while i>0 and j>0:
            pi,pj,match=P[(i,j)]
            if match: new[i-1]=mm[j-1]; hit[i-1]=True
            i,j=pi,pj
        vel=np.where(hit,0.7*vel+0.3*(new-pos),vel)
        pos=new
        track[y]=pos.copy()
run(-1,440); run(+1,1110)
json.dump({str(y):list(v) for y,v in track.items()},open('track.json','w'))
for y in (456,535,600,700,750,838,950,1017,1093):
    v=track[y]; print(y, round((y-Y0)*S), [(k+1, round(v[k]*S-CX)) for k in (0,9,14,19,24,min(29,NL-1))])
