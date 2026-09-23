import sys
import re

path = "/Users/dhruboimtiaz/Downloads/GymLog 1.0/index.html"
with open(path, "r") as f:
    html = f.read()

# 1. Update theme buttons array
html = html.replace("'themeBtnTmpl'", "'themeBtnMeas','themeBtnMeasDet','themeBtnMeasProg'")

# 2. CSS updates
html = html.replace('.empty-icon{font-size:3rem;margin-bottom:1rem;opacity:0.4;}\n', '')

tmpl_css = """/* TEMPLATES */
.tmpl-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:1rem;margin-bottom:0.65rem;}
.tmpl-name{font-weight:700;font-size:1rem;color:var(--text);margin-bottom:0.5rem;}
.chips{display:flex;flex-wrap:wrap;gap:0.35rem;margin-bottom:0.75rem;}
.chip{background:var(--adim);color:var(--accent);border-radius:20px;padding:0.2rem 0.65rem;font-size:0.75rem;font-weight:600;}
.tmpl-actions{display:flex;gap:0.5rem;padding-top:0.65rem;border-top:1px solid var(--border);}
"""
html = html.replace(tmpl_css, '')

# 3. Storage
html = html.replace("templates:[]", "measurements:[]")

# 4. Router
router_old = """let curPage='dashboard', curDayId=null, curExId=null;
const pages={dashboard:'pageDashboard',day:'pageDay',exercise:'pageExercise',progress:'pageProgress',templates:'pageTemplates'};

function goTo(p) {
  Object.values(pages).forEach(id=>document.getElementById(id).classList.remove('active'));
  document.getElementById(pages[p]).classList.add('active');
  window.scrollTo(0,0);
  curPage=p;
  // Bottom nav
  document.querySelectorAll('.bnav-item').forEach(b=>b.classList.remove('active'));
  const map={dashboard:'bnav-w',day:'bnav-w',exercise:'bnav-w',progress:'bnav-w',templates:'bnav-t'};
  document.getElementById(map[p])?.classList.add('active');
  document.getElementById('bottomNav').style.display=p==='progress'?'none':'flex';
  updateThemeBtns();
  // Render
  if(p==='dashboard')  renderDash();
  if(p==='day')        renderDay();
  if(p==='exercise')   renderEx();
  if(p==='progress'){const _n=new Date();_progMonth=_n.getMonth();_progYear=_n.getFullYear();renderProg();};
  if(p==='templates')  renderTmpls();
}"""

router_new = """let curPage='dashboard', curDayId=null, curExId=null, curMeasId=null;
const pages={
  dashboard:'pageDashboard',day:'pageDay',exercise:'pageExercise',progress:'pageProgress',
  measurements:'pageMeasurements',measurementDetail:'pageMeasurementDetail',measurementProgress:'pageMeasurementProgress'
};

window.onpopstate = function(e) {
  if (e.state && e.state.page) goTo(e.state.page, true);
  else goTo('dashboard', true);
};

function goTo(p, fromPop = false) {
  if (!fromPop && p !== curPage) history.pushState({page: p}, '', '');
  
  Object.values(pages).forEach(id=>document.getElementById(id).classList.remove('active'));
  document.getElementById(pages[p]).classList.add('active');
  window.scrollTo(0,0);
  curPage=p;
  // Bottom nav
  document.querySelectorAll('.bnav-item').forEach(b=>b.classList.remove('active'));
  const map={dashboard:'bnav-w',day:'bnav-w',exercise:'bnav-w',progress:'bnav-w',measurements:'bnav-m',measurementDetail:'bnav-m',measurementProgress:'bnav-m'};
  document.getElementById(map[p])?.classList.add('active');
  document.getElementById('bottomNav').style.display=(p==='progress'||p==='measurementProgress')?'none':'flex';
  updateThemeBtns();
  // Render
  if(p==='dashboard')  renderDash();
  if(p==='day')        renderDay();
  if(p==='exercise')   renderEx();
  if(p==='progress'){const _n=new Date();_progMonth=_n.getMonth();_progYear=_n.getFullYear();renderProg();}
  if(p==='measurements') renderMeasurements();
  if(p==='measurementDetail') renderMeasurementDetail();
  if(p==='measurementProgress'){const _n=new Date();_mProgMonth=_n.getMonth();_mProgYear=_n.getFullYear();renderMeasurementProgress();}
}"""
html = html.replace(router_old, router_new)

# 5. Init
init_old = """// ── INIT ────────────────────────────────
updateThemeBtns();
renderDash();"""
init_new = """// ── INIT ────────────────────────────────
if (!history.state) history.replaceState({page: 'dashboard'}, '', '');
updateThemeBtns();
renderDash();"""
html = html.replace(init_old, init_new)

# 6. Emojis and Empty states
html = re.sub(r'<div class="empty-icon">.*?</div>', '', html)

# 7. HTML pages
html_templ_page = """<!-- PAGE: TEMPLATES -->
<div id="pageTemplates" class="page">
  <nav class="navbar">
    <span class="nav-brand" onclick="goTo('dashboard')">GYMLOG</span>
    <div class="nav-right">
      <button class="theme-btn" onclick="toggleTheme()" id="themeBtnTmpl">Light</button>
    </div>
  </nav>
  <div class="content">
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">Templates</div>
        <div class="page-sub">Reusable workout blueprints</div>
      </div>
      <button class="btn btn-primary" onclick="openModal('modalCreateTemplate')">+ New</button>
    </div>
    <div id="tmplList"></div>
  </div>
</div>"""

html_meas_pages = """<!-- PAGE: MEASUREMENTS -->
<div id="pageMeasurements" class="page">
  <nav class="navbar">
    <span class="nav-brand" onclick="goTo('dashboard')">GYMLOG</span>
    <div class="nav-right">
      <button class="theme-btn" onclick="toggleTheme()" id="themeBtnMeas">Light</button>
    </div>
  </nav>
  <div class="content">
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">Measurements</div>
        <div class="page-sub">Track your body metrics</div>
      </div>
      <button class="btn btn-primary" onclick="openModal('modalCreateMeasurement')">+ New</button>
    </div>
    <div id="measurementsList"></div>
  </div>
</div>

<!-- PAGE: MEASUREMENT DETAIL -->
<div id="pageMeasurementDetail" class="page">
  <nav class="navbar">
    <span class="nav-brand" onclick="goTo('dashboard')">GYMLOG</span>
    <div class="nav-right">
      <button class="theme-btn" onclick="toggleTheme()" id="themeBtnMeasDet">Light</button>
    </div>
  </nav>
  <div class="content">
    <div class="page-header">
      <div class="page-header-left">
        <button class="back-btn" onclick="goTo('measurements')">&#8249; Back</button>
        <div class="page-title" id="measTitle">Measurement</div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="goTo('measurementProgress')">Progress</button>
    </div>
    <div class="section-header">
      <span class="section-title">Entries</span>
      <span class="section-badge" id="measBadge">0 entries</span>
    </div>
    <div id="measEntriesList" class="sets-list"></div>
    <p id="noMeasEntries" style="color:var(--text2);font-size:0.875rem;text-align:center;padding:0.75rem 0 1rem;display:none;">No entries yet — log one below.</p>
    <div class="add-card">
      <div class="add-title">Log a Measurement</div>
      <div class="add-grid">
        <div class="input-group">
          <label class="input-label">Value</label>
          <input type="number" id="inMeasValue" class="num-input" placeholder="0" step="0.1" inputmode="decimal"/>
          <div class="quick-row">
            <button class="qbtn" onclick="adj('inMeasValue',0.5)">+0.5</button>
            <button class="qbtn" onclick="adj('inMeasValue',1)">+1.0</button>
            <button class="qbtn" onclick="adj('inMeasValue',-0.5)">−0.5</button>
          </div>
        </div>
        <div class="input-group">
          <label class="input-label">Unit</label>
          <select id="inMeasUnit" class="num-input" style="padding:0">
            <option value="cm">cm</option>
            <option value="in">inch</option>
            <option value="kg">kg</option>
            <option value="lbs">lbs</option>
            <option value="%">%</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary btn-full" onclick="addMeasurementEntry()">Log Entry</button>
    </div>
  </div>
</div>

<!-- PAGE: MEASUREMENT PROGRESS -->
<div id="pageMeasurementProgress" class="page">
  <nav class="navbar">
    <span class="nav-brand" onclick="goTo('dashboard')">GYMLOG</span>
    <div class="nav-right">
      <button class="theme-btn" onclick="toggleTheme()" id="themeBtnMeasProg">Light</button>
    </div>
  </nav>
  <div class="content">
    <div class="page-header">
      <div class="page-header-left">
        <button class="back-btn" onclick="goTo('measurementDetail')">&#8249; Back</button>
        <div class="page-title" id="measProgTitle">Progress</div>
      </div>
    </div>
    <div id="measProgContent"></div>
  </div>
</div>"""
html = html.replace(html_templ_page, html_meas_pages)

# 8. Bottom Nav
html_nav_old = """  <button class="bnav-item" id="bnav-t" onclick="goTo('templates')">
    <svg class="bnav-svg" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
    Templates
  </button>"""
html_nav_new = """  <button class="bnav-item" id="bnav-m" onclick="goTo('measurements')">
    <svg class="bnav-svg" viewBox="0 0 24 24"><rect x="18" y="5" width="4" height="14" rx="1"/><rect x="10" y="11" width="4" height="8" rx="1"/><rect x="2" y="15" width="4" height="4" rx="1"/></svg>
    Measurements
  </button>"""
html = html.replace(html_nav_old, html_nav_new)

# 9. Modals Replace
modal_tmpl_old = """<div class="modal-overlay" id="modalCreateTemplate" onclick="bgClose(event,'modalCreateTemplate')">
  <div class="modal-box">
    <div class="modal-header">
      <span class="modal-title">New Template</span>
      <button class="modal-close" onclick="closeModal('modalCreateTemplate')">&#215;</button>
    </div>
    <div class="form-group">
      <label class="form-label">Template Name</label>
      <input type="text" id="inTmplName" class="form-input" placeholder="e.g. Push Day"/>
    </div>
    <div class="form-group">
      <label class="form-label">Exercises — one per line</label>
      <textarea id="inTmplExercises" class="form-input" rows="5" placeholder="Bench Press&#10;Overhead Press&#10;Tricep Pushdown"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('modalCreateTemplate')">Cancel</button>
      <button class="btn btn-primary" onclick="createTemplate()">Create</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modalUseTemplate" onclick="bgClose(event,'modalUseTemplate')">
  <div class="modal-box">
    <div class="modal-header">
      <span class="modal-title">Use Template</span>
      <button class="modal-close" onclick="closeModal('modalUseTemplate')">&#215;</button>
    </div>
    <div class="form-group">
      <label class="form-label">Workout Day Name</label>
      <input type="text" id="inUseTmplName" class="form-input" placeholder="Leave blank to use template name"/>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('modalUseTemplate')">Cancel</button>
      <button class="btn btn-primary" onclick="doUseTemplate()">Create Day</button>
    </div>
  </div>
</div>"""

modal_meas_new = """<div class="modal-overlay" id="modalCreateMeasurement" onclick="bgClose(event,'modalCreateMeasurement')">
  <div class="modal-box">
    <div class="modal-header">
      <span class="modal-title">New Measurement</span>
      <button class="modal-close" onclick="closeModal('modalCreateMeasurement')">&#215;</button>
    </div>
    <div class="form-group">
      <label class="form-label">Measurement Name</label>
      <input type="text" id="inMeasName" class="form-input" placeholder="e.g. Weight, Chest..."/>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('modalCreateMeasurement')">Cancel</button>
      <button class="btn btn-primary" onclick="createMeasurement()">Create</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modalRenameMeasurement" onclick="bgClose(event,'modalRenameMeasurement')">
  <div class="modal-box">
    <div class="modal-header">
      <span class="modal-title">Rename Measurement</span>
      <button class="modal-close" onclick="closeModal('modalRenameMeasurement')">&#215;</button>
    </div>
    <div class="form-group">
      <label class="form-label">New Name</label>
      <input type="text" id="inRenameMeasName" class="form-input"/>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('modalRenameMeasurement')">Cancel</button>
      <button class="btn btn-primary" onclick="doRenameMeasurement()">Save</button>
    </div>
  </div>
</div>"""
html = html.replace(modal_tmpl_old, modal_meas_new)

# 10. Keydown updates
keydown_old = """  else if(document.getElementById('modalUseTemplate').classList.contains('open')) doUseTemplate();
  else if(document.getElementById('modalCreateTemplate').classList.contains('open')&&document.activeElement.tagName!=='TEXTAREA') createTemplate();"""
keydown_new = """  else if(document.getElementById('modalCreateMeasurement').classList.contains('open')) createMeasurement();
  else if(document.getElementById('modalRenameMeasurement').classList.contains('open')) doRenameMeasurement();"""
html = html.replace(keydown_old, keydown_new)

# 11. JS Logic
js_tmpl_old = """// ════════════════════════════════════════
// TEMPLATES
// ════════════════════════════════════════
function renderTmpls(){
  const db=load(),list=document.getElementById('tmplList');
  if(!(db.templates||[]).length){
    list.innerHTML=`<div class="empty"><div class="empty-title">No Templates Yet</div><p class="empty-text">Create templates to quickly build new workout days.</p><button class="btn btn-primary btn-lg" onclick="openModal('modalCreateTemplate')">Create First Template</button></div>`;
    return;
  }
  list.innerHTML=(db.templates||[]).map(t=>`
    <div class="tmpl-card">
      <div class="tmpl-name">${esc(t.name)}</div>
      <div class="chips">${(t.exercises||[]).map(e=>`<span class="chip">${esc(e)}</span>`).join('')}</div>
      <div class="tmpl-actions">
        <button class="btn btn-primary btn-sm" onclick="startUseTmpl('${t.id}')">Use Template</button>
        <button class="btn btn-danger btn-sm" onclick="deleteTmpl('${t.id}')">Delete</button>
      </div>
    </div>`).join('');
}

function createTemplate(){
  const name=document.getElementById('inTmplName').value.trim(); if(!name) return;
  const exercises=document.getElementById('inTmplExercises').value.split('\\n').map(e=>e.trim()).filter(Boolean);
  const db=load(); if(!db.templates) db.templates=[];
  db.templates.push({id:uid(),name,exercises}); save(db);
  closeModal('modalCreateTemplate');
  document.getElementById('inTmplName').value='';
  document.getElementById('inTmplExercises').value='';
  toast('Template created'); renderTmpls();
}

let _useTmplId=null;
function startUseTmpl(id){ _useTmplId=id; const t=(load().templates||[]).find(t=>t.id===id); if(!t) return; document.getElementById('inUseTmplName').placeholder=t.name; document.getElementById('inUseTmplName').value=''; openModal('modalUseTemplate'); }
function doUseTemplate(){
  const db=load(),t=(db.templates||[]).find(t=>t.id===_useTmplId); if(!t) return;
  const name=document.getElementById('inUseTmplName').value.trim()||t.name;
  if(!db.days) db.days=[];
  db.days.push({id:uid(),name,exercises:(t.exercises||[]).map(n=>({id:uid(),name:n,sets:[],history:[]})),createdAt:today()});
  save(db); closeModal('modalUseTemplate'); toast('Day created from template'); goTo('dashboard');
}
async function deleteTmpl(id){ const ok=await confirm2('Delete this template?'); if(!ok) return; const db=load(); db.templates=(db.templates||[]).filter(t=>t.id!==id); save(db); toast('Deleted','error'); renderTmpls(); }"""

js_meas_new = """// ════════════════════════════════════════
// MEASUREMENTS
// ════════════════════════════════════════
function renderMeasurements(){
  const db=load(), list=document.getElementById('measurementsList');
  if(!(db.measurements||[]).length){
    list.innerHTML=`<div class="empty"><div class="empty-title">No Measurements Yet</div><p class="empty-text">Track body metrics by adding a measurement type.</p><button class="btn btn-primary btn-lg" onclick="openModal('modalCreateMeasurement')">Create First Measurement</button></div>`;
    return;
  }
  list.innerHTML=(db.measurements||[]).map(m=>`
    <div class="card">
      <div class="card-row card-clickable" onclick="openMeasurement('${m.id}')">
        <div class="card-icon">${esc(m.name.slice(0,2).toUpperCase())}</div>
        <div class="card-body">
          <div class="card-title">${esc(m.name)}</div>
          <div class="card-meta">${(m.entries||[]).length} entr${(m.entries||[]).length!==1?'ies':'y'}</div>
        </div>
        <div class="card-chevron">›</div>
      </div>
      <div class="card-actions">
        <button class="icon-btn edit" onclick="startRenameMeasurement('${m.id}')">Edit</button>
        <button class="icon-btn del" onclick="deleteMeasurement('${m.id}')">Delete</button>
      </div>
    </div>`).join('');
}

function createMeasurement(){
  const name=document.getElementById('inMeasName').value.trim(); if(!name) return;
  const db=load(); if(!db.measurements) db.measurements=[];
  db.measurements.push({id:uid(),name,entries:[],createdAt:today()}); save(db);
  closeModal('modalCreateMeasurement'); document.getElementById('inMeasName').value='';
  toast('Measurement created'); renderMeasurements();
}

let _renMeasId=null;
function startRenameMeasurement(id){ _renMeasId=id; const db=load(), m=(db.measurements||[]).find(m=>m.id===id); if(!m) return; document.getElementById('inRenameMeasName').value=m.name; openModal('modalRenameMeasurement'); }
function doRenameMeasurement(){ const name=document.getElementById('inRenameMeasName').value.trim(); if(!name) return; const db=load(), m=(db.measurements||[]).find(m=>m.id===_renMeasId); if(m) m.name=name; save(db); closeModal('modalRenameMeasurement'); toast('Renamed'); renderMeasurements(); }
async function deleteMeasurement(id){ const ok=await confirm2('Delete this measurement and all its entries?'); if(!ok) return; const db=load(); db.measurements=(db.measurements||[]).filter(m=>m.id!==id); save(db); toast('Deleted','error'); renderMeasurements(); }

function openMeasurement(id){ curMeasId=id; goTo('measurementDetail'); }

function renderMeasurementDetail(){
  const db=load(), m=(db.measurements||[]).find(x=>x.id===curMeasId); if(!m){goTo('measurements');return;}
  document.getElementById('measTitle').textContent=m.name;
  
  const entries=m.entries||[];
  document.getElementById('measBadge').textContent=entries.length+' entr'+(entries.length!==1?'ies':'y');
  const noMeasEntries=document.getElementById('noMeasEntries');
  const list=document.getElementById('measEntriesList');
  noMeasEntries.style.display=entries.length?'none':'block';
  list.innerHTML=[...entries].reverse().map((e)=>`
    <div class="set-row">
      <div class="set-badge" style="width:auto;padding:0 0.5rem;border-radius:var(--r3);background:var(--adim);color:var(--accent);font-weight:700;font-size:0.8rem;">${fmt(e.date).split(' ')[0]} ${fmt(e.date).split(' ')[1].replace(',','')}</div>
      <div class="set-info">
        <span class="set-weight">${e.value} ${e.unit}</span>
      </div>
      <div class="set-act">
        <button class="icon-btn del" onclick="deleteMeasurementEntry('${e.id}')">Del</button>
      </div>
    </div>`).join('');
}

function addMeasurementEntry(){
  const val=parseFloat(document.getElementById('inMeasValue').value);
  const unit=document.getElementById('inMeasUnit').value;
  if(isNaN(val)){toast('Enter valid value','error');return;}
  const db=load(), m=(db.measurements||[]).find(x=>x.id===curMeasId); if(!m) return;
  if(!m.entries) m.entries=[];
  m.entries.push({id:uid(),date:today(),value:val,unit});
  save(db);
  document.getElementById('inMeasValue').value='';
  toast('Entry logged'); renderMeasurementDetail();
}

async function deleteMeasurementEntry(id){
  const ok=await confirm2('Delete this entry?'); if(!ok) return;
  const db=load(), m=(db.measurements||[]).find(x=>x.id===curMeasId);
  if(m){ m.entries=(m.entries||[]).filter(e=>e.id!==id); }
  save(db); toast('Entry deleted','error'); renderMeasurementDetail();
}

let measChart=null;
let _mProgMonth=new Date().getMonth(), _mProgYear=new Date().getFullYear();

function renderMeasurementProgress(){
  const db=load(), m=(db.measurements||[]).find(x=>x.id===curMeasId); if(!m){goTo('measurementDetail');return;}
  document.getElementById('measProgTitle').textContent=m.name;
  const entries=m.entries||[];

  const years=[...new Set((entries).map(e=>new Date(e.date).getFullYear()))].sort((a,b)=>a-b);
  const now=new Date();
  if(!years.length) years.push(now.getFullYear());
  if(!years.includes(_mProgYear)) _mProgYear=years[years.length-1];

  const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];

  let selContainer=document.getElementById('measProgSelectors');
  if(!selContainer){
    const header=document.querySelector('#pageMeasurementProgress .page-header');
    selContainer=document.createElement('div');
    selContainer.id='measProgSelectors';
    selContainer.style.cssText='display:flex;align-items:center;gap:0.5rem;flex-shrink:0;margin-top:0.25rem;';
    header.appendChild(selContainer);
  }
  selContainer.innerHTML=`
    <select id="measProgMonthSel" style="background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r3);color:var(--text);padding:0 0.5rem;height:34px;font-size:0.8rem;font-family:var(--fb);outline:none;cursor:pointer;">
      ${monthNames.map((mn,i)=>`<option value="${i}"${i===_mProgMonth?' selected':''}>${mn}</option>`).join('')}
    </select>
    <select id="measProgYearSel" style="background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r3);color:var(--text);padding:0 0.5rem;height:34px;font-size:0.8rem;font-family:var(--fb);outline:none;cursor:pointer;">
      ${years.map(y=>`<option value="${y}"${y===_mProgYear?' selected':''}>${y}</option>`).join('')}
    </select>`;

  document.getElementById('measProgMonthSel').onchange=function(){_mProgMonth=parseInt(this.value);updateMeasProgressChart();};
  document.getElementById('measProgYearSel').onchange=function(){_mProgYear=parseInt(this.value);updateMeasProgressChart();};

  updateMeasProgressChart();
}

function updateMeasProgressChart(){
  const db=load(), ex=(db.measurements||[]).find(x=>x.id===curMeasId); if(!ex) return;
  const entries=ex.entries||[];
  const c=document.getElementById('measProgContent');

  const filtered=entries.filter(e=>{const d=new Date(e.date);return d.getMonth()===_mProgMonth&&d.getFullYear()===_mProgYear;});

  if(!filtered.length){
    c.innerHTML=`<div class="empty"><div class="empty-title">No Data Yet</div><p class="empty-text">Log entries to see your progress chart.</p></div>`;
    if(measChart){measChart.destroy();measChart=null;}
    return;
  }

  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  const gc=dark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)';
  const tc=dark?'#777':'#888';

  const labels=filtered.map(e=>new Date(e.date).getDate());
  const data=filtered.map(e=>e.value);

  c.innerHTML=`
    <div class="chart-card"><div class="chart-label">${esc(ex.name)} Progression</div><div class="chart-wrap"><canvas id="measChartCanvas"></canvas></div></div>
    <div class="section-header"><span class="section-title">History</span></div>
    ${[...filtered].reverse().map(e=>`<div class="hist-card"><div class="hist-row" style="align-items:center;justify-content:space-between;"><span class="hist-date" style="margin:0;">${fmt(e.date)}</span><span class="hist-val" style="font-weight:bold;color:var(--accent);">${e.value} ${e.unit}</span></div></div>`).join('')}`;

  if(measChart){measChart.destroy();measChart=null;}
  
  const color='#4ade80';
  const opts={
    type:'line',
    data:{labels,datasets:[{data,borderColor:color,backgroundColor:color+'22',pointBackgroundColor:color,pointRadius:5,tension:0.3,fill:true}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:dark?'#1c1c1c':'#fff',titleColor:dark?'#eee':'#111',bodyColor:dark?'#aaa':'#555',borderColor:color,borderWidth:1}},scales:{x:{ticks:{color:tc,maxRotation:40,font:{size:11}},grid:{color:gc}},y:{ticks:{color:tc,font:{size:11}},grid:{color:gc}}}}
  };
  measChart=new Chart(document.getElementById('measChartCanvas').getContext('2d'),opts);
}"""

html = html.replace(js_tmpl_old, js_meas_new)

with open(path, "w") as f:
    f.write(html)
print("Updated successfully")
