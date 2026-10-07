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
  const label=d.quality==='fail'?'Surge FAIL':d.quality==='watch'?'Near limit':'Surge PASS';
  button.innerHTML='<span><i class="mark '+d.quality+'"></i><b>'+id+'</b></span><small>'+label+'</small>';
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
const colors={copper:0xc77a43,copperHot:0xe7a66c,metal:0x466079,field:0x50bedd,defect:0xff526e,particle:0xffe3a2,white:0xf4f8ff,off:0x6e91a3};
const tubeGeo=(curve,r=.014,segments=82)=>new T.TubeGeometry(curve,segments,r,5,true);
function racetrack(x,y,z,w,d){
  const p=[
    new T.Vector3(x+w,y,z-d*.62),new T.Vector3(x+w,y,z+d*.62),
    new T.Vector3(x+w*.74,y,z+d*.95),new T.Vector3(x,y,z+d),
    new T.Vector3(x-w*.74,y,z+d*.95),new T.Vector3(x-w,y,z+d*.62),
    new T.Vector3(x-w,y,z-d*.62),new T.Vector3(x-w*.74,y,z-d*.95),
    new T.Vector3(x,y,z-d),new T.Vector3(x+w*.74,y,z-d*.95)
  ];
  return new T.CatmullRomCurve3(p,true,'centripetal',.3);
}
function labelSprite(text,purple){
 const cvs=document.createElement('canvas');cvs.width=256;cvs.height=128;
 const ctx=cvs.getContext('2d');ctx.fillStyle='rgba(11,20,33,.88)';ctx.fillRect(25,16,206,88);
 ctx.strokeStyle=purple?'#b49deb':'#ced9ea';ctx.lineWidth=3;ctx.strokeRect(25,16,206,88);
 ctx.fillStyle=purple?'#dbc9ff':'#f4f8ff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 64px monospace';ctx.fillText(text,128,65);
 const tx=new T.CanvasTexture(cvs);tx.colorSpace=T.SRGBColorSpace || undefined;
 const s=new T.Sprite(new T.SpriteMaterial({map:tx,transparent:true,depthTest:false}));s.scale.set(.66,.33,1);return s;
}
function model(type,stage){
 const scene=new T.Scene();
 const camera=new T.PerspectiveCamera(43,1,.1,80);camera.position.set(6.9,5.2,10.8);camera.lookAt(0,0,0);
 const renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
 renderer.setClearColor(0x07111d,0);renderer.outputColorSpace=T.SRGBColorSpace || renderer.outputColorSpace;
 stage.insertBefore(renderer.domElement,stage.firstChild);
 const ambient=new T.AmbientLight(0xe2f1ff,1.35);scene.add(ambient);
 const key=new T.DirectionalLight(0xffffff,2.0);key.position.set(4,7,7);scene.add(key);
 const rim=new T.PointLight(0x42bdeb,2.0,14);rim.position.set(-4,0,5);scene.add(rim);
 const base=new T.Group();scene.add(base);
 const frameMat=new T.MeshStandardMaterial({color:colors.metal,metalness:.84,roughness:.33,transparent:true,opacity:.40});
 const steel=new T.MeshStandardMaterial({color:0x2e4158,metalness:.6,roughness:.42});
 function beam(x,y,z,sx,sy,sz,mat=frameMat){
    const m=new T.Mesh(new T.BoxGeometry(sx,sy,sz),mat);m.position.set(x,y,z);base.add(m);return m;
 }
 beam(0,-1.7,0,4.3,.17,5.2,steel);
 beam(0,1.74,0,4.3,.13,5.2);
 for(const x of [-2.04,0,2.04])for(const z of [-2.42,2.42])beam(x,0,z,.14,3.5,.17);
 beam(0,0,0,.48,3.20,4.52,frameMat);
 const coils={},interactiveMeshes=[],animations=[];
 const faultGroup=new T.Group();base.add(faultGroup);
 const fields=new T.Group();base.add(fields);
 for(const d of DATA){
   const x=d.id[0]==='A'?-1.20:1.20;
   const y=1.26-(Number(d.id[1])-1)*.62;
   const z=0;
   const g=new T.Group();base.add(g);
   const strands=[],points=[];
   const copper=new T.MeshStandardMaterial({color:colors.copper,metalness:.72,roughness:.27});
   const edges=new T.MeshStandardMaterial({color:0xf0b675,metalness:.65,roughness:.23});
   for(let i=0;i<7;i++){
     const curve=racetrack(x,y+i*.022-.065,z,.56-i*.047,2.20-i*.07);
     const mesh=new T.Mesh(tubeGeo(curve,i===0?.022:.018,70),i===0?edges:copper);
     mesh.userData.coilId=d.id;mesh.userData.isCopper=true;
     g.add(mesh);strands.push(mesh);interactiveMeshes.push(mesh);if(i===3)points.push(curve);
   }
   const placard=labelSprite(d.id,d.id[0]==='B');placard.position.set(x,y+.08,2.51);g.add(placard);
   const glow=new T.Mesh(new T.TorusGeometry(.55,.022,8,65),new T.MeshBasicMaterial({color:type==='damaged'&&d.id==='A4'?colors.defect:colors.field,transparent:true,opacity:0,depthWrite:false}));
   glow.rotation.x=Math.PI/2;glow.position.set(x,y+.03,0);g.add(glow);
   const balls=[];
   for(let j=0;j<5;j++){
     const mat=new T.MeshBasicMaterial({color:type==='damaged'&&d.id==='A4'?0xff8f6e:colors.particle,transparent:true,opacity:.92});
     const dot=new T.Mesh(new T.SphereGeometry(.065,8,7),mat);g.add(dot);balls.push(dot);
   }
   coils[d.id]={d,g,strands,placard,glow,balls,path:points[0],x,y};
   animations.push(coils[d.id]);
 }
 const fieldMat=new T.LineBasicMaterial({color:colors.field,transparent:true,opacity:.40,depthWrite:false});
 for(let i=0;i<9;i++){
   const z=-1.85+i*.47,points=[];
   for(let n=0;n<=90;n++){const a=n/90*Math.PI*2;points.push(new T.Vector3(Math.cos(a)*2.13,Math.sin(a)*1.93,z));}
   const geo=new T.BufferGeometry().setFromPoints(points);fields.add(new T.Line(geo,fieldMat));
 }
 const glowFault=new T.Mesh(new T.SphereGeometry(.14,15,10),new T.MeshBasicMaterial({color:colors.defect,transparent:true,opacity:.8}));
 glowFault.position.set(-.71,-.60,1.0);faultGroup.add(glowFault);
 const lead=[
   new T.Vector3(-.71,-.60,1),new T.Vector3(-.82,-.75,1.15),
   new T.Vector3(-.58,-1.1,1.25),new T.Vector3(-.15,-1.65,1.35)];
 const faultCurve=new T.CatmullRomCurve3(lead,false);
 const faultLine=new T.Line(new T.BufferGeometry().setFromPoints(faultCurve.getPoints(35)),new T.LineDashedMaterial({color:colors.defect,dashSize:.13,gapSize:.09,transparent:true,opacity:.9}));
 faultLine.computeLineDistances();faultGroup.add(faultLine);
 // This path is not a measured fault location; it is optional only.
 const t1=new T.Mesh(new T.SphereGeometry(.095,12,8),new T.MeshBasicMaterial({color:0xffb1c0}));
 t1.position.copy(lead[3]);faultGroup.add(t1);
 let rx=.19,ry=-.16,scale=1,down=null,dragged=false,lastDist=0;
 base.rotation.set(rx,ry,0);
 const pointers=new Map();
 function downPointer(e){pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});down={x:e.clientX,y:e.clientY};dragged=false;renderer.domElement.setPointerCapture(e.pointerId);}
 function pointerMove(e){
    if(!pointers.has(e.pointerId))return;
    const old=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>=2){
      const arr=[...pointers.values()];const dist=Math.hypot(arr[0].x-arr[1].x,arr[0].y-arr[1].y);
      if(lastDist)scale=Math.max(.57,Math.min(1.7,scale*lastDist/dist));lastDist=dist;dragged=true;
    }else{
      const dx=e.clientX-old.x,dy=e.clientY-old.y;if(Math.abs(dx)+Math.abs(dy)>0)dragged=true;
      ry+=dx*.008;rx=Math.max(-.95,Math.min(.95,rx+dy*.007));base.rotation.set(rx,ry,0);
    }
    camera.position.setLength(13.8*scale);camera.lookAt(0,0,0);
 }
 function upPointer(e){
   const wasClick=pointers.size===1&&!dragged&&down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<6;
   pointers.delete(e.pointerId);lastDist=0;if(wasClick)pick(e);
 }
 renderer.domElement.addEventListener('pointerdown',downPointer);
 renderer.domElement.addEventListener('pointermove',pointerMove);
 renderer.domElement.addEventListener('pointerup',upPointer);
 renderer.domElement.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);lastDist=0;});
 renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();scale=Math.max(.57,Math.min(1.7,scale*(1+e.deltaY*.001)));camera.position.setLength(13.8*scale);camera.lookAt(0,0,0);},{passive:false});
 const raycaster=new T.Raycaster(),ndc=new T.Vector2();
 function pick(e){
   const r=renderer.domElement.getBoundingClientRect();
   ndc.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);
   raycaster.setFromCamera(ndc,camera);
   const hits=raycaster.intersectObjects(interactiveMeshes,false);
   if(hits.length)selectCoil(hits[0].object.userData.coilId);
 }
 function resize(){
  const rect=stage.getBoundingClientRect();const w=Math.max(240,rect.width),h=Math.max(240,rect.height);
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
 }
 if(typeof ResizeObserver!=='undefined'){new ResizeObserver(resize).observe(stage);}else window.addEventListener('resize',resize);resize();
 return {
   type,renderer,scene,camera,base,fields,faultGroup,coils,
   reset(){rx=.19;ry=-.16;scale=1;camera.position.set(6.9,5.2,10.8);camera.lookAt(0,0,0);base.rotation.set(rx,ry,0);},
   refreshCoils(){
     for(const d of DATA){
       const obj=coils[d.id],isSelected=d.id===selected,isFail=type==='damaged'&&d.id==='A4';
       obj.glow.material.opacity=isSelected?.23:0;
       obj.glow.scale.setScalar(isSelected?1.25:1);
       obj.strands.forEach(mesh=>{
         mesh.material=(isFail
           ?new T.MeshStandardMaterial({color:isSelected?0xf39065:0x9b704d,metalness:.55,roughness:.46,emissive:0x351006,emissiveIntensity:.2})
           :new T.MeshStandardMaterial({color:isSelected?0xffd1a3:colors.copper,metalness:.7,roughness:.27,emissive:isSelected?0x3c250f:0x000000,emissiveIntensity:.26}));
       });
       obj.placard.material.opacity=isSelected?1:.79;
     }
   },
   render(t){
     fields.visible=showFields;faultGroup.visible=type==='damaged'&&showFault;
     for(const c of animations){
       // Direction reverses periodically. Marker paths are illustrative, not charge-carrier velocities.
       let phase=Math.sin(t*.90+(c.d.id[0]==='A'?0:.8))*.18;
       const amp=.28+.72*Math.abs(Math.cos(t*.90+(c.d.id[0]==='A'?0:.8)));
       for(let j=0;j<c.balls.length;j++){
         const u=((j/c.balls.length+phase+1)%1);
         const p=c.path.getPointAt(u);c.balls[j].position.copy(p);
         c.balls[j].material.opacity=.35+.62*amp;
         c.balls[j].scale.setScalar(c.d.id===selected?1.5:1);
       }
       c.glow.material.opacity=c.d.id===selected?.12+.11*Math.abs(Math.sin(t*2.2)):0;
     }
     if(showFault)glowFault.scale.setScalar(1+.18*Math.abs(Math.sin(t*4)));
     renderer.render(scene,camera);
   }
 };
}
for(const type of modelTypes){
 const stage=makeCard(type);
 try{models.push(model(type,stage));}
 catch(e){console.error('3D renderer setup failed:',e);stage.innerHTML='<p class="no-webgl">This browser could not start the 3D renderer. Try a browser with WebGL enabled.</p>';}
}
selectCoil('A4');
const runBtn=document.getElementById('runBtn'),speedValue=document.getElementById('speedValue');
runBtn.addEventListener('click',()=>{playing=!playing;runBtn.textContent=playing?'Ⅱ Pause':'▶ Resume';runBtn.setAttribute('aria-pressed',String(playing));});
document.getElementById('fieldToggle').addEventListener('change',e=>{showFields=e.target.checked;});
document.getElementById('leakToggle').addEventListener('change',e=>{showFault=e.target.checked;});
document.getElementById('speedRange').addEventListener('input',e=>{speed=Number(e.target.value)/42;speedValue.textContent=speed.toFixed(1)+'×';});
document.getElementById('resetBtn').addEventListener('click',()=>models.forEach(m=>m.reset()));
let prev=0;
function frame(ts){const dt=Math.min((ts-prev)/1000,.05)||0;prev=ts;if(playing)clock+=dt*speed;for(const m of models)m.render(clock);requestAnimationFrame(frame);}
requestAnimationFrame(frame);
})();