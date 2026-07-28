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
    copy: (txt, btnEl = null, label = "", e = null) => {
        if (e && e.stopPropagation) e.stopPropagation();
        const t = document.createElement("textarea");
        t.value = txt; t.style.position = "fixed"; t.style.left = "-9999px";
        document.body.appendChild(t); t.focus(); t.select();
        try {
            const success = document.execCommand("copy");
            if (success) {
                const msg = label ? `Đã sao chép ${label}: ${txt}` : `Đã sao chép: ${txt}`;
                app.toast(msg, "success");
                
                // HIỆU ỨNG TICK XANH LÁ TẠM THỜI MƯỢT MÀ CHO NÚT BẤM
                if (btnEl) {
                    const icon = btnEl.tagName === "I" ? btnEl : btnEl.querySelector("i");
                    if (icon) {
                        const oldCls = icon.className;
                        icon.className = "fa-solid fa-check text-green-400 scale-125 transition-all duration-300";
                        setTimeout(() => { icon.className = oldCls; }, 1500);
                    }
                }
            } else {
                app.toast("Lỗi sao chép vào Clipboard", "error");
            }
        } catch (err) { app.toast("Lỗi quyền truy cập Clipboard", "error"); }
        document.body.removeChild(t);
    },
    escapeAttr: (t) => String(t).replace(/"/g, "&quot;").replace(/\n/g, "&#10;"),

    parseMood: (t) => {
        if (!t || String(t).trim() === '') return null;
        
        let clean = String(t)
            .replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="text-sky-400 hover:underline j-link" onclick="event.stopPropagation()">$1</a>')
            .replace(/\n/g, "<br>");

        let html = '';
        let buffer = '';
        let color = null;
        let isBlink = false;
        let isUnderline = false;

        const COLOR_MAP = {
            'K': '#000000', 'W': '#ffffff', 'R': '#ef4444', 'Y': '#eab308',
            'B': '#3b82f6', 'G': '#22c55e'
        };

        const flush = () => {
            if (!buffer) return;
            let styles = [];
            let classes = [];

            if (color) styles.push(`color:${color}`);
            if (isUnderline) {
                styles.push(`text-decoration:underline`);
                if (color) styles.push(`text-decoration-color:${color}`);
            }
            if (isBlink) classes.push('blink-text');

            if (styles.length === 0 && classes.length === 0) {
                html += buffer;
            } else {
                const styleAttr = styles.length > 0 ? ` style="${styles.join(';')}"` : '';
                const classAttr = classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
                html += `<span${classAttr}${styleAttr}>${buffer}</span>`;
            }
            buffer = '';
        };

        let i = 0;
        const len = clean.length;

        while (i < len) {
            // Bước nhảy bảo vệ thẻ HTML: KHẮC PHỤC TRIỆT ĐỂ LỖI DƯ DẤU ">"
            if (clean[i] === '<') {
                flush();
                let tag = '';
                while (i < len && clean[i] !== '>') { 
                    tag += clean[i]; 
                    i++; 
                }
                if (i < len) {
                    tag += clean[i]; // Cộng nốt dấu '>' vào tag
                    i++; // VƯỢT QUA DẤU '>': Đây là mấu chốt để không bị in dư dấu >
                }
                html += tag;
                continue;
            }

            if (clean[i] !== '#') {
                buffer += clean[i];
                i++;
                continue;
            }

            // --- BẮT ĐẦU PHÂN TÍCH LỆNH GAME (#) ---
            const nextChar = i + 1 < len ? clean[i + 1] : '';

            // Luật 1: Thoát ký tự '##' thành '#'
            if (nextChar === '#') {
                buffer += '#';
                i += 2;
                continue;
            }

            flush();
            i++; // Bỏ qua dấu #
            
            if (i >= len) break;
            
            const cmd = clean[i];

            if (COLOR_MAP[cmd]) {
                color = COLOR_MAP[cmd];
                i++;
            } 
            else if (cmd === 'c' || cmd === 'C') {
                i++;
                let hex = '';
                while (i < len && hex.length < 6 && /[0-9a-fA-F]/.test(clean[i])) {
                    hex += clean[i];
                    i++;
                }
                if (hex.length > 0) color = '#' + hex;
            } 
            else if (cmd === 'A') {
                i++;
                let iconId = '';
                while (i < len && iconId.length < 3 && /[0-9]/.test(clean[i])) {
                    iconId += clean[i];
                    i++;
                }
            } 
            else if (cmd === 'L') {
                isUnderline = true;
                //color = '#fca5a5';
                i++;
            } 
            else if (cmd === 'b') {
                isBlink = true;
                i++;
            } 
            else if (cmd === 'n') {
                color = null;
                isUnderline = false;
                isBlink = false;
                i++;
            } 
            else {
                i++; // Ẩn các dấu # rác
            }
        }
        
        flush();
        return html;
    }
};

// =========================================================================
// UNIVERSAL LINK ENGINE: PHÂN LOẠI & XỬ LÝ SIÊU NHẠY
// =========================================================================
const linkEngine = {
    classify(url) {
        const clean = String(url).split(/[\?#]/)[0].toLowerCase();
        const ext = clean.includes('.') ? clean.split('.').pop() : '';
        
        if (/(png|jpg|jpeg|gif|webp|svg|bmp|ico)$/.test(ext) || url.includes('/map/') || url.includes('weserv.nl') || url.includes('imgur') || url.includes('miniworldgame.com/map/')) {
            return { type: 'IMAGE', label: 'HÌNH ẢNH', icon: 'fa-image', color: 'text-sky-400', bg: 'lt-bg-image', badgeBg: 'bg-sky-500/20 text-sky-300' };
        }
        if (/(mp4|webm|ogg|mov|avi|flv)$/.test(ext) || url.includes('youtube') || url.includes('tiktok')) {
            return { type: 'VIDEO', label: 'VIDEO STREAM', icon: 'fa-film', color: 'text-rose-400', bg: 'lt-bg-video', badgeBg: 'bg-rose-500/20 text-rose-300' };
        }
        if (/(mp3|wav|flac|aac|m4a|ogg)$/.test(ext) || url.includes('soundcloud') || url.includes('spotify')) {
            return { type: 'AUDIO', label: 'ÂM THANH', icon: 'fa-music', color: 'text-purple-400', bg: 'lt-bg-audio', badgeBg: 'bg-purple-500/20 text-purple-300' };
        }
        if (/(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|md)$/.test(ext)) {
            return { type: 'DOCUMENT', label: 'TÀI LIỆU', icon: 'fa-file-lines', color: 'text-amber-400', bg: 'lt-bg-doc', badgeBg: 'bg-amber-500/20 text-amber-300' };
        }
        if (/(zip|rar|7z|tar|gz|apk|exe|dmg|iso)$/.test(ext)) {
            return { type: 'ARCHIVE', label: 'TỆP TẢI XUỐNG', icon: 'fa-file-zipper', color: 'text-green-400', bg: 'lt-bg-arc', badgeBg: 'bg-green-500/20 text-green-300' };
        }
        if (/(json|xml|yaml|sql)$/.test(ext) || url.includes('/api/') || url.includes('api.')) {
            return { type: 'API', label: 'DỮ LIỆU API', icon: 'fa-code', color: 'text-pink-400', bg: 'lt-bg-api', badgeBg: 'bg-pink-500/20 text-pink-300' };
        }
        return { type: 'WEB', label: 'LIÊN KẾT WEB', icon: 'fa-globe', color: 'text-slate-300', bg: 'lt-bg-web', badgeBg: 'bg-slate-500/20 text-slate-300' };
    },

    async getFileSize(url) {
        try {
            const res = await fetch(url, { method: 'HEAD', mode: 'cors' });
            const bytes = res.headers.get('content-length');
            if (!bytes) return "Không rõ size";
            const b = Number(bytes);
            if (b < 1024) return `${b} B`;
            if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
            return `${(b / 1048576).toFixed(2)} MB`;
        } catch (e) {
            return "Web / API Link";
        }
    },

    async copyImageToClipboard(url) {
        app.toast("Đang tải dữ liệu ảnh...", "info");
        try {
            const res = await fetch(url, { mode: 'cors' });
            const blob = await res.blob();
            let pngBlob = blob;
            if (blob.type !== 'image/png') {
                pngBlob = await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = "Anonymous";
                    img.onload = () => {
                        const canvas = document.createElement("canvas");
                        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
                        canvas.getContext("2d").drawImage(img, 0, 0);
                        canvas.toBlob((b) => b ? resolve(b) : reject(), "image/png");
                    };
                    img.onerror = () => reject();
                    img.src = URL.createObjectURL(blob);
                });
            }
            const data = [new ClipboardItem({ [pngBlob.type]: pngBlob })];
            await navigator.clipboard.write(data);
            app.toast("Đã sao chép hình ảnh vào Clipboard!", "success");
        } catch (e) {
            utils.copy(url);
            app.toast("Đã sao chép LIÊN KẾT ảnh (Do máy chủ chặn CORS)", "success");
        }
    }
};

const app = {
    data: {}, avatars: {}, photos: {}, history: JSON.parse(localStorage.getItem("mw_h") || "[]"),
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

        // EVENT DELEGATION TỐI THƯỢNG CHO TOOLTIP (Không bao giờ rò rỉ bộ nhớ)
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

    // =========================================================================
    // HỆ THỐNG ĐỒNG BỘ TRẠNG THÁI TỰ ĐỘNG (REACTIVE FETCHING STATE)
    // =========================================================================
    setCardLoadingState(uids, isLoading = true) {
        const list = Array.isArray(uids) ? uids : [uids];
        list.forEach(uid => {
            const card = document.getElementById(`profile-card-${uid}`);
            if (!card) return;
            
            // Tìm nút Tải lại trên Card (Dựa vào thuộc tính onclick chứa chữ reloadProfile)
            const btn = card.querySelector('button[onclick*="reloadProfile"]');
            if (!btn) return;

            const icon = btn.querySelector("i");
            const text = btn.querySelector("span");

            if (isLoading) {
                btn.disabled = true;
                btn.classList.add("opacity-60", "cursor-not-allowed", "ring-2", "ring-emerald-400/50");
                if (icon) icon.className = "fa-solid fa-rotate-right fa-spin text-emerald-400";
                if (text) text.innerText = "Đang tải...";
            } else {
                btn.disabled = false;
                btn.classList.remove("opacity-60", "cursor-not-allowed", "ring-2", "ring-emerald-400/50");
                if (icon) icon.className = "fa-solid fa-rotate-right transition-transform duration-300";
                if (text) text.innerText = "Tải lại";
            }
        });
    },

    // TỰ ĐỘNG HIGHLIGHT MỖI KHI CÓ GIẢI PHÁP THAY THẾ DOM IM LẶNG
    renderData(dataList, isSilent = false) {
        const container = $("#content-area");
        if (!container) return;

        const hasOnlySkeletons = container.querySelector(".animate-pulse") !== null || container.innerHTML.trim() === "";

        if (hasOnlySkeletons || !isSilent) {
            // Render lần đầu: Vẽ mới kèm hiệu ứng bay lượn
            container.innerHTML = "";
            dataList.forEach((d) => {
                this.card(d, false);
                this.addHist(d.uid, d.nameRaw);
            });
        } else {
            // Render cập nhật: Thay thế im lặng + TỰ ĐỘNG HIỆN VIỀN XANH
            dataList.forEach((d) => {
                const uid = d.uid;
                const oldCard = document.getElementById(`profile-card-${uid}`);
                
                if (oldCard) {
                    const oldHeight = oldCard.offsetHeight;
                    oldCard.style.minHeight = `${oldHeight}px`;

                    const newCard = this.createCardElement(d, true);
                    
                    // TỰ ĐỘNG BẬT VIỀN XANH MỖI KHI FETCH VÀ THAY THẾ CARD THÀNH CÔNG!
                    newCard.classList.add("flash-highlight");
                    setTimeout(() => newCard.classList.remove("flash-highlight"), 1500);
                    
                    oldCard.replaceWith(newCard);
                } else {
                    this.card(d, true);
                }
                this.addHist(d.uid, d.nameRaw);
            });
        }
    },

    async search(val) {
        const inp = $("#search-input");
        const btn = inp ? inp.nextElementSibling : null;
        let raw = val || (inp ? inp.value.trim() : "");
        let uids = raw.split(/[,\s]+/).map((s) => {
            s = s.trim();
            if (!/^\d+$/.test(s)) return null;
            return s.length < 10 ? String(Number(s) + 1000000000) : s;
        }).filter(Boolean);

        if (!uids.length) return this.toast("UID không hợp lệ", "error");

        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.currentUids = uids;

        const cacheKey = "mw_cache_" + uids.join("_");
        const cachedData = localStorage.getItem(cacheKey);

        const histBox = $("#history-box");
        if (histBox) histBox.classList.add("hidden");

        if (cachedData) {
            try { 
                this.renderData(JSON.parse(cachedData), false); 
                // KÍCH HOẠT HIỆU ỨNG XOAY "ĐANG TẢI..." TRÊN NÚT TRONG LƯỢT FETCH NGẦM
                this.setCardLoadingState(uids, true);
            } catch (e) { }
        } else {
            $("#content-area").innerHTML = this.skeleton(uids.length);
        }

        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
            btn.disabled = true;
        }

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

            // Cập nhật DOM: Nút xoay sẽ tự động biến mất và viền xanh tự động sáng lên!
            this.renderData(response.uiData, Boolean(cachedData));
            
            this.refreshTimer = setInterval(() => this.silentRefresh(), 30000);

        } catch (e) {
            if (!cachedData) {
                $("#content-area").innerHTML = `<div class="text-center py-10 text-slate-400 animate-enter"><i class="fa-solid fa-server text-4xl mb-2 text-red-400"></i><br><span class="font-bold text-red-300">LỖI:</span> ${e.message}</div>`;
            } else {
                // Trả lại trạng thái bình thường cho nút bấm nếu lỗi mạng
                this.setCardLoadingState(uids, false);
            }
            this.toast(e.message, "error");
        } finally {
            if (btn) {
                btn.innerHTML = "TRA CỨU";
                btn.disabled = false;
            }
        }
    },

    async silentRefresh() {
        if (!this.currentUids || !this.currentUids.length) return;
        
        // Bật hiệu ứng xoay nút Tải lại trước khi fetch định kỳ
        this.setCardLoadingState(this.currentUids, true);
        
        try {
            const url = PROXY_URL + this.currentUids.join(",");
            const response = await utils.fetchFast(url);

            if (!response.uiData || !response.uiData.length) return;

            this.data = {};
            Object.values(response.rawJson).forEach((p) => {
                const d = p.profile || p;
                if (d.uin) this.data[d.uin] = d;
            });

            const cacheKey = "mw_cache_" + this.currentUids.join("_");
            localStorage.setItem(cacheKey, JSON.stringify(response.uiData));

            // Tự động thay thế im lặng và sáng viền xanh lục!
            this.renderData(response.uiData, true);
        } catch (e) {
            this.setCardLoadingState(this.currentUids, false);
        }
    },

    async reloadProfile(uid, btnEl, e) {
        if (e && e.stopPropagation) e.stopPropagation();
        if (!uid) return;

        // Kích hoạt trạng thái loading tự động
        this.setCardLoadingState(uid, true);
        this.toast(`Đang làm mới dữ liệu trực tiếp từ máy chủ game...`, "info");

        try {
            const forceUrl = `${PROXY_URL}${uid}&_force=${Date.now()}`;
            const response = await utils.fetchFast(forceUrl);

            if (!response.uiData || !response.uiData.length) {
                throw new Error("Máy chủ game không phản hồi dữ liệu mới");
            }

            const newUiProfile = response.uiData[0];
            
            Object.values(response.rawJson).forEach((p) => {
                const d = p.profile || p;
                if (d.uin) this.data[d.uin] = d;
            });

            const cacheKey = "mw_cache_" + this.currentUids.join("_");
            const cachedDataStr = localStorage.getItem(cacheKey);
            if (cachedDataStr) {
                try {
                    let cachedList = JSON.parse(cachedDataStr);
                    cachedList = cachedList.map(item => item.uid == uid ? newUiProfile : item);
                    localStorage.setItem(cacheKey, JSON.stringify(cachedList));
                } catch(err) {}
            }

            // Gọi renderData để tự động diff DOM, reset nút xoay và hiện viền xanh!
            this.renderData([newUiProfile], true);
            this.toast(`Đã cập nhật UID ${uid} thành công!`, "success");

        } catch (err) {
            this.toast(`Lỗi làm mới dữ liệu: ${err.message}`, "error");
            this.setCardLoadingState(uid, false);
        }
    },

    // =========================================================================
    // HỆ THỐNG TẠO CARD & FORCE RELOAD IM LẶNG (ENTERPRISE GRADE)
    // =========================================================================
    createCardElement(d, isSilent = false) {
        const uid = d.uid;
        this.photos[uid] = d.photos || [];
        this.avatars[uid] = d.avatarInfo || { url: d.avatar, dateStr: "Thời gian: Không rõ", tip: "Ảnh đại diện" };

        const card = document.createElement("div");
        // ĐỊNH DANH ID ĐỘC NHẤT ĐỂ THAY THẾ IM LẶNG KHÔNG GÂY CHỚP NHÁY
        card.id = `profile-card-${uid}`;
        card.className = `glass-panel rounded-3xl p-6 relative overflow-hidden transition-all duration-300 border-t border-white/10 group hover:shadow-sky-500/10 hover:shadow-2xl ${isSilent ? '' : 'animate-enter'}`;
        
        const isNu = String(d.gender).includes('venus');
        const bg = isNu ? "from-pink-500/10 via-purple-500/5 to-rose-500/10" : "from-sky-500/10 via-blue-500/5 to-cyan-500/10";

        const rawJson = this.data[uid] || {};
        const finalNameRaw = d.nameRaw || rawJson.RoleInfo?.NickName || rawJson.NickName || d.nameH || String(uid);
        const finalMoodRaw = d.moodRaw !== undefined ? d.moodRaw : (rawJson.mood_text || d.moodH || "");

        const parsedName = utils.parseMood(finalNameRaw) || finalNameRaw;
        const parsedMood = utils.parseMood(finalMoodRaw) || "";

        let bioContent;
        if (!parsedMood) {
            if (!d.moodIcon || String(d.moodIcon).trim() === "" || d.moodIcon === "A100") {
                bioContent = '<p class="text-slate-500 italic opacity-50 font-medium text-base">Chưa thiết lập</p>';
            } else {
                bioContent = `<div class="flex gap-4 items-start"><div class="text-sky-400 font-mono font-bold text-lg border-r border-white/10 pr-4 pt-1">#${d.moodIcon}</div><div class="text-slate-500 italic opacity-50 font-medium text-base flex-grow">Chưa thiết lập</div></div>`;
            }
        } else if (d.moodIcon && String(d.moodIcon).trim() !== "" && d.moodIcon !== "A100") {
            bioContent = `<div class="flex gap-4 items-start"><div class="text-sky-400 font-mono font-bold text-lg border-r border-white/10 pr-4 pt-1">#${d.moodIcon}</div><div class="text-slate-200 leading-relaxed font-medium text-base whitespace-pre-wrap flex-grow break-words">${parsedMood}</div></div>`;
        } else {
            bioContent = `<p class="text-slate-200 leading-relaxed font-medium text-base whitespace-pre-wrap break-words">${parsedMood}</p>`;
        }

        const box = "bg-white/[0.03] rounded-2xl p-4 border border-white/10 flex flex-col justify-between hover:bg-white/[0.07] hover:border-white/20 transition-all duration-200 active:scale-[0.98] group/box shadow-lg";
        const row = "text-xs md:text-sm flex justify-between items-center py-1 border-b border-white/[0.03] last:border-0";
        const lbl = "text-slate-400 flex items-center gap-2 truncate font-medium";
        const val = "text-white font-semibold truncate ml-2 font-mono";
        const ico = (cls, color) => `<i class="fa-solid ${cls} ${color} w-4 text-center shrink-0 text-xs md:text-sm group-hover/box:scale-110 transition-transform duration-200"></i>`;

        card.innerHTML = `
            <div class="absolute inset-0 bg-gradient-to-br ${bg} -z-10"></div>
            <!-- CỤM NÚT CÔNG CỤ: THÊM NÚT FORCE RELOAD VÀO ĐẦU TIÊN -->
            <div class="flex gap-1.5 md:gap-2 z-20 justify-end md:absolute md:top-4 md:right-4 mb-6 md:mb-0 flex-wrap">
                <button onclick="app.reloadProfile('${uid}', this, event)" class="px-2.5 md:px-3 py-1 bg-white/5 hover:bg-emerald-500/20 active:scale-95 rounded-lg text-xs font-bold text-emerald-400 border border-emerald-500/20 transition flex items-center gap-1.5 shrink-0 shadow-sm" title="Tải lại dữ liệu trực tiếp từ máy chủ game (Force Reload)">
                    <i class="fa-solid fa-rotate-right transition-transform duration-300"></i> <span class="hidden sm:inline">Tải lại</span>
                </button>
                <button onclick="app.share('${uid}')" class="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 flex items-center justify-center text-slate-300 hover:text-white transition shrink-0" title="Share"><i class="fa-solid fa-share-nodes"></i></button>
                <button onclick="app.openApi('${uid}')" class="px-2.5 md:px-3 py-1 bg-white/5 hover:bg-white/10 active:scale-95 rounded-lg text-xs font-bold text-purple-400 border border-purple-500/20 transition flex items-center gap-1 shrink-0"><i class="fa-solid fa-server"></i> API</button>
                <button onclick="app.showJson('${uid}')" class="px-2.5 md:px-3 py-1 bg-white/5 hover:bg-white/10 active:scale-95 rounded-lg text-xs font-bold text-sky-400 border border-sky-500/20 transition flex items-center gap-1 shrink-0"><i class="fa-solid fa-code"></i> JSON</button>
            </div>
            <div class="flex flex-col md:flex-row gap-8">
                <div class="flex flex-col items-center shrink-0">
                    <div class="relative w-44 h-44 rounded-[2.5rem] p-1 border-2 border-white/10 overflow-hidden shadow-2xl bg-[#0b101e] cursor-pointer group-avatar transition-transform hover:scale-105" onclick="viewer.openAvatar(this, '${uid}')">
                        <img src="${d.avatar}" class="w-full h-full object-cover rounded-[2.3rem]">
                        <div class="absolute inset-0 bg-black/30 opacity-0 group-avatar:hover:opacity-100 transition flex items-center justify-center"><i class="fa-solid fa-expand text-white text-2xl"></i></div>
                    </div>
                    <h2 class="text-3xl font-bold text-white mt-4 mb-2 flex md:hidden items-center justify-center gap-2 whitespace-pre-wrap text-center"><span class="break-words max-w-full">${parsedName}</span><i class="fa-regular fa-copy text-lg text-slate-600 hover:text-white copy-btn shrink-0" data-copy="${utils.escapeAttr(d.nameRaw)}" onclick="utils.copy(this.getAttribute('data-copy'), this, 'Tên nhân vật', event)"></i></h2>
                    <div class="mt-2 md:mt-4 flex items-center gap-2 bg-black/30 px-4 py-1.5 rounded-full border border-white/5">
                        <span class="font-mono font-bold text-sky-300 text-lg">${uid}</span><i class="fa-regular fa-copy text-slate-500 hover:text-white copy-btn" onclick="utils.copy('${uid}', this, 'UID', event)"></i>
                    </div>
                </div>
                <div class="flex-grow min-w-0 pt-2">
                    <h2 class="text-3xl md:text-4xl font-bold text-white mb-2 hidden md:flex items-center gap-3 whitespace-pre-wrap"><span class="break-words min-w-0">${parsedName}</span><i class="fa-regular fa-copy text-lg text-slate-600 hover:text-white copy-btn shrink-0" data-copy="${utils.escapeAttr(d.nameRaw)}" onclick="utils.copy(this.getAttribute('data-copy'), this, 'Tên nhân vật', event)"></i></h2>
                    
                    <div class="flex flex-nowrap gap-3 text-xs font-bold text-slate-300 mb-6 uppercase tracking-wider justify-center md:justify-start overflow-x-auto">
                        <span class="bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 whitespace-nowrap">${d.gender}</span>
                        <span class="bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 whitespace-nowrap"><i class="fa-solid fa-earth-americas text-indigo-400 mr-1"></i> ${d.country}</span>
                        <span class="bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 whitespace-nowrap"><i class="fa-solid fa-language text-purple-400 mr-1"></i> ${d.lang}</span>
                    </div>
                    
                    <div class="bg-black/20 rounded-2xl p-5 border border-white/5 mb-6 relative hover:bg-black/30 transition">
                        ${bioContent}
                    </div>
                    
                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        
                        <div class="${box}">
                            <div class="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 border-b border-purple-500/20 pb-1.5">
                                <i class="fa-solid fa-user-astronaut text-purple-400 text-sm"></i> NHÂN VẬT
                            </div>
                            <div class="space-y-0.5 flex-grow">
                                <div class="${row}"><span class="${lbl}">${ico('fa-cube', 'text-purple-400')} Model</span><span class="${val}">${d.model}</span></div>
                                <div class="${row}"><span class="${lbl}">${ico('fa-shirt', 'text-pink-400')} Skin</span><span class="${val}" title="${d.skin}">${d.skin}</span></div>
                                <div class="${row}" data-tip="Phòng trưng bày Skin, DIY, Thần thú & Skin công cụ"><span class="${lbl}">${ico('fa-wand-magic-sparkles', 'text-amber-400')} Mini Show</span><span class="${val}">${d.miniShow}</span></div>
                            </div>
                            <div class="text-[10px] text-purple-300/70 mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                                <span class="flex items-center gap-1 truncate"><i class="fa-solid fa-clock text-indigo-400"></i> DIY:</span>
                                <span class="font-mono truncate ml-1">${d.diyTime}</span>
                            </div>
                        </div>

                        <div class="${box}">
                            <div class="text-xs font-bold text-sky-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 border-b border-sky-500/20 pb-1.5">
                                <i class="fa-solid fa-code text-sky-400 text-sm"></i> NHÀ PHÁT TRIỂN
                            </div>
                            <div class="space-y-0.5 flex-grow">
                                <div class="${row}"><span class="${lbl}">${ico('fa-layer-group', 'text-sky-400')} Cấp</span><span class="${val} text-yellow-400">${d.dLvl}</span></div>
                                <div class="${row}"><span class="${lbl}">${ico('fa-chart-line', 'text-cyan-400')} Stat</span><span class="${val}">${d.dStat}</span></div>
                                <div class="${row}"><span class="${lbl}">${ico('fa-cloud-arrow-down', 'text-emerald-400')} Tải</span><span class="${val} text-green-400">${d.dDl}</span></div>
                            </div>
                            <div class="text-[10px] text-sky-300/70 mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                                <span class="flex items-center gap-1 truncate"><i class="fa-solid fa-crop-simple text-teal-400"></i> Khung:</span>
                                <span class="font-mono truncate ml-1">${d.dFrame}</span>
                            </div>
                        </div>

                        <div class="${box}">
                            <div class="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 border-b border-yellow-500/20 pb-1.5">
                                <i class="fa-solid fa-user-graduate text-yellow-400 text-sm"></i> EXPERT
                            </div>
                            <div class="space-y-0.5 flex-grow">
                                <div class="${row}"><span class="${lbl}">${ico('fa-medal', 'text-yellow-400')} Cấp</span><span class="${val} text-white">${d.eLvl}</span></div>
                                <div class="${row}"><span class="${lbl}">${ico('fa-fire', 'text-orange-400')} Stat</span><span class="${val}">${d.eStat}</span></div>
                                <div class="${row}"><span class="${lbl}">${ico('fa-bullseye', 'text-amber-400')} Điểm</span><span class="${val}">${d.eScore}/${d.eMax}</span></div>
                                <div class="${row}"><span class="${lbl}">${ico('fa-gem', 'text-lime-400')} Uy tín</span><span class="${val} text-blue-300">${d.ePt}</span></div>
                            </div>
                            <div class="text-[10px] text-yellow-200/60 mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                                <span class="flex items-center gap-1 truncate"><i class="fa-solid fa-calendar-check text-yellow-400/80"></i> Mời:</span>
                                <span class="font-mono truncate ml-1">${d.eTime}</span>
                            </div>
                        </div>

                        <div class="${box}">
                            <div class="text-xs font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 border-b border-red-500/20 pb-1.5">
                                <i class="fa-solid fa-shield-halved text-red-400 text-sm"></i> BÁO CÁO & UY TÍN
                            </div>
                            <div class="flex-grow flex flex-col justify-center items-center text-center py-2">
                                <span class="text-3xl md:text-4xl font-bold font-mono text-white leading-none mb-1.5 tracking-tight group-hover/box:scale-105 transition-transform">${d.repCount}</span>
                                <span class="text-[10px] text-red-200/60 uppercase tracking-wider flex items-center gap-1 font-semibold">
                                    <i class="fa-solid fa-flag text-rose-400"></i> Lần bị tố cáo
                                </span>
                            </div>
                            <div class="border-t border-white/5 mt-3 pt-2 text-[10px] flex items-center justify-between text-slate-400">
                                <span class="flex items-center gap-1 shrink-0"><i class="fa-solid fa-list-check text-emerald-400"></i> WhiteList:</span>
                                <span class="text-green-300 font-mono font-semibold ml-1 truncate">${d.wlTime}</span>
                            </div>
                        </div>

                    </div>
                    <div class="mt-4 text-right text-xs text-slate-500 font-medium italic">Cập nhật: <span class="text-slate-300 not-italic">${d.updateTimeStr}</span></div>
                </div>
            </div>
            ${(d.photos && d.photos.length) ? `<div class="mt-8 pt-6 border-t border-white/5"><h4 class="text-xs font-bold text-slate-500 uppercase mb-4 flex items-center gap-2"><i class="fa-solid fa-images"></i> Thư viện ảnh (${d.photos.length}) <span class="text-[10px] font-normal normal-case opacity-50 ml-auto hidden md:inline">Kéo để cuộn</span></h4><div class="gallery-scroll flex gap-4 pb-4 snap-x" id="gallery-${uid}">${d.photos.map((ph,i) => `
                <div class="w-28 h-28 shrink-0 rounded-2xl overflow-hidden cursor-pointer border border-white/10 hover:border-sky-400 transition relative group snap-start" onclick="viewer.openGallery(this, '${uid}', ${i})" data-tip="${ph.tip}">
                    <img src="${ph.url}" class="w-full h-full object-cover transition duration-700 group-hover:scale-110" loading="lazy">
                </div>`).join('')}</div></div>` : ''}
        `;

        if (d.photos && d.photos.length) {
            const galEl = card.querySelector(`#gallery-${uid}`);
            if (galEl) this.initGalleryDrag(galEl);
        }
        return card;
    },

    card(d, isSilent = false) {
        const cardEl = this.createCardElement(d, isSilent);
        $("#content-area").appendChild(cardEl);
    },

    // =========================================================================
    // ĐỘNG CƠ FORCE RELOAD: CÀO DATA TRỰC TIẾP TỪ MÁY CHỦ MINI WORLD
    // =========================================================================
    async reloadProfile(uid, btnEl, e) {
        if (e && e.stopPropagation) e.stopPropagation();
        if (!uid) return;

        // 1. Phản hồi thị giác lập tức: Khóa nút, Xoay icon, Đổi nhãn
        const iconEl = btnEl ? btnEl.querySelector("i") : null;
        const textEl = btnEl ? btnEl.querySelector("span") : null;
        const oldIconCls = iconEl ? iconEl.className : "fa-solid fa-rotate-right";
        
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.classList.add("opacity-60", "cursor-not-allowed", "ring-2", "ring-emerald-400/50");
        }
        if (iconEl) iconEl.className = "fa-solid fa-rotate-right fa-spin text-emerald-400";
        if (textEl) textEl.innerText = "Đang tải...";

        this.toast(`Đang làm mới dữ liệu trực tiếp từ máy chủ game...`, "info");

        try {
            // 2. CACHE-BUSTING: Nối thêm tham số thời gian để buộc Worker & Trình duyệt cào data mới
            const forceUrl = `${PROXY_URL}${uid}&_force=${Date.now()}`;
            const response = await utils.fetchFast(forceUrl);

            if (!response.uiData || !response.uiData.length) {
                throw new Error("Máy chủ game không phản hồi dữ liệu mới");
            }

            const newUiProfile = response.uiData[0];
            
            // 3. Cập nhật bộ nhớ trực tiếp (Memory Data)
            Object.values(response.rawJson).forEach((p) => {
                const d = p.profile || p;
                if (d.uin) this.data[d.uin] = d;
            });

            // 4. Đồng bộ hóa bộ nhớ đệm (LocalStorage Cache) để lần reload trang sau có ngay data mới
            const cacheKey = "mw_cache_" + this.currentUids.join("_");
            const cachedDataStr = localStorage.getItem(cacheKey);
            if (cachedDataStr) {
                try {
                    let cachedList = JSON.parse(cachedDataStr);
                    cachedList = cachedList.map(item => item.uid == uid ? newUiProfile : item);
                    localStorage.setItem(cacheKey, JSON.stringify(cachedList));
                } catch(err) {}
            }

            // 5. THAY THẾ IM LẶNG: Đổi thẻ Card cũ thành Card mới mà không làm giật trang
            const oldCard = document.getElementById(`profile-card-${uid}`);
            if (oldCard) {
                // Khóa tạm chiều cao để chống nhảy trang (Layout Shift)
                const oldHeight = oldCard.offsetHeight;
                oldCard.style.minHeight = `${oldHeight}px`;

                const newCard = this.createCardElement(newUiProfile, true);
                
                // Thêm viền sáng nhấp nháy báo hiệu đã tải xong data mới
                newCard.classList.add("flash-highlight");
                oldCard.replaceWith(newCard);

                setTimeout(() => { newCard.classList.remove("flash-highlight"); }, 1500);
            } else {
                this.search(this.currentUids.join(","));
            }

            this.toast(`Đã cập nhật UID ${uid} thành công!`, "success");

        } catch (err) {
            this.toast(`Lỗi làm mới dữ liệu: ${err.message}`, "error");
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.classList.remove("opacity-60", "cursor-not-allowed", "ring-2", "ring-emerald-400/50");
            }
            if (iconEl) iconEl.className = oldIconCls;
            if (textEl) textEl.innerText = "Tải lại";
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

    skeleton: (n) => Array(n).fill(0).map(() => `<div class="glass-panel rounded-3xl p-6 h-96 animate-pulse"><div class="flex gap-8"><div class="w-44 h-44 bg-white/5 rounded-[2.5rem] shrink-0"></div><div class="flex-grow space-y-4"><div class="h-10 bg-white/5 w-2/3 rounded-xl"></div><div class="h-6 bg-white/5 w-1/3 rounded-lg"></div><div class="h-32 bg-white/5 w-full rounded-2xl mt-4"></div></div></div></div>`).join(""),

// =========================================================================
    // HỆ THỐNG TOAST XẾP CHỒNG (STACKED TOASTS - TỐI ĐA 3 POPUP)
    // =========================================================================
    activeToasts: [],

    toast(msg, type = "success") {
        const container = document.getElementById("toast-container");
        if (!container) return;

        // Nếu đã có 3 popup, tiêu diệt ngay lập tức popup cũ nhất (FIFO)
        if (this.activeToasts.length >= 3) {
            const oldest = this.activeToasts.shift();
            if (oldest && oldest.el) {
                oldest.el.classList.add("toast-leave");
                setTimeout(() => oldest.el.remove(), 300);
                clearTimeout(oldest.timer);
            }
        }

        const toastId = Math.random().toString(36).substr(2, 9);
        const el = document.createElement("div");
        const isErr = type === "error";
        const icon = isErr ? "fa-circle-exclamation text-rose-400" : "fa-circle-check text-green-400";
        const border = isErr ? "border-l-rose-500" : "border-l-green-500";

        el.className = `toast-item toast-enter glass-panel px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/15 border-l-4 ${border} bg-[#0f172a]/95 text-white text-xs md:text-sm font-semibold w-full md:w-auto backdrop-blur-md`;
        el.innerHTML = `
            <i class="fa-solid ${icon} text-base shrink-0"></i>
            <span class="truncate flex-grow">${utils.escapeAttr(msg)}</span>
            <button onclick="this.parentElement.remove()" class="text-slate-500 hover:text-white pl-1 transition"><i class="fa-solid fa-xmark"></i></button>
        `;

        container.appendChild(el);
        
        // Kích hoạt animation xuất hiện
        el.offsetHeight; 
        el.classList.remove("toast-enter");

        const timer = setTimeout(() => {
            el.classList.add("toast-leave");
            setTimeout(() => {
                el.remove();
                this.activeToasts = this.activeToasts.filter(t => t.id !== toastId);
            }, 300);
        }, 3500);

        this.activeToasts.push({ id: toastId, el, timer });
    },

    // =========================================================================
    // QUẢN LÝ LỊCH SỬ VỚI FLIP ANIMATION & DUAL-ZONE BUTTONS
    // =========================================================================
    addHist(uid, name) {
        const n = (name || "Unknown").replace(/<[^>]+>/g, "").trim();
        this.history = this.history.filter((h) => h.uid != uid);
        this.history.unshift({ uid, name: n });
        if (this.history.length > 30) this.history.pop();
        localStorage.setItem("mw_h", JSON.stringify(this.history));
        this.renderHist();
    },

    // Xóa 1 phần tử lịch sử với hiệu ứng mượt mà
    deleteHist(uid, e) {
        if (e && e.stopPropagation) e.stopPropagation();
        
        const listEl = $("#history-list");
        const itemEl = listEl ? listEl.querySelector(`.hist-item[data-uid="${uid}"]`) : null;

        // 1. Ghi nhận vị trí tọa độ của tất cả ô lịch sử TRƯỚC KHI XÓA (FLIP - First)
        const oldPositions = {};
        if (listEl) {
            listEl.querySelectorAll(".hist-item").forEach(item => {
                oldPositions[item.dataset.uid] = item.getBoundingClientRect();
            });
        }

        // 2. Cập nhật mảng dữ liệu & LocalStorage
        this.history = this.history.filter(h => h.uid != uid);
        localStorage.setItem("mw_h", JSON.stringify(this.history));
        this.toast(`Đã xóa khỏi lịch sử: ${uid}`, "success");

        // 3. Nếu tìm thấy ô DOM, tạo hiệu ứng thu nhỏ biến mất rồi mới xếp lại lưới
        if (itemEl) {
            itemEl.classList.add("removing");
            setTimeout(() => {
                this.renderHist(oldPositions);
            }, 200);
        } else {
            this.renderHist(oldPositions);
        }
    },

    renderHist(oldPositions = null) {
        const l = $("#history-list");
        if (!l) return;
        if (!this.history.length) { 
            l.innerHTML = '<div class="col-span-2 text-center text-slate-500 italic text-xs py-4">Trống</div>'; 
            return; 
        }

        // RENDER GIAO DIỆN PHÂN VÙNG: Trái để tra cứu, Phải chứa nút Copy (trên) & Xóa (dưới)
        l.innerHTML = this.history.map((h) => `
            <div class="hist-item group relative overflow-hidden rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition flex items-stretch justify-between p-2 gap-2" data-uid="${h.uid}">
                <!-- Vùng Trái: Click để Tra cứu -->
                <div class="flex-grow min-w-0 flex flex-col justify-center cursor-pointer py-0.5" onclick="app.search('${h.uid}')" title="Click để tra cứu ${h.uid}">
                    <div class="font-bold text-sky-300 font-mono text-sm md:text-base group-hover:text-sky-200 transition truncate">${h.uid}</div>
                    <div class="text-xs text-slate-400 truncate">${utils.escapeAttr(h.name)}</div>
                </div>
                <!-- Vùng Phải: 2 Nút hành động cô lập -->
                <div class="flex flex-col justify-between items-center gap-1 pl-2 border-l border-white/10 shrink-0">
                    <button onclick="utils.copy('${h.uid}', this, 'UID', event)" class="w-7 h-6 rounded-lg bg-white/5 hover:bg-sky-500/20 text-slate-400 hover:text-sky-300 active:scale-90 transition flex items-center justify-center text-xs" title="Sao chép UID">
                        <i class="fa-regular fa-copy"></i>
                    </button>
                    <button onclick="app.deleteHist('${h.uid}', event)" class="w-7 h-6 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 active:scale-90 transition flex items-center justify-center text-xs" title="Xóa khỏi lịch sử">
                        <i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>
        `).join("");

        // 4. THUẬT TOÁN FLIP: Tự động tính độ lệch và trượt mượt mà các ô còn lại vào chỗ trống
        if (oldPositions) {
            l.querySelectorAll(".hist-item").forEach(item => {
                const uid = item.dataset.uid;
                if (oldPositions[uid]) {
                    const first = oldPositions[uid];
                    const last = item.getBoundingClientRect();
                    const deltaX = first.left - last.left;
                    const deltaY = first.top - last.top;

                    if (deltaX !== 0 || deltaY !== 0) {
                        // Invert: Đưa ô về lại vị trí cũ ngay tức thì
                        item.style.transition = "none";
                        item.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
                        
                        // Buộc trình duyệt vẽ lại (Reflow)
                        item.offsetHeight;

                        // Play: Trượt mượt mà về vị trí mới trong lưới
                        item.style.transition = "transform 0.35s cubic-bezier(0.2, 0, 0, 1)";
                        item.style.transform = "translate3d(0, 0, 0)";
                    }
                }
            });
        }
    },

    clearHistory() { 
        this.history = []; 
        localStorage.removeItem("mw_h"); 
        this.renderHist(); 
        this.toast("Đã xóa toàn bộ lịch sử tra cứu", "info");
    },

    share(uid) { utils.copy(`${location.protocol}//${location.host}${location.pathname}?uid=${uid}`); },
    openApi(uid) { window.open(PROXY_URL + uid, "_blank"); },

    showJson(uid) {
        this.curId = uid;
        this.curMode = "JSON";
        this.viewerLines = [];
        
        this.buildJson(null, this.data[uid], 0, true, "root", "");
        this.renderLinesFast();
        
        $("#modal-title").innerHTML = `<i class="fa-solid fa-code text-sky-400"></i> JSON DATA <span class="text-xs font-mono font-normal text-slate-400 ml-3 bg-white/10 px-2.5 py-0.5 rounded-full border border-white/10">${this.viewerLines.length} lines</span>`;
        $("#json-viewer-container").scrollTop = 0;
        this.openModal();
    },

    renderLinesFast() {
        const container = document.getElementById("code-viewer");
        if (!container) return;
        
        container.innerHTML = this.viewerLines.map((l, i) => `
            <div class="j-line ${l.collapsible && !l.open ? "collapsed" : ""}" id="jl-${l.id}" style="display:${l.visible ? "flex" : "none"}">
                <span class="j-num-col">
                    <span class="j-num">${i + 1}</span>
                    ${l.collapsible 
                        ? `<span class="j-toggle" id="jt-${l.id}" onclick="app.toggleLine('${l.id}')" data-tip="Click để thu gọn"><i class="fa-solid fa-angle-down text-[11px]"></i></span>` 
                        : `<span class="w-[18px] shrink-0"></span>` /* Thẻ giữ chỗ để số thứ tự luôn thẳng hàng tuyệt đối */
                    }
                </span>
                <span class="j-content" style="padding-left:${l.depth * 20}px">${l.html}</span>
            </div>
        `).join("");
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

    // =========================================================================
    // NÂNG CẤP BUILD JSON: QUÉT VÀ NHẬN DIỆN SMART LINK (HTTP/HTTPS)
    // =========================================================================
    buildJson(key, val, depth, isLast, pId = "root", currentPath = "") {
        const id = Math.random().toString(36).substr(2, 9);
        const base = { id, pId, depth, visible: true, open: true, html: "" };
        const wrap = (c, v, attr = "") => `<span class="${c}" ${attr}>${v}</span>`;
        
        let newPath = currentPath;
        if (key !== null) {
            newPath = currentPath ? (typeof key === "number" ? `${currentPath}[${key}]` : `${currentPath}.${key}`) : String(key);
        }

        const kHtml = key !== null 
            ? `${wrap("j-punc", '"')}${wrap("j-key text-sky-300 font-semibold", key, `title="Click để copy path: ${newPath}" onclick="app.copyJsonPath(event, '${newPath}')"`)}${wrap("j-punc", '": ')}` 
            : "";
        const comma = isLast ? "" : `<span class="j-punc text-slate-500">,</span>`;

        if (val === null || val === undefined) {
            this.viewerLines.push({ ...base, html: `${kHtml}${wrap("j-null text-rose-400 font-bold", "null")}${comma}` });
        } else if (typeof val !== "object") {
            let valClass = "j-str text-green-300";
            let valStr = typeof val === "string" ? `"${utils.escapeAttr(val)}"` : val;
            if (typeof val === "number") valClass = "j-num text-amber-300 font-bold";
            if (typeof val === "boolean") valClass = "j-bool text-purple-400 font-bold";
            
            // CHỈ GÁN DATA-URL VÀ CLASS J-LINK, KHÔNG DÙNG ONCLICK Ở ĐÂY
            if (typeof val === "string" && /^https?:\/\//i.test(val)) {
                const cleanUrl = utils.escapeAttr(val);
                valStr = `<span class="j-link" data-url="${cleanUrl}">"${cleanUrl}"</span>`;
                this.viewerLines.push({ ...base, html: `${kHtml}${valStr}${comma}` });
                return;
            }

            this.viewerLines.push({ ...base, html: `${kHtml}${wrap(valClass, valStr)}${comma}` });
        } else {
            const keys = Object.keys(val);
            const isArr = Array.isArray(val);
            const open = isArr ? "[" : "{", close = isArr ? "]" : "}";
            
            if (!keys.length) {
                this.viewerLines.push({ ...base, html: `${kHtml}${wrap("j-punc text-slate-400", open + close)}${comma}` });
            } else {
                const itemCount = `<span class="text-[10px] text-slate-500 ml-1 font-sans font-normal">(${keys.length} ${isArr ? 'items' : 'keys'})</span>`;
                const col = `<span class="j-collapsed-content cursor-pointer text-slate-400 hover:text-sky-300 bg-white/5 px-1.5 py-0.5 rounded ml-1" onclick="app.toggleLine('${id}')">...${itemCount} ${close}${comma}</span>`;
                this.viewerLines.push({ ...base, collapsible: true, html: `${kHtml}${wrap("j-punc text-slate-300 font-bold", open)}${col}` });
                keys.forEach((k, i) => {
                    this.buildJson(isArr ? Number(k) : k, val[k], depth + 1, i === keys.length - 1, id, newPath);
                });
                this.viewerLines.push({ id: `end-${id}`, pId: id, depth, visible: true, html: `${wrap("j-punc text-slate-300 font-bold", close)}${comma}` });
            }
        }
    },

    // =========================================================================
    // HỆ THỐNG XỬ LÝ SMART LINK & INTERACTIVE TOOLTIP (BỊ THIẾU TRƯỚC ĐÓ)
    // =========================================================================
    activeLinkUrl: null,
    activeLinkType: null,

    initSmartLinkEvents() {
        // 1. EVENT DELEGATION CHO CLICK LINK (Mở Action Menu hoặc Tab mới)
        document.addEventListener("click", (e) => {
            const linkEl = e.target.closest(".j-link");
            if (!linkEl) return;
            e.stopPropagation();
            
            const url = linkEl.getAttribute("data-url");
            if (!url) return;
            this.hideLinkTooltip();

            if (e.ctrlKey || e.metaKey) {
                window.open(url, "_blank");
                this.toast("Đã mở link trong Tab mới", "success");
                return;
            }

            this.activeLinkUrl = url;
            const info = linkEngine.classify(url);
            this.activeLinkType = info;

            $("#lm-url-text").innerText = url;
            $("#lm-icon").className = `fa-solid ${info.icon}`;
            $("#lm-icon-box").className = `w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 border ${info.badgeBg.replace('text-', 'border-').replace('/20', '/30')} ${info.color} bg-white/5`;
            $("#lm-type-badge").className = `px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${info.badgeBg}`;
            $("#lm-type-badge").innerText = info.type;

            const list = $("#lm-action-list");
            let html = "";
            
            if (info.type === 'IMAGE') {
                html += `<button onclick="app.lmAction('preview')" class="w-full px-4 py-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 active:scale-[0.98] flex items-center gap-3 transition text-left text-sky-300 font-bold border border-sky-500/20"><i class="fa-solid fa-expand w-5 text-center text-lg"></i> Xem ảnh toàn màn hình</button>`;
                html += `<button onclick="app.lmAction('copy-img')" class="w-full px-4 py-3 rounded-xl hover:bg-white/10 active:scale-[0.98] flex items-center gap-3 transition text-left text-amber-300 font-semibold"><i class="fa-solid fa-image w-5 text-center text-lg"></i> Sao chép hình ảnh</button>`;
            } else if (info.type === 'VIDEO' || info.type === 'AUDIO') {
                html += `<button onclick="app.lmAction('open')" class="w-full px-4 py-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 active:scale-[0.98] flex items-center gap-3 transition text-left text-rose-300 font-bold border border-rose-500/20"><i class="fa-solid fa-play w-5 text-center text-lg"></i> Phát ${info.label} này</button>`;
            } else if (info.type === 'DOCUMENT' || info.type === 'ARCHIVE') {
                html += `<button onclick="app.lmAction('download')" class="w-full px-4 py-3 rounded-xl bg-green-500/15 hover:bg-green-500/25 active:scale-[0.98] flex items-center gap-3 transition text-left text-green-300 font-bold border border-green-500/20"><i class="fa-solid fa-cloud-arrow-down w-5 text-center text-lg"></i> Tải xuống tệp máy chủ</button>`;
            }

            html += `<button onclick="app.lmAction('open')" class="w-full px-4 py-3 rounded-xl hover:bg-white/10 active:scale-[0.98] flex items-center gap-3 transition text-left text-slate-200"><i class="fa-solid fa-arrow-up-right-from-square w-5 text-center text-purple-400"></i> Mở liên kết trong Tab mới</button>`;
            html += `<button onclick="app.lmAction('copy-url')" class="w-full px-4 py-3 rounded-xl hover:bg-white/10 active:scale-[0.98] flex items-center gap-3 transition text-left text-slate-200"><i class="fa-regular fa-copy w-5 text-center text-sky-400"></i> Sao chép đường dẫn</button>`;
            if (info.type === 'IMAGE') {
                html += `<button onclick="app.lmAction('download')" class="w-full px-4 py-3 rounded-xl hover:bg-white/10 active:scale-[0.98] flex items-center gap-3 transition text-left text-green-400"><i class="fa-solid fa-download w-5 text-center"></i> Tải ảnh về máy</button>`;
            }

            list.innerHTML = html;
            const ov = $("#link-menu-overlay"), box = $("#link-menu-box");
            if (ov && box) {
                ov.classList.remove("hidden");
                setTimeout(() => { ov.classList.remove("opacity-0"); box.classList.remove("scale-95"); box.classList.add("scale-100"); }, 10);
            }
        });

        // 2. EVENT DELEGATION CHO HOVER (Hiển thị Tooltip đo kích thước)
        const tip = $("#link-tooltip");
        if (!tip) return;
        let timer = null;

        document.addEventListener("mouseover", async (e) => {
            const linkEl = e.target.closest(".j-link");
            if (!linkEl) return;
            
            const url = linkEl.getAttribute("data-url");
            if (!url) return;

            clearTimeout(timer);
            tip.classList.remove("hidden");
            setTimeout(() => tip.classList.remove("opacity-0"), 10);

            const info = linkEngine.classify(url);
            $("#lt-header").className = `px-3 py-2 bg-slate-800/90 border-b border-slate-700 font-mono font-bold flex justify-between items-center gap-2 ${info.bg}`;
            $("#lt-icon").className = `fa-solid ${info.icon} ${info.color}`;
            $("#lt-title").innerText = info.label;
            $("#lt-title").className = `truncate font-bold ${info.color}`;
            $("#lt-size").innerText = "Đang đo...";
            $("#lt-action-hint").innerHTML = `<i class="fa-solid fa-arrow-up-right-from-square"></i> Mở ${info.label.toLowerCase()}`;

            const img = $("#lt-img"), fileIcon = $("#lt-file-icon"), spinner = $("#lt-spinner");
            spinner.classList.remove("hidden");
            img.classList.add("hidden", "opacity-0");
            fileIcon.classList.add("hidden");

            if (info.type === 'IMAGE') {
                img.src = url;
                img.classList.remove("hidden");
                const tempImg = new Image();
                tempImg.src = url;
                tempImg.onload = async () => {
                    spinner.classList.add("hidden");
                    img.classList.remove("opacity-0");
                    const sizeStr = await linkEngine.getFileSize(url);
                    $("#lt-size").innerText = `${tempImg.naturalWidth}×${tempImg.naturalHeight} (${sizeStr})`;
                };
                tempImg.onerror = () => {
                    spinner.classList.add("hidden");
                    $("#lt-size").innerText = "Ảnh bảo mật / Web";
                };
            } else {
                spinner.classList.add("hidden");
                fileIcon.classList.remove("hidden");
                $("#lt-big-icon").className = `fa-solid ${info.icon} text-5xl ${info.color}`;
                $("#lt-file-desc").innerText = url.split('/').pop().split(/[\?#]/)[0] || url;
                const sizeStr = await linkEngine.getFileSize(url);
                $("#lt-size").innerText = sizeStr;
            }
        });

        document.addEventListener("mousemove", (e) => {
            if (tip.classList.contains("hidden")) return;
            const x = Math.min(e.clientX + 18, window.innerWidth - 300);
            const y = Math.min(e.clientY + 18, window.innerHeight - 250);
            tip.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        });

        document.addEventListener("mouseout", (e) => {
            if (e.target.closest(".j-link")) this.hideLinkTooltip();
        });
    },

    // 3. CÁC HÀM TIỆN ÍCH ĐÓNG/MỞ MENU VÀ THỰC THI ACTION
    closeLinkMenu(e) {
        if (e && e.target !== $("#link-menu-overlay")) return;
        const ov = $("#link-menu-overlay"), box = $("#link-menu-box");
        ov.classList.add("opacity-0"); box.classList.add("scale-95");
        setTimeout(() => ov.classList.add("hidden"), 200);
    },

    lmAction(action) {
        const url = this.activeLinkUrl;
        if (!url) return;
        this.closeLinkMenu();
        if (action === 'open' || action === 'download') window.open(url, "_blank");
        else if (action === 'copy-url') utils.copy(url);
        else if (action === 'copy-img') linkEngine.copyImageToClipboard(url);
        else if (action === 'preview') viewer.open(document.body, [{ url: url, dateStr: "Xem trước liên kết", tip: "Link Preview" }], 0);
    },

    hideLinkTooltip() {
        const tip = $("#link-tooltip");
        if (!tip || tip.classList.contains("hidden")) return;
        tip.classList.add("opacity-0");
        setTimeout(() => tip.classList.add("hidden"), 150);
    },

    copyJsonPath(e, path) {
        e.stopPropagation();
        utils.copy(path);
        this.toast(`Đã copy path: ${path}`, "success");
    },

    toggleLine(id) {
        const p = this.viewerLines.find((l) => l.id === id);
        if (!p) return;
        p.open = !p.open;
        
        const el = document.getElementById(`jl-${id}`);
        if (el) el.classList.toggle("collapsed", !p.open);

        // Cập nhật câu Tooltip theo trạng thái mới (Thu gọn <-> Bung mở)
        const togEl = document.getElementById(`jt-${id}`);
        if (togEl) {
            const newTip = p.open ? "Click để thu gọn" : "Click để bung mở";
            togEl.setAttribute("data-tip", newTip);
            const tipEl = document.getElementById("global-tooltip");
            if (tipEl && !tipEl.classList.contains("opacity-0")) tipEl.innerText = newTip;
        }
        
        const setVis = (pid, vis) => {
            for (let i = 0; i < this.viewerLines.length; i++) {
                const l = this.viewerLines[i];
                if (l.pId === pid) {
                    l.visible = vis;
                    const childEl = document.getElementById(`jl-${l.id}`);
                    if (childEl) childEl.style.display = vis ? "flex" : "none";
                    if (l.collapsible && l.open && vis) setVis(l.id, true);
                    else if (l.collapsible) setVis(l.id, false);
                }
            }
        };
        setVis(id, p.open);
    },

    // SỬA LỖI HIỂN THỊ FLEX CHO NÚT BUNG MỞ / THU GỌN TOÀN BỘ
    toggleAllJson(expand = true) {
        this.viewerLines.forEach(l => {
            if (l.collapsible) {
                l.open = expand;
                const el = document.getElementById(`jl-${l.id}`);
                if (el) el.classList.toggle("collapsed", !expand);
            }
            if (l.pId !== "root") {
                l.visible = expand;
                const el = document.getElementById(`jl-${l.id}`);
                if (el) el.style.display = expand ? "flex" : "none";
            }
        });
        this.toast(expand ? "Đã bung mở toàn bộ JSON" : "Đã thu gọn toàn bộ JSON", "success");
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
    imgs: [],
    cur: 0,
    x: 0, y: 0, s: 1, r: 0, fx: 1, fy: 1,
    tx: 0, ty: 0, ts: 1, tr: 0,
    isDrag: false, lx: 0, ly: 0,
    animId: null,
    isLerp: false,
    touchDist: 0, lastTap: 0,

    openAvatar(el, uid) {
        const info = app.avatars[uid];
        if (!info || !info.url) return;
        this.open(el, [info], 0);
    },

    openGallery(el, uid, idx) {
        const list = app.photos[uid] || [];
        if (!list.length) return;
        this.open(el, list, idx);
    },

    async open(el, imgList, idx) {
        this.imgs = imgList;
        this.cur = idx;
        if (!this.imgs || !this.imgs[this.cur] || !this.imgs[this.cur].url) return;

        const v = $("#viewer"), img = $("#v-img");
        const rect = el ? el.getBoundingClientRect() : null;

        this.x = this.tx = 0; this.y = this.ty = 0;
        this.s = this.ts = 1; this.r = this.tr = 0; this.fx = 1; this.fy = 1;
        
        img.src = this.imgs[this.cur].url;
        try { if (img.decode) await img.decode(); } catch (e) {}

        v.classList.remove("hidden");
        v.classList.remove("opacity-0");
        v.classList.add("pointer-events-none");

        if (rect && el) {
            const vw = window.innerWidth, vh = window.innerHeight;
            const startX = (rect.left + rect.width / 2) - (vw / 2);
            const startY = (rect.top + rect.height / 2) - (vh / 2);
            const startScale = Math.max(0.05, rect.width / Math.min(vw, 800));

            img.style.transition = "none";
            img.style.transform = `translate3d(${startX}px, ${startY}px, 0) scale(${startScale})`;
            img.style.opacity = "0.2";

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    img.style.transition = "transform 0.38s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.38s ease";
                    img.style.transform = "translate3d(0px, 0px, 0px) scale(1) rotate(0deg) scaleX(1) scaleY(1)";
                    img.style.opacity = "1";
                    setTimeout(() => {
                        img.style.transition = "none";
                        v.classList.remove("pointer-events-none");
                        this.startLerpLoop();
                    }, 380);
                });
            });
        } else {
            img.style.transition = "none";
            this.applyDirect();
            v.classList.remove("pointer-events-none");
            this.startLerpLoop();
        }

        this.update();
        window.addEventListener("keydown", this.key);
    },

    close() {
        this.stopLerpLoop();
        const v = $("#viewer"), img = $("#v-img");
        v.classList.add("pointer-events-none");
        img.style.transition = "transform 0.28s cubic-bezier(0.4, 0, 1, 1), opacity 0.28s ease";
        img.style.transform = `translate3d(${this.x}px, ${this.y + 60}px, 0) scale(${this.s * 0.7}) rotate(${this.r}deg)`;
        img.style.opacity = "0";
        v.classList.add("opacity-0");
        
        setTimeout(() => {
            v.classList.add("hidden");
            img.style.transform = "none";
            window.removeEventListener("keydown", this.key);
        }, 280);
    },

    async nav(d) {
        this.stopLerpLoop();
        this.cur = (this.cur + d + this.imgs.length) % this.imgs.length;
        this.resetTargets();
        
        const img = $("#v-img");
        img.style.transition = "transform 0.2s ease, opacity 0.2s ease";
        img.style.opacity = "0";
        img.style.transform = `translate3d(${d * 40}px, 0, 0) scale(0.92)`;
        
        setTimeout(async () => {
            img.src = this.imgs[this.cur].url;
            try { if (img.decode) await img.decode(); } catch(e){}
            
            img.style.transition = "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease";
            img.style.opacity = "1";
            img.style.transform = "translate3d(0, 0, 0) scale(1)";
            this.update();
            setTimeout(() => {
                img.style.transition = "none";
                this.startLerpLoop();
            }, 350);
        }, 200);
    },

    update() {
        $("#v-counter").innerText = `${this.cur + 1} / ${this.imgs.length}`;
        const dateEl = $("#v-date"), dateStr = this.imgs[this.cur].dateStr;
        if (dateStr && dateStr !== "Thời gian: Không rõ") {
            dateEl.innerText = dateStr; dateEl.classList.remove("hidden");
        } else {
            dateEl.classList.add("hidden");
        }
        this.updateZoomIndicator();
    },

    updateZoomIndicator() {
        const ind = document.getElementById("zoom-indicator");
        if (!ind) return;
        ind.innerText = Math.round(this.ts * 100) + "%";
        ind.classList.add("show");
        clearTimeout(this.zoomTimeout);
        this.zoomTimeout = setTimeout(() => ind.classList.remove("show"), 1200);
    },

    startLerpLoop() {
        if (this.isLerp) return;
        this.isLerp = true;
        const img = $("#v-img");
        if (!img) return;

        const loop = () => {
            if (!this.isLerp) return;
            
            this.x += (this.tx - this.x) * 0.25;
            this.y += (this.ty - this.y) * 0.25;
            this.s += (this.ts - this.s) * 0.25;
            this.r += (this.tr - this.r) * 0.25;

            if (Math.abs(this.tx - this.x) < 0.05) this.x = this.tx;
            if (Math.abs(this.ty - this.y) < 0.05) this.y = this.ty;
            if (Math.abs(this.ts - this.s) < 0.005) this.s = this.ts;
            if (Math.abs(this.tr - this.r) < 0.05) this.r = this.tr;

            img.style.transform = `translate3d(${this.x.toFixed(2)}px, ${this.y.toFixed(2)}px, 0) rotate(${this.r.toFixed(2)}deg) scale(${this.s.toFixed(3)}) scaleX(${this.fx}) scaleY(${this.fy})`;
            
            this.animId = requestAnimationFrame(loop);
        };
        this.animId = requestAnimationFrame(loop);
    },

    stopLerpLoop() {
        this.isLerp = false;
        if (this.animId) cancelAnimationFrame(this.animId);
    },

    applyDirect() {
        this.x = this.tx; this.y = this.ty; this.s = this.ts; this.r = this.tr;
        const img = $("#v-img");
        if (img) img.style.transform = `translate3d(${this.x}px, ${this.y}px, 0) rotate(${this.r}deg) scale(${this.s}) scaleX(${this.fx}) scaleY(${this.fy})`;
    },

    resetTargets() {
        this.tx = 0; this.ty = 0; this.ts = 1; this.tr = 0; this.fx = 1; this.fy = 1;
        this.updateZoomIndicator();
    },

    reset() { this.resetTargets(); },

    toggleOneToOne() {
        const img = $("#v-img");
        if (!img) return;
        if (Math.abs(this.ts - 1) < 0.05 && (this.tx !== 0 || this.ty !== 0)) {
            this.reset();
        } else if (Math.abs(this.ts - 1) < 0.05) {
            const ratio = img.naturalWidth ? (img.naturalWidth / img.clientWidth) : 2;
            this.ts = Math.max(1.5, Math.min(4, ratio));
            this.updateZoomIndicator();
        } else {
            this.reset();
        }
    },

    rotate(d) { this.tr += d; },
    flipH() { this.fx *= -1; },
    flipV() { this.fy *= -1; },
    
    zoom(d, clientX = window.innerWidth / 2, clientY = window.innerHeight / 2) {
        const oldS = this.ts;
        const newS = Math.min(Math.max(0.15, this.ts + d), 12);
        if (oldS === newS) return;

        const vw = window.innerWidth / 2, vh = window.innerHeight / 2;
        const mx = clientX - vw, my = clientY - vh;
        this.tx += (mx - this.tx) * (1 - newS / oldS);
        this.ty += (my - this.ty) * (1 - newS / oldS);
        this.ts = newS;
        
        this.updateZoomIndicator();
    },

    download() { window.open(this.imgs[this.cur].url, "_blank"); },
    openSource() {
        let url = this.imgs[this.cur].url;
        if (url.includes("images.weserv.nl")) {
            const match = url.match(/url=([^&]+)/);
            if (match && match[1]) url = decodeURIComponent(match[1]);
        }
        window.open(url, "_blank");
    },

    key(e) {
        if (e.key === "ArrowLeft") viewer.nav(-1);
        if (e.key === "ArrowRight") viewer.nav(1);
        if (e.key === "Escape") viewer.close();
        if (e.key === "0") viewer.toggleOneToOne();
    },

    initEvents() {
        const c = $("#v-container");
        if (!c) return;

        c.addEventListener("wheel", (e) => {
            e.preventDefault();
            const delta = e.deltaY * -0.0018 * Math.max(0.8, this.ts * 0.6);
            this.zoom(delta, e.clientX, e.clientY);
        }, { passive: false });

        c.addEventListener("mousedown", (e) => {
            if (e.button !== 0) return;
            this.isDrag = true;
            this.lx = e.clientX; this.ly = e.clientY;
            c.style.cursor = "grabbing";
        });
        window.addEventListener("mousemove", (e) => {
            if (!this.isDrag) return;
            e.preventDefault();
            this.tx += (e.clientX - this.lx);
            this.ty += (e.clientY - this.ly);
            this.lx = e.clientX; this.ly = e.clientY;
        });
        window.addEventListener("mouseup", () => {
            if (this.isDrag) {
                this.isDrag = false;
                c.style.cursor = "grab";
            }
        });

        c.addEventListener("dblclick", (e) => {
            e.preventDefault();
            this.toggleOneToOne();
        });

        c.addEventListener("touchstart", (e) => {
            if (e.touches.length === 1) {
                this.isDrag = true;
                this.lx = e.touches[0].clientX;
                this.ly = e.touches[0].clientY;
                const now = Date.now();
                if (now - this.lastTap < 280) {
                    this.toggleOneToOne();
                    this.isDrag = false;
                }
                this.lastTap = now;
            } else if (e.touches.length === 2) {
                this.isDrag = false;
                this.touchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
            }
        }, { passive: false });

        c.addEventListener("touchmove", (e) => {
            if (this.isDrag && e.touches.length === 1) {
                e.preventDefault();
                this.tx += e.touches[0].clientX - this.lx;
                this.ty += e.touches[0].clientY - this.ly;
                this.lx = e.touches[0].clientX;
                this.ly = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                e.preventDefault();
                const newDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                if (this.touchDist > 0) {
                    const delta = (newDist - this.touchDist) * 0.012;
                    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                    this.zoom(delta * Math.max(1, this.ts * 0.5), midX, midY);
                }
                this.touchDist = newDist;
            }
        }, { passive: false });

        c.addEventListener("touchend", () => {
            this.isDrag = false;
            this.touchDist = 0;
        });
    }
};

const bgAnim = {
    start() {
        const c = document.getElementById("star-canvas"), x = c.getContext("2d");
        let w, h, s = [], lastTime = 0;
        const fps = 30;
        const interval = 1000 / fps;

        const init = () => {
            w = c.width = window.innerWidth;
            h = c.height = window.innerHeight;
            s = [];
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
            if (delta < interval) return;
            lastTime = currentTime - (delta % interval);

            x.clearRect(0, 0, w, h);
            s.forEach((p) => {
                p.a += p.v;
                if (p.a > 1 || p.a < 0) p.v *= -1;
                p.y -= p.dy;
                if (p.y < 0) p.y = h;
                
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

document.addEventListener("DOMContentLoaded", () => { 
    app.init(); 
    viewer.initEvents(); 
    if(app.initSmartLinkEvents) app.initSmartLinkEvents(); 
});