// Hotel Meridian – servidor local (Express + SQLite).
const express = require('express'), Database = require('better-sqlite3'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000, ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

/* ---------- Banco de dados: tabelas, chaves e restrições ---------- */
const db = new Database(path.join(__dirname, 'hotel.db'));
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS categorias(id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS quartos(id INTEGER PRIMARY KEY, numero TEXT NOT NULL UNIQUE,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id), capacidade INTEGER NOT NULL CHECK(capacidade > 0),
  preco REAL NOT NULL CHECK(preco > 0), descricao TEXT NOT NULL DEFAULT '', imagem TEXT NOT NULL DEFAULT '', ativo INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS clientes(id INTEGER PRIMARY KEY, nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE, telefone TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS pedidos(id INTEGER PRIMARY KEY, cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  status TEXT NOT NULL DEFAULT 'Pendente' CHECK(status IN ('Pendente','Confirmado','Hospedado','Concluído','Cancelado')),
  total REAL NOT NULL DEFAULT 0, criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS itens_pedido(id INTEGER PRIMARY KEY, pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  quarto_id INTEGER NOT NULL REFERENCES quartos(id), entrada TEXT NOT NULL, saida TEXT NOT NULL, diaria REAL NOT NULL, CHECK(saida > entrada));`);

/* ---------- Utilidades de validação e regras ---------- */
const bad = (m, status = 400) => { throw Object.assign(new Error(m), { status }); };
const need = (o, ks) => ks.forEach(k => { if (o[k] == null || String(o[k]).trim() === '') bad('Preencha o campo obrigatório: ' + k + '.'); });
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s));
const nights = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const isMail = s => /^\S+@\S+\.\S+$/.test(s);
// Um quarto está ocupado se houver item de pedido não cancelado cujo período se sobrepõe.
const busy = (quarto, a, b, ign) => db.prepare(`SELECT 1 FROM itens_pedido i JOIN pedidos p ON p.id = i.pedido_id
  WHERE i.quarto_id = ? AND p.status != 'Cancelado' AND i.entrada < ? AND i.saida > ? AND p.id != ?`).get(quarto, b, a, ign || 0);

// Cria cliente (se novo), pedido e itens em uma única transação: ou grava tudo, ou nada.
const criar = (c, itens) => {
  need(c, ['nome', 'email']); if (!isMail(c.email)) bad('Informe um e-mail válido.');
  if (!Array.isArray(itens) || !itens.length) bad('O carrinho está vazio.');
  return db.transaction(() => {
    const email = String(c.email).trim().toLowerCase(), ex = db.prepare('SELECT id FROM clientes WHERE email = ?').get(email);
    const cid = ex ? ex.id : db.prepare('INSERT INTO clientes(nome,email,telefone) VALUES(?,?,?)').run(String(c.nome).trim(), email, String(c.telefone || '').trim()).lastInsertRowid;
    const pid = db.prepare('INSERT INTO pedidos(cliente_id) VALUES(?)').run(cid).lastInsertRowid; let total = 0;
    for (const it of itens) {
      if (!isDate(it.entrada) || !isDate(it.saida) || nights(it.entrada, it.saida) < 1) bad('Datas inválidas: a saída deve ser posterior à entrada.');
      if (it.entrada < new Date().toISOString().slice(0, 10)) bad('A data de entrada não pode estar no passado.');
      const q = db.prepare('SELECT * FROM quartos WHERE id = ? AND ativo = 1').get(it.quarto_id); if (!q) bad('Quarto indisponível para venda.', 404);
      if (busy(q.id, it.entrada, it.saida)) bad(`O quarto ${q.numero} já está reservado nesse período.`, 409);
      total += nights(it.entrada, it.saida) * q.preco;
      db.prepare('INSERT INTO itens_pedido(pedido_id,quarto_id,entrada,saida,diaria) VALUES(?,?,?,?,?)').run(pid, q.id, it.entrada, it.saida, q.preco);
    }
    db.prepare('UPDATE pedidos SET total = ? WHERE id = ?').run(total, pid); return Number(pid);
  })();
};

/* ---------- Dados de demonstração (somente na primeira execução) ---------- */
if (!db.prepare('SELECT COUNT(*) n FROM categorias').get().n) {
  ['Standard', 'Superior', 'Deluxe', 'Suíte'].forEach(n => db.prepare('INSERT INTO categorias(nome) VALUES(?)').run(n));
  const desc = ['Cama queen, Wi-Fi e varanda com vista para o pátio.', 'Vista para o jardim, frigobar e mesa de trabalho.', 'Ambiente amplo, cama king e banheiro em mármore.', 'Sala de estar, banheira de hidromassagem e vista para o mar.'];
  for (let i = 0; i < 12; i++) { const c = i % 4;
    db.prepare('INSERT INTO quartos(numero,categoria_id,capacidade,preco,descricao,imagem) VALUES(?,?,?,?,?,?)')
      .run(`${Math.floor(i / 4) + 1}0${c + 1}`, c + 1, [2, 2, 3, 4][c], [220, 320, 480, 780][c] + Math.floor(i / 4) * 40, desc[c], `https://loremflickr.com/640/420/hotel,room?lock=${i + 1}`); }
  const d = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  criar({ nome: 'Ana Souza', email: 'ana@exemplo.com', telefone: '(11) 90000-0001' }, [{ quarto_id: 1, entrada: d(2), saida: d(5) }]);
  criar({ nome: 'Bruno Lima', email: 'bruno@exemplo.com', telefone: '(21) 90000-0002' }, [{ quarto_id: 6, entrada: d(1), saida: d(3) }, { quarto_id: 7, entrada: d(1), saida: d(3) }]);
  criar({ nome: 'Carla Mendes', email: 'carla@exemplo.com', telefone: '(31) 90000-0003' }, [{ quarto_id: 12, entrada: d(10), saida: d(14) }]);
  criar({ nome: 'Diego Rocha', email: 'diego@exemplo.com' }, [{ quarto_id: 3, entrada: d(0), saida: d(2) }]);
  db.prepare("UPDATE pedidos SET status='Confirmado' WHERE id IN (1,3)").run(); db.prepare("UPDATE pedidos SET status='Hospedado' WHERE id=4").run();
}

/* ---------- API ---------- */
const app = express(); app.use(express.json()); app.use(express.static(path.join(__dirname, 'public')));
const tokens = new Set(), isAdm = rq => tokens.has(rq.get('x-token'));
const adm = (rq, rs, next) => isAdm(rq) ? next() : rs.status(401).json({ erro: 'Acesso restrito: entre como administrador.' });
const MSG = { SQLITE_CONSTRAINT_UNIQUE: [409, 'Já existe um registro com estes dados.'], SQLITE_CONSTRAINT_FOREIGNKEY: [409, 'Este registro está vinculado a reservas e não pode ser alterado ou excluído.'],
  SQLITE_CONSTRAINT_CHECK: [400, 'Valores inválidos.'], SQLITE_CONSTRAINT_NOTNULL: [400, 'Preencha todos os campos obrigatórios.'] };
// Trata erros sem expor detalhes técnicos ao usuário.
const h = f => (rq, rs) => { try { f(rq, rs); } catch (e) { const m = MSG[e.code] || (e.status ? [e.status, e.message] : [500, 'Erro interno. Tente novamente.']); if (m[0] === 500) console.error(e); rs.status(m[0]).json({ erro: m[1] }); } };
const gone = r => r.changes ? null : bad('Registro não encontrado.', 404);

app.post('/api/login', h((rq, rs) => { if (rq.body.senha !== ADMIN_PASS) bad('Senha incorreta.', 401); const t = crypto.randomBytes(24).toString('hex'); tokens.add(t); rs.json({ token: t }); }));
app.get('/api/categorias', h((rq, rs) => rs.json(db.prepare('SELECT * FROM categorias ORDER BY id').all())));

// Quartos (produtos): busca, filtro por categoria/capacidade, ordenação e disponibilidade por datas.
app.get('/api/quartos', h((rq, rs) => {
  const { q = '', categoria = '', ordem = '', capacidade = 0, entrada, saida, todos } = rq.query;
  const ord = { preco: 'qu.preco', preco_desc: 'qu.preco DESC', cap: 'qu.capacidade DESC' }[ordem] || 'qu.numero';
  let L = db.prepare(`SELECT qu.*, c.nome categoria FROM quartos qu JOIN categorias c ON c.id = qu.categoria_id
    WHERE (qu.numero LIKE @s OR qu.descricao LIKE @s OR c.nome LIKE @s) AND (@c = '' OR qu.categoria_id = @c) AND qu.capacidade >= @k AND (@a = 1 OR qu.ativo = 1) ORDER BY ${ord}`)
    .all({ s: `%${q}%`, c: String(categoria), k: +capacidade || 0, a: isAdm(rq) && todos ? 1 : 0 });
  if (isDate(entrada) && isDate(saida) && saida > entrada) L = L.filter(r => !busy(r.id, entrada, saida));
  rs.json(L);
}));
const qv = b => { need(b, ['numero', 'categoria_id', 'capacidade', 'preco']); if (!(+b.capacidade > 0 && +b.preco > 0)) bad('Capacidade e diária devem ser maiores que zero.');
  return [String(b.numero).trim(), +b.categoria_id, Math.floor(+b.capacidade), +b.preco, String(b.descricao || '').trim(), String(b.imagem || '').trim(), b.ativo ? 1 : 0]; };
app.post('/api/quartos', adm, h((rq, rs) => rs.status(201).json({ id: db.prepare('INSERT INTO quartos(numero,categoria_id,capacidade,preco,descricao,imagem,ativo) VALUES(?,?,?,?,?,?,?)').run(...qv(rq.body)).lastInsertRowid })));
app.put('/api/quartos/:id', adm, h((rq, rs) => { gone(db.prepare('UPDATE quartos SET numero=?,categoria_id=?,capacidade=?,preco=?,descricao=?,imagem=?,ativo=? WHERE id=?').run(...qv(rq.body), rq.params.id)); rs.json({ ok: 1 }); }));
app.delete('/api/quartos/:id', adm, h((rq, rs) => { gone(db.prepare('DELETE FROM quartos WHERE id=?').run(rq.params.id)); rs.json({ ok: 1 }); }));

// Clientes
app.get('/api/clientes', adm, h((rq, rs) => rs.json(db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM pedidos WHERE cliente_id = c.id) pedidos FROM clientes c
  WHERE c.nome LIKE @s OR c.email LIKE @s ORDER BY c.nome`).all({ s: `%${rq.query.q || ''}%` }))));
const cv = b => { need(b, ['nome', 'email']); if (!isMail(b.email)) bad('Informe um e-mail válido.'); return [String(b.nome).trim(), String(b.email).trim().toLowerCase(), String(b.telefone || '').trim()]; };
app.post('/api/clientes', adm, h((rq, rs) => rs.status(201).json({ id: db.prepare('INSERT INTO clientes(nome,email,telefone) VALUES(?,?,?)').run(...cv(rq.body)).lastInsertRowid })));
app.put('/api/clientes/:id', adm, h((rq, rs) => { gone(db.prepare('UPDATE clientes SET nome=?,email=?,telefone=? WHERE id=?').run(...cv(rq.body), rq.params.id)); rs.json({ ok: 1 }); }));
app.delete('/api/clientes/:id', adm, h((rq, rs) => { gone(db.prepare('DELETE FROM clientes WHERE id=?').run(rq.params.id)); rs.json({ ok: 1 }); }));

// Pedidos (reservas): checkout público, acompanhamento por código + e-mail e gestão administrativa.
app.post('/api/pedidos', h((rq, rs) => rs.status(201).json({ id: criar(rq.body.cliente || {}, rq.body.itens) })));
app.get('/api/acompanhar', h((rq, rs) => {
  const p = db.prepare('SELECT p.*, c.nome cliente FROM pedidos p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ? AND c.email = ?').get(+rq.query.id, String(rq.query.email || '').trim().toLowerCase());
  if (!p) bad('Reserva não encontrada. Confira o código e o e-mail.', 404);
  p.itens = db.prepare('SELECT i.*, q.numero FROM itens_pedido i JOIN quartos q ON q.id = i.quarto_id WHERE i.pedido_id = ?').all(p.id); rs.json(p);
}));
app.get('/api/pedidos', adm, h((rq, rs) => { const s = rq.query.q || '';
  rs.json(db.prepare(`SELECT p.*, c.nome cliente, c.email, (SELECT group_concat(qu.numero, ', ') FROM itens_pedido i JOIN quartos qu ON qu.id = i.quarto_id WHERE i.pedido_id = p.id) quartos
    FROM pedidos p JOIN clientes c ON c.id = p.cliente_id WHERE (c.nome LIKE @s OR c.email LIKE @s OR CAST(p.id AS TEXT) = @e) AND (@t = '' OR p.status = @t) ORDER BY p.id DESC`)
    .all({ s: `%${s}%`, e: s, t: rq.query.status || '' })); }));
app.put('/api/pedidos/:id', adm, h((rq, rs) => { gone(db.prepare('UPDATE pedidos SET status = ? WHERE id = ?').run(String(rq.body.status), rq.params.id)); rs.json({ ok: 1 }); }));
app.delete('/api/pedidos/:id', adm, h((rq, rs) => { gone(db.prepare('DELETE FROM pedidos WHERE id=?').run(rq.params.id)); rs.json({ ok: 1 }); }));

app.use('/api', (rq, rs) => rs.status(404).json({ erro: 'Recurso não encontrado.' }));
app.listen(PORT, () => console.log(`Hotel Meridian em http://localhost:${PORT}`));
