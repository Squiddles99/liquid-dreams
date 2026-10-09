from PIL import Image
import numpy as np, json
R="C:/Dev/andrew-dev-personal-projects/liquid-dreaming/reference/place/new-sattelite-and-bathymetry-references/"  # never committed
im=np.array(Image.open(R+'8-contours-gracetown-to-ellensbrook.webp').convert('RGB')).astype(float)
r,g,b=im[...,0],im[...,1],im[...,2]
water=(b-r>30)&(g-r>22)
H,W=water.shape
coast=np.full(H,np.nan)
for y in range(H):
    # last water pixel (scanning from the west) before a run of >=40 px of non-water, starting the scan at x=300
    w=water[y]
    for x in range(300,W-40):
        if w[x] and not w[x+1:x+41].any():
            coast[y]=x+0.5; break
wl=np.array(json.load(open('wl.json')),dtype=float)  # z, raw, real(smoothed), game
zs=wl[:,0]; xr=wl[:,1]
S=5.5
best=None
for y0 in np.arange(600,1100,1.0):
    z=(np.arange(H)-y0)*S
    ok=(~np.isnan(coast))&(z>-3800)&(z<3800)&(np.arange(H)>60)&(np.arange(H)<1300)
    xi=np.interp(z[ok],zs,xr)
    d=coast[ok]*S - xi
    cx=np.median(d); e=np.median(np.abs(d-cx))
    if best is None or e<best[0]: best=(e,y0,cx,ok.sum())
print('best (mad m, y0 px, x-offset m, rows):',best)
e,y0,cx,_=best
for y in range(100,1300,100):
    z=(y-y0)*S; print(y, round(z), 'img8 coast x_game=', None if np.isnan(coast[y]) else round(coast[y]*S-cx), 'srtm=', round(np.interp(z,zs,xr)))
json.dump({'y0':y0,'cx':cx,'S':S,'coast':[None if np.isnan(c) else c for c in coast]},open('reg8.json','w'))
