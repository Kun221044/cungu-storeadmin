// Second origin standing in for sastore/kestore (port 8900 = SA, 8901 = KE) - proves the cross-site setup
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
for (const [port, s] of [[8900, "sa"], [8901, "ke"]]) http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"); const f = u.pathname === "/" ? path.join("test/stores", s, "index.html") : u.pathname === "/styles.css" ? "test/stores/styles.css" : null;
  if (!f) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": f.endsWith(".css") ? "text/css" : "text/html" }); res.end(fs.readFileSync(f));
}).listen(port);
console.log("stores up");
