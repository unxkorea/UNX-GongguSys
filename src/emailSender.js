// [요청] Supabase 메인 DB 이전 — emailAccountsRepo 경유 + Supabase Storage URL 첨부 지원
// [요청] Gmail API 발송 전환 — 계정에 Google 연결(refresh token)이 있으면 SMTP 대신 Gmail API(HTTPS)로 발송.
//   본문·첨부(cid)·서명·BCC 조립은 기존 mailOptions 그대로 쓰고, 전송 단계만 분기한다.
//   Railway(SMTP 차단)에서는 API 경로만 동작하고, 로컬은 앱 비밀번호 SMTP 폴백도 계속 가능.
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const config = require('../config');
const emailAccountsRepo = require('./repo/emailAccountsRepo');
const gmailApi = require('./gmailApi');
const { personalizeGreeting } = require('./personalize');

// Google 연결된 계정이면 API 경로. (환경변수 미설정 시 refresh token이 있어도 SMTP로 폴백)
function usesGmailApi(emailAccount) {
  return !!(emailAccount && emailAccount.googleRefreshToken) && gmailApi.isConfigured();
}

// mailOptions → RFC822 원문(Buffer). URL/로컬 경로 첨부·cid 인라인은 nodemailer의 MimeNode가 처리.
async function buildRawMessage(mailOptions) {
  const node = new MailComposer(mailOptions).compile();
  // MimeNode는 기본적으로 Bcc 헤더를 원문에서 제거한다. Gmail API는 Bcc 헤더를 보고 참조자에게 보내므로 유지.
  node.keepBcc = true;
  return node.build();
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmailAddress(value) {
  return typeof value === 'string' && EMAIL_REGEX.test(value.trim());
}

// [요청] photos/signatureImage가 URL일 수 있으므로 분기 처리
function isUrl(p) {
  return typeof p === 'string' && /^https?:\/\//i.test(p);
}

function isAttachable(p) {
  return !!p && (isUrl(p) || fs.existsSync(p));
}

function attachmentFilename(p) {
  if (isUrl(p)) {
    try {
      const u = new URL(p);
      return decodeURIComponent(path.basename(u.pathname));
    } catch { return 'attachment'; }
  }
  return path.basename(p);
}

async function loadEmailAccounts() {
  return emailAccountsRepo.list();
}

async function findEmailAccount(id) {
  return emailAccountsRepo.findById(id);
}

function buildSubject(product) {
  if (product.mailSubject && product.mailSubject.trim()) {
    return product.mailSubject.trim();
  }
  return `${config.MAIL_SUBJECT_PREFIX} ${product.name} ${config.MAIL_SUBJECT_SUFFIX}`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function linkify(text) {
  return text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>');
}

function buildSignatureHtml(emailAccount) {
  const sig = (emailAccount.signature || '').trim();
  const sigImage = emailAccount.signatureImage;
  if (!sig && !sigImage) return '';

  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(sig);
  const textHtml = sig ? (looksLikeHtml ? sig : escapeHtml(sig).replace(/\n/g, '<br>')) : '';
  const hasImage = isAttachable(sigImage);
  const imageHtml = hasImage
    ? `<div style="margin-top:8px"><img src="cid:signatureImg" style="max-width:400px"></div>`
    : '';

  return `<br><br><div style="color:#5f6368;font-size:13px;border-top:1px solid #e5e7eb;padding-top:12px;margin-top:16px">
    ${textHtml}
    ${imageHtml}
  </div>`;
}

function buildSignatureAttachments(emailAccount) {
  const sigImage = emailAccount.signatureImage;
  if (!isAttachable(sigImage)) return [];
  return [{
    filename: attachmentFilename(sigImage),
    path: sigImage, // nodemailer는 로컬 경로·HTTPS URL 둘 다 지원
    cid: 'signatureImg',
  }];
}

function buildHtmlBody(product, emailAccount, influencer) {
  // [요청] 메일 본문에도 '안녕하세요' 앞에 닉네임+님 삽입 (인포크 발송과 공용 헬퍼)
  const greeting = personalizeGreeting(product.offerMessage, influencer && influencer.nickname);
  const body = escapeHtml(greeting.text).replace(/\n/g, '<br>');
  const linked = linkify(body);
  const photos = Array.isArray(product.photos) ? product.photos : [];
  const imgs = photos
    .map((_, i) => `<div style="margin-bottom:8px"><img src="cid:photo${i}" style="max-width:600px;width:100%;border-radius:8px"></div>`)
    .join('');
  const signature = buildSignatureHtml(emailAccount);
  return `<div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:14px;line-height:1.7;color:#1a1a1a">
    ${imgs}
    ${imgs ? '<br>' : ''}
    <div>${linked}</div>
    ${signature}
  </div>`;
}

function buildAttachments(product) {
  const photos = Array.isArray(product.photos) ? product.photos : [];
  return photos
    .filter(isAttachable)
    .map((p, i) => ({
      filename: attachmentFilename(p),
      path: p, // 로컬 경로 또는 Supabase Storage public URL
      cid: `photo${i}`,
    }));
}

function createTransport(emailAccount) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailAccount.email,
      // [요청] Gmail 앱 비밀번호 공백 제거 — repo에서 이미 정규화하지만 발송 직전 최종 방어
      pass: (emailAccount.appPassword || '').replace(/\s+/g, ''),
    },
  });
}

async function sendMail(emailAccount, influencer, product) {
  const label = `[${emailAccount.email}] [메일] ${influencer.nickname}`;
  const to = (influencer.profileUrl || '').trim();
  console.log(`${label} 발송 시작 → ${to}`);

  if (!isEmailAddress(to)) {
    return { success: false, error: '유효하지 않은 이메일 주소' };
  }

  // [요청] 개인화 여부 로그 — 실제 치환은 buildHtmlBody 내부의 동일 헬퍼가 수행
  const greeting = personalizeGreeting(product.offerMessage, influencer.nickname);
  if (greeting.personalized) {
    console.log(`${label} 메일 본문 개인화: "${greeting.honorific} 안녕하세요"`);
  }

  try {
    // [요청] 참조자 이메일 빈값이면 BCC 키 자체 제외 — nodemailer에 빈 문자열 안 넘김
    const mailOptions = {
      from: `"${emailAccount.senderName || emailAccount.email}" <${emailAccount.email}>`,
      to,
      subject: buildSubject(product),
      html: buildHtmlBody(product, emailAccount, influencer),
      attachments: [
        ...buildAttachments(product),
        ...buildSignatureAttachments(emailAccount),
      ],
    };
    if (config.MAIL_BCC) mailOptions.bcc = config.MAIL_BCC;

    // [요청] Gmail API 발송 전환 — 전송 단계 분기
    if (usesGmailApi(emailAccount)) {
      const raw = await buildRawMessage(mailOptions);
      const info = await gmailApi.sendRaw(emailAccount, raw);
      console.log(`${label} [API] 발송 성공! (id: ${info.id})`);
      return { success: true };
    }
    const transporter = createTransport(emailAccount);
    const info = await transporter.sendMail(mailOptions);
    console.log(`${label} [SMTP] 발송 성공! (messageId: ${info.messageId})`);
    return { success: true };
  } catch (error) {
    console.error(`${label} 발송 실패:`, error.message);
    return { success: false, error: error.message };
  }
}

async function verifyTransport(emailAccount) {
  // [요청] Gmail API 발송 전환 — 연결된 계정은 토큰 재발급 + 계정 주소 일치 확인, 아니면 SMTP verify
  if (usesGmailApi(emailAccount)) {
    await gmailApi.verify(emailAccount);
    return;
  }
  const transporter = createTransport(emailAccount);
  await transporter.verify();
}

module.exports = {
  isEmailAddress,
  loadEmailAccounts,
  findEmailAccount,
  sendMail,
  verifyTransport,
  buildSubject,
  usesGmailApi,
  buildRawMessage,
};
