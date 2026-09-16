import {convertImage,formatBytes,makeZip} from './image-core.js';
const $=id=>document.getElementById(id);
let selected=[],results=[],busy=false;
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function clearResults(){for(const item of results)URL.revokeObjectURL(item.url);results=[];$('result-grid').replaceChildren();$('results').hidden=true;}
function updateSelection(){
  $('file-list').replaceChildren();
  for(const file of selected){const li=document.createElement('li'),name=document.createElement('span'),size=document.createElement('span');name.className='filename';name.textContent=file.name;name.title=file.name;size.className='filesize';size.textContent=formatBytes(file.size);li.append(name,size);$('file-list').append(li);}
  $('selection').textContent=selected.length?`${selected.length}장 선택 · 원본 ${formatBytes(selected.reduce((s,f)=>s+f.size,0))}`:'사진을 선택하면 여기에 목록이 표시됩니다.';
  $('convert').disabled=!selected.length||busy;$('clear').disabled=!selected.length||busy;$('convert').textContent=selected.length?`${selected.length}장 변환하기 ↗`:'사진 선택 후 변환하기 ↗';
}
function addFiles(files){
  if(busy)return;
  const errors=[];
  for(const file of files){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){errors.push(`${file.name}: JPG·PNG·WebP만 지원합니다.`);continue;}
    if(file.size>25*1024*1024){errors.push(`${file.name}: 파일당 25MB를 초과합니다.`);continue;}
    if(!file.size){errors.push(`${file.name}: 빈 파일입니다.`);continue;}
    if(selected.some(f=>f.name===file.name&&f.size===file.size&&f.lastModified===file.lastModified))continue;
    if(selected.length>=12){errors.push('한 번에 12장까지 선택할 수 있습니다.');break;}
    selected.push(file);
  }
  clearResults();updateSelection();notice(errors.join('\n'),!!errors.length);$('files').value='';
}
$('files').addEventListener('change',e=>addFiles(e.target.files));
for(const event of ['dragenter','dragover'])$('dropzone').addEventListener(event,e=>{e.preventDefault();if(!busy)$('dropzone').classList.add('drag');});
for(const event of ['dragleave','drop'])$('dropzone').addEventListener(event,e=>{e.preventDefault();$('dropzone').classList.remove('drag');if(event==='drop')addFiles(e.dataTransfer.files);});
$('clear').addEventListener('click',()=>{if(busy)return;selected=[];clearResults();updateSelection();notice('');});
$('quality').addEventListener('input',()=>$('quality-label').textContent=`${$('quality').value}%`);
function formatChanged(){const png=$('format').value==='image/png';$('quality').disabled=png||busy;$('quality-label').textContent=png?'PNG 무손실':`${$('quality').value}%`;$('quality-note').textContent=png?'PNG는 화질 설정을 사용하지 않습니다. 목표 용량은 크기를 줄여 맞춥니다.':'값을 낮추면 용량이 줄고 세부 표현이 달라질 수 있습니다.';$('format-note').textContent=$('format').value==='image/jpeg'?'JPG로 저장하면 투명한 부분은 흰색이 됩니다.':'투명한 배경을 유지합니다. 움직이는 사진은 정지 이미지로 저장될 수 있습니다.';}
$('format').addEventListener('change',formatChanged);
function setBusy(value){busy=value;for(const el of $('settings').elements)el.disabled=value;$('files').disabled=value;$('clear').disabled=value||!selected.length;if(!value){formatChanged();updateSelection();}}
function renderResult(item){
  const card=document.createElement('article');card.className='result-card';
  const img=document.createElement('img');img.src=item.url;img.alt=`${item.name} 변환 결과`;img.width=item.width;img.height=item.height;
  const body=document.createElement('div');body.className='result-body';
  const name=document.createElement('h3');name.textContent=item.name;name.title=item.name;
  const sizes=document.createElement('p');sizes.textContent=`${formatBytes(item.originalBytes)} → ${formatBytes(item.blob.size)}`;
  const change=document.createElement('p'),saving=100*(1-item.blob.size/item.originalBytes);change.className=saving>=0?'saving':'larger';change.textContent=saving>=0?`${saving.toFixed(1)}% 줄었어요 · ${item.width} × ${item.height}`:`${(-saving).toFixed(1)}% 커졌어요 · ${item.width} × ${item.height}`;
  const download=document.createElement('a');download.href=item.url;download.download=item.name;download.textContent='사진 저장하기';
  body.append(name,sizes,change);if(!item.targetMet){const warn=document.createElement('p');warn.className='larger';warn.textContent='최소 크기에서도 목표 용량을 초과했습니다.';body.append(warn);}body.append(download);card.append(img,body);$('result-grid').append(card);
}
$('settings').addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!selected.length||!$('settings').reportValidity())return;
  const settings={type:$('format').value,quality:Number($('quality').value)/100,maxSide:Number($('width').value),targetBytes:$('target').value?Number($('target').value)*1024:0};
  clearResults();setBusy(true);const errors=[];
  try {
    for(let i=0;i<selected.length;i++){
      notice(`${i+1} / ${selected.length}장 변환 중…`);$('convert').textContent=`${i+1} / ${selected.length}장 변환 중…`;
      await new Promise(resolve=>setTimeout(resolve,15));
      try{const item=await convertImage(selected[i],settings,i);item.url=URL.createObjectURL(item.blob);results.push(item);renderResult(item);}catch(error){errors.push(`${selected[i].name}: ${error.message}`);}
    }
    if(results.length){const before=results.reduce((s,r)=>s+r.originalBytes,0),after=results.reduce((s,r)=>s+r.blob.size,0);$('results').hidden=false;$('summary').textContent=`${results.length}장 완료 · ${formatBytes(before)} → ${formatBytes(after)}`;}
    notice(errors.length?errors.join('\n'):`${results.length}장 변환 완료. 아래에서 사진을 저장하세요.`,!!errors.length);
  } finally {setBusy(false);}
});
$('download-all').addEventListener('click',async()=>{
  if(!results.length)return;const button=$('download-all');button.disabled=true;button.textContent='ZIP 준비 중…';
  try{const blob=await makeZip(results),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='사진한줌.zip';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch{notice('ZIP을 만들지 못했습니다. 각 사진의 저장 버튼을 이용하세요.',true);}finally{button.disabled=false;button.textContent='모두 ZIP으로 저장';}
});
