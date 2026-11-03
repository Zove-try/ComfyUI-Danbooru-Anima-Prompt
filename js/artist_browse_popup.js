import "./00_anima_i18n.js";
// artist_browse_popup.js - AnimaDex 画师弹窗（独立模块）
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

    const _exportArtistBrowse = () => {
            function openArtistBrowse() {
                const bx = document.createElement("div");
                bx.style.cssText = "position:fixed;top:5%;left:5%;width:90%;max-width:900px;height:88%;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid rgba(var(--anima-accent-rgb),.45);border-radius:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);display:flex;flex-direction:column;overflow:hidden;z-index:99999;";
                if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(bx);
                try{var _p3=JSON.parse(localStorage.getItem("apc_artist_pos")||"{}");if(_p3.left)bx.style.left=_p3.left+"px";if(_p3.top)bx.style.top=_p3.top+"px";if(_p3.w)bx.style.width=_p3.w+"px";if(_p3.h)bx.style.height=_p3.h+"px";}catch(e){} setTimeout(function(){ window.clampPopup(bx); },0);
                const hdr = document.createElement("div");
                hdr.style.cssText = "display:flex;align-items:center;padding:16px 20px;border-bottom:1px solid rgba(var(--anima-accent-rgb),.25);flex-shrink:0;gap:10px;cursor:grab;user-select:none;";
                hdr.innerHTML = '<span style="color:#ffd93d;font-weight:700;font-size:15px;">🎨 画师 (AnimaDex)</span>';
                const srch = document.createElement("input");
                srch.type = "text"; srch.placeholder = animaTxt("搜索画师...");
                srch.style.cssText = "flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:var(--anima-well-lo);color:#e0e0e0;font-size:13px;outline:none;max-width:300px;";
                srch.onkeydown = (e) => { if(e.key==="Enter"){bx.dataset.page="1";bx.dataset.query=srch.value.trim(); if(bx.dataset.view==="fav") loadArtistFavs(bx); else loadArtist(bx);} };
                hdr.appendChild(srch);
                // 分类筛选
                const acatSel = document.createElement("select");
                acatSel.innerHTML = '<option value="">分类</option>';
                acatSel.style.cssText = "padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:var(--anima-well-lo);color:#ccc;font-size:11px;outline:none;cursor:pointer;max-width:85px;flex-shrink:0;";
                acatSel.onchange = () => { bx.dataset.page = "1"; loadArtist(bx); };
                hdr.appendChild(acatSel);
                bx._acatSel = acatSel;
                const ascoreSel = document.createElement("select");
                ascoreSel.innerHTML = '<option value="">评分</option>';
                ascoreSel.style.cssText = "padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:var(--anima-well-lo);color:#ccc;font-size:11px;outline:none;cursor:pointer;max-width:75px;flex-shrink:0;";
                ascoreSel.onchange = () => { bx.dataset.page = "1"; loadArtist(bx); };
                hdr.appendChild(ascoreSel);
                bx._ascoreSel = ascoreSel;
                // 排序切换：热门 / 随机
                bx._aSort = "count";
                const ahotBtn = document.createElement("span");
                ahotBtn.textContent = "🔥"; ahotBtn.title = "热门画师";
                ahotBtn.style.cssText = "padding:4px 8px;border-radius:6px 0 0 6px;cursor:pointer;font-size:13px;color:var(--anima-accent-soft);border:1px solid var(--anima-accent-soft);background:var(--anima-title);transition:all 0.2s ease;";
                ahotBtn.onclick = function(){
                    bx._aSort = "count";
                    ahotBtn.style.background = "var(--anima-title)"; ahotBtn.style.color = "var(--anima-accent-soft)"; ahotBtn.style.borderColor = "var(--anima-accent-soft)";
                    arandBtn.style.background = "transparent"; arandBtn.style.color = "#9ca3af"; arandBtn.style.borderColor = "rgba(255,255,255,0.1)";
                    bx.dataset.page = "1"; loadArtist(bx);
                };
                hdr.appendChild(ahotBtn);
                const arandBtn = document.createElement("span");
                arandBtn.textContent = "🎲"; arandBtn.title = "随机画师（点击换一批）";
                arandBtn.style.cssText = "padding:4px 8px;border-radius:0 6px 6px 0;cursor:pointer;font-size:13px;color:#ccc;border:1px solid rgba(255,255,255,0.1);background:transparent;transition:all 0.2s ease;";
                arandBtn.onclick = function(){
                    bx._aSort = "random";
                    arandBtn.style.background = "var(--anima-title)"; arandBtn.style.color = "var(--anima-accent-soft)"; arandBtn.style.borderColor = "var(--anima-accent-soft)";
                    ahotBtn.style.background = "transparent"; ahotBtn.style.color = "#9ca3af"; ahotBtn.style.borderColor = "rgba(255,255,255,0.1)";
                    bx.dataset.page = "1"; loadArtist(bx);
                };
                hdr.appendChild(arandBtn);
                const favBtn = document.createElement("span");
                favBtn.textContent = animaTxt("⭐ 收藏"); favBtn.title = animaTxt("AnimaDex 浏览器收藏");
                favBtn.style.cssText = "padding:5px 10px;border-radius:8px;cursor:pointer;font-size:11px;color:#ccc;border:1px solid rgba(255,255,255,0.1);background:transparent;flex-shrink:0;";
                favBtn.onclick = function(){
                    if (bx.dataset.view === "fav") {
                        bx.dataset.view = "search";
                        favBtn.style.background = "transparent"; favBtn.style.color = "#ccc";
                        bx.dataset.page = "1";
                        loadArtist(bx);
                    } else {
                        bx.dataset.page = "1";
                        loadArtistFavs(bx);
                    }
                };
                hdr.appendChild(favBtn);
                bx._favBtn = favBtn;
                const cls = document.createElement("button"); cls.textContent="✕"; cls.title=animaTxt("关闭"); cls.style.cssText="background:rgba(233,69,96,0.15);border:1px solid rgba(233,69,96,0.4);color:#e94560;padding:5px 12px;cursor:pointer;font-size:12px;font-weight:600;border-radius:6px;transition:all 0.2s ease;";
                cls.onmouseover=()=>{cls.style.background="rgba(233,69,96,0.3)";cls.style.borderColor="#e94560";}; cls.onmouseout=()=>{cls.style.background="rgba(233,69,96,0.15)";cls.style.borderColor="rgba(233,69,96,0.4)";}; cls.onclick=()=>{ window._adexOnSelect = null; bx.remove(); }; hdr.appendChild(cls); bx.appendChild(hdr);
                // header drag
                let _hdrDrag3=false,_hdrDx3=0,_hdrDy3=0;
                hdr.onmousedown = function(e2){ if(e2.target.tagName==="INPUT"||e2.target.tagName==="SELECT"||e2.target.tagName==="BUTTON"||e2.target===favBtn)return; _hdrDrag3=true;_hdrDx3=e2.clientX-bx.offsetLeft;_hdrDy3=e2.clientY-bx.offsetTop;e2.preventDefault(); };
                document.addEventListener("mousemove",function(e2){if(!_hdrDrag3)return;bx.style.position="fixed";bx.style.left=(e2.clientX-_hdrDx3)+"px";bx.style.top=(e2.clientY-_hdrDy3)+"px";bx.style.margin="0"});
                document.addEventListener("mouseup",function(){_hdrDrag3=false; try{localStorage.setItem("apc_artist_pos",JSON.stringify({left:parseInt(bx.style.left)||0,top:parseInt(bx.style.top)||0,w:bx.offsetWidth,h:bx.offsetHeight}));}catch(e){}});
                const grid = document.createElement("div");
                grid.style.cssText = "flex:1;overflow-y:auto;padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;align-content:start;";
                bx.appendChild(grid);
                const pager = document.createElement("div");
                pager.style.cssText = "display:flex;justify-content:center;align-items:center;gap:12px;padding:10px;border-top:1px solid rgba(var(--anima-accent-rgb),.25);flex-shrink:0;";
                const prevBtn = document.createElement("button"); prevBtn.textContent="◀"; prevBtn.style.cssText="padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;background:transparent;color:#ccc;font-size:12px;";
                const pageLabel = document.createElement("span"); pageLabel.style.cssText="color:#ccc;font-size:12px;";
                const nextBtn = document.createElement("button"); nextBtn.textContent="▶"; nextBtn.style.cssText="padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;background:transparent;color:#ccc;font-size:12px;";
                prevBtn.onclick=()=>{
                    if (bx._aSort === "random") { loadArtist(bx); return; }
                    const p=parseInt(bx.dataset.page||"1");if(p>1){bx.dataset.page=p-1; if(bx.dataset.view==="fav") loadArtistFavs(bx); else loadArtist(bx);}
                };
                nextBtn.onclick=()=>{
                    if (bx._aSort === "random") { loadArtist(bx); return; }
                    const p=parseInt(bx.dataset.page||"1"); if(bx.dataset.view==="fav"){ const tp=parseInt(bx.dataset.totalPages||"1"); if(p<tp){bx.dataset.page=p+1; loadArtistFavs(bx);} } else { bx.dataset.page=p+1; loadArtist(bx); }
                };
                pager.appendChild(prevBtn);pager.appendChild(pageLabel);pager.appendChild(nextBtn);bx.appendChild(pager);
                bx._grid=grid;bx._pageLabel=pageLabel;bx.dataset.page="1";bx.dataset.totalPages="10";bx.dataset.query="";bx.dataset.view="search";
                document.body.appendChild(bx);loadArtist(bx);
                // load artist facets
                fetch("/danbooru_anima/animadex_facets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"artists"})}).then(function(r){return r.json();}).then(function(fd){
                    if(!fd.success||!fd.facets) return;
                    var f = fd.facets;
                    function _fillSel(sel, vals, label){
                        sel.innerHTML='<option value="">'+label+'</option>';
                        var tags=[];
                        vals.forEach(function(v){ var val=v.value||v; if(!val)return; var o=document.createElement("option");o.value=val;o.textContent=val.replace(/_/g," ");sel.appendChild(o);tags.push(val.replace(/ /g,"_").toLowerCase()); });
                        if(tags.length){fetch("/danbooru_anima/translate_tags",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tags:tags,cloud:false})}).then(function(r3){return r3.json();}).then(function(d2){var tl=(d2.success&&d2.translations)||{};for(var oi=1;oi<sel.options.length;oi++){var o2=sel.options[oi];var cn=tl[o2.value.replace(/ /g,"_").toLowerCase()]||"";if(cn)o2.textContent=o2.value.replace(/_/g," ")+" ("+cn+")";}}).catch(function(){});}
                    }
                    if(f.category&&f.category.values) _fillSel(acatSel,f.category.values,"分类");
                    if(f.score&&f.score.values) _fillSel(ascoreSel,f.score.values,"评分");
                }).catch(function(e){ console.error("facets load error:", e); });
            }

            async function loadArtist(pp) {
                pp.dataset.view = "search";
                if (pp._favBtn) { pp._favBtn.style.background = "transparent"; pp._favBtn.style.color = "#ccc"; }
                const page = parseInt(pp.dataset.page||"1");
                const query = pp.dataset.query||"";
                pp._grid.innerHTML = '<div style="color:#888;text-align:center;padding:20px;">⏳ 加载中...</div>';
                try {
                    const catVal = pp._acatSel?.value||"";
                    const scoreVal = pp._ascoreSel?.value||"";
                    const filters = {};
                    if (catVal) filters.category = catVal;
                    if (scoreVal) filters.score = scoreVal;
                    const r = await fetch("/danbooru_anima/animadex_search", {
                        method:"POST", headers:{"Content-Type":"application/json"},
                        body: JSON.stringify({mode:"artists", query, filters, page, sort: pp._aSort || "count"})
                    });
                    const d = await r.json();
                    const items = d.tags || d.results || [];
                    if (typeof d.page === "number" && d.page > 0) pp.dataset.page = String(d.page);
                    const totalPages = Math.max(1, Math.ceil((d.total || 0) / 36) || 1);
                    pp.dataset.totalPages = String(totalPages);
                    pp._grid.innerHTML = "";
                    for (const it of items) {
                        const card = document.createElement("div");
                        card.style.cssText = "background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;overflow:hidden;cursor:pointer;transition:all 0.2s;position:relative;min-height:200px;";
                        card.onmouseover = () => { card.style.background="rgba(255,255,255,0.08)"; card.style.borderColor="rgba(129,199,132,0.4)"; card.style.transform="translateY(-2px)"; };
                        card.onmouseout = () => { card.style.background="rgba(255,255,255,0.04)"; card.style.borderColor="rgba(255,255,255,0.06)"; card.style.transform="none"; };
                        card.onclick = () => {
                            if (window._adexOnSelect) {
                                window._adexOnSelect({name: (it.slug || it.name).replace(/[\s-]+/g,"_").toLowerCase(), tags: it.tags||"", thumb_url: it.thumb_url||it.img_url||"", copyright_name: ""});
                                return;
                            }
                            if (window._artistBrowseFallback) {
                                window._artistBrowseFallback({name: (it.slug || it.name).replace(/[\s-]+/g,"_").toLowerCase(), tags: it.tags||"", thumb_url: it.thumb_url||it.img_url||"", copyright_name: ""});
                            }
                        };
                        if (it.thumb_url || it.img_url) {
                            const tn = document.createElement("img");
                            tn.src = "/danbooru_anima/animadex_image?url="+encodeURIComponent(it.img_url||it.thumb_url);
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
                        nm.textContent = it.name||"";
                        nm.style.cssText = "color:#fff;font-size:13px;font-weight:700;text-shadow:0 2px 4px rgba(0,0,0,0.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
                        mask.appendChild(nm);
                        card.appendChild(mask);
                        card.dataset.tags=(it.tags||[]).join(" ");
                        pp._grid.appendChild(card);
                    }
                    if (pp._aSort === "random") {
                        pp._pageLabel.textContent = "随机一批 · 再点 🎲 换";
                    } else {
                        pp._pageLabel.textContent = "第 "+(pp.dataset.page||page)+" / "+pp.dataset.totalPages+" 页";
                    }
                } catch(e) { pp._grid.innerHTML = '<div style="color:#e94560;text-align:center;padding:20px;">加载失败</div>'; }
            }

            function _artistFavThumbSrc(thumb) {
                if (!thumb) return "";
                if (thumb.indexOf("/danbooru_anima/") === 0) return thumb;
                return "/danbooru_anima/animadex_image?url=" + encodeURIComponent(thumb);
            }
            function _artistFavKeys(coll) {
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
            async function loadArtistFavs(pp) {
                pp.dataset.view = "fav";
                if (pp._favBtn) {
                    pp._favBtn.style.background = "var(--anima-title)";
                    pp._favBtn.style.color = "var(--anima-accent-soft)";
                }
                pp._grid.innerHTML = '<div style="color:#888;text-align:center;padding:20px;grid-column:1/-1;">加载收藏...</div>';
                try {
                    var r = await fetch("/danbooru_anima/favorites");
                    var d = await r.json();
                    var coll = (d.favorites && d.favorites.animadex_artists) || {};
                    var keys = _artistFavKeys(coll);
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
                        pp._grid.innerHTML = '<div style="color:#888;text-align:center;padding:40px;grid-column:1/-1;">暂无 AnimaDex 画师收藏，请先在 AnimaDex 浏览器点 ☆</div>';
                        if (pp._pageLabel) pp._pageLabel.textContent = animaTxt("收藏 0");
                        return;
                    }
                    var slice = keys.slice((page - 1) * per, page * per);
                    for (var si = 0; si < slice.length; si++) {
                        (function(tag) {
                            var info = coll[tag] || {};
                            var card = document.createElement("div");
                            card.style.cssText = "background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;overflow:hidden;cursor:pointer;transition:all 0.2s;position:relative;min-height:200px;";
                            card.onmouseover = function(){ card.style.background="rgba(255,255,255,0.08)"; card.style.borderColor="rgba(129,199,132,0.4)"; card.style.transform="translateY(-2px)"; };
                            card.onmouseout = function(){ card.style.background="rgba(255,255,255,0.04)"; card.style.borderColor="rgba(255,255,255,0.06)"; card.style.transform="none"; };
                            card.onclick = function() {
                                var tagName = String(tag).replace(/[\s-]+/g, "_").toLowerCase();
                                var payload = {name: tagName, tags: "", thumb_url: info.thumb || "", copyright_name: ""};
                                if (window._adexOnSelect) window._adexOnSelect(payload);
                                else if (window._artistBrowseFallback) window._artistBrowseFallback(payload);
                            };
                            if (info.thumb) {
                                var tn = document.createElement("img");
                                tn.src = _artistFavThumbSrc(info.thumb);
                                tn.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity 0.3s;";
                                tn.onerror = function(){ tn.style.display="none"; };
                                card.appendChild(tn);
                                var imgDiv2 = document.createElement("div");
                                imgDiv2.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(255,255,255,0.03),rgba(255,255,255,0.06));";
                                imgDiv2.textContent = "🎨";
                                card.appendChild(imgDiv2);
                                tn.onload = function(){ tn.style.opacity="1"; imgDiv2.remove(); };
                            }
                            var mask = document.createElement("div");
                            mask.style.cssText = "position:absolute;bottom:0;left:0;right:0;padding:12px;background:linear-gradient(to top,rgba(14,14,18,0.95),rgba(14,14,18,0.3),transparent);z-index:1;";
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
                    pp._grid.innerHTML = '<div style="color:#e94560;text-align:center;padding:20px;">收藏加载失败</div>';
                }
            }
        window.openArtistBrowse = openArtistBrowse;
    };
    _exportArtistBrowse();
    if (window.app?.registerExtension) {
        window.app.registerExtension({
            name: "danbooru-anima.artist-browse-popup",
            async beforeRegisterNodeDef() {},
        });
    }
})();
