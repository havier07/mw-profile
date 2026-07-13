const PROXY_URL = "https://mw-proxy.havier07.workers.dev/?uid=";

const $ = document.querySelector.bind(document);

const utils = {
    fetchFast: async (fullUrl) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 10000);
        try {
            const res = await fetch(fullUrl, { signal: controller.signal });
            clearTimeout(id);

            const rawText = await res.text();
            let json;
            try { json = JSON.parse(rawText); } catch (e) {
                throw new Error("Lỗi đường truyền hoặc Proxy bị sập");
            }
            if (!json.success) throw new Error(json.error || "Máy chủ Game từ chối kết nối");
            return json;
        } catch (e) {
            clearTimeout(id);
            if (e.name === "AbortError") throw new Error("Máy chủ Mini World phản hồi quá chậm (Timeout 10s)");
            throw e;
        }
    },
    copy: (txt) => {
        const t = document.createElement("textarea");
        t.value = txt; t.style.position = "fixed"; t.style.left = "-9999px";
        document.body.appendChild(t); t.focus(); t.select();
        try {
            document.execCommand("copy") ? app.toast(`Đã sao chép`, "success") : app.toast("Lỗi sao chép", "error");
        } catch (e) { app.toast("Lỗi quyền", "error"); }
        document.body.removeChild(t);
    },
    escapeAttr: (t) => String(t).replace(/"/g, "&quot;").replace(/\n/g, "&#10;")
};

const app = {
    data: {}, photos: {}, history: JSON.parse(localStorage.getItem("mw_h") || "[]"),
    curId: null, viewerLines: [], curMode: "JSON",

    currentUids: [], 
    refreshTimer: null,

    init() {
        this.renderHist();
        $("#search-input").addEventListener("focus", () => this.history.length && $("#history-box").classList.remove("hidden"));
        document.addEventListener("click", (e) => !e.target.closest("#search-input") && !e.target.closest("#history-box") && $("#history-box").classList.add("hidden"));
        $("#search-input").addEventListener("keydown", (e) => e.key === "Enter" && this.search());
        
        const p = new URLSearchParams(location.search).get("uid");
        if (p) { $("#search-input").value = p; this.search(); }
        bgAnim.start();

        const tipEl = document.getElementById("global-tooltip");
        document.addEventListener("mouseover", (e) => {
            const item = e.target.closest("[data-tip]");
            if (item && tipEl) {
                tipEl.innerText = item.getAttribute("data-tip");
                tipEl.classList.remove("opacity-0");
            }
        });
        document.addEventListener("mousemove", (e) => {
            if (tipEl && !tipEl.classList.contains("opacity-0")) {
                tipEl.style.transform = `translate(${e.clientX + 15}px, ${e.clientY + 15}px)`;
            }
        });
        document.addEventListener("mouseout", (e) => {
            const item = e.target.closest("[data-tip]");
            if (item && tipEl) tipEl.classList.add("opacity-0");
        });

        $("#search-input").addEventListener("input", (e) => {
            const val = e.target.value.trim();
            if (/^\d{7,10}$/.test(val)) fetch(PROXY_URL + val).catch(() => { }); 
        });
    },

    renderData(dataList, isSilent = false) {
        $("#content-area").innerHTML = "";
        dataList.forEach((d) => {
            this.card(d, isSilent);
            
            // Nếu chỉ là làm mới ngầm thì không cần đẩy lại vào lịch sử
            if (!isSilent) this.addHist(d.uid, d.nameRaw);
        });
    },

    async search(val) {
        const inp = $("#search-input");
        const btn = inp.nextElementSibling;
        let raw = val || inp.value.trim();
        let uids = raw.split(/[,\s]+/).map((s) => {
            s = s.trim();
            if (!/^\d+$/.test(s)) return null;
            return s.length < 10 ? String(Number(s) + 1000000000) : s;
        }).filter(Boolean);

        if (!uids.length) return this.toast("UID không hợp lệ", "error");

        // 3. XÓA BỘ ĐẾM CŨ (nếu có) khi người dùng chủ động tìm UID mới
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.currentUids = uids; // Lưu lại UID đang xem

        const cacheKey = "mw_cache_" + uids.join("_");
        const cachedData = localStorage.getItem(cacheKey);

        $("#history-box").classList.add("hidden");

        if (cachedData) {
            try { this.renderData(JSON.parse(cachedData), false); } catch (e) { }
        } else {
            $("#content-area").innerHTML = this.skeleton(uids.length);
        }

        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
        btn.disabled = true;

        try {
            const url = PROXY_URL + uids.join(",");
            const response = await utils.fetchFast(url);

            if (!response.uiData || !response.uiData.length) throw new Error("Không tìm thấy dữ liệu");

            this.data = {};
            Object.values(response.rawJson).forEach((p) => {
                const d = p.profile || p;
                if (d.uin) this.data[d.uin] = d;
            });

            localStorage.setItem(cacheKey, JSON.stringify(response.uiData));
            this.renderData(response.uiData, false);
            
            // 4. KÍCH HOẠT LÀM MỚI TỰ ĐỘNG SAU KHI TRA CỨU THÀNH CÔNG (30000ms = 30s)
            this.refreshTimer = setInterval(() => this.silentRefresh(), 30000);

        } catch (e) {
            if (!cachedData) $("#content-area").innerHTML = `<div class="text-center py-10 text-slate-400 animate-enter"><i class="fa-solid fa-server text-4xl mb-2 text-red-400"></i><br><span class="font-bold text-red-300">LỖI:</span> ${e.message}</div>`;
            this.toast(e.message, "error");
        } finally {
            btn.innerHTML = "TRA CỨU";
            btn.disabled = false;
        }
    },

    async silentRefresh() {
        if (!this.currentUids || !this.currentUids.length) return;
        try {
            const url = PROXY_URL + this.currentUids.join(",");
            // Vẫn dùng fetchFast nhưng không thèm xử lý nếu bắt được lỗi (để im re)
            const response = await utils.fetchFast(url);

            if (!response.uiData || !response.uiData.length) return;

            this.data = {};
            Object.values(response.rawJson).forEach((p) => {
                const d = p.profile || p;
                if (d.uin) this.data[d.uin] = d;
            });

            const cacheKey = "mw_cache_" + this.currentUids.join("_");
            localStorage.setItem(cacheKey, JSON.stringify(response.uiData));

            // Gọi render nhưng báo cho hệ thống biết "Đây là render ngầm (isSilent = true)"
            this.renderData(response.uiData, true);
        } catch (e) {
            // Không làm gì cả. Đang làm mới ngầm mà mất mạng thì cứ kệ, giữ nguyên giao diện cũ
        }
    },

    card(d, isSilent = false) {
        const uid = d.uid;
        this.photos[uid] = d.photos || [];

        const card = document.createElement("div");
        
        // CHÌA KHÓA NẰM Ở ĐÂY: Xóa đuôi "animate-enter" nếu là isSilent, tránh việc thẻ bị nhảy từ dưới lên mỗi 30s
        card.className = `glass-panel rounded-3xl p-6 relative overflow-hidden transition-all border-t border-white/10 group hover:shadow-sky-500/10 hover:shadow-2xl ${isSilent ? '' : 'animate-enter'}`;
        
        const isNu = String(d.gender).includes('venus');
        const bg = isNu ? "from-pink-500/10 via-purple-500/5 to-rose-500/10" : "from-sky-500/10 via-blue-500/5 to-cyan-500/10";

        let bioContent;
        if (!d.moodH) {
            if (!d.moodIcon || String(d.moodIcon).trim() === "" || d.moodIcon === "A100") {
                bioContent = '<p class="text-slate-500 italic opacity-50 font-medium text-base">Chưa thiết lập</p>';
            } else {
                bioContent = `<div class="flex gap-4 items-start"><div class="text-sky-400 font-mono font-bold text-lg border-r border-white/10 pr-4 pt-1">#${d.moodIcon}</div><div class="text-slate-500 italic opacity-50 font-medium text-base flex-grow">Chưa thiết lập</div></div>`;
            }
        } else if (d.moodIcon && String(d.moodIcon).trim() !== "" && d.moodIcon !== "A100") {
            bioContent = `<div class="flex gap-4 items-start"><div class="text-sky-400 font-mono font-bold text-lg border-r border-white/10 pr-4 pt-1">#${d.moodIcon}</div><div class="text-slate-200 leading-relaxed font-medium text-base whitespace-pre-wrap flex-grow">${d.moodH}</div></div>`;
        } else {
            bioContent = `<p class="text-slate-200 leading-relaxed font-medium text-base whitespace-pre-wrap">${d.moodH}</p>`;
        }

        const box = "bg-white/5 rounded-2xl p-4 border border-white/10 flex flex-col justify-between hover:bg-white/10 transition active:scale-95";
        const row = "text-sm flex justify-between items-center py-0.5";
        const lbl = "text-slate-400";
        const val = "text-white font-medium truncate ml-2";

        card.innerHTML = `
            <div class="absolute inset-0 bg-gradient-to-br ${bg} -z-10"></div>
            <div class="flex gap-2 z-20 justify-end md:absolute md:top-4 md:right-4 mb-6 md:mb-0">
                <button onclick="app.share('${uid}')" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition" title="Share"><i class="fa-solid fa-share-nodes"></i></button>
                <button onclick="app.openApi('${uid}')" class="px-3 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold text-purple-400 border border-purple-500/20 transition"><i class="fa-solid fa-server"></i> API</button>
                <button onclick="app.showJson('${uid}')" class="px-3 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold text-sky-400 border border-sky-500/20 transition"><i class="fa-solid fa-code"></i> JSON</button>
            </div>
            <div class="flex flex-col md:flex-row gap-8">
                <div class="flex flex-col items-center shrink-0">
                    <div class="relative w-44 h-44 rounded-[2.5rem] p-1 border-2 border-white/10 overflow-hidden shadow-2xl bg-[#0b101e] cursor-pointer group-avatar transition-transform hover:scale-105" onclick="viewer.open(this, '${uid}', 0)">
                        <img src="${d.avatar}" class="w-full h-full object-cover rounded-[2.3rem]">
                        <div class="absolute inset-0 bg-black/30 opacity-0 group-avatar:hover:opacity-100 transition flex items-center justify-center"><i class="fa-solid fa-expand text-white text-2xl"></i></div>
                    </div>
                    <h2 class="text-3xl font-bold text-white mt-4 mb-2 flex md:hidden items-center justify-center gap-2 whitespace-pre-wrap text-center"><span>${d.nameH}</span><i class="fa-regular fa-copy text-lg text-slate-600 hover:text-white copy-btn" data-copy="${utils.escapeAttr(d.nameRaw)}" onclick="utils.copy(this.getAttribute('data-copy'))"></i></h2>
                    <div class="mt-2 md:mt-4 flex items-center gap-2 bg-black/30 px-4 py-1.5 rounded-full border border-white/5">
                        <span class="font-mono font-bold text-sky-300 text-lg">${uid}</span><i class="fa-regular fa-copy text-slate-500 hover:text-white copy-btn" onclick="utils.copy('${uid}')"></i>
                    </div>
                </div>
                <div class="flex-grow min-w-0 pt-2">
                    <h2 class="text-3xl md:text-4xl font-bold text-white mb-2 hidden md:flex items-center gap-3 whitespace-pre-wrap"><span>${d.nameH}</span><i class="fa-regular fa-copy text-lg text-slate-600 hover:text-white copy-btn" data-copy="${utils.escapeAttr(d.nameRaw)}" onclick="utils.copy(this.getAttribute('data-copy'))"></i></h2>
                    
                    <div class="flex flex-nowrap gap-3 text-xs font-bold text-slate-300 mb-6 uppercase tracking-wider justify-center md:justify-start overflow-x-auto">
                        <span class="bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 whitespace-nowrap">${d.gender}</span>
                        <span class="bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 whitespace-nowrap"><i class="fa-solid fa-earth-americas text-indigo-400 mr-1"></i> ${d.country}</span>
                        <span class="bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 whitespace-nowrap"><i class="fa-solid fa-language text-purple-400 mr-1"></i> ${d.lang}</span>
                    </div>
                    
                    <div class="bg-black/20 rounded-2xl p-5 border border-white/5 mb-6 relative hover:bg-black/30 transition">
                        ${bioContent}
                    </div>
                    
                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div class="${box}"><div class="text-xs font-bold text-purple-400 uppercase mb-2">Nhân Vật</div><div class="${row}"><span class="${lbl}">Model</span><span class="${val}">${d.model}</span></div><div class="${row}"><span class="${lbl}">Skin</span><span class="${val}" title="${d.skin}">${d.skin}</span></div><div class="text-[10px] text-purple-300/70 mt-2 text-right">DIY: ${d.diyTime}</div></div>
                        <div class="${box}"><div class="text-xs font-bold text-sky-400 uppercase mb-2">Nhà Phát Triển</div><div class="${row}"><span class="${lbl}">Cấp</span><span class="${val} text-yellow-400 font-bold">${d.dLvl}</span></div><div class="${row}"><span class="${lbl}">Stat</span><span class="${val}">${d.dStat}</span></div><div class="${row}"><span class="${lbl}">Perm</span><span class="${val}">${d.dPerm}</span></div><div class="${row}"><span class="${lbl}">Tải</span><span class="${val} text-green-400">${d.dDl}</span></div><div class="text-[10px] text-sky-300/70 mt-2 text-right">Khung: ${d.dFrame}</div></div>
                        <div class="${box}"><div class="text-xs font-bold text-yellow-400 uppercase mb-2">Expert</div><div class="${row}"><span class="${lbl}">Cấp</span><span class="${val} text-white font-bold">${d.eLvl}</span></div><div class="${row}"><span class="${lbl}">Stat</span><span class="${val}">${d.eStat}</span></div><div class="${row}"><span class="${lbl}">Điểm</span><span class="${val}">${d.eScore}/${d.eMax}</span></div><div class="${row}"><span class="${lbl}">Uy tín</span><span class="${val} text-blue-300">${d.ePt}</span></div><div class="text-[10px] text-yellow-200/50 mt-2 text-right">${d.eTime}</div></div>
                        <div class="${box}"><div class="text-xs font-bold text-red-400 uppercase mb-2">Báo cáo & Uy tín</div><div class="flex-grow flex flex-col justify-center text-center py-2"><span class="text-3xl font-bold text-white leading-none mb-1">${d.repCount}</span><span class="text-[10px] text-red-200/50 uppercase tracking-wider">Lần bị tố cáo</span></div><div class="border-t border-white/10 mt-2 pt-2 text-[10px] flex justify-between text-slate-400"><span>WhiteList:</span><span class="text-green-300 ml-1 truncate">${d.wlTime}</span></div></div>
                    </div>
                    <div class="mt-4 text-right text-xs text-slate-500 font-medium italic">Cập nhật: <span class="text-slate-300 not-italic">${d.updateTimeStr}</span></div>
                </div>
            </div>
            ${(d.photos && d.photos.length) ? `<div class="mt-8 pt-6 border-t border-white/5"><h4 class="text-xs font-bold text-slate-500 uppercase mb-4 flex items-center gap-2"><i class="fa-solid fa-images"></i> Thư viện ảnh (${d.photos.length}) <span class="text-[10px] font-normal normal-case opacity-50 ml-auto hidden md:inline">Kéo để cuộn</span></h4><div class="gallery-scroll flex gap-4 pb-4 snap-x" id="gallery-${uid}">${d.photos.map((ph,i) => `
                <div class="w-28 h-28 shrink-0 rounded-2xl overflow-hidden cursor-pointer border border-white/10 hover:border-sky-400 transition relative group snap-start" onclick="viewer.open(this, '${uid}', ${i})" data-tip="${ph.tip}">
                    <img src="${ph.url}" class="w-full h-full object-cover transition duration-700 group-hover:scale-110" loading="lazy">
                </div>`).join('')}</div></div>` : ''}
        `;

        $("#content-area").appendChild(card);
        if (d.photos && d.photos.length) {
            setTimeout(() => {
                const galEl = document.getElementById(`gallery-${uid}`);
                app.initGalleryDrag(galEl);
                app.initTooltips(galEl);
            }, 0);
        }
    },

    initGalleryDrag(el) {
        if (!el) return;
        let isDown = false, startX, scrollLeft;
        el.addEventListener("wheel", (e) => { if (el.scrollWidth > el.clientWidth) { e.preventDefault(); el.scrollLeft += e.deltaY; } });
        el.addEventListener("mousedown", (e) => { if (el.scrollWidth <= el.clientWidth) return; isDown = true; el.classList.add("active"); startX = e.pageX - el.offsetLeft; scrollLeft = el.scrollLeft; });
        el.addEventListener("mouseleave", () => { isDown = false; el.classList.remove("active"); });
        el.addEventListener("mouseup", () => { isDown = false; el.classList.remove("active"); });
        el.addEventListener("mousemove", (e) => { if (!isDown) return; e.preventDefault(); const x = e.pageX - el.offsetLeft; const walk = (x - startX) * 2; el.scrollLeft = scrollLeft - walk; });
    },

    initTooltips(el) {
        if (!el) return;
        const tipEl = document.getElementById("global-tooltip");
        const items = el.querySelectorAll("[data-tip]");
        items.forEach((item) => {
            item.addEventListener("mouseenter", () => { tipEl.innerText = item.getAttribute("data-tip"); tipEl.classList.remove("opacity-0"); });
            item.addEventListener("mousemove", (e) => { const x = e.clientX + 15; const y = e.clientY + 15; tipEl.style.transform = `translate(${x}px, ${y}px)`; });
            item.addEventListener("mouseleave", () => { tipEl.classList.add("opacity-0"); });
        });
    },

    skeleton: (n) => Array(n).fill(0).map(() => `<div class="glass-panel rounded-3xl p-6 h-96 animate-pulse"><div class="flex gap-8"><div class="w-44 h-44 bg-white/5 rounded-[2.5rem] shrink-0"></div><div class="flex-grow space-y-4"><div class="h-10 bg-white/5 w-2/3 rounded-xl"></div><div class="h-6 bg-white/5 w-1/3 rounded-lg"></div><div class="h-32 bg-white/5 w-full rounded-2xl mt-4"></div></div></div></div>`).join(""),
    addHist(uid, name) {
        const n = (name || "Unknown").replace(/<[^>]+>/g, "").trim();
        this.history = this.history.filter((h) => h.uid != uid);
        this.history.unshift({ uid, name: n });
        if (this.history.length > 10) this.history.pop();
        localStorage.setItem("mw_h", JSON.stringify(this.history));
        this.renderHist();
    },
    renderHist() {
        const l = $("#history-list");
        if (!this.history.length) { l.innerHTML = '<div class="col-span-2 text-center text-slate-500 italic text-xs py-2">Trống</div>'; return; }
        l.innerHTML = this.history.map((h) => `<div class="px-3 py-2 hover:bg-white/10 cursor-pointer rounded-lg bg-white/5 border border-white/5 flex flex-col justify-center" onclick="app.search('${h.uid}')"><div class="font-bold text-sky-200 font-mono text-base">${h.uid}</div><div class="text-sm text-slate-400 truncate">${h.name}</div></div>`).join("");
    },
    clearHistory() { this.history = []; localStorage.removeItem("mw_h"); this.renderHist(); },
    share(uid) { utils.copy(`${location.protocol}//${location.host}${location.pathname}?uid=${uid}`); },
    openApi(uid) { window.open(PROXY_URL + uid, "_blank"); },
    toast(msg, type) {
        const t = $("#toast");
        $("#toast-msg").innerText = msg;
        $("#toast-icon").className = type === "error" ? "fa-solid fa-circle-exclamation text-red-400" : "fa-solid fa-circle-check text-green-400";
        t.style.opacity = 1; t.style.transform = "translate(-50%,0)";
        setTimeout(() => { t.style.opacity = 0; t.style.transform = "translate(-50%,24px)"; }, 3000);
    },
    showJson(uid) {
        this.curId = uid;
        this.viewerLines = [];
        this.buildJson(null, this.data[uid], 0, true);
        this.renderLines();
        $("#modal-title").innerHTML = '<i class="fa-solid fa-code"></i> JSON DATA';
        $("#json-viewer-container").scrollTop = 0;
        this.openModal();
    },
    openModal() {
        const m = $("#json-modal");
        m.classList.remove("hidden");
        setTimeout(() => m.classList.remove("opacity-0"), 10);
        $("#json-box").classList.remove("scale-95");
        $("#json-box").classList.add("scale-100");
    },
    closeModal() {
        const m = $("#json-modal");
        m.classList.add("opacity-0");
        $("#json-box").classList.add("scale-95");
        setTimeout(() => {
            m.classList.add("hidden");
            this.viewerLines = [];
            document.getElementById("code-viewer").innerHTML = "";
        }, 300);
    },
    renderLines() {
        $("#code-viewer").innerHTML = this.viewerLines.map((l, i) => `<div class="j-line ${l.collapsible && !l.open ? "collapsed" : ""}" id="jl-${l.id}" style="display:${l.visible ? "block" : "none"}"><div class="j-num-col">${i + 1}</div><div class="j-content" style="padding-left:${l.depth * 20}px">${l.html}</div></div>`).join("");
    },
    buildJson(key, val, depth, isLast, pId = "root") {
        const id = Math.random().toString(36).substr(2, 9), base = { id, pId, depth, visible: true, open: true, html: "" }, wrap = (c, v) => `<span class="${c}">${v}</span>`;
        const kHtml = key !== null ? `${wrap("j-punc", '"')}${wrap("j-key", key)}${wrap("j-punc", '": ')}` : "";
        const comma = isLast ? "" : ",", indent = `style="padding-left:${depth * 20}px"`;
        if (val === null) this.viewerLines.push({ ...base, html: `<div ${indent}>${kHtml}${wrap("j-null", "null")}${comma}</div>` });
        else if (typeof val !== "object") this.viewerLines.push({ ...base, html: `<div ${indent}>${kHtml}${wrap(typeof val === "number" ? "j-num" : typeof val === "boolean" ? "j-bool" : "j-str", typeof val === "string" ? `"${val.replace(/"/g, '\\"')}"` : val)}${comma}</div>` });
        else {
            const keys = Object.keys(val), open = Array.isArray(val) ? "[" : "{", close = Array.isArray(val) ? "]" : "}";
            if (!keys.length) this.viewerLines.push({ ...base, html: `<div ${indent}>${kHtml}${wrap("j-punc", open + close + comma)}</div>` });
            else {
                const tog = `<span class="j-toggle" onclick="app.toggleLine('${id}')">▼</span>`, col = `<span class="j-collapsed-content" onclick="app.toggleLine('${id}')">... ${close}${comma}</span>`;
                this.viewerLines.push({ ...base, collapsible: true, html: `<div ${indent} style="position:relative">${tog}${kHtml}${wrap("j-punc", open)}${col}</div>` });
                keys.forEach((k, i) => this.buildJson(Array.isArray(val) ? null : k, val[k], depth + 1, i === keys.length - 1, id));
                this.viewerLines.push({ id: `end-${id}`, pId: id, depth, visible: true, html: `<div ${indent}>${wrap("j-punc", close + comma)}</div>` });
            }
        }
    },
    toggleLine(id) {
        const p = this.viewerLines.find((l) => l.id === id); if (!p) return;
        p.open = !p.open; document.getElementById(`jl-${id}`).classList.toggle("collapsed", !p.open);
        const setVis = (pid, vis) => {
            this.viewerLines.forEach((l) => {
                if (l.pId === pid) {
                    l.visible = vis; document.getElementById(`jl-${l.id}`).style.display = vis ? "block" : "none";
                    if (l.collapsible && l.open && vis) setVis(l.id, true); else if (l.collapsible) setVis(l.id, false);
                }
            });
        };
        setVis(id, p.open);
    },
    copyContent() { utils.copy(JSON.stringify(this.data[this.curId], null, 4)); },
    dlContent() {
        const c = JSON.stringify(this.data[this.curId], null, 4);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([c], { type: "application/json" }));
        a.download = `profile_${this.curId}.json`; a.click();
    },
};

const viewer = {
    imgs: [], cur: 0, x: 0, y: 0, s: 1, r: 0, fx: 1, fy: 1, isDrag: false, lx: 0, ly: 0,
    loop() { if (this.isDrag) requestAnimationFrame(this.loop.bind(this)); },

    open(el, uid, idx) {
        this.imgs = app.photos[uid];
        if (!this.imgs || this.imgs.length === 0) {
            if (Array.isArray(uid)) this.imgs = uid.map((u) => ({ url: u, dateStr: "", tip: "" }));
            else this.imgs = app.photos[uid] || [];
        }
        this.cur = idx;
        const v = $("#viewer"), img = $("#v-img"), rect = el.getBoundingClientRect();
        img.src = this.imgs[this.cur].url;
        img.style.transition = "none"; img.style.transformOrigin = "top left"; img.style.position = "fixed";
        img.style.left = rect.left + "px"; img.style.top = rect.top + "px"; img.style.width = rect.width + "px"; img.style.height = rect.height + "px";
        v.classList.remove("hidden"); v.classList.remove("opacity-0");

        requestAnimationFrame(() => {
            img.style.transition = "all 0.4s cubic-bezier(0.19, 1, 0.22, 1)";
            img.style.left = "0"; img.style.top = "0"; img.style.width = "100%"; img.style.height = "100%"; img.style.objectFit = "contain";
            setTimeout(() => {
                img.style.position = "static"; img.style.transform = "none"; img.style.transformOrigin = "center center";
                this.reset(); $("#viewer").classList.remove("pointer-events-none");
            }, 400);
        });
        this.update(); window.addEventListener("keydown", this.key);
    },
    close() {
        $("#viewer").classList.add("opacity-0"); setTimeout(() => $("#viewer").classList.add("hidden"), 300);
        window.removeEventListener("keydown", this.key); $("#viewer").classList.add("pointer-events-none");
    },
    nav(d) {
        this.cur = (this.cur + d + this.imgs.length) % this.imgs.length; this.reset();
        const i = $("#v-img"); i.style.opacity = 0;
        setTimeout(() => { i.src = this.imgs[this.cur].url; i.style.opacity = 1; this.update(); }, 150);
    },
    update() {
        $("#v-counter").innerText = `${this.cur + 1} / ${this.imgs.length}`;
        const dateEl = $("#v-date"), dateStr = this.imgs[this.cur].dateStr;
        if (dateStr && dateStr !== "Thời gian: Không rõ") { dateEl.innerText = dateStr; dateEl.classList.remove("hidden"); } else { dateEl.classList.add("hidden"); }
        this.updateZoomIndicator();
    },
    updateZoomIndicator() {
        const ind = document.getElementById("zoom-indicator");
        ind.innerText = Math.round(this.s * 100) + "%"; ind.classList.add("show");
        clearTimeout(this.zoomTimeout); this.zoomTimeout = setTimeout(() => ind.classList.remove("show"), 1500);
    },
    apply(smooth = false) {
        const img = $("#v-img");
        img.style.transition = smooth ? "transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)" : "none";
        img.style.transform = `translate3d(${this.x}px,${this.y}px,0) rotate(${this.r}deg) scale(${this.s}) scaleX(${this.fx}) scaleY(${this.fy})`;
        if (smooth) this.updateZoomIndicator();
    },
    reset() { this.x = 0; this.y = 0; this.s = 1; this.r = 0; this.fx = 1; this.fy = 1; this.apply(true); },
    rotate(d) { this.r += d; this.apply(true); }, flipH() { this.fx *= -1; this.apply(true); }, flipV() { this.fy *= -1; this.apply(true); },
    zoom(d) { this.s = Math.max(0.5, this.s + d); this.apply(true); },
    download() { window.open(this.imgs[this.cur].url, "_blank"); },
    openSource() {
        let url = this.imgs[this.cur].url;
        if (url.includes("images.weserv.nl")) { const match = url.match(/url=([^&]+)/); if (match && match[1]) url = decodeURIComponent(match[1]); }
        window.open(url, "_blank");
    },
    key(e) { if (e.key === "ArrowLeft") viewer.nav(-1); if (e.key === "ArrowRight") viewer.nav(1); if (e.key === "Escape") viewer.close(); },
    initEvents() {
        const c = $("#v-container");
        c.addEventListener("wheel", (e) => {
            e.preventDefault(); const d = e.deltaY * -0.001; const oldS = this.s; const newS = Math.min(Math.max(0.5, this.s + d), 8);
            const rect = c.getBoundingClientRect(); const mx = e.clientX - rect.left - rect.width / 2; const my = e.clientY - rect.top - rect.height / 2;
            this.x += (mx - this.x) * (1 - newS / oldS); this.y += (my - this.y) * (1 - newS / oldS); this.s = newS;
            this.apply(false); this.updateZoomIndicator();
        });
        c.addEventListener("mousedown", (e) => { if (e.button !== 0) return; this.isDrag = true; this.lx = e.clientX; this.ly = e.clientY; c.style.cursor = "grabbing"; this.apply(false); });
        window.addEventListener("mousemove", (e) => { if (!this.isDrag) return; e.preventDefault(); this.x += e.clientX - this.lx; this.y += e.clientY - this.ly; this.lx = e.clientX; this.ly = e.clientY; this.apply(false); });
        window.addEventListener("mouseup", () => { this.isDrag = false; c.style.cursor = "grab"; this.apply(true); });
        c.addEventListener("touchstart", (e) => { if (e.touches.length === 1) { this.isDrag = true; this.lx = e.touches[0].clientX; this.ly = e.touches[0].clientY; this.apply(false); } });
        c.addEventListener("touchmove", (e) => { if (!this.isDrag) return; e.preventDefault(); this.x += e.touches[0].clientX - this.lx; this.y += e.touches[0].clientY - this.ly; this.lx = e.touches[0].clientX; this.ly = e.touches[0].clientY; this.apply(false); });
        c.addEventListener("touchend", () => { this.isDrag = false; this.apply(true); });
    },
};

const bgAnim = {
    start() {
        const c = document.getElementById("star-canvas"), x = c.getContext("2d");
        let w, h, s = [], lastTime = 0;
        const fps = 30; // KHÓA CỨNG 30 FPS: Cứu tinh cho GPU và hiệu ứng kính mờ!
        const interval = 1000 / fps;

        const init = () => {
            w = c.width = window.innerWidth;
            h = c.height = window.innerHeight;
            s = [];
            // Giảm nhẹ số lượng sao xuống 40 (mobile) và 100 (PC) là đủ đẹp
            const count = w < 768 ? 40 : 100;
            for (let i = 0; i < count; i++) {
                s.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    r: Math.random() * 1.5 + 0.5,
                    a: Math.random(),
                    v: (Math.random() * 0.02 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
                    dy: Math.random() * 0.15 + 0.05,
                });
            }
        };

        const loop = (currentTime) => {
            requestAnimationFrame(loop);
            const delta = currentTime - lastTime;
            if (delta < interval) return; // Throttling: Bỏ qua nếu chưa đủ thời gian 30 FPS
            lastTime = currentTime - (delta % interval);

            x.clearRect(0, 0, w, h);
            s.forEach((p) => {
                p.a += p.v;
                if (p.a > 1 || p.a < 0) p.v *= -1;
                p.y -= p.dy;
                if (p.y < 0) p.y = h;
                
                // TỐI ƯU HÓA: Dùng thẳng chuỗi rgba, KHÔNG đổi x.globalAlpha liên tục
                const alpha = Math.max(0.1, Math.min(1, Math.abs(p.a))).toFixed(2);
                x.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                x.fillRect(p.x, p.y, p.r, p.r);
            });
        };

        window.addEventListener("resize", init);
        init();
        requestAnimationFrame(loop);
    },
};

document.addEventListener("DOMContentLoaded", () => { app.init(); viewer.initEvents(); });