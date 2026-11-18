/* Hotel Meridian – front-end (JavaScript puro). Consome a API em /api. */
const $ = (s, e = document) => e.querySelector(s), $$ = (s, e = document) => [...e.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fd = s => s.split('-').reverse().join('/');
const nights = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const hoje = new Date().toISOString().slice(0, 10), STS = ['Pendente', 'Confirmado', 'Hospedado', 'Concluído'];
let tok = sessionStorage.getItem('tk') || '', cart = JSON.parse(localStorage.getItem('cart') || '[]'), S = {}, cats = [], ROOMS = {}, ROWS = {}, tab = 'quartos';

/* ---------- Infraestrutura: API, toasts, diálogo e formulário genérico ---------- */
async function api(url, method = 'GET', body) {
  const r = await fetch('/api' + url, { method, headers: { 'Content-Type': 'application/json', 'x-token': tok }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && tok) { tok = ''; sessionStorage.removeItem('tk'); }
  if (!r.ok) throw new Error(d.erro || 'Não foi possível concluir a operação.');
  return d;
}
function toast(m, err) { const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = m; $('#toasts').append(t); setTimeout(() => t.remove(), 3500); }
function dlg(html, cls = '') { const d = $('#dlg'); if (d.open) d.close(); d.className = cls; d.innerHTML = html; d.showModal(); }
const closeDlg = () => $('#dlg').close();
// Campos: [nome, rótulo, tipo, opções(select), obrigatório?]. Validação nativa do navegador + validação no servidor.
function form(title, F, v, save, label = 'Salvar') {
  dlg(`<div class="dh"><h3>${title}</h3><button class="x" type="button" onclick="closeDlg()" aria-label="Fechar">×</button></div><form id="f">${F.map(([k, l, ty, o, req]) => `<label>${l}${
    ty == 'select' ? `<select name="${k}">${o.map(([a, b]) => `<option value="${a}" ${a == v[k] ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`
    : ty == 'area' ? `<textarea name="${k}" rows="3">${esc(v[k])}</textarea>`
    : ty == 'check' ? `<input type="checkbox" name="${k}" ${v[k] ? 'checked' : ''}>`
    : `<input name="${k}" type="${ty}" value="${esc(v[k] ?? '')}" ${req === 0 ? '' : 'required'} ${ty == 'number' ? 'min="1" step="any"' : ''}>`}</label>`).join('')}<p class="ferr" id="fe"></p><button class="btn">${label}</button></form>`);
  $('#f').onsubmit = async e => {
    e.preventDefault(); const f = e.target, d = {};
    F.forEach(([k, , ty]) => d[k] = ty == 'check' ? +f[k].checked : ty == 'number' || k.endsWith('_id') ? +f[k].value : f[k].value.trim());
    try { if (await save(d) !== false) closeDlg(); } catch (x) { $('#fe').textContent = x.message; }
  };
}

/* ---------- Catálogo (home) ---------- */
async function home() {
  $('#view').innerHTML = `<section class="hero"><h1>Seu quarto, reservado em minutos</h1><p>Escolha as datas e veja somente os quartos livres no período. Sem taxas escondidas.</p>
  <form class="search" id="sf" onsubmit="return false"><label>Entrada<input type="date" id="en" min="${hoje}" value="${S.en || ''}"></label><label>Saída<input type="date" id="sa" min="${hoje}" value="${S.sa || ''}"></label>
  <label>Hóspedes<input type="number" id="cp" min="1" max="10" value="${S.cp || 1}"></label>
  <label>Categoria<select id="ct"><option value="">Todas</option>${cats.map(c => `<option value="${c.id}" ${c.id == S.ct ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label></form></section>
  <section class="wrap"><div class="bar"><input id="q" type="search" placeholder="Buscar por número, categoria ou descrição" value="${esc(S.q || '')}" aria-label="Buscar quartos">
  <select id="or" aria-label="Ordenar"><option value="">Ordenar por número</option><option value="preco">Menor preço</option><option value="preco_desc">Maior preço</option><option value="cap">Maior capacidade</option></select></div><div class="grid" id="grid"></div></section>`;
  $('#or').value = S.or || ''; $('#sf').oninput = $('.bar').oninput = load; load();
}
async function load() {
  S = { en: $('#en').value, sa: $('#sa').value, cp: $('#cp').value, ct: $('#ct').value, q: $('#q').value, or: $('#or').value };
  if (S.en && S.sa && S.sa <= S.en) return toast('A saída deve ser posterior à entrada.', 1);
  try {
    const L = await api('/quartos?' + new URLSearchParams({ q: S.q, categoria: S.ct, ordem: S.or, capacidade: S.cp, entrada: S.en, saida: S.sa }));
    L.forEach(r => ROOMS[r.id] = r);
    $('#grid').innerHTML = L.map(card).join('') || '<p class="empty">Nenhum quarto livre com esses filtros. Tente outras datas ou outra categoria.</p>';
  } catch (e) { toast(e.message, 1); }
}
function card(r) {
  const n = S.en && S.sa ? nights(S.en, S.sa) : 0;
  return `<article class="card"><div class="ph">${r.imagem ? `<img src="${esc(r.imagem)}" alt="Quarto ${esc(r.numero)}" loading="lazy" onerror="this.remove()">` : ''}<span class="tag">${esc(r.categoria)}</span></div>
  <div class="cb"><h3>Quarto ${esc(r.numero)}</h3><p>${esc(r.descricao)}</p><p>Até ${r.capacidade} hóspedes</p>
  <div class="foot"><div><b>${brl(r.preco)}</b><small>por noite${n > 0 ? `, ${n} noite(s): ${brl(n * r.preco)}` : ''}</small></div><button class="btn" onclick="add(${r.id})">Reservar</button></div></div></article>`;
}

/* ---------- Carrinho e checkout ---------- */
const sc = () => { localStorage.setItem('cart', JSON.stringify(cart)); $('#cc').textContent = cart.length; };
function add(id) {
  if (!S.en || !S.sa) return toast('Escolha as datas de entrada e saída para reservar.', 1);
  const r = ROOMS[id];
  if (cart.some(i => i.quarto_id == id && i.entrada < S.sa && i.saida > S.en)) return toast('Este quarto já está no carrinho nessas datas.', 1);
  cart.push({ quarto_id: id, numero: r.numero, categoria: r.categoria, preco: r.preco, entrada: S.en, saida: S.sa }); sc(); toast('Quarto adicionado ao carrinho.');
}
const rmv = k => { cart.splice(k, 1); sc(); showCart(); };
function showCart() {
  const sub = i => nights(i.entrada, i.saida) * i.preco;
  dlg(`<div class="dh"><h3>Seu carrinho</h3><button class="x" onclick="closeDlg()" aria-label="Fechar">×</button></div>${cart.map((i, k) => `<div class="ci"><div><b>Quarto ${esc(i.numero)}</b> ${esc(i.categoria)}<small>${fd(i.entrada)} a ${fd(i.saida)}, ${nights(i.entrada, i.saida)} noite(s)</small></div>
  <div>${brl(sub(i))} <button class="x" onclick="rmv(${k})" aria-label="Remover">×</button></div></div>`).join('') || '<p class="empty">Seu carrinho está vazio. Escolha um quarto no catálogo.</p>'}
  <div class="tt"><span>Total</span><b>${brl(cart.reduce((s, i) => s + sub(i), 0))}</b></div><button class="btn full" ${cart.length ? '' : 'disabled'} onclick="checkout()">Continuar para os dados</button>`, 'drawer');
}
function checkout() {
  form('Dados do hóspede', [['nome', 'Nome completo', 'text'], ['email', 'E-mail', 'email'], ['telefone', 'Telefone (opcional)', 'tel', null, 0]], {}, async v => {
    const r = await api('/pedidos', 'POST', { cliente: v, itens: cart.map(({ quarto_id, entrada, saida }) => ({ quarto_id, entrada, saida })) });
    cart = []; sc();
    dlg(`<div class="ok"><h3>Reserva registrada!</h3><p>Seu código é <b>#${r.id}</b>. Use-o com o seu e-mail em “Minha reserva” para acompanhar o status.</p><button class="btn" onclick="closeDlg()">Fechar</button></div>`);
    return false;
  }, 'Confirmar reserva');
}

/* ---------- Acompanhamento do pedido ---------- */
function track() {
  $('#view').innerHTML = `<section class="wrap narrow"><h2>Acompanhe sua reserva</h2><form class="inline" id="tf"><input name="id" type="number" min="1" placeholder="Código da reserva" required aria-label="Código"><input name="email" type="email" placeholder="E-mail usado na reserva" required aria-label="E-mail"><button class="btn">Consultar</button></form><div id="tr"></div></section>`;
  $('#tf').onsubmit = async e => {
    e.preventDefault();
    try {
      const p = await api(`/acompanhar?id=${e.target.id.value}&email=${encodeURIComponent(e.target.email.value)}`), cn = p.status == 'Cancelado';
      $('#tr').innerHTML = `<div class="steps ${cn ? 'cancel' : ''}">${(cn ? ['Cancelado'] : STS).map((s, i) => `<div class="${cn || i <= STS.indexOf(p.status) ? 'on' : ''}">${s}</div>`).join('')}</div>
      <div class="tw"><table><tr><th>Quarto</th><th>Entrada</th><th>Saída</th><th>Diária</th></tr>${p.itens.map(i => `<tr><td>${esc(i.numero)}</td><td>${fd(i.entrada)}</td><td>${fd(i.saida)}</td><td>${brl(i.diaria)}</td></tr>`).join('')}</table></div><p>Hóspede: <b>${esc(p.cliente)}</b>. Total: <b>${brl(p.total)}</b></p>`;
    } catch (x) { $('#tr').innerHTML = ''; toast(x.message, 1); }
  };
}

/* ---------- Administração: CRUD de quartos, clientes e pedidos ---------- */
const FQ = () => [['numero', 'Número do quarto', 'text'], ['categoria_id', 'Categoria', 'select', cats.map(c => [c.id, c.nome])], ['capacidade', 'Capacidade (hóspedes)', 'number'], ['preco', 'Diária (R$)', 'number'],
  ['descricao', 'Descrição', 'area'], ['imagem', 'URL da imagem (opcional)', 'url', null, 0], ['ativo', 'Disponível para venda', 'check']];
const FC = [['nome', 'Nome completo', 'text'], ['email', 'E-mail', 'email'], ['telefone', 'Telefone (opcional)', 'tel', null, 0]];
const COL = {
  quartos: [['Número', r => esc(r.numero)], ['Categoria', r => esc(r.categoria)], ['Capacidade', r => r.capacidade], ['Diária', r => brl(r.preco)], ['Situação', r => r.ativo ? 'Ativo' : 'Inativo']],
  clientes: [['Nome', r => esc(r.nome)], ['E-mail', r => esc(r.email)], ['Telefone', r => esc(r.telefone)], ['Reservas', r => r.pedidos]],
  pedidos: [['Código', r => '#' + r.id], ['Cliente', r => esc(r.cliente)], ['Quartos', r => esc(r.quartos)], ['Total', r => brl(r.total)],
    ['Status', r => `<select onchange="setSt(${r.id},this.value)" aria-label="Status">${[...STS, 'Cancelado'].map(s => `<option ${s == r.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`]]
};
function admin() {
  if (!tok) {
    $('#view').innerHTML = `<section class="wrap narrow"><h2>Área administrativa</h2><p>Gerencie quartos, clientes e reservas. Senha de demonstração: <b>admin123</b></p><form class="inline" id="lf"><input type="password" name="senha" placeholder="Senha" required aria-label="Senha"><button class="btn">Entrar</button></form></section>`;
    $('#lf').onsubmit = async e => { e.preventDefault(); try { tok = (await api('/login', 'POST', { senha: e.target.senha.value })).token; sessionStorage.setItem('tk', tok); admin(); } catch (x) { toast(x.message, 1); } };
    return;
  }
  $('#view').innerHTML = `<section class="wrap"><div class="tabs">${['quartos', 'pedidos', 'clientes'].map(t => `<button class="${t == tab ? 'on' : ''}" onclick="tab='${t}';admin()">${t}</button>`).join('')}<button class="out" onclick="logout()">Sair</button></div>
  <div class="bar"><input id="aq" type="search" placeholder="Buscar" aria-label="Buscar">${tab == 'pedidos' ? `<select id="as" aria-label="Filtrar por status"><option value="">Todos os status</option>${[...STS, 'Cancelado'].map(s => `<option>${s}</option>`).join('')}</select>` : `<button class="btn" onclick="edit('${tab}')">Novo registro</button>`}</div><div class="tw" id="at"></div></section>`;
  $('.bar').oninput = tabela; tabela();
}
async function tabela() {
  const T = tab, s = $('#as') ? $('#as').value : '';
  try {
    const L = await api(`/${T}?q=${encodeURIComponent($('#aq').value)}&status=${encodeURIComponent(s)}&todos=1`); ROWS[T] = Object.fromEntries(L.map(r => [r.id, r]));
    $('#at').innerHTML = `<table><tr>${COL[T].map(c => `<th>${c[0]}</th>`).join('')}<th>Ações</th></tr>${L.map(r => `<tr>${COL[T].map(c => `<td>${c[1](r)}</td>`).join('')}<td>${T != 'pedidos' ? `<button class="btn sm alt" onclick="edit('${T}',${r.id})">Editar</button>` : ''}<button class="btn sm del" onclick="rem('${T}',${r.id})">Excluir</button></td></tr>`).join('') || `<tr><td colspan="9">Nenhum registro encontrado.</td></tr>`}</table>`;
  } catch (e) { toast(e.message, 1); if (!tok) admin(); }
}
function edit(T, id) {
  form(id ? 'Editar registro' : 'Novo registro', T == 'quartos' ? FQ() : FC, id ? ROWS[T][id] : { ativo: 1 }, async d => { await api(`/${T}${id ? '/' + id : ''}`, id ? 'PUT' : 'POST', d); toast('Registro salvo.'); tabela(); });
}
async function rem(T, id) {
  if (!confirm('Excluir este registro? Esta ação não pode ser desfeita.')) return;
  try { await api(`/${T}/${id}`, 'DELETE'); toast('Registro excluído.'); tabela(); } catch (e) { toast(e.message, 1); }
}
async function setSt(id, status) { try { await api('/pedidos/' + id, 'PUT', { status }); toast('Status atualizado.'); } catch (e) { toast(e.message, 1); tabela(); } }
function logout() { tok = ''; sessionStorage.removeItem('tk'); admin(); }

/* ---------- Roteador por hash e inicialização ---------- */
function route() {
  const h = location.hash || '#/'; $$('nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') == h));
  ({ '#/acompanhar': track, '#/admin': admin }[h] || home)(); window.scrollTo(0, 0);
}
addEventListener('hashchange', route); $('#cartbtn').onclick = showCart;
(async () => { sc(); try { cats = await api('/categorias'); } catch (e) { toast('Não foi possível carregar os dados. O servidor está em execução?', 1); } route(); })();
