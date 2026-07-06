export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
        return new Response(JSON.stringify({ success: false, error: 'Thiếu tham số url' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        // 1. Fetch dữ liệu từ Mini World
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*'
            }
        });
        const rawText = await response.text();

        // 2. Thuật toán Parse Lua sang JSON gốc của bạn
        const parseLua = (txt) => {
            if(!txt||typeof txt!=='string')return null; txt=txt.trim().replace(/^\ufeff/,''); let i=0,len=txt.length; const skip=()=>{while(i<len&&txt.charCodeAt(i)<=32)i++;};
            const parseStr=(q)=>{ i++;let s="";while(i<len){if(txt[i]===q)break;if(txt[i]==='\\'){const n=txt[i+1];if(n==='n'){i+=2;s+='\n'}else if(n==='r'){i+=2;s+='\r'}else if(n==='t'){i+=2;s+='\t'}else if(n==='"'){i+=2;s+='"'}else if(n==="'"){i+=2;s+="'"}else if(n==='\\'){i+=2;s+='\\'}else{s+='\\';i++}}else s+=txt[i++];}i++;return s;};
            const parseNum=()=>{const s=i;if(txt[i]==='-')i++;while(i<len&&/[0-9.eE+-]/.test(txt[i]))i++;return parseFloat(txt.substring(s,i));};
            const parseKey=()=>{if(txt[i]==='['){i++;skip();const k=(txt[i]==='"'||txt[i]==="'")?parseStr(txt[i]):parseNum();skip();i++;return k;}const s=i;while(i<len&&/[a-zA-Z0-9_]/.test(txt[i]))i++;return txt.substring(s,i);};
            const parseVal=()=>{skip();if(i>=len)return null;if(txt[i]==='{'){i++;skip();const o={};while(i<len&&txt[i]!=='}'){const k=parseKey();skip();if(txt[i]==='='||txt[i]===':'){i++;o[k]=parseVal();}skip();if(txt[i]===','||txt[i]===';')i++;skip();}i++;return o;}if(txt[i]==='"'||txt[i]==="'")return parseStr(txt[i]);if(/[0-9-]/.test(txt[i]))return parseNum();if(txt.startsWith('true',i)){i+=4;return true;}if(txt.startsWith('false',i)){i+=5;return false;}if(txt.startsWith('nil',i)){i+=3;return null;}i++;return null;};
            try{return parseVal();}catch(e){return null;}
        };

        const parsedData = parseLua(rawText);
        if (!parsedData) throw new Error("API trả về sai định dạng (Không phải Lua/Profile)");

        // 3. Trả về cả dữ liệu thô (để xem modal Lua) và dữ liệu JSON
        return new Response(JSON.stringify({
            success: true,
            rawLua: rawText,
            data: parsedData
        }), { 
            headers: { 'Content-Type': 'application/json;charset=UTF-8' } 
        });

    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}