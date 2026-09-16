export function fitDimensions(width, height, maxSide) {
  if (![width,height,maxSide].every(n=>Number.isFinite(n)&&n>0)) throw new Error('올바른 이미지 크기가 필요합니다.');
  const ratio=Math.min(1,maxSide/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio))};
}
export const formatBytes=n=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(2)} MB`;
export function resultName(name,type,index) {
  const base=name.replace(/\.[^.]+$/,'').replace(/[\x00-\x1f/\\:*?"<>|]/g,'_').slice(0,90)||'image';
  return `${String(index+1).padStart(2,'0')}-${base}-small.${({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[type]||'png'}`;
}
function encode(canvas,type,quality){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('사진을 저장할 수 없습니다. 크기를 줄여 다시 시도하세요.')),type,quality));}
export async function convertImage(file,settings,index) {
  let bitmap;
  try { bitmap=await createImageBitmap(file); }
  catch {throw new Error('이 사진을 열 수 없습니다. JPG·PNG·WebP 파일인지 확인하세요.');}
  try {
    if(bitmap.width*bitmap.height>30000000)throw new Error('3천만 화소를 초과합니다. 더 작은 사진으로 시도하세요.');
    let {width,height}=fitDimensions(bitmap.width,bitmap.height,settings.maxSide);
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('이 브라우저에서 이미지 변환을 지원하지 않습니다.');
    const draw=()=>{canvas.width=width;canvas.height=height;if(settings.type==='image/jpeg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);}ctx.drawImage(bitmap,0,0,width,height);};
    draw();
    let blob=await encode(canvas,settings.type,settings.quality);
    if(blob.type!==settings.type)throw new Error('이 브라우저는 선택한 형식으로 저장할 수 없습니다. JPG 또는 PNG로 바꿔주세요.');
    if(settings.targetBytes) {
      for(let round=0;round<14 && blob.size>settings.targetBytes;round++) {
        if(settings.type!=='image/png'){
          const smallest=await encode(canvas,settings.type,0.08);
          if(smallest.size<=settings.targetBytes){
            let lo=.08,hi=settings.quality;blob=smallest;
            for(let attempt=0;attempt<7;attempt++){
              const mid=(lo+hi)/2, candidate=await encode(canvas,settings.type,mid);
              if(candidate.size<=settings.targetBytes){blob=candidate;lo=mid;}else hi=mid;
            }
            break;
          }
          blob=smallest;
        }
        if(Math.max(width,height)<=64)break;
        const ratio=Math.max(.2,Math.min(.85,Math.sqrt(settings.targetBytes/blob.size)*.9));
        const floor=64/Math.max(width,height),shrink=Math.max(ratio,floor);
        width=Math.max(1,Math.round(width*shrink));height=Math.max(1,Math.round(height*shrink));
        draw();blob=await encode(canvas,settings.type,settings.quality);
      }
    }
    canvas.width=canvas.height=1;
    return {blob,width,height,name:resultName(file.name,blob.type,index),originalBytes:file.size,targetMet:!settings.targetBytes||blob.size<=settings.targetBytes};
  } finally {bitmap.close();}
}

// ZIP uses STORE because JPEG/WebP/PNG data is already compressed. UTF-8 names.
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(data){let n=0xffffffff;for(const byte of data)n=crcTable[(n^byte)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
export async function makeZip(items){
  const parts=[],central=[],encoder=new TextEncoder();let offset=0,centralSize=0;
  for(const item of items){
    const data=new Uint8Array(await item.blob.arrayBuffer()),name=encoder.encode(item.name),crc=crc32(data);
    const local=new Uint8Array(30+name.length),v=new DataView(local.buffer);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);local.set(name,30);
    parts.push(local,data);
    const record=new Uint8Array(46+name.length),c=new DataView(record.buffer);
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);record.set(name,46);
    central.push(record);centralSize+=record.length;offset+=local.length+data.length;
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,items.length,true);e.setUint16(10,items.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
  return new Blob([...parts,...central,end],{type:'application/zip'});
}
