export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) return new Response(JSON.stringify({ success: false, error: 'Thiếu tham số url' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    try {
        const response = await fetch(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' } });
        const rawText = await response.text();

        // 1. Parse Lua (Giữ nguyên)
        const parseLua = (txt) => {
            if(!txt||typeof txt!=='string')return null; txt=txt.trim().replace(/^\ufeff/,''); let i=0,len=txt.length; const skip=()=>{while(i<len&&txt.charCodeAt(i)<=32)i++;};
            const parseStr=(q)=>{ i++;let s="";while(i<len){if(txt[i]===q)break;if(txt[i]==='\\'){const n=txt[i+1];if(n==='n'){i+=2;s+='\n'}else if(n==='r'){i+=2;s+='\r'}else if(n==='t'){i+=2;s+='\t'}else if(n==='"'){i+=2;s+='"'}else if(n==="'"){i+=2;s+="'"}else if(n==='\\'){i+=2;s+='\\'}else{s+='\\';i++}}else s+=txt[i++];}i++;return s;};
            const parseNum=()=>{const s=i;if(txt[i]==='-')i++;while(i<len&&/[0-9.eE+-]/.test(txt[i]))i++;return parseFloat(txt.substring(s,i));};
            const parseKey=()=>{if(txt[i]==='['){i++;skip();const k=(txt[i]==='"'||txt[i]==="'")?parseStr(txt[i]):parseNum();skip();i++;return k;}const s=i;while(i<len&&/[a-zA-Z0-9_]/.test(txt[i]))i++;return txt.substring(s,i);};
            const parseVal=()=>{skip();if(i>=len)return null;if(txt[i]==='{'){i++;skip();const o={};while(i<len&&txt[i]!=='}'){const k=parseKey();skip();if(txt[i]==='='||txt[i]===':'){i++;o[k]=parseVal();}skip();if(txt[i]===','||txt[i]===';')i++;skip();}i++;return o;}if(txt[i]==='"'||txt[i]==="'")return parseStr(txt[i]);if(/[0-9-]/.test(txt[i]))return parseNum();if(txt.startsWith('true',i)){i+=4;return true;}if(txt.startsWith('false',i)){i+=5;return false;}if(txt.startsWith('nil',i)){i+=3;return null;}i++;return null;};
            try{return parseVal();}catch(e){return null;}
        };
        const parsedData = parseLua(rawText);
        if (!parsedData) throw new Error("API trả về sai định dạng");

        // 2. Các hàm xử lý dữ liệu dời từ Frontend lên
        const timeAgo = (ts) => { if(!ts)return""; const d=Math.floor(Date.now()/1000)-ts; if(d<60)return"Vừa xong"; if(d<3600)return`${Math.floor(d/60)} phút trước`; if(d<86400)return`${Math.floor(d/3600)} giờ trước`; if(d<2592000)return`${Math.floor(d/86400)} ngày trước`; return`${Math.floor(d/31536000)} năm trước`; };
        const fmtTime = (ts) => ts ? new Date(ts*1000).toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',second:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'}) : "N/A";
        const fmtUpdate = (ts) => { if(!ts)return"N/A"; const d=new Date(ts*1000); return`${['Chủ Nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'][d.getDay()]}, ${d.toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',second:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'})} (${timeAgo(ts)})`; };
        const replaceSlash = (t) => { if(typeof t !== 'string') return t; return t.replace(/\\(30|[12][0-9]|[1-9])(?!\d)/g,' ').replace(/\\(?=[\r\n]|$)/g,''); };
        const parseMood = (t) => { let clean = replaceSlash(t); if (!clean || String(clean).trim() === '') return null; let s = String(clean).replace(/</g,"&lt;").replace(/>/g, "&gt;").replace(/(https?:\/\/[^\s]+)/g,'<a href="$1" target="_blank" class="text-sky-400 hover:underline" onclick="event.stopPropagation()">$1</a>').replace(/\n/g,"<br>"); return s.split(/(#[RGBYPWKnlbL]|#c[0-9a-fA-F]{6})/g).map(p=>{if(p.startsWith('#')){const c=p.substring(1);if(c==='n')return'</span><span style="color:inherit">';if(c==='b')return'</span><span class="blink-text">';if(c.startsWith('c'))return`</span><span style="color:#${c.substring(1)}">`;const m={R:'#f87171',G:'#4ade80',B:'#60a5fa',Y:'#facc15',P:'#f472b6'};return m[c]?`</span><span style="color:${m[c]}">`:'';}return p;}).join(''); };
        const getImg = (u) => !u ? "https://www.miniworldgame.com/static/images/icon.png" : u.startsWith("http:") ? `https://images.weserv.nl/?url=${encodeURIComponent(u)}&w=1200&output=webp&q=90` : u;
        const parsePhotoDate = (dir) => { if(!dir || String(dir).length !== 8) return null; const dStr = String(dir); const y = dStr.substring(0,4), m = dStr.substring(4,6), d = dStr.substring(6,8); const date = new Date(`${y}-${m}-${d}`); if (isNaN(date.getTime())) return null; const ts = date.getTime()/1000; return { str: `${d}/${m}/${y}`, ago: timeAgo(ts), full: `${d}/${m}/${y} (${timeAgo(ts)})` }; };

        // 3. Mapping: Chuyển đổi dữ liệu cồng kềnh thành UI Data siêu nhẹ
        const list = Object.values(parsedData);
        const uiData = list.map(p => {
            const d = p.profile || p;
            const uid = d.uin;
            let nameRaw = d.RoleInfo?.NickName || d.NickName || String(uid);
            let nameH = parseMood(nameRaw) || nameRaw;
            
            return {
                uid: uid,
                nameH: nameH,
                nameRaw: nameRaw,
                avatar: getImg(d.header?.url || d.header2?.url),
                moodH: parseMood(d.mood_text),
                moodIcon: d.mood_icon,
                gender: d.gender,
                country: d.country,
                lang: d.lang,
                model: d.RoleInfo?.Model || "N/A",
                skin: d.RoleInfo?.SkinID || d.SkinID || "N/A",
                diyTime: d.custom_skin?.cc_time ? fmtTime(d.custom_skin.cc_time) : (d.cc_time ? fmtTime(d.cc_time) : "N/A"),
                dLvl: d.creator?.level || 0,
                dStat: d.creator?.stat || 0,
                dPerm: d.permission?.display || 0,
                dDl: (d.all_download_count || 0).toLocaleString(),
                dFrame: d.head_frame_id || "Default",
                eLvl: d.expert?.level || 0,
                eStat: d.expert?.stat || 0,
                eScore: d.expert?.score || 0,
                eMax: d.expert?.score_max || 0,
                ePt: d.expert?.points || 0,
                eTime: d.expert?.invite_time ? fmtTime(d.expert.invite_time) : "N/A",
                repCount: d.report_rt ? (typeof d.report_rt == 'object' ? Object.keys(d.report_rt).length : d.report_rt) : 0,
                wlTime: d.rt_white ? fmtTime(d.rt_white) : "Không",
                updateTimeStr: fmtUpdate(d._t_),
                photos: d.photo ? Object.values(d.photo).map(i => {
                    const dateInfo = parsePhotoDate(i.dir);
                    return { url: getImg(i.url), dateStr: dateInfo ? `Thời gian: ${dateInfo.full}` : "Thời gian: Không rõ", tip: dateInfo ? dateInfo.full : "Không rõ thời gian" };
                }) : []
            };
        });

        // 4. Trả về cả 3 loại dữ liệu
        return new Response(JSON.stringify({
            success: true,
            rawLua: rawText,
            rawJson: parsedData,
            uiData: uiData
        }), { headers: { 'Content-Type': 'application/json;charset=UTF-8' } });

    } catch (e) {
        return new Response(JSON.stringify({
            success: true,
            rawLua: rawText,
            rawJson: parsedData,
            uiData: uiData
        }), { 
            headers: { 
                'Content-Type': 'application/json;charset=UTF-8',
                // Lưu cache trên hệ thống Cloudflare trong 1 phút (60 giây)
                'Cache-Control': 'public, max-age=60, s-maxage=60' 
            } 
        });
    }
}