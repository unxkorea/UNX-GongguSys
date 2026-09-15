// [요청] Supabase 메인 DB 이전 — products repo (dual-mode)
// [요청] Railway 전환 1단계 — Supabase 구현을 pg(SQL) 구현으로 교체.
//   사진 업로드(uploadPhoto)만 4단계(파일 저장소)까지 임시로 Supabase Storage를 계속 사용한다(src/legacy/supabaseStorage.js).
//   기존 DB의 사진 URL도 Supabase 공개 URL 그대로 유지 → 4단계에서 일괄 치환.
// list() 반환 구조는 기존 JSON과 동일: { name, brandName, productName, ..., photos: [...urls] }
const fs = require('fs');
const path = require('path');
const config = require('../../config');

function db() { return require('../db'); }

// ─── JSON 구현 ───
function jsonLoadRaw() {
  const raw = fs.readFileSync(config.PATHS.products, 'utf-8');
  return JSON.parse(raw);
}
function jsonSave(products) {
  fs.writeFileSync(
    config.PATHS.products,
    JSON.stringify({ products }, null, 2),
    'utf-8'
  );
}

async function listJson() {
  // [요청] 카드 단위 저장 — JSON 모드는 unique한 name을 id로 부여(클라가 id 보유 → 단건 update/delete 라우팅 가능)
  const list = jsonLoadRaw().products || [];
  return list.map(p => ({ ...p, id: p.name }));
}

async function replaceAllJson(products) {
  jsonSave(products);
}

// [요청] 빠른 제품 추가 — JSON 모드 단건 insert. unique 위반은 'DUPLICATE_NAME' throw.
async function insertOneJson(product) {
  const raw = jsonLoadRaw();
  const list = raw.products || [];
  if (list.some(p => p.name === product.name)) {
    const err = new Error('DUPLICATE_NAME');
    err.code = 'DUPLICATE_NAME';
    throw err;
  }
  list.unshift(product);
  raw.products = list;
  fs.writeFileSync(config.PATHS.products, JSON.stringify(raw, null, 2), 'utf-8');
  // [요청] 카드 단위 저장 — id(=name) 포함해 반환
  return { ...product, id: product.name };
}

// [요청] 카드 단위 저장 — JSON 단건 update. id는 (변경 전) name과 일치하는 row 찾아 in-place 교체.
async function updateOneJson(id, product) {
  const raw = jsonLoadRaw();
  const list = raw.products || [];
  const idx = list.findIndex(p => p.name === id);
  if (idx === -1) {
    const e = new Error('NOT_FOUND');
    e.code = 'NOT_FOUND';
    throw e;
  }
  // 이름이 바뀌었는데 다른 row의 이름과 충돌하면 거부
  if (product.name !== id && list.some((p, j) => j !== idx && p.name === product.name)) {
    const e = new Error('DUPLICATE_NAME');
    e.code = 'DUPLICATE_NAME';
    throw e;
  }
  list[idx] = product;
  raw.products = list;
  fs.writeFileSync(config.PATHS.products, JSON.stringify(raw, null, 2), 'utf-8');
  return { ...product, id: product.name };
}

// [요청] 카드 단위 저장 — JSON 단건 삭제. 없으면 idempotent.
async function removeOneJson(id) {
  const raw = jsonLoadRaw();
  const list = raw.products || [];
  const idx = list.findIndex(p => p.name === id);
  if (idx === -1) return;
  list.splice(idx, 1);
  raw.products = list;
  fs.writeFileSync(config.PATHS.products, JSON.stringify(raw, null, 2), 'utf-8');
}

async function uploadPhotoLocal(localPath) {
  // multer가 이미 assets/에 저장. 경로만 forward slash로 정규화해 반환.
  // server.js가 /assets 를 static 서빙하므로 UI·이메일·제안서 모두 이 경로를 그대로 쓸 수 있다.
  return localPath.replace(/\\/g, '/');
}

// ─── Postgres 구현 ───
// [요청] 제품 목록 필드 확장 — hooking_phrases ~ age_range 컬럼 포함
const PRODUCT_COLUMNS = [
  'name', 'brand_name', 'product_name', 'campaign_type', 'category',
  'mail_subject', 'usp', 'offer_message',
  'hooking_phrases', 'product_link', 'announce_example_link', 'announce_example_owner',
  'hurdle', 'schedule', 'memo', 'age_range',
  // [요청] 제조사 관리 — 제조사 FK + 협업종료 status
  'manufacturer_id', 'status',
  // [요청] 카페24 제품 연동 — 카페24 출처 제품 식별자 (재가져오기 매칭 키)
  'cafe24_product_no',
];

function rowToProduct(p) {
  return {
    id: p.id, // [요청] 카드 단위 저장 — 클라가 단건 PUT/DELETE 라우팅에 사용
    name: p.name,
    brandName: p.brand_name || '',
    productName: p.product_name || '',
    campaignType: p.campaign_type || '',
    category: p.category || '',
    mailSubject: p.mail_subject || '',
    usp: p.usp || '',
    offerMessage: p.offer_message || '',
    hookingPhrases: Array.isArray(p.hooking_phrases) ? p.hooking_phrases : [],
    productLink: p.product_link || '',
    announceExampleLink: p.announce_example_link || '',
    announceExampleOwner: p.announce_example_owner || '',
    hurdle: p.hurdle || '',
    schedule: p.schedule || '',
    memo: p.memo || '',
    ageRange: p.age_range || '',
    // [요청] 제조사 관리 — 제조사 FK + 협업종료 status
    manufacturerId: p.manufacturer_id ?? null,
    status: p.status || '',
    // [요청] 카페24 제품 연동
    cafe24ProductNo: p.cafe24_product_no ?? null,
    photos: Array.isArray(p.photos) ? p.photos.filter(Boolean) : [],
  };
}

// products → DB row 매핑(공통)
function toRow(product) {
  return {
    name: product.name,
    brand_name: product.brandName || null,
    product_name: product.productName || null,
    campaign_type: product.campaignType || null,
    category: product.category || null,
    mail_subject: product.mailSubject || null,
    usp: product.usp || null,
    offer_message: product.offerMessage || null,
    hooking_phrases: Array.isArray(product.hookingPhrases) ? product.hookingPhrases : [],
    product_link: product.productLink || null,
    announce_example_link: product.announceExampleLink || null,
    announce_example_owner: product.announceExampleOwner || null,
    hurdle: product.hurdle || null,
    schedule: product.schedule || null,
    memo: product.memo || null,
    age_range: product.ageRange || null,
    // [요청] 제조사 관리 — 제조사 FK + 협업종료 status
    manufacturer_id: product.manufacturerId ?? null,
    status: product.status || '',
    // [요청] 카페24 제품 연동
    cafe24_product_no: product.cafe24ProductNo ?? null,
  };
}

const SELECT_PRODUCTS = `
  select p.id, ${PRODUCT_COLUMNS.map(c => 'p.' + c).join(', ')},
         coalesce((select json_agg(pp.url order by pp.sort_order)
                     from product_photos pp where pp.product_id = p.id), '[]'::json) as photos
    from products p`;

async function listPg() {
  // [요청] 빠른 제품 추가 — 신규 row가 위로 오도록 created_at DESC. 같은 batch(replaceAll)는 created_at 동일 → id ASC로 메모리 순서 보존.
  const { rows } = await db().query(`${SELECT_PRODUCTS} order by p.created_at desc, p.id asc`);
  return rows.map(rowToProduct);
}

async function getByIdPg(id) {
  const row = await db().one(`${SELECT_PRODUCTS} where p.id = $1`, [Number(id)]);
  return row ? rowToProduct(row) : null;
}

// product_photos 동기화: 기존 row 전부 삭제 후 photos 배열로 재삽입. (client = 트랜잭션 내 호출)
async function replacePhotosPg(client, productId, photos) {
  await client.query('delete from product_photos where product_id = $1', [productId]);
  const rows = (photos || []).filter(Boolean).map((url, i) => ({ product_id: productId, url, sort_order: i }));
  if (!rows.length) return;
  await db().insertMany('product_photos', ['product_id', 'url', 'sort_order'], rows, { client });
}

async function replaceAllPg(products) {
  // 전체 삭제 후 재삽입. product_photos는 FK cascade로 함께 삭제됨.
  await db().withTx(async client => {
    await client.query('delete from products');
    if (!products || !products.length) return;
    const inserted = await db().insertMany('products', PRODUCT_COLUMNS,
      products.map(toRow), { client, returning: 'id, name' });
    const byName = Object.fromEntries(inserted.map(r => [r.name, r.id]));
    const photoRows = [];
    for (const p of products) {
      const pid = byName[p.name];
      if (pid == null) continue;
      (p.photos || []).forEach((url, i) => {
        if (url) photoRows.push({ product_id: pid, url, sort_order: i });
      });
    }
    await db().insertMany('product_photos', ['product_id', 'url', 'sort_order'], photoRows, { client });
  });
}

function duplicateNameError() {
  const e = new Error('DUPLICATE_NAME');
  e.code = 'DUPLICATE_NAME';
  return e;
}
function notFoundError() {
  const e = new Error('NOT_FOUND');
  e.code = 'NOT_FOUND';
  return e;
}

// [요청] 빠른 제품 추가 — 단건 insert. unique 위반(23505)은 'DUPLICATE_NAME' throw.
// [요청] 카드 단위 저장 — photos 배열 있으면 product_photos에도 함께 insert.
async function insertOnePg(product) {
  const row = toRow(product);
  try {
    return await db().withTx(async client => {
      const [data] = await db().insertMany('products', PRODUCT_COLUMNS, [row], { client, returning: '*' });
      if (Array.isArray(product.photos) && product.photos.length) {
        await replacePhotosPg(client, data.id, product.photos);
      }
      return data;
    });
  } catch (error) {
    if (db().isUniqueViolation(error)) throw duplicateNameError();
    throw error;
  }
}

// [요청] 카드 단위 저장 — 단건 update. products UPDATE + product_photos 통째 교체.
async function updateOnePg(id, product) {
  const numId = Number(id);
  const row = toRow(product);
  const sets = PRODUCT_COLUMNS.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const params = PRODUCT_COLUMNS.map(c => row[c]);
  params.push(numId);
  try {
    return await db().withTx(async client => {
      const r = await client.query(
        `update products set ${sets}, updated_at = now() where id = $${params.length} returning *`, params);
      if (!r.rowCount) throw notFoundError();
      await replacePhotosPg(client, numId, product.photos || []);
      return r.rows[0];
    });
  } catch (error) {
    if (db().isUniqueViolation(error)) throw duplicateNameError();
    throw error;
  }
}

// [요청] 카드 단위 저장 — 단건 삭제. product_photos는 FK cascade.
async function removeOnePg(id) {
  await db().query('delete from products where id = $1', [Number(id)]);
}

// [요청] 제조사 관리 — 제조사 협업종료 시 연결 제품 캐스케이드.
//   status를 일괄 세팅(예: '협업종료'). opts.clearManufacturer면 status 대신 manufacturer_id를 null로(제조사 삭제 시 JSON 모드 정리용).
async function setStatusByManufacturerPg(manufacturerId, status, opts = {}) {
  if (opts.clearManufacturer) {
    await db().query('update products set manufacturer_id = null where manufacturer_id = $1', [Number(manufacturerId)]);
  } else {
    await db().query('update products set status = $1 where manufacturer_id = $2', [status, Number(manufacturerId)]);
  }
}
async function setStatusByManufacturerJson(manufacturerId, status, opts = {}) {
  const raw = jsonLoadRaw();
  const list = raw.products || [];
  let changed = false;
  for (const p of list) {
    if (Number(p.manufacturerId) === Number(manufacturerId)) {
      if (opts.clearManufacturer) p.manufacturerId = null;
      else p.status = status;
      changed = true;
    }
  }
  if (changed) jsonSave(list);
}
async function setStatusByManufacturer(manufacturerId, status, opts = {}) {
  return config.USE_DB
    ? setStatusByManufacturerPg(manufacturerId, status, opts)
    : setStatusByManufacturerJson(manufacturerId, status, opts);
}

// [요청] 제조사 삭제 시 연결 제품도 함께 삭제 — 해당 manufacturer_id 제품 일괄 삭제.
async function removeByManufacturerPg(manufacturerId) {
  // product_photos는 products FK on delete cascade로 함께 삭제됨.
  await db().query('delete from products where manufacturer_id = $1', [Number(manufacturerId)]);
}
async function removeByManufacturerJson(manufacturerId) {
  const raw = jsonLoadRaw();
  const list = raw.products || [];
  const kept = list.filter(p => Number(p.manufacturerId) !== Number(manufacturerId));
  if (kept.length !== list.length) jsonSave(kept);
}
async function removeByManufacturer(manufacturerId) {
  return config.USE_DB
    ? removeByManufacturerPg(manufacturerId)
    : removeByManufacturerJson(manufacturerId);
}

// ─── 공용 API ───
async function list() {
  return config.USE_DB ? listPg() : listJson();
}

async function replaceAll(products) {
  return config.USE_DB ? replaceAllPg(products) : replaceAllJson(products);
}

async function getByName(name) {
  const all = await list();
  return all.find(p => p.name === name) || null;
}

// [요청] Railway 전환 1단계 — 공개 카탈로그(JSON 모드) 등에서 id 단건 조회용
async function getById(id) {
  if (config.USE_DB) return getByIdPg(id);
  const all = await listJson();
  return all.find(p => String(p.id) === String(id)) || null;
}

async function uploadPhoto(localPath) {
  // 4단계(파일 저장소) 전까지의 임시 동작:
  //   DB 모드 + Supabase 키 있음 → 기존처럼 Supabase Storage 업로드 후 public URL (Railway 디스크 유실 방지)
  //   그 외(JSON 모드 / 키 없음)  → 로컬 assets/ 경로
  const storage = require('../legacy/supabaseStorage');
  if (config.USE_DB && storage.isConfigured()) {
    return storage.uploadPublic('product-photos', localPath);
  }
  return uploadPhotoLocal(localPath);
}

// [요청] 빠른 제품 추가
async function insertOne(product) {
  return config.USE_DB ? insertOnePg(product) : insertOneJson(product);
}

// [요청] 카드 단위 저장 — 단건 update / delete
async function updateOne(id, product) {
  return config.USE_DB ? updateOnePg(id, product) : updateOneJson(id, product);
}

async function removeOne(id) {
  return config.USE_DB ? removeOnePg(id) : removeOneJson(id);
}

module.exports = { list, replaceAll, getByName, getById, uploadPhoto, insertOne, updateOne, removeOne, setStatusByManufacturer, removeByManufacturer };
