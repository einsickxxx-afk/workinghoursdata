/* ===================== 설정 ===================== */
const EXEC_RANKS = ['상무','전무','부사장','전문위원'];
const WEEKDAY_COLS = ['월','화','수','목','금'];
const DEFAULT_CSV = 'data/timesheet_sample.csv';

let RAW_ROWS = [];
let SITE_LIST = [];
let TEAM_LIST = [];

/* ===================== 자체 CSV 파서 (외부 라이브러리 불필요) ===================== */
function parseCSV(text){
  text = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  if(text.charCodeAt(0)===0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i=0;i<text.length;i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){ if(text[i+1] === '"'){ field+='"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if(c === '"') inQuotes = true;
      else if(c === ','){ row.push(field); field=''; }
      else if(c === '\n'){ row.push(field); rows.push(row); row=[]; field=''; }
      else field += c;
    }
  }
  if(field.length>0 || row.length>0){ row.push(field); rows.push(row); }
  if(rows.length===0) return { data:[] };
  const header = rows[0];
  const data = [];
  for(let r=1;r<rows.length;r++){
    if(rows[r].length===1 && rows[r][0]==='') continue;
    const obj = {};
    header.forEach((h,idx)=>{ obj[h] = rows[r][idx]!==undefined ? rows[r][idx] : ''; });
    data.push(obj);
  }
  return { data };
}

/* ===================== CSV 로딩 ===================== */
function loadFromText(text, label){
  const parsed = parseCSV(text);
  RAW_ROWS = parsed.data.filter(r => r['사번']);
  buildFilterOptions();
  document.getElementById('dataStatus').textContent = label;
  render();
}

function init(){
  fetch(DEFAULT_CSV, { cache:'no-store' })
    .then(res => { if(!res.ok) throw new Error('no sample'); return res.text(); })
    .then(text => loadFromText(text, '샘플 데이터 표시 중'))
    .catch(() => {
      document.getElementById('dataStatus').textContent = 'CSV를 불러와 주세요 (샘플 자동 로드 실패 · file:// 환경에서는 CSV 불러오기 버튼을 사용하세요)';
    });
}

document.getElementById('loadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => loadFromText(ev.target.result, `불러온 파일: ${file.name}`);
  reader.readAsText(file, 'utf-8');
});

/* ===================== 필터 옵션 구성 ===================== */
function buildFilterOptions(){
  SITE_LIST = [...new Set(RAW_ROWS.map(r => r['소속사업장']).filter(Boolean))].sort();
  TEAM_LIST = [...new Set(RAW_ROWS.map(r => r['소속부서명']).filter(Boolean))].sort();
  const siteSel = document.getElementById('siteFilter');
  const teamSel = document.getElementById('teamFilter');
  siteSel.innerHTML = '<option value="all">사업장 전체</option>' + SITE_LIST.map(s=>`<option value="${s}">${s}</option>`).join('');
  teamSel.innerHTML = '<option value="all">부서 전체</option>' + TEAM_LIST.map(t=>`<option value="${t}">${t}</option>`).join('');
}
['siteFilter','teamFilter','flexToggle'].forEach(id=>{
  document.getElementById(id).addEventListener('change', render);
});

/* ===================== 유틸 ===================== */
function num(v){ const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function weekKey(r){
  const m = (r['주차']||'').match(/(\d+)\s*주차/);
  const wn = m ? String(m[1]).padStart(2,'0') : '00';
  return `${r['연월']}-${wn}`;
}
function fmt1(n){ return (Math.round(n*10)/10).toFixed(1); }

/* ===================== 메인 렌더 ===================== */
function render(){
  if(RAW_ROWS.length === 0) return;

  const site = document.getElementById('siteFilter').value;
  const team = document.getElementById('teamFilter').value;
  const includeFlex = document.getElementById('flexToggle').checked;

  let rows = RAW_ROWS.filter(r =>
    r['근무형태구분'] !== '근태예외자' && !EXEC_RANKS.includes(r['직급'])
  );
  if(!includeFlex) rows = rows.filter(r => r['근무형태구분'] !== '탄력근무제');
  if(site !== 'all') rows = rows.filter(r => r['소속사업장'] === site);
  if(team !== 'all') rows = rows.filter(r => r['소속부서명'] === team);

  rows.forEach(r => { r._week = weekKey(r); r._Q = num(r['주확정근무시간']); });

  const weekKeys = [...new Set(rows.map(r=>r._week))].sort();
  if(weekKeys.length === 0) return;
  const latest = weekKeys[weekKeys.length-1];
  const latestRows = rows.filter(r => r._week === latest);

  renderKpis(latestRows, weekKeys, rows);
  renderTrend(rows, weekKeys);
  renderDeptRanking(latestRows);
  renderBuckets(latestRows);
  renderWeekday(latestRows);
  renderWeekend(latestRows);
  renderUnonwork(latestRows);
  renderRiskTable(rows, weekKeys, latest);
}

/* ===================== KPI ===================== */
function renderKpis(latestRows, weekKeys, allRows){
  const total = latestRows.length;
  const over = latestRows.filter(r => r._Q >= 52).length;
  const ratio = total ? (over/total*100) : 0;

  document.getElementById('kpiRatio').textContent = fmt1(ratio)+'%';
  document.getElementById('kpiRatioCount').textContent = over+'명';
  document.getElementById('kpiCount').innerHTML = over+'<span class="unit">명</span>';

  let deltaTxt = '&nbsp;';
  if(weekKeys.length >= 2){
    const prevKey = weekKeys[weekKeys.length-2];
    const prevRows = allRows.filter(r => r._week === prevKey);
    const prevRatio = prevRows.length ? (prevRows.filter(r=>r._Q>=52).length/prevRows.length*100) : 0;
    const diff = ratio - prevRatio;
    deltaTxt = `전주 대비 ${diff>=0?'+':''}${fmt1(diff)}%p`;
  }
  document.getElementById('kpiCountSub').innerHTML = deltaTxt;

  document.getElementById('donut').style.background =
    `conic-gradient(var(--coral) 0% ${ratio}%, #EAF0F5 ${ratio}% 100%)`;

  const avg = total ? latestRows.reduce((s,r)=>s+r._Q,0)/total : 0;
  document.getElementById('kpiAvg').innerHTML = fmt1(avg)+'<span class="unit">시간</span>';
  document.getElementById('kpiAvgSub').textContent = `법정 상한 대비 ${fmt1(Math.max(0,52-avg))}시간 여유`;

  const weekendPeople = latestRows.filter(r => num(r['토'])>0 || num(r['일'])>0).length;
  document.getElementById('kpiWeekend').innerHTML = weekendPeople+'<span class="unit">명</span>';
  const weekendTeams = new Set(latestRows.filter(r => num(r['토'])>0 || num(r['일'])>0).map(r=>r['소속부서명'])).size;
  document.getElementById('kpiWeekendSub').textContent = `${weekendTeams}개 부서에서 발생`;
}

/* ===================== 추이 ===================== */
function renderTrend(rows, weekKeys){
  const svg = document.getElementById('trendChart');
  const ratios = weekKeys.map(wk => {
    const wr = rows.filter(r=>r._week===wk);
    return wr.length ? wr.filter(r=>r._Q>=52).length/wr.length*100 : 0;
  });
  const max = Math.max(...ratios, 10);
  const W = 1000, H = 170, pad = 14;
  const pts = ratios.map((v,i) => {
    const x = weekKeys.length>1 ? (i/(weekKeys.length-1))*W : 0;
    const y = H - pad - (v/max)*(H-pad*2);
    return [x,y];
  });
  const targetY = H - pad - (8/max)*(H-pad*2);
  const line = pts.map(p=>p.join(',')).join(' ');
  svg.innerHTML = `
    <line x1="0" y1="${targetY}" x2="${W}" y2="${targetY}" stroke="var(--coral)" stroke-width="2" stroke-dasharray="7 6"/>
    <text x="6" y="${targetY-6}" font-size="12" fill="var(--coral)" font-weight="700">8%</text>
    <polyline fill="none" stroke="var(--steel)" stroke-width="3" points="${line}"/>
    ${pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="${i===pts.length-1?5:4}" fill="var(--navy)" ${i===pts.length-1?'stroke="#fff" stroke-width="2"':''}/>`).join('')}
  `;
  const labelsEl = document.getElementById('trendLabels');
  labelsEl.innerHTML = weekKeys.map((wk,i) => {
    const isLast = i===weekKeys.length-1;
    const short = wk.split('-').slice(1).join('/');
    return `<span>${short}${isLast?'(최근)':''}</span>`;
  }).join('');
}

/* ===================== 부서별 순위 ===================== */
function renderDeptRanking(latestRows){
  const byTeam = {};
  latestRows.forEach(r => {
    const t = r['소속부서명']; if(!t) return;
    if(!byTeam[t]) byTeam[t] = [];
    byTeam[t].push(r._Q);
  });
  const items = Object.entries(byTeam).map(([team, arr]) => ({
    team, avg: arr.reduce((a,b)=>a+b,0)/arr.length
  })).sort((a,b)=>b.avg-a.avg);

  const axisMax = Math.max(56, ...items.map(i=>i.avg*1.05));
  const el = document.getElementById('deptRanking');
  el.innerHTML = items.map(i => {
    const pct = (i.avg/axisMax*100).toFixed(1);
    const color = i.avg>=52 ? 'var(--coral)' : i.avg>=48 ? 'var(--steel)' : i.avg>=44 ? 'var(--skyblue)' : 'var(--pale)';
    return `<div class="hbar-row">
      <div class="hbar-name">${i.team}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${pct}%;background:${color}"></div><div class="ceiling-tick" style="left:${(52/axisMax*100).toFixed(2)}%"></div></div>
      <span class="hbar-val" style="color:${color}">${fmt1(i.avg)}</span>
    </div>`;
  }).join('');
}

/* ===================== 시간대별 분포 ===================== */
function renderBuckets(latestRows){
  const edges = [0,40,42,44,46,48,50,52,999];
  const labels = ['40 미만','40~42','42~44','44~46','46~48','48~50','50~52','52 이상'];
  const counts = new Array(labels.length).fill(0);
  latestRows.forEach(r => {
    const q = r._Q;
    for(let i=0;i<labels.length;i++){
      if(q>=edges[i] && q<edges[i+1]){ counts[i]++; break; }
    }
  });
  const max = Math.max(...counts, 1);
  const colors = ['var(--pale)','var(--pale)','var(--skyblue)','var(--skyblue)','var(--steel)','var(--steel)','var(--navy)','var(--coral)'];
  const el = document.getElementById('bucketChart');
  el.innerHTML = labels.map((lab,i) => {
    const h = Math.max(4, counts[i]/max*100);
    return `<div class="vbar-col"><span class="vbar-val">${counts[i]}</span><div class="vbar" style="height:${h}%;background:${colors[i]}"></div><span class="vbar-label">${lab}</span></div>`;
  }).join('');
  document.getElementById('bucketNote').textContent = `총 ${latestRows.length}명 (근태예외자·임원 제외)`;
}

/* ===================== 요일별 편차 ===================== */
function renderWeekday(latestRows){
  const avgs = WEEKDAY_COLS.map(d => {
    const arr = latestRows.map(r => num(r[d]));
    return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  });
  const mean = avgs.reduce((a,b)=>a+b,0)/avgs.length;
  const devs = avgs.map(v=>v-mean);
  const maxAbs = Math.max(...devs.map(Math.abs), 0.05);
  const HALF = 65, GAP = 6, LBLH = 16;
  const scale = HALF*0.85/maxAbs;

  const el = document.getElementById('weekdayChart');
  el.innerHTML = '<div class="diverge-baseline"></div>' + WEEKDAY_COLS.map((d,i) => {
    const dev = devs[i];
    const h = Math.abs(dev)*scale;
    if(dev >= 0){
      const bottom = 75 + h + GAP;
      const color = dev === Math.max(...devs) ? 'var(--navy)' : 'var(--steel)';
      return `<div class="diverge-col"><span class="diverge-val" style="bottom:${bottom}px;">${fmt1(avgs[i])}</span><div class="diverge-bar up" style="height:${h}px;background:${color}"></div></div>`;
    }else{
      const bottom = Math.max(2, 75 - h - LBLH);
      const color = dev === Math.min(...devs) ? 'var(--coral)' : 'var(--skyblue)';
      return `<div class="diverge-col"><span class="diverge-val" style="bottom:${bottom}px;">${fmt1(avgs[i])}</span><div class="diverge-bar down" style="height:${h}px;background:${color}"></div></div>`;
    }
  }).join('');
  document.getElementById('weekdayNote').textContent = `평일 평균 ${fmt1(mean)}시간 대비`;
}

/* ===================== 주말 근무 ===================== */
function renderWeekend(latestRows){
  const sat = latestRows.filter(r=>num(r['토'])>0);
  const sun = latestRows.filter(r=>num(r['일'])>0);
  const satAvg = sat.length ? sat.reduce((s,r)=>s+num(r['토']),0)/sat.length : 0;
  const sunAvg = sun.length ? sun.reduce((s,r)=>s+num(r['일']),0)/sun.length : 0;
  document.getElementById('weekendStat').innerHTML = `
    <div class="weekend-row"><div><div class="wname">토요일 근무</div><div class="wsub">평균 ${fmt1(satAvg)}시간 / 근무자 기준</div></div><div class="wnum">${sat.length}명</div></div>
    <div class="weekend-row"><div><div class="wname">일요일 근무</div><div class="wsub">평균 ${fmt1(sunAvg)}시간 / 근무자 기준</div></div><div class="wnum">${sun.length}명</div></div>
  `;
}

/* ===================== 팀별 비업무 자율기입 비중 ===================== */
function renderUnonwork(latestRows){
  const byTeam = {};
  latestRows.forEach(r => {
    const t = r['소속부서명']; if(!t) return;
    const q = r._Q; const u = num(r['비업무']);
    if(q<=0) return;
    if(!byTeam[t]) byTeam[t] = [];
    byTeam[t].push(u/q*100);
  });
  const items = Object.entries(byTeam).map(([team,arr]) => ({
    team, pct: arr.reduce((a,b)=>a+b,0)/arr.length
  })).sort((a,b)=>a.pct-b.pct);
  const max = Math.max(...items.map(i=>i.pct), 1);
  const el = document.getElementById('unonworkChart');
  el.innerHTML = items.map(i => {
    const h = Math.max(4, i.pct/max*100);
    const color = i.pct < max*0.4 ? 'var(--coral)' : i.pct < max*0.7 ? 'var(--steel)' : i.pct < max*0.9 ? 'var(--skyblue)' : 'var(--pale)';
    return `<div class="vbar-col"><span class="vbar-val">${fmt1(i.pct)}%</span><div class="vbar" style="height:${h}%;background:${color}"></div><span class="vbar-label">${i.team}</span></div>`;
  }).join('');
}

/* ===================== 위험군 테이블 ===================== */
function renderRiskTable(rows, weekKeys, latest){
  const byEmp = {};
  rows.forEach(r => {
    if(!byEmp[r['사번']]) byEmp[r['사번']] = { name:r['이름'], team:r['소속부서명'], rank:r['직급'], weeks:{} };
    byEmp[r['사번']].weeks[r._week] = r._Q;
  });
  const reversedWeeks = [...weekKeys].reverse();
  const risk = [];
  Object.values(byEmp).forEach(e => {
    let streak = 0;
    for(const wk of reversedWeeks){
      const q = e.weeks[wk];
      if(q !== undefined && q >= 52) streak++;
      else break;
    }
    if(streak >= 2){
      risk.push({ ...e, streak, latestQ: e.weeks[latest] });
    }
  });
  risk.sort((a,b) => b.streak - a.streak || (b.latestQ||0) - (a.latestQ||0));

  document.getElementById('kpiRisk').innerHTML = risk.length+'<span class="unit">명</span>';
  const maxStreak = risk.length ? Math.max(...risk.map(r=>r.streak)) : 0;
  document.getElementById('kpiRiskSub').textContent = maxStreak>=3 ? `${maxStreak}주 연속 52시간 포함` : '\u00A0';

  const tagClass = (n) => n>=4 ? 'w4' : n>=3 ? 'w3' : 'w2';
  const tbody = document.getElementById('riskTableBody');
  tbody.innerHTML = risk.slice(0,20).map(r => `
    <tr><td>${r.name}</td><td>${r.team}</td><td>${r.rank}</td>
      <td><span class="tag ${tagClass(r.streak)}">${r.streak}주</span></td>
      <td>${fmt1(r.latestQ||0)}</td></tr>
  `).join('') || '<tr><td colspan="5" style="color:var(--muted);">해당자가 없습니다.</td></tr>';
}

/* ===================== 설정 패널 ===================== */
const DEFAULT_COLORS = { navy:'#0D2744', steel:'#53728A', skyblue:'#7691AD', pale:'#B9CFDD', coral:'#E2646C' };
const DEFAULT_FONT = "'Pretendard','Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif";

document.getElementById('settingsBtn').addEventListener('click', () => document.getElementById('settingsOverlay').classList.add('open'));
document.getElementById('closeSettings').addEventListener('click', () => document.getElementById('settingsOverlay').classList.remove('open'));

function applyColorsAndFont(){
  const root = document.documentElement.style;
  root.setProperty('--navy', document.getElementById('c-navy').value);
  root.setProperty('--steel', document.getElementById('c-steel').value);
  root.setProperty('--skyblue', document.getElementById('c-skyblue').value);
  root.setProperty('--pale', document.getElementById('c-pale').value);
  root.setProperty('--coral', document.getElementById('c-coral').value);
  root.setProperty('--font-main', document.getElementById('fontSelect').value);
  render(); // 차트 내부 색상(그라디언트 등)을 재계산해 반영
}
['c-navy','c-steel','c-skyblue','c-pale','c-coral'].forEach(id=>{
  document.getElementById(id).addEventListener('input', applyColorsAndFont);
});
document.getElementById('fontSelect').addEventListener('change', applyColorsAndFont);
document.getElementById('applyBtn').addEventListener('click', () => { applyColorsAndFont(); document.getElementById('settingsOverlay').classList.remove('open'); });

document.getElementById('resetBtn').addEventListener('click', () => {
  document.getElementById('c-navy').value = DEFAULT_COLORS.navy;
  document.getElementById('c-steel').value = DEFAULT_COLORS.steel;
  document.getElementById('c-skyblue').value = DEFAULT_COLORS.skyblue;
  document.getElementById('c-pale').value = DEFAULT_COLORS.pale;
  document.getElementById('c-coral').value = DEFAULT_COLORS.coral;
  document.getElementById('fontSelect').value = DEFAULT_FONT;
  applyColorsAndFont();
});

document.getElementById('copyBtn').addEventListener('click', () => {
  const code = `:root{
  --navy:${document.getElementById('c-navy').value};
  --steel:${document.getElementById('c-steel').value};
  --skyblue:${document.getElementById('c-skyblue').value};
  --pale:${document.getElementById('c-pale').value};
  --coral:${document.getElementById('c-coral').value};
  --font-main:${document.getElementById('fontSelect').value};
}`;
  const box = document.getElementById('codeBox');
  box.textContent = code;
  box.classList.add('show');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(code).catch(()=>{});
  }
});

/* ===================== 시작 ===================== */
init();
