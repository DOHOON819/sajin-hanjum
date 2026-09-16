import test from 'node:test';
import assert from 'node:assert/strict';
import {fitDimensions,resultName,makeZip} from '../dist/image-core.js';
import {writeFile,mkdir} from 'node:fs/promises';
test('resize preserves portrait and landscape proportions without upscaling',()=>{
 assert.deepEqual(fitDimensions(4000,3000,1920),{width:1920,height:1440});
 assert.deepEqual(fitDimensions(1000,4000,1920),{width:480,height:1920});
 assert.deepEqual(fitDimensions(200,100,1920),{width:200,height:100});
 assert.deepEqual(fitDimensions(1,30000,100),{width:1,height:100});
 assert.throws(()=>fitDimensions(NaN,10,100));
});
test('download names cannot become paths and remain unique',()=>{
 assert.equal(resultName('../한글:사진.jpg','image/webp',1),'02-.._한글_사진-small.webp');
 assert.notEqual(resultName('a.png','image/jpeg',0),resultName('a.png','image/jpeg',1));
});
test('ZIP archive supports Unicode and multiple files',async()=>{
 const blob=await makeZip([{name:'01-사진.txt',blob:new Blob(['hello'])},{name:'02-test.txt',blob:new Blob(['world'])}]);
 const bytes=new Uint8Array(await blob.arrayBuffer());
 assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
 assert.equal(new DataView(bytes.buffer).getUint16(bytes.length-14,true),2);
 await mkdir('.test-output',{recursive:true});await writeFile('.test-output/archive.zip',bytes);
});
