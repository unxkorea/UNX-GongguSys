// [요청] Railway 전환 1단계 — 임시 Supabase Storage 업로드 헬퍼
//   메인 DB는 Railway Postgres로 옮겼지만, 사진 파일 본체는 4단계(파일 저장소)에서 옮긴다.
//   그 전까지 신규 업로드가 Railway 컨테이너 디스크(재배포 시 초기화)에 남지 않도록
//   Supabase Storage 업로드 경로를 그대로 유지한다. SUPABASE_URL/KEY가 없으면 비활성(로컬 경로 사용).
//   4단계 완료 시 이 파일과 @supabase/supabase-js 의존성을 함께 제거할 것.
require('dotenv').config();
const path = require('path');
const fs = require('fs');

let client = null;

function isConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getClient() {
  if (client) return client;
  const { createClient } = require('@supabase/supabase-js');
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return client;
}

function contentTypeFor(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

/** 로컬 파일을 버킷에 올리고 public URL 반환. */
async function uploadPublic(bucket, localPath) {
  const filename = path.basename(localPath);
  const buf = fs.readFileSync(localPath);
  const sb = getClient();
  const { error } = await sb.storage
    .from(bucket)
    .upload(filename, buf, { contentType: contentTypeFor(filename), upsert: true });
  if (error) throw error;
  const { data } = sb.storage.from(bucket).getPublicUrl(filename);
  return data.publicUrl;
}

module.exports = { isConfigured, uploadPublic };
