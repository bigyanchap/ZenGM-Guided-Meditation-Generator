// Generates the packaging icons from public/logo.png into build/.
// Runs automatically before `npm run dist` / `npm run pack` (pre-hooks).
//
// build/icon.png is the single source electron-builder needs: while
// packaging it converts this PNG into the macOS .icns and the Windows
// .ico automatically, and uses it directly for Linux. The .ico is also
// written explicitly here because the packaged app loads its window
// icon from resources/icon.ico on Windows (see extraResources).
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import pngToIco from 'png-to-ico';

await mkdir('build', { recursive: true });
await copyFile('public/logo.png', 'build/icon.png');
const ico = await pngToIco('public/logo.png');
await writeFile('build/icon.ico', ico);
console.log('generated build/icon.png and build/icon.ico from public/logo.png');
