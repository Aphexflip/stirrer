(function(){
'use strict';
const DATA=[
{id:'A1',ir:.39,r:.06,area:4.6,difa:10.7,quality:'pass'},
{id:'B1',ir:.46,r:.06,area:4.0,difa:6.9,quality:'pass'},
{id:'A2',ir:.25,r:.07,area:4.8,difa:11.9,quality:'watch'},
{id:'B2',ir:.71,r:.06,area:4.8,difa:8.5,quality:'pass'},
{id:'A3',ir:.24,r:.06,area:5.2,difa:11.0,quality:'pass'},
{id:'B3',ir:.61,r:.06,area:4.9,difa:10.4,quality:'pass'},
{id:'A4',ir:.26,r:.06,area:-59.7,difa:61.7,quality:'fail'},
{id:'B4',ir:.81,r:.06,area:4.7,difa:9.4,quality:'pass'},
{id:'A5',ir:.26,r:.07,area:null,difa:null,quality:'pass'},
{id:'B5',ir:.68,r:.06,area:3.9,difa:9.4,quality:'pass'}];
const byId=Object.fromEntries(DATA.map(d=>[d.id,d]));
let view=document.body.dataset.view || 'compare';
if(!['healthy','damaged','compare'].includes(view))view='compare';
document.querySelectorAll('[data-route]').forEach(a=>{if(a.dataset.route===view)a.setAttribute('aria-current','page');});
let selected='A4',playing=true,showFields=true,showFault=false,speed=1,models=[],clock=0;
const sceneGrid=document.getElementById('scene-grid');
const modelTypes=view==='compare'?['healthy','damaged']:[view];
if(modelTypes.length===1)sceneGrid.classList.add('solo');
const map=document.getElementById('coilMap');
for(const side of ['A SIDE • WHITE','B SIDE • PURPLE']){let el=document.createElement('div');el.className='column-head';el.textContent=side;map.appendChild(el);}
for(let row=1;row<=5;row++)for(const side of ['A','B']){
  const id=side+row,d=byId[id],button=document.createElement('button');button.type='button';button.className='coil-btn';button.dataset.id=id;
  const healthyReference=view==='healthy';
  const label=healthyReference?'Reference only':d.quality==='fail'?'Surge FAIL':d.quality==='watch'?'Near limit':'Surge PASS';
  button.innerHTML='<span><i class="mark '+(healthyReference?'reference':d.quality)+'"></i><b>'+id+'</b></span><small>'+label+'</small>';
  button.addEventListener('click',()=>selectCoil(id));map.appendChild(button);
}
function selectCoil(id){
  selected=id;const d=byId[id];
  map.querySelectorAll('button').forEach(b=>{let yes=b.dataset.id===id;b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',String(yes));});
  // The healthy magnet's individual coil measurements have not been supplied.
  // Never mislabel 000422 failure measurements as known-good readings.
  if(view==='healthy'){
    document.getElementById('detailTitle').textContent=id+' · Healthy reference illustration';
    const referenceStatus=document.getElementById('detailStatus');
    referenceStatus.textContent='REFERENCE';
    referenceStatus.className='status pass';
    document.getElementById('readouts').innerHTML=
      '<div class="readout"><small>HEALTHY ASSEMBLY IR • 1000 V</small><strong>&gt;999 MΩ</strong></div>'+
      '<div class="readout"><small>INDIVIDUAL COIL IR</small><strong>Not measured</strong></div>'+
      '<div class="readout"><small>INDIVIDUAL SURGE RESULT</small><strong>Not supplied</strong></div>';
    document.getElementById('detailText').textContent='This healthy coil is a conceptual reference only. The known-good assembled T-500 reportedly showed off-scale high insulation resistance. Individual good-coil resistance and surge values have not been supplied; do not infer them from the damaged unit.';
    models.forEach(m=>m.refreshCoils());
    return;
  }
  document.getElementById('detailTitle').textContent=id+' · '+(d.quality==='fail'?'Surge comparison failed':d.quality==='watch'?'Surge pass near threshold':'Surge comparison passed');
  const status=document.getElementById('detailStatus');status.textContent=d.quality.toUpperCase();status.className='status '+d.quality;
  const reading=(label,value,cls)=>'<div class="readout"><small>'+label+'</small><strong'+(cls?' class="'+cls+'"':'')+'>'+value+'</strong></div>';
  document.getElementById('readouts').innerHTML=
    reading('INSTALLED MEGGER • 1000 V',d.ir.toFixed(2)+' MΩ','')+
    reading('T1–T2 RESISTANCE',d.r.toFixed(2)+' Ω','')+
    reading('SURGE DIFA',d.difa===null?'Not recorded':d.difa.toFixed(1)+'%',d.quality==='fail'?'fail':d.quality==='watch'?'watch':'')+
    reading('SURGE AREA',d.area===null?'Not recorded':(d.area>=0?'+':'')+d.area.toFixed(1)+'%',d.quality==='fail'?'fail':'')+
    reading('SURGE VOLTAGE','3600 V','')+
    reading('BENCH MEGGER','PENDING','');
  let message;
  if(d.quality==='fail')message='A4 produced a dramatically different surge waveform (61.7% Difa, compared with the tester’s displayed 12.5% limit). This is a confirmed test failure, not a confirmed physical location of a short or ground fault. Copper continuity was still measured at about 0.06 Ω.';
  else if(d.quality==='watch')message='A2 passed its configured surge comparison, but 11.9% Difa is close to the displayed 12.5% limit. Its low installed insulation reading still requires a proper bench isolation test.';
  else message=id+' passed the surge tester’s programmed comparison. That does not clear its low installed Megger reading or prove the coil is defect-free. Tomorrow’s separated-coil insulation test is decisive.';
  document.getElementById('detailText').textContent=message;
  models.forEach(m=>m.refreshCoils());
}
function makeCard(type){
  const box=document.createElement('article');box.className='viewport';
  box.innerHTML='<div class="viewport-header"><div><small>'+ (type==='healthy'?'ILLUSTRATIVE KNOWN-GOOD CASE':'SERIAL #000422 · FIELD TEST DATA') +'</small><h2>'+(type==='healthy'?'Normal EMS magnet':'Damaged EMS magnet')+'</h2></div><span class="viewport-tag '+type+'">'+(type==='healthy'?'REFERENCE':'A4 SURGE FAIL')+'</span></div><div class="model-stage"><span class="stage-hint">Drag to rotate · scroll/pinch to zoom · click coil to inspect</span></div><div class="viewport-footer"><span>'+(type==='healthy'?'No insulation fault is modeled':'Ground leakage path unknown — dashed red path is only a hypothesis')+'</span><b>'+(type==='healthy'?'10 intact illustrated circuits':'1 confirmed surge-test fail')+'</b></div>';
  sceneGrid.appendChild(box);return box.querySelector('.model-stage');
}
if(typeof THREE==='undefined'){
  modelTypes.forEach(type=>{const stage=makeCard(type);stage.innerHTML='<p class="no-webgl">3D library did not load. Check the page network connection.</p>';});
  selectCoil(selected);return;
}

const T=THREE;
const C={copper:0xb86830,highlight:0xffbb79,insulation:0x27262b,steel:0x344254,blue:0x30669a,iron:0x6a453b,glow:0x53d8ff,red:0xff5770};
let layerSpread=.30,showFrame=true;
function roundRect(w,h,r){
 const s=new T.Shape(),x=w/2,z=h/2,rad=Math.min(r,x-.001,z-.001);
 s.moveTo(-x+rad,-z);s.lineTo(x-rad,-z);s.absarc(x-rad,-z+rad,rad,-Math.PI/2,0,false);
 s.lineTo(x,z-rad);s.absarc(x-rad,z-rad,rad,0,Math.PI/2,false);
 s.lineTo(-x+rad,z);s.absarc(-x+rad,z-rad,rad,Math.PI/2,Math.PI,false);
 s.lineTo(-x,-z+rad);s.absarc(-x+rad,-z+rad,rad,Math.PI,3*Math.PI/2,false);
 return s;
}
function copperBand(){
 const outer=roundRect(1.17,2.36,.30),inner=roundRect(.60,1.77,.22);
 outer.holes.push(new T.Path(inner.getPoints(80).reverse()));
 const geo=new T.ExtrudeGeometry(outer,{depth:.132,bevelEnabled:true,bevelThickness:.009,bevelSize:.009,bevelSegments:2,curveSegments:9});
 geo.rotateX(-Math.PI/2);return geo;
}
const bandGeo=copperBand();
function loopPath(w,h,y){
 const s=roundRect(w,h,.26);
 const v=s.getSpacedPoints(85).map(p=>new T.Vector3(p.x,y,p.y));
 return new T.CatmullRomCurve3(v,true,'centripetal',.3);
}
function tagSprite(text,tint=0xcbe7f4){
 const c=document.createElement('canvas');c.width=256;c.height=90;
 const ctx=c.getContext('2d');ctx.fillStyle='rgba(14,26,40,.95)';ctx.fillRect(13,5,230,79);
 ctx.strokeStyle='#638097';ctx.lineWidth=2;ctx.strokeRect(13,5,230,79);
 ctx.fillStyle='#'+new T.Color(tint).getHexString();ctx.font='bold 49px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,128,44);
 const tex=new T.CanvasTexture(c);if(T.SRGBColorSpace)tex.colorSpace=T.SRGBColorSpace;
 const s=new T.Sprite(new T.SpriteMaterial({map:tex,transparent:true,depthTest:false,depthWrite:false}));s.scale.set(.38,.15,1);s.renderOrder=11;return s;
}
function buildModel(type,stage){
 const scene=new T.Scene();const camera=new T.PerspectiveCamera(42,1,.05,70);
 const defaultCamera=new T.Vector3(5.25,3.55,7.55),lookAt=new T.Vector3(0,-.03,0);let cameraBase=defaultCamera.clone();
 camera.position.copy(defaultCamera);camera.lookAt(lookAt);
 const renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.8));
 renderer.setClearColor(0x0b1724,0);
 if(T.SRGBColorSpace)renderer.outputColorSpace=T.SRGBColorSpace;
 stage.insertBefore(renderer.domElement,stage.firstChild);
 scene.add(new T.HemisphereLight(0xe6f4ff,0x203246,1.9));
 const spot=new T.DirectionalLight(0xfff5e6,2.25);spot.position.set(3,8,5);scene.add(spot);
 const fill=new T.DirectionalLight(0x5ab9ff,1.2);fill.position.set(-4,3,-3);scene.add(fill);
 const root=new T.Group();scene.add(root);root.rotation.set(.08,-.05,0);
 const frameGroup=new T.Group();root.add(frameGroup);
 const coreGroup=new T.Group();root.add(coreGroup);
 const copperGroup=new T.Group();root.add(copperGroup);
 const fieldGroup=new T.Group();root.add(fieldGroup);
 const warningGroup=new T.Group();root.add(warningGroup);
 const iron=new T.MeshStandardMaterial({color:C.iron,metalness:.35,roughness:.7});
 const blue=new T.MeshStandardMaterial({color:C.blue,metalness:.52,roughness:.43});
 const steel=new T.MeshStandardMaterial({color:C.steel,metalness:.65,roughness:.39});
 const brightSteel=new T.MeshStandardMaterial({color:0x8293a2,metalness:.88,roughness:.3});
 const insulator=new T.MeshStandardMaterial({color:C.insulation,metalness:.1,roughness:.84});
 const boltMat=new T.MeshStandardMaterial({color:0x9ba7af,metalness:.95,roughness:.2});
 const copperTerminal=new T.MeshStandardMaterial({color:0xd59052,metalness:.72,roughness:.29});
 function box(parent,x,y,z,w,h,d,material){
   const m=new T.Mesh(new T.BoxGeometry(w,h,d),material);m.position.set(x,y,z);parent.add(m);return m;
 }
 function cylinder(parent,x,y,z,r,length,material,rot){
   const m=new T.Mesh(new T.CylinderGeometry(r,r,length,10),material);m.rotation.set(rot||0,0,0);m.position.set(x,y,z);parent.add(m);return m;
 }
 // Based on the existing Stirrer reference geometry: two stacked five-coil packs,
 // iron core blocks, painted steel tray, end sections and clamping rails.
 // Details are schematic and not a dimensionally approved T-500 drawing.
 box(coreGroup,0,-.77,0,3.72,.13,3.02,steel);
 for(const x of [-1.69,0,1.69]){
   box(coreGroup,x,-.43,0,.22,.56,2.14,iron);
   for(let k=0;k<17;k++)box(coreGroup,x+(k-8)*.009,-.11,0,.006,.045,2.13,insulator);
 }
 for(const x of [-1.49,1.49]){
   box(coreGroup,x,-.36,0,.12,.52,2.46,iron);
   for(const z of [-.96,.96])box(coreGroup,x,-.03,z,.12,.07,.15,brightSteel);
 }
 // Container structure: painted end walls, rails, lifting brackets and tie rods.
 for(const z of [-1.54,1.54]){
   box(frameGroup,0,-.67,z,3.85,.18,.11,blue);
   box(frameGroup,0,.06,z,3.72,.085,.095,blue);
   for(const x of [-1.83,1.83]){
     box(frameGroup,x,-.32,z,.14,.70,.11,blue);
     cylinder(frameGroup,x,.05,z,.05,.14,boltMat);
   }
 }
 for(const x of [-1.89,1.89]){
   box(frameGroup,x,-.33,0,.12,.74,3.14,blue);
   box(frameGroup,x,.04,0,.25,.10,3.07,brightSteel);
   for(const z of [-1.08,1.08]){
     const eye=new T.Mesh(new T.TorusGeometry(.12,.035,8,20),brightSteel);
     eye.position.set(x,.23,z);eye.rotation.y=Math.PI/2;frameGroup.add(eye);
   }
 }
 for(const x of [-.42,.42]){
   for(const z of [-1.32,1.32]){
      box(frameGroup,x,.11,z,.18,.09,.20,steel);
      cylinder(frameGroup,x,.17,z,.036,.13,boltMat);
   }
 }
 // Metal straps across the top with paired bolt heads; slightly see-through
 // so the insulation and winding geometry remain inspectable.
 const clampMat=new T.MeshStandardMaterial({color:0x9f5d6a,metalness:.5,roughness:.42,transparent:true,opacity:.78});
 for(const z of [-.91,.91]){
   box(frameGroup,0,.08,z,3.25,.055,.082,clampMat);
   for(const x of [-1.25,-.42,.42,1.25])cylinder(frameGroup,x,.14,z,.042,.032,boltMat);
 }
 // Right/left stack designation visible from the terminal side.
 const sideA=tagSprite('A / WHITE',0xf7fbff);sideA.position.set(-.79,.67,1.49);root.add(sideA);
 const sideB=tagSprite('B / PURPLE',0xd9c0ff);sideB.position.set(.79,.67,1.49);root.add(sideB);
 const coils={},hitMeshes=[];
 const strandDark=new T.MeshStandardMaterial({color:0x894719,metalness:.65,roughness:.35});
 const stripeMat=new T.MeshStandardMaterial({color:0xe3a66b,metalness:.79,roughness:.27});
 const wrapMat=new T.MeshStandardMaterial({color:0x454349,metalness:.04,roughness:.95});
 for(const d of DATA){
   const bank=d.id[0]==='A'?-1:1,level=Number(d.id[1])-1;
   const x=bank*.79,y=.30-level*.21,group=new T.Group();group.position.set(x,y,0);copperGroup.add(group);
   const isFail=type==='damaged'&&d.id==='A4';
   const bodyMat=new T.MeshStandardMaterial({color:isFail?0x9a643e:0xb87840,metalness:.52,roughness:.39,emissive:isFail?0x27120d:0x000000,emissiveIntensity:.25});
   const body=new T.Mesh(bandGeo,bodyMat);group.add(body);body.userData.coilId=d.id;hitMeshes.push(body);
   // Repeated parallel varnished copper ribbons, based on field coil photographs.
   const filaments=[];
   for(let i=0;i<11;i++){
     const w=1.145-i*.046,h=2.333-i*.046;
     const curve=loopPath(w,h,.143);
     const mat=i%3===0?strandDark:stripeMat;
     const mesh=new T.Mesh(new T.TubeGeometry(curve,92,.010,5,true),mat);
     mesh.userData.coilId=d.id;group.add(mesh);filaments.push(mesh);hitMeshes.push(mesh);
   }
   // Dark fiberglass reinforcement over the curved winding ends.
   for(const z of [-1.09,1.09]){
     box(group,0,.157,z,.68,.023,.23,wrapMat);
     for(const xx of [-.39,.39])box(group,xx,.154,z,.035,.04,.27,wrapMat);
   }
   // Two copper terminal blades with bolt holes, visible at the terminal side.
   for(const side of [-1,1]){
      const tx=side*.32;
      box(group,tx,.07,1.37,.28,.042,.34,copperTerminal);
      box(group,tx,.10,1.20,.26,.06,.09,copperTerminal);
      cylinder(group,tx,.102,1.47,.050,.009,insulator);
      cylinder(group,tx,.109,1.47,.025,.010,boltMat);
   }
   // Small thermal-sensor cable and mounting pad.
   box(group,-.47,.15,-.81,.13,.027,.085,insulator);
   const cableCurve=new T.CatmullRomCurve3([new T.Vector3(-.47,.15,-.81),new T.Vector3(-.60,.26,-.97),new T.Vector3(-.66,.30,-1.25)],false);
   const cable=new T.Mesh(new T.TubeGeometry(cableCurve,18,.012,5,false),insulator);group.add(cable);
   const label=tagSprite(d.id,bank>0?0xd6bdff:0xffffff);
   label.position.set(0,.24,1.63);group.add(label);
   const highlight=new T.Mesh(new T.BoxGeometry(1.24,.21,2.48),new T.MeshBasicMaterial({color:isFail?C.red:C.glow,transparent:true,opacity:0,wireframe:true,depthWrite:false}));
   highlight.position.y=.066;group.add(highlight);
   const pulseCurve=loopPath(.87,2.03,.175),dots=[];
   for(let i=0;i<5;i++){
     const color=isFail?0xff7184:0xffecac;
     const dot=new T.Mesh(new T.SphereGeometry(.039,9,7),new T.MeshBasicMaterial({color,transparent:true,opacity:.9}));
     group.add(dot);dots.push(dot);
   }
   coils[d.id]={d,group,body,filaments,label,highlight,dots,path:pulseCurve,baseY:y,level,isFail};
 }
 // Transparent illustrated field returns around the two stack positions.
 const fieldMat=new T.LineBasicMaterial({color:0x64d8f8,transparent:true,opacity:.36,depthWrite:false});
 for(const bank of [-1,1])for(let j=0;j<5;j++){
   const q=[],x=bank*.79,z=(j-2)*.36;
   for(let k=0;k<=84;k++){let a=k/84*Math.PI*2;q.push(new T.Vector3(x+Math.cos(a)*(.78+j*.045),-.11+Math.sin(a)*(.62+j*.065),z));}
   fieldGroup.add(new T.Line(new T.BufferGeometry().setFromPoints(q),fieldMat));
 }
 // Visually hypothesized return to steel only, NOT a mapped short position.
 const faultMaterial=new T.LineDashedMaterial({color:C.red,dashSize:.12,gapSize:.08,transparent:true,opacity:.82});
 const faultPoints=[new T.Vector3(-1.17,-.25,1.1),new T.Vector3(-1.42,-.36,1.25),new T.Vector3(-1.85,-.67,1.47)];
 const faultLine=new T.Line(new T.BufferGeometry().setFromPoints(faultPoints),faultMaterial);faultLine.computeLineDistances();warningGroup.add(faultLine);
 const faultDot=new T.Mesh(new T.SphereGeometry(.095,13,8),new T.MeshBasicMaterial({color:C.red}));faultDot.position.copy(faultPoints[0]);warningGroup.add(faultDot);
 let rotX=.10,rotY=-.05,zoom=1;
 const pointers=new Map();let tap=null,dragged=false,lastDist=0;
 const canvas=renderer.domElement;const raycaster=new T.Raycaster(),ndc=new T.Vector2();
 function updateCamera(){camera.position.copy(cameraBase).multiplyScalar(zoom);camera.lookAt(lookAt);}
 function start(e){pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});tap={x:e.clientX,y:e.clientY};dragged=false;canvas.setPointerCapture(e.pointerId);}
 function move(e){
   if(!pointers.has(e.pointerId))return;
   const prev=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(pointers.size>1){
     const a=[...pointers.values()],dist=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
     if(lastDist)zoom=Math.min(2.1,Math.max(.60,zoom*lastDist/dist));
     lastDist=dist;updateCamera();dragged=true;
   }else{
     const dx=e.clientX-prev.x,dy=e.clientY-prev.y;
     if(Math.abs(dx)+Math.abs(dy)>.01)dragged=true;
     rotY+=dx*.006;rotX=Math.min(1.25,Math.max(-1.1,rotX+dy*.005));
     root.rotation.set(rotX,rotY,0);
   }
 }
 function finish(e){const click=pointers.size===1&&!dragged&&tap&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)<7;pointers.delete(e.pointerId);lastDist=0;if(click)pick(e);}
 function pick(e){
    const r=canvas.getBoundingClientRect();ndc.set(2*(e.clientX-r.left)/r.width-1,1-2*(e.clientY-r.top)/r.height);
    raycaster.setFromCamera(ndc,camera);const intersections=raycaster.intersectObjects(hitMeshes,false);
    if(intersections.length)selectCoil(intersections[0].object.userData.coilId);
 }
 canvas.addEventListener('pointerdown',start);canvas.addEventListener('pointermove',move);
 canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);lastDist=0;});
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.6,Math.min(2.1,zoom*(1+e.deltaY*.001)));updateCamera();},{passive:false});
 function resize(){const r=stage.getBoundingClientRect(),w=Math.max(260,r.width),h=Math.max(240,r.height);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
 if('ResizeObserver'in window){new ResizeObserver(resize).observe(stage);}else window.addEventListener('resize',resize);resize();
 function setSpread(v){for(const c of Object.values(coils))c.group.position.y=c.baseY+(2-c.level)*v*.30;}
 return {
   type,renderer,scene,coils,setSpread,
   reset(){this.preset('iso');},
   preset(viewName){zoom=1;rotX=.10;rotY=-.05;root.rotation.set(rotX,rotY,0);camera.up.set(0,1,0);cameraBase=defaultCamera.clone();if(viewName==='top'){rotX=0;rotY=0;root.rotation.set(0,0,0);cameraBase.set(0,9.5,.01);camera.up.set(0,0,-1);}else if(viewName==='terminal'){rotX=0;rotY=0;root.rotation.set(0,0,0);cameraBase.set(0,1.5,10.1);}updateCamera();},
   refreshCoils(){
      for(const c of Object.values(coils)){
        const active=selected===c.d.id,damaged=c.isFail;
        c.highlight.material.opacity=active?.40:0;
        c.body.material.color.setHex(damaged?0x9a643e:active?0xd9a36a:0xb87840);
        c.body.material.emissive.setHex(active?(damaged?0x64202b:0x4d2d13):damaged?0x27120d:0x000000);
        c.label.material.opacity=active?1:.83;
      }
   },
   render(t){
     fieldGroup.visible=showFields;
     warningGroup.visible=type==='damaged'&&showFault;
     frameGroup.visible=showFrame;
     for(const c of Object.values(coils)){
       const curr=Math.sin(t*.86+(c.d.id[0]==='B'?1.5:0)),active=selected===c.d.id;
       for(let j=0;j<c.dots.length;j++){
         const phase=(j/c.dots.length+.11*curr+1)%1;
         c.dots[j].position.copy(c.path.getPointAt(phase));
         c.dots[j].material.opacity=(active?.95:.38)*(.75+.25*Math.abs(curr));
       }
       if(active)c.highlight.material.opacity=.28+.12*Math.abs(Math.sin(t*2));
     }
     if(showFault)faultDot.scale.setScalar(1+.20*Math.abs(Math.sin(t*3)));
     renderer.render(scene,camera);
   }
 };
}
for(const type of modelTypes){
 const stage=makeCard(type);
 try{models.push(buildModel(type,stage));}
 catch(e){console.error('3D renderer setup failed:',e);stage.innerHTML='<p class="no-webgl">This browser could not start the 3D renderer. Try a browser with WebGL enabled.</p>';}
}
selectCoil('A4');
const runBtn=document.getElementById('runBtn'),speedValue=document.getElementById('speedValue');
runBtn.addEventListener('click',()=>{playing=!playing;runBtn.textContent=playing?'Ⅱ Pause':'▶ Resume';runBtn.setAttribute('aria-pressed',String(playing));});
document.getElementById('fieldToggle').addEventListener('change',e=>{showFields=e.target.checked;});
document.getElementById('leakToggle').addEventListener('change',e=>{showFault=e.target.checked;});
document.getElementById('speedRange').addEventListener('input',e=>{speed=Number(e.target.value)/42;speedValue.textContent=speed.toFixed(1)+'×';});
document.getElementById('resetBtn').addEventListener('click',()=>models.forEach(m=>m.reset()));
models.forEach(m=>m.setSpread(layerSpread));
document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>models.forEach(m=>m.preset(b.dataset.camera))));
const expl=document.getElementById('explodeRange'),explodeValue=document.getElementById('explodeValue');
if(expl){expl.addEventListener('input',e=>{layerSpread=Number(e.target.value)/100;explodeValue.textContent=Math.round(layerSpread*100)+'%';models.forEach(m=>m.setSpread(layerSpread));});}
const frameToggle=document.getElementById('frameToggle');if(frameToggle)frameToggle.addEventListener('change',e=>{showFrame=e.target.checked;});
let prev=0;
function frame(ts){const dt=Math.min((ts-prev)/1000,.05)||0;prev=ts;if(playing)clock+=dt*speed;for(const m of models)m.render(clock);requestAnimationFrame(frame);}
requestAnimationFrame(frame);
})();