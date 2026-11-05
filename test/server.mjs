import http from "node:http"; import fs from "node:fs"; import path from "node:path";
process.env.SESSION_SECRET="test-secret-test-secret-123456"; process.env.ADMIN_USERS="Cungu:pw1;Enos:pw2"; process.env.STORE_KEY_SA="sakey";process.env.STORE_KEY_KE="kekey";
const { default: handler } = await import("./api-test.mjs");
http.createServer(async (req,res)=>{
  const url=new URL(req.url,"http://localhost:8899");
  if(url.pathname.startsWith("/api/")){
    const chunks=[];for await(const c of req)chunks.push(c);const body=chunks.length?Buffer.concat(chunks):undefined;
    const r=await handler(new Request(url,{method:req.method,headers:req.headers,body:["GET","HEAD"].includes(req.method)?undefined:body}));
    const h={};r.headers.forEach((v,k)=>h[k]=v);res.writeHead(r.status,h);res.end(Buffer.from(await r.arrayBuffer()));return;}
  const rel=url.pathname.endsWith("/")?url.pathname+"index.html":url.pathname;let f=rel.startsWith("/_t/")?path.join("test",rel.slice(3)):path.join("public",rel);
  if(fs.existsSync(f)){res.writeHead(200,{"content-type":f.endsWith(".html")?"text/html":f.endsWith(".js")?"text/javascript":f.endsWith(".css")?"text/css":"text/plain"});res.end(fs.readFileSync(f));}else{res.writeHead(404);res.end();}
}).listen(8899,()=>console.log("up"));
