// [요청] 관리 UI 구조 개편 A단계 — 리드 관리
// index.html 원본 2965-3180 행에서 분리 (classic script: onclick 인라인 핸들러가 전역 함수를 참조하므로 type="module" 금지)

// ═══════════════════════════════════════
//  [요청] 리드 관리
// ═══════════════════════════════════════
// [요청] C단계 — `leads` 배열 선언은 state.js 로 이동(추천 페이지가 leads.js 없이 배열만 씀).
//   todayIso/addDaysIso/isDue 는 util.js 로, 배지 렌더는 nav.js 로 이동.
//   (배지가 리드 페이지 밖에서도 떠야 해서 nav 소유가 맞음)

async function loadLeads() {
  try {
    await loadLeadsData();     // [요청] C단계 검수 — 데이터 fetch는 state.js 공용 로더로 일원화
    renderLeads();
    renderLeadsBadge(leads);   // 방금 받은 배열로 즉시 갱신 (nav의 재조회 생략)
  } catch {}
}

function renderLeads() {
  const tbody = document.getElementById('leadsBody');
  if (!tbody) return;   // [요청] C단계 — 추천 페이지는 leads 배열만 씀(목록 DOM 없음)
  const today = todayIso();
  const filter = document.getElementById('leadsFilter')?.value || 'all';
  let filtered = leads.slice();
  if (filter === 'due') {
    filtered = filtered.filter(l => isDue(l, today));
  } else if (filter === 'pending') {
    filtered = filtered.filter(l => l.finalStatus === 'pending');
  } else if (filter === 'done') {
    filtered = filtered.filter(l => l.finalStatus !== 'pending');
  }

  // [요청] 진행 중 상단 + 관심 연락일 최신순
  filtered.sort((a, b) => {
    const ap = a.finalStatus === 'pending' ? 0 : 1;
    const bp = b.finalStatus === 'pending' ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return (b.repliedAt || '').localeCompare(a.repliedAt || '');
  });

  document.getElementById('leadsCount').textContent = leads.length;
  document.getElementById('leadsFilterCount').textContent =
    filter === 'all' ? '' : `(${filtered.length}/${leads.length})`;

  const dueCount = leads.filter(l => isDue(l, today)).length;
  const summary = document.getElementById('leadsDueSummary');
  if (dueCount > 0) {
    summary.innerHTML = `<div class="leads-due-summary">⏰ 리마인드 필요한 리드 <b>${dueCount}건</b> — 제안서 발송 후 3일이 경과했습니다.</div>`;
  } else {
    summary.innerHTML = '';
  }

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="leads-empty">${leads.length === 0 ? '등록된 리드가 없습니다. "+ 리드 추가"로 시작하세요.' : '필터에 해당하는 리드가 없습니다.'}</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(l => {
    const due = isDue(l, today);
    const statusClass = `lead-status-${l.finalStatus || 'pending'}`;
    const statusLabel = l.finalStatus === 'pending' ? '진행 중' : l.finalStatus;
    // [요청] 리드 관리 — 카톡전환 컬럼/체크박스 + 표에 메모란 노출
    const collabCell = l.collaborationConverted
      ? '<span title="카톡전환됨" style="color:#16a34a;font-weight:600">✅</span>'
      : '<span style="color:#d1d5db">—</span>';
    return `<tr class="${due ? 'due' : ''}">
      <td><b>${esc(l.nickname || '')}</b>${l.profileUrl ? `<br><a href="${esc(l.profileUrl)}" target="_blank" style="font-size:11px;color:#6b7280">${esc(l.profileUrl)}</a>` : ''}</td>
      <td>${esc(l.interestedProductName || '-')}</td>
      <td>${esc(l.proposalSentAt || '-')}</td>
      <td>${esc(l.repliedAt || '-')}</td>
      <td>${due ? `<b style="color:#b91c1c">${esc(l.remindAt)}</b>` : esc(l.remindAt || '-')}</td>
      <td style="max-width:200px;white-space:pre-wrap;color:#6b7280;font-size:12px">${esc(l.suitableProductNote || '-')}</td>
      <td><span class="lead-status ${statusClass}">${esc(statusLabel || '진행 중')}</span></td>
      <td style="text-align:center">${collabCell}</td>
      <td style="max-width:200px;white-space:pre-wrap;color:#6b7280;font-size:12px">${esc(l.notes || '-')}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openLeadModal(${l.id})">수정</button>
        <button class="btn btn-danger btn-sm" onclick="deleteLead(${l.id})">삭제</button>
      </td>
    </tr>`;
  }).join('');
}

let editingLeadId = null;
function openLeadModal(id) {
  editingLeadId = id;
  const lead = id ? leads.find(l => l.id === id) : null;

  // 관심 제품 select 옵션 채우기 (products 메모리에서)
  const productSelect = document.getElementById('leadProduct');
  const currentVal = lead?.interestedProductName || '';
  productSelect.innerHTML =
    '<option value="">— 선택 안함 —</option>' +
    (products || []).map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
  // 메모리에 없는 제품명도 보존 (이전에 등록한 제품이 삭제됐을 수 있음)
  if (currentVal && !products.some(p => p.name === currentVal)) {
    productSelect.innerHTML += `<option value="${esc(currentVal)}" selected>${esc(currentVal)} (목록 외)</option>`;
  }
  productSelect.value = currentVal;

  document.getElementById('leadModalTitle').textContent = id ? '리드 수정' : '리드 추가';
  document.getElementById('leadNickname').value = lead?.nickname || '';
  document.getElementById('leadProfileUrl').value = lead?.profileUrl || '';
  document.getElementById('leadRepliedAt').value = lead?.repliedAt || todayIso();
  document.getElementById('leadProposalSentAt').value = lead?.proposalSentAt || '';
  document.getElementById('leadRemindAt').value = lead?.remindAt || '';
  document.getElementById('leadFinalStatus').value = lead?.finalStatus || 'pending';
  document.getElementById('leadSuitableNote').value = lead?.suitableProductNote || '';
  document.getElementById('leadNotes').value = lead?.notes || '';
  // [요청] 리드 관리 — 카톡전환 체크박스 복원
  document.getElementById('leadCollabConverted').checked = !!lead?.collaborationConverted;

  // [요청] 리드 관리 — proposal_sent_at 변경 시 remind_at 자동 미리채움 (사용자가 덮어쓸 수 있음)
  document.getElementById('leadProposalSentAt').onchange = function() {
    const remindInput = document.getElementById('leadRemindAt');
    // 사용자가 이미 직접 채워둔 경우엔 건드리지 않음 (단, 비어있거나 자동 계산값과 같으면 갱신)
    if (!remindInput.value || remindInput.dataset.auto === '1') {
      remindInput.value = addDaysIso(this.value, 3);
      remindInput.dataset.auto = '1';
    }
  };
  document.getElementById('leadRemindAt').onchange = function() {
    // 사용자가 직접 수정하면 auto 해제
    this.dataset.auto = '';
  };
  // 초기값이 자동 계산식과 일치하는지 마크
  const auto = lead?.proposalSentAt && lead?.remindAt === addDaysIso(lead.proposalSentAt, 3);
  document.getElementById('leadRemindAt').dataset.auto = auto ? '1' : '';

  document.getElementById('leadModal').style.display = 'flex';
  setTimeout(() => document.getElementById('leadNickname').focus(), 0);
}

function closeLeadModal() {
  document.getElementById('leadModal').style.display = 'none';
  editingLeadId = null;
}

async function saveLead() {
  const nickname = document.getElementById('leadNickname').value.trim();
  if (!nickname) {
    alert('닉네임은 필수입니다.');
    return;
  }
  const payload = {
    nickname,
    profileUrl: document.getElementById('leadProfileUrl').value.trim(),
    interestedProductName: document.getElementById('leadProduct').value,
    repliedAt: document.getElementById('leadRepliedAt').value || null,
    proposalSentAt: document.getElementById('leadProposalSentAt').value || null,
    remindAt: document.getElementById('leadRemindAt').value || null,
    finalStatus: document.getElementById('leadFinalStatus').value,
    suitableProductNote: document.getElementById('leadSuitableNote').value.trim(),
    notes: document.getElementById('leadNotes').value.trim(),
    // [요청] 리드 관리 — 카톡전환 체크박스
    collaborationConverted: document.getElementById('leadCollabConverted').checked,
  };
  const url = editingLeadId ? `/api/leads/${editingLeadId}` : '/api/leads';
  const method = editingLeadId ? 'PUT' : 'POST';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.error || `저장 실패: ${res.status}`);
    return;
  }
  closeLeadModal();
  await loadLeads();
}

async function deleteLead(id) {
  const lead = leads.find(l => l.id === id);
  if (!confirm(`"${lead?.nickname || ''}" 리드를 삭제할까요?`)) return;
  const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || `삭제 실패: ${res.status}`);
    return;
  }
  await loadLeads();
}
