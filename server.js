// Bazaar fight replay website: serves the replay page with every built fight, and looks fights up by run link.
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = __dirname, PORT = +process.env.PORT || 3000;
// Fetching run pages from BazaarHub stays off until BazaarHub says it's OK.
const FETCH_BAZAARHUB = process.env.FETCH_BAZAARHUB === "1";

function loadFights(){
  return fs.readdirSync(path.join(ROOT, "fights")).filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(ROOT, "fights", f), "utf8"))).sort((a, b) => a.order - b.order);
}
function renderPage(){
  const fights = loadFights(), sim = fs.readFileSync(path.join(ROOT, "engine/sim.js"), "utf8");
  const summary = Object.fromEntries(fights.map(x => [x.fight.key, x.summary]));
  const engine = sim.replace(/^if \(typeof module.*$/m, "") +
    `\nconst FIGHTS = ${JSON.stringify(fights.map(x => x.fight))};\nlet BASE = FIGHTS[0];\nconst SUMMARY = ${JSON.stringify(summary)};\n`;
  const img = dir => `new Proxy({}, { get: (_, slug) => typeof slug === "string" ? "img/${dir}/" + slug + ".jpg" : undefined })`;
  return fs.readFileSync(path.join(ROOT, "public/page.html"), "utf8")
    .replace("/*IMG*/{}", img("items")).replace("/*SKIMG*/{}", img("skills")).replace("/*ENGINE*/", () => engine);
}
function findFight(run, day){
  const all = loadFights().filter(x => x.fight.run === run);
  return day ? all.find(x => x.fight.day === day) : all.sort((a, b) => b.fight.day - a.fight.day)[0];
}
const TYPES = { ".jpg":"image/jpeg", ".png":"image/png", ".webp":"image/webp", ".css":"text/css", ".js":"text/javascript" };
const send = (res, code, body, type) => { res.writeHead(code, { "content-type": type || "application/json; charset=utf-8" }); res.end(body); };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/") return send(res, 200, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${renderPage()}</body></html>`, "text/html; charset=utf-8");
  if (url.pathname === "/api/fight"){
    const run = (url.searchParams.get("run") || "").toLowerCase(), day = +url.searchParams.get("day") || 0;
    if (!/^[a-z0-9]{10,40}$/.test(run)) return send(res, 400, JSON.stringify({ error:"bad_run" }));
    const hit = findFight(run, day);
    if (hit) return send(res, 200, JSON.stringify(hit));
    // Building a new fight from BazaarHub needs their OK and the rule reader (tools/rules.py); not wired up yet.
    return send(res, 404, JSON.stringify({ error: FETCH_BAZAARHUB ? "not_built" : "fetching_off" }));
  }
  if (url.pathname.startsWith("/img/")){
    const f = path.normalize(path.join(ROOT, "public", url.pathname));
    if (!f.startsWith(path.join(ROOT, "public", "img"))) return send(res, 403, "{}");
    return fs.readFile(f, (err, buf) => err ? send(res, 404, "{}") : send(res, 200, buf, TYPES[path.extname(f)] || "application/octet-stream"));
  }
  send(res, 404, JSON.stringify({ error:"not_found" }));
}).listen(PORT, () => console.log(`Fight replay on http://localhost:${PORT}`));
