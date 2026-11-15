import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
const require=createRequire(import.meta.url);
const output=resolve('public/ocr');
await mkdir(output,{recursive:true});
const core=dirname(require.resolve('tesseract.js-core/package.json'));
for(const name of await readdir(core))if(/^tesseract-core(?:-simd|-relaxedsimd)?-lstm\.wasm\.js$/.test(name))await copyFile(resolve(core,name),resolve(output,name));
await copyFile(require.resolve('tesseract.js/dist/worker.min.js'),resolve(output,'worker.min.js'));
await copyFile(resolve(dirname(require.resolve('@tesseract.js-data/eng/package.json')),'4.0.0_best_int/eng.traineddata.gz'),resolve(output,'eng.traineddata.gz'));
// These assets are loaded on demand from this site. Question images never leave
// the browser and runtime OCR does not depend on a third-party CDN or API.
