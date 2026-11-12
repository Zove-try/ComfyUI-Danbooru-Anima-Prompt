import { app } from "/scripts/app.js";
import "./00_anima_i18n.js";
import "./00_anima_theme.js";

app.registerExtension({
    name: "Comfy.DanbooruAnimaDataBackup",

    setup() {
        // 绕开 actionBarButtons 的 icon 字段（该版本 ComfyUI 把它当 CSS class 处理），直接往按钮 DOM 插图标
        if (!document.getElementById("anima-topbar-btn-css")) {
            var st = document.createElement("style");
            st.id = "anima-topbar-btn-css";
            st.textContent =
                "button.anima-topbar-btn{position:relative;width:34px!important;height:34px!important;min-width:34px!important;padding:0!important;margin:0 1px!important;display:inline-flex!important;align-items:center;justify-content:center;border-radius:9px!important;overflow:visible!important;cursor:pointer!important;color:var(--anima-accent-soft);background:rgba(var(--anima-accent-rgb),.10)!important;box-shadow:0 0 0 1px rgba(var(--anima-accent-rgb),.28),0 0 10px rgba(var(--anima-accent-rgb),.26)!important;transition:transform .18s cubic-bezier(.2,.8,.2,1),box-shadow .18s ease,filter .18s ease,background .18s ease!important;}" +
                "button.anima-topbar-btn:hover{transform:translateY(-1px) scale(1.1)!important;filter:brightness(1.14) saturate(1.08)!important;background:rgba(var(--anima-accent-rgb),.20)!important;box-shadow:0 0 0 1.5px rgba(var(--anima-accent-rgb),.72),0 8px 18px rgba(var(--anima-accent-rgb),.42)!important;}" +
                "button.anima-topbar-btn:active{transform:translateY(0) scale(.92)!important;filter:brightness(.96)!important;}" +
                "button.anima-topbar-btn:focus-visible{outline:2px solid rgba(var(--anima-accent-rgb),.85)!important;outline-offset:2px!important;}" +
                "button.anima-topbar-btn.anima-topbar-settings::after{content:'';position:absolute;inset:3px;border-radius:7px;pointer-events:none;background:linear-gradient(145deg,rgba(255,255,255,.26),transparent 46%,transparent 58%,rgba(0,0,0,.22));opacity:.5;transition:opacity .18s ease;}" +
                "button.anima-topbar-btn.anima-topbar-settings:hover::after{opacity:.85;}" +
                "button.anima-topbar-btn img[data-role='anima-icon']{width:26px;height:26px;border-radius:7px;object-fit:cover;display:block;pointer-events:none;-webkit-user-drag:none;transition:transform .18s ease;}" +
                "button.anima-topbar-btn:hover img[data-role='anima-icon']{transform:scale(1.05);}" +
                "button.anima-topbar-btn .anima-viewer-icon{width:20px;height:20px;display:flex;pointer-events:none;filter:drop-shadow(0 0 4px rgba(var(--anima-accent-rgb),.45));}" +
                "button.anima-topbar-btn .anima-viewer-icon svg{width:20px;height:20px;display:block;}" +
                "button.anima-topbar-btn>span:not(.anima-viewer-icon),button.anima-topbar-btn>i{display:none!important;}";
            document.head.appendChild(st);
        }
        var VIEWER_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="3" stroke="currentColor" stroke-width="1.7"/><rect x="5.4" y="5.4" width="5.8" height="5.8" rx="1.1" fill="currentColor" opacity=".42"/><rect x="12.8" y="5.4" width="5.8" height="5.8" rx="1.1" fill="currentColor" opacity=".72"/><rect x="5.4" y="12.8" width="5.8" height="5.8" rx="1.1" fill="currentColor" opacity=".28"/><rect x="12.8" y="12.8" width="5.8" height="5.8" rx="1.1" fill="currentColor" opacity=".55"/></svg>';
        function kindOf(b) {
            var mark = b.getAttribute("data-anima-topbar") || "";
            if (mark === "viewer" || mark === "settings") return mark;
            if (b.querySelector(".anima-viewer-icon")) return "viewer";
            if (b.querySelector("img[data-role='anima-icon']")) return "settings";
            var _bt = ((b.textContent || "") + " " + (b.getAttribute("title") || "") + " " + (b.getAttribute("aria-label") || "")).toLowerCase();
            if (_bt.indexOf("输出提示词查看器") >= 0 || _bt.indexOf("output prompt viewer") >= 0) return "viewer";
            if (_bt.indexOf("总设置") >= 0 || _bt.indexOf("anima settings") >= 0) return "settings";
            return "";
        }
        function tipFor(kind) {
            if (kind === "viewer") {
                return animaTxt("输出提示词查看器");
            }
            return animaTxt("Anima 总设置：备份/导入、翻译 API、D站凭据、G站凭据、颜色主题、弹窗背景、模糊特效");
        }
        function applyTip(b, kind) {
            var tip = tipFor(kind);
            b.title = tip;
            b.setAttribute("aria-label", tip);
        }
        function dress(b, kind) {
            var okIcon = kind === "viewer" ? b.querySelector(".anima-viewer-icon") : b.querySelector("img[data-role='anima-icon']");
            if (b.getAttribute("data-anima-topbar") === kind && okIcon && b.childNodes.length === 1) {
                applyTip(b, kind);
                return;
            }
            b.setAttribute("data-anima-topbar", kind);
            b.classList.add("anima-topbar-btn");
            b.classList.add(kind === "viewer" ? "anima-topbar-viewer" : "anima-topbar-settings");
            b.classList.remove(kind === "viewer" ? "anima-topbar-settings" : "anima-topbar-viewer");
            while (b.firstChild) b.removeChild(b.firstChild);
            if (kind === "viewer") {
                var wrap = document.createElement("span");
                wrap.className = "anima-viewer-icon";
                wrap.innerHTML = VIEWER_SVG;
                b.appendChild(wrap);
            } else {
                var img = document.createElement("img");
                img.src = window.animaAsset("icon.png");
                img.dataset.role = "anima-icon";
                img.alt = "";
                img.draggable = false;
                b.appendChild(img);
            }
            applyTip(b, kind);
        }
        function dressAll() {
            var seen = { viewer: false, settings: false };
            var btns = document.querySelectorAll("button");
            for (var i = 0; i < btns.length; i++) {
                var k = kindOf(btns[i]);
                if (!k) continue;
                dress(btns[i], k);
                seen[k] = true;
            }
            var bar = document.querySelector("[data-testid='action-bar-buttons']");
            if (bar && !bar.getAttribute("data-anima-topbar-watch")) {
                bar.setAttribute("data-anima-topbar-watch", "1");
                new MutationObserver(function() { dressAll(); }).observe(bar, { childList: true, subtree: true });
            }
            return seen;
        }
        var tries = 0;
        var timer = setInterval(function() {
            tries++;
            var seen = dressAll();
            if ((seen.viewer && seen.settings) || tries > 40) clearInterval(timer);
        }, 400);
    },

    actionBarButtons: [
        {
            get label() { return animaTxt("输出提示词查看器"); },
            get tooltip() { return animaTxt("输出提示词查看器"); },
            onClick: function() {
                window.animaOpenViewer(window.animaAsset("output_prompt_viewer.html") + "?v=225");
            }
        },
        {
            get label() { return animaTxt("总设置"); },
            get tooltip() { return animaTxt("Anima 总设置：备份/导入、翻译 API、D站凭据、G站凭据、颜色主题、弹窗背景、模糊特效"); },
            onClick: () => {
                // ── 翻译设置状态（每次打开弹窗重新读取，与文本透传节点共用同一组 localStorage）──
                var _tp = localStorage.getItem("db_trans_provider") || "free";
                var _tfm = localStorage.getItem("db_trans_free_mode") || localStorage.getItem("db_free_mode") || "baidu";
                var _dsm = localStorage.getItem("db_trans_ds_model") || localStorage.getItem("db_ds_model") || "flash";
                var _tmodel = localStorage.getItem("db_trans_model_cu") || localStorage.getItem("db_trans_model") || "";
                var _turl = localStorage.getItem("db_trans_base_url_cu") || localStorage.getItem("db_trans_base_url") || "";
                var _tkey = "";
                var _akInp = null;
                var _appInp = null;
                function _baiduLlmOn() {
                    return _tp === "free" && _tfm === "baidu" && localStorage.getItem("db_trans_baidu_mode") === "llm";
                }
                function _loadTKey() {
                    if (_tp === "deepseek") _tkey = localStorage.getItem("db_trans_key_ds") || "";
                    else if (_tp === "custom") _tkey = localStorage.getItem("db_trans_key_cu") || "";
                    else if (_baiduLlmOn()) {
                        _tkey = localStorage.getItem("db_trans_key_bd_llm") || "";
                        if (!_tkey) {
                            var oldLlm = localStorage.getItem("db_trans_key_bd") || "";
                            if (oldLlm && oldLlm.indexOf(":") < 0) _tkey = oldLlm;
                        }
                    } else if (_tfm === "baidu") _tkey = localStorage.getItem("db_trans_key_bd") || "";
                    else _tkey = "";
                    if (_akInp) _akInp.value = _tkey;
                    if (_appInp) {
                        var appid = localStorage.getItem("db_trans_baidu_appid") || "";
                        if (!appid) {
                            var legacy = localStorage.getItem("db_trans_key_bd") || "";
                            if (legacy.indexOf(":") >= 0) appid = legacy.split(":")[0];
                        }
                        _appInp.value = appid;
                    }
                }
                function _saveTKey(k) {
                    if (_tp === "deepseek") localStorage.setItem("db_trans_key_ds", k);
                    else if (_tp === "custom") localStorage.setItem("db_trans_key_cu", k);
                    else if (_baiduLlmOn()) {
                        localStorage.setItem("db_trans_key_bd_llm", k);
                        var oldBd = localStorage.getItem("db_trans_key_bd") || "";
                        if (oldBd && oldBd.indexOf(":") < 0) localStorage.removeItem("db_trans_key_bd");
                    } else if (_tfm === "baidu") localStorage.setItem("db_trans_key_bd", k);
                    _tkey = k;
                }
                function _saveBaiduAppid(v) {
                    localStorage.setItem("db_trans_baidu_appid", (v || "").trim());
                }
                function _modelHit(it, q) {
                    var parts = (q || "").trim().toLowerCase().split(/\s+/);
                    var raw = ((it.label || "") + " " + (it.id || "")).toLowerCase();
                    var flat = raw.replace(/[\s_\-./]+/g, "");
                    for (var i = 0; i < parts.length; i++) {
                        var p = parts[i];
                        if (!p) continue;
                        var pf = p.replace(/[\s_\-./]+/g, "");
                        if (raw.indexOf(p) < 0 && (!pf || flat.indexOf(pf) < 0)) return false;
                    }
                    return true;
                }
                function _setModelCatalog(picker, items, pickedId) {
                    picker._modelCatalog = items || [];
                    picker._modelPicked = pickedId || "";
                    if (picker._syncModelPicker) picker._syncModelPicker();
                }
                function _createModelPicker() {
                    if (!document.getElementById("anima-model-menu-css")) {
                        var st = document.createElement("style");
                        st.id = "anima-model-menu-css";
                        st.textContent = ".anima-model-face{position:relative;user-select:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:22px;box-sizing:border-box;}.anima-model-face:after{content:'\\25BE';position:absolute;right:8px;top:50%;transform:translateY(-50%);color:var(--anima-mute);pointer-events:none;font-size:11px;}.anima-model-menu{display:none;position:fixed;z-index:100002;flex-direction:column;background:var(--anima-bg-deep,#161616);border:1px solid var(--anima-line,#444);border-radius:6px;box-shadow:0 10px 28px rgba(0,0,0,.55);overflow:hidden;}.anima-model-menu.is-open{display:flex;}.anima-model-head{display:flex;align-items:center;flex:0 0 auto;border-bottom:1px solid var(--anima-line,#444);background:#1c1c1c;}.anima-model-head input{flex:1;min-width:0;border:none;background:transparent;color:#eee;padding:8px 10px;font-size:13px;outline:none;color-scheme:dark;}.anima-model-count{flex:0 0 auto;padding:0 10px;color:var(--anima-mute);font-size:11px;white-space:nowrap;}.anima-model-list{overflow:auto;flex:1 1 auto;min-height:0;}.anima-model-opt{padding:7px 10px;cursor:pointer;font-size:12px;line-height:1.35;color:#e6e6e6;word-break:break-all;}.anima-model-opt:hover{background:rgba(var(--anima-accent-rgb),0.22);}.anima-model-opt.is-current{background:rgba(var(--anima-accent-rgb),0.35);}.anima-model-empty{padding:10px;color:var(--anima-mute);font-size:12px;}";
                        document.head.appendChild(st);
                    }
                    var face = document.createElement("div");
                    face.className = "anima-model-face";
                    face.style.cssText = selStyle;
                    face.style.position = "relative";
                    face.style.paddingRight = "22px";
                    face.style.minWidth = "0";
                    face.tabIndex = 0;
                    var panel = document.createElement("div");
                    panel.className = "anima-model-menu";
                    var head = document.createElement("div");
                    head.className = "anima-model-head";
                    var search = document.createElement("input");
                    search.type = "text";
                    search.placeholder = "搜索模型，例如 GPT";
                    search.autocomplete = "off";
                    var count = document.createElement("span");
                    count.className = "anima-model-count";
                    head.appendChild(search);
                    head.appendChild(count);
                    var list = document.createElement("div");
                    list.className = "anima-model-list";
                    panel.appendChild(head);
                    panel.appendChild(list);
                    face._panel = panel;
                    face._modelCatalog = [];
                    face._modelPicked = "";
                    face._open = false;
                    face._onChange = null;
                    Object.defineProperty(face, "value", {
                        configurable: true,
                        get: function(){ return face._modelPicked || ""; },
                        set: function(v){ face._modelPicked = v || ""; face._syncModelPicker(); }
                    });
                    function paint() {
                        var id = face._modelPicked || "";
                        var text = id;
                        if (!id) text = (face._modelCatalog && face._modelCatalog.length) ? "点开后搜索模型" : "请先获取模型";
                        else {
                            var all = face._modelCatalog || [];
                            for (var i = 0; i < all.length; i++) if (all[i] && all[i].id === id && all[i].label) { text = all[i].label; break; }
                        }
                        face.textContent = text;
                        face.title = id || text;
                    }
                    function renderList(scrollCurrent) {
                        var all = face._modelCatalog || [];
                        var q = search.value || "";
                        var shown = 0;
                        var total = 0;
                        var currentEl = null;
                        list.innerHTML = "";
                        var frag = document.createDocumentFragment();
                        for (var i = 0; i < all.length; i++) {
                            var it = all[i];
                            if (!it || !it.id) continue;
                            total++;
                            if (!_modelHit(it, q)) continue;
                            shown++;
                            var row = document.createElement("div");
                            row.className = "anima-model-opt";
                            row.setAttribute("data-id", it.id);
                            row.textContent = it.label || it.id;
                            row.title = it.id;
                            if (it.id === face._modelPicked) {
                                row.classList.add("is-current");
                                currentEl = row;
                            }
                            (function(id){
                                row.addEventListener("mousedown", function(e){
                                    e.preventDefault();
                                    e.stopPropagation();
                                    face._modelPicked = id;
                                    paint();
                                    closeMenu();
                                    if (face._onChange) face._onChange();
                                });
                            })(it.id);
                            frag.appendChild(row);
                        }
                        if (!shown) {
                            var empty = document.createElement("div");
                            empty.className = "anima-model-empty";
                            empty.textContent = total ? "没有含这些词的模型" : "请先获取模型";
                            frag.appendChild(empty);
                        }
                        list.appendChild(frag);
                        count.textContent = total ? (shown + " / " + total) : "";
                        if (scrollCurrent && currentEl) currentEl.scrollIntoView({ block: "nearest" });
                    }
                    function place() {
                        var rect = face.getBoundingClientRect();
                        var width = Math.max(rect.width, 360);
                        var left = rect.left;
                        if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - width);
                        var spaceBelow = window.innerHeight - rect.bottom - 8;
                        var spaceAbove = rect.top - 8;
                        var maxH = 320;
                        var top;
                        if (spaceBelow >= 180 || spaceBelow >= spaceAbove) {
                            top = rect.bottom + 4;
                            maxH = Math.min(320, Math.max(160, spaceBelow - 4));
                        } else {
                            maxH = Math.min(320, Math.max(160, spaceAbove - 4));
                            top = Math.max(8, rect.top - 4 - maxH);
                        }
                        panel.style.left = left + "px";
                        panel.style.top = top + "px";
                        panel.style.width = width + "px";
                        panel.style.maxHeight = maxH + "px";
                    }
                    function openMenu() {
                        if (window._animaModelMenu && window._animaModelMenu !== face && window._animaModelMenu._closeModelMenu) window._animaModelMenu._closeModelMenu();
                        window._animaModelMenu = face;
                        search.value = "";
                        renderList(true);
                        if (!panel.parentNode) document.body.appendChild(panel);
                        panel.classList.add("is-open");
                        face._open = true;
                        place();
                        setTimeout(function(){ search.focus(); }, 0);
                    }
                    function closeMenu() {
                        face._open = false;
                        panel.classList.remove("is-open");
                        if (panel.parentNode) panel.parentNode.removeChild(panel);
                        if (window._animaModelMenu === face) window._animaModelMenu = null;
                    }
                    face._closeModelMenu = closeMenu;
                    face._place = place;
                    face._clearModelQuery = function(){ search.value = ""; };
                    face._syncModelPicker = function(){ paint(); if (face._open) renderList(false); };
                    face.addEventListener("click", function(e){
                        e.stopPropagation();
                        if (face._open) closeMenu();
                        else openMenu();
                    });
                    search.addEventListener("mousedown", function(e){ e.stopPropagation(); });
                    search.addEventListener("click", function(e){ e.stopPropagation(); });
                    search.addEventListener("input", function(){ renderList(false); });
                    search.addEventListener("keydown", function(e){
                        e.stopPropagation();
                        if (e.key === "Escape") { e.preventDefault(); closeMenu(); return; }
                        if (e.key === "Enter") {
                            var rows = list.querySelectorAll(".anima-model-opt");
                            if (rows.length === 1) {
                                e.preventDefault();
                                face._modelPicked = rows[0].getAttribute("data-id") || "";
                                paint();
                                closeMenu();
                                if (face._onChange) face._onChange();
                            }
                        }
                    });
                    if (box && !box._modelMenuScroll) {
                        box._modelMenuScroll = true;
                        box.addEventListener("scroll", function(){
                            var m = window._animaModelMenu;
                            if (m && m._open && m._place) m._place();
                        });
                    }
                    paint();
                    return face;
                }
                async function _pullModels(baseUrl, selectEl, onPick) {
                    var key = (_akInp && _akInp.value || "").trim();
                    if (!key) { alert("请先填写 API Key"); return; }
                    if (!baseUrl) { alert("请先填写 Base URL"); return; }
                    try {
                        var r = await fetch("/danbooru_anima/llm_models", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({base_url: baseUrl, api_key: key})});
                        var d = await r.json();
                        if (!d || !d.success || !d.models || !d.models.length) { alert((d && d.error) || "没有获取到模型"); return; }
                        var items = [];
                        for (var mi = 0; mi < d.models.length; mi++) {
                            var item = d.models[mi];
                            if (!item || !item.id) continue;
                            items.push({ id: item.id, label: (item.name && item.name !== item.id) ? (item.name + " · " + item.id) : item.id });
                        }
                        if (!items.length) { alert("没有获取到模型"); return; }
                        var keep = selectEl._modelPicked || "";
                        var keepOk = false;
                        for (var ki = 0; ki < items.length; ki++) if (items[ki].id === keep) keepOk = true;
                        if (selectEl._closeModelMenu) selectEl._closeModelMenu();
                        if (selectEl._clearModelQuery) selectEl._clearModelQuery();
                        var chosen = keepOk ? keep : items[0].id;
                        _setModelCatalog(selectEl, items, chosen);
                        if (onPick) onPick(chosen);
                        alert("已获取 " + items.length + " 个模型。点开下拉框，在弹出的列表里输入关键词筛选。");
                    } catch (e) {
                        alert("获取模型失败: " + (e && e.message ? e.message : e));
                    }
                }

                var ov = document.createElement("div");
                ov.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:transparent;z-index:100000;display:flex;align-items:center;justify-content:center;";
                ov.onclick = function(e){ if(e.target===ov) ov.remove(); };
                (function(){
                    var _down = function(e){
                        var m = window._animaModelMenu;
                        if (!m || !m._open) return;
                        if (m.contains(e.target) || (m._panel && m._panel.contains(e.target))) return;
                        m._closeModelMenu();
                    };
                    var _move = function(){
                        var m = window._animaModelMenu;
                        if (m && m._open && m._place) m._place();
                    };
                    document.addEventListener("mousedown", _down, true);
                    window.addEventListener("resize", _move);
                    var _rawRemove = ov.remove.bind(ov);
                    ov.remove = function(){
                        document.removeEventListener("mousedown", _down, true);
                        window.removeEventListener("resize", _move);
                        var m = window._animaModelMenu;
                        if (m && m._closeModelMenu) m._closeModelMenu();
                        _rawRemove();
                    };
                })();
                var box = document.createElement("div");
                box.id = "db-top-popup";
                var _popStyle = document.createElement("style");
                _popStyle.textContent = "#db-top-popup select{color-scheme:dark;} #db-top-popup select option{background:var(--anima-bg-deep);color:#e0e0e0;} #db-top-popup input[type=range]{width:100%;accent-color:var(--anima-accent-range);height:6px;cursor:pointer;} #db-top-popup input[type=range]:disabled{opacity:.35;cursor:not-allowed;} #db-top-popup input[type=checkbox]{accent-color:var(--anima-accent-range);width:16px;height:16px;cursor:pointer;}";
                document.head.appendChild(_popStyle);
                box.style.cssText = "position:relative;background:var(--anima-bg-deep);border:1px solid rgba(var(--anima-accent-rgb),0.2);border-radius:16px;padding:24px;width:520px;max-height:85vh;overflow-y:auto;display:flex;flex-direction:column;gap:16px;box-shadow:0 20px 60px rgba(0,0,0,0.8);";
                if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(box);
                var titleEl = document.createElement("div");
                titleEl.innerHTML = '<div style="color:var(--anima-ink);font-weight:bold;font-size:15px;">' + animaTxt("⚙ Anima 总设置") + '</div><div style="color:var(--anima-mute);font-size:12px;">' + animaTxt("备份 / 导入、颜色主题、翻译与 D 站 / G 站凭据、弹窗背景与透明度、模糊特效") + '</div>';
                box.appendChild(titleEl);
                // 统一 hover 动效（上浮 + 发光）
                function _hov(el, glow, rest) {
                    el.style.transition = "transform .15s ease, box-shadow .15s ease, filter .15s ease";
                    if (rest) el.style.boxShadow = rest;
                    el.onmouseenter = function(){ el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 4px 14px " + (glow || "rgba(var(--anima-accent-rgb),0.45)"); el.style.filter = "brightness(1.12)"; };
                    el.onmouseleave = function(){ el.style.transform = ""; el.style.boxShadow = rest || ""; el.style.filter = ""; };
                }
                function _foldSection(titleText, body, openDisp) {
                    var head = document.createElement("div");
                    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;cursor:pointer;color:var(--anima-ink);font-weight:bold;font-size:13px;userSelect:none;padding:9px 12px;border-radius:8px;background:var(--anima-well);border:1px solid rgba(var(--anima-accent-soft-rgb),0.38);margin-bottom:6px;";
                    head.innerHTML = '<span>' + titleText + '</span><span style="font-size:10px;color:var(--anima-ink);background:var(--anima-title);padding:2px 8px;border-radius:10px;">' + animaTxt("▼ 展开") + '</span>';
                    body.style.display = "none";
                    box.appendChild(head);
                    box.appendChild(body);
                    _hov(head, "rgba(var(--anima-accent-rgb),0.3)");
                    head.onclick = function(){
                        var folded = body.style.display === "none";
                        body.style.display = folded ? (openDisp || "flex") : "none";
                        head.querySelector("span:last-child").textContent = folded ? animaTxt("▲ 收起") : animaTxt("▼ 展开");
                    };
                }

                function _animaLsSkipKey(k) {
                    if (!k) return true;
                    var lk = String(k).toLowerCase();
                    if (lk.indexOf("comfy.") === 0 || lk.indexOf("comfyui.") === 0 || lk.indexOf("litegraph") === 0) return true;
                    if (lk.indexOf("workflow.") === 0 || lk.indexOf("workflow.draft") >= 0) return true;
                    if (k === "db_pt_custom_sound" || k.indexOf("db_pt_custom_sound") === 0) return true;
                    if (k === "db_trans_api_key" || k === "db_trans_key") return true;
                    if (k.indexOf("db_trans_key") === 0) return true;
                    if (k.indexOf("db_pt_content_") === 0 || k.indexOf("db_av_content_") === 0) return true;
                    if (k.indexOf("db_pt_pause_") === 0 || k.indexOf("db_av_pause_") === 0) return true;
                    if (k.indexOf("db_pt_hidden_") === 0 || k.indexOf("db_av_hidden_") === 0) return true;
                    return false;
                }
                function _animaLsWantKey(k) {
                    if (_animaLsSkipKey(k)) return false;
                    if (k === "danbooru_artist_combos" || k === "db_free_mode" || k === "db_ds_model") return true;
                    if (k === "anima_soft_blur" || k === "anima_cheap_fx" || k === "anima_theme" || k === "anima_theme_custom" || k === "anima_opv_skin" || k === "anima_opv_rate_fade" || k === "anima_opv_heart_rate") return true;
                    if (k === "db_pt_hidden" || k === "db_av_hidden" || k === "db_pt_chip_mode" || k === "db_av_chip_mode") return true;
                    if (k === "tp_hide_pinned" || k === "tp_pin_collapsed" || k === "tp_pin_rows" || k === "tp_pin_h" || k === "tp_pin_order") return true;
                    if (k === "db_sort" || k === "db_exclude_img_tags" || k === "db_preset_eye" || k === "db_preset_size2") return true;
                    if (k === "db_fav_tag_size" || k === "db_fav_tag_pos" || k === "db_fav_size" || k === "db_fav_zoom" || k === "db_fav_side_zoom") return true;
                    if (k === "db_pt_sound" || k === "db_pt_sound_type") return true;
                    if (k.indexOf("nb_") === 0 || k.indexOf("apc_") === 0 || k.indexOf("anima_popup_") === 0) return true;
                    if (k.indexOf("db_trans_") === 0 || k.indexOf("gel_") === 0 || k.indexOf("adex_fav_") === 0) return true;
                    return false;
                }
                function _animaLsSanitize(obj) {
                    var out = {};
                    if (!obj) return out;
                    for (var k in obj) {
                        if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
                        if (!_animaLsWantKey(k)) continue;
                        out[k] = obj[k];
                    }
                    return out;
                }
                function _animaLsMergeVal(local, backup) {
                    if (local == null || local === "") return backup;
                    try {
                        var L = JSON.parse(local);
                        var B = JSON.parse(backup);
                        if (Array.isArray(L) && Array.isArray(B)) {
                            var seen = {};
                            var arr = [];
                            function add(x) {
                                var key;
                                try { key = typeof x === "object" ? JSON.stringify(x) : String(x); } catch (e2) { key = String(x); }
                                if (seen[key]) return;
                                seen[key] = 1;
                                arr.push(x);
                            }
                            for (var i = 0; i < L.length; i++) add(L[i]);
                            for (var j = 0; j < B.length; j++) add(B[j]);
                            return JSON.stringify(arr);
                        }
                        if (L && B && typeof L === "object" && typeof B === "object" && !Array.isArray(L) && !Array.isArray(B)) {
                            var o = {};
                            for (var lk in L) o[lk] = L[lk];
                            for (var bk in B) o[bk] = B[bk];
                            return JSON.stringify(o);
                        }
                    } catch (e) {}
                    return backup;
                }
                function _animaLsApply(data, mode) {
                    data = _animaLsSanitize(data);
                    for (var k in data) {
                        if (!Object.prototype.hasOwnProperty.call(data, k)) continue;
                        try {
                            var v = data[k];
                            if (v == null) continue;
                            if (typeof v !== "string") v = String(v);
                            if (mode === "merge") {
                                var cur = localStorage.getItem(k);
                                if (cur != null) v = _animaLsMergeVal(cur, v);
                            }
                            localStorage.setItem(k, v);
                        } catch (e) {}
                    }
                }

                var bkBtn = document.createElement("button");
                bkBtn.textContent = animaTxt("📦 一键备份所有数据");
                bkBtn.style.cssText = "width:100%;padding:12px;border-radius:8px;border:1px solid rgba(var(--anima-line-bright-rgb),0.45);cursor:pointer;font-size:14px;background:linear-gradient(180deg,var(--anima-accent-mid),var(--anima-accent-hi));color:var(--anima-on-accent);font-weight:bold;box-shadow:0 2px 10px rgba(var(--anima-accent-hi-rgb),0.35);";
                _hov(bkBtn, "rgba(var(--anima-accent-hi-rgb),0.55)", "0 2px 10px rgba(var(--anima-accent-hi-rgb),0.35)");
                bkBtn.onclick = async function(){
                    bkBtn.textContent = animaTxt("⏳ 打包中..."); bkBtn.disabled = true;
                    try {
                        // 收集浏览器 localStorage 数据（画师组合 + NewBie/创作器全部 nb_*/apc_* 用户数据）
                        var lsData = {};
                        for (var _li = 0; _li < localStorage.length; _li++) {
                            var _lk = localStorage.key(_li);
                            if (!_lk) continue;
                            if (_animaLsWantKey(_lk)) {
                                var _lv = localStorage.getItem(_lk);
                                if (_lv) lsData[_lk] = _lv;
                            }
                        }
                        var r = await fetch("/danbooru_anima/backup", {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            body: JSON.stringify({localStorage: lsData})
                        });
                        if (!r.ok) {
                            var errText = await r.text();
                            throw new Error(errText.slice(0, 180) || ("HTTP " + r.status));
                        }
                        var blob = await r.blob();
                        var head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
                        if (blob.size < 22 || head[0] !== 0x50 || head[1] !== 0x4b) {
                            throw new Error("服务器返回的不是压缩包（" + blob.size + " 字节）");
                        }
                        var a = document.createElement("a");
                        var url = URL.createObjectURL(blob);
                        a.href = url;
                        a.download = "anima_backup_" + new Date().toISOString().slice(0,10) + ".zip";
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(function() {
                            URL.revokeObjectURL(url);
                            if (a.parentNode) a.parentNode.removeChild(a);
                        }, 60000);
                    } catch(e) { alert("备份失败: "+e.message); }
                    bkBtn.textContent = animaTxt("📦 一键备份所有数据"); bkBtn.disabled = false;
                };
                box.appendChild(bkBtn);

                var reBtn = document.createElement("button");
                reBtn.textContent = animaTxt("📥 一键导入所有数据");
                reBtn.style.cssText = "width:100%;padding:12px;border-radius:8px;border:1px solid rgba(255,160,160,0.5);cursor:pointer;font-size:14px;background:linear-gradient(180deg,#8a2a36,#5a1820);color:#ffd6d6;font-weight:bold;box-shadow:0 2px 10px rgba(120,30,40,0.4);";
                var reFile = document.createElement("input");
                reFile.type = "file"; reFile.accept = ".zip"; reFile.style.display = "none";
                _hov(reBtn, "rgba(248,113,113,0.5)", "0 2px 10px rgba(120,30,40,0.4)");
                function _animaShowImportMode(file) {
                    var old = box.querySelector("[data-role='anima-import-mode']");
                    if (old && old.parentNode) old.parentNode.removeChild(old);
                    var cover = document.createElement("div");
                    cover.dataset.role = "anima-import-mode";
                    cover.style.cssText = "position:absolute;inset:0;background:rgba(0,0,0,0.55);z-index:20;display:flex;align-items:center;justify-content:center;padding:16px;border-radius:16px;";
                    var card = document.createElement("div");
                    card.style.cssText = "width:100%;background:var(--anima-well);border:1px solid rgba(var(--anima-accent-soft-rgb),0.45);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px;box-shadow:0 12px 32px rgba(0,0,0,0.55);";
                    var hd = document.createElement("div");
                    hd.textContent = animaTxt("选择导入方式");
                    hd.style.cssText = "color:var(--anima-ink);font-weight:bold;font-size:14px;";
                    var hint = document.createElement("div");
                    hint.style.cssText = "color:var(--anima-mute);font-size:12px;line-height:1.55;";
                    var p1 = document.createElement("div");
                    p1.textContent = animaTxt("合并：两边都留，同名条目以备份为准。");
                    var p2 = document.createElement("div");
                    p2.textContent = animaTxt("覆盖：备份里有的按备份写入，本机多出来的不删。");
                    hint.appendChild(p1);
                    hint.appendChild(p2);
                    var row = document.createElement("div");
                    row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";
                    function mk(txt, css, glow, rest, mode) {
                        var b = document.createElement("button");
                        b.type = "button";
                        b.textContent = txt;
                        b.style.cssText = css;
                        _hov(b, glow, rest);
                        b.onclick = function(ev) {
                            ev.stopPropagation();
                            if (cover.parentNode) cover.parentNode.removeChild(cover);
                            _animaDoRestore(file, mode);
                        };
                        return b;
                    }
                    row.appendChild(mk("合并导入", "flex:1;padding:10px;border-radius:8px;border:1px solid rgba(var(--anima-line-bright-rgb),0.45);cursor:pointer;font-size:13px;background:linear-gradient(180deg,var(--anima-accent-mid),var(--anima-accent-hi));color:var(--anima-on-accent);font-weight:bold;", "rgba(var(--anima-accent-hi-rgb),0.55)", "0 2px 10px rgba(var(--anima-accent-hi-rgb),0.35)", "merge"));
                    row.appendChild(mk("覆盖导入", "flex:1;padding:10px;border-radius:8px;border:1px solid rgba(255,160,160,0.5);cursor:pointer;font-size:13px;background:linear-gradient(180deg,#8a2a36,#5a1820);color:#ffd6d6;font-weight:bold;", "rgba(248,113,113,0.5)", "0 2px 10px rgba(120,30,40,0.4)", "overwrite"));
                    var cancel = document.createElement("button");
                    cancel.type = "button";
                    cancel.textContent = animaTxt("取消");
                    cancel.style.cssText = "width:100%;padding:8px;border-radius:8px;border:1px solid rgba(var(--anima-accent-soft-rgb),0.4);cursor:pointer;font-size:12px;background:var(--anima-title);color:var(--anima-ink);font-weight:bold;";
                    _hov(cancel, "rgba(var(--anima-accent-soft-rgb),0.35)", "0 1px 0 rgba(255,255,255,0.08)");
                    cancel.onclick = function(ev) {
                        ev.stopPropagation();
                        if (cover.parentNode) cover.parentNode.removeChild(cover);
                        reFile.value = "";
                    };
                    card.appendChild(hd);
                    card.appendChild(hint);
                    card.appendChild(row);
                    card.appendChild(cancel);
                    cover.appendChild(card);
                    cover.onclick = function(e){ e.stopPropagation(); };
                    box.appendChild(cover);
                }
                async function _animaDoRestore(file, mode) {
                    reBtn.textContent = animaTxt("⏳ 恢复中...");
                    reBtn.disabled = true;
                    try {
                        var rr = await fetch("/danbooru_anima/restore?mode=" + encodeURIComponent(mode) + "&size=" + encodeURIComponent(String(file.size || 0)), {
                            method: "POST",
                            headers: {"Content-Type": "application/zip"},
                            body: file
                        });
                        var raw = await rr.text();
                        var rd;
                        try { rd = JSON.parse(raw); }
                        catch (e2) {
                            throw new Error(rr.status === 413 ? "备份太大，被上传限制拦住了。请给 ComfyUI 加上启动参数 --max-upload-size 1024 后重启再导入。" : ("服务器没有返回导入结果（HTTP " + rr.status + "）"));
                        }
                        if (rd.success) {
                            if (rd.localStorage) _animaLsApply(rd.localStorage, mode);
                            if (typeof window.applyAnimaPopupAppearance === "function") window.applyAnimaPopupAppearance();
                            if (typeof window.applyAnimaTheme === "function") window.applyAnimaTheme(localStorage.getItem("anima_theme") || "cobalt");
                            reBtn.textContent = animaTxt("✅ 恢复成功！请刷新页面");
                            reBtn.style.color = "#4caf50";
                            setTimeout(function(){ ov.remove(); }, 2000);
                        } else {
                            alert("恢复失败: " + (rd.error || "未知错误"));
                            reBtn.textContent = animaTxt("📥 一键导入所有数据");
                            reBtn.disabled = false;
                        }
                    } catch(e) {
                        alert("恢复失败: " + e.message);
                        reBtn.textContent = animaTxt("📥 一键导入所有数据");
                        reBtn.disabled = false;
                    }
                    reFile.value = "";
                }
                reBtn.onclick = function(){ reFile.click(); };
                reFile.onchange = async function(){
                    if (!reFile.files || !reFile.files[0]) return;
                    var file = reFile.files[0];
                    var head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
                    if (file.size < 22 || head[0] !== 0x50 || head[1] !== 0x4b) {
                        alert("这个文件不是备份压缩包。请选择一键备份下载的 anima_backup_日期.zip，不要选解压出来的 json 或图片。");
                        reFile.value = "";
                        return;
                    }
                    _animaShowImportMode(file);
                };
                box.appendChild(reBtn);
                var reHint = document.createElement("div");
                reHint.textContent = animaTxt("导入时可选合并或覆盖。自定义音效、翻译密钥、以及节点里填写的提示词内容不会打进备份。");
                reHint.style.cssText = "color:var(--anima-mute);font-size:11px;line-height:1.45;margin-top:-8px;";
                box.appendChild(reHint);
                box.appendChild(reFile);


                var themeWrap = document.createElement("div");
                themeWrap.style.cssText = "padding:12px;border-radius:10px;background:var(--anima-well);border:1px solid rgba(var(--anima-accent-soft-rgb),0.38);display:flex;flex-direction:column;gap:10px;";
                var themeRail = document.createElement("div");
                themeRail.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";
                function _mkThemeCard(id, label, previewCss) {
                    var card = document.createElement("button");
                    card.type = "button";
                    card.dataset.themeId = id;
                    card.style.cssText = "flex:1 1 calc(50% - 8px);min-width:110px;padding:10px;border-radius:10px;cursor:pointer;text-align:left;border:1px solid rgba(var(--anima-accent-soft-rgb),.35);background:var(--anima-bg-deep);";
                    var sw = document.createElement("div");
                    sw.style.cssText = "height:36px;border-radius:8px;margin-bottom:8px;" + previewCss;
                    card._sw = sw;
                    var lb = document.createElement("div");
                    lb.textContent = label;
                    lb.style.cssText = "color:var(--anima-ink);font-size:12px;font-weight:700;";
                    card.appendChild(sw);
                    card.appendChild(lb);
                    card.onclick = function() {
                        if (typeof window.applyAnimaTheme === "function") window.applyAnimaTheme(id);
                        _syncThemeCards();
                    };
                    return card;
                }
                themeRail.appendChild(_mkThemeCard("cobalt", "钴蓝", "background:linear-gradient(135deg,#102044 0%,#08122c 70%);box-shadow:inset 0 0 0 1px #8cb8ff88;"));
                themeRail.appendChild(_mkThemeCard("sage", "薄荷", "background:linear-gradient(135deg,#1a2a24 0%,#0e1714 70%);box-shadow:inset 0 0 0 1px #b7d4c688;"));
                themeRail.appendChild(_mkThemeCard("ink", "黑色", "background:linear-gradient(135deg,#1a1c20 0%,#0c0d0f 70%);box-shadow:inset 0 0 0 1px #c5cad388;"));
                var customCard = _mkThemeCard("custom", "自定义", "background:linear-gradient(135deg,var(--anima-well) 0%,var(--anima-bg-deep) 70%);box-shadow:inset 0 0 0 1px rgba(var(--anima-accent-soft-rgb),.55);");
                themeRail.appendChild(customCard);
                var customPanel = document.createElement("div");
                customPanel.style.cssText = "display:none;flex-wrap:wrap;gap:8px;";
                var _pickers = {};
                var _fields = [["bg","底色"],["well","区块"],["title","标题"],["line","边框"],["accent","强调"],["ink","文字"]];
                function _paintCustomSw() {
                    var c = typeof window.getAnimaCustomColors === "function" ? window.getAnimaCustomColors() : null;
                    if (!c || !customCard._sw) return;
                    customCard._sw.style.background = "linear-gradient(135deg," + c.well + " 0%," + c.bg + " 70%)";
                    customCard._sw.style.boxShadow = "inset 0 0 0 1px " + c.accent + "88";
                }
                function _fillPickers() {
                    var c = typeof window.getAnimaCustomColors === "function" ? window.getAnimaCustomColors() : null;
                    if (!c) return;
                    for (var i = 0; i < _fields.length; i++) {
                        var k = _fields[i][0];
                        if (!_pickers[k]) continue;
                        _pickers[k].color.value = c[k];
                        _pickers[k].hex.value = c[k];
                    }
                    _paintCustomSw();
                }
                for (var _fi = 0; _fi < _fields.length; _fi++) {
                    (function(key, lab) {
                        var row = document.createElement("div");
                        row.style.cssText = "display:flex;align-items:center;gap:6px;flex:1 1 calc(50% - 8px);min-width:140px;";
                        var nm = document.createElement("span");
                        nm.textContent = lab;
                        nm.style.cssText = "color:var(--anima-ink);font-size:12px;width:32px;flex-shrink:0;";
                        var cin = document.createElement("input");
                        cin.type = "color";
                        cin.style.cssText = "width:36px;height:28px;padding:0;border:0;background:transparent;cursor:pointer;";
                        var hin = document.createElement("input");
                        hin.type = "text";
                        hin.maxLength = 7;
                        hin.style.cssText = "width:76px;font-size:11px;background:var(--anima-bg-deep);color:var(--anima-ink);border:1px solid var(--anima-line);border-radius:4px;padding:4px 6px;";
                        cin.oninput = function() {
                            var o = {}; o[key] = cin.value;
                            if (typeof window.setAnimaCustomColors === "function") window.setAnimaCustomColors(o);
                            hin.value = cin.value;
                            _paintCustomSw();
                        };
                        hin.onchange = function() {
                            var v = (hin.value || "").trim();
                            if (v.charAt(0) !== "#") v = "#" + v;
                            var ok = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(v);
                            if (!ok) { hin.value = cin.value; return; }
                            if (v.length === 4) v = "#" + v.charAt(1)+v.charAt(1)+v.charAt(2)+v.charAt(2)+v.charAt(3)+v.charAt(3);
                            cin.value = v; hin.value = v;
                            var o = {}; o[key] = v;
                            if (typeof window.setAnimaCustomColors === "function") window.setAnimaCustomColors(o);
                            _paintCustomSw();
                        };
                        row.appendChild(nm);
                        row.appendChild(cin);
                        row.appendChild(hin);
                        customPanel.appendChild(row);
                        _pickers[key] = { color: cin, hex: hin };
                    })(_fields[_fi][0], _fields[_fi][1]);
                }
                function _syncThemeCards() {
                    var cur = (window.ANIMA_THEME && window.ANIMA_THEME.id) || "cobalt";
                    var cards = themeRail.querySelectorAll("[data-theme-id]");
                    for (var i = 0; i < cards.length; i++) {
                        var on = cards[i].dataset.themeId === cur;
                        cards[i].style.border = on ? "2px solid var(--anima-accent-soft)" : "1px solid rgba(var(--anima-accent-soft-rgb),.35)";
                    }
                    customPanel.style.display = cur === "custom" ? "flex" : "none";
                    if (cur === "custom") _fillPickers();
                    else _paintCustomSw();
                }
                _syncThemeCards();
                themeWrap.appendChild(themeRail);
                themeWrap.appendChild(customPanel);
                _foldSection(animaTxt("🎨 颜色主题"), themeWrap, "flex");

                var appearWrap = document.createElement("div");
                appearWrap.style.cssText = "padding:12px;border-radius:10px;background:var(--anima-well);border:1px solid rgba(var(--anima-accent-soft-rgb),0.38);display:flex;flex-direction:column;gap:10px;";
                var appearHint = document.createElement("div");
                appearHint.style.cssText = "color:var(--anima-mute);font-size:11px;line-height:1.45;";
                appearWrap.appendChild(appearHint);
                var bgRail = document.createElement("div");
                bgRail.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;";
                appearWrap.appendChild(bgRail);
                function _bgKey() {
                    try { return localStorage.getItem("anima_popup_bg") || "none"; } catch (e) { return "none"; }
                }
                function _mkSlider(label, min, max, step, value, unit, onInput) {
                    var wrap = document.createElement("div");
                    var top = document.createElement("div");
                    top.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;";
                    var lab = document.createElement("span");
                    lab.textContent = label;
                    lab.style.cssText = "color:var(--anima-mute);font-size:12px;";
                    var valEl = document.createElement("span");
                    valEl.textContent = value + unit;
                    valEl.style.cssText = "color:var(--anima-accent-soft);font-size:12px;font-variant-numeric:tabular-nums;";
                    top.appendChild(lab); top.appendChild(valEl);
                    var inp = document.createElement("input");
                    inp.type = "range"; inp.min = String(min); inp.max = String(max); inp.step = String(step); inp.value = String(value);
                    inp.oninput = function() {
                        var n = parseFloat(inp.value);
                        valEl.textContent = n + unit;
                        onInput(n);
                    };
                    wrap.appendChild(top); wrap.appendChild(inp);
                    wrap._setEnabled = function(on) {
                        inp.disabled = !on;
                        wrap.style.opacity = on ? "1" : "0.42";
                    };
                    return wrap;
                }
                var _op0 = 50, _bl0 = 3;
                try {
                    var _opN = parseFloat(localStorage.getItem("anima_popup_opacity"));
                    var _blN = parseFloat(localStorage.getItem("anima_popup_blur"));
                    if (isFinite(_opN)) _op0 = Math.max(0, Math.min(100, _opN));
                    if (isFinite(_blN)) _bl0 = Math.max(0, Math.min(20, _blN));
                } catch (e) {}
                var opSlide = _mkSlider("弹窗不透明度", 0, 100, 1, _op0, "%", function(n) {
                    if (typeof window.applyAnimaPopupAppearance === "function") window.applyAnimaPopupAppearance(n, null);
                });
                var blSlide = _mkSlider("模糊度", 0, 20, 1, _bl0, "px", function(n) {
                    if (typeof window.applyAnimaPopupAppearance === "function") window.applyAnimaPopupAppearance(null, n);
                });
                appearWrap.appendChild(opSlide);
                appearWrap.appendChild(blSlide);
                var fxRow = document.createElement("div");
                fxRow.style.cssText = "display:flex;flex-direction:column;gap:6px;padding:10px 0 2px;border-top:1px solid rgba(var(--anima-accent-soft-rgb),0.18);margin-top:4px;";
                var fxLine = document.createElement("label");
                fxLine.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer;color:var(--anima-ink);font-size:12px;";
                var fxCb = document.createElement("input");
                fxCb.type = "checkbox";
                fxCb.checked = typeof window.animaSoftBlurEnabled === "function" ? window.animaSoftBlurEnabled() : false;
                var fxLab = document.createElement("span");
                fxLab.textContent = animaTxt("无硬件加速时仍使用模糊特效");
                fxLine.appendChild(fxCb);
                fxLine.appendChild(fxLab);
                var fxHint = document.createElement("div");
                fxHint.style.cssText = "color:var(--anima-mute);font-size:11px;line-height:1.45;padding-left:24px;";
                function _fxStatus() {
                    var soft = typeof window.animaDetectSoftGpu === "function" ? window.animaDetectSoftGpu() : false;
                    var on = fxCb.checked;
                    if (soft) {
                        fxHint.textContent = on
                            ? "当前未检测到浏览器硬件加速。已开启模糊特效，若感到卡顿请关闭此项，或到浏览器设置里打开硬件加速。"
                            : "当前未检测到浏览器硬件加速。未勾选时会减弱毛玻璃等特效以减轻卡顿；勾选后可恢复完整特效。";
                    } else {
                        fxHint.textContent = animaTxt("当前已检测到硬件加速，模糊特效正常开启。此项仅在没有硬件加速时生效。");
                    }
                }
                _fxStatus();
                fxCb.onchange = function() {
                    if (fxCb.checked) {
                        var ok = confirm("如果没有开启浏览器硬件加速，可能会遇到卡顿的情况，所以开启该选项时，建议开启浏览器硬件加速。\n\n确定仍要开启模糊特效吗？");
                        if (!ok) { fxCb.checked = false; return; }
                    }
                    if (typeof window.animaSetSoftBlur === "function") window.animaSetSoftBlur(fxCb.checked);
                    _fxStatus();
                };
                fxRow.appendChild(fxLine);
                fxRow.appendChild(fxHint);
                appearWrap.appendChild(fxRow);
                function _syncBgChrome() {
                    var has = _bgKey() !== "none";
                    appearHint.textContent = has
                        ? "不透明度越低越能看见背景图；模糊只糊背景图，不会把字糊掉。"
                        : "无背景也可调：不透明度越低越能看见后面的工作区；模糊是毛玻璃，透过弹窗虚化后面的画面，不会把字糊掉。";
                    opSlide._setEnabled(true);
                    blSlide._setEnabled(true);
                }
                function _applyBg(key) {
                    if (typeof window.applyAnimaPopupAppearance === "function") window.applyAnimaPopupAppearance(null, null, key);
                    _syncBgChrome();
                    _paintBgCards();
                }
                function _mkBgCard(key, label, fillTile, onPick) {
                    var on = _bgKey() === key;
                    var card = document.createElement("div");
                    card.style.cssText = "width:76px;cursor:pointer;display:flex;flex-direction:column;gap:4px;align-items:center;";
                    var tile = document.createElement("div");
                    tile.style.cssText = "width:76px;height:56px;border-radius:8px;overflow:hidden;position:relative;background:var(--anima-bg-deep);border:2px solid " + (on ? "var(--anima-accent-soft)" : "rgba(var(--anima-accent-soft-rgb),0.28)") + ";box-shadow:" + (on ? "0 0 0 2px rgba(var(--anima-accent-range-rgb),.35)" : "none") + ";";
                    fillTile(tile);
                    var cap = document.createElement("div");
                    cap.textContent = label;
                    cap.style.cssText = "color:" + (on ? "var(--anima-ink)" : "var(--anima-mute)") + ";font-size:10px;text-align:center;max-width:76px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
                    card.appendChild(tile);
                    card.appendChild(cap);
                    card.onclick = onPick || function(){ _applyBg(key); };
                    return card;
                }
                var _bgPaintGen = 0;
                function _paintBgCards() {
                    var gen = ++_bgPaintGen;
                    while (bgRail.firstChild) bgRail.removeChild(bgRail.firstChild);
                    bgRail.appendChild(_mkBgCard("none", "无背景", function(tile) {
                        tile.style.background = "repeating-linear-gradient(135deg,var(--anima-title) 0 9px,var(--anima-bg) 9px 18px)";
                        var mark = document.createElement("div");
                        mark.textContent = animaTxt("无");
                        mark.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--anima-ink);font-size:13px;font-weight:bold;";
                        tile.appendChild(mark);
                    }));
                    bgRail.appendChild(_mkBgCard("builtin", "内置立绘", function(tile) {
                        var im = document.createElement("img");
                        im.alt = "";
                        im.draggable = false;
                        im.src = window.ANIMA_BUILTIN_BG || window.animaAsset("heroine.png");
                        im.onerror = function() {
                            if (this.dataset.fb) return;
                            this.dataset.fb = "1";
                            this.src = window.animaAsset("heroine.png");
                        };
                        im.style.cssText = "width:100%;height:100%;object-fit:cover;object-position:50% 18%;display:block;";
                        tile.appendChild(im);
                    }));
                    fetch("/danbooru_anima/popup_bgs").then(function(r){ return r.json(); }).then(function(d) {
                        if (gen !== _bgPaintGen) return;
                        var list = (d && d.custom) ? d.custom : [];
                        for (var i = 0; i < list.length; i++) {
                            (function(it) {
                                var key = "custom:" + it.id;
                                var cardEl = _mkBgCard(key, "自定义", function(tile) {
                                    var im = document.createElement("img");
                                    im.alt = "";
                                    im.draggable = false;
                                    im.src = it.url;
                                    im.style.cssText = "width:100%;height:100%;object-fit:cover;object-position:50% 20%;display:block;";
                                    tile.appendChild(im);
                                    var xbtn = document.createElement("div");
                                    xbtn.textContent = "×";
                                    xbtn.title = "删除这张背景";
                                    xbtn.style.cssText = "position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,.7);color:#fff;font-size:12px;line-height:16px;text-align:center;cursor:pointer;";
                                    xbtn.onclick = function(ev) {
                                        ev.stopPropagation();
                                        fetch("/danbooru_anima/popup_bgs/delete", {
                                            method: "POST",
                                            headers: {"Content-Type": "application/json"},
                                            body: JSON.stringify({name: it.id})
                                        }).then(function(rr){ return rr.json(); }).then(function(rd) {
                                            if (!rd || !rd.success) {
                                                alert((rd && rd.error) || "删除失败，若刚更新请先重启 ComfyUI");
                                                return;
                                            }
                                            if (_bgKey() === key) _applyBg("none");
                                            else _paintBgCards();
                                        }).catch(function(){ alert("删除失败，请先重启 ComfyUI"); });
                                    };
                                    tile.appendChild(xbtn);
                                });
                                if (addCard && addCard.parentNode === bgRail) bgRail.insertBefore(cardEl, addCard);
                                else bgRail.appendChild(cardEl);
                            })(list[i]);
                        }
                    }).catch(function(){});
                    var addCard = _mkBgCard("__add__", "添加", function(tile) {
                        tile.style.background = "var(--anima-bg)";
                        tile.style.border = "2px dashed rgba(var(--anima-accent-soft-rgb),0.55)";
                        var plus = document.createElement("div");
                        plus.textContent = "+";
                        plus.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--anima-accent-soft);font-size:26px;font-weight:bold;";
                        tile.appendChild(plus);
                    }, function(){ bgFile.click(); });
                    bgRail.appendChild(addCard);
                }
                var bgFile = document.createElement("input");
                bgFile.type = "file";
                bgFile.accept = "image/png,image/jpeg,image/webp,image/gif";
                bgFile.style.display = "none";
                bgFile.onchange = function() {
                    if (!bgFile.files || !bgFile.files[0]) return;
                    var fd = new FormData();
                    fd.append("file", bgFile.files[0]);
                    fetch("/danbooru_anima/popup_bgs/upload", {method: "POST", body: fd}).then(function(r){ return r.json(); }).then(function(d) {
                        if (!d || !d.success) {
                            alert((d && d.error) || "上传失败，若刚更新请先重启 ComfyUI");
                            return;
                        }
                        _applyBg("custom:" + d.id);
                    }).catch(function(){ alert("上传失败，请先重启 ComfyUI"); });
                    bgFile.value = "";
                };
                appearWrap.appendChild(bgFile);
                _syncBgChrome();
                _paintBgCards();
                _foldSection(animaTxt("🎨 弹窗外观（所有弹窗实时生效）"), appearWrap, "flex");


                // ── 分隔线 ──
                var sep = document.createElement("hr");
                sep.style.cssText = "border:none;border-top:1px solid var(--anima-line);margin:4px 0;";
                box.appendChild(sep);

                // ── 全局翻译设置（可折叠，默认收起）──
                var transTitle = document.createElement("div");
                transTitle.style.cssText = "display:flex;align-items:center;justify-content:space-between;cursor:pointer;color:var(--anima-ink);font-weight:bold;font-size:13px;userSelect:none;padding:9px 12px;border-radius:8px;background:var(--anima-well);border:1px solid rgba(var(--anima-accent-soft-rgb),0.38);margin-bottom:6px;";
                transTitle.innerHTML = '<span>' + animaTxt("🌐 翻译设置（全局生效）") + '</span><span style="font-size:10px;color:var(--anima-ink);background:var(--anima-title);padding:2px 8px;border-radius:10px;">' + animaTxt("▼ 展开") + '</span>';
                box.appendChild(transTitle);
                var transBody = document.createElement("div");
                transBody.style.display = "none";  // 默认折叠
                box.appendChild(transBody);
                _hov(transTitle, "rgba(var(--anima-accent-rgb),0.3)");
                transTitle.onclick = function(){
                    var folded = transBody.style.display === "none";
                    transBody.style.display = folded ? "block" : "none";
                    transTitle.querySelector("span:last-child").textContent = folded ? animaTxt("▲ 收起") : animaTxt("▼ 展开");
                };

                var rowStyle = 'display:flex;align-items:center;gap:8px;margin-bottom:10px;';
                var lblStyle = 'color:var(--anima-mute);font-size:12px;white-space:nowrap;';
                var selStyle = 'flex:1;padding:4px 6px;border:1px solid var(--anima-line);border-radius:4px;background:var(--anima-bg);color:var(--anima-mute);font-size:12px;cursor:pointer;outline:none;';

                // 提供商
                var tpDiv = document.createElement('div'); tpDiv.style.cssText = rowStyle;
                tpDiv.innerHTML = '<span style="'+lblStyle+'">提供商</span>';
                var tpSel = document.createElement('select'); tpSel.style.cssText = selStyle;
                var tProviders = [{v:'free',t:'免费接口'},{v:'deepseek',t:'DeepSeek'},{v:'custom',t:'自定义 API'}];
                for(var pi=0;pi<tProviders.length;pi++){var po=document.createElement('option');po.value=tProviders[pi].v;po.textContent=tProviders[pi].t;if(tProviders[pi].v===_tp)po.selected=true;tpSel.appendChild(po);}
                tpSel.onchange = function(){_tp=tpSel.value;localStorage.setItem("db_trans_provider",_tp);_loadTKey();_refreshTransUI();};
                tpDiv.appendChild(tpSel); transBody.appendChild(tpDiv);

                // 免费子选
                var freeDiv = document.createElement('div'); freeDiv.style.cssText = rowStyle;
                freeDiv.innerHTML = '<span style="'+lblStyle+'">接口</span>';
                var freeSel = document.createElement('select'); freeSel.style.cssText = selStyle;
                freeSel.innerHTML = '<option value="baidu">百度翻译（推荐 · 手机号即开）</option><option value="google">Google 翻译（无需 Key）</option>';
                freeSel.value = _tfm;
                freeSel.onchange = function(){_tfm=freeSel.value;localStorage.setItem("db_free_mode",_tfm);localStorage.setItem("db_trans_free_mode",_tfm);_loadTKey();_refreshTransUI();};
                freeDiv.appendChild(freeSel); transBody.appendChild(freeDiv);
                // 百度翻译模式（大模型/通用）
                var bmDiv = document.createElement('div'); bmDiv.style.cssText = rowStyle;
                bmDiv.innerHTML = '<span style="'+lblStyle+'">模式</span>';
                var bmSel = document.createElement('select'); bmSel.style.cssText = selStyle;
                bmSel.innerHTML = '<option value="nmt">通用文本翻译</option><option value="llm">大模型翻译（更精准）</option>';
                bmSel.value = localStorage.getItem("db_trans_baidu_mode") === "llm" ? "llm" : "nmt";
                bmSel.onchange = function(){localStorage.setItem("db_trans_baidu_mode", bmSel.value);_loadTKey();_refreshTransUI();};
                bmDiv.appendChild(bmSel); transBody.appendChild(bmDiv);

                // DeepSeek 模型子选
                var dsDiv = document.createElement('div'); dsDiv.style.cssText = rowStyle;
                dsDiv.innerHTML = '<span style="'+lblStyle+'">模型</span>';
                var dsSel = _createModelPicker();
                var _dsShown = window.animaDsModelId ? window.animaDsModelId(_dsm) : (_dsm || "deepseek-flash");
                _setModelCatalog(dsSel, [{ id: _dsShown, label: _dsShown }], _dsShown);
                dsSel._onChange = function(){ if (!dsSel.value) return; _dsm=dsSel.value; localStorage.setItem("db_ds_model",_dsm); localStorage.setItem("db_trans_ds_model",_dsm); };
                dsDiv.appendChild(dsSel);
                var dsFetch = document.createElement('span');
                dsFetch.textContent = '获取模型';
                dsFetch.style.cssText = 'padding:4px 8px;border-radius:4px;background:var(--anima-line);color:var(--anima-accent-soft);cursor:pointer;font-size:12px;white-space:nowrap;';
                dsFetch.onclick = function(){ _pullModels('https://api.deepseek.com/v1', dsSel, function(id){ _dsm = id; localStorage.setItem('db_ds_model', id); localStorage.setItem('db_trans_ds_model', id); }); };
                dsDiv.appendChild(dsFetch);
                transBody.appendChild(dsDiv);
                var dsUrl = document.createElement('div');
                dsUrl.textContent = '接口：https://api.deepseek.com/v1（官方地址，点获取模型看当前上架的模型）';
                dsUrl.style.cssText = 'margin:-4px 0 8px;color:var(--anima-mute);font-size:11px;line-height:1.4;';
                transBody.appendChild(dsUrl);

                // API Key
                var akDiv = document.createElement('div'); akDiv.style.cssText = rowStyle;
                akDiv.innerHTML = '<span style="'+lblStyle+'">API Key</span>';
                _akInp = document.createElement('input');
                _akInp.type = 'password'; _akInp.placeholder = 'sk-...';
                _akInp.style.cssText = 'flex:1;padding:4px 6px;border:1px solid var(--anima-line);border-radius:4px;background:var(--anima-bg);color:#e0e0e0;font-size:12px;outline:none;';
                _akInp.addEventListener('input', function(){_saveTKey(_akInp.value.trim());});
                _akInp.onchange = function(){_saveTKey(_akInp.value.trim());};
                akDiv.appendChild(_akInp);
                var eyeBtn = document.createElement('span');
                eyeBtn.textContent = '👁'; eyeBtn.title = '显示/隐藏';
                eyeBtn.style.cssText = 'cursor:pointer;font-size:14px;user-select:none;';
                eyeBtn.onclick = function(){ _akInp.type = _akInp.type === 'password' ? 'text' : 'password'; eyeBtn.textContent = _akInp.type === 'password' ? '👁' : '🙈'; };
                akDiv.appendChild(eyeBtn);
                transBody.appendChild(akDiv);
                var appDiv = document.createElement('div'); appDiv.style.cssText = rowStyle;
                appDiv.innerHTML = '<span style="'+lblStyle+'">APP ID</span>';
                _appInp = document.createElement('input');
                _appInp.type = 'text'; _appInp.placeholder = '百度开发者 APP ID';
                _appInp.style.cssText = 'flex:1;padding:4px 6px;border:1px solid var(--anima-line);border-radius:4px;background:var(--anima-bg);color:#e0e0e0;font-size:12px;outline:none;';
                _appInp.addEventListener('input', function(){_saveBaiduAppid(_appInp.value);});
                _appInp.onchange = function(){_saveBaiduAppid(_appInp.value);};
                appDiv.appendChild(_appInp);
                transBody.appendChild(appDiv);

                // 百度提示
                var hintDiv = document.createElement('div');
                hintDiv.style.cssText = 'margin-bottom:8px;padding:6px 8px;border-radius:4px;background:var(--anima-line);color:var(--anima-accent-soft);font-size:11px;line-height:1.5;display:none;';
                transBody.appendChild(hintDiv);

                // Model 输入（自定义）
                var mdDiv = document.createElement('div'); mdDiv.style.cssText = rowStyle;
                mdDiv.innerHTML = '<span style="'+lblStyle+'">Model</span>';
                var mdInp = _createModelPicker();
                function _saveCustomModel(id) {
                    _tmodel = id || '';
                    localStorage.setItem("db_trans_model", _tmodel);
                    localStorage.setItem("db_trans_model_cu", _tmodel);
                }
                if (_tmodel) _setModelCatalog(mdInp, [{ id: _tmodel, label: _tmodel }], _tmodel);
                else _setModelCatalog(mdInp, [], "");
                mdInp._onChange = function(){ if (!mdInp.value) return; _saveCustomModel(mdInp.value); };
                mdDiv.appendChild(mdInp);
                var mdFetch = document.createElement('span');
                mdFetch.textContent = '获取模型';
                mdFetch.style.cssText = 'padding:4px 8px;border-radius:4px;background:var(--anima-line);color:var(--anima-accent-soft);cursor:pointer;font-size:12px;white-space:nowrap;';
                mdFetch.onclick = function(){ _pullModels((buInp.value || _turl || '').trim(), mdInp, _saveCustomModel); };
                mdDiv.appendChild(mdFetch);
                transBody.appendChild(mdDiv);

                // Base URL 输入（自定义）
                var buDiv = document.createElement('div'); buDiv.style.cssText = rowStyle;
                buDiv.innerHTML = '<span style="'+lblStyle+'">Base URL</span>';
                var buInp = document.createElement('input');
                buInp.type = 'text'; buInp.value = _turl; buInp.placeholder = 'https://api.xxx.com/v1';
                buInp.style.cssText = 'flex:1;padding:4px 6px;border:1px solid var(--anima-line);border-radius:4px;background:var(--anima-bg);color:#e0e0e0;font-size:12px;outline:none;';
                buInp.onchange = function(){_turl=buInp.value.trim();localStorage.setItem("db_trans_base_url",_turl);localStorage.setItem("db_trans_base_url_cu",_turl);};
                buDiv.appendChild(buInp); transBody.appendChild(buDiv);

                // 测试 + 清除缓存
                var tcDiv = document.createElement('div');
                tcDiv.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';
                var testTrBtn = document.createElement('span');
                testTrBtn.textContent = animaTxt("🧪 测试翻译"); testTrBtn.style.cssText = 'padding:4px 10px;border-radius:4px;background:var(--anima-line);color:var(--anima-accent-soft);cursor:pointer;font-size:12px;';
                testTrBtn.onclick = async function(){
                    testTrBtn.textContent = '⏳...'; testTrBtn.style.pointerEvents = 'none';
                    try{
                        _saveTKey((_akInp && _akInp.value || '').trim());
                        if (_appInp) _saveBaiduAppid(_appInp.value);
                        if (_tp === 'deepseek' && (dsSel._modelPicked || dsSel.value)) { _dsm = dsSel._modelPicked || dsSel.value; localStorage.setItem('db_ds_model', _dsm); localStorage.setItem('db_trans_ds_model', _dsm); }
                        if (_tp === 'custom') {
                            var _pickedCu = mdInp._modelPicked || mdInp.value;
                            if (_pickedCu) { _tmodel = _pickedCu; localStorage.setItem('db_trans_model', _tmodel); localStorage.setItem('db_trans_model_cu', _tmodel); }
                            _turl = (buInp.value || '').trim();
                            localStorage.setItem('db_trans_base_url', _turl);
                            localStorage.setItem('db_trans_base_url_cu', _turl);
                        }
                        var fields = window.animaTranslateFields();
                        var miss = window.animaTransConfigError(fields.cfg);
                        if (miss) { alert(miss); }
                        else {
                            var tr = await fetch('/danbooru_anima/cloud_translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tags:['1girl','red_hair'],provider:fields.provider,api_key:fields.api_key,model:fields.model,base_url:fields.base_url,baidu_appid:fields.baidu_appid})});
                            var td = await tr.json();
                            var txt = '';
                            if (td && td.translations) { for (var k in td.translations) if (td.translations[k]) txt += k + ' → ' + td.translations[k] + '\n'; }
                            if (td && td.success && txt) alert('测试成功:\n' + txt);
                            else alert('失败: ' + ((td && td.error) || '没有返回译文。请核对 Key、APP ID 或模型。'));
                        }
                    }catch(e){alert('请求失败: '+e.message);}
                    testTrBtn.textContent = animaTxt("🧪 测试翻译"); testTrBtn.style.pointerEvents = '';
                };
                tcDiv.appendChild(testTrBtn);
                var clrCacheBtn = document.createElement('span');
                clrCacheBtn.textContent = animaTxt("🗑 清除缓存"); clrCacheBtn.style.cssText = 'padding:4px 10px;border-radius:4px;background:#3a1a1a;color:#f87171;cursor:pointer;font-size:12px;';
                clrCacheBtn.onclick = async function(){
                    if(!confirm('确定清除所有云端翻译缓存？'))return;
                    await fetch('/danbooru_anima/clear_translation_cache',{method:'POST'});
                    alert('已清除');
                };
                tcDiv.appendChild(clrCacheBtn);
                transBody.appendChild(tcDiv);

                // ── Danbooru API 凭据（全局，可折叠，默认收起）──
                var sepD = document.createElement("hr");
                sepD.style.cssText = "border:none;border-top:1px solid var(--anima-line);margin:12px 0;";
                box.appendChild(sepD);
                var dbHead = document.createElement("div");
                dbHead.style.cssText = "display:flex;align-items:center;justify-content:space-between;cursor:pointer;color:var(--anima-ink);font-weight:bold;font-size:13px;userSelect:none;padding:9px 12px;border-radius:8px;background:var(--anima-well);border:1px solid rgba(var(--anima-accent-soft-rgb),0.38);margin-bottom:6px;";
                dbHead.innerHTML = '<span>' + animaTxt("D 站 API 凭据") + '</span><span style="font-size:10px;color:var(--anima-ink);background:var(--anima-title);padding:2px 8px;border-radius:10px;">' + animaTxt("▼ 展开") + '</span>';
                box.appendChild(dbHead);
                var dbBody = document.createElement("div");
                dbBody.style.display = "none";
                box.appendChild(dbBody);
                _hov(dbHead, "rgba(var(--anima-accent-rgb),0.3)");
                dbHead.onclick = function(){
                    var folded = dbBody.style.display === "none";
                    dbBody.style.display = folded ? "block" : "none";
                    dbHead.querySelector("span:last-child").textContent = folded ? animaTxt("▲ 收起") : animaTxt("▼ 展开");
                };
                var dHint = document.createElement("div");
                dHint.textContent = animaTxt("到 Danbooru 个人页点 Generate API Key。用户名填登录名，两个都要填。填上后，搜索按你的账号等级执行：不填或普通会员，一次最多 2 个标签、1000 页；Gold 是 6 个标签、5000 页，并能看被打码的标签；白金及以上标签数不限。Key 不会提高全站大约每秒 10 次的读取速度。两项都留空则继续匿名。");
                dHint.style.cssText = "color:var(--anima-mute);font-size:12px;line-height:1.45;margin-bottom:8px;";
                dbBody.appendChild(dHint);
                var duLabel = document.createElement("div");
                duLabel.textContent = animaTxt("登录名");
                duLabel.style.cssText = "color:var(--anima-mute);font-size:12px;margin-bottom:3px;";
                dbBody.appendChild(duLabel);
                var duInp = document.createElement("input");
                duInp.type = "text";
                duInp.autocomplete = "username";
                duInp.placeholder = "Danbooru login";
                duInp.style.cssText = "width:100%;padding:8px;border-radius:6px;border:1px solid var(--anima-line);background:var(--anima-bg);color:#e0e0e0;font-size:13px;box-sizing:border-box;margin-bottom:8px;";
                dbBody.appendChild(duInp);
                var dkLabel = document.createElement("div");
                dkLabel.textContent = animaTxt("API Key");
                dkLabel.style.cssText = "color:var(--anima-mute);font-size:12px;margin-bottom:3px;";
                dbBody.appendChild(dkLabel);
                var dkInp = document.createElement("input");
                dkInp.type = "password";
                dkInp.autocomplete = "off";
                dkInp.placeholder = "API Key";
                dkInp.style.cssText = "width:100%;padding:8px;border-radius:6px;border:1px solid var(--anima-line);background:var(--anima-bg);color:#e0e0e0;font-size:13px;box-sizing:border-box;margin-bottom:8px;";
                dbBody.appendChild(dkInp);
                var dRow = document.createElement("div");
                dRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:4px;";
                var dTest = document.createElement("span");
                dTest.textContent = animaTxt("测试连接");
                dTest.style.cssText = "padding:4px 10px;border-radius:4px;background:#1a3a2a;color:#86efac;cursor:pointer;font-size:12px;";
                var dStat = document.createElement("div");
                dStat.style.cssText = "color:var(--anima-mute);font-size:12px;line-height:1.4;flex:1;";
                dRow.appendChild(dTest);
                dRow.appendChild(dStat);
                dbBody.appendChild(dRow);
                var _dLoaded = false;
                var _dDirty = false;
                function _markDDirty(){ _dDirty = true; }
                duInp.addEventListener("input", _markDDirty);
                dkInp.addEventListener("input", _markDDirty);
                function _loadDCreds() {
                    fetch("/danbooru_anima/danbooru_auth").then(function(r){ return r.json(); }).then(function(d){
                        if (!d || d.success === false) return;
                        if (!_dDirty) {
                            duInp.value = d.username || "";
                            dkInp.value = d.api_key || "";
                        }
                        _dLoaded = true;
                    }).catch(function(){});
                }
                function _saveDCreds() {
                    if (!_dLoaded) return;
                    var user = duInp.value.trim();
                    var key = dkInp.value.trim();
                    if (key === "***") return;
                    fetch("/danbooru_anima/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({danbooru_username:user,danbooru_api_key:key})}).catch(function(){});
                }
                duInp.addEventListener("change", _saveDCreds);
                dkInp.addEventListener("change", _saveDCreds);
                dTest.onclick = async function(){
                    if (!_dLoaded) {
                        dStat.style.color = "#f87171";
                        dStat.textContent = animaTxt("还没读到已保存的凭据。请先重启 ComfyUI，再打开总设置。");
                        return;
                    }
                    var user = duInp.value.trim();
                    var key = dkInp.value.trim();
                    dTest.style.pointerEvents = "none";
                    dTest.textContent = animaTxt("测试中…");
                    dStat.style.color = "var(--anima-mute)";
                    dStat.textContent = "";
                    try {
                        var r = await fetch("/danbooru_anima/danbooru_auth_test",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:user,api_key:key})});
                        var d = await r.json();
                        if (d.success) {
                            var lv = d.level ? ("（" + d.level + "）") : "";
                            dStat.style.color = "#86efac";
                            dStat.textContent = animaTxt("已登录：") + (d.name || user) + lv + animaTxt("。之后的搜索和翻页会用这个账号。");
                            _dDirty = true;
                        } else {
                            dStat.style.color = "#f87171";
                            dStat.textContent = d.error || animaTxt("未知错误");
                        }
                    } catch (e) {
                        dStat.style.color = "#f87171";
                        dStat.textContent = animaTxt("请求失败: ") + (e && e.message ? e.message : e);
                    }
                    dTest.textContent = animaTxt("测试连接");
                    dTest.style.pointerEvents = "";
                };
                _loadDCreds();

                // ── 分隔线 ──
                var sepG = document.createElement("hr");
                sepG.style.cssText = "border:none;border-top:1px solid var(--anima-line);margin:12px 0;";
                box.appendChild(sepG);

                // ── Gelbooru API 凭据（全局，可折叠，默认收起）──
                var gbHead = document.createElement("div");
                gbHead.style.cssText = "display:flex;align-items:center;justify-content:space-between;cursor:pointer;color:var(--anima-ink);font-weight:bold;font-size:13px;userSelect:none;padding:9px 12px;border-radius:8px;background:var(--anima-well);border:1px solid rgba(var(--anima-accent-soft-rgb),0.38);margin-bottom:6px;";
                gbHead.innerHTML = '<span>' + animaTxt("🌐 Gelbooru API 凭据") + '</span><span style="font-size:10px;color:var(--anima-ink);background:var(--anima-title);padding:2px 8px;border-radius:10px;">' + animaTxt("▼ 展开") + '</span>';
                box.appendChild(gbHead);
                var gbBody = document.createElement("div");
                gbBody.style.display = "none";  // 默认折叠
                box.appendChild(gbBody);
                _hov(gbHead, "rgba(var(--anima-accent-rgb),0.3)");
                gbHead.onclick = function(){
                    var folded = gbBody.style.display === "none";
                    gbBody.style.display = folded ? "block" : "none";
                    gbHead.querySelector("span:last-child").textContent = folded ? animaTxt("▲ 收起") : animaTxt("▼ 展开");
                };

                var gkLabel = document.createElement("div");
                gkLabel.textContent = animaTxt("API Key（可选，不填为匿名模式）");
                gkLabel.style.cssText = "color:var(--anima-mute);font-size:12px;margin-bottom:3px;";
                gbBody.appendChild(gkLabel);
                var gkInp = document.createElement("input");
                gkInp.type = "password";
                gkInp.placeholder = "Gelbooru API Key";
                gkInp.style.cssText = "width:100%;padding:8px;border-radius:6px;border:1px solid var(--anima-line);background:var(--anima-bg);color:#e0e0e0;font-size:13px;box-sizing:border-box;margin-bottom:8px;";
                gbBody.appendChild(gkInp);

                var guLabel = document.createElement("div");
                guLabel.textContent = animaTxt("User ID（可选）");
                guLabel.style.cssText = "color:var(--anima-mute);font-size:12px;margin-bottom:3px;";
                gbBody.appendChild(guLabel);
                var guInp = document.createElement("input");
                guInp.type = "password";
                guInp.placeholder = "Gelbooru User ID";
                guInp.style.cssText = "width:100%;padding:8px;border-radius:6px;border:1px solid var(--anima-line);background:var(--anima-bg);color:#e0e0e0;font-size:13px;box-sizing:border-box;margin-bottom:4px;";
                gbBody.appendChild(guInp);

                // 加载当前凭据（与 G 站节点设置同一份 settings.json，天然同步）
                function _loadGCreds() {
                    fetch("/gelbooru_anima/settings").then(function(r){ return r.json(); }).then(function(d){
                        var s = d.settings || {};
                        gkInp.value = s.gelbooru_api_key || "";
                        guInp.value = s.gelbooru_user_id || "";
                    }).catch(function(){});
                }
                function _saveGCreds() {
                    fetch("/gelbooru_anima/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({gelbooru_api_key: gkInp.value.trim(), gelbooru_user_id: guInp.value.trim()})}).catch(function(){});
                }
                gkInp.addEventListener("change", _saveGCreds);
                guInp.addEventListener("change", _saveGCreds);
                _loadGCreds();

                function _refreshTransUI(){
                    if (window._animaModelMenu && window._animaModelMenu._closeModelMenu) window._animaModelMenu._closeModelMenu();
                    var p = _tp;
                    var llm = _baiduLlmOn();
                    freeDiv.style.display = p==='free'?'flex':'none';
                    bmDiv.style.display = p==='free'&&_tfm==='baidu'?'flex':'none';
                    dsDiv.style.display = p==='deepseek'?'flex':'none';
                    dsUrl.style.display = p==='deepseek'?'block':'none';
                    akDiv.style.display = p==='free'&&_tfm==='google'?'none':'flex';
                    appDiv.style.display = llm ? 'flex' : 'none';
                    mdDiv.style.display = p==='custom'?'flex':'none';
                    buDiv.style.display = p==='custom'?'flex':'none';
                    if (_akInp) {
                        if (llm) _akInp.placeholder = '百度大模型 API Key';
                        else if (p === 'free' && _tfm === 'baidu') _akInp.placeholder = 'appid:密钥';
                        else _akInp.placeholder = 'sk-...';
                    }
                    if (llm) {
                        hintDiv.style.display = 'block';
                        hintDiv.innerHTML = '大模型翻译填两样：开发者信息里的 <b>APP ID</b>，以及 <a href="https://fanyi-api.baidu.com/manage/apiKey" target="_blank" style="color:#ffd93d;">API Key 管理</a> 里创建的 <b>API Key</b>。不要填通用翻译的 appid:密钥。两种模式的 Key 分开保存。';
                    } else if (p === 'free' && _tfm === 'baidu') {
                        hintDiv.style.display = 'block';
                        hintDiv.innerHTML = '📌 百度翻译申请：<a href="https://fanyi-api.baidu.com" target="_blank" style="color:#ffd93d;">fanyi-api.baidu.com</a> → 开通通用翻译API（免费200万字符/月）→ 获取 APP ID 和密钥<br>👆 API Key 填写格式：<b>appid:密钥</b>（冒号分隔）';
                    } else if (p === 'deepseek') {
                        hintDiv.style.display = 'block';
                        hintDiv.innerHTML = '填 DeepSeek API Key 后点「获取模型」。点开模型下拉框，在弹出列表顶部输入关键词，例如 GPT，只留下名字里含这些词的模型。';
                    } else if (p === 'custom') {
                        hintDiv.style.display = 'block';
                        hintDiv.innerHTML = '先填 Base URL 和 API Key，再点「获取模型」。点开模型下拉框，在弹出列表顶部输入关键词，例如 GPT，只留下名字里含这些词的模型。';
                    } else { hintDiv.style.display = 'none'; }
                }
                _loadTKey();
                _refreshTransUI();

                var sepThumb = document.createElement("hr");
                sepThumb.style.cssText = "border:none;border-top:1px solid var(--anima-line);margin:12px 0;";
                box.appendChild(sepThumb);
                var thumbHead = document.createElement("div");
                thumbHead.style.cssText = "display:flex;align-items:center;justify-content:space-between;cursor:pointer;color:var(--anima-ink);font-weight:bold;font-size:13px;userSelect:none;padding:9px 12px;border-radius:8px;background:var(--anima-well);border:1px solid rgba(var(--anima-accent-soft-rgb),0.38);margin-bottom:6px;";
                thumbHead.innerHTML = '<span>' + animaTxt("🖼 画师/标签缩略图缓存") + '</span><span style="font-size:10px;color:var(--anima-ink);background:var(--anima-title);padding:2px 8px;border-radius:10px;">' + animaTxt("▼ 展开") + '</span>';
                box.appendChild(thumbHead);
                var thumbBody = document.createElement("div");
                thumbBody.style.display = "none";
                box.appendChild(thumbBody);
                _hov(thumbHead, "rgba(var(--anima-accent-rgb),0.3)");
                thumbHead.onclick = function(){
                    var folded = thumbBody.style.display === "none";
                    thumbBody.style.display = folded ? "block" : "none";
                    thumbHead.querySelector("span:last-child").textContent = folded ? animaTxt("▲ 收起") : animaTxt("▼ 展开");
                    if (folded && window.animaMountFavThumbCache) window.animaMountFavThumbCache(thumbBody);
                };

                // ── 作者社交链接 ──
                var socialRow = document.createElement("div");
                socialRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:14px;padding-top:10px;border-top:1px solid var(--anima-line);";
                var _btnBase = function(bg, label, svg, href) {
                    var wrap = document.createElement("a");
                    wrap.href = href; wrap.target = "_blank"; wrap.title = label;
                    wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px;text-decoration:none;";
                    var icon = document.createElement("span");
                    icon.style.cssText = "width:44px;height:44px;border-radius:50%;background:" + bg + ";display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);transition:transform .18s ease, box-shadow .18s ease, filter .18s ease;";
                    icon.innerHTML = svg;
                    icon.onmouseenter = function(){ icon.style.transform = "translateY(-3px)"; icon.style.boxShadow = "0 6px 16px " + bg + "99"; icon.style.filter = "brightness(1.18)"; };
                    icon.onmouseleave = function(){ icon.style.transform = ""; icon.style.boxShadow = "0 2px 8px rgba(0,0,0,0.4)"; icon.style.filter = ""; };
                    wrap.appendChild(icon);
                    var t = document.createElement("span");
                    t.textContent = label;
                    t.style.cssText = "color:var(--anima-mute);font-size:10px;";
                    wrap.appendChild(t);
                    return wrap;
                };
                var _biliSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="white"><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M3 10h18"/><rect x="8" y="11" width="3" height="3" rx="1"/><rect x="13" y="11" width="3" height="3" rx="1"/><path d="M8 7L10 3h4l2 4"/></svg>';
                var _ytSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="white"><rect x="2" y="4" width="20" height="16" rx="4"/><path d="M10 8v8l6-4z" fill="#ff0000"/></svg>';
                var _caiSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="white"><circle cx="12" cy="12" r="10" fill="none" stroke="white" stroke-width="2"/><path d="M16 8A6 6 0 1 0 16 16" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round"/></svg>';
                var _rhSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="white"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="white" stroke-width="2"/><text x="12" y="17" font-size="14" text-anchor="middle" fill="white" font-weight="bold" font-family="sans-serif">RH</text></svg>';
                socialRow.appendChild(_btnBase("#fb7299", "B站", _biliSvg, "https://space.bilibili.com/169318349"));
                socialRow.appendChild(_btnBase("#ff0000", "YouTube", _ytSvg, "https://www.youtube.com/@Zove-try"));
                socialRow.appendChild(_btnBase("#0abf53", "CivitAI", _caiSvg, "https://civitai.com/user/Zovetry"));
                socialRow.appendChild(_btnBase("var(--anima-accent)", "RH国际", _rhSvg, "https://www.runninghub.ai/user-center/1898017693566418945/webapp?inviteCode=rh-v1315"));
                socialRow.appendChild(_btnBase("var(--anima-accent)", "RH中国", _rhSvg, "https://www.runninghub.cn/user-center/1917534691380076545/webapp?inviteCode=rh-v1315"));
                box.appendChild(socialRow);

                // ── 保存按钮（弹窗最底部，主按钮）──
                var okDiv = document.createElement('div');
                okDiv.style.cssText = 'text-align:center;margin-top:14px;';
                var okBtn = document.createElement('span');
                okBtn.textContent = animaTxt("✓ 保存设置"); okBtn.style.cssText = 'display:inline-block;padding:8px 28px;border-radius:6px;background:linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi));color:#ffffff;font-weight:bold;cursor:pointer;font-size:14px;box-shadow:0 2px 10px rgba(var(--anima-accent-hi-rgb),0.35);';
                _hov(okBtn, "rgba(var(--anima-accent-hi-rgb),0.55)", "0 2px 10px rgba(var(--anima-accent-hi-rgb),0.35)");
                okBtn.onclick = function(){
                    _saveDCreds();
                    _saveGCreds();
                    // 同步翻译设置到后端
                    _saveTKey((_akInp && _akInp.value || '').trim());
                    if (_appInp) _saveBaiduAppid(_appInp.value);
                    if (_tp === 'deepseek' && dsSel && (dsSel._modelPicked || dsSel.value)) { _dsm = dsSel._modelPicked || dsSel.value; localStorage.setItem('db_ds_model', _dsm); localStorage.setItem('db_trans_ds_model', _dsm); }
                    if (_tp === 'custom') {
                        var _savedCu = mdInp && (mdInp._modelPicked || mdInp.value);
                        if (_savedCu) { _tmodel = _savedCu; localStorage.setItem('db_trans_model', _tmodel); localStorage.setItem('db_trans_model_cu', _tmodel); }
                        _turl = (buInp.value || '').trim();
                        localStorage.setItem('db_trans_base_url', _turl);
                        localStorage.setItem('db_trans_base_url_cu', _turl);
                    }
                    var _saved = window.animaTranslateFields();
                    fetch('/danbooru_anima/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({translation_provider:_saved.provider,translation_api_key:_saved.api_key,translation_model:_saved.model,translation_base_url:_saved.base_url,translation_baidu_appid:_saved.baidu_appid})}).catch(function(){});
                    ov.remove();
                };
                okDiv.appendChild(okBtn); box.appendChild(okDiv);

                var clsBtn = document.createElement("button");
                clsBtn.textContent = animaTxt("关闭");
                clsBtn.style.cssText = "width:100%;padding:10px;border-radius:8px;border:1px solid rgba(var(--anima-accent-soft-rgb),0.4);cursor:pointer;font-size:12px;background:var(--anima-title);color:var(--anima-ink);font-weight:bold;";
                _hov(clsBtn, "rgba(var(--anima-accent-soft-rgb),0.35)", "0 1px 0 rgba(255,255,255,0.08)");
                clsBtn.onclick = function(){ ov.remove(); };

                box.appendChild(clsBtn);
                if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(box);
                ov.appendChild(box); document.body.appendChild(ov);
            },
        },
    ],
});
