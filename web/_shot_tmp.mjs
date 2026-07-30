import { chromium } from '@playwright/test'
const S='/private/tmp/claude-501/-Users-scottdunlap-Desktop-royal-casino/fcdeb21a-9d16-46c7-bb84-eafc364bd32e/scratchpad'
const b=await chromium.launch()
for (const [w,h] of [[1024,900],[1440,950]]) {
  const p=await b.newPage({viewport:{width:w,height:h}})
  await p.goto('http://localhost:5199/#'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(2400)
  const s=await p.evaluate(()=>{const m=document.querySelector('.app-main');return [m.scrollWidth,m.clientWidth]})
  const bad=await p.evaluate(()=>{const out=[];document.querySelectorAll('.app-main .grid').forEach((g,gi)=>{const c=[...g.querySelectorAll('[data-nav]')];if(!c.length)return;const m=new Map();for(const el of c){const r=el.getBoundingClientRect();const k=Math.round(r.top/4)*4;if(!m.has(k))m.set(k,[]);m.get(k).push({id:el.dataset.nav,w:+r.width.toFixed(1),h:+r.height.toFixed(1)})}for(const [t,items] of m){const ws=[...new Set(items.map(i=>i.w))],hs=[...new Set(items.map(i=>i.h))];if(ws.length>1||hs.length>1)out.push({gi,t,ws,hs})}});return out})
  const shelf=await p.evaluate(()=>[...document.querySelectorAll('section [data-nav]')].slice(0,6).map(e=>e.dataset.nav))
  console.log(`${w}: app-main ${s.join('/')} ${s[0]===s[1]?'✓':'*** H-CLIP ***'} | rows ${bad.length?JSON.stringify(bad):'✓'} | shelf ${shelf.slice(0,5)}`)
  await p.screenshot({path:`${S}/fav-${w}.png`,fullPage:false})
  await p.close()
}
const p=await b.newPage({viewport:{width:1440,height:950}})
await p.goto('http://localhost:5199/#'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(2000)
await p.locator('button[aria-pressed]',{hasText:'Favourites'}).click(); await p.waitForTimeout(900)
console.log('fav tab ->', await p.evaluate(()=>[...document.querySelectorAll('.app-main .grid [data-nav]')].map(e=>e.dataset.nav)))
await p.screenshot({path:`${S}/fav-tab.png`})
await p.close()
await b.close()
