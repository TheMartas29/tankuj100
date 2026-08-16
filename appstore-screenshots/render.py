#!/usr/bin/env python3
# Deterministic PIL compositor that reproduces the app-store-screenshots editor
# design (theme "tankuj-red", user iPhone frame overlay, glass mask, logo, blobs)
# and exports every required App Store size. Faithful to src/components/editor/slide-canvas.tsx.
import os, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.abspath(__file__))
PUB  = os.path.join(ROOT, "public")
SHOTS = os.path.join(PUB, "screenshots", "apple", "iphone", "cs")
OUT  = os.path.join(ROOT, "export", "appstore")

HN = "/System/Library/Fonts/HelveticaNeue.ttc"
def font(size, bold=True):
    return ImageFont.truetype(HN, int(round(size)), index=1 if bold else 10)

# ---- theme tankuj-red ----
BG="#F6F1EA"; BGALT="#171717"; FG="#171717"; FGALT="#F6F1EA"; ACCENT="#E00600"
def hx(h):
    h=h.lstrip("#"); return (int(h[0:2],16),int(h[2:4],16),int(h[4:6],16))
def shade(h,pct):
    r,g,b=hx(h); a=round(255*pct/100)
    return (max(0,min(255,r+a)),max(0,min(255,g+a)),max(0,min(255,b+a)))

MK_RATIO=1022/2082
FRAME_RATIO=1470/3000
OP_L,OP_T,OP_W,OP_H = 75/1470, 66/3000, 1320/1470, 2868/3000

FRAME = Image.open(os.path.join(PUB,"frames","iphone-frame.png")).convert("RGBA")
MASK  = Image.open(os.path.join(PUB,"frames","iphone-glass-mask.png")).convert("RGBA")
LOGO  = Image.open(os.path.join(PUB,"logo.png")).convert("RGBA")

SIZES = [("6.9",1320,2868),("6.5",1284,2778),("6.5b",1242,2688),("6.3",1206,2622),("6.1",1125,2436)]

SLIDES = [
 dict(shot="01-map.png",     layout="hero",          label="100 A 98 OKTANŮ",   head=["Prémiové palivo","hned po ruce."],      inv=False),
 dict(shot="04-list.png",    layout="device-bottom", label="NEJBLIŽŠÍ STANICE", head=["Oktany vidíš","u každé pumpy."],        inv=False),
 dict(shot="02-detail.png",  layout="device-top",    label="KOMUNITA ŘIDIČŮ",   head=["Přidej informace","a pomoz ostatním."], inv=True),
 dict(shot="03-reviews.png", layout="device-bottom", label="RECENZE",           head=["Hodnocení","od řidičů."],               inv=False),
]

def vgrad(cW,cH,c0,c1):
    base=Image.new("RGB",(cW,cH),c0)
    top=Image.new("RGB",(cW,cH),c1)
    m=Image.new("L",(1,cH))
    for y in range(cH):
        m.putpixel((0,y),int(255*y/max(1,cH-1)))
    m=m.resize((cW,cH))
    return Image.composite(top,base,m)

def blob(canvas,cW,cH,color,xp,yp,sizep,opacity):
    d=int(sizep/100*cW)
    if d<=0: return
    layer=Image.new("RGBA",(cW,cH),(0,0,0,0))
    dr=ImageDraw.Draw(layer)
    left=int(xp/100*cW); top=int(yp/100*cH)
    r,g,b=hx(color); a=int(255*opacity)
    dr.ellipse([left,top,left+d,top+d],fill=(r,g,b,a))
    layer=layer.filter(ImageFilter.GaussianBlur(cW*0.06))
    canvas.alpha_composite(layer)

def paste_rgba(dst,src,x,y):
    x=int(round(x)); y=int(round(y))
    layer=Image.new("RGBA",dst.size,(0,0,0,0))
    layer.paste(src,(x,y),src)
    dst.alpha_composite(layer)

def build_device(dW,dH,shot):
    dW=int(round(dW)); dH=int(round(dH))
    dev=Image.new("RGBA",(dW,dH),(0,0,0,0))
    # screenshot into glass opening (aspect matches exactly -> straight resize)
    sw=int(round(dW*OP_W)); sh=int(round(dH*OP_H))
    sx=int(round(dW*OP_L)); sy=int(round(dH*OP_T))
    shot_img=Image.open(os.path.join(SHOTS,shot)).convert("RGB").resize((sw,sh),Image.LANCZOS)
    screen=Image.new("RGBA",(dW,dH),(0,0,0,0))
    screen.paste(shot_img,(sx,sy))
    # clip to glass shape
    m=MASK.resize((dW,dH),Image.LANCZOS).split()[3]
    dev=Image.composite(screen,dev,m)
    # frame on top
    dev.alpha_composite(FRAME.resize((dW,dH),Image.LANCZOS))
    return dev

def device_shadow(dW,dH):
    dW=int(round(dW)); dH=int(round(dH))
    a=FRAME.resize((dW,dH),Image.LANCZOS).split()[3]
    sh=Image.new("RGBA",(dW,dH),(0,0,0,0))
    black=Image.new("RGBA",(dW,dH),(0,0,0,110))
    sh=Image.composite(black,sh,a)
    return sh

def draw_center_text(canvas,cx,y,text,fnt,fill,tracking=0):
    d=ImageDraw.Draw(canvas)
    if tracking>0:
        widths=[d.textlength(ch,font=fnt) for ch in text]
        total=sum(widths)+tracking*(len(text)-1)
        x=cx-total/2
        asc,desc=fnt.getmetrics()
        for ch,w in zip(text,widths):
            d.text((x,y),ch,font=fnt,fill=fill)
            x+=w+tracking
        return
    w=d.textlength(text,font=fnt)
    d.text((cx-w/2,y),text,font=fnt,fill=fill)

def render(slide,cW,cH):
    unit=min(cW,cH)
    inv=slide["inv"]
    c0=BG if not inv else BGALT
    c1=shade(BG,-6) if not inv else shade(BGALT,-8)
    canvas=vgrad(cW,cH,c0,c1).convert("RGBA")
    blob(canvas,cW,cH,ACCENT,-15,-10,55,0.25 if inv else 0.32)
    blob(canvas,cW,cH,ACCENT,70,75,45,0.18 if inv else 0.25)

    fwFrac=min(0.84, 0.72*(cH/cW)*MK_RATIO)
    dW=fwFrac*cW; dH=dW/FRAME_RATIO
    lay=slide["layout"]
    if lay=="hero":
        capY=cH*0.09; devX=(cW-dW)/2; devY=cH-dH+dH*0.15
    elif lay=="device-bottom":
        capY=cH*0.08; devX=(cW-dW)/2; devY=cH-dH-cH*0.02
    elif lay=="device-top":
        capY=cH*0.65; devX=(cW-dW)/2; devY=-cH*0.1
    else:
        capY=cH*0.09; devX=(cW-dW)/2; devY=cH-dH

    # device (shadow + frame). device-top device is above caption; draw device first.
    paste_rgba(canvas,device_shadow(dW,dH),devX,devY+dH*0.015)
    paste_rgba(canvas,build_device(dW,dH,slide["shot"]),devX,devY)

    # caption (centered), top-anchored at capY
    cx=cW*0.5
    y=capY
    # logo
    lw=int(unit*0.12)
    logo=LOGO.resize((lw,lw),Image.LANCZOS)
    paste_rgba(canvas,logo,cx-lw/2,y)
    y+=lw+unit*0.022
    # label
    lf=font(unit*0.028,bold=True)
    draw_center_text(canvas,cx,y,slide["label"],lf,ACCENT,tracking=unit*0.0015)
    la,ld=lf.getmetrics()
    y+=(la+ld)+unit*0.018
    # headline
    hf=font(unit*0.092,bold=True)
    ha,hd=hf.getmetrics()
    fill=FG if not inv else FGALT
    line_adv=unit*0.092*0.96
    for i,line in enumerate(slide["head"]):
        draw_center_text(canvas,cx,y,line,hf,hx(fill))
        y+=line_adv
    return canvas.convert("RGB")

def main():
    for label,cW,cH in SIZES:
        d=os.path.join(OUT,f"{cW}x{cH}")
        os.makedirs(d,exist_ok=True)
        for i,slide in enumerate(SLIDES,1):
            img=render(slide,cW,cH)
            img.save(os.path.join(d,f"{i:02d}-{slide['layout']}.png"))
        print("done",label,cW,cH)

if __name__=="__main__":
    main()
