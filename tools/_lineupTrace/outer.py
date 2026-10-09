import json, numpy as np, sys
sys.argv=['x','860']
exec(open('track.py').read().split("START=")[0])   # reuse im, minima(), reg
from PIL import Image, ImageDraw
tr={int(k):np.array(v) for k,v in json.load(open('track.json')).items()}
zs=list(range(-2100,1401,250))
table=json.load(open('table.json'))['table']
out={str(d):[] for d in range(10,31)}
for z in zs:
    yc=int(round(Y0+z/S)); per={d:[] for d in range(10,31)}
    for y in range(yc-10,yc+11):
        if y not in tr or y<0 or y>=im.shape[0]: continue
        x20=tr[y][19]
        m=np.sort(minima(y))[::-1]
        west=m[m<x20-1.5]
        # require no masked text between: skip row if a text pixel lies west of x20 within 400 px
        if textd[y,max(300,int(x20)-400):int(x20)].any(): continue
        for d in range(10,21): per[d].append(tr[y][d-1])
        for k in range(1,11):
            if k<=len(west): per[20+k].append(west[k-1])
    for d in range(10,31):
        v=per[d]
        out[str(d)].append([round(float(np.median(v))*S-CX) if v else None, z, len(v)])
for d in (20,21,22,25,28,30): print(d,[p[0] for p in out[str(d)]],[p[2] for p in out[str(d)]][:3])
json.dump({'zs':zs,'table':out},open('table2.json','w'))
c=Image.open(R+'8-contours-gracetown-to-ellensbrook.webp').convert('RGB').crop((330,440,880,1110)); dr=ImageDraw.Draw(c)
for d,pts in out.items():
    P=[((p[0]+CX)/S-330,Y0+p[1]/S-440) for p in pts if p[0] is not None]
    dr.line(P,fill=(255,0,0) if int(d)%5 else (180,0,180),width=1)
c.save('zF.png')
