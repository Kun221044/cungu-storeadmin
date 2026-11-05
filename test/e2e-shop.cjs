const {chromium}=require('playwright');const SP=process.argv[2]||'test';
(async()=>{const b=await chromium.launch();const c=await b.newContext({viewport:{width:1300,height:900}});const p=await c.newPage();const errs=[];
p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/fonts|ERR_TUNNEL|cungu-logo|ERR_CERT|net::/.test(m.text()))errs.push(m.text())});
// stock some items so availability varies
const login=await p.request.post('http://localhost:8899/api/login',{data:{name:'Cungu',password:'pw1'}});
await p.request.post('http://localhost:8899/api/movements',{headers:{'x-requested-with':'storeadmin'},data:{lines:[{sku:'CRB-002',type:'receive',loc:'sa',qty:10,ref:'PO2'}]}});
await c.clearCookies();
await p.goto('http://localhost:8899/_t/mock-store.html');await p.waitForSelector('.cgs-card');
console.log('old hidden',await p.evaluate(()=>getComputedStyle(document.getElementById('old-products')).display));
console.log('cards',await p.locator('.cgs-card').count(),'|',await p.textContent('[data-cg="meta"]'));
await p.fill('[data-cg="q"]','CRB-002');await p.waitForTimeout(200);console.log('search cards',await p.locator('.cgs-card').count(),await p.textContent('.cgs-av'));
await p.fill('.cgs-card [data-qty]','2');await p.click('.cgs-card [data-add]');
await p.fill('[data-cg="q"]','');await p.locator('.cgs-cats button').nth(2).click();await p.waitForTimeout(100);
await p.locator('.cgs-card .cgs-name').first().click();await p.waitForTimeout(200);console.log('detail open',await p.isVisible('dialog[data-cg="detail"]'));
await p.click('dialog[data-cg="detail"] [data-add]');await p.waitForTimeout(100);
console.log('count',await p.textContent('[data-cg="count"]'));
await p.screenshot({path:SP+'/shop-grid.png'});
await p.click('.cgs-bar [data-cg="open-list"]');await p.waitForTimeout(200);
await p.click('dialog[data-cg="list"] [data-step="0"][data-d="1"]');await p.waitForTimeout(100);
console.log('total',await p.textContent('.cgs-tot'));
await p.click('dialog[data-cg="list"] button[type=submit]');console.log('err',await p.textContent('[data-cg="qerr"]'));
await p.fill('dialog [name=name]','Jane Racer');await p.fill('dialog [name=email]','jane@example.com');await p.fill('dialog [name=message]','Need by Friday');
await p.screenshot({path:SP+'/shop-list.png'});
await p.click('dialog[data-cg="list"] button[type=submit]');await p.waitForSelector('.cgs-ok');console.log('ok',(await p.textContent('.cgs-ok')).slice(0,140));
console.log('count after',await p.textContent('[data-cg="count"]'));
// admin
await p.goto('http://localhost:8899/');await p.fill('#lg-name','Cungu');await p.fill('#lg-pw','pw1');await p.click('#lg-go');await p.waitForTimeout(800);
console.log('badge',await p.textContent('#q-badge'));
await p.goto('http://localhost:8899/#quotes');await p.waitForTimeout(400);
const box=p.locator('#q-list .box').first();console.log('quote',(await box.locator('h3').textContent()));
await p.screenshot({path:SP+'/admin-quotes.png',fullPage:true});
// reduce the out-of-stock line to 0 so accept is allowed
const inputs=box.locator('[data-qline]');const n=await inputs.count();
for(let i=0;i<n;i++){const sku=await inputs.nth(i).getAttribute('data-sku');if(sku!=='CRB-002')await inputs.nth(i).fill('0');}
await box.locator('[data-qact=save]').click();await p.waitForTimeout(500);
const box2=p.locator('#q-list .box').first();
console.log('accept disabled?',await box2.locator('[data-qact=accept]').isDisabled());
await box2.locator('[data-qact=accept]').click();await box2.locator('[data-qact=accept]').click();await p.waitForTimeout(600);
console.log('toast',await p.textContent('#toast'));
await p.selectOption('#q-status','accepted');await p.waitForTimeout(200);console.log('accepted box',await p.locator('#q-list .box .chip').first().textContent());
const f=await (await p.request.get('http://localhost:8899/api/feed/sa.json')).json();console.log('stock now',f.products.find(x=>x.sku==='CRB-002').stock);
await p.goto('http://localhost:8899/#feeds');await p.waitForTimeout(300);console.log('snippet',await p.inputValue('#snip-ke'));
// hosted shop page + mobile
await p.setViewportSize({width:390,height:844});await p.goto('http://localhost:8899/shop/ke/');await p.waitForSelector('.cgs-card');
console.log('ke price sample',await p.locator('.cgs-price').first().textContent(),'sw',await p.evaluate(()=>document.documentElement.scrollWidth));
await p.screenshot({path:SP+'/shop-ke-mobile.png'});
console.log('errors',errs);await b.close();})();
