const TAGS = { remove:0, sure_remove:1, aoe:2, heal:3, rush:4 };
const CLASSES = ["ニュートラル","エルフ","ロイヤル","ウィッチ","ドラゴン","ナイトメア","ビショップ","ネメシス"];
let state = { deck:[], ppFilter:null, tagFilter:null, classFilter:null };

// JSON読み込み
fetch('owaba/js/deck.json')
  .then(res => res.json())
  .then(data => {
    state.deck = data;
    renderClassFilter();
    renderPPFilter();
    attachFilterButtons();
    attachRecalc();
    attachModalHandler();
    renderCards();
    renderCounters();
  });

function byPpThenId(a,b){ if(a.pp!==b.pp)return a.pp-b.pp; return a.id-b.id; }

function renderCounters(){
  const counters = document.querySelectorAll('#counters .counter');
  const visible = state.deck.filter(c => !c.hidden);
  counters.forEach(el=>{
    const tagKey = el.dataset.tag;
    const tagId = TAGS[tagKey];
    const count = visible.filter(c=>c.tags.includes(tagId)).length;
    el.querySelector('.count').textContent = count;
  });
  document.getElementById('deck-title').textContent = `デッキ（残り${visible.length}枚）`;
}

function renderClassFilter(){
  const container = document.getElementById('class-filter'); container.innerHTML='';
  const allBtn=document.createElement('button'); allBtn.className='class-btn'; allBtn.dataset.class='all'; allBtn.textContent='ALL';
  allBtn.addEventListener('click',()=>{ document.querySelectorAll('#class-filter .class-btn').forEach(x=>x.classList.remove('active')); allBtn.classList.add('active'); state.classFilter=null; renderCards(); renderCounters(); });
  container.appendChild(allBtn);

  CLASSES.forEach((clsName,idx)=>{
    const btn=document.createElement('button'); btn.className='class-btn'; btn.dataset.class=idx;
    const img=document.createElement('img'); img.src=`owaba/image/${idx}.svg`; img.alt=clsName;
    img.onerror=function(){ img.style.display='none'; btn.classList.add('img-missing'); let fb=btn.querySelector('.fallback-text'); if(!fb){ fb=document.createElement('div'); fb.className='fallback-text'; fb.textContent=clsName; btn.appendChild(fb);}else{fb.style.display='block';} };
    btn.appendChild(img);
    btn.addEventListener('click',()=>{
      document.querySelectorAll('#class-filter .class-btn').forEach(x=>x.classList.remove('active'));
      btn.classList.add('active');
      state.classFilter=(btn.dataset.class==='all')?null:parseInt(btn.dataset.class,10);
      state.ppFilter=null; state.tagFilter=null;
      document.querySelectorAll('.pp-btn').forEach(x=>x.classList.remove('active'));
      document.querySelectorAll('#counters .counter').forEach(x=>x.classList.remove('active'));
      renderCards(); renderCounters();
    });
    container.appendChild(btn);
  });
}

function renderPPFilter(){
  const container = document.getElementById('pp-filter'); 
  container.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'pp-btn';
  allBtn.dataset.pp = 'all';
  allBtn.textContent = 'ALL';
  allBtn.addEventListener('click', () => {
    document.querySelectorAll('.pp-btn').forEach(x => x.classList.remove('active'));
    allBtn.classList.add('active');
    state.ppFilter = null;
    state.tagFilter = null;
    document.querySelectorAll('#class-filter .class-btn').forEach(x => x.classList.remove('active'));
    renderCards();
    renderCounters();
  });
  container.appendChild(allBtn);

  for (let i = 1; i <= 10; i++) {
    const btn = document.createElement('button');
    btn.className = 'pp-btn';
    btn.dataset.pp = i;
    btn.textContent = i;
    container.appendChild(btn);
  }
}

function renderCards(){
  const container=document.getElementById('cards'); container.innerHTML='';
  let cards=state.deck.filter(c=>!c.hidden);
  if(state.ppFilter!=null) cards=cards.filter(c=>c.pp===state.ppFilter);
  if(state.tagFilter!=null) cards=cards.filter(c=>c.tags.includes(state.tagFilter));
  if(state.classFilter!=null) cards=cards.filter(c=>c.classId===state.classFilter);
  cards.sort(byPpThenId);

  for(const c of cards){
    const div=document.createElement('div'); div.className='card'; div.dataset.id=c.id;
    const img=document.createElement('img'); img.src=`owaba/img/${c.id}.png`; img.alt=c.name;
    img.setAttribute('data-bs-toggle','modal'); img.setAttribute('data-bs-target','#abilityModal');
    img.dataset.cardName=c.name; img.dataset.cardAbility=c.ability; img.dataset.cardClassId=c.classId; img.dataset.cardPp=c.pp;
    img.onerror=function(){ this.src='data:image/svg+xml;utf8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280"><rect width="100%" height="100%" fill="#ddd"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#666" font-size="16">owaba/img/${c.id}.png</text></svg>`); };
    const chk=document.createElement('input'); chk.type='checkbox'; chk.className='checkbox';
    chk.addEventListener('change',e=>{ c.used=e.target.checked; });
    div.appendChild(img); div.appendChild(chk); container.appendChild(div);
  }
}

function attachFilterButtons(){
  document.querySelectorAll('.pp-btn').forEach(b=>{
    b.addEventListener('click',()=>{
      document.querySelectorAll('.pp-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      state.ppFilter=(b.dataset.pp==='all')?null:parseInt(b.dataset.pp,10); state.tagFilter=null;
      document.querySelectorAll('#class-filter .class-btn').forEach(x=>x.classList.remove('active'));
      renderCards(); renderCounters();
    });
  });
  document.querySelectorAll('#counters .counter').forEach(c=>{
    c.addEventListener('click',()=>{
      document.querySelectorAll('#counters .counter').forEach(x=>x.classList.remove('active')); c.classList.add('active');
      state.tagFilter=TAGS[c.dataset.tag]; state.ppFilter=null;
      document.querySelectorAll('.pp-btn').forEach(x=>x.classList.remove('active'));
      document.querySelectorAll('#class-filter .class-btn').forEach(x=>x.classList.remove('active'));
      renderCards(); renderCounters();
    });
  });
}

function attachRecalc(){
  document.getElementById('recalc').addEventListener('click',()=>{
    state.deck.forEach(c=>{ if(c.used)c.hidden=true; });
    renderCards(); renderCounters();
  });
}

function attachModalHandler(){
  const abilityModalEl = document.getElementById('abilityModal');
  abilityModalEl.addEventListener('show.bs.modal', function(event){
    const trigger = event.relatedTarget; if(!trigger) return;
    const name = trigger.dataset.cardName || '';
    const ability = trigger.dataset.cardAbility || '';
    const pp = trigger.dataset.cardPp || '';
    const classId = trigger.dataset.cardClassId;
    const className = (classId !== undefined && CLASSES[classId]) ? CLASSES[classId] : '';

    abilityModalEl.querySelector('.modal-title').textContent = name;
    document.getElementById('abilityModalBody').innerHTML = `${ability} / PP:${pp} / クラス:${className}`;
  });
}
