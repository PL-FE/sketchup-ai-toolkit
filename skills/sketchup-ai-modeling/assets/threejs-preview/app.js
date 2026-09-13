import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {definitions,validateDocument,makeComponent,disposeComponent} from './recipes.js';
const $=s=>document.querySelector(s), clone=x=>structuredClone(x);
let doc,selected,isolated=false,view='perspective',scene,root,renderer,camera,controls,ground,grid;
let nodes=new Map(),history=[],redo=[],draftBefore=null,framePending=false,cardTimer,thumbCache=new Map();
let lastUpdateMs=0,geometryUpdates=0,storageKey,initialText,baseline;
function status(text){$('#status').textContent=text;}
function fail(e){$('#error').hidden=false;$('#error').textContent='预览未能运行：'+e.message+'。请通过本地服务打开，并确认浏览器支持 WebGL 2。';$('#loading').hidden=true;console.error(e);}
function snapshot(){return clone(doc);}
function historyState(document=doc){return {document:clone(document),baseline:clone(baseline)};}
function pushHistory(before){history.push(historyState(before));if(history.length>40)history.shift();redo=[];}
function clearReview(d){d.review={status:'pending',note:'当前预览尚待用户确认'};}
function cache(){try{localStorage.setItem(storageKey,JSON.stringify({base:initialText,document:doc,baseline}));}catch{status('浏览器草稿保存不可用，请导出方案保留修改。');}}
function commit(before){if(JSON.stringify(before.components)===JSON.stringify(doc.components))return;pushHistory(before);doc.revision++;clearReview(doc);cache();refreshMeta();}
function refreshMeta(){document.title=doc.title;$('#title').textContent=doc.title;$('#revision').textContent=`v${doc.revision} · 待确认`;$('#notes').textContent=doc.notes||'未提供说明';$('#undo').disabled=!history.length;$('#redo').disabled=!redo.length;}
function resetCurrent(){
  const original=baseline.components.find(c=>c.id===selected);
  if(!original){status('当前组件没有初始参数，无法重置。');return;}
  const before=snapshot(),index=doc.components.findIndex(c=>c.id===selected);
  if(JSON.stringify(doc.components[index])===JSON.stringify(original)){status('当前组件已是初始状态。');return;}
  draftBefore=null;doc.components[index]=clone(original);attach(doc.components[index]);applyVisibility();groundFit();
  thumbCache.delete(selected);commit(before);refreshUI();scheduleCards();invalidate();status(`已重置 ${selected}，其他组件保留；可以撤销。`);
}
function resetAll(){
  const before=snapshot();draftBefore=null;
  const next=clone(baseline);next.revision=doc.revision;
  if(JSON.stringify(doc.components)===JSON.stringify(next.components)){isolated=false;applyVisibility();setView('perspective');status('方案已是初始状态，已恢复整体视角。');return;}
  isolated=false;view='perspective';loadModel(next);commit(before);status('已恢复本次载入方案的初始参数与整体视角；可以撤销。');
}
function visibleNodes(){return [...nodes.values()].filter(n=>n.visible);}
function bounds(){const b=new THREE.Box3();for(const n of visibleNodes())b.expandByObject(n);if(b.isEmpty())b.set(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,1,1));return b;}
function fullBounds(){const b=new THREE.Box3();for(const n of nodes.values())b.expandByObject(n);return b;}
function applyVisibility(){for(const c of doc.components)nodes.get(c.id).visible=c.visible!==false&&(!isolated||c.id===selected);$('#mode').textContent=isolated?`局部 · ${selected}`:'整体';$('#isolate').textContent=isolated?'查看整体':'单独查看';$('#visible').textContent=doc.components.find(c=>c.id===selected)?.visible===false?'显示组件':'隐藏组件';}
function groundFit(){const b=fullBounds(),size=b.getSize(new THREE.Vector3()),center=b.getCenter(new THREE.Vector3()),s=Math.max(size.x,size.z,6)*2.3;ground.scale.set(s,s,1);ground.position.set(center.x,b.min.y-.015,center.z);grid.position.set(center.x,b.min.y-.012,center.z);grid.scale.setScalar(s/20);}
function attach(c){const old=nodes.get(c.id);if(old){root.remove(old);disposeComponent(old);}const n=makeComponent(c);nodes.set(c.id,n);root.add(n);geometryUpdates++;}
function loadModel(d,resetView=true){doc=validateDocument(d);for(const n of nodes.values()){root.remove(n);disposeComponent(n);}nodes.clear();thumbCache.clear();doc.components.forEach(attach);selected=nodes.has(selected)?selected:doc.components[0].id;applyVisibility();groundFit();refreshUI();if(resetView)setView(view);scheduleCards();invalidate();}
function invalidate(){if(framePending)return;framePending=true;requestAnimationFrame(()=>{framePending=false;renderer.render(scene,camera);});}
function cameraFor(mode,b,aspect){
  const center=b.getCenter(new THREE.Vector3()),size=b.getSize(new THREE.Vector3()),extent=Math.max(size.length(),1);
  let cam;
  if(mode==='perspective'){
    cam=new THREE.PerspectiveCamera(38,aspect,Math.max(extent/10000,.001),extent*100+100);
    const dir=new THREE.Vector3(1,.8,1.2).normalize();const radius=extent/2;
    const vf=THREE.MathUtils.degToRad(38),hf=2*Math.atan(Math.tan(vf/2)*aspect),dist=radius/Math.sin(Math.min(vf,hf)/2)*1.2;
    cam.position.copy(center).addScaledVector(dir,dist);
  }else{
    // The three orthographic presets share the same frustum scale.
    const span=Math.max(size.x,size.y,size.z,1),half=span*.7*Math.max(1,1/aspect);
    cam=new THREE.OrthographicCamera(-half*aspect,half*aspect,half,-half,.001,extent*100+100);
    const dirs={front:[0,0,1],side:[1,0,0],top:[0,1,0],iso:[1,.8,1.2]};
    const dir=new THREE.Vector3(...dirs[mode]).normalize();cam.position.copy(center).addScaledVector(dir,extent*3+10);
    if(mode==='top')cam.up.set(0,0,-1);
  }
  cam.lookAt(center);cam.updateProjectionMatrix();return {cam,center};
}
function setView(mode){view=mode;const el=$('#stage'),{cam,center}=cameraFor(mode,bounds(),el.clientWidth/el.clientHeight);camera=cam;controls?.dispose();controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(center);controls.enableDamping=false;controls.enableRotate=mode==='perspective';controls.addEventListener('change',invalidate);controls.update();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===mode));$('.hint').textContent=mode==='perspective'?'拖动旋转 · 滚轮缩放 · 右键平移':'正交视图 · 滚轮缩放 · 右键平移';invalidate();}
function resize(){const el=$('#stage'),w=el.clientWidth,h=el.clientHeight;renderer.setSize(w,h,false);if(camera?.isPerspectiveCamera){camera.aspect=w/h;camera.updateProjectionMatrix();}else if(camera){const half=(camera.top-camera.bottom)/2;camera.left=-half*w/h;camera.right=half*w/h;camera.updateProjectionMatrix();}invalidate();}
function select(id){if(!nodes.has(id))return;selected=id;applyVisibility();refreshUI();if(isolated)setView(view);invalidate();}
function refreshUI(){
  const sel=$('#selection');sel.replaceChildren();for(const c of doc.components){const o=document.createElement('option');o.value=c.id;o.textContent=`${c.id} · ${c.name}`;sel.append(o);}sel.value=selected;
  refreshMeta();renderEditor();for(const card of $('#cards').children)card.classList.toggle('active',card.dataset.id===selected);
}
function markChanged(c,path){c.parameterSources??={};const key=path.join('.');const old=c.parameterSources[key]||c.provenance;c.parameterSources[key]={source:'user',status:'pending',notes:'预览控件修改，采用值待确认',previousSource:old?.source||'missing'};}
function update(path,value,{finish=false}={}){
  if(!draftBefore)draftBefore=snapshot();const before=snapshot(),candidate=snapshot(),c=candidate.components.find(c=>c.id===selected);
  let o=c;for(const k of path.slice(0,-1))o=o[k];o[path.at(-1)]=value;markChanged(c,path);
  try{validateDocument(candidate);}catch(e){status(e.message);if(finish){if(draftBefore)commit(draftBefore);draftBefore=null;renderEditor();}return false;}
  const started=performance.now();doc=candidate;const node=nodes.get(selected);
  if(path[0]==='params')attach(c);
  else if(path[0]==='color'){node.traverse(o=>{if(o.isMesh&&o.material?.color&&o.material.color.getHexString()===before.components.find(x=>x.id===selected).color.slice(1).toLowerCase())o.material.color.set(value);});}
  else if(path[0]==='position')node.position.fromArray(c.position);
  else if(path[0]==='rotation')node.rotation.y=THREE.MathUtils.degToRad(c.rotation);
  applyVisibility();groundFit();clearReview(doc);lastUpdateMs=performance.now()-started;invalidate();thumbCache.delete(selected);scheduleCards();
  status(`已更新 ${selected} · ${path.join('.')}；当前版本待确认`);
  if(finish){commit(draftBefore);draftBefore=null;}return true;
}
function field(label,path,value,min,max,step=.01){
  const row=document.createElement('label');row.className='field';const head=document.createElement('span');head.className='field-head';const name=document.createElement('span');name.textContent=label;const tag=document.createElement('small');tag.className='pending';tag.textContent='待确认';head.append(name,tag);
  const pair=document.createElement('div');pair.className='pair';const range=document.createElement('input');range.type='range';range.min=min;range.max=max;range.step=step;range.value=value;
  const number=document.createElement('input');number.type='number';number.min=min;number.max=max;number.step=step;number.value=value;number.setAttribute('aria-label',label);range.setAttribute('aria-label',label+'滑杆');
  range.addEventListener('input',()=>{number.value=range.value;update(path,Number(range.value));});range.addEventListener('change',()=>update(path,Number(range.value),{finish:true}));
  number.addEventListener('change',()=>{const v=number.value===''?NaN:Number(number.value);range.value=v;update(path,v,{finish:true});});pair.append(range,number);row.append(head,pair);return row;
}
function renderEditor(){
  const el=$('#editor');el.replaceChildren();const c=doc.components.find(x=>x.id===selected);if(!c)return;
  const title=document.createElement('div');title.className='subhead';title.textContent=`${definitions[c.type].label} · 尺寸 / m`;el.append(title);
  for(const [key,[label,min,max]] of Object.entries(definitions[c.type].fields))el.append(field(label,['params',key],c.params[key],min,max));
  const colorLabel=document.createElement('label');colorLabel.className='field';colorLabel.textContent='颜色';const input=document.createElement('input');input.type='color';input.value=c.color;input.setAttribute('aria-label','颜色');input.addEventListener('input',()=>update(['color'],input.value));input.addEventListener('change',()=>update(['color'],input.value,{finish:true}));colorLabel.append(input);el.append(colorLabel);
  const h=document.createElement('div');h.className='subhead';h.textContent='位置与朝向';el.append(h);
  ['X','Y','Z'].forEach((axis,i)=>el.append(field(axis+' 位置',['position',i],c.position[i],-100,100,.05)));
  el.append(field('水平旋转',['rotation'],c.rotation,-180,180,1));
}
function scheduleCards(){clearTimeout(cardTimer);cardTimer=setTimeout(renderCards,250);}
function thumbnail(id){
  const states=[...nodes].map(([k,n])=>[k,n.visible]);for(const [k,n]of nodes)n.visible=k===id;
  const b=new THREE.Box3().setFromObject(nodes.get(id)),{cam}=cameraFor('perspective',b,1.65);
  const oldSize=renderer.getSize(new THREE.Vector2()),pixelRatio=renderer.getPixelRatio(),gridState=grid.visible;
  try{grid.visible=false;renderer.setPixelRatio(1);renderer.setSize(330,200,false);renderer.render(scene,cam);return renderer.domElement.toDataURL('image/png');}
  finally{for(const [k,v]of states)nodes.get(k).visible=v;grid.visible=gridState;renderer.setPixelRatio(pixelRatio);renderer.setSize(oldSize.x,oldSize.y,false);renderer.render(scene,camera);}
}
function renderCards(){
  const multiple=doc.components.length>1;$('#gallery').hidden=!multiple;if(!multiple){$('#cards').replaceChildren();return;}
  // Lazy thumbnails avoid blocking on larger scenes. Cards remain accessible.
  const container=$('#cards');container.replaceChildren();
  for(const c of doc.components){
    const button=document.createElement('button');button.className='card';button.classList.toggle('active',c.id===selected);button.dataset.id=c.id;
    const img=document.createElement('img');img.alt=c.name+'局部预览';img.loading='lazy';const label=document.createElement('div'),id=document.createElement('span');id.textContent=c.id;label.append(id,document.createTextNode(c.name));button.append(img,label);button.onclick=()=>select(c.id);container.append(button);
    if(thumbCache.has(c.id))img.src=thumbCache.get(c.id);else thumbnailObserver.observe(button);
  }
}
const thumbnailObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){thumbnailObserver.unobserve(entry.target);const id=entry.target.dataset.id;if(!nodes.has(id))continue;const url=thumbnail(id);thumbCache.set(id,url);entry.target.querySelector('img').src=url;}}},{rootMargin:'60px'});
function download(name,data,type){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exported(){const d=snapshot();d.review={status:'pending',note:'导出预览，等待用户在对话中确认该版本'};d.exportedAt=new Date().toISOString();d.preview={version:'1.1.0',view,selected,isolated,cameraPosition:camera.position.toArray(),target:controls.target.toArray()};return d;}
async function boot(){
  const response=await fetch('scene.json',{cache:'no-store'});if(!response.ok)throw Error('scene.json 读取失败');initialText=await response.text();const initial=validateDocument(JSON.parse(initialText));storageKey='su-three-preview:'+location.pathname+':'+initial.id;
  scene=new THREE.Scene();scene.background=new THREE.Color(0xeef1ed);root=new THREE.Group();scene.add(root);
  renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;
  $('#stage').prepend(renderer.domElement);scene.add(new THREE.HemisphereLight(0xffffff,0x9ba598,2.6));const sun=new THREE.DirectionalLight(0xfff2dd,3.3);sun.position.set(12,20,10);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-20;sun.shadow.camera.right=20;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.camera.far=100;sun.shadow.normalBias=.03;scene.add(sun);
  ground=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial({color:0xe9ede7,roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);grid=new THREE.GridHelper(20,20,0xc6d0c6,0xdce2d9);scene.add(grid);
  let active=initial;baseline=clone(initial);try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved?.base===initialText){const restored=validateDocument(saved.document);const restoredBase=saved.baseline?validateDocument(saved.baseline):(restored.id===initial.id?initial:restored);active=restored;baseline=clone(restoredBase);status('已恢复同一场景文件的浏览器草稿。');}}catch{}
  loadModel(active);resize();new ResizeObserver(resize).observe($('#stage'));$('#loading').hidden=true;
  $('#selection').onchange=e=>select(e.target.value);
  $('#isolate').onclick=()=>{isolated=!isolated;applyVisibility();setView(view);};$('#all').onclick=()=>{isolated=false;applyVisibility();setView(view);};
  $('#visible').onclick=()=>{const before=snapshot(),c=doc.components.find(c=>c.id===selected);c.visible=!c.visible;markChanged(c,['visible']);applyVisibility();commit(before);invalidate();};
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));$('#fit').onclick=()=>setView(view);
  $('#reset-component').onclick=resetCurrent;$('#reset-all').onclick=resetAll;
  $('#undo').onclick=()=>{if(!history.length)return;draftBefore=null;const prior=history.pop(),rev=doc.revision+1;redo.push(historyState());baseline=clone(prior.baseline);prior.document.revision=rev;clearReview(prior.document);loadModel(prior.document,false);cache();};
  $('#redo').onclick=()=>{if(!redo.length)return;draftBefore=null;const next=redo.pop(),rev=doc.revision+1;history.push(historyState());baseline=clone(next.baseline);next.document.revision=rev;clearReview(next.document);loadModel(next.document,false);cache();};
  $('#save').onclick=()=>{download(`preview-v${doc.revision}.json`,JSON.stringify(exported(),null,2),'application/json');status(`已导出 v${doc.revision}，导出不等于确认建模。`);};
  $('#snapshot').onclick=()=>{renderer.render(scene,camera);const a=document.createElement('a');a.download=`preview-v${doc.revision}-${isolated?selected:'overall'}-${view}.png`;a.href=renderer.domElement.toDataURL('image/png');a.click();};
  $('#import').onclick=()=>$('#file').click();$('#file').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>2e6)throw Error('方案文件超过 2 MB');const next=validateDocument(JSON.parse(await f.text()));pushHistory(snapshot());baseline=clone(next);draftBefore=null;next.revision=doc.revision+1;clearReview(next);loadModel(next);cache();status('已导入方案，当前状态待确认。');}catch(e){status('导入失败：'+e.message);}finally{$('#file').value='';}};
  $('#reload').onclick=async()=>{try{const r=await fetch('scene.json',{cache:'no-store'});if(!r.ok)throw Error('无法读取文件');const text=await r.text(),next=validateDocument(JSON.parse(text));pushHistory(snapshot());baseline=clone(next);draftBefore=null;next.revision=doc.revision+1;clearReview(next);initialText=text;loadModel(next);cache();status('已读取磁盘 scene.json；原草稿可撤销。');}catch(e){status(e.message);}};
  // Read-only observability for verification; no approval or SU mutation endpoint.
  window.preview={getState:()=>exported(),getMetrics:()=>({lastUpdateMs,geometryUpdates,objects:renderer.info.memory.geometries}),getBounds:id=>new THREE.Box3().setFromObject(nodes.get(id)).getSize(new THREE.Vector3()).toArray(),getView:()=>({view,orthographic:!!camera.isOrthographicCamera,span:camera.top-camera.bottom}),setComponent:(id,path,value)=>{select(id);return update(path,value,{finish:true});}};
}
boot().catch(fail);
