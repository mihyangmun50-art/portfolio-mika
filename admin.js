// ===== Supabase 연결 정보 (공개 키만 사용) =====
const SUPABASE_URL = "https://rhxffukfmkahjycygbxf.supabase.co";
const SUPABASE_KEY = "sb_publishable_n9rFqjokGStw_t4_VaMLBQ_WWKiFWTq";
const BUCKET = "resume";
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// 올릴 수 있는 파일 종류와 새 이름에 붙일 확장자
const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const FILE_TYPES = { ...IMAGE_TYPES, "application/pdf": "pdf" };

const $ = (id) => document.getElementById(id);

// ===== 로그인 정보(토큰) 보관 =====
let session = null;

function loadSession() {
  try {
    session = JSON.parse(localStorage.getItem("resume_admin_session"));
  } catch (e) {
    session = null;
  }
}

function saveSession(data) {
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    user: { id: data.user.id, email: data.user.email },
  };
  try { localStorage.setItem("resume_admin_session", JSON.stringify(session)); } catch (e) {}
}

function clearSession() {
  session = null;
  try { localStorage.removeItem("resume_admin_session"); } catch (e) {}
}

// ===== Supabase Auth (로그인 · 토큰 새로 받기 · 로그아웃) =====
async function authRequest(grantType, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grantType}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_description || data.msg || "로그인 오류");
    err.status = res.status;
    throw err;
  }
  saveSession(data);
}

async function refreshSession() {
  if (!session || !session.refresh_token) throw new Error("로그인이 필요해요");
  await authRequest("refresh_token", { refresh_token: session.refresh_token });
}

// 토큰이 곧 만료되면 미리 새로 받는다
async function validToken() {
  if (!session) throw new Error("로그인이 필요해요");
  if (Date.now() > session.expires_at - 60 * 1000) await refreshSession();
  return session.access_token;
}

// ===== Supabase 부르기 (받은 토큰으로) =====
async function request(url, options = {}, retried = false) {
  const token = await validToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  // 토큰이 만료됐으면 한 번만 새로 받아 다시 시도
  if (res.status === 401 && !retried) {
    try {
      await refreshSession();
    } catch (e) {
      logout();
      throw new Error("로그인이 끝났어요. 다시 로그인해 주세요.");
    }
    return request(url, options, true);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.message || data.error || `오류 ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

function rest(path, options = {}) {
  return request(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
}

// 고치기·지우기 뒤 실제로 바뀐 줄을 돌려받는다 (0줄이면 규칙에 막힌 것)
async function restChanged(path, method, body) {
  const res = await rest(path, {
    method,
    headers: { Prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ===== 보관함에 파일 올리기 =====
function checkFile(file, allowed) {
  if (!allowed[file.type]) {
    return allowed === IMAGE_TYPES
      ? "이미지(PNG·JPG·WEBP·GIF)만 올릴 수 있어요."
      : "이미지(PNG·JPG·WEBP·GIF)나 PDF만 올릴 수 있어요.";
  }
  if (file.size > MAX_SIZE) return "10MB가 넘는 파일은 올릴 수 없어요.";
  return null;
}

// 파일 이름은 영어·숫자로 새로 짓는다 (예: 1730000000000-a1b2c3d4.png)
function newFileName(file, allowed) {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${Date.now()}-${rand}.${allowed[file.type]}`;
}

async function uploadFile(folder, file, allowed) {
  const problem = checkFile(file, allowed);
  if (problem) throw new Error(problem);
  const path = `${folder}/${newFileName(file, allowed)}`;
  await request(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { "Content-Type": file.type, "x-upsert": "false" },
    body: file,
  });
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// ===== 작은 도우미 =====
function setMsg(id, text, kind) {
  const el = $(id);
  el.textContent = text || "";
  el.className = "msg" + (kind ? " " + kind : "");
}

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function makeButton(text, className, onClick) {
  const b = makeEl("button", className, text);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function safeUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
}

function showPhoto(box, url) {
  box.textContent = "";
  if (safeUrl(url)) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    box.appendChild(img);
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

// ===== 화면 바꾸기 =====
function showView(name) {
  $("login-view").hidden = name !== "login";
  $("denied-view").hidden = name !== "denied";
  $("admin-view").hidden = name !== "admin";
  $("logout-btn").hidden = name === "login";
  $("who").textContent = name === "login" || !session ? "" : session.user.email;
}

async function start() {
  loadSession();
  if (!session) {
    showView("login");
    return;
  }
  try {
    // admins 표에서 "내 줄"이 보이면 관리자
    const res = await rest(`admins?select=user_id&user_id=eq.${session.user.id}`);
    const rows = await res.json();
    if (!rows.length) {
      showView("denied");
      return;
    }
  } catch (e) {
    clearSession();
    showView("login");
    setMsg("login-msg", "다시 로그인해 주세요.", "error");
    return;
  }
  showView("admin");
  loadProfile();
  loadCards();
  loadGuestbook();
}

// ===== 로그인 · 로그아웃 =====
async function login() {
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  if (!email || !password) {
    setMsg("login-msg", "이메일과 비밀번호를 모두 적어 주세요.", "error");
    return;
  }
  $("login-btn").disabled = true;
  setMsg("login-msg", "로그인하는 중…");
  try {
    await authRequest("password", { email, password });
    $("login-password").value = "";
    setMsg("login-msg", "");
    await start();
  } catch (e) {
    setMsg("login-msg", "이메일이나 비밀번호가 맞지 않아요.", "error");
  } finally {
    $("login-btn").disabled = false;
  }
}

function logout() {
  const token = session && session.access_token;
  if (token) {
    fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  clearSession();
  showView("login");
}

$("login-btn").addEventListener("click", login);
$("login-password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});
$("logout-btn").addEventListener("click", logout);

// ===== 프로필 =====
const PROFILE_FIELDS = [
  "name", "title", "career_badge", "email", "phone", "location",
  "headline", "intro", "education", "skills", "experience", "quote", "photo_url",
];

async function loadProfile() {
  try {
    const res = await rest("profile?select=*&id=eq.1");
    const p = (await res.json())[0] || {};
    PROFILE_FIELDS.forEach((f) => { $("p-" + f).value = p[f] || ""; });
    showPhoto($("p-photo-preview"), p.photo_url);
  } catch (e) {
    setMsg("p-msg", "프로필을 불러오지 못했어요: " + e.message, "error");
  }
}

$("p-photo-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("p-save").disabled = true;
  setMsg("p-msg", "사진을 올리는 중…");
  try {
    const url = await uploadFile("profile", file, IMAGE_TYPES);
    $("p-photo_url").value = url;
    showPhoto($("p-photo-preview"), url);
    setMsg("p-msg", "사진을 올렸어요. '프로필 저장'을 눌러야 방문자 화면에 반영돼요.", "ok");
  } catch (err) {
    setMsg("p-msg", err.message, "error");
  } finally {
    e.target.value = "";
    $("p-save").disabled = false;
  }
});

$("p-photo-clear").addEventListener("click", () => {
  $("p-photo_url").value = "";
  showPhoto($("p-photo-preview"), null);
  setMsg("p-msg", "사진을 뺐어요. '프로필 저장'을 눌러야 반영돼요.");
});

$("p-save").addEventListener("click", async () => {
  const data = { updated_at: new Date().toISOString() };
  PROFILE_FIELDS.forEach((f) => { data[f] = $("p-" + f).value.trim(); });
  data.photo_url = data.photo_url || null;

  $("p-save").disabled = true;
  setMsg("p-msg", "저장하는 중…");
  try {
    let rows = await restChanged("profile?id=eq.1", "PATCH", data);
    if (!rows.length) rows = await restChanged("profile", "POST", { id: 1, ...data });
    if (!rows.length) throw new Error("저장이 막혔어요 (관리자 권한 확인)");
    setMsg("p-msg", "저장했어요. 방문자 화면을 새로고침하면 보여요.", "ok");
  } catch (e) {
    setMsg("p-msg", "저장하지 못했어요: " + e.message, "error");
  } finally {
    $("p-save").disabled = false;
  }
});

// ===== 포트폴리오 카드 =====
let cards = [];          // 지금 목록 (순서대로)
let editingId = null;    // 고치는 카드의 id (새 카드면 null)
let uploading = 0;       // 올리는 중인 파일 수

async function countLikes(projectId) {
  const res = await rest(`likes?select=id&project_id=eq.${projectId}`, {
    method: "HEAD",
    headers: { Prefer: "count=exact" },
  });
  const total = parseInt((res.headers.get("Content-Range") || "").split("/")[1], 10);
  return Number.isFinite(total) ? total : 0;
}

async function loadCards() {
  try {
    const res = await rest("projects?select=*&order=sort_order.asc,id.asc");
    cards = await res.json();
    const counts = await Promise.all(cards.map((c) => countLikes(c.id).catch(() => 0)));
    cards.forEach((c, i) => { c.likes = counts[i]; });
    renderCards();
    if (!cards.length) setMsg("c-list-msg", "아직 카드가 없어요. '+ 카드 추가'를 눌러 보세요.");
  } catch (e) {
    setMsg("c-list-msg", "카드를 불러오지 못했어요: " + e.message, "error");
  }
}

function renderCards() {
  const list = $("c-list");
  list.textContent = "";
  cards.forEach((c, i) => {
    const li = makeEl("li", "admin-card");

    // 작은 썸네일 (방문자 화면과 같은 브라우저 창 모양)
    const thumb = makeEl("span", "thumb");
    const bar = makeEl("span", "thumb-bar");
    bar.append(makeEl("span"), makeEl("span"), makeEl("span"));
    const view = makeEl("span", "thumb-view");
    showPhoto(view, c.thumbnail_url);
    thumb.append(bar, view);

    const info = makeEl("div");
    info.append(
      makeEl("span", "card-meta", [c.number, c.category].filter(Boolean).join(" · ")),
      makeEl("span", "card-title", c.title),
      makeEl("span", "likes-count", `♥ 좋아요 ${c.likes}`)
    );

    const actions = makeEl("div", "actions");
    const up = makeButton("▲ 위로", "btn small", () => moveCard(i, -1));
    const down = makeButton("▼ 아래로", "btn small", () => moveCard(i, 1));
    up.disabled = i === 0;
    down.disabled = i === cards.length - 1;
    actions.append(
      up,
      down,
      makeButton("수정", "btn small", () => openEditor(c)),
      makeButton("좋아요 초기화", "btn small danger", () => resetLikes(c)),
      makeButton("삭제", "btn small danger", () => deleteCard(c))
    );

    li.append(thumb, info, actions);
    list.appendChild(li);
  });
}

// 순서 올리기·내리기: 바뀐 순서대로 sort_order를 1, 2, 3… 으로 다시 매긴다
async function moveCard(index, step) {
  const target = index + step;
  if (target < 0 || target >= cards.length) return;
  const reordered = cards.slice();
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  setMsg("c-list-msg", "순서를 바꾸는 중…");
  try {
    for (let i = 0; i < reordered.length; i++) {
      const c = reordered[i];
      if (c.sort_order !== i + 1) {
        const rows = await restChanged(`projects?id=eq.${c.id}`, "PATCH", { sort_order: i + 1 });
        if (!rows.length) throw new Error("바꾸기가 막혔어요 (관리자 권한 확인)");
        c.sort_order = i + 1;
      }
    }
    cards = reordered;
    renderCards();
    setMsg("c-list-msg", "순서를 바꿨어요.", "ok");
  } catch (e) {
    setMsg("c-list-msg", "순서를 바꾸지 못했어요: " + e.message, "error");
    loadCards();
  }
}

async function deleteCard(c) {
  if (!confirm(`'${c.title}' 카드를 지울까요?\n이 카드의 좋아요 기록도 함께 지워져요.`)) return;
  try {
    const rows = await restChanged(`projects?id=eq.${c.id}`, "DELETE");
    if (!rows.length) throw new Error("지우기가 막혔어요 (관리자 권한 확인)");
    if (editingId === c.id) closeEditor();
    setMsg("c-list-msg", "카드를 지웠어요.", "ok");
    loadCards();
  } catch (e) {
    setMsg("c-list-msg", "지우지 못했어요: " + e.message, "error");
  }
}

async function resetLikes(c) {
  if (!confirm(`'${c.title}' 카드의 좋아요 ${c.likes}개를 모두 지울까요?`)) return;
  try {
    await restChanged(`likes?project_id=eq.${c.id}`, "DELETE");
    const left = await countLikes(c.id);
    if (left > 0) throw new Error("초기화가 막혔어요 (관리자 권한 확인)");
    setMsg("c-list-msg", `'${c.title}' 좋아요를 초기화했어요.`, "ok");
    loadCards();
  } catch (e) {
    setMsg("c-list-msg", "초기화하지 못했어요: " + e.message, "error");
  }
}

// ----- 카드 추가·수정 폼 -----
const editorUrls = { thumbnail_url: null, file_url: null };

function showCurrent(kind) {
  const url = editorUrls[kind];
  const el = $(kind === "thumbnail_url" ? "c-thumb-current" : "c-file-current");
  el.textContent = "";
  if (url) {
    el.append("지금 파일: ");
    const a = makeEl("a", null, url.split("/").pop());
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    el.appendChild(a);
  } else {
    el.textContent = "아직 없어요.";
  }
}

function openEditor(c) {
  editingId = c ? c.id : null;
  $("c-editor-title").textContent = c ? `카드 수정: ${c.title}` : "카드 추가";
  $("c-number").value = c ? c.number : String(cards.length + 1).padStart(2, "0");
  $("c-category").value = c ? c.category : "";
  $("c-title").value = c ? c.title : "";
  $("c-description").value = c ? c.description : "";
  $("c-tags").value = c ? (c.tags || []).join(", ") : "";
  editorUrls.thumbnail_url = c ? c.thumbnail_url : null;
  editorUrls.file_url = c ? c.file_url : null;
  showCurrent("thumbnail_url");
  showCurrent("file_url");
  setMsg("c-msg", "");
  $("c-editor").hidden = false;
  $("c-editor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeEditor() {
  editingId = null;
  $("c-editor").hidden = true;
}

function setupCardUpload(inputId, kind, allowed) {
  $(inputId).addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    uploading++;
    $("c-save").disabled = true;
    setMsg("c-msg", "파일을 올리는 중…");
    try {
      editorUrls[kind] = await uploadFile("projects", file, allowed);
      showCurrent(kind);
      setMsg("c-msg", "파일을 올렸어요. '저장'을 눌러야 카드에 반영돼요.", "ok");
    } catch (err) {
      setMsg("c-msg", err.message, "error");
    } finally {
      e.target.value = "";
      uploading--;
      if (!uploading) $("c-save").disabled = false;
    }
  });
}

setupCardUpload("c-thumb-file", "thumbnail_url", IMAGE_TYPES);
setupCardUpload("c-file-file", "file_url", FILE_TYPES);

$("c-thumb-clear").addEventListener("click", () => {
  editorUrls.thumbnail_url = null;
  showCurrent("thumbnail_url");
});
$("c-file-clear").addEventListener("click", () => {
  editorUrls.file_url = null;
  showCurrent("file_url");
});

$("c-new").addEventListener("click", () => openEditor(null));
$("c-cancel").addEventListener("click", closeEditor);

$("c-save").addEventListener("click", async () => {
  const title = $("c-title").value.trim();
  if (!title) {
    setMsg("c-msg", "제목을 적어 주세요.", "error");
    return;
  }
  const data = {
    number: $("c-number").value.trim(),
    category: $("c-category").value.trim(),
    title,
    description: $("c-description").value.trim(),
    tags: $("c-tags").value.split(",").map((t) => t.trim()).filter(Boolean),
    thumbnail_url: editorUrls.thumbnail_url,
    file_url: editorUrls.file_url,
  };

  $("c-save").disabled = true;
  setMsg("c-msg", "저장하는 중…");
  try {
    let rows;
    if (editingId) {
      rows = await restChanged(`projects?id=eq.${editingId}`, "PATCH", data);
    } else {
      // 새 카드는 맨 뒤 순서로
      const last = cards.reduce((m, c) => Math.max(m, c.sort_order), 0);
      rows = await restChanged("projects", "POST", { ...data, sort_order: last + 1 });
    }
    if (!rows.length) throw new Error("저장이 막혔어요 (관리자 권한 확인)");
    closeEditor();
    setMsg("c-list-msg", "카드를 저장했어요. 방문자 화면을 새로고침하면 보여요.", "ok");
    loadCards();
  } catch (e) {
    setMsg("c-msg", "저장하지 못했어요: " + e.message, "error");
  } finally {
    $("c-save").disabled = false;
  }
});

// ===== 방명록 =====
async function loadGuestbook() {
  const list = $("g-list");
  try {
    const res = await rest("resume_guestbook?select=*&order=created_at.desc&limit=500");
    const rows = await res.json();
    list.textContent = "";
    setMsg("g-msg", rows.length ? `모두 ${rows.length}개` : "아직 방명록 글이 없어요.");
    rows.forEach((row) => {
      const li = document.createElement("li");
      const head = makeEl("div", "gb-head");
      const left = makeEl("span");
      left.append(
        makeEl("span", "gb-nick", row.nickname),
        " ",
        makeEl("span", "gb-date", formatDate(row.created_at))
      );
      head.append(left, makeButton("삭제", "btn small danger", () => deleteEntry(row)));
      li.append(head, makeEl("p", "gb-msg", row.message));
      list.appendChild(li);
    });
  } catch (e) {
    setMsg("g-msg", "방명록을 불러오지 못했어요: " + e.message, "error");
  }
}

async function deleteEntry(row) {
  if (!confirm(`${row.nickname} 님의 글을 지울까요?\n"${row.message}"`)) return;
  try {
    const rows = await restChanged(`resume_guestbook?id=eq.${row.id}`, "DELETE");
    if (!rows.length) throw new Error("지우기가 막혔어요 (관리자 권한 확인)");
    loadGuestbook();
  } catch (e) {
    setMsg("g-msg", "지우지 못했어요: " + e.message, "error");
  }
}

// ===== 시작 =====
start();
