// [요청] 제안/메일내용 '안녕하세요' 앞에 닉네임 자동 삽입 — 인포크·메일 발송 공용 헬퍼
// 첫 번째 '안녕하세요'만 '닉네임님 안녕하세요'로 치환한다.
// 닉네임이 비어 있으면 원문 유지, 닉네임이 이미 '님'으로 끝나면 '님'을 중복해 붙이지 않는다.
function personalizeGreeting(message, nickname) {
  const text = message || '';
  const name = (nickname || '').trim();
  if (!name || !text.includes('안녕하세요')) {
    return { text, personalized: false, honorific: '' };
  }
  const honorific = name.endsWith('님') ? name : `${name}님`;
  return {
    text: text.replace('안녕하세요', `${honorific} 안녕하세요`),
    personalized: true,
    honorific,
  };
}

module.exports = { personalizeGreeting };
