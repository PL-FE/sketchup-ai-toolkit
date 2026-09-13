import * as THREE from 'three';
// Geometry uses meters. Component origin is bottom center; +Y is up.
// Add recipe definitions here; all views consume the same generated geometry.
export const definitions = {
  box:{label:'体块',fields:{width:['宽度',.1,30,3],height:['高度',.1,100,3],depth:['深度',.1,30,3]}},
  building:{label:'建筑体量',fields:{width:['宽度',1,80,12],height:['高度',1,200,36],depth:['深度',1,80,10],floorHeight:['层高示意',1,8,3.6]}},
  portal:{label:'门架',fields:{width:['总宽',.4,20,4],height:['总高',.4,12,3],depth:['纵深',.05,5,.35],post:['柱梁宽度',.03,1,.25]}},
  pavilion:{label:'休憩亭',fields:{width:['总宽',.6,20,4],height:['总高',.5,10,2.8],depth:['纵深',.6,20,3],post:['柱宽',.03,.6,.16],roof:['顶板厚度',.02,.5,.12]}},
  bench:{label:'长椅',fields:{width:['长度',.3,8,2],height:['座面总高',.15,1,.48],depth:['深度',.2,2,.55],thickness:['座板厚度',.02,.2,.08]}},
  planter:{label:'花箱',fields:{width:['长度',.25,10,1.5],height:['高度',.15,2,.65],depth:['深度',.25,5,.7],wall:['壁厚',.02,.2,.06]}}
};
export function validateDocument(input){
  if(!input||input.schemaVersion!==1||input.units!=='m'||!Array.isArray(input.components))throw Error('需要 schemaVersion:1、units:"m" 和 components 数组');
  if(!input.components.length||input.components.length>200)throw Error('组件数量应在 1–200 之间');
  const d=structuredClone(input), ids=new Set();
  d.id=typeof d.id==='string'?d.id:'preview'; d.title=typeof d.title==='string'?d.title:'模型预览';
  d.revision=Number.isSafeInteger(d.revision)&&d.revision>=0?d.revision:0;
  for(const c of d.components){
    if(typeof c.id!=='string'||!c.id||ids.has(c.id))throw Error('组件 ID 不能为空或重复');ids.add(c.id);
    if(!Object.hasOwn(definitions,c.type))throw Error(`未知组件配方：${c.type}`);
    if(!Array.isArray(c.position)||c.position.length!==3||c.position.some(v=>!Number.isFinite(v)||Math.abs(v)>10000))throw Error(`${c.id} 坐标无效`);
    if(!Number.isFinite(c.rotation))throw Error(`${c.id} 旋转无效`);
    if(!/^#[0-9a-f]{6}$/i.test(c.color))throw Error(`${c.id} 颜色需要 #RRGGBB`);
    c.name=typeof c.name==='string'?c.name:c.id;c.visible=c.visible!==false;
    if(!c.params||typeof c.params!=='object')throw Error(`${c.id} 缺少 params`);
    for(const [key,[label,min,max]] of Object.entries(definitions[c.type].fields)){
      const v=c.params[key];if(!Number.isFinite(v)||v<min||v>max)throw Error(`${c.id} ${label} 应为 ${min}–${max} 米`);
    }
    const p=c.params;
    if(c.type==='portal'&&(p.post*2>=p.width||p.post>=p.height))throw Error('门架柱梁厚度与总尺寸冲突');
    if(c.type==='pavilion'&&(p.post*2>=Math.min(p.width,p.depth)||p.roof>=p.height))throw Error('亭架柱宽或顶板与总尺寸冲突');
    if(c.type==='bench'&&p.thickness>=p.height)throw Error('座板厚度必须小于总高');
    if(c.type==='planter'&&p.wall*2>=Math.min(p.width,p.depth,p.height))throw Error('花箱壁厚与总尺寸冲突');
  }return d;
}
export function makeComponent(c){
  const g=new THREE.Group();g.name=c.id;g.userData.componentId=c.id;
  const p=c.params,mat=new THREE.MeshStandardMaterial({color:c.color,roughness:.72,metalness:.08});
  const edgeMat=new THREE.LineBasicMaterial({color:0x463c32,transparent:true,opacity:.12});
  function box(w,h,d,x=0,y=h/2,z=0,material=mat){
    const geo=new THREE.BoxGeometry(w,h,d),m=new THREE.Mesh(geo,material);
    m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo),edgeMat));g.add(m);return m;
  }
  if(c.type==='box'||c.type==='building'){
    box(p.width,p.height,p.depth);
    if(c.type==='building'){
      const lineMat=new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.6});
      for(let y=p.floorHeight;y<p.height;y+=p.floorHeight){
        const w=p.width/2+.005,d=p.depth/2+.005;
        const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-w,y,-d),new THREE.Vector3(w,y,-d),new THREE.Vector3(w,y,d),new THREE.Vector3(-w,y,d)]);
        g.add(new THREE.LineLoop(geo,lineMat));
      }
    }
  }else if(c.type==='portal'){
    for(const x of [-1,1])box(p.post,p.height-p.post,p.depth,x*(p.width-p.post)/2,(p.height-p.post)/2);
    box(p.width,p.post,p.depth,0,p.height-p.post/2);
  }else if(c.type==='pavilion'){
    for(const x of [-1,1])for(const z of [-1,1])box(p.post,p.height-p.roof,p.post,x*(p.width-p.post)/2,(p.height-p.roof)/2,z*(p.depth-p.post)/2);
    box(p.width,p.roof,p.depth,0,p.height-p.roof/2);
  }else if(c.type==='bench'){
    const count=5,gap=Math.min(.012,p.depth/30),slat=(p.depth-gap*(count-1))/count;
    for(let i=0;i<count;i++)box(p.width,p.thickness,slat,0,p.height-p.thickness/2,-p.depth/2+slat/2+i*(slat+gap));
    for(const sign of [-1,1])box(Math.min(.13,p.width*.12),p.height-p.thickness,p.depth*.82,sign*p.width*.34,(p.height-p.thickness)/2);
  }else if(c.type==='planter'){
    box(p.width,p.wall,p.depth);
    for(const sign of [-1,1]){
      box(p.wall,p.height-p.wall,p.depth,sign*(p.width-p.wall)/2,(p.height+p.wall)/2);
      box(p.width-2*p.wall,p.height-p.wall,p.wall,0,(p.height+p.wall)/2,sign*(p.depth-p.wall)/2);
    }
    box(p.width-p.wall*2,.01,p.depth-p.wall*2,0,p.height-p.wall,0,new THREE.MeshStandardMaterial({color:0x504938,roughness:1}));
  }
  g.position.fromArray(c.position);g.rotation.y=THREE.MathUtils.degToRad(c.rotation);g.visible=c.visible!==false;return g;
}
export function disposeComponent(g){const materials=new Set();g.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of [o.material].flat())materials.add(m);}});materials.forEach(m=>m.dispose());}
