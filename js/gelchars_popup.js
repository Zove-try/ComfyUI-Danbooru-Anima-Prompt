import "./00_anima_i18n.js";
// gelchars_popup.js - G站 角色弹窗（独立模块）
// 从 anima_prompt_composer.js 抽取，供 newbie 等节点独立使用
// 不依赖任何节点存在；文件加载即注册

(() => {
// clampPopup：把弹窗限制在视口内（拖拽/恢复位置时调用，防止拖出页面卡死）
if (typeof window.clampPopup !== "function") {
    window.clampPopup = function(el) {
        try {
            const w = el.offsetWidth || 400, h = el.offsetHeight || 300;
            const m = 10;
            let L = parseInt(el.style.left) || 0, T = parseInt(el.style.top) || 0;
            const maxL = window.innerWidth - w - m, maxT = window.innerHeight - h - m;
            if (L < m) L = m;
            if (T < m) T = m;
            if (L > maxL) L = Math.max(m, maxL);
            if (T > maxT) T = Math.max(m, maxT);
            el.style.left = L + "px";
            el.style.top = T + "px";
        } catch(e) {}
    };
}

    const _exportGelChars = () => {
            function openGelChars() {
                const bx = document.createElement("div");
                bx.style.cssText = "position:fixed;top:5%;left:5%;width:90%;max-width:900px;height:88%;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid rgba(var(--anima-accent-rgb),.45);border-radius:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);display:flex;flex-direction:column;overflow:hidden;z-index:99999;";
                if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(bx);
                try{var _p2=JSON.parse(localStorage.getItem("apc_gelchar_pos")||"{}");if(_p2.left)bx.style.left=_p2.left+"px";if(_p2.top)bx.style.top=_p2.top+"px";if(_p2.w)bx.style.width=_p2.w+"px";if(_p2.h)bx.style.height=_p2.h+"px";}catch(e){} setTimeout(function(){ window.clampPopup(bx); },0);
                const hdr = document.createElement("div");
                hdr.style.cssText = "display:flex;align-items:center;padding:16px 20px;border-bottom:1px solid rgba(var(--anima-accent-rgb),.25);flex-shrink:0;gap:10px;cursor:grab;user-select:none;";
                hdr.innerHTML = '<span style="color:var(--anima-accent-soft);font-weight:700;font-size:15px;">🔵 G站 角色搜索</span>';
                const srch = document.createElement("input");
                srch.type = "text"; srch.placeholder = "搜索角色名（支持中文）...";
                srch.style.cssText = "flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:var(--anima-well-lo);color:#e0e0e0;font-size:13px;outline:none;max-width:180px;";
                const sugDrop = document.createElement("div");
                sugDrop.style.cssText = "display:none;position:absolute;top:100%;left:0;right:0;max-height:200px;overflow-y:auto;border:1px solid rgba(255,255,255,0.1);border-radius:8px;background:var(--anima-well-lo);z-index:10;margin-top:4px;";
                let _gelTimer = null;
                srch.oninput = () => { clearTimeout(_gelTimer); _gelTimer = setTimeout(() => { const q = srch.value.trim(); if(!q){sugDrop.style.display="none";return;} sugDrop.style.display="block"; sugDrop.innerHTML='<div style="color:#888;padding:8px;font-size:11px;">🔍 搜索中...</div>'; fetch("/gelbooru_anima/local_tags",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:q})}).then(r=>r.json()).then(d=>{const items=d.tags||[];sugDrop.innerHTML="";if(!items.length){sugDrop.style.display="none";return;} for(const t of items){const row=document.createElement("div");row.style.cssText="padding:6px 10px;cursor:pointer;font-size:11px;color:#b0bec5;border-bottom:1px solid rgba(255,255,255,0.04);";row.onmouseover=()=>row.style.background="rgba(255,255,255,0.06)";row.onmouseout=()=>row.style.background="transparent";row.onclick=()=>{sugDrop.style.display="none";srch.value=t.tag||"";bx.dataset.page="0";loadGel(bx);};row.textContent=(t.cn?t.cn+" ("+t.tag+")":t.tag||"");sugDrop.appendChild(row);}}).catch(()=>{sugDrop.style.display="none";});},200);};
                srch.onkeydown = (e) => { if(e.key==="Enter"){clearTimeout(_gelTimer);sugDrop.style.display="none";bx.dataset.page="0";loadGel(bx);} if(e.key==="Escape")sugDrop.style.display="none";};
                const srchWrap = document.createElement("div"); srchWrap.style.cssText = "position:relative;flex:1;max-width:350px;";
                srchWrap.appendChild(srch); srchWrap.appendChild(sugDrop); hdr.appendChild(srchWrap);
                const cls = document.createElement("button"); cls.textContent="✕"; cls.title=animaTxt("关闭"); cls.style.cssText="background:rgba(233,69,96,0.15);border:1px solid rgba(233,69,96,0.4);color:#e94560;padding:5px 12px;cursor:pointer;font-size:12px;font-weight:600;border-radius:6px;transition:all 0.2s ease;";
                cls.onmouseover=()=>{cls.style.background="rgba(233,69,96,0.3)";cls.style.borderColor="#e94560";}; cls.onmouseout=()=>{cls.style.background="rgba(233,69,96,0.15)";cls.style.borderColor="rgba(233,69,96,0.4)";}; cls.onclick=()=>bx.remove(); hdr.appendChild(cls); bx.appendChild(hdr);
                // header drag
                let _hdrDrag2=false,_hdrDx2=0,_hdrDy2=0;
                hdr.onmousedown = function(e2){ if(e2.target.tagName==="INPUT"||e2.target.tagName==="BUTTON")return; _hdrDrag2=true;_hdrDx2=e2.clientX-bx.offsetLeft;_hdrDy2=e2.clientY-bx.offsetTop;e2.preventDefault(); };
                document.addEventListener("mousemove",function(e2){if(!_hdrDrag2)return;bx.style.position="fixed";bx.style.left=(e2.clientX-_hdrDx2)+"px";bx.style.top=(e2.clientY-_hdrDy2)+"px";bx.style.margin="0"});
                document.addEventListener("mouseup",function(){_hdrDrag2=false; try{localStorage.setItem("apc_gelchar_pos",JSON.stringify({left:parseInt(bx.style.left)||0,top:parseInt(bx.style.top)||0,w:bx.offsetWidth,h:bx.offsetHeight}));}catch(e){}});
                const grid = document.createElement("div");
                grid.style.cssText = "flex:1;overflow-y:auto;padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;align-content:start;";
                bx.appendChild(grid);
                const pager = document.createElement("div");
                pager.style.cssText = "display:flex;justify-content:center;align-items:center;gap:12px;padding:10px;border-top:1px solid rgba(var(--anima-accent-rgb),.25);flex-shrink:0;";
                const prevBtn = document.createElement("button"); prevBtn.textContent="◀"; prevBtn.style.cssText="padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;background:transparent;color:#ccc;font-size:12px;";
                const pageLabel = document.createElement("span"); pageLabel.style.cssText="color:#ccc;font-size:12px;";
                const nextBtn = document.createElement("button"); nextBtn.textContent="▶"; nextBtn.style.cssText="padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;background:transparent;color:#ccc;font-size:12px;";
                prevBtn.onclick=()=>{const p=parseInt(bx.dataset.page||"0");if(p>0){bx.dataset.page=p-1;loadGel(bx);}};
                nextBtn.onclick=()=>{const p=parseInt(bx.dataset.page||"0");bx.dataset.page=p+1;loadGel(bx);};
                pager.appendChild(prevBtn);pager.appendChild(pageLabel);pager.appendChild(nextBtn);bx.appendChild(pager);
                bx._grid=grid;bx._pageLabel=pageLabel;bx._search=srch;bx.dataset.page="0";
                document.body.appendChild(bx);
            }
            window._openGelChars = openGelChars;

            async function loadGel(pp) {
                const page = parseInt(pp.dataset.page||"0");
                const q = pp._search.value.trim();
                if (!q) { pp._grid.innerHTML = '<div style="color:#888;text-align:center;padding:20px;">👆 输入角色名搜索</div>'; return; }
                pp._grid.innerHTML = '<div style="color:#888;text-align:center;padding:20px;">⏳ G站搜索中...</div>';
                try {
                    const r = await fetch("/gelbooru_anima/search", {
                        method:"POST", headers:{"Content-Type":"application/json"},
                        body: JSON.stringify({tags: q+" solo", page, limit: 20, rating: ["general"], order: "score:desc"})
                    });
                    const d = await r.json();
                    const items = d.posts || [];
                    pp._grid.innerHTML = "";
                    for (const it of items) {
                        const card = document.createElement("div");
                        card.style.cssText = "background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;overflow:hidden;cursor:pointer;transition:all 0.2s;position:relative;min-height:200px;";
                        card.onmouseover = () => { card.style.background="rgba(255,255,255,0.08)"; card.style.borderColor="rgba(129,199,132,0.4)"; card.style.transform="translateY(-2px)"; };
                        card.onmouseout = () => { card.style.background="rgba(255,255,255,0.04)"; card.style.borderColor="rgba(255,255,255,0.06)"; card.style.transform="none"; };
                        card.onclick = () => {
                            if (window._adexOnSelect) {
                                window._adexOnSelect({name: (it.name||pp._search.value||""), tags: it.tags||"", thumb_url: it.preview_url||it.file_url||it.thumb_url||"", copyright_name: (it.classified&&it.classified.series?it.classified.series[0]:"")||it.copyright||it.copyright_name||""});
                                return;
                            }
                            if (window._gelFallbackSelect) {
                                window._gelFallbackSelect({name: (it.name||pp._search.value||""), tags: it.tags||"", thumb_url: it.preview_url||it.file_url||it.thumb_url||"", copyright_name: (it.classified&&it.classified.series?it.classified.series[0]:"")||it.copyright||it.copyright_name||""});
                            }
                        };
                        if (it.preview_url) {
                            const tn = document.createElement("img");
                            tn.src = "/gelbooru_anima/image_proxy?url="+encodeURIComponent(it.preview_url);
                            tn.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity 0.3s;";
                            tn.onload = () => { tn.style.opacity="1"; }; tn.onerror = () => { tn.style.display="none"; };
                            card.appendChild(tn);
                            const imgDiv2 = document.createElement("div");
                            imgDiv2.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(255,255,255,0.03),rgba(255,255,255,0.06));";
                            const spinner = document.createElement("div");
                            spinner.style.cssText = "width:24px;height:24px;border:2px solid rgba(255,255,255,0.1);border-top-color:var(--anima-accent-soft);border-radius:50%;animation:sk-spin 0.8s linear infinite;";
                            imgDiv2.appendChild(spinner);
                            card.appendChild(imgDiv2);
                            tn.onload = () => { tn.style.opacity="1"; imgDiv2.remove(); };
                        }
                        const mask = document.createElement("div");
                        mask.style.cssText = "position:absolute;bottom:0;left:0;right:0;padding:12px;background:linear-gradient(to top,rgba(14,14,18,0.95),rgba(14,14,18,0.3),transparent);z-index:1;";
                        const nm = document.createElement("div");
                        nm.textContent = "#"+it.id;
                        nm.style.cssText = "color:#fff;font-size:13px;font-weight:700;text-shadow:0 2px 4px rgba(0,0,0,0.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
                        mask.appendChild(nm);
                        var starBtnG = document.createElement("span"); starBtnG.textContent = "♡"; starBtnG.title = "加入角色卡"; starBtnG.style.cssText = "position:absolute;top:4px;right:8px;cursor:pointer;font-size:14px;z-index:5;text-shadow:0 0 3px rgba(0,0,0,0.8);opacity:0.7;color:#888;"; starBtnG.onmouseover = function(){ starBtnG.style.opacity="1"; }; starBtnG.onmouseout = function(){ starBtnG.style.opacity="0.7"; }; starBtnG.onclick = function(e){ e.stopPropagation(); var nm = it.name || pp._search.value || (it.tags||"").split(/\s+/).filter(Boolean).filter(function(t){return !/^(1girl|1boy|solo|multiple)/i.test(t);})[0] || pp._search.value || ""; var tarr = it.tags; if(typeof tarr==="string") tarr = tarr.split(/\s+/).filter(Boolean); saveCharCard(nm,(it.classified&&it.classified.series?it.classified.series[0]:"")||it.copyright||it.copyright_name||"",tarr||[],it.preview_url||it.file_url||it.thumb_url||"",true); }; card.appendChild(mask); card.appendChild(starBtnG);
                        pp._grid.appendChild(card);
                    }
                    pp._pageLabel.textContent = "第 "+(page+1)+" 页";
                } catch(e) { pp._grid.innerHTML = '<div style="color:#e94560;text-align:center;padding:20px;">加载失败</div>'; }
            }
        window.openGelCharsPopup = openGelChars;
        window._openGelChars = openGelChars;
    };
    _exportGelChars();
    if (window.app?.registerExtension) {
        window.app.registerExtension({
            name: "danbooru-anima.gelchars-popup",
            async beforeRegisterNodeDef() {},
        });
    }
})();
