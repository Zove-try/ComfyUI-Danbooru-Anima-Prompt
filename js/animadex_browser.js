import { app } from "/scripts/app.js";
import "./00_anima_i18n.js";
import { $el } from "/scripts/ui.js";
import "./00_anima_theme.js";

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

app.registerExtension({
    name: "Comfy.AnimaDexBrowser",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "AnimaDexBrowser") return;
        window.hookAnimaNodeChrome(nodeType);

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onCreated?.apply(this, arguments);
            this.setSize([800, 1020]);
            window.applyAnimaNodeChrome(this);
            this.title = animaTxt("AnimaDex 浏览器 (AnimaDex Browser)");
            this.onDrawBackground = function() {
                const el = this.nodeEl?.querySelector?.(".comfy-title");
                if (el && el.style.fontSize !== "16px") {
                    el.style.fontSize = "16px";
                    el.style.fontWeight = "bold";
                }
            };
            this.isChanged = true;
            const node = this;


            let mode = "artists";
            let sortMode = "count"; // count, fav_count, random
            let skipFavs = false;
            try { skipFavs = localStorage.getItem("adex_skip_fav") === "1"; } catch (e) {}
            let results = [];
            let filters = {};
            let facetData = {};
            let page = 1;
            let totalResults = 0;
            let _searchGen = 0;
            let _searchAbort = null;

            // ── 收藏缓存 ──
            let _favCache = null;
            async function loadFavCache(force=false) {
                if (_favCache && !force) return _favCache;
                try {
                    const r = await fetch("/danbooru_anima/favorites");
                    const d = await r.json();
                    _favCache = d.favorites || {};
                } catch(e) { _favCache = {animadex_artists:{},animadex_characters:{}}; }
                return _favCache;
            }
            async function toggleFav(tag, cat, thumbUrl, extra) {
                extra = extra || {};
                await loadFavCache();
                const coll = _favCache[cat] || {};
                if (coll[tag]) {
                    await fetch("/danbooru_anima/favorites/remove", {
                        method: "POST", headers: {"Content-Type":"application/json"},
                        body: JSON.stringify({tag, category: cat}),
                    });
                    delete coll[tag];
                } else {
                    var _tags = extra.tags || [];
                    if (!Array.isArray(_tags)) _tags = String(_tags).split(/[,，]+/).map(function(x){ return x.trim(); }).filter(Boolean);
                    var _cp = extra.copyright_name || extra.cp || "";
                    var _cn = extra.cn || "";
                    await fetch("/danbooru_anima/favorites/add", {
                        method: "POST", headers: {"Content-Type":"application/json"},
                        body: JSON.stringify({tag: tag, category: cat, thumb_url: thumbUrl || "", cn: _cn, tags: _tags, copyright_name: _cp}),
                    });
                    if (!_favCache[cat]) _favCache[cat] = {};
                    _favCache[cat][tag] = {thumb: thumbUrl || "", cn: _cn, tags: _tags, copyright_name: _cp};
                }
                render();
            }
            function _collectFavKeys() {
                var set = {};
                var cats = mode === "artists" ? ["animadex_artists", "artists"] : ["animadex_characters", "characters"];
                for (var ci = 0; ci < cats.length; ci++) {
                    var coll = (_favCache && _favCache[cats[ci]]) || {};
                    var keys = Object.keys(coll);
                    for (var ki = 0; ki < keys.length; ki++) {
                        var k = keys[ki];
                        if (!k || k === "_order") continue;
                        set[k] = 1;
                        set[String(k).replace(/ /g, "_")] = 1;
                        set[String(k).replace(/_/g, " ")] = 1;
                    }
                }
                return set;
            }
            function _itemIsFav(it, favSet) {
                if (!it || !favSet) return false;
                var cands = [it.slug, it.name, it.trigger];
                for (var i = 0; i < cands.length; i++) {
                    var x = (cands[i] || "").trim();
                    if (x && favSet[x]) return true;
                }
                return false;
            }

            const el = document.createElement("div");
            el.className = "animadex-browser";
            el.style.cssText = "width:100%;height:100%;display:flex;flex-direction:column;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border-radius:6px;min-height:0;";
            if (typeof window.animaShieldDomWidget === "function") window.animaShieldDomWidget(el);
            if (typeof window.applyAnimaPanelGlow === "function") window.applyAnimaPanelGlow(el);

            // ── 顶栏 ──
            const bar = document.createElement("div");
            bar.style.cssText = "display:flex;gap:6px;padding:8px;align-items:center;border-bottom:1px solid var(--anima-line);flex-shrink:0;";

            const segWrap = document.createElement("div");
            segWrap.style.cssText = "display:flex;border-radius:10px;border:1px solid var(--anima-line);background:var(--anima-bg);padding:3px;gap:2px;flex-shrink:0;";
            const btns = {};
            for (const [mk, ml] of [["artists","🎨 画师"],["characters","👤 角色"]]) {
                const b = document.createElement("button");
                b.textContent = ml;
                b.style.cssText = `padding:6px 16px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:bold;background:${mk===mode?"linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi))":"transparent"};color:${mk===mode?"#ffffff":"var(--anima-mute)"};box-shadow:${mk===mode?"0 0 12px rgba(var(--anima-accent-rgb),0.4)":"none"};transition:all 0.2s;`;
                b.onclick = () => {
                    mode = mk;
                    filters = {};
                    page = 1;
                    for (const [k,v] of Object.entries(btns)) {
                        v.style.background = k===mode?"linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi))":"transparent";
                        v.style.color = k===mode?"#fff":"var(--anima-mute)";
                        v.style.boxShadow = k===mode?"0 0 12px rgba(var(--anima-accent-rgb),0.4)":"none";
                    }
                    favTabBtn.style.background = "transparent"; favTabBtn.style.color = "var(--anima-mute)"; favTabBtn.style.borderColor = "var(--anima-line)";
                    inp.placeholder = mk==="characters"?"搜索角色名...":"搜索画师名...";
                    loadFacets();
                    if (inp.value.trim()) { clearTimeout(_searchTimer); search(); }
                    else doSearch("");
                };
                btns[mk] = b;
                segWrap.appendChild(b);
            }
            bar.appendChild(segWrap);
            // 📑 收藏 tab
            const favTabBtn = document.createElement("button");
            favTabBtn.textContent = animaTxt("📑 收藏");
            favTabBtn.style.cssText = "padding:6px 15px;border-radius:10px;border:1px solid var(--anima-line);cursor:pointer;font-size:13px;font-weight:bold;background:transparent;color:var(--anima-mute);transition:all 0.2s;"; favTabBtn.onmouseenter = () => { favTabBtn.style.background = "linear-gradient(135deg,rgba(var(--anima-accent-rgb),0.12),rgba(var(--anima-accent-rgb),0.06))"; favTabBtn.style.borderColor = "rgba(var(--anima-accent-rgb),0.35)"; favTabBtn.style.color = "var(--anima-accent-soft)"; }; favTabBtn.onmouseleave = () => { favTabBtn.style.background = "transparent"; favTabBtn.style.borderColor = "var(--anima-line)"; favTabBtn.style.color = "var(--anima-mute)"; };
            // ── 收藏夹排序（localStorage 持久化：用户可拖拽把喜好的放前面） ──
            const _favOrderKey = "adex_fav_order";
            const _loadFavOrder = () => {
                try { return JSON.parse(localStorage.getItem(_favOrderKey) || "{}"); } catch(e) { return {}; }
            };
            const _saveFavOrder = (cat, orderedKeys) => {
                try {
                    const all = _loadFavOrder();
                    all[cat] = orderedKeys;
                    localStorage.setItem(_favOrderKey, JSON.stringify(all));
                } catch(e) {}
            };
            const _applyFavOrder = (cat, keys) => {
                const all = _loadFavOrder();
                const order = all[cat];
                if (!Array.isArray(order) || !order.length) return keys;
                // 已排序的在前，新收藏的按原顺序跟在后面
                const ordered = order.filter(k => keys.includes(k));
                const rest = keys.filter(k => !ordered.includes(k));
                return ordered.concat(rest);
            };
            // SortableJS 加载（懒加载，仅收藏夹打开时）
            const _ensureSortable = () => new Promise((resolve) => {
                if (window.Sortable) { resolve(window.Sortable); return; }
                const s = document.createElement("script");
                s.src = "/extensions/ComfyUI-Danbooru-Anima-Prompt/js/sortable.min.js";
                s.onload = () => resolve(window.Sortable);
                s.onerror = () => resolve(null);
                document.head.appendChild(s);
            });

            favTabBtn.onclick = async () => {
                await loadFavCache(true);
                const SortableLib = await _ensureSortable();
                const ov = document.createElement("div");
                ov.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;pointer-events:none;";
                const bx = document.createElement("div");
                bx.style.cssText = "position:fixed;pointer-events:auto;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid var(--anima-line);border-radius:14px;padding:0;max-height:82vh;max-width:94vw;min-width:400px;min-height:320px;resize:both;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 18px 50px -12px rgba(0,0,0,0.7);";
                if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(bx);
                const sz = JSON.parse(localStorage.getItem("adex_fav_size") || '{"w":660,"h":560}');
                bx.style.width = sz.w + "px";
                bx.style.height = sz.h + "px";
                const saveSize = () => {
                    const r = bx.getBoundingClientRect();
                    if (r.width > 300 && r.height > 200) {
                        localStorage.setItem("adex_fav_size", JSON.stringify({w:Math.round(r.width),h:Math.round(r.height)}));
                    }
                };
                ov.onclick = (e) => { if (e.target === ov) { saveSize(); ov.remove(); } };
                const closeBtn = document.createElement("button");
                closeBtn.textContent = "✕";
                closeBtn.title = animaTxt("关闭");
                closeBtn.style.cssText = "padding:3px 10px;border-radius:999px;border:1px solid rgba(233,69,96,0.4);cursor:pointer;background:linear-gradient(135deg,rgba(233,69,96,0.15),rgba(233,69,96,0.06));color:#e94560;font-size:14px;font-weight:bold;transition:all .15s ease;"; closeBtn.onmouseenter = () => { closeBtn.style.background = "linear-gradient(135deg,rgba(233,69,96,0.3),rgba(233,69,96,0.12))"; closeBtn.style.transform = "translateY(-1px)"; }; closeBtn.onmouseleave = () => { closeBtn.style.background = "linear-gradient(135deg,rgba(233,69,96,0.15),rgba(233,69,96,0.06))"; closeBtn.style.transform = ""; };
                closeBtn.onclick = () => { saveSize(); ov.remove(); };
                // ── 头部：标题 + 统计 + 关闭 ──
                const hdr = document.createElement("div");
                hdr.style.cssText = "display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:move;user-select:none;border-bottom:1px solid var(--anima-line);flex-shrink:0;";
                const hdrIcon = document.createElement("span");
                hdrIcon.textContent = "📑";
                hdrIcon.style.cssText = "font-size:18px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6));";
                const hdrTitle = document.createElement("span");
                hdrTitle.textContent = animaTxt("收藏夹");
                hdrTitle.style.cssText = "font-weight:bold;font-size:15px;color:var(--anima-ink);text-shadow:0 1px 2px rgba(0,0,0,.75);";
                hdr.appendChild(hdrIcon); hdr.appendChild(hdrTitle);
                // 统计标签（画师/角色数量）
                const cats = ["animadex_artists","animadex_characters"];
                const catLabels = {"animadex_artists":"🎨 画师","animadex_characters":"👤 角色"};
                const _countAll = () => {
                    let n = 0;
                    for (const cat of cats) n += Object.keys(_favCache[cat] || {}).filter(k => k !== "_order").length;
                    return n;
                };
                const statBadge = document.createElement("span");
                statBadge.style.cssText = "padding:3px 12px;border-radius:999px;background:linear-gradient(135deg,rgba(var(--anima-accent-rgb),0.18),rgba(var(--anima-accent-rgb),0.12));border:1px solid rgba(var(--anima-accent-rgb),0.3);color:var(--anima-accent-soft);font-size:11px;font-weight:bold;";
                statBadge.textContent = "共 " + _countAll() + " 个";
                hdr.appendChild(statBadge);
                const hdrTip = document.createElement("span");
                hdrTip.textContent = animaTxt("点击收藏可搜索");
                hdrTip.style.cssText = "color:var(--anima-mute);font-size:12px;margin-left:2px;";
                hdr.appendChild(hdrTip);
                const hdrRight = document.createElement("span");
                hdrRight.style.cssText = "margin-left:auto;display:flex;align-items:center;gap:6px;";
                hdrRight.appendChild(closeBtn);
                hdr.appendChild(hdrRight);
                // 拖拽（带 clampPopup 兜底）
                hdr.onmousedown = (e) => {
                    if (e.target === closeBtn) return;
                    if (e.target && (e.target.tagName === "SELECT" || e.target.tagName === "OPTION" || e.target.tagName === "INPUT")) return;
                    e.preventDefault();
                    const dx = e.clientX - bx.offsetLeft, dy = e.clientY - bx.offsetTop;
                    const mm = (ev) => { bx.style.left = (ev.clientX - dx) + "px"; bx.style.top = (ev.clientY - dy) + "px"; if (window.clampPopup) window.clampPopup(bx); };
                    const mu = () => { document.removeEventListener("mousemove", mm); document.removeEventListener("mouseup", mu); };
                    document.addEventListener("mousemove", mm);
                    document.addEventListener("mouseup", mu);
                };
                // ── 页签（画师/角色）──
                let favTab = "animadex_artists";
                let favPage = 1;
                let favQuery = "";
                let favSort = "newest";
                try {
                    const _ss = localStorage.getItem("adex_fav_sort") || "newest";
                    if (_ss === "newest" || _ss === "oldest" || _ss === "name" || _ss === "manual") favSort = _ss;
                } catch (e) {}
                const PER_PAGE = 30;
                const tabBar = document.createElement("div");
                tabBar.style.cssText = "display:flex;gap:8px;padding:10px 16px 0;flex-shrink:0;align-items:center;";
                const favTabs = {};
                for (const [cat, label] of [["animadex_artists","🎨 画师"],["animadex_characters","👤 角色"]]) {
                    const tb = document.createElement("button");
                    tb.textContent = label;
                    tb.style.cssText = "padding:6px 16px;border-radius:10px 10px 0 0;border:1px solid var(--anima-line);border-bottom:none;cursor:pointer;font-size:12px;font-weight:bold;background:linear-gradient(135deg,rgba(var(--anima-accent-rgb),0.2),rgba(var(--anima-accent-rgb),0.12));color:var(--anima-accent-soft);transition:all .2s;";
                    tb.onclick = () => {
                        favTab = cat;
                        favPage = 1;
                        for (const [k,v] of Object.entries(favTabs)) {
                            const active = k === favTab;
                            v.style.background = active ? "linear-gradient(135deg,rgba(var(--anima-accent-rgb),0.2),rgba(var(--anima-accent-rgb),0.12))" : "transparent";
                            v.style.color = active ? "var(--anima-accent-soft)" : "var(--anima-mute)";
                        }
                        renderFavPage();
                    };
                    favTabs[cat] = tb;
                    tabBar.appendChild(tb);
                }
                const favQ = document.createElement("input");
                favQ.type = "search";
                favQ.placeholder = animaTxt("搜索");
                favQ.style.cssText = "margin-left:auto;width:160px;min-width:110px;padding:5px 10px;border-radius:8px;border:1px solid var(--anima-line);background:var(--anima-bg);color:var(--anima-ink);font-size:12px;outline:none;";
                favQ.oninput = () => { favQuery = (favQ.value || "").trim().toLowerCase(); favPage = 1; renderFavPage(); };
                tabBar.appendChild(favQ);
                bx.appendChild(tabBar);
                // ── 主体（单分类渲染）──
                const body = document.createElement("div");
                body.style.cssText = "flex:1;overflow-y:auto;padding:14px 16px;min-height:0;";
                const favPager = document.createElement("div");
                favPager.style.cssText = "display:none;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px;padding:8px 16px 12px;flex-shrink:0;border-top:1px solid var(--anima-line);";
                const _favSortedKeys = (cat) => {
                    const coll = _favCache[cat] || {};
                    const keys = Object.keys(coll).filter(k => k !== "_order");
                    const joinRaw = Array.isArray(coll._order) ? coll._order : [];
                    const join = [];
                    const seen = {};
                    for (let i = 0; i < joinRaw.length; i++) {
                        const k = joinRaw[i];
                        if (!k || k === "_order" || seen[k] || keys.indexOf(k) < 0) continue;
                        seen[k] = 1;
                        join.push(k);
                    }
                    for (let i = 0; i < keys.length; i++) {
                        if (!seen[keys[i]]) join.push(keys[i]);
                    }
                    if (favSort === "oldest") return join;
                    if (favSort === "newest") return join.slice().reverse();
                    if (favSort === "name") return keys.slice().sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
                    return _applyFavOrder(cat, join);
                };
                const renderFavPage = () => {
                    body.innerHTML = "";
                    const cat = favTab;
                    const coll = _favCache[cat] || {};
                    let keys = _favSortedKeys(cat);
                    if (favQuery) {
                        keys = keys.filter(k => String(k).toLowerCase().indexOf(favQuery) >= 0);
                    }
                    const total = keys.length;
                    const pages = Math.max(1, Math.ceil(total / PER_PAGE) || 1);
                    if (favPage > pages) favPage = pages;
                    if (favPage < 1) favPage = 1;
                    const slice = keys.slice((favPage - 1) * PER_PAGE, favPage * PER_PAGE);
                    const secHdr = document.createElement("div");
                    secHdr.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:10px;";
                    const secIcon = document.createElement("span");
                    secIcon.textContent = cat === "animadex_artists" ? "🎨" : "👤";
                    secIcon.style.cssText = "font-size:26px;filter:drop-shadow(0 0 5px rgba(var(--anima-accent-rgb),0.3));";
                    const secLabel = document.createElement("span");
                    secLabel.textContent = catLabels[cat];
                    secLabel.style.cssText = "color:#e0e0e0;font-size:13px;font-weight:bold;";
                    const secCount = document.createElement("span");
                    secCount.textContent = String(total);
                    secCount.style.cssText = "padding:2px 9px;border-radius:999px;background:linear-gradient(135deg,rgba(var(--anima-accent-rgb),0.16),rgba(var(--anima-accent-rgb),0.1));color:var(--anima-accent-soft);font-size:11px;font-weight:bold;";
                    secHdr.appendChild(secIcon); secHdr.appendChild(secLabel); secHdr.appendChild(secCount);
                    const secLine = document.createElement("div");
                    secLine.style.cssText = "flex:1;height:1px;background:linear-gradient(90deg,var(--anima-line),transparent);margin-left:4px;";
                    secHdr.appendChild(secLine);
                    body.appendChild(secHdr);
                    const paintPager = () => {
                        favPager.innerHTML = "";
                        if (pages <= 1) { favPager.style.display = "none"; return; }
                        favPager.style.display = "flex";
                        const goFavPage = (p) => {
                            p = parseInt(p, 10) || 1;
                            if (p < 1) p = 1;
                            if (p > pages) p = pages;
                            if (p === favPage) return;
                            favPage = p;
                            renderFavPage();
                        };
                        const mkPg = (txt, fn, dis, title) => {
                            const b = document.createElement("button");
                            b.type = "button";
                            b.textContent = txt;
                            b.disabled = !!dis;
                            if (title) b.title = title;
                            b.style.cssText = "padding:4px 10px;border-radius:8px;border:1px solid var(--anima-line);cursor:pointer;font-size:11px;background:transparent;color:var(--anima-mute);" + (dis ? "opacity:0.4;cursor:default;" : "");
                            if (!dis) {
                                b.onmouseover = () => { b.style.borderColor = "var(--anima-accent-soft)"; b.style.color = "var(--anima-accent-soft)"; };
                                b.onmouseout = () => { b.style.borderColor = "var(--anima-line)"; b.style.color = "var(--anima-mute)"; };
                                b.onclick = fn;
                            }
                            return b;
                        };
                        favPager.appendChild(mkPg(animaTxt("首页"), () => goFavPage(1), favPage <= 1, animaTxt("首页")));
                        favPager.appendChild(mkPg("‹ " + animaTxt("上一页"), () => goFavPage(favPage - 1), favPage <= 1));
                        const jump = document.createElement("input");
                        jump.type = "number";
                        jump.min = "1";
                        jump.max = String(pages);
                        jump.value = String(favPage);
                        jump.title = animaTxt("跳页");
                        jump.style.cssText = "width:52px;padding:4px 6px;border-radius:6px;border:1px solid var(--anima-line);background:var(--anima-bg);color:var(--anima-ink);font-size:12px;outline:none;";
                        const doJump = () => goFavPage(jump.value);
                        jump.onchange = doJump;
                        jump.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); doJump(); } };
                        const pgLab = document.createElement("span");
                        pgLab.style.cssText = "color:var(--anima-accent-soft);font-size:12px;font-weight:bold;display:flex;align-items:center;gap:4px;";
                        const slash = document.createElement("span");
                        slash.textContent = "/ " + pages;
                        pgLab.appendChild(jump);
                        pgLab.appendChild(slash);
                        favPager.appendChild(pgLab);
                        favPager.appendChild(mkPg(animaTxt("跳页"), doJump, false));
                        favPager.appendChild(mkPg(animaTxt("尾页"), () => goFavPage(pages), favPage >= pages, animaTxt("尾页")));
                        favPager.appendChild(mkPg(animaTxt("下一页") + " ›", () => goFavPage(favPage + 1), favPage >= pages));
                    };
                    if (!keys.length) {
                        const empty = document.createElement("div");
                        empty.style.cssText = "color:var(--anima-mute);text-align:center;padding:14px;font-size:12px;border:1px dashed var(--anima-line);border-radius:10px;margin-bottom:16px;";
                        const emptyIcon = document.createElement("div");
                        emptyIcon.textContent = favQuery ? "🔍" : "⭐";
                        emptyIcon.style.cssText = "font-size:18px;margin-bottom:6px;opacity:0.85;filter:drop-shadow(0 0 8px rgba(var(--anima-accent-rgb),0.3));";
                        const emptyTxt = document.createElement("div");
                        emptyTxt.textContent = favQuery ? animaTxt("无结果") : animaTxt("暂无收藏，快去浏览页点 ☆ 收藏吧");
                        empty.appendChild(emptyIcon); empty.appendChild(emptyTxt);
                        body.appendChild(empty);
                        paintPager();
                        return;
                    }
                    const subGrid = document.createElement("div");
                    subGrid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;margin-bottom:16px;";
                    if (favSort === "manual" && SortableLib) {
                        new SortableLib(subGrid, {
                            animation: 150,
                            handle: ".adx-fav-drag",
                            ghostClass: "adx-fav-ghost",
                            onEnd: () => {
                                const pageOrder = Array.from(subGrid.children).map(ch => ch.dataset.tag).filter(Boolean);
                                const start = (favPage - 1) * PER_PAGE;
                                const full = keys.slice();
                                full.splice(start, pageOrder.length, ...pageOrder);
                                _saveFavOrder(cat, full);
                            }
                        });
                    }
                    for (const tag of slice) {
                        const info = coll[tag] || {};
                        const chip = document.createElement("div");
                        chip.style.cssText = "display:flex;flex-direction:column;align-items:center;padding:0;border-radius:10px;cursor:pointer;background:linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%);border:1px solid var(--anima-line);overflow:hidden;transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease;position:relative;";
                        chip.onmouseover = () => { chip.style.transform = "translateY(-2px)"; chip.style.boxShadow = "0 5px 14px rgba(var(--anima-accent-rgb),0.16)"; chip.style.borderColor = "rgba(var(--anima-accent-rgb),0.4)"; chip.style.background = "linear-gradient(160deg,var(--anima-well) 0%,var(--anima-well-lo) 60%,var(--anima-bg) 100%)"; chip.querySelector(".adx-fav-del").style.opacity = "1"; const dh = chip.querySelector(".adx-fav-drag"); if (dh) dh.style.opacity = favSort === "manual" ? "1" : "0"; };
                        chip.onmouseout = () => { chip.style.transform = ""; chip.style.boxShadow = ""; chip.style.borderColor = "var(--anima-line)"; chip.style.background = "linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)"; chip.querySelector(".adx-fav-del").style.opacity = "0"; const dh = chip.querySelector(".adx-fav-drag"); if (dh) dh.style.opacity = "0"; };
                        chip.onclick = () => {
                            ov.remove();
                            mode = cat === "animadex_artists" ? "artists" : "characters";
                            for (const [k,v] of Object.entries(btns)) { v.style.background = k===mode?"var(--anima-accent-soft)":"var(--anima-line)"; v.style.color = k===mode?"#fff":"var(--anima-mute)"; }
                            inp.value = tag;
                            doSearch(tag);
                        };
                        chip.dataset.tag = tag;
                        const imgBox = document.createElement("div");
                        imgBox.style.cssText = "width:100%;aspect-ratio:4/3;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;";
                        if (info.thumb) {
                            const tn = document.createElement("img");
                            tn.draggable = false;
                            tn.src = "/danbooru_anima/animadex_image?url=" + encodeURIComponent(info.thumb);
                            tn.style.cssText = "width:100%;height:100%;object-fit:contain;";
                            tn.onerror = () => { tn.style.display = "none"; imgBox.textContent = "🖼"; imgBox.style.fontSize = "30px"; imgBox.style.color = "var(--anima-accent)"; };
                            imgBox.appendChild(tn);
                        } else { imgBox.textContent = "🖼"; imgBox.style.fontSize = "30px"; imgBox.style.color = "var(--anima-accent)"; }
                        if (favSort === "manual") {
                            const dragH = document.createElement("span");
                            dragH.textContent = "⠿";
                            dragH.className = "adx-fav-drag";
                            dragH.title = animaTxt("手动排序");
                            dragH.style.cssText = "position:absolute;top:6px;left:6px;z-index:3;width:22px;height:22px;border-radius:6px;background:rgba(13,17,22,0.6);color:var(--anima-accent-soft);font-size:12px;display:flex;align-items:center;justify-content:center;cursor:grab;opacity:0;transition:opacity .15s ease;";
                            imgBox.appendChild(dragH);
                        }
                        chip.appendChild(imgBox);
                        const del = document.createElement("span");
                        del.textContent = "✕";
                        del.className = "adx-fav-del";
                        del.title = animaTxt("取消收藏");
                        del.style.cssText = "position:absolute;top:6px;right:6px;z-index:2;width:24px;height:24px;border-radius:50%;background:rgba(233,69,96,0.85);color:#fff;font-size:13px;font-weight:bold;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:all .15s ease;";
                        del.onmouseover = () => { del.style.background = "#e94560"; del.style.transform = "scale(1.1)"; };
                        del.onmouseout = () => { del.style.background = "rgba(233,69,96,0.85)"; del.style.transform = ""; };
                        del.onclick = (e) => {
                            e.stopPropagation();
                            toggleFav(tag, cat, "").then(() => { loadFavCache(true); statBadge.textContent = "共 " + _countAll() + " 个"; renderFavPage(); });
                        };
                        chip.appendChild(del);
                        const lbBox = document.createElement("div");
                        lbBox.style.cssText = "width:100%;padding:7px 8px;text-align:center;";
                        const lb = document.createElement("div");
                        lb.textContent = "@" + tag;
                        lb.style.cssText = "font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--anima-ink);text-shadow:0 1px 2px rgba(0,0,0,.7);";
                        lbBox.appendChild(lb);
                        chip.appendChild(lbBox);
                        subGrid.appendChild(chip);
                    }
                    body.appendChild(subGrid);
                    paintPager();
                };
                const sortSel = document.createElement("select");
                sortSel.title = animaTxt("排序");
                sortSel.style.cssText = "padding:3px 8px;border-radius:8px;border:1px solid var(--anima-line);background:var(--anima-bg);color:var(--anima-ink);font-size:11px;cursor:pointer;outline:none;max-width:120px;";
                [["newest","最新加入"],["oldest","最早加入"],["name","名称 A-Z"],["manual","手动排序"]].forEach(function (pair) {
                    const o = document.createElement("option");
                    o.value = pair[0];
                    o.textContent = animaTxt(pair[1]);
                    if (pair[0] === favSort) o.selected = true;
                    sortSel.appendChild(o);
                });
                sortSel.onchange = () => {
                    favSort = sortSel.value;
                    try { localStorage.setItem("adex_fav_sort", favSort); } catch (e2) {}
                    favPage = 1;
                    renderFavPage();
                };
                hdrRight.insertBefore(sortSel, closeBtn);
                renderFavPage();

bx.appendChild(hdr);
                bx.appendChild(body);
                bx.appendChild(favPager);
                ov.appendChild(bx);
                document.body.appendChild(ov);
                // 初始居中 + clampPopup 兜底
                bx.style.left = Math.max(10, Math.round((window.innerWidth - bx.offsetWidth) / 2)) + "px";
                bx.style.top = Math.max(10, Math.round((window.innerHeight - bx.offsetHeight) / 2)) + "px";
                setTimeout(() => { if (window.clampPopup) window.clampPopup(bx); }, 0);
            };
            // ── 模式按钮（热门/最多喜欢/随机，随机可反复点击刷新）──
            const sortBtns = {};
            for (const [sk, sl] of [["count","🔥 热门"],["fav_count","❤️ 最多喜欢"],["random","🔀 随机"]]) {
                const sb = document.createElement("button");
                sb.textContent = sl;
                sb.style.cssText = `padding:6px 13px;border-radius:10px;border:1px solid ${sk===sortMode?"rgba(var(--anima-accent-rgb),0.5)":"var(--anima-line)"};cursor:pointer;font-size:12px;font-weight:bold;background:${sk===sortMode?"linear-gradient(135deg,rgba(var(--anima-accent-rgb),0.2),rgba(var(--anima-accent-rgb),0.12))":"transparent"};color:${sk===sortMode?"var(--anima-accent-soft)":"var(--anima-mute)"};transition:all 0.2s;`;
                sb.onmouseover = () => { if (sk!==sortMode) { sb.style.borderColor = "#4b5563"; sb.style.color = "#c9d1d9"; } };
                sb.onmouseout = () => { if (sk!==sortMode) { sb.style.borderColor = "var(--anima-line)"; sb.style.color = "var(--anima-mute)"; } };
                sb.onclick = () => {
                    sortMode = sk;
                    for (const [k,v] of Object.entries(sortBtns)) {
                        v.style.background = k===sortMode?"linear-gradient(135deg,rgba(var(--anima-accent-rgb),0.2),rgba(var(--anima-accent-rgb),0.12))":"transparent";
                        v.style.color = k===sortMode?"var(--anima-accent-soft)":"var(--anima-mute)";
                        v.style.borderColor = k===sortMode?"rgba(var(--anima-accent-rgb),0.5)":"var(--anima-line)";
                    }
                    if (sk === "random") {
                        if (inp.value.trim()) { clearTimeout(_searchTimer); search(); }
                        else doSearch("");
                        return;
                    }
                    page = 1;
                    if (inp.value.trim()) { clearTimeout(_searchTimer); search(); }
                    else doSearch("");
                };
                sortBtns[sk] = sb;
                bar.appendChild(sb);
            }
            const skipBtn = document.createElement("button");
            skipBtn.textContent = animaTxt("🚫 跳过收藏");
            skipBtn.title = animaTxt("开启后，点随机不会出现已收藏的画师或角色");
            function paintSkipBtn() {
                skipBtn.style.background = skipFavs ? "linear-gradient(135deg,rgba(var(--anima-accent-rgb),0.2),rgba(var(--anima-accent-rgb),0.12))" : "transparent";
                skipBtn.style.color = skipFavs ? "var(--anima-accent-soft)" : "var(--anima-mute)";
                skipBtn.style.borderColor = skipFavs ? "rgba(var(--anima-accent-rgb),0.5)" : "var(--anima-line)";
            }
            skipBtn.style.cssText = "padding:6px 13px;border-radius:10px;border:1px solid var(--anima-line);cursor:pointer;font-size:12px;font-weight:bold;background:transparent;color:var(--anima-mute);transition:all 0.2s;";
            paintSkipBtn();
            skipBtn.onmouseover = () => { if (!skipFavs) { skipBtn.style.borderColor = "#4b5563"; skipBtn.style.color = "#c9d1d9"; } };
            skipBtn.onmouseout = () => { paintSkipBtn(); };
            skipBtn.onclick = () => {
                skipFavs = !skipFavs;
                try { localStorage.setItem("adex_skip_fav", skipFavs ? "1" : "0"); } catch (e) {}
                paintSkipBtn();
                if (sortMode === "random") {
                    if (inp.value.trim()) { clearTimeout(_searchTimer); search(); }
                    else doSearch("");
                }
            };
            bar.appendChild(skipBtn);
            favTabBtn.style.marginLeft = "auto";
            bar.appendChild(favTabBtn);

            const inp = document.createElement("input");
            inp.type = "text";
            inp.placeholder = animaTxt("搜索画师名...");
            inp.style.cssText = "flex:1;padding:7px 12px;border-radius:10px;border:1px solid var(--anima-line);background:var(--anima-bg);color:var(--anima-ink);font-size:13px;outline:none;transition:border-color 0.2s,box-shadow 0.2s;";
            inp.addEventListener("focus", () => { inp.style.borderColor = "var(--anima-accent-soft)"; inp.style.boxShadow = "0 0 0 2px rgba(var(--anima-accent-rgb),0.15)"; });

            // ── 自动补全下拉 ──
            const acList = document.createElement("div");
            acList.style.cssText = "display:none;position:absolute;top:100%;left:0;right:0;background:var(--anima-bg);border:1px solid var(--anima-line);border-radius:0 0 4px 4px;max-height:240px;overflow-y:auto;z-index:999;";
            bar.style.position = "relative";
            let _acTimer = null;
            let _acCache = {};
            let _searchTimer = null;

            function showAc(items) {
                acList.innerHTML = "";
                var list = (items || []).slice();
                var q = (inp.value || "").trim();
                if (q && window.animaFuzzyCmp) {
                    list.sort(function (a, b) {
                        return window.animaFuzzyCmp(q, { tag: a.name || a.slug || "", cn: "" }, { tag: b.name || b.slug || "", cn: "" });
                    });
                }
                list = list.slice(0, 10);
                if (!list.length) { acList.style.display = "none"; return; }
                for (const r of list) {
                    const row = document.createElement("div");
                    const name = r.name || "";
                    const cp = r.copyright_name || "";
                    row.style.cssText = "padding:5px 8px;cursor:pointer;color:var(--anima-mute);font-size:12px;border-bottom:1px solid var(--anima-line);display:flex;gap:6px;align-items:center;";
                    row.onmouseover = () => row.style.background = "var(--anima-well-lo)";
                    row.onmouseout = () => row.style.background = "transparent";
                    row.onclick = () => {
                        inp.value = name;
                        acList.style.display = "none";
                        page = 1;
                        doSearch(name);
                    };
                    const nm = document.createElement("span");
                    nm.textContent = name;
                    nm.style.cssText = "font-weight:bold;color:#e0e0e0;font-size:12px;";
                    row.appendChild(nm);
                    if (cp) {
                        const sc = document.createElement("span");
                        sc.textContent = cp;
                        sc.style.cssText = "color:var(--anima-mute);font-size:10px;margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;";
                        row.appendChild(sc);
                    }
                    acList.appendChild(row);
                }
                acList.style.display = "block";
            }

            inp.oninput = () => {
                const q = inp.value.trim();
                if (!q) { acList.style.display = "none"; clearTimeout(_searchTimer); return; }
                clearTimeout(_acTimer);
                _acTimer = setTimeout(async () => {
                    if (acList.style.display === "none" || acList.innerHTML === "") {
                        acList.innerHTML = '<div style="padding:8px;text-align:center;color:#6e7681;font-size:11px;">⏳ 搜索建议...</div>';
                        acList.style.display = "block";
                    }
                    try {
                        const r = await fetch("/danbooru_anima/animadex_search", {
                            method: "POST", headers: {"Content-Type":"application/json"},
                            body: JSON.stringify({mode, query: q, page: 1}),
                        });
                        const d = await r.json();
                        showAc(d.results || []);
                    } catch { acList.style.display = "none"; }
                }, 150);
            };
            inp.onkeydown = (e) => {
                if (e.key === "Enter") { acList.style.display = "none"; clearTimeout(_searchTimer); search(); }
                if (e.key === "Escape") acList.style.display = "none";
            };
            inp.onblur = () => { inp.style.borderColor = "var(--anima-line)"; inp.style.boxShadow = "none"; setTimeout(() => acList.style.display = "none", 200); };

            const sBtn = document.createElement("button");
            sBtn.textContent = "🔍";
            sBtn.style.cssText = "padding:6px 18px;border-radius:10px;border:none;background:linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi));color:#ffffff;cursor:pointer;font-size:16px;box-shadow:0 0 12px rgba(var(--anima-accent-rgb),0.35);transition:all 0.2s;";
            sBtn.onclick = search;
            bar.append(inp, acList, sBtn);

            // ── 筛选栏 ──
            const filterBar = document.createElement("div");
            filterBar.style.cssText = "display:none;flex-wrap:wrap;gap:6px;padding:6px 10px;border-bottom:1px solid var(--anima-line);flex-shrink:0;font-size:11px;align-items:center;background:linear-gradient(90deg,rgba(var(--anima-well-rgb),0.7),rgba(var(--anima-bg-deep-rgb),0.4));";

            const LABELS = {
                hair_color:"发色", hair_length:"发长", eye_color:"瞳色",
                gender:"性别", copyright:"系列", score:"评分", category:"分类"
            };

            const TRANS = {
                // ── 发色 ──
                "black hair":"黑发","brown hair":"棕发","blonde hair":"金发","white hair":"白发",
                "blue hair":"蓝发","grey hair":"灰发","pink hair":"粉发","purple hair":"紫发",
                "red hair":"红发","green hair":"绿发","orange hair":"橙发","silver hair":"银发",
                "multicolored hair":"多色发","auburn hair":"赤褐发","light brown hair":"浅棕发",
                "dark brown hair":"深棕发","two-tone hair":"两色发","blond hair":"金发",
                "light blue hair":"浅蓝发","light green hair":"浅绿发","light pink hair":"浅粉发",
                "light purple hair":"浅紫发","light red hair":"浅红发",
                // ── 发长 ──
                "very short hair":"超短发","short hair":"短发","medium hair":"中长发",
                "long hair":"长发","very long hair":"超长发","absurdly long hair":"极长发",
                // ── 瞳色 ──
                "blue eyes":"蓝瞳","red eyes":"红瞳","brown eyes":"棕瞳","green eyes":"绿瞳",
                "purple eyes":"紫瞳","yellow eyes":"黄瞳","pink eyes":"粉瞳","black eyes":"黑瞳",
                "grey eyes":"灰瞳","orange eyes":"橙瞳","silver eyes":"银瞳","multicolored eyes":"多彩瞳",
                "light blue eyes":"浅蓝瞳","light green eyes":"浅绿瞳",
                // ── 性别 ──
                "1girl":"女性","1boy":"男性","no humans":"非人类","1other":"其他",
                // ── 评分 ──
                "5":"5分","4":"4分","3":"3分","2":"2分","1":"1分",
                // ── 画师分类 ──
                "Anime Coloring":"动漫风上色","Unique":"独特风格","Webmaster Curated":"站长精选",
                // ── 版权/系列 ──
                "original":"原创",
            };

            function fmtVal(key, val) {
                return TRANS[val] || val.replace(/_/g, " ");
            }

            function renderFilters() {
                const facets = facetData[mode];
                filterBar.innerHTML = "";
                filterBar.style.display = "none";
                if (!facets) return;

                const allowed = mode === "artists" ? ["score","category"] : ["hair_color","hair_length","eye_color","gender","copyright"];
                let shown = false;

                for (const key of allowed) {
                    const f = facets[key];
                    if (!f || !f.values || !f.values.length) continue;
                    shown = true;

                    const group = document.createElement("div");
                    group.style.cssText = "display:flex;gap:5px;align-items:center;margin-right:8px;";

                    const label = document.createElement("span");
                    label.style.cssText = "color:var(--anima-mute);font-size:10px;font-weight:bold;white-space:nowrap;";
                    label.textContent = LABELS[key] || key;

                    const sel = document.createElement("select");
                    sel.style.cssText = `padding:3px 8px;border-radius:7px;border:1px solid ${filters[key]?"var(--anima-accent-soft)":"var(--anima-line)"};background:var(--anima-bg);color:var(--anima-ink);font-size:10px;cursor:pointer;outline:none;max-width:140px;transition:border-color 0.2s;`;
                    const optAll = document.createElement("option");
                    optAll.value = ""; optAll.textContent = animaTxt("全部");
                    sel.appendChild(optAll);
                    const vals = f.values.slice(0, 20);
                    for (const v of vals) {
                        const val = v.value || v;
                        const opt = document.createElement("option");
                        opt.value = val; opt.textContent = fmtVal(key, val);
                        if (filters[key] === val) opt.selected = true;
                        sel.appendChild(opt);
                    }
                    sel.onchange = () => {
                        page = 1;
                        if (sel.value) filters[key] = sel.value;
                        else delete filters[key];
                        renderFilters();
                        if (inp.value.trim()) { clearTimeout(_searchTimer); search(); }
                        else doSearch("");
                    };
                    group.appendChild(label);
                    group.appendChild(sel);
                    filterBar.appendChild(group);
                }

                if (shown) {
                    filterBar.style.display = "flex";
                    if (Object.keys(filters).length) {
                        const clear = document.createElement("span");
                        clear.textContent = animaTxt("✕ 清除");
                        clear.style.cssText = "padding:3px 10px;border-radius:7px;cursor:pointer;color:var(--anima-accent-soft);font-size:10px;margin-left:auto;border:1px solid rgba(var(--anima-accent-rgb),0.3);background:rgba(var(--anima-accent-rgb),0.08);transition:all 0.2s;";
                        clear.onclick = () => { filters = {}; page = 1; renderFilters(); if (inp.value.trim()) search(); else doSearch(""); };
                        filterBar.appendChild(clear);
                    }
                }
            }

            async function loadFacets() {
                try {
                    const r = await fetch("/danbooru_anima/animadex_facets", {
                        method: "POST", headers: {"Content-Type":"application/json"},
                        body: JSON.stringify({mode}),
                    });
                    const d = await r.json();
                    if (d.success) facetData[mode] = d.facets;
                } catch {}
                renderFilters();
            }

            // ── 提示栏 ──
            const hint = document.createElement("div");
            hint.style.cssText = "padding:4px 12px;font-size:11px;color:var(--anima-mute-dim);border-bottom:1px solid var(--anima-line);flex-shrink:0;";
            hint.textContent = animaTxt("💡 点击结果选中并输出 · 筛选下拉选择后自动刷新");

            // ── 网格 ──
            const grid = document.createElement("div");
            grid.style.cssText = "flex:1;min-height:0;overflow-y:auto;padding:4px;display:flex;flex-wrap:wrap;gap:3px;align-content:flex-start;";

            // ── 翻页栏 ──
            const pageBar = document.createElement("div");
            pageBar.style.cssText = "display:none;justify-content:center;align-items:center;gap:6px;padding:8px 10px;border-top:1px solid var(--anima-line);flex-shrink:0;font-size:12px;";

            function goPage(p) {
                page = p;
                const q = inp.value.trim();
                if (q) doSearch(q);
                else doSearch("");
            }

            function renderPage(total) {
                totalResults = total;
                if (sortMode === "random") {
                    pageBar.style.display = "flex";
                    pageBar.innerHTML = "";
                    const hint = document.createElement("span");
                    hint.textContent = animaTxt(skipFavs ? "🔀 随机一页 · 已跳过收藏 · 再点「随机」换一批" : "🔀 随机一页 · 再点「随机」换一批");
                    hint.style.cssText = "color:var(--anima-accent-soft);font-size:11px;padding:3px 12px;";
                    pageBar.appendChild(hint);
                    return;
                }
                const totalPages = Math.ceil(totalResults / 36);
                if (totalPages <= 1) { pageBar.style.display = "none"; return; }
                pageBar.style.display = "flex";
                pageBar.innerHTML = "";

                const prev = document.createElement("span");
                prev.textContent = animaTxt("◀ 上一页");
                prev.style.cssText = `cursor:${page>1?"pointer":"default"};color:${page>1?"var(--anima-accent-soft)":"var(--anima-dot-off)"};font-size:11px;padding:3px 12px;border-radius:8px;border:1px solid ${page>1?"rgba(var(--anima-accent-rgb),0.3)":"var(--anima-line)"};`;
                if (page > 1) prev.onclick = () => goPage(page - 1);
                pageBar.appendChild(prev);

                // 页码：当前页前后各2页
                const start = Math.max(1, page - 2);
                const end = Math.min(totalPages, page + 2);
                if (start > 1) { const e = document.createElement("span"); e.textContent = "..."; e.style.cssText = "color:#6e7681;font-size:11px;"; pageBar.appendChild(e); }
                for (let i = start; i <= end; i++) {
                    const pn = document.createElement("span");
                    pn.textContent = i;
                    pn.style.cssText = `cursor:pointer;padding:3px 9px;border-radius:7px;font-size:11px;background:${i===page?"var(--anima-accent-soft)":"transparent"};color:${i===page?"#fff":"var(--anima-mute)"};`;
                    if (i !== page) pn.onclick = () => goPage(i);
                    pageBar.appendChild(pn);
                }
                if (end < totalPages) { const e = document.createElement("span"); e.textContent = "..."; e.style.cssText = "color:#6e7681;font-size:11px;"; pageBar.appendChild(e); }

                const next = document.createElement("span");
                next.textContent = animaTxt("下一页 ▶");
                next.style.cssText = `cursor:${page<totalPages?"pointer":"default"};color:${page<totalPages?"var(--anima-accent-soft)":"var(--anima-dot-off)"};font-size:11px;padding:3px 12px;border-radius:8px;border:1px solid ${page<totalPages?"rgba(var(--anima-accent-rgb),0.3)":"var(--anima-line)"};`;
                if (page < totalPages) next.onclick = () => goPage(page + 1);
                pageBar.appendChild(next);
            }

            function render() {
                grid.innerHTML = "";
                if (!results.length) {
                    if (skipFavs && sortMode === "random" && !(inp.value || "").trim()) {
                        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px 20px;color:var(--anima-mute);"><div style="font-size:28px;margin-bottom:10px;">🚫</div><div style="font-size:14px;">' + animaTxt("这批都是已收藏项，再点「随机」或关闭跳过收藏") + '</div></div>';
                        return;
                    }
                    pageBar.style.display = "none";
                    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--anima-mute-dim);"><div style="font-size:52px;margin-bottom:14px;opacity:0.6;">🔍</div><div style="font-size:15px;color:var(--anima-mute);">输入关键词搜索 AnimaDex</div><div style="font-size:11px;color:var(--anima-mute-dim);margin-top:6px;">切换画师/角色模式 · 下拉筛选 · 点击卡片选中并输出</div></div>';
                    return;
                }
                for (const r of results) {
                    const name = r.name || "";
                    const slug = r.slug || "";
                    const cp = r.copyright_name || "";
                    const trig = r.trigger || "";
                    const tags = r.tags || [];
                    const thumbUrl = r.thumb_url || "";

                    // 复制文本
                    const copyTag = trig || name;
                    const copyTagFull = mode === "characters"
                        ? [trig, ...tags].filter(Boolean).join(", ")
                        : (trig || name);
                    // 画师标签加 @
                    const copyTagAt = mode === "artists" ? "@" + (trig || name) : (trig || name);
                    // D站搜索用标签（API 的 slug 已经是 D站格式，下划线分隔）
                    const dbTag = r.slug || trig || name;

                    const card = document.createElement("div");
                    card.style.cssText = "background:var(--anima-bg-deep);border-radius:6px;overflow:hidden;cursor:pointer;border:2px solid transparent;width:calc(33.333% - 3px);flex-shrink:0;box-sizing:border-box;position:relative;transition:transform 0.2s,box-shadow 0.2s;";
                    card.onmouseover = () => { card.style.transform = "translateY(-2px)"; card.style.boxShadow = "0 6px 16px rgba(0,0,0,0.35), 0 0 12px rgba(var(--anima-accent-rgb),0.15)"; card.querySelectorAll("button, .adx-star, .adx-info").forEach(b => { b.style.opacity = "1"; }); };
                    card.onmouseout = () => { card.style.transform = "none"; card.style.boxShadow = "none"; card.querySelectorAll("button, .adx-star, .adx-info").forEach(b => { b.style.opacity = "0"; }); if (!card.classList.contains("ad-sel")) card.style.borderColor = "transparent"; };
                    card.onclick = () => {
                        grid.querySelectorAll(".ad-sel").forEach(c => { c.style.borderColor = "transparent"; c.style.boxShadow = "none"; c.classList.remove("ad-sel"); });
                        card.style.borderColor = "var(--anima-accent-soft)"; card.style.boxShadow = "0 0 12px rgba(var(--anima-accent-rgb),0.3)"; card.classList.add("ad-sel");
                    };

                    const imgDiv = document.createElement("div");
                    imgDiv.style.cssText = "width:100%;background:var(--anima-bg);display:flex;align-items:center;justify-content:center;position:relative;";

                    if (thumbUrl) {
                        const img = new Image();
                        img.draggable = false;
                        img.style.cssText = "width:100%;height:auto;object-fit:contain;display:block;";
                        img.src = "/danbooru_anima/animadex_image?url=" + encodeURIComponent(thumbUrl);
                        img.onerror = function() { this.style.display = "none"; this.parentElement.textContent = "🖼"; this.parentElement.style.fontSize = "28px"; this.parentElement.style.color = "var(--anima-accent)"; };
                        imgDiv.appendChild(img);
                    } else { imgDiv.textContent = "🖼"; imgDiv.style.fontSize = "28px"; imgDiv.style.color = "var(--anima-accent)"; }

                    // ⭐ 收藏
                    const starBtn = document.createElement("span");
                    const favCat = mode === "artists" ? "animadex_artists" : "animadex_characters";
                    const favTag = slug || name;
                    starBtn.textContent = " ☆"; starBtn.title = animaTxt("收藏");
                    starBtn.className = "adx-star";
                    starBtn.style.cssText = "position:absolute;top:4px;right:4px;cursor:pointer;width:26px;height:26px;border-radius:50%;background:rgba(13,17,22,0.55);display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;color:#fbbf24;z-index:3;opacity:0;transition:opacity .15s ease;";
                    starBtn.onclick = (e) => {
                        e.stopPropagation();
                        toggleFav(favTag, favCat, thumbUrl, {tags: tags, copyright_name: cp || ""}).then(() => {
                            loadFavCache().then(() => {
                                const is = _favCache?.[favCat]?.[favTag];
                                starBtn.textContent = is ? " ★" : " ☆";
                                starBtn.style.color = is ? "#ffeb3b" : "var(--anima-mute)";
                            });
                        });
                    };
                    loadFavCache().then(() => {
                        const is = _favCache?.[favCat]?.[favTag];
                        if (is) { starBtn.textContent = " ★"; starBtn.style.color = "#ffeb3b"; }
                    });
                    imgDiv.appendChild(starBtn);
                    // 画师/角色名常显（左上角小标签，不与底部按钮重叠）
                    const nameTag = document.createElement("div");
                    nameTag.textContent = name;
                    nameTag.style.cssText = "position:absolute;top:4px;left:4px;padding:2px 8px;border-radius:999px;background:rgba(13,17,22,0.68);color:#e0e0e0;font-size:10px;font-weight:bold;pointer-events:none;z-index:3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:72%;";
                    imgDiv.appendChild(nameTag);

                    const info = document.createElement("div");
                    info.className = "adx-info";
                    info.style.cssText = "position:absolute;left:0;right:0;bottom:0;padding:16px 6px 4px;font-size:11px;color:#e0e0e0;line-height:1.4;background:linear-gradient(transparent, rgba(0,0,0,0.85));opacity:0;transition:opacity .15s ease;z-index:2;";
                    let html = "";  // 名字已由左上角 nameTag 常显
                    if (cp) html += `<div style="color:var(--anima-mute);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📺 ${cp}</div>`;
                    if (mode === "characters") {
                        // 显示 trigger + 前5个常用标签
                        const preview = [trig, ...tags].filter(Boolean).slice(0, 5);
                        if (preview.length) html += `<div style="color:var(--anima-accent-soft);font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;">${preview.join(", ")}${tags.length>5?"…":""}</div>`;
                    }
                    info.innerHTML = html;

                    // ── 复制按钮 ──
                    const btnRow = document.createElement("div");
                    btnRow.className = "adx-info";
                    btnRow.style.cssText = "position:absolute;top:34px;right:4px;display:flex;gap:3px;z-index:3;opacity:0;transition:opacity .15s ease;";

                    function mkCopyBtn(label, text, short=true) {
                        const b = document.createElement("button");
                        b.textContent = label;
                        b.style.cssText = `flex:0 0 auto;padding:5px 10px;border-radius:999px;border:1px solid rgba(255,255,255,0.28);background:linear-gradient(rgba(255,255,255,0.2), rgba(255,255,255,0.09));color:#ffffff;cursor:pointer;font-size:10px;font-weight:700;text-align:center;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.8);transition:filter .15s ease;`; b.onmouseenter = () => { b.style.filter = "brightness(1.3)"; }; b.onmouseleave = () => { b.style.filter = ""; };
                        b.onclick = (e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(text).then(() => {
                                b.textContent = "✅";
                                setTimeout(() => { b.textContent = label; }, 1500);
                            });
                        };
                        return b;
                    }

                    // 角色模式：单标签 + 完整标签；画师模式：带 @ 复制的单标签
                    if (mode === "characters") {
                        btnRow.appendChild(mkCopyBtn("📋 标签", copyTag));
                        btnRow.appendChild(mkCopyBtn("📋 标签+常用", copyTagFull));
                    } else {
                        btnRow.appendChild(mkCopyBtn("📋 复制tag", copyTagAt));
                    }
                    imgDiv.appendChild(btnRow);

                    // ── 去 D站搜索 ──
                    const dbBtn = document.createElement("button");
                    dbBtn.textContent = animaTxt("🔍 去D站");
                    dbBtn.style.cssText = "flex:1;padding:8px 6px;margin-top:5px;border-radius:10px;border:1px solid rgba(var(--anima-accent-rgb),0.4);background:linear-gradient(rgba(var(--anima-accent-rgb),0.18), rgba(var(--anima-accent-rgb),0.08));color:var(--anima-accent-soft);cursor:pointer;font-size:11px;font-weight:700;text-align:center;white-space:nowrap;transition:filter .15s ease;"; dbBtn.onmouseenter = () => { dbBtn.style.filter = "brightness(1.35)"; }; dbBtn.onmouseleave = () => { dbBtn.style.filter = ""; };
                    dbBtn.onclick = (e) => {
                        e.stopPropagation();
                        window._adexDbSearch = dbTag;
                        node.isChanged = true;
                        // 直连 D站浏览器搜索框（无论端口是否连线，即时生效）
                        for (const n of (app.graph._nodes || [])) {
                            if (n.type === "DanbooruBrowser") {
                                if (typeof n.__dbSearch === "function") { n.__dbSearch(dbTag); continue; }
                                const el = n.nodeEl?.querySelector?.("input[type='text']");
                                if (el) { el.value = dbTag; el.dispatchEvent(new Event("input", {bubbles:true})); el.dispatchEvent(new KeyboardEvent("keydown", {key:"Enter", bubbles:true})); }
                            }
                        }
                        dbBtn.textContent = animaTxt("✅ 已发送");
                        setTimeout(() => { dbBtn.textContent = animaTxt("🔍 去D站"); }, 1500);
                    };
                    const sendRow = document.createElement("div");
                    sendRow.style.cssText = "display:flex;gap:5px;";
                    sendRow.appendChild(dbBtn);

                    // ── 去 G站搜索 ──
                    const gelBtn = document.createElement("button");
                    gelBtn.textContent = animaTxt("🔍 去G站");
                    gelBtn.style.cssText = "flex:1;padding:8px 6px;margin-top:5px;border-radius:10px;border:1px solid rgba(var(--anima-accent-rgb),0.4);background:linear-gradient(rgba(var(--anima-accent-rgb),0.18), rgba(var(--anima-accent-rgb),0.08));color:var(--anima-accent-soft);cursor:pointer;font-size:11px;font-weight:700;text-align:center;white-space:nowrap;transition:filter .15s ease;"; gelBtn.onmouseenter = () => { gelBtn.style.filter = "brightness(1.35)"; }; gelBtn.onmouseleave = () => { gelBtn.style.filter = ""; };
                    gelBtn.onclick = (e) => {
                        e.stopPropagation();
                        window._adexGelSearch = dbTag;
                        // 远程检测 G站浏览器节点 → 直接操作搜索框
                        for (const n of (app.graph._nodes || [])) {
                            if (n.type === "GelbooruBrowser") {
                                if (typeof n.__gelSearch === "function") { n.__gelSearch(dbTag); continue; }
                                const el = n.nodeEl?.querySelector?.("input[type='text']");
                                if (el) { el.value = dbTag; el.dispatchEvent(new Event("input", {bubbles:true})); el.dispatchEvent(new KeyboardEvent("keydown", {key:"Enter", bubbles:true})); }
                            }
                        }
                        gelBtn.textContent = animaTxt("✅ 已发送");
                        setTimeout(() => { gelBtn.textContent = animaTxt("🔍 去G站"); }, 1500);
                    };
                    sendRow.appendChild(gelBtn);
                    info.appendChild(sendRow);

                    card.append(imgDiv, info);
                    grid.appendChild(card);
                }
            }

            async function doSearch(q) {
                const gen = ++_searchGen;
                if (_searchAbort) {
                    try { _searchAbort.abort(); } catch (e0) {}
                }
                const ac = new AbortController();
                _searchAbort = ac;
                grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--anima-mute);">⏳ 搜索中...</div>';
                pageBar.style.display = "none";
                const wantSkip = skipFavs && sortMode === "random" && !(q || "").trim();
                let favSet = null;
                if (wantSkip) {
                    await loadFavCache(true);
                    if (gen !== _searchGen) return;
                    favSet = _collectFavKeys();
                }
                const showAdexErr = (err) => {
                    results = [];
                    pageBar.style.display = "none";
                    grid.innerHTML = "";
                    const box = document.createElement("div");
                    box.style.cssText = "grid-column:1/-1;text-align:center;padding:40px 20px;color:#f87171;font-size:13px;line-height:1.6;";
                    box.textContent = animaTxt("无法连接 AnimaDex：") + err;
                    const eh = document.createElement("div");
                    eh.style.cssText = "margin-top:8px;color:var(--anima-mute);font-size:11px;";
                    const raw = String(err || "");
                    let hint = animaTxt("网站在 Cloudflare 上。浏览器能打开，插件仍可能被拦。看 ComfyUI 控制台 [AnimaDex] 日志。");
                    if (/超时|timed out/i.test(raw)) {
                        hint = animaTxt("开着梯子时插件走系统代理，超时会自动再试。还不行就再点一次「热门」。");
                    } else if (/本地代理|10061|ProxyError|系统代理/.test(raw)) {
                        hint = animaTxt("系统代理端口没有响应。梯子关掉时请一并关掉系统代理，插件会改走直连。");
                    }
                    eh.textContent = hint;
                    box.appendChild(eh);
                    grid.appendChild(box);
                };
                try {
                    let acc = [];
                    const seen = {};
                    let lastTotal = 0;
                    const tries = wantSkip ? 6 : 1;
                    for (let ti = 0; ti < tries; ti++) {
                        if (gen !== _searchGen) return;
                        const r = await fetch("/danbooru_anima/animadex_search", {
                            method: "POST", headers: {"Content-Type":"application/json"},
                            body: JSON.stringify({mode, query: q, filters, page, sort: sortMode}),
                            signal: ac.signal,
                        });
                        if (gen !== _searchGen) return;
                        const d = await r.json();
                        if (d && d.success === false && d.error) {
                            if (gen !== _searchGen) return;
                            if (!acc.length) { showAdexErr(d.error); return; }
                            break;
                        }
                        lastTotal = d.total || 0;
                        if (typeof d.page === "number" && d.page > 0) page = d.page;
                        const batch = d.results || [];
                        if (!wantSkip) {
                            acc = batch;
                            break;
                        }
                        for (let bi = 0; bi < batch.length; bi++) {
                            const it = batch[bi];
                            const id = (it && (it.slug || it.name)) || "";
                            if (!id || seen[id] || _itemIsFav(it, favSet)) continue;
                            seen[id] = 1;
                            acc.push(it);
                            if (acc.length >= 36) break;
                        }
                        if (acc.length >= 12) break;
                    }
                    if (gen !== _searchGen) return;
                    results = acc;
                    renderPage(lastTotal);
                } catch (e) {
                    if (gen !== _searchGen) return;
                    if (e && e.name === "AbortError") return;
                    results = [];
                }
                if (gen !== _searchGen) return;
                render();
            }

            async function search() {
                page = 1;
                const q = inp.value.trim();
                if (q) doSearch(q);
            }

            el.append(bar, hint, filterBar, grid, pageBar);
            this.addDOMWidget("animadex_ui", "div", el, { onDraw: () => {} });

            loadFacets();
            doSearch("");
        };
    },
});
