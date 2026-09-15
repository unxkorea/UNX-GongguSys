// [요청] 추천 카탈로그 페이지 — 인플루언서별 큐레이션 공유 링크 (dual-mode repo)
// [요청] Railway 전환 1단계 — Supabase 구현을 pg(SQL) 구현으로 교체 + 공개 조회(getPublicByCode) 추가
//   공개 페이지가 브라우저에서 anon 키로 직접 RPC를 부르던 구조를 없애고,
//   server.js의 GET /api/public/catalog/:code 가 이 repo를 통해 응답한다.
// list() / getById(id) 반환 구조:
//   { id, code, title, influencerNickname, leadId, productIds, viewCount, viewedAt, createdAt }
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const config = require('../../config');

function db() { return require('../db'); }

const CATALOGS_JSON = path.resolve(__dirname, '..', '..', 'catalogs.json');

function generateCode() {
  // base64url 6글자 (≈ 36비트 엔트로피) — 충돌 확률 무시 가능
  return crypto.randomBytes(5).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    .slice(0, 6);
}

function rowToCatalog(r) {
  return {
    id: r.id,
    code: r.code,
    title: r.title || '',
    influencerNickname: r.influencer_nickname || '',
    leadId: r.lead_id || null,
    productIds: Array.isArray(r.product_ids) ? r.product_ids : (r.product_ids || []),
    viewCount: r.view_count || 0,
    viewedAt: r.viewed_at || null,
    createdAt: r.created_at || null,
  };
}

function normalizeIncoming(payload) {
  const productIds = Array.isArray(payload.productIds)
    ? payload.productIds.map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0)
    : [];
  return {
    title: (payload.title || '').toString().trim() || null,
    influencer_nickname: (payload.influencerNickname || '').toString().trim(),
    lead_id: payload.leadId ? Number(payload.leadId) : null,
    product_ids: productIds,
  };
}

function validateRow(row) {
  if (!row.influencer_nickname) {
    const e = new Error('NICKNAME_REQUIRED'); e.code = 'NICKNAME_REQUIRED'; throw e;
  }
  if (!row.product_ids.length) {
    const e = new Error('PRODUCTS_REQUIRED'); e.code = 'PRODUCTS_REQUIRED'; throw e;
  }
}
function notFoundError() {
  const e = new Error('NOT_FOUND'); e.code = 'NOT_FOUND'; return e;
}

// ─── JSON 구현 ───
function jsonLoadRaw() {
  try {
    const raw = fs.readFileSync(CATALOGS_JSON, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.catalogs) ? parsed : { catalogs: [] };
  } catch {
    return { catalogs: [] };
  }
}
function jsonSave(catalogs) {
  fs.writeFileSync(CATALOGS_JSON, JSON.stringify({ catalogs }, null, 2), 'utf-8');
}

async function listJson() {
  const list = jsonLoadRaw().catalogs || [];
  return list.slice()
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .map(rowToCatalog);
}

async function insertOneJson(payload) {
  const raw = jsonLoadRaw();
  const list = raw.catalogs || [];
  const row = normalizeIncoming(payload);
  validateRow(row);
  let code;
  for (let i = 0; i < 5; i++) {
    code = generateCode();
    if (!list.some(c => c.code === code)) break;
  }
  const nextId = list.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
  const now = new Date().toISOString();
  const newRow = {
    id: nextId,
    code,
    ...row,
    view_count: 0,
    viewed_at: null,
    created_at: now,
  };
  list.unshift(newRow);
  raw.catalogs = list;
  jsonSave(list);
  return rowToCatalog(newRow);
}

// [요청] 기존 카탈로그 수정 — code/created_at/view_count/viewed_at 보존, 나머지 갱신
async function updateOneJson(id, payload) {
  const raw = jsonLoadRaw();
  const list = raw.catalogs || [];
  const numId = Number(id);
  const idx = list.findIndex(r => r.id === numId);
  if (idx === -1) throw notFoundError();
  const row = normalizeIncoming(payload);
  validateRow(row);
  list[idx] = { ...list[idx], ...row };
  raw.catalogs = list;
  jsonSave(list);
  return rowToCatalog(list[idx]);
}

async function removeOneJson(id) {
  const raw = jsonLoadRaw();
  const list = raw.catalogs || [];
  const numId = Number(id);
  const idx = list.findIndex(r => r.id === numId);
  if (idx === -1) return;
  list.splice(idx, 1);
  raw.catalogs = list;
  jsonSave(list);
}

// 공개 조회(JSON 모드): view_count +1 후 제품을 product_ids 순서대로 조립.
//   Supabase RPC get_catalog_by_code와 같은 응답 형태. JSON 모드의 제품 id는 name이라 문자열 비교.
async function getPublicByCodeJson(code) {
  const raw = jsonLoadRaw();
  const list = raw.catalogs || [];
  const idx = list.findIndex(c => c.code === code);
  if (idx === -1) return null;
  list[idx].view_count = (list[idx].view_count || 0) + 1;
  list[idx].viewed_at = new Date().toISOString();
  raw.catalogs = list;
  jsonSave(list);
  const cat = list[idx];
  const productsRepo = require('./productsRepo');
  const all = await productsRepo.list();
  const byId = new Map(all.map(p => [String(p.id), p]));
  const products = (cat.product_ids || [])
    .map(pid => byId.get(String(pid)))
    .filter(Boolean)
    .map(p => ({
      id: p.id,
      name: p.name,
      brandName: p.brandName || null,
      productName: p.productName || null,
      campaignType: p.campaignType || null,
      category: p.category || null,
      usp: p.usp || null,
      offerMessage: p.offerMessage || null,
      productLink: p.productLink || null,
      announceExampleLink: p.announceExampleLink || null,
      memo: p.memo || null,
      ageRange: p.ageRange || null,
      photos: p.photos || [],
    }));
  return {
    code: cat.code,
    title: cat.title || null,
    influencerNickname: cat.influencer_nickname,
    viewCount: cat.view_count,
    products,
  };
}

// ─── Postgres 구현 ───
async function listPg() {
  const { rows } = await db().query('select * from catalogs order by created_at desc, id desc');
  return rows.map(rowToCatalog);
}

async function insertOnePg(payload) {
  const row = normalizeIncoming(payload);
  validateRow(row);
  // 짧은 code라 안전을 위해 5회 재시도 (unique 충돌 시).
  let lastErr;
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    try {
      const data = await db().one(
        `insert into catalogs (code, title, influencer_nickname, lead_id, product_ids)
         values ($1, $2, $3, $4, $5::jsonb) returning *`,
        [code, row.title, row.influencer_nickname, row.lead_id, JSON.stringify(row.product_ids)]
      );
      return rowToCatalog(data);
    } catch (error) {
      if (db().isUniqueViolation(error)) { lastErr = error; continue; } // unique violation → retry
      throw error;
    }
  }
  throw lastErr || new Error('CODE_GENERATION_FAILED');
}

// [요청] 기존 카탈로그 수정 — code/created_at/view_count/viewed_at 보존
async function updateOnePg(id, payload) {
  const row = normalizeIncoming(payload);
  validateRow(row);
  const r = await db().query(
    `update catalogs
        set title = $1, influencer_nickname = $2, lead_id = $3, product_ids = $4::jsonb
      where id = $5 returning *`,
    [row.title, row.influencer_nickname, row.lead_id, JSON.stringify(row.product_ids), Number(id)]
  );
  if (!r.rowCount) throw notFoundError();
  return rowToCatalog(r.rows[0]);
}

async function removeOnePg(id) {
  await db().query('delete from catalogs where id = $1', [Number(id)]);
}

// 공개 조회(DB 모드): schema.pg.sql의 get_catalog_by_code 함수 재사용 (view_count +1 + 제품/사진 조립)
async function getPublicByCodePg(code) {
  const row = await db().one('select get_catalog_by_code($1) as data', [code]);
  return row ? row.data : null;
}

// ─── 공용 API ───
async function list() {
  return config.USE_DB ? listPg() : listJson();
}
async function insertOne(payload) {
  return config.USE_DB ? insertOnePg(payload) : insertOneJson(payload);
}
async function updateOne(id, payload) {
  return config.USE_DB ? updateOnePg(id, payload) : updateOneJson(id, payload);
}
async function removeOne(id) {
  return config.USE_DB ? removeOnePg(id) : removeOneJson(id);
}
// 공개 카탈로그 1건 (없으면 null). 호출마다 view_count가 1 증가한다.
async function getPublicByCode(code) {
  const c = String(code || '').trim();
  if (!c || c.length > 32) return null;
  return config.USE_DB ? getPublicByCodePg(c) : getPublicByCodeJson(c);
}

module.exports = { list, insertOne, updateOne, removeOne, getPublicByCode };
