import "./00_anima_i18n.js";
// adex_popup.js - AnimaDex 角色/画师组合弹窗（独立模块）
// 从 anima_prompt_composer.js 抽取，供透传/模糊搜索等节点独立使用
// 不依赖任何节点存在；由本插件任意节点加载时自动注册

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

    const _exportAdexPopup = () => {
            function openAdexChars(fixedMode) {
                const isTabbed = !fixedMode;
                const bx = document.createElement("div");
                bx.style.cssText = "position:fixed;top:5%;left:5%;width:90%;max-width:900px;height:88%;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid rgba(var(--anima-accent-rgb),.45);border-radius:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);display:flex;flex-direction:column;overflow:hidden;z-index:99999;";
                if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(bx);
                try{var _p=JSON.parse(localStorage.getItem("apc_adex_pos")||"{}");if(_p.left)bx.style.left=_p.left+"px";if(_p.top)bx.style.top=_p.top+"px";if(_p.w)bx.style.width=_p.w+"px";if(_p.h)bx.style.height=_p.h+"px";}catch(e){} setTimeout(function(){ window.clampPopup(bx); },0);
                const hdr = document.createElement("div");
                hdr.style.cssText = "display:flex;align-items:center;padding:16px 20px;border-bottom:1px solid rgba(var(--anima-accent-rgb),.25);flex-shrink:0;gap:10px;cursor:grab;user-select:none;";
                hdr.innerHTML = '<span style="color:#e2e8f0;font-weight:700;font-size:15px;">🔥 角色 (AnimaDex)</span>';
                const srch = document.createElement("input");
                srch.type = "text"; srch.placeholder = "搜索角色...";
                srch.style.cssText = "flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:var(--anima-well-lo);color:#e0e0e0;font-size:13px;outline:none;max-width:300px;";
                srch.onkeydown = (e) => { if (e.key === "Enter") { bx.dataset.page = "1"; bx.dataset.query = srch.value.trim(); if(bx.dataset.view==="fav") loadAdexFavs(bx); else if(bx.dataset.mode==="artist") loadAdexArtists(bx); else loadAdex(bx); } };
                hdr.appendChild(srch);
                // 筛选下拉
                const hairSel = document.createElement("select");
                hairSel.innerHTML = '<option value="">发色</option>';
                hairSel.style.cssText = "padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:var(--anima-well-lo);color:#ccc;font-size:11px;outline:none;cursor:pointer;max-width:85px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;";
                hairSel.onchange = () => { bx.dataset.page = "1"; loadAdex(bx); };
                hdr.appendChild(hairSel);
                const eyeSel = document.createElement("select");
                eyeSel.innerHTML = '<option value="">瞳色</option>';
                eyeSel.style.cssText = "padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:var(--anima-well-lo);color:#ccc;font-size:11px;outline:none;cursor:pointer;max-width:85px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;";
                eyeSel.onchange = () => { bx.dataset.page = "1"; loadAdex(bx); };
                hdr.appendChild(eyeSel);
                const seriesSel = document.createElement("select");
                seriesSel.innerHTML = '<option value="">系列</option>';
                seriesSel.style.cssText = "padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:var(--anima-well-lo);color:#ccc;font-size:12px;outline:none;cursor:pointer;max-width:95px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;";
                seriesSel.onchange = () => { bx.dataset.page = "1"; loadAdex(bx); };
                hdr.appendChild(seriesSel);
                bx._hairSel = hairSel; bx._eyeSel = eyeSel; bx._seriesSel = seriesSel;
                const cls = document.createElement("button");
                cls.textContent = "✕"; cls.title = animaTxt("关闭");
                cls.style.cssText = "background:rgba(233,69,96,0.15);border:1px solid rgba(233,69,96,0.4);color:#e94560;padding:5px 12px;cursor:pointer;font-size:12px;font-weight:600;border-radius:6px;transition:all 0.2s ease;";
                cls.onmouseover = () => { cls.style.background="rgba(233,69,96,0.3)"; cls.style.borderColor="#e94560"; };
                cls.onmouseout = () => { cls.style.background="rgba(233,69,96,0.15)"; cls.style.borderColor="rgba(233,69,96,0.4)"; };
                cls.onclick = () => { bx.remove(); window._adexOnSelect = null; }; hdr.appendChild(cls);
                // ── Anima 格式切换（仅 passthrough/advanced 调用时生效）──
                const fmtBtn = document.createElement("span");
                fmtBtn.textContent = "🌐 Anima"; fmtBtn.title = "切换 Anima 格式（下划线→空格，括号转义，画师加@）";
                fmtBtn.style.cssText = "padding:5px 10px;border-radius:8px;cursor:pointer;font-size:11px;color:#ccc;border:1px solid rgba(255,255,255,0.1);background:transparent;";
                fmtBtn.onclick = () => {
                    window._adexFormat = !window._adexFormat;
                    fmtBtn.style.background = window._adexFormat ? "var(--anima-title)" : "transparent";
                    fmtBtn.style.color = window._adexFormat ? "var(--anima-accent-soft)" : "#9ca3af";
                };
                if (window._adexFormat) { fmtBtn.style.background = "var(--anima-title)"; fmtBtn.style.color = "var(--anima-accent-soft)"; }
                hdr.appendChild(fmtBtn);
                const favBtn = document.createElement("span");
                favBtn.textContent = animaTxt("⭐ 收藏"); favBtn.title = animaTxt("AnimaDex 浏览器收藏");
                favBtn.style.cssText = "padding:5px 10px;border-radius:8px;cursor:pointer;font-size:11px;color:#ccc;border:1px solid rgba(255,255,255,0.1);background:transparent;flex-shrink:0;";
                favBtn.onclick = function(){
                    if (bx.dataset.view === "fav") {
                        bx.dataset.view = "search";
                        favBtn.style.background = "transparent"; favBtn.style.color = "#ccc";
                        bx.dataset.page = "1";
                        if (bx.dataset.mode === "artist") loadAdexArtists(bx); else loadAdex(bx);
                    } else {
                        bx.dataset.page = "1";
                        loadAdexFavs(bx);
                    }
                };
                hdr.appendChild(favBtn);
                bx._favBtn = favBtn;
                bx.appendChild(hdr);
                // header drag
                let _hdrDrag=false,_hdrDx=0,_hdrDy=0;
                hdr.onmousedown = function(e2){ if(e2.target.tagName==="INPUT"||e2.target.tagName==="SELECT"||e2.target.tagName==="BUTTON"||e2.target===fmtBtn||e2.target===favBtn)return; _hdrDrag=true;_hdrDx=e2.clientX-bx.offsetLeft;_hdrDy=e2.clientY-bx.offsetTop;e2.preventDefault(); };
                document.addEventListener("mousemove",function(e2){if(!_hdrDrag)return;bx.style.position="fixed";bx.style.left=(e2.clientX-_hdrDx)+"px";bx.style.top=(e2.clientY-_hdrDy)+"px";bx.style.margin="0"});
                document.addEventListener("mouseup",function(){_hdrDrag=false; try{localStorage.setItem("apc_adex_pos",JSON.stringify({left:parseInt(bx.style.left)||0,top:parseInt(bx.style.top)||0,w:bx.offsetWidth,h:bx.offsetHeight}));}catch(e){}});
                // ── 角色/画师 切换标签 ──
                const tabBar = document.createElement("div");
                tabBar.style.cssText = "display:flex;padding:6px 16px;gap:6px;border-bottom:1px solid rgba(var(--anima-accent-rgb),.25);flex-shrink:0;";
                if (!isTabbed) tabBar.style.display = "none";
                const charTab = document.createElement("span");
                charTab.textContent = animaTxt("👤 角色"); charTab.style.cssText = "padding:6px 16px;border-radius:8px;font-size:13px;cursor:pointer;background:var(--anima-title);color:var(--anima-accent-soft);font-weight:bold;";
                const artTab = document.createElement("span");
                artTab.textContent = animaTxt("🎨 画师"); artTab.style.cssText = "padding:6px 16px;border-radius:8px;font-size:13px;cursor:pointer;background:transparent;color:#ccc;";
                // 画师专属筛选（初始隐藏）
                const catSel = document.createElement("select");
                catSel.innerHTML = '<option value="">分类</option>';
                catSel.style.cssText = "padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:var(--anima-well-lo);color:#ccc;font-size:11px;outline:none;cursor:pointer;max-width:95px;flex-shrink:0;display:none;";
                catSel.onchange = () => { bx.dataset.page = "1"; loadAdexArtists(bx); };
                hdr.insertBefore(catSel, hairSel);
                const scoreSel = document.createElement("select");
                scoreSel.innerHTML = '<option value="">评分</option>';
                scoreSel.style.cssText = "padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:var(--anima-well-lo);color:#ccc;font-size:11px;outline:none;cursor:pointer;max-width:85px;flex-shrink:0;display:none;";
                scoreSel.onchange = () => { bx.dataset.page = "1"; loadAdexArtists(bx); };
                hdr.insertBefore(scoreSel, hairSel);
                function loadFacets(mode){
                    fetch("/danbooru_anima/animadex_facets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:mode})}).then(function(r){return r.json();}).then(function(fd){
                        if(!fd.success||!fd.facets) return;
                        function fillSel(sel, vals, label){
                            sel.innerHTML='<option value="">'+label+'</option>';
                            var tags=[];
                            vals.forEach(function(v){ var val=v.value||v; if(!val)return; var o=document.createElement("option");o.value=val;o.textContent=val.replace(/_/g," ");sel.appendChild(o);tags.push(val.replace(/ /g,"_").toLowerCase()); });
                            if(tags.length){fetch("/danbooru_anima/translate_tags",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tags:tags,cloud:false})}).then(function(r3){return r3.json();}).then(function(d2){var tl=(d2.success&&d2.translations)||{};for(var oi=1;oi<sel.options.length;oi++){var o2=sel.options[oi];var cn=tl[o2.value.replace(/ /g,"_").toLowerCase()]||"";if(cn)o2.textContent=o2.value.replace(/_/g," ")+" ("+cn+")";}}).catch(function(){});}
                        }
                        var f=fd.facets;
                        if(mode==="characters"){
                            if(f.hair_color&&f.hair_color.values)fillSel(hairSel,f.hair_color.values,"发色");
                            if(f.eye_color&&f.eye_color.values)fillSel(eyeSel,f.eye_color.values,"瞳色");
                            if(f.copyright&&f.copyright.values)fillSel(seriesSel,f.copyright.values,"系列");
                        } else {
                            if(f.category&&f.category.values)fillSel(catSel,f.category.values,"分类");
                            if(f.score&&f.score.values)fillSel(scoreSel,f.score.values,"评分");
                        }
                    }).catch(function(){});
                }
                function switchAdexTab(mode){
                    bx.dataset.mode=mode;bx.dataset.page="1";bx.dataset.query="";
                    if(mode==="char"){
                        charTab.style.background="var(--anima-title)";charTab.style.color="var(--anima-accent-soft)";charTab.style.fontWeight="bold";
                        artTab.style.background="transparent";artTab.style.color="#9ca3af";artTab.style.fontWeight="normal";
                        hairSel.style.display="";eyeSel.style.display="";seriesSel.style.display="";catSel.style.display="none";scoreSel.style.display="none";
                        srch.placeholder=animaTxt("搜索角色（支持中文）...");
                        loadFacets("characters");
                        if(bx.dataset.view==="fav") loadAdexFavs(bx); else loadAdex(bx);
                    } else {
                        artTab.style.background="var(--anima-title)";artTab.style.color="var(--anima-accent-soft)";artTab.style.fontWeight="bold";
                        charTab.style.background="transparent";charTab.style.color="#9ca3af";charTab.style.fontWeight="normal";
                        hairSel.style.display="none";eyeSel.style.display="none";seriesSel.style.display="none";catSel.style.display="";scoreSel.style.display="";
                        srch.placeholder=animaTxt("搜索画师...");
                        loadFacets("artists");
                        if(bx.dataset.view==="fav") loadAdexFavs(bx); else loadAdexArtists(bx);
                    }
                }
                charTab.onclick = () => { if(bx.dataset.mode!=="char") switchAdexTab("char"); };
                artTab.onclick = () => { if(bx.dataset.mode!=="artist") switchAdexTab("artist"); };
                tabBar.appendChild(charTab); tabBar.appendChild(artTab);
                bx.appendChild(tabBar);
                // 初始模式
                const initMode = fixedMode || "char";
                // 初始 facets 加载
                if (initMode === "char") { loadFacets("characters"); }
                else { loadFacets("artists"); hairSel.style.display="none"; eyeSel.style.display="none"; seriesSel.style.display="none"; catSel.style.display=""; scoreSel.style.display=""; }
                bx._catSel = catSel; bx._scoreSel = scoreSel;
                const grid = document.createElement("div");
                grid.style.cssText = "flex:1;overflow-y:auto;padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;align-content:start;";
                bx.appendChild(grid);
                const pager = document.createElement("div");
                pager.style.cssText = "display:flex;justify-content:center;align-items:center;gap:12px;padding:10px;border-top:1px solid rgba(var(--anima-accent-rgb),.25);flex-shrink:0;";
                const prevBtn = document.createElement("button"); prevBtn.textContent = "◀";
                prevBtn.style.cssText = "padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;background:transparent;color:#ccc;font-size:12px;";
                const pageLabel = document.createElement("span"); pageLabel.style.cssText = "color:#ccc;font-size:12px;";
                const nextBtn = document.createElement("button"); nextBtn.textContent = "▶";
                nextBtn.style.cssText = "padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;background:transparent;color:#ccc;font-size:12px;";
                prevBtn.onclick = () => { const p = parseInt(bx.dataset.page||"1"); if(p>1){bx.dataset.page=p-1; if(bx.dataset.view==="fav") loadAdexFavs(bx); else if(bx.dataset.mode==="artist") loadAdexArtists(bx); else loadAdex(bx);} };
                nextBtn.onclick = () => { const p = parseInt(bx.dataset.page||"1"); const tp = parseInt(bx.dataset.totalPages||"1"); if(p<tp){bx.dataset.page=p+1; if(bx.dataset.view==="fav") loadAdexFavs(bx); else if(bx.dataset.mode==="artist") loadAdexArtists(bx); else loadAdex(bx);} };
                pager.appendChild(prevBtn); pager.appendChild(pageLabel); pager.appendChild(nextBtn);
                bx.appendChild(pager);
                bx._grid = grid; bx._pageLabel = pageLabel; bx._prevBtn = prevBtn; bx._nextBtn = nextBtn;
                bx.dataset.page = "1"; bx.dataset.totalPages = "1"; bx.dataset.query = "";
                bx.dataset.mode = initMode; bx.dataset.view = "search";
                document.body.appendChild(bx);
                if (initMode === "artist") loadAdexArtists(bx); else loadAdex(bx);
            }

            async function loadAdex(pp) {
                pp.dataset.view = "search";
                if (pp._favBtn) { pp._favBtn.style.background = "transparent"; pp._favBtn.style.color = "#ccc"; }
                const page = parseInt(pp.dataset.page||"1");
                const query = pp.dataset.query||"";
                // 骨架加载
                pp._grid.innerHTML = "";
                for (let si = 0; si < 12; si++) {
                    const sk = document.createElement("div");
                    sk.style.cssText = "background:rgba(255,255,255,0.03);border-radius:12px;min-height:200px;animation:sk-pulse 1.5s infinite;";
                    pp._grid.appendChild(sk);
                }
                const hasFilter = pp._hairSel?.value||pp._eyeSel?.value||pp._seriesSel?.value;
                let url, body;
                if (hasFilter) {
                    url = "/danbooru_anima/animadex_search";
                    const filters = {};
                    if (pp._hairSel?.value) filters.hair_color = pp._hairSel.value.replace(/_/g," ");
                    if (pp._eyeSel?.value) filters.eye_color = pp._eyeSel.value.replace(/_/g," ");
                    if (pp._seriesSel?.value) filters.copyright = pp._seriesSel.value;
                    body = JSON.stringify({mode:"characters", query:query||"", filters, page, limit:50, sort:"count"});
                } else {
                    url = query ? "/anima_random/character_search" : "/anima_random/popular_chars?page="+page+"&limit=50";
                    body = query ? JSON.stringify({query, page}) : null;
                }
                try {
                    const r = await fetch(url, body ? {method:"POST",headers:{"Content-Type":"application/json"},body} : undefined);
                    const d = await r.json();
                    const items = d.tags || d.results || [];
                    pp._grid.innerHTML = "";
                    for (const it of items) {
                        const card = document.createElement("div");
                        card.style.cssText = "background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;overflow:hidden;cursor:pointer;transition:all 0.2s;position:relative;min-height:200px;";
                        card.onmouseover = () => { card.style.background="rgba(255,255,255,0.08)"; card.style.borderColor="rgba(11,140,233,0.4)"; card.style.transform="translateY(-2px)"; };
                        card.onmouseout = () => { card.style.background="rgba(255,255,255,0.04)"; card.style.borderColor="rgba(255,255,255,0.06)"; card.style.transform="none"; };
                        card.onclick = () => {
                            const tagName = it.slug || it.name;
                            if (pp && pp.remove) pp.remove();  // 输出后关闭弹窗
                            var picked = {name: tagName, tags: it.tags||[], thumb_url: it.thumb_url||"", copyright_name: it.copyright_name||""};
                            if (window._adexOnSelect) {
                                window._adexOnSelect(picked);
                            } else if (window._adexCharFallback) {
                                window._adexCharFallback(picked);
                            } else if (window._adexFallbackSelect) {
                                window._adexFallbackSelect(picked);
                            }
                        };
                        // 缩略图 loading 占位
                        const imgDiv = document.createElement("div");
                        imgDiv.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(255,255,255,0.03),rgba(255,255,255,0.06));";
                        const spinner = document.createElement("div");
                        spinner.style.cssText = "width:24px;height:24px;border:2px solid rgba(255,255,255,0.1);border-top-color:var(--anima-accent-soft);border-radius:50%;animation:sk-spin 0.8s linear infinite;";
                        imgDiv.appendChild(spinner);
                        card.appendChild(imgDiv);
                        if (it.thumb_url) {
                            const tn = document.createElement("img");
                            tn.src = "/danbooru_anima/animadex_image?url="+encodeURIComponent(it.thumb_url);
                            tn.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity 0.3s;";
                            tn.onload = () => { tn.style.opacity="1"; imgDiv.remove(); };
                            tn.onerror = () => { imgDiv.innerHTML = '<span style="font-size:16px;">🎭</span>'; };
                            card.appendChild(tn);
                        }
                        // 底部遮罩和信息
                        const mask = document.createElement("div");
                        mask.style.cssText = "position:absolute;bottom:0;left:0;right:0;padding:12px;background:linear-gradient(to top,rgba(14,14,18,0.95),rgba(14,14,18,0.3),transparent);";
                        const nm = document.createElement("div");
                        nm.textContent = it.name||"";
                        nm.style.cssText = "color:#fff;font-size:13px;font-weight:700;text-shadow:0 2px 4px rgba(0,0,0,0.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
                        mask.appendChild(nm);
                        if (it.copyright_name) {
                            const cp = document.createElement("div");
                            cp.textContent = it.copyright_name;
                            cp.style.cssText = "color:#ccc;font-size:10px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
                            mask.appendChild(cp);
                        }
                        card.appendChild(mask);
                        var starA = document.createElement("span");
                        starA.textContent = "\u2665"; starA.title = "\u4fdd\u5b58\u4e3a\u89d2\u8272\u5361";
                        starA.style.cssText = "position:absolute;top:8px;right:8px;font-size:20px;cursor:pointer;color:#bbb;z-index:2;opacity:0.9;text-shadow:0 1px 3px rgba(0,0,0,0.5);";
                        starA.onmouseover = function(){ starA.style.opacity="1"; if(!starA._saved)starA.style.color="#9ca3af"; };
                        starA.onmouseout = function(){ starA.style.opacity="0.9"; if(!starA._saved)starA.style.color="#555"; };
                        starA.onclick = function(e2){
                            e2.stopPropagation();
                            starA.style.color = "#e94560"; starA._saved = true;
                            try {
                                var tn = (it.slug||it.name).replace(/[\s-]+/g,"_").toLowerCase();
                                var tl = (it.tags||[]);
                                if (typeof tl === "string") tl = tl.split(/\s+/).filter(Boolean);
                                if (!Array.isArray(tl)) tl = [];
                                if (tn && tl.indexOf(tn) < 0) tl.unshift(tn);
                                saveCharCard(it.name||tn, it.copyright_name||"", tl, it.thumb_url||it.img_url||it.image_url||"", false);
                            } catch(e2) { console.error("saveCharCard error:", e2); }
                        };
                        card.appendChild(starA);
                        card.dataset.tags=(it.tags||[]).join(" ");
                        pp._grid.appendChild(card);
                    }
                    if (!query) pp.dataset.totalPages = String(d.total_pages || Math.max(1,Math.ceil((d.total||0)/36)));
                    else pp.dataset.totalPages = "1";
                    pp._pageLabel.textContent = "第 "+page+" / "+pp.dataset.totalPages+" 页";
                } catch(e) { pp._grid.innerHTML = '<div style="color:#e94560;text-align:center;padding:20px;grid-column:1/-1;">加载失败: '+e.message+'</div>'; }
            }

            // ── AnimaDex 画师加载 ──
            async function loadAdexArtists(pp) {
                pp.dataset.view = "search";
                if (pp._favBtn) { pp._favBtn.style.background = "transparent"; pp._favBtn.style.color = "#ccc"; }
                const page = parseInt(pp.dataset.page||"1");
                const query = pp.dataset.query||"";
                pp._grid.innerHTML = "";
                for (let si = 0; si < 8; si++) {
                    const sk = document.createElement("div");
                    sk.style.cssText = "background:rgba(255,255,255,0.03);border-radius:12px;min-height:200px;animation:sk-pulse 1.5s infinite;";
                    pp._grid.appendChild(sk);
                }
                try {
                    const catVal = pp._catSel?.value||"";
                    const scoreVal = pp._scoreSel?.value||"";
                    const filters = {};
                    if (catVal) filters.category = catVal;
                    if (scoreVal) filters.score = scoreVal;
                    const r = await fetch("/danbooru_anima/animadex_search",{
                        method:"POST",headers:{"Content-Type":"application/json"},
                        body:JSON.stringify({mode:"artists",query:query||"",filters,page,limit:50,sort:"count"})
                    });
                    const d = await r.json();
                    const items = d.results || [];
                    pp._grid.innerHTML = "";
                    if (!items.length) { pp._grid.innerHTML = '<div style="color:#888;text-align:center;padding:40px;grid-column:1/-1;">无结果</div>'; }
                    for (const it of items) {
                        const card = document.createElement("div");
                        card.style.cssText = "background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;overflow:hidden;cursor:pointer;transition:all 0.2s;position:relative;min-height:200px;";
                        card.onmouseover = () => { card.style.background="rgba(255,255,255,0.08)"; card.style.borderColor="rgba(11,140,233,0.4)"; card.style.transform="translateY(-2px)"; };
                        card.onmouseout = () => { card.style.background="rgba(255,255,255,0.04)"; card.style.borderColor="rgba(255,255,255,0.06)"; card.style.transform="none"; };
                        card.onclick = () => {
                            if (pp && pp.remove) pp.remove();  // 关弹窗（pp 直接挂在 body 下，绝不能 remove parentElement）
                            const tagName = (it.slug || it.name).replace(/[\s-]+/g,"_").toLowerCase();
                            // Anima 模式（🌐 Anima 按钮）：画师标签加 @ 前缀
                            const outName = window._adexFormat ? ("@" + tagName) : tagName;
                            if (window._adexOnSelect) {
                                var cb = window._adexOnSelect; window._adexOnSelect = null;
                                cb({name: outName, tags: it.tags||[], thumb_url: it.thumb_url||"", copyright_name: it.copyright_name||""});
                            } else if (window._adexFallbackSelect) {
                                window._adexFallbackSelect({name: outName, tags: it.tags||[], thumb_url: it.thumb_url||"", copyright_name: it.copyright_name||""});
                            }
                        };
                        const imgDiv = document.createElement("div");
                        imgDiv.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(255,255,255,0.03),rgba(255,255,255,0.06));";
                        const spinner = document.createElement("div");
                        spinner.style.cssText = "width:24px;height:24px;border:2px solid rgba(255,255,255,0.1);border-top-color:var(--anima-accent-soft);border-radius:50%;animation:sk-spin 0.8s linear infinite;";
                        imgDiv.appendChild(spinner); card.appendChild(imgDiv);
                        if (it.thumb_url) {
                            const tn = document.createElement("img");
                            tn.src = "/danbooru_anima/animadex_image?url="+encodeURIComponent(it.thumb_url);
                            tn.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity 0.3s;";
                            tn.onload = () => { tn.style.opacity="1"; imgDiv.remove(); };
                            tn.onerror = () => { imgDiv.innerHTML = '<span style="font-size:16px;">🎨</span>'; };
                            card.appendChild(tn);
                        }
                        const mask = document.createElement("div");
                        mask.style.cssText = "position:absolute;bottom:0;left:0;right:0;padding:12px;background:linear-gradient(to top,rgba(14,14,18,0.95),rgba(14,14,18,0.3),transparent);";
                        const nm = document.createElement("div");
                        nm.textContent = it.name||""; nm.style.cssText = "color:#fff;font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
                        mask.appendChild(nm); card.appendChild(mask);
                        pp._grid.appendChild(card);
                    }
                    pp.dataset.totalPages = String(d.total_pages || Math.max(1,Math.ceil((d.total||0)/36)));
                    pp._pageLabel.textContent = "第 "+page+" / "+pp.dataset.totalPages+" 页";
                } catch(e) { pp._grid.innerHTML = '<div style="color:#e94560;text-align:center;padding:20px;grid-column:1/-1;">加载失败: '+e.message+'</div>'; }
            }

            function _adexNormFavTags(raw) {
                if (!raw) return [];
                if (Array.isArray(raw)) return raw.map(function(x){ return String(x).trim(); }).filter(Boolean);
                var s = String(raw).trim();
                if (!s) return [];
                if (/[,，]/.test(s)) return s.split(/[,，]+/).map(function(x){ return x.trim(); }).filter(Boolean);
                return s.split(/\s+/).filter(Boolean);
            }
            function _adexMatchSearchHit(items, tag) {
                var want = String(tag).replace(/[\s-]+/g, "_").toLowerCase();
                var i, it, slug, nm;
                for (i = 0; i < (items || []).length; i++) {
                    it = items[i] || {};
                    slug = String(it.slug || "").replace(/[\s-]+/g, "_").toLowerCase();
                    nm = String(it.name || "").replace(/[\s-]+/g, "_").toLowerCase();
                    if (slug === want || nm === want) return it;
                }
                return (items && items[0]) || null;
            }
            async function _adexEnrichCharFav(tag, info) {
                info = info || {};
                var tags = _adexNormFavTags(info.tags);
                var thumb = info.thumb || "";
                var cp = info.copyright_name || info.series || "";
                var payload = {name: tag, tags: tags, thumb_url: thumb, copyright_name: cp};
                if (tags.length) return payload;
                try {
                    var q = String(tag).replace(/ /g, "_");
                    var r = await fetch("/danbooru_anima/animadex_search", {
                        method: "POST", headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({mode: "characters", query: q, page: 1, sort: "count"})
                    });
                    var d = await r.json();
                    var hit = _adexMatchSearchHit(d.results || d.tags || [], tag);
                    if (hit) {
                        payload.tags = _adexNormFavTags(hit.tags);
                        payload.thumb_url = hit.thumb_url || thumb;
                        payload.copyright_name = hit.copyright_name || cp;
                        payload.name = hit.slug || hit.name || tag;
                        if (!payload.tags.length) return payload;
                        fetch("/danbooru_anima/favorites/add", {
                            method: "POST", headers: {"Content-Type": "application/json"},
                            body: JSON.stringify({
                                tag: tag,
                                category: "animadex_characters",
                                thumb_url: payload.thumb_url || "",
                                cn: info.cn || "",
                                tags: payload.tags,
                                copyright_name: payload.copyright_name || ""
                            })
                        }).catch(function(){});
                    }
                } catch (e) {}
                return payload;
            }
            function _adexFavThumbSrc(thumb) {
                if (!thumb) return "";
                if (thumb.indexOf("/danbooru_anima/") === 0) return thumb;
                return "/danbooru_anima/animadex_image?url=" + encodeURIComponent(thumb);
            }
            function _adexFavKeys(coll) {
                var keys = Object.keys(coll || {}).filter(function(k){ return k.charAt(0) !== "_"; });
                var order = coll && coll._order;
                if (!Array.isArray(order) || !order.length) return keys;
                var seen = {}, out = [];
                for (var i = 0; i < order.length; i++) {
                    var k = order[i];
                    if (keys.indexOf(k) >= 0 && !seen[k]) { out.push(k); seen[k] = 1; }
                }
                for (var j = 0; j < keys.length; j++) { if (!seen[keys[j]]) out.push(keys[j]); }
                return out;
            }
            async function loadAdexFavs(pp) {
                pp.dataset.view = "fav";
                if (pp._favBtn) {
                    pp._favBtn.style.background = "var(--anima-title)";
                    pp._favBtn.style.color = "var(--anima-accent-soft)";
                }
                var isArt = pp.dataset.mode === "artist";
                var cat = isArt ? "animadex_artists" : "animadex_characters";
                pp._grid.innerHTML = '<div style="color:#888;text-align:center;padding:20px;grid-column:1/-1;">加载收藏...</div>';
                try {
                    var r = await fetch("/danbooru_anima/favorites");
                    var d = await r.json();
                    var coll = (d.favorites && d.favorites[cat]) || {};
                    var keys = _adexFavKeys(coll);
                    var q = (pp.dataset.query || "").toLowerCase();
                    if (q) {
                        keys = keys.filter(function(k) {
                            var cn = (coll[k] && coll[k].cn) || "";
                            return k.toLowerCase().indexOf(q) >= 0 || String(cn).toLowerCase().indexOf(q) >= 0;
                        });
                    }
                    var per = 30;
                    var pages = Math.max(1, Math.ceil(keys.length / per) || 1);
                    var page = parseInt(pp.dataset.page || "1") || 1;
                    if (page > pages) page = pages;
                    pp.dataset.page = String(page);
                    pp.dataset.totalPages = String(keys.length ? pages : 1);
                    pp._grid.innerHTML = "";
                    if (!keys.length) {
                        pp._grid.innerHTML = '<div style="color:#888;text-align:center;padding:40px;grid-column:1/-1;">暂无 AnimaDex 收藏，请先在 AnimaDex 浏览器点 ☆</div>';
                        if (pp._pageLabel) pp._pageLabel.textContent = animaTxt("收藏 0");
                        return;
                    }
                    var slice = keys.slice((page - 1) * per, page * per);
                    for (var si = 0; si < slice.length; si++) {
                        (function(tag) {
                            var info = coll[tag] || {};
                            var card = document.createElement("div");
                            card.style.cssText = "background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;overflow:hidden;cursor:pointer;transition:all 0.2s;position:relative;min-height:200px;";
                            card.onmouseover = function(){ card.style.background="rgba(255,255,255,0.08)"; card.style.borderColor="rgba(11,140,233,0.4)"; card.style.transform="translateY(-2px)"; };
                            card.onmouseout = function(){ card.style.background="rgba(255,255,255,0.04)"; card.style.borderColor="rgba(255,255,255,0.06)"; card.style.transform="none"; };
                            card.onclick = function() {
                                if (card._busy) return;
                                var thumb = info.thumb || "";
                                if (isArt) {
                                    if (pp && pp.remove) pp.remove();
                                    var tagName = String(tag).replace(/[\s-]+/g, "_").toLowerCase();
                                    var outName = window._adexFormat ? ("@" + tagName) : tagName;
                                    var payload = {name: outName, tags: _adexNormFavTags(info.tags), thumb_url: thumb, copyright_name: info.copyright_name || ""};
                                    if (window._adexOnSelect) {
                                        var cb = window._adexOnSelect; window._adexOnSelect = null;
                                        cb(payload);
                                    } else if (window._adexFallbackSelect) {
                                        window._adexFallbackSelect(payload);
                                    }
                                    return;
                                }
                                card._busy = true;
                                card.style.opacity = "0.65";
                                var cb2 = window._adexOnSelect;
                                var chFb = window._adexCharFallback;
                                var fb2 = window._adexFallbackSelect;
                                _adexEnrichCharFav(tag, info).then(function(payload2) {
                                    if (pp && pp.remove) pp.remove();
                                    if (cb2) cb2(payload2);
                                    else if (chFb) chFb(payload2);
                                    else if (fb2) fb2(payload2);
                                }).catch(function() {
                                    card._busy = false;
                                    card.style.opacity = "1";
                                });
                            };
                            var imgDiv = document.createElement("div");
                            imgDiv.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(255,255,255,0.03),rgba(255,255,255,0.06));";
                            imgDiv.textContent = isArt ? "🎨" : "🎭";
                            card.appendChild(imgDiv);
                            var src = _adexFavThumbSrc(info.thumb || "");
                            if (src) {
                                var tn = document.createElement("img");
                                tn.src = src;
                                tn.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity 0.3s;";
                                tn.onload = function(){ tn.style.opacity="1"; if (imgDiv.parentNode) imgDiv.remove(); };
                                tn.onerror = function(){ imgDiv.textContent = isArt ? "🎨" : "🎭"; };
                                card.appendChild(tn);
                            }
                            var mask = document.createElement("div");
                            mask.style.cssText = "position:absolute;bottom:0;left:0;right:0;padding:12px;background:linear-gradient(to top,rgba(14,14,18,0.95),rgba(14,14,18,0.3),transparent);";
                            var nm = document.createElement("div");
                            nm.textContent = String(tag).replace(/_/g, " ");
                            nm.style.cssText = "color:#fff;font-size:13px;font-weight:700;text-shadow:0 2px 4px rgba(0,0,0,0.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
                            mask.appendChild(nm);
                            if (info.cn) {
                                var cnEl = document.createElement("div");
                                cnEl.textContent = info.cn;
                                cnEl.style.cssText = "color:#ccc;font-size:10px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
                                mask.appendChild(cnEl);
                            }
                            card.appendChild(mask);
                            pp._grid.appendChild(card);
                        })(slice[si]);
                    }
                    if (pp._pageLabel) pp._pageLabel.textContent = "收藏 第 " + page + " / " + pages + " 页";
                } catch (e) {
                    pp._grid.innerHTML = '<div style="color:#e94560;text-align:center;padding:20px;grid-column:1/-1;">收藏加载失败</div>';
                }
            }
        window.openAdexPopup = openAdexChars;
        window._adexEnrichCharFav = _adexEnrichCharFav;
    };
    // 文件加载即导出（不依赖任何节点存在）
    _exportAdexPopup();
    // 同时注册扩展，保证闭包函数定义完整
    if (window.app?.registerExtension) {
        window.app.registerExtension({
            name: "danbooru-anima.adex-popup",
            async beforeRegisterNodeDef() {},
        });
    }
})();
