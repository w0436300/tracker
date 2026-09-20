
(() => {
  const cfg = window.JOBTRACKER_CONFIG || {};
  const APPLIED_KEY = "jt_applied";
  let jobs = [];
  let activeStatus = "all";
  let appliedIds = new Set();
  let clearedIds = new Set();
  let lastMeta = {};

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = (v) => String(v ?? "").toLowerCase();
  const priorities = ["markham","richmond hill","north york","vaughan"];

  function jobId(j){
    return [j["Company"], j["Job Title"], j["Application Link"] || ""].map(v => String(v ?? "").trim()).join("||");
  }

  function loadAppliedState(){
    try{
      const raw = JSON.parse(localStorage.getItem(APPLIED_KEY) || "{}");
      const list = Array.isArray(raw) ? raw : (raw.applied || []);
      const cleared = Array.isArray(raw) ? [] : (raw.cleared || []);
      appliedIds = new Set(list.map(String));
      clearedIds = new Set(cleared.map(String));
    }catch{
      appliedIds = new Set();
      clearedIds = new Set();
    }
  }

  function saveAppliedState(){
    localStorage.setItem(APPLIED_KEY, JSON.stringify({
      applied: [...appliedIds],
      cleared: [...clearedIds]
    }));
  }

  function isApplied(j){
    const id = jobId(j);
    if(clearedIds.has(id)) return false;
    if(appliedIds.has(id)) return true;
    return normalize(j["Application Status"]) === "applied";
  }

  function setApplied(j, value){
    const id = jobId(j);
    if(value){
      appliedIds.add(id);
      clearedIds.delete(id);
      j["Application Status"] = "Applied";
      if(!j["Application Date"]) j["Application Date"] = new Date().toISOString().slice(0,10);
    }else{
      appliedIds.delete(id);
      clearedIds.add(id);
      j["Application Status"] = "Not Applied";
    }
    saveAppliedState();
  }

  async function sha256(text){
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
  }

  function isAuthed(){
    return Number(localStorage.getItem("jt_auth_until") || 0) > Date.now();
  }

  function setAuthed(){
    const hours = Number(cfg.sessionHours || 12);
    localStorage.setItem("jt_auth_until", String(Date.now() + hours * 3600 * 1000));
  }

  function showApp(){
    $("loginScreen").classList.add("is-hidden");
    $("app").classList.remove("is-hidden");
    initData();
  }

  function showLogin(){
    $("app").classList.add("is-hidden");
    $("loginScreen").classList.remove("is-hidden");
    $("passwordInput").focus();
  }

  function setupAuth(){
    $("loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      $("loginError").textContent = "";
      const value = $("passwordInput").value;
      const digest = await sha256(value);
      if (digest === cfg.passwordHash){
        setAuthed();
        $("passwordInput").value = "";
        showApp();
      } else {
        $("loginError").textContent = "Incorrect password.";
      }
    });
    $("togglePassword").addEventListener("click", () => {
      const input = $("passwordInput");
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      $("togglePassword").textContent = visible ? "Show" : "Hide";
    });
    $("logoutBtn").addEventListener("click", () => {
      localStorage.removeItem("jt_auth_until");
      location.reload();
    });
  }

  async function initData(){
    try{
      loadAppliedState();
      const res = await fetch(`./data/jobs.json?v=${Date.now()}`);
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      jobs = payload.jobs || [];
      lastMeta = payload.meta || {};
      renderMeta(lastMeta);
      populateFilters();
      wireControls();
      render();
    }catch(err){
      console.error(err);
      $("jobList").innerHTML = `<div class="empty-state"><h3>Could not load job data.</h3><p>Check that <code>data/jobs.json</code> exists.</p></div>`;
    }
  }

  function renderMeta(meta = lastMeta){
    const raw = meta.lastUpdated;
    let label = "Updated —";
    if(raw){
      const d = new Date(raw);
      if(!Number.isNaN(d.getTime())){
        label = `Updated ${new Intl.DateTimeFormat("en-CA",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(d)}`;
      }
    }
    $("updatedAt").textContent = label;

    const open = jobs.filter(j => normalize(j["Job Status"]) === "open" && !isApplied(j)).length;
    const fresh = jobs.filter(j => normalize(j["New This Run"]) === "yes").length;
    const applied = jobs.filter(j => isApplied(j)).length;
    const priorityOpen = jobs.filter(j => normalize(j["Job Status"]) === "open" && !isApplied(j) && isPriorityLocation(j["Location"])).length;
    $("statOpen").textContent = open;
    $("statNew").textContent = fresh;
    $("statApplied").textContent = applied;
    $("statPriority").textContent = priorityOpen;

    const counts = {};
    (meta.priorityLocations || ["Markham","Richmond Hill","North York","Vaughan"]).forEach(loc => {
      counts[loc] = jobs.filter(j => normalize(j["Location"]).includes(normalize(loc)) && normalize(j["Job Status"]) === "open" && !isApplied(j)).length;
    });
    $("priorityLocationChips").innerHTML = Object.entries(counts)
      .map(([loc,count]) => `<button class="chip location-chip" data-location="${esc(loc)}">${esc(loc)} <strong>${count}</strong></button>`)
      .join("");
    document.querySelectorAll(".location-chip").forEach(btn => btn.addEventListener("click", () => {
      $("locationFilter").value = btn.dataset.location;
      render();
      document.getElementById("jobsSection").scrollIntoView({behavior:"smooth"});
    }));
  }

  function populateFilters(){
    const tracks = [...new Set(jobs.map(j => j["Track"]).filter(Boolean))].sort();
    $("trackFilter").innerHTML = `<option value="all">All tracks</option>` + tracks.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
    const sources = [...new Set(jobs.map(j => j["Source Type"]).filter(Boolean))].sort();
    $("sourceFilter").innerHTML = `<option value="all">All sources</option>` + sources.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  }

  function wireControls(){
    ["searchInput","locationFilter","trackFilter","sourceFilter","sortFilter"].forEach(id => {
      const el = $(id);
      if(!el.dataset.bound){
        el.addEventListener(id === "searchInput" ? "input" : "change", render);
        el.dataset.bound = "1";
      }
    });
    document.querySelectorAll(".segment").forEach(btn => {
      if(!btn.dataset.bound){
        btn.addEventListener("click", () => {
          activeStatus = btn.dataset.status;
          document.querySelectorAll(".segment").forEach(b => b.classList.toggle("is-active", b === btn));
          render();
        });
        btn.dataset.bound = "1";
      }
    });
    if(!$("closeDrawer").dataset.bound){
      $("closeDrawer").addEventListener("click", closeDrawer);
      $("drawerBackdrop").addEventListener("click", closeDrawer);
      document.addEventListener("keydown", e => { if(e.key === "Escape") closeDrawer(); });
      $("closeDrawer").dataset.bound = "1";
    }
  }

  function isPriorityLocation(location){
    const value = normalize(location);
    return priorities.some(p => value.includes(p));
  }

  function filterStatus(j){
    const status = normalize(j["Job Status"]);
    const applied = isApplied(j);
    const fresh = normalize(j["New This Run"]) === "yes";
    if(activeStatus === "all") return true;
    if(activeStatus === "new") return fresh;
    if(activeStatus === "open") return status === "open" && !applied;
    if(activeStatus === "applied") return applied;
    if(activeStatus === "closed") return status.includes("closed") || status.includes("expired") || status.includes("conflicting");
    return true;
  }

  function deadlineTime(value){
    if(!value) return Infinity;
    const t = new Date(`${value}T23:59:59`).getTime();
    return Number.isNaN(t) ? Infinity : t;
  }

  function filteredJobs(){
    const q = normalize($("searchInput").value).trim();
    const loc = $("locationFilter").value;
    const track = $("trackFilter").value;
    const source = $("sourceFilter").value;
    const sort = $("sortFilter").value;

    let list = jobs.filter(j => {
      if(!filterStatus(j)) return false;
      if(q){
        const hay = normalize([
          j["Company"], j["Job Title"], j["Track"], j["Company Type"], j["Location"],
          j["Experience Requirement"], j["Core Requirements"], j["Notes"], j["Source Type"]
        ].join(" "));
        if(!hay.includes(q)) return false;
      }
      if(loc === "priority" && !isPriorityLocation(j["Location"])) return false;
      if(!["all","priority"].includes(loc) && !normalize(j["Location"]).includes(normalize(loc))) return false;
      if(track !== "all" && j["Track"] !== track) return false;
      if(source !== "all" && j["Source Type"] !== source) return false;
      return true;
    });

    list.sort((a,b) => {
      if(sort === "match") return Number(b["Match %"]||0) - Number(a["Match %"]||0);
      if(sort === "newest") return String(b["Date Checked"]||"").localeCompare(String(a["Date Checked"]||""));
      if(sort === "deadline") return deadlineTime(a["Deadline"]) - deadlineTime(b["Deadline"]);
      // priority: new > priority-area open > open > applied > closed, then match
      const rank = j => {
        if(normalize(j["New This Run"]) === "yes") return 0;
        if(normalize(j["Job Status"]) === "open" && !isApplied(j) && isPriorityLocation(j["Location"])) return 1;
        if(normalize(j["Job Status"]) === "open" && !isApplied(j)) return 2;
        if(isApplied(j)) return 3;
        return 4;
      };
      return rank(a)-rank(b) || Number(b["Match %"]||0)-Number(a["Match %"]||0);
    });
    return list;
  }

  function sourceBadgeClass(source){
    const s = normalize(source);
    if(s.includes("official")) return "official";
    if(s.includes("vendor")) return "vendor";
    return "";
  }

  function badge(label, cls=""){
    return `<span class="badge ${cls}">${esc(label)}</span>`;
  }

  function statusBadges(j){
    const bits = [];
    if(normalize(j["New This Run"]) === "yes") bits.push(badge("New","new"));
    if(isPriorityLocation(j["Location"])) bits.push(badge("Priority location","priority"));
    if(isApplied(j)) bits.push(badge("Applied","applied"));
    const st = String(j["Job Status"]||"");
    if(normalize(st) !== "open") bits.push(badge(st,"closed"));
    const source = String(j["Source Type"]||"");
    if(source) bits.push(badge(source, sourceBadgeClass(source)));
    return bits.join("");
  }

  function appliedToggleMarkup(j, variant="card"){
    const on = isApplied(j);
    const label = on ? "Applied" : "Mark applied";
    return `<button type="button" class="applied-toggle ${variant} ${on?"is-on":""}" data-applied-toggle="1" aria-pressed="${on}" title="${esc(label)}">
      <span class="applied-check" aria-hidden="true">${on ? "✓" : ""}</span>
      <span>${esc(label)}</span>
    </button>`;
  }

  function refreshAfterAppliedChange(j){
    renderMeta();
    render();
    if($("jobDrawer").classList.contains("is-open")) openDrawer(j);
  }

  function render(){
    const list = filteredJobs();
    $("resultCount").textContent = `${list.length} role${list.length===1?"":"s"}`;
    $("emptyState").classList.toggle("is-hidden", list.length > 0);
    $("jobList").innerHTML = list.map(j => `
      <article class="job-card ${isApplied(j)?"is-applied":""}" data-index="${jobs.indexOf(j)}" tabindex="0">
        <div class="job-main">
          <div class="job-title-row"><div class="job-title">${esc(j["Job Title"])}</div></div>
          <div class="company">${esc(j["Company"])}</div>
          <div class="badges">${statusBadges(j)}</div>
        </div>
        <div class="location-col">
          <div class="meta-line">${esc(j["Location"] || "—")}</div>
          <div class="meta-line">${esc(j["Work Mode"] || "—")}</div>
        </div>
        <div class="salary-col">
          <div class="salary">${esc(j["Salary"] || "Not disclosed")}</div>
          <div class="meta-line">${esc(j["Experience Requirement"] || "")}</div>
        </div>
        <div class="match-col"><span class="match">${esc(j["Match %"] ?? "—")}%</span></div>
        <div class="applied-col">${appliedToggleMarkup(j,"card")}</div>
        <div class="chevron">›</div>
      </article>
    `).join("");

    document.querySelectorAll(".job-card").forEach(card => {
      const j = jobs[Number(card.dataset.index)];
      const open = () => openDrawer(j);
      card.addEventListener("click", open);
      card.addEventListener("keydown", e => { if(e.key==="Enter" || e.key===" "){ e.preventDefault(); open(); }});
      const toggle = card.querySelector("[data-applied-toggle]");
      if(toggle){
        toggle.addEventListener("click", e => {
          e.preventDefault();
          e.stopPropagation();
          setApplied(j, !isApplied(j));
          refreshAfterAppliedChange(j);
        });
      }
    });
  }

  function detailBox(label,value){
    if(value == null || value === "") return "";
    return `<div class="detail-box"><div class="detail-label">${esc(label)}</div><div class="detail-value">${esc(value)}</div></div>`;
  }

  function detailSection(label,value){
    if(value == null || value === "") return "";
    return `<section class="detail-section"><h4>${esc(label)}</h4><p>${esc(value)}</p></section>`;
  }

  function openDrawer(j){
    $("drawerMatch").textContent = `${j["Match %"] ?? "—"}% match`;
    $("drawerContent").innerHTML = `
      <p class="eyebrow">${esc(j["Track"] || "ROLE")}</p>
      <h2 class="drawer-title">${esc(j["Job Title"])}</h2>
      <div class="drawer-company">${esc(j["Company"])}</div>
      <div class="drawer-badges">${statusBadges(j)}</div>

      <div class="drawer-actions">
        ${appliedToggleMarkup(j,"drawer")}
        ${j["Application Link"] ? `<a class="drawer-apply" href="${esc(j["Application Link"])}" target="_blank" rel="noopener noreferrer"><span>Open application</span><span>↗</span></a>` : ""}
      </div>

      <div class="detail-grid">
        ${detailBox("Location",j["Location"])}
        ${detailBox("Work mode",j["Work Mode"])}
        ${detailBox("Salary",j["Salary"])}
        ${detailBox("Deadline",j["Deadline"] || "Not listed")}
        ${detailBox("Experience",j["Experience Requirement"])}
        ${detailBox("Company type",j["Company Type"])}
        ${detailBox("Application date", isApplied(j) ? (j["Application Date"] || "Marked locally") : "")}
      </div>

      ${detailSection("Core requirements",j["Core Requirements"])}
      ${detailSection("Main risks",j["Main Risks"])}
      ${detailSection("Notes",j["Notes"])}
      ${detailSection("Source",j["Source Type"])}
    `;
    const toggle = $("drawerContent").querySelector("[data-applied-toggle]");
    if(toggle){
      toggle.addEventListener("click", e => {
        e.preventDefault();
        setApplied(j, !isApplied(j));
        refreshAfterAppliedChange(j);
      });
    }
    $("drawerBackdrop").classList.remove("is-hidden");
    $("jobDrawer").classList.add("is-open");
    $("jobDrawer").setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";
  }

  function closeDrawer(){
    $("drawerBackdrop").classList.add("is-hidden");
    $("jobDrawer").classList.remove("is-open");
    $("jobDrawer").setAttribute("aria-hidden","true");
    document.body.style.overflow = "";
  }

  setupAuth();
  if(isAuthed()) showApp(); else showLogin();
})();
