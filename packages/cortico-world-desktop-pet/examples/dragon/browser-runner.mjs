/** Runs pack checks on an isolated HTTP server and a real headless browser. */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, sep, extname } from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
export async function browserCheck(check) {
  const playwright=await (process.env.PLAYWRIGHT_MODULE ? import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : import('playwright'));
  const server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const frame=pathname==='/figure-frame';
    const file=resolve(root,'.'+(frame?'/web/figure-frame.html':decodeURIComponent(pathname)));
    if(!file.startsWith(resolve(root)+sep)){res.writeHead(403).end();return;}
    try{
      const data=await readFile(file);
      const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.json':'application/json','.css':'text/css'};
      const headers={'Content-Type':types[extname(file)]??'application/octet-stream','Access-Control-Allow-Origin':'*'};
      if(frame){const self=`http://${req.headers.host}`;headers['Content-Security-Policy']=`sandbox allow-scripts; default-src 'none'; script-src ${self}; img-src ${self} data: blob:; style-src 'unsafe-inline'; connect-src 'none'`;}
      res.writeHead(200,headers).end(data);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try {
    browser=await playwright.chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}),args:['--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
    const page=await browser.newPage({viewport:{width:1280,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const origin=`http://127.0.0.1:${server.address().port}`;
    await page.goto(origin+'/examples/dragon/testbed.html');
    const result=await check(page,origin);
    if(errors.length)throw new Error(errors.join('\n'));
    return result;
  } finally {await browser?.close();await new Promise(r=>server.close(r));}
}
