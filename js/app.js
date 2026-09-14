// Payinter App - Offline First
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const state = {
  transactions: [],
  categories: [],
  filter: 'all',
  search: '',
  view: 'dashboard',
  editingId: null,
  type: 'expense',
  deferredPrompt: null
};

const formatBRL = (v) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
const formatDate = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d)/1000/60/60/24);
  if (diff===0) return 'Hoje';
  if (diff===1) return 'Ontem';
  return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
};
const uid = () => Math.random().toString(36).slice(2,10)+Date.now().toString(36);

function toast(msg){
  const stack = $('#toastStack');
  const el = document.createElement('div');
  el.className='toast';
  el.textContent=msg;
  stack.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(8px)'; setTimeout(()=>el.remove(),250)}, 2800);
}

// --- Data ---
async function loadData(){
  const [txs, cats] = await Promise.all([payinterDB.getAllTransactions(), payinterDB.getCategories()]);
  state.transactions = txs;
  state.categories = cats;
  renderAll();
  updateStorageBar();
}

function computeStats(){
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthTxs = state.transactions.filter(t=> new Date(t.date) >= startMonth);
  const income = monthTxs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expense = monthTxs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const totalIncome = state.transactions.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const totalExpense = state.transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const balance = totalIncome - totalExpense;
  return { income, expense, balance, totalIncome, totalExpense, monthTxs };
}

function filteredTransactions(){
  let list = [...state.transactions];
  if(state.filter!=='all'){
    if(['income','expense'].includes(state.filter)){
      list = list.filter(t=>t.type===state.filter);
    } else {
      list = list.filter(t=>t.categoryId===state.filter);
    }
  }
  if(state.search){
    const q = state.search.toLowerCase();
    list = list.filter(t=> (t.title||'').toLowerCase().includes(q) || (t.note||'').toLowerCase().includes(q));
  }
  return list;
}

// --- Render ---
function renderAll(){
  renderStats();
  renderRecent();
  renderTransactions();
  renderCategoryFilters();
  renderChart();
  renderCategoryList();
}

function renderStats(){
  const { income, expense, balance, monthTxs } = computeStats();
  $('#balanceValue').textContent = formatBRL(balance);
  $('#incomeValue').textContent = formatBRL(income);
  $('#expenseValue').textContent = formatBRL(expense);
  $('#txCount').textContent = `${monthTxs.length} transações no mês`;
  const diff = income - expense;
  const pill = $('#balancePill');
  pill.textContent = diff>=0 ? `+${formatBRL(diff)} no mês` : `${formatBRL(diff)} no mês`;
  pill.className = `pill ${diff>=0?'up':'down'}`;
}

function renderRecent(){
  const list = $('#recentList');
  const recent = state.transactions.slice(0,5);
  if(recent.length===0){
    list.innerHTML = `<div class="empty"><div class="empty-icon">💸</div><h4>Nenhuma transação ainda</h4><p>Toque no botão + para adicionar sua primeira movimentação. Tudo fica salvo offline.</p></div>`;
    return;
  }
  list.innerHTML = recent.map(tx=> transactionHTML(tx)).join('');
}

function renderTransactions(){
  const list = $('#allTransactionsList');
  const data = filteredTransactions();
  $('#filterCount').textContent = `${data.length} itens`;
  if(data.length===0){
    list.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div><h4>Nada encontrado</h4><p>Tente ajustar os filtros ou a busca.</p></div>`;
    return;
  }
  list.innerHTML = data.map(tx=> transactionHTML(tx)).join('');
}

function transactionHTML(tx){
  const cat = state.categories.find(c=>c.id===tx.categoryId) || { icon:'📦', color:'#9CA3AF', name:'Outros' };
  return `
  <div class="trans-item" data-id="${tx.id}">
    <div class="trans-icon ${tx.type}" style="background:${cat.color}20; border:1px solid ${cat.color}30">${cat.icon}</div>
    <div class="trans-main">
      <div class="trans-title">${escapeHTML(tx.title)}</div>
      <div class="trans-meta"><span>${cat.name}</span>•<span>${formatDate(tx.date)}</span>${tx.note?`•<span>${escapeHTML(tx.note.slice(0,30))}</span>`:''}</div>
    </div>
    <div class="trans-amount ${tx.type}">${tx.type==='expense'?'-':'+'}${formatBRL(tx.amount)}</div>
    <div class="trans-actions">
      <button class="icon-btn" style="width:32px;height:32px" onclick="editTx('${tx.id}')" title="Editar">✏️</button>
      <button class="icon-btn" style="width:32px;height:32px" onclick="deleteTx('${tx.id}')" title="Excluir">🗑️</button>
    </div>
  </div>`;
}

function escapeHTML(s){ return (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

function renderCategoryFilters(){
  const wrap = $('#categoryFilters');
  if(!wrap) return;
  const cats = state.categories;
  wrap.innerHTML = `
    <button class="filter-chip ${state.filter==='all'?'active':''}" data-filter="all">Todas</button>
    <button class="filter-chip ${state.filter==='income'?'active':''}" data-filter="income">Receitas</button>
    <button class="filter-chip ${state.filter==='expense'?'active':''}" data-filter="expense">Despesas</button>
    ${cats.map(c=>`<button class="filter-chip ${state.filter===c.id?'active':''}" data-filter="${c.id}">${c.icon} ${c.name}</button>`).join('')}
  `;
  wrap.querySelectorAll('.filter-chip').forEach(btn=>{
    btn.addEventListener('click',()=>{
      state.filter = btn.dataset.filter;
      renderCategoryFilters();
      renderTransactions();
    });
  });
}

function renderCategoryList(){
  const sel = $('#txCategory');
  sel.innerHTML = state.categories
    .filter(c=> state.type==='both' ? true : (c.type===state.type || c.type==='both'))
    .map(c=>`<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
}

function renderChart(){
  const canvas = $('#spendingChart');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio||1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 220 * dpr;
  ctx.scale(dpr,dpr);
  const width = rect.width;
  const height = 220;

  ctx.clearRect(0,0,width,height);

  // prepare data: expense by category this month
  const { monthTxs } = computeStats();
  const expenses = monthTxs.filter(t=>t.type==='expense');
  const grouped = {};
  expenses.forEach(t=>{
    const cat = state.categories.find(c=>c.id===t.categoryId);
    const key = cat?cat.name:'Outros';
    const color = cat?cat.color:'#9CA3AF';
    if(!grouped[key]) grouped[key]={total:0,color,icon:cat?.icon||'📦'};
    grouped[key].total+=t.amount;
  });
  const entries = Object.entries(grouped).sort((a,b)=>b[1].total-a[1].total).slice(0,6);
  if(entries.length===0){
    ctx.fillStyle='#9CA3AF';
    ctx.font='14px Inter, sans-serif';
    ctx.textAlign='center';
    ctx.fillText('Sem despesas este mês', width/2, height/2);
    $('#chartLegend').innerHTML='';
    return;
  }
  const max = Math.max(...entries.map(([,v])=>v.total));
  const barWidth = (width - 40) / entries.length - 12;
  entries.forEach(([name, data], i)=>{
    const x = 20 + i*(barWidth+12);
    const h = (data.total/max)* (height-60);
    const y = height - 30 - h;
    // bar
    ctx.fillStyle = data.color;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, h, [8,8,2,2]);
    ctx.fill();
    // label
    ctx.fillStyle='#6B7280';
    ctx.font='11px Inter, sans-serif';
    ctx.textAlign='center';
    ctx.fillText(name.slice(0,10), x+barWidth/2, height-10);
    // value
    ctx.fillStyle='#161616';
    ctx.font='bold 11px Inter, sans-serif';
    ctx.fillText(formatBRL(data.total).replace('R$',''), x+barWidth/2, y-6);
  });

  // legend
  $('#chartLegend').innerHTML = entries.map(([name,data])=>`
    <div class="legend-item"><span class="legend-dot" style="background:${data.color}"></span>${data.icon} ${name} • ${formatBRL(data.total)}</div>
  `).join('');
}

// --- Views ---
function setView(view){
  state.view = view;
  $$('.view').forEach(v=>v.classList.toggle('active', v.dataset.view===view));
  $$('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
  $$('.bnav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
  // update url without reload
  const url = new URL(location.href);
  url.searchParams.set('view', view);
  history.replaceState(null,'',url);
}

function openModal(editTxObj=null){
  $('#modalBackdrop').classList.add('open');
  if(editTxObj){
    state.editingId = editTxObj.id;
    $('#modalTitle').textContent='Editar transação';
    $('#txTitle').value=editTxObj.title;
    $('#txAmount').value=editTxObj.amount;
    $('#txDate').value=editTxObj.date.slice(0,10);
    $('#txNote').value=editTxObj.note||'';
    setType(editTxObj.type);
    setTimeout(()=>{
      $('#txCategory').value=editTxObj.categoryId;
    },0);
    $('#submitTxBtn').textContent='Salvar';
  } else {
    state.editingId=null;
    $('#modalTitle').textContent='Nova transação';
    $('#txForm').reset();
    $('#txDate').valueAsDate=new Date();
    setType(state.type);
    $('#submitTxBtn').textContent='Adicionar';
  }
}
function closeModal(){
  $('#modalBackdrop').classList.remove('open');
  state.editingId=null;
}
function setType(type){
  state.type=type;
  $$('.type-btn').forEach(b=>b.classList.toggle('active', b.dataset.type===type));
  renderCategoryList();
  // highlight
  const active = $(`.type-btn.active`);
  if(active){
    active.classList.remove('income','expense');
    active.classList.add(type);
  }
}

// --- Actions ---
async function handleSubmit(e){
  e.preventDefault();
  const title = $('#txTitle').value.trim();
  const amount = parseFloat($('#txAmount').value);
  const date = $('#txDate').value ? new Date($('#txDate').value).toISOString() : new Date().toISOString();
  const categoryId = $('#txCategory').value;
  const note = $('#txNote').value.trim();
  if(!title || !amount || amount<=0){ toast('Preencha título e valor válido'); return; }

  const tx = {
    id: state.editingId || uid(),
    title,
    amount,
    date,
    categoryId,
    note,
    type: state.type,
    updatedAt: new Date().toISOString()
  };
  await payinterDB.addTransaction(tx);
  await loadData();
  closeModal();
  toast(state.editingId ? 'Transação atualizada' : 'Transação adicionada ✓');
  // haptic
  if(navigator.vibrate) navigator.vibrate(20);
}

async function deleteTx(id){
  if(!confirm('Excluir esta transação?')) return;
  await payinterDB.deleteTransaction(id);
  await loadData();
  toast('Transação excluída');
}
async function editTx(id){
  const tx = state.transactions.find(t=>t.id===id);
  if(tx) openModal(tx);
}
window.deleteTx = deleteTx;
window.editTx = editTx;

// Storage
async function updateStorageBar(){
  const est = await payinterDB.getStorageEstimate();
  if(est && est.quota){
    const pct = Math.round((est.usage/est.quota)*100);
    $('#storageFill').style.width = Math.min(100, pct)+'%';
    $('#storageText').textContent = `${(est.usage/1024/1024).toFixed(1)} MB usados • ${state.transactions.length} transações`;
  } else {
    $('#storageText').textContent = `${state.transactions.length} transações salvas localmente`;
    $('#storageFill').style.width='12%';
  }
}

// Offline detection
function updateOnlineStatus(){
  const badge = $('#offlineBadge');
  const isOnline = navigator.onLine;
  badge.classList.toggle('online', isOnline);
  badge.innerHTML = `<span class="dot"></span>${isOnline ? 'Online' : 'Offline'}`;
  badge.title = isOnline ? 'Conectado, mas app funciona offline' : 'Você está offline - tudo continua funcionando';
}
window.addEventListener('online', ()=>{ updateOnlineStatus(); toast('Conexão restaurada'); });
window.addEventListener('offline', ()=>{ updateOnlineStatus(); toast('Modo offline ativado - dados salvos localmente'); });

// PWA install
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  state.deferredPrompt = e;
  $('#installBanner').classList.add('show');
});
async function installPWA(){
  if(!state.deferredPrompt) return;
  state.deferredPrompt.prompt();
  const { outcome } = await state.deferredPrompt.userChoice;
  if(outcome==='accepted') toast('Payinter instalado ✓');
  state.deferredPrompt=null;
  $('#installBanner').classList.remove('show');
}

// Export / Import
async function exportJSON(){
  const data = await payinterDB.exportData();
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`payinter-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(url);
  toast('Backup exportado');
}
function importJSON(file){
  const reader = new FileReader();
  reader.onload = async (e)=>{
    try{
      const data = JSON.parse(e.target.result);
      await payinterDB.importData(data);
      await loadData();
      toast('Dados importados com sucesso ✓');
    }catch(err){ toast('Arquivo inválido'); console.error(err); }
  };
  reader.readAsText(file);
}

// Service Worker
async function registerSW(){
  if('serviceWorker' in navigator){
    try{
      const reg = await navigator.serviceWorker.register('/sw.js', { scope:'/' });
      console.log('SW registered', reg.scope);
      reg.addEventListener('updatefound', ()=>{
        const nw = reg.installing;
        nw.addEventListener('statechange', ()=>{
          if(nw.state==='installed' && navigator.serviceWorker.controller){
            toast('Nova versão disponível - recarregue');
          }
        });
      });
    }catch(e){ console.warn('SW fail', e); }
  }
}

// Init
document.addEventListener('DOMContentLoaded', async ()=>{
  // set today
  $('#txDate').valueAsDate = new Date();

  // views from URL
  const params = new URLSearchParams(location.search);
  const viewParam = params.get('view');
  if(viewParam && ['dashboard','transactions','stats'].includes(viewParam)) state.view = viewParam;
  const action = params.get('action');
  
  setView(state.view);
  updateOnlineStatus();
  await loadData();
  registerSW();

  // Events
  $$('.nav-btn, .bnav-btn').forEach(btn=>{
    btn.addEventListener('click',()=> setView(btn.dataset.view));
  });
  $('#fab').addEventListener('click', ()=> openModal());
  $('#addFirstBtn').addEventListener('click', ()=> openModal());
  $('#closeModalBtn').addEventListener('click', closeModal);
  $('#cancelTxBtn').addEventListener('click', closeModal);
  $('#modalBackdrop').addEventListener('click', (e)=>{ if(e.target.id==='modalBackdrop') closeModal(); });
  $$('.type-btn').forEach(b=> b.addEventListener('click', ()=> setType(b.dataset.type)));
  $('#txForm').addEventListener('submit', handleSubmit);
  $('#searchInput').addEventListener('input', (e)=>{ state.search=e.target.value; renderTransactions(); });
  $('#installBtn').addEventListener('click', installPWA);
  $('#dismissInstallBtn').addEventListener('click', ()=> $('#installBanner').classList.remove('show'));
  $('#exportBtn').addEventListener('click', exportJSON);
  $('#importFile').addEventListener('change', (e)=>{ if(e.target.files[0]) importJSON(e.target.files[0]); });
  $('#clearBtn').addEventListener('click', async ()=>{
    if(confirm('Apagar TODOS os dados locais? Essa ação não pode ser desfeita.')){
      await payinterDB.clearAll();
      await loadData();
      toast('Dados apagados');
    }
  });

  if(action==='new') openModal();

  // Keyboard shortcut N
  document.addEventListener('keydown', (e)=>{
    if((e.key==='n' || e.key==='N') && !e.metaKey && !e.ctrlKey && document.activeElement.tagName!=='INPUT' && document.activeElement.tagName!=='TEXTAREA'){
      e.preventDefault(); openModal();
    }
    if(e.key==='Escape') closeModal();
  });
});
