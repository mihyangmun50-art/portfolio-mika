// ===== Supabase 연결 정보 (공개 키만 사용) =====
const SUPABASE_URL = "https://rhxffukfmkahjycygbxf.supabase.co";
const SUPABASE_KEY = "sb_publishable_n9rFqjokGStw_t4_VaMLBQ_WWKiFWTq";

const HEART_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.3C1 8 3.5 4 7.3 4c2 0 3.6 1.1 4.7 2.7C13.1 5.1 14.7 4 16.7 4 20.5 4 23 8 21.5 11.7 19.5 16.4 12 21 12 21z"/></svg>';

// ===== Supabase 부르기 =====
async function api(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = new Error(`Supabase 오류 ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

// ===== 이 브라우저의 번호(client_id)와 좋아요 기록 =====
function getClientId() {
  let id = null;
  try { id = localStorage.getItem("resume_client_id"); } catch (e) {}
  if (!id) {
    id = crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    try { localStorage.setItem("resume_client_id", id); } catch (e) {}
  }
  return id;
}

function getLikedIds() {
  try {
    return JSON.parse(localStorage.getItem("resume_liked") || "[]");
  } catch (e) {
    return [];
  }
}

function saveLikedId(projectId) {
  const ids = getLikedIds();
  if (!ids.includes(projectId)) ids.push(projectId);
  try { localStorage.setItem("resume_liked", JSON.stringify(ids)); } catch (e) {}
}

// http:// 또는 https:// 로 시작하는 주소만 사용한다
function safeUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
}

function setText(id, value) {
  document.getElementById(id).textContent = value || "";
}

// ===== 프로필 =====
async function loadProfile() {
  const res = await api("profile?select=*&id=eq.1");
  const rows = await res.json();
  const p = rows[0];
  if (!p) return;

  setText("profile-name", p.name);
  setText("profile-title", p.title);
  setText("contact-name", p.name);
  setText("contact-location", p.location);
  setText("profile-intro", p.intro);
  setText("profile-education", p.education);
  setText("profile-skills", p.skills);
  setText("profile-experience", p.experience);
  setText("profile-quote", p.quote);

  const badge = document.getElementById("profile-badge");
  badge.textContent = p.career_badge || "";
  badge.hidden = !p.career_badge;

  const email = document.getElementById("contact-email");
  email.textContent = p.email || "";
  if (p.email) email.href = "mailto:" + p.email;

  const phone = document.getElementById("contact-phone");
  phone.textContent = p.phone || "";
  if (p.phone) phone.href = "tel:" + p.phone.replace(/[^0-9+]/g, "");

  // 사진: 있으면 넣고, 없으면 회색 자리 그대로
  const photo = document.getElementById("profile-photo");
  photo.textContent = "";
  const photoUrl = safeUrl(p.photo_url);
  if (photoUrl) {
    const img = document.createElement("img");
    img.src = photoUrl;
    img.alt = (p.name || "") + " 프로필 사진";
    photo.appendChild(img);
  }

  // 한 줄 소개: 이름 부분에만 파란 밑줄
  const headline = document.getElementById("profile-headline");
  headline.textContent = "";
  const text = p.headline || "";
  const at = p.name ? text.indexOf(p.name) : -1;
  if (at >= 0) {
    const mark = document.createElement("span");
    mark.className = "hl-name";
    mark.textContent = p.name;
    headline.append(text.slice(0, at), mark, text.slice(at + p.name.length));
  } else {
    headline.textContent = text;
  }

  if (p.name) document.title = p.name + " | 포트폴리오";
}

// ===== 포트폴리오 카드 =====
async function countLikes(projectId) {
  const res = await api(`likes?select=id&project_id=eq.${projectId}`, {
    method: "HEAD",
    headers: { Prefer: "count=exact" },
  });
  // Content-Range 예: "*/12" → 12
  const range = res.headers.get("Content-Range") || "";
  const total = parseInt(range.split("/")[1], 10);
  return Number.isFinite(total) ? total : 0;
}

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function buildCard(project, likeCount, likedIds) {
  const card = makeEl("article", "card");

  // 카드 본문(누르면 파일이나 이미지가 새 탭에서 열림)
  const openUrl = safeUrl(project.file_url) || safeUrl(project.thumbnail_url);
  const open = makeEl("button", "card-open");
  open.type = "button";
  if (openUrl) {
    open.addEventListener("click", () => {
      window.open(openUrl, "_blank", "noopener");
    });
  } else {
    open.disabled = true;
  }

  // 브라우저 창 모양 썸네일
  const thumb = makeEl("span", "thumb");
  const bar = makeEl("span", "thumb-bar");
  bar.append(makeEl("span"), makeEl("span"), makeEl("span"));
  const view = makeEl("span", "thumb-view");
  const thumbUrl = safeUrl(project.thumbnail_url);
  if (thumbUrl) {
    const img = document.createElement("img");
    img.src = thumbUrl;
    img.alt = "";
    img.loading = "lazy";
    view.appendChild(img);
  }
  thumb.append(bar, view);

  const body = makeEl("span", "card-body");
  const meta = [project.number, project.category].filter(Boolean).join(" · ");
  body.append(
    makeEl("span", "card-meta", meta),
    makeEl("span", "card-title", project.title),
    makeEl("span", "card-desc", project.description)
  );
  if (project.tags && project.tags.length) {
    const tags = makeEl("span", "card-tags");
    project.tags.forEach((t) => tags.appendChild(makeEl("span", "tag", t)));
    body.appendChild(tags);
  }

  open.append(thumb, body);

  // 좋아요 버튼
  const foot = makeEl("div", "card-foot");
  const like = makeEl("button", "like");
  like.type = "button";
  like.innerHTML = HEART_SVG;
  const num = makeEl("span", "like-num", String(likeCount));
  like.appendChild(num);
  like.setAttribute("aria-label", "좋아요");

  if (likedIds.includes(project.id)) {
    like.classList.add("liked");
    like.setAttribute("aria-pressed", "true");
  }

  like.addEventListener("click", async () => {
    if (like.classList.contains("liked") || like.disabled) return;
    like.disabled = true;
    try {
      await api("likes", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ project_id: project.id, client_id: getClientId() }),
      });
      num.textContent = String(Number(num.textContent) + 1);
    } catch (e) {
      // 409 = 이 브라우저가 이미 누른 카드 (숫자는 그대로)
      if (e.status !== 409) {
        like.disabled = false;
        alert("좋아요를 남기지 못했어요. 잠시 뒤 다시 눌러 주세요.");
        return;
      }
    }
    saveLikedId(project.id);
    like.classList.add("liked");
    like.setAttribute("aria-pressed", "true");
    like.disabled = false;
  });

  foot.appendChild(like);
  card.append(open, foot);
  return card;
}

async function loadProjects() {
  const box = document.getElementById("cards");
  const res = await api("projects?select=*&order=sort_order.asc,id.asc");
  const projects = await res.json();

  if (!projects.length) {
    box.innerHTML = '<p class="empty">아직 등록된 포트폴리오가 없어요.</p>';
    return;
  }

  const counts = await Promise.all(
    projects.map((p) => countLikes(p.id).catch(() => 0))
  );
  const likedIds = getLikedIds();

  box.textContent = "";
  projects.forEach((p, i) => box.appendChild(buildCard(p, counts[i], likedIds)));
}

// ===== 방명록 =====
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildEntry(row) {
  const li = document.createElement("li");
  const head = makeEl("div", "gb-head");
  head.append(
    makeEl("span", "gb-nick", row.nickname),
    makeEl("span", "gb-date", formatDate(row.created_at))
  );
  li.append(head, makeEl("p", "gb-msg", row.message));
  return li;
}

async function loadGuestbook() {
  const list = document.getElementById("gb-list");
  const res = await api("resume_guestbook?select=*&order=created_at.desc&limit=100");
  const rows = await res.json();
  list.textContent = "";
  if (!rows.length) {
    list.appendChild(makeEl("li", "empty", "첫 번째 한마디를 남겨 주세요."));
    return;
  }
  rows.forEach((row) => list.appendChild(buildEntry(row)));
}

async function submitGuestbook() {
  const nickInput = document.getElementById("gb-nickname");
  const msgInput = document.getElementById("gb-message");
  const button = document.getElementById("gb-submit");
  const status = document.getElementById("gb-status");

  const nickname = nickInput.value.trim();
  const message = msgInput.value.trim();
  if (!nickname || !message) {
    status.textContent = "별명과 한마디를 모두 적어 주세요.";
    return;
  }

  button.disabled = true;
  status.textContent = "남기는 중…";
  try {
    const res = await api("resume_guestbook", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ nickname, message }),
    });
    const [row] = await res.json();

    const list = document.getElementById("gb-list");
    const placeholder = list.querySelector(".empty");
    if (placeholder) placeholder.remove();
    list.prepend(buildEntry(row));   // 목록 맨 위에 나타남

    msgInput.value = "";
    status.textContent = "고마워요! 한마디가 남겨졌어요.";
  } catch (e) {
    status.textContent = "남기지 못했어요. 잠시 뒤 다시 시도해 주세요.";
  } finally {
    button.disabled = false;
  }
}

document.getElementById("gb-submit").addEventListener("click", submitGuestbook);
document.getElementById("gb-form").addEventListener("submit", (e) => {
  e.preventDefault();   // 입력칸에서 Enter를 눌러도 새로고침되지 않게
  submitGuestbook();
});

// ===== 시작 =====
loadProfile().catch(() => {
  setText("profile-headline", "프로필을 불러오지 못했어요.");
});
loadProjects().catch(() => {
  document.getElementById("cards").innerHTML =
    '<p class="empty">포트폴리오를 불러오지 못했어요.</p>';
});
loadGuestbook().catch(() => {
  const list = document.getElementById("gb-list");
  list.textContent = "";
  list.appendChild(makeEl("li", "empty", "방명록을 불러오지 못했어요."));
});
