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

import { app } from "/scripts/app.js";
import "./00_anima_i18n.js";
import { $el } from "/scripts/ui.js";
import { openPromptFavPopup } from "./danbooru_prompt_favorites.js";
import "./00_anima_theme.js";
import "./00_anima_fav_grid.js";
import "./01_anima_chip_flyout.js?v=19";

// ── 标签格式转化 ──
var KEEP_UNDERSCORE = ["score_","absurdres","highres","newest","masterpiece","best quality","very aesthetic","ultra detailed"];
function formatTag(tag, isArtist, mode) {
    var t = (tag||"").trim();
    if (!t) return t;
    if (mode==="raw") return t;
    var tl = t.toLowerCase();
    var keep = KEEP_UNDERSCORE.some(function(p){ return tl.indexOf(p)===0; });
    if (!keep) t = t.replace(/_/g, " ");
    var isWeight = window.animaParseWeightTag ? (window.animaParseWeightTag(t).tag !== t) : (t.indexOf("(")===0 && t.lastIndexOf(")")===t.length-1 && t.indexOf(":")>0);
    if (!isWeight) {
        t = t.replace(/(?<!\\)\(/g, "\\(");
        t = t.replace(/(?<!\\)\)/g, "\\)");
    }
    if (isArtist) {
        if (mode==="anima" && t.indexOf("@")!==0) t = "@" + t;
        else if (mode==="noob") t = t.replace(/^@+/, "");
        // raw 模式：不做任何 @ 处理
    }
    return t;
}

app.registerExtension({
    name: "Comfy.DanbooruTextAdvanced",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DanbooruTextAdvanced") return;
        window.hookAnimaNodeChrome(nodeType);
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onCreated?.apply(this, arguments);
            const node = this;
            window.applyAnimaNodeChrome(this);
            if (!document.getElementById("db-av-pulse-style")) {
                var _style4 = document.createElement("style");
                _style4.id = "db-av-pulse-style";
                _style4.textContent = "@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}";
                document.head.appendChild(_style4);
            }
            const _avHideWidgets = new Set(["text", "_db_hidden_tags", "_db_full_tags"]);
            function _ensurePersistWidgets() {
                function ensure(name, def) {
                    var w = node.widgets && node.widgets.find(function(x){ return x.name === name; });
                    if (!w && typeof node.addWidget === "function") w = node.addWidget("text", name, def, function(){});
                    if (w) w.serialize = true;
                    return w;
                }
                ensure("_db_hidden_tags", "{}");
                ensure("_db_full_tags", "");
            }
            function collapseHiddenWidgets() {
                _ensurePersistWidgets();
                for (const wg of node.widgets || []) {
                    if (!_avHideWidgets.has(wg.name)) continue;
                    wg.computeSize = () => [0, -4];
                    wg.draw = function() {};
                    wg.serialize = true;
                    try { wg.hidden = true; } catch(e) {}
                    if (wg.options) wg.options.hidden = true;
                    else wg.options = { hidden: true };
                    wg.computedHeight = -4;
                    if (wg.element) {
                        wg.element.style.display = "none";
                        wg.element.style.height = "0px";
                        wg.element.style.minHeight = "0";
                        wg.element.style.margin = "0";
                        wg.element.style.padding = "0";
                        wg.element.style.overflow = "hidden";
                    }
                }
                try { node.setDirtyCanvas(true, true); } catch(e) {}
            }
            collapseHiddenWidgets();
            const textWidget = node.widgets?.find(function(w){ return w.name === "text"; });
            if (textWidget) textWidget.serialize = true;
            const container = $el("div.danbooru-text-advanced", { style: { width: "100%", height: "100%", minHeight: "0", position: "relative", display: "flex", flexDirection: "column", background: "var(--anima-bg)", borderRadius: "4px", overflow: "hidden" } });
            if (typeof window.applyAnimaPanelGlow === "function") window.applyAnimaPanelGlow(container);
            const searchInput = $el("input", { type: "text", placeholder: animaTxt("🔍 搜 tag（中文也行）"), style: { width: "100%", padding: "8px 10px", fontSize: "14px", border: "none", borderBottom: "1px solid var(--anima-title)", background: "var(--anima-well)", color: "#e0e0e0", outline: "none", boxSizing: "border-box", flexShrink: 0 } });
            const acList = $el("div", { style: { display: "none", maxHeight: "150px", overflowY: "auto", background: "var(--anima-bg)", borderBottom: "1px solid var(--anima-title)", flexShrink: 0 } });
            const chipArea = $el("div", { style: { flex: "1 1 0%", minHeight: "0", padding: "6px 8px", overflowY: "auto", display: "flex", flexWrap: "wrap", gap: "6px", alignContent: "flex-start" } });
            chipArea.style.display = "none";
            const chipInput = $el("input", { type: "text", className: "anima-chip-entry-input", placeholder: animaTxt("🌐 输入中文翻译 · 英文tag直接添加"), style: { display: "none", padding: "4px 8px", border: "1px solid var(--anima-title)", background: "var(--anima-well)", color: "#e0e0e0", fontSize: "12px", outline: "none", boxSizing: "border-box", lineHeight: "1.4", fontFamily: "inherit" } });
            const chipInputRow = $el("div", { className: "anima-chip-entry", style: { display: "none" } });
            chipInputRow.appendChild(chipInput);
            var chipTransBtn = $el("span", { className: "anima-chip-entry-btn", textContent: animaTxt("🗘 翻译"), title: "翻译中文并加入节点", style: { display: "none", padding: "4px 10px", border: "1px solid var(--anima-title)", borderRadius: "3px", cursor: "pointer", fontSize: "11px", background: "linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi))", color: "#ffffff", whiteSpace: "nowrap", userSelect: "none" } });
            chipTransBtn.onclick = function() { if (!chipInput.value.trim()) { chipInput.focus(); return; } _doChipTranslate(chipInput); };
            chipInputRow.appendChild(chipTransBtn);
            chipInput.onkeydown = function(ev) {
                if (ev.key === "Enter") {
                    ev.preventDefault();
                    var v = chipInput.value.trim();
                    if (!v) return;
                    if (/[\u4e00-\u9fff]/.test(v)) { _doChipTranslate(chipInput); }
                    else { _insertTag(v); chipInput.value = ""; }
                }
            };
            async function _doChipTranslate(inp) {
                var v = inp.value.trim();
                if (!v) return;
                inp.disabled = true; inp.style.background = "#0d1117";
                chipTransBtn.textContent = animaTxt("⏳ 翻译中..."); chipTransBtn.style.pointerEvents = "none"; chipTransBtn.style.animation = "pulse 0.6s infinite";
                try {
                    var _cfg = window.animaResolveTranslator();
                    var _miss = window.animaTransConfigError(_cfg);
                    if (_miss) { alert(_miss); inp.disabled = false; inp.style.background = ""; chipTransBtn.textContent = animaTxt("🗘 翻译"); chipTransBtn.style.pointerEvents = ""; chipTransBtn.style.animation = ""; return; }
                    _transProvider = _cfg.rawProvider; _freeMode = _cfg.freeMode; _transApiKey = _cfg.apiKey;
                    var _map = await window.animaCloudTranslate([v], { cfg: _cfg, from_lang: "zh", to_lang: "en", as_sentence: true });
                    var _d = { success: true, translations: _map || {} };
                    if (_d.success && _d.translations) {
                        var en = (window.animaPickTranslation && window.animaPickTranslation(_d.translations, v, v)) || Object.values(_d.translations)[0] || "";
                        if (en) { en = en.replace(/, /g, "; "); _insertTag(en); _tlCache[en] = v; _sentenceTags[en] = true; inp.value = ""; if (_chipMode) renderChips(); }
                    }
                } catch(e) { console.error("[AV] chip翻译失败:", e); }
                inp.disabled = false; inp.style.background = "";
                chipTransBtn.textContent = animaTxt("🗘 翻译"); chipTransBtn.style.pointerEvents = ""; chipTransBtn.style.animation = "";
            }
            const toolbar = $el("div", { style: { display: "flex", gap: "6px", padding: "3px 6px", borderBottom: "1px solid var(--anima-title)", background: "var(--anima-bg-deep)", flexShrink: 0, flexWrap: "wrap", alignItems: "center" } });
            const tagTextarea = $el("textarea", { placeholder: "在此输入或编辑 tag，逗号分隔", style: { flex: "1 1 0%", minHeight: "0", width: "100%", padding: "6px 8px", border: "1px solid var(--anima-title)", background: "rgba(var(--anima-well-rgb),.62)", color: "#e0e0e0", fontSize: "13px", outline: "none", resize: "none", boxSizing: "border-box", fontFamily: "inherit", lineHeight: "1.5" } });
            let _chipMode = localStorage.getItem("db_av_chip_mode") === "1", _tlCache = {}, _tagColorCache = {}, _tlMissing = {};
            var _sentenceTags = {};
            function _applyChipLayout() {
                chipArea.style.display = _chipMode ? "flex" : "none";
                chipInputRow.style.display = _chipMode ? "flex" : "none";
                chipInputRow.classList.toggle("is-on", !!_chipMode);
                chipTransBtn.style.display = _chipMode ? "inline-flex" : "none";
                chipInput.style.display = _chipMode ? "block" : "none";
                tagTextarea.style.display = _chipMode ? "none" : "flex";
            }
            // ── 四编辑系统状态 ──
            var _weights = {};
            var _hiddenTags = {};
            var _avConfigured = false;
            var _avUserEdit = false;
            var _hideLock = false;
            function _readJsonObj(raw) {
                if (raw == null || raw === "") return null;
                try {
                    var parsed = JSON.parse(raw);
                    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
                    return parsed;
                } catch (e) { return null; }
            }
            function _hiddenKeyCount(obj) {
                return obj ? Object.keys(obj).length : 0;
            }
            function _pickLonger(a, b) {
                a = a || "";
                b = b || "";
                return a.length >= b.length ? a : b;
            }
            function _loadNodeHidden() {
                var fromLs = null;
                try { fromLs = _readJsonObj(localStorage.getItem("db_av_hidden_" + node.id) || ""); } catch (e) {}
                var hw = node.widgets && node.widgets.find(function(w){ return w.name === "_db_hidden_tags"; });
                var fromW = (hw && hw.value != null) ? _readJsonObj(String(hw.value)) : null;
                if (_hiddenKeyCount(fromLs) >= _hiddenKeyCount(fromW)) _hiddenTags = fromLs || fromW || {};
                else _hiddenTags = fromW || {};
            }
            var _saveHidden = function() {
                var _s = JSON.stringify(_hiddenTags || {});
                try { localStorage.setItem("db_av_hidden_" + node.id, _s); } catch(e) {}
                var _hw1 = node.widgets?.find(function(w){return w.name==="_db_hidden_tags";});
                if (_hw1) _hw1.value = _s;
            };
            var _batchMode = false, _batchSelected = {};
            var _mergeMode = false, _mergeSelected = {};
            _applyChipLayout();
            var _transProvider = localStorage.getItem("db_trans_provider") || "free";
            var _transApiKey = ""; var _transModel = ""; var _transBaseUrl = "";
            var _freeMode = localStorage.getItem("db_trans_free_mode") || localStorage.getItem("db_free_mode") || "baidu";
            var _dsModel = localStorage.getItem("db_ds_model") || "flash";
            function _loadTransKey() {
                if (!window.animaResolveTranslator) return;
                var cfg = window.animaResolveTranslator();
                _transProvider = cfg.rawProvider;
                _freeMode = cfg.freeMode;
                _transApiKey = cfg.apiKey;
                _transModel = cfg.model;
                _transBaseUrl = cfg.baseUrl;
                if (typeof _akInp !== "undefined" && _akInp) _akInp.value = _transApiKey;
            }
            _loadTransKey();
fetch("/danbooru_anima/tag_colors").then(function(r){return r.json();}).then(function(d){_tagColorCache=d||{};}).catch(function(){});
            var _mapperCatColors = {};
            fetch("/danbooru_anima/tag_mapper_cats").then(function(r){return r.json();}).then(function(cs){for(var ci=0;ci<cs.length;ci++){_mapperCatColors[cs[ci].v]=cs[ci].c;}}).catch(function(){});
            var _mapperKwColor = {};
            var _mapperKwTs = 0;
            function _refreshMapperColors(){fetch("/danbooru_anima/tag_mapper_cats").then(function(r){return r.json();}).then(function(cs){for(var ci=0;ci<cs.length;ci++){_mapperCatColors[cs[ci].v]=cs[ci].c;}}).catch(function(){});fetch("/danbooru_anima/tag_mapper_rules").then(function(r){return r.json();}).then(function(d){if(d.success&&d.rules){var rs=d.rules;var keys=Object.keys(rs);for(var ri=0;ri<keys.length;ri++){var kw=keys[ri];var col=_mapperCatColors[rs[kw]]||"#888";_mapperKwColor[kw]=col;_mapperKwColor[kw.replace(/ /g,"_")]=col;}_mapperKwTs=Date.now();}}).catch(function(){});fetch("/danbooru_anima/tag_mapper_mappings").then(function(r){return r.json();}).then(function(d){var tags=d.mappings||{};var keys=Object.keys(tags);for(var ri=0;ri<keys.length;ri++){var kw=keys[ri];var col=_mapperCatColors[tags[kw]]||"#888";_mapperKwColor[kw]=col;_mapperKwColor[kw.replace(/ /g,"_")]=col;_mapperKwColor[kw.replace(/_/g," ")]=col;}_mapperKwTs=Date.now();}).catch(function(){});}
            _refreshMapperColors();
            node._taColorTimer = setInterval(_refreshMapperColors, 60000);
            // 节点删除时清理轮询（防累积泄漏）
            if (!node._taCleaned) {
                node._taCleaned = true;
                node.onRemoved = node.onRemoved || function() {
                    try { if (node._taColorTimer) clearInterval(node._taColorTimer); } catch(e) {}
                };
            }
function _tagColor(tag) {
    var _r = "#555555";
    if (!tag) return _r;
    if (window.animaParseWeightTag) tag = window.animaParseWeightTag(tag).tag || tag;
    if (tag.startsWith("@")) return "#e91e63";
    if (window.animaChipLooksArtist && window.animaChipLooksArtist(tag, _favArtCache)) return "#e91e63";
    if (/^score_|^rating_|^year_/.test(tag)) _r = "#ff9800";
    else if (/^\d+(?:girl|boy|other|1other)$/.test(tag)) _r = "#00bcd4";
    else if (/^1(shot|girl|boy|other|head|breast|animal|pov|night|day)$/.test(tag)) _r = "#00bcd4";
    else { var _mck2=tag;var _mci2=tag.lastIndexOf("_");if(_mci2>0)_mck2=tag.slice(_mci2+1); var mc = _mapperKwColor[tag] || _mapperKwColor[tag.replace(/_/g," ")]; if(!mc){var _words=tag.split(/[ _]+/);for(var _wi=0;_wi<_words.length;_wi++){mc=_mapperKwColor[_words[_wi]];if(mc)break;}} if(!mc)mc=_mapperKwColor[_mck2]; if(mc)_r=mc; else { var _c = _tagColorCache[tag] || _tagColorCache[tag.replace(/ /g,"_")]; if (_c) _r = _c.c; } }
    return _r;
    var c = _tagColorCache[tag] || _tagColorCache[tag.replace(/ /g,"_")];
    return c ? c.c : "#555555";
}
            function _tbtn(txt, title, fn) {
                var b = $el("span", { textContent: txt, title: title, style: { fontSize: "11px", cursor: "pointer", background: "rgba(255,255,255,0.06)", color: "var(--anima-mute)", padding: "4px 10px", borderRadius: "6px", whiteSpace: "nowrap", userSelect: "none", border: "1px solid rgba(255,255,255,0.08)", transition: "all .15s ease" }, onclick: fn });
                b.onmouseover = function(){ this.style.filter = "brightness(1.35)"; this.style.transform = "translateY(-1px)"; };
                b.onmouseout = function(){ this.style.filter = ""; this.style.transform = ""; };
                return b;
            }
            var _chipBtn = _tbtn(_chipMode ? "⬡ 标签模式" : "📋 原文模式", "点击切换 原文 ↔ CHIP", function(){
                _chipMode = !_chipMode;
                localStorage.setItem("db_av_chip_mode", _chipMode ? "1" : "0");
                _chipBtn.textContent = _chipMode ? "⬡ 标签模式" : "📋 原文模式";
                if (window.animaPaintModeSwitch) window.animaPaintModeSwitch(_chipBtn, "chip", _chipMode);
                _applyChipLayout();
                if (_chipMode) renderChips();
            });
            if (window.animaPaintModeSwitch) window.animaPaintModeSwitch(_chipBtn, "chip", _chipMode);
            toolbar.appendChild(_chipBtn);
            toolbar.appendChild(_tbtn( "📂 预制", "预制 tag", function(){openPresetPopup();}));
            toolbar.appendChild(_tbtn( "✨ 收藏", "收藏 tag", function(){openFavPopup();}));
            toolbar.appendChild(_tbtn( "A 搜索", "Animadex 搜索", function(){
                window._adexOnSelect = function(it) {
                    var _fmtA = function(t) { return window._adexFormat ? t.replace(/_/g," ").replace(/\(/g,"\\(").replace(/\)/g,"\\)") : t; };
                    _insertTag(_fmtA(it.name));
                    if (it.copyright_name) _insertTag(_fmtA(it.copyright_name));
                    if (it.tags && it.tags.length) {
                        it.tags.forEach(function(t) {
                            var tl = t.replace(/ /g,"_").toLowerCase();
                            if (tl.endsWith("_hair") || tl.endsWith("_eyes") || tl.endsWith("_haired") || tl.indexOf("_hair_")>=0) _insertTag(_fmtA(t));
                        });
                    }
                };
                if (window.openAdexPopup) window.openAdexPopup();
            }));
            toolbar.appendChild(_tbtn( "🌐 翻译", "翻译未翻译标签", async function(){
                if (!_chipMode) { alert("请先切换到 CHIP 模式（📋）再使用翻译"); return; }
                var _allTags = getTags();
                var _utags = _allTags.filter(function(t){ return !(t in _tlCache) || t.indexOf("; ") >= 0; });
                if (!_utags.length) { alert("所有标签已翻译"); return; }
                var _btnEl = this;
                _btnEl.textContent = "⏳"; _btnEl.style.pointerEvents = "none";
                try {
                    var _cfg = window.animaResolveTranslator();
                    var _miss = window.animaTransConfigError(_cfg);
                    if (_miss) { alert(_miss); return; }
                    _transProvider = _cfg.rawProvider; _freeMode = _cfg.freeMode; _transApiKey = _cfg.apiKey;
                    var _apiTags = _utags.map(function(t){
                        if (t.indexOf("; ") >= 0) return t.replace(/; /g, ", ");
                        return (t.indexOf(" ") >= 0 || t.indexOf(",") >= 0) ? t : t.replace(/ /g, "_");
                    });
                    var _map = await window.animaCloudTranslate(_apiTags, { cfg: _cfg });
                    var _acnt = 0;
                    for (var ui = 0; ui < _utags.length; ui++) {
                        var _hit = window.animaPickTranslation(_map, _utags[ui], _apiTags[ui]);
                        if (_hit) { _tlCache[_utags[ui]] = _hit; _acnt++; continue; }
                        if (_utags[ui].indexOf("; ") < 0) continue;
                        var _parts = _utags[ui].split("; ");
                        var _needApi = [];
                        for (var pi = 0; pi < _parts.length; pi++) {
                            var _lookup = _parts[pi];
                            if (!_tlCache[_lookup] && !_tlCache[_lookup.replace(/ /g, "_")] && !window.animaPickTranslation(_map, _lookup, _lookup)) _needApi.push(_lookup);
                        }
                        if (_needApi.length) {
                            var _pApi = _needApi.map(function(p){ return p.replace(/ /g, "_"); });
                            try {
                                var _pmap = await window.animaCloudTranslate(_pApi, { cfg: _cfg });
                                for (var ni = 0; ni < _needApi.length; ni++) {
                                    var _pv = window.animaPickTranslation(_pmap, _needApi[ni], _pApi[ni]);
                                    if (_pv) _tlCache[_needApi[ni]] = _pv;
                                }
                            } catch (e2) {}
                        }
                        var _combined = [];
                        for (var pj = 0; pj < _parts.length; pj++) {
                            _combined.push(_tlCache[_parts[pj]] || _tlCache[_parts[pj].replace(/ /g, "_")] || window.animaPickTranslation(_map, _parts[pj], _parts[pj]) || _parts[pj]);
                        }
                        _tlCache[_utags[ui]] = _combined.join(", ");
                        _acnt++;
                    }
                    renderChips();
                    if (_acnt === 0 && _utags.length > 0) alert("翻译完成，但未获取到翻译结果。请检查顶栏翻译设置，或换一个提供商后再试。");
                    else if (_acnt < _utags.length) alert("已翻译 " + _acnt + "/" + _utags.length + " 条，其余没有返回。可以再点一次翻译补齐。");
                } catch (e) {
                    alert("请求失败: " + ((e && e.message) ? e.message : e));
                } finally {
                    _btnEl.textContent = "🌐"; _btnEl.style.pointerEvents = "";
                }
            }));
            toolbar.appendChild(_tbtn( "💾", "提示词收藏", function(){
                var _text = getTags().join(", ");
                openPromptFavPopup(node, _text, function(text) {
                    setTags(text.split(/[,，]+/).map(function(s){return s.trim();}).filter(Boolean));
                    syncWidget();
                    if(_chipMode) renderChips();
                });
            }));

            // ── 按钮分组重排（对齐文本透传：常用区 / 预制区 / 编辑区） ──
            var _tbMap = {};
            toolbar.childNodes.forEach(function(b){ var _k = Array.from((b.textContent||"").trim())[0]; if (_k) _tbMap[_k] = b; });
            function _tbPick(prefixes) {
                for (var i=0;i<prefixes.length;i++) { var b = _tbMap[prefixes[i]]; if (b) { delete _tbMap[prefixes[i]]; return b; } }
                return null;
            }
            var _gCommon = document.createElement("span");
            _gCommon.style.cssText = "display:inline-flex;gap:5px;align-items:center;padding:3px 6px;";
            if (window.animaPaintModeDock) window.animaPaintModeDock(_gCommon);
            var _gPreset = document.createElement("span");
            _gPreset.style.cssText = "display:inline-flex;gap:6px;align-items:center;background:rgba(255,255,255,0.04);border:1px solid rgba(var(--anima-accent-rgb),.45);border-radius:8px;padding:3px 8px;";
            var _gEdit = document.createElement("span");
            _gEdit.style.cssText = "display:inline-flex;gap:6px;align-items:center;background:rgba(255,255,255,0.04);border:1px solid rgba(var(--anima-accent-rgb),.45);border-radius:8px;padding:3px 8px;";
            function _mv(grp, b) { if (b) { grp.appendChild(b); b.style.margin = "0"; } }
            // 常用区（最左）：CHIP 模式（核心开关，加大醒目）
            var _chipModeBtn = _tbPick(["📋","⬡","📝"]);
            if (_chipModeBtn && window.animaPaintModeSwitch) window.animaPaintModeSwitch(_chipModeBtn, "chip", _chipMode);
            _mv(_gCommon, _chipModeBtn);
            // 预制区：预制 / 收藏 / A 搜索 / 💾 提示词收藏
            _mv(_gPreset, _tbPick(["📂"]));
            _mv(_gPreset, _tbPick(["✨"]));
            _mv(_gPreset, _tbPick(["A"]));
            _mv(_gPreset, _tbPick(["💾"]));
            // 编辑区：翻译
            _mv(_gEdit, _tbPick(["🌐"]));
            toolbar.innerHTML = "";
            toolbar.appendChild(_gCommon);
            toolbar.appendChild(_gPreset);
            toolbar.appendChild(_gEdit);
            // ── 四编辑系统按钮 ──
            var _batchBtn = _tbtn("☑ 批量", animaTxt("空白处框选，拖动已选标签可一起改顺序"), function(){
                _batchMode = !_batchMode;
                if (_batchMode) { _batchSelected = {}; if (_mergeMode) { _mergeMode = false; _mergeSelected = {}; _mergeBtn.style.background = "rgba(255,255,255,0.06)"; _mergeBtn.style.color = "var(--anima-mute)"; _mergeBtn.style.borderColor = "rgba(255,255,255,0.08)"; } }
                this.style.background = _batchMode ? "rgba(var(--anima-accent-rgb),0.15)" : "rgba(255,255,255,0.06)";
                this.style.color = _batchMode ? "var(--anima-accent-soft)" : "var(--anima-mute)";
                this.style.borderColor = _batchMode ? "var(--anima-accent-soft)" : "rgba(255,255,255,0.08)";
                _refreshBatchBar();
                if (_chipMode) renderChips();
            });
            toolbar.appendChild(_batchBtn);
            var _mergeBtn = _tbtn("🧩 合并", "合并相邻标签", function(){
                if (_mergeMode) {
                    var _sel = Object.keys(_mergeSelected).map(Number).sort(function(a,b){return a-b;});
                    if (_sel.length < 2) { alert("请至少选中2个相邻标签"); return; }
                    for (var si = 1; si < _sel.length; si++) { if (_sel[si] !== _sel[si-1] + 1) { alert("只能合并相邻标签"); return; } }
                    var tags = getTags();
                    var _parts = _sel.map(function(i){return tags[i];});
                    var _merged = _parts.join("; ");
                    tags.splice(_sel[0], _sel.length, _merged);
                    _mergeMode = false; _mergeSelected = {};
                    this.style.background = "rgba(255,255,255,0.06)"; this.style.color = "var(--anima-mute)"; this.style.borderColor = "rgba(255,255,255,0.08)";
                    setTags(tags);
                } else {
                    _mergeMode = true; _mergeSelected = {};
                    if (_batchMode) { _batchMode = false; _batchSelected = {}; _batchBtn.style.background = "rgba(255,255,255,0.06)"; _batchBtn.style.color = "var(--anima-mute)"; _batchBtn.style.borderColor = "rgba(255,255,255,0.08)"; _refreshBatchBar(); }
                    this.style.background = "rgba(var(--anima-accent-rgb),0.15)"; this.style.color = "var(--anima-accent-soft)"; this.style.borderColor = "var(--anima-accent-soft)";
                    if (_chipMode) renderChips();
                }
            });
            toolbar.appendChild(_mergeBtn);
            // ── 批量操作栏 ──
            var _batchBar = $el("div", { style: { display: "none", gap: "6px", padding: "3px 6px", background: "rgba(var(--anima-accent-rgb),0.05)", borderBottom: "1px solid var(--anima-title)", flexShrink: 0, flexWrap: "wrap", alignItems: "center" } });
            function _refreshBatchBar() {
                _batchBar.innerHTML = "";
                if (!_batchMode) { _batchBar.style.display = "none"; return; }
                _batchBar.style.display = "flex";
                var _selN = Object.keys(_batchSelected).length;
                var _hidN = Object.keys(_hiddenTags).length;
                _batchBar.appendChild($el("span", { textContent: "已选 " + _selN + " 个", style: { color: "var(--anima-accent-soft)", fontSize: "11px", fontWeight: 600 } }));
                var _mkBB = function(t, fn) {
                    var b = $el("span", { textContent: t, style: { fontSize: "11px", cursor: "pointer", background: "rgba(255,255,255,0.06)", color: "var(--anima-mute)", padding: "3px 8px", borderRadius: "4px", whiteSpace: "nowrap", userSelect: "none", border: "1px solid rgba(255,255,255,0.08)", transition: "all .15s ease" }, onclick: fn });
                    b.onmouseover = function(){ this.style.filter = "brightness(1.35)"; this.style.transform = "translateY(-1px)"; };
                    b.onmouseout = function(){ this.style.filter = ""; this.style.transform = ""; };
                    return b;
                };
                _batchBar.appendChild(_mkBB("\u2611 \u5168\u9009", function(){
                    var _allT = getTags();
                    _batchSelected = {};
                    for (var _ai = 0; _ai < _allT.length; _ai++) _batchSelected[String(_ai)] = true;
                    _refreshBatchBar();
                    if (_chipMode) renderChips();
                }));
                _batchBar.appendChild(_mkBB("\ud83d\udcc1 \u79fb\u52a8(" + _selN + ")", function(e){
                    _folderPickMenu(e.clientX, e.clientY, function(_tgt){
                        var _keys = Object.keys(_batchSelected).map(function(k){ return getTags()[Number(k)]; }).filter(Boolean);
                        if (!_keys.length) return;
                        var _body = _tgt === '__uncat'
                            ? JSON.stringify({action:"remove_from_all",category:"artists",item_keys:_keys})
                            : JSON.stringify({action:"move",category:"artists",item_keys:_keys,target_folder:_tgt});
                        fetch("/danbooru_anima/favorites/folder", {method:"POST",headers:{"Content-Type":"application/json"},body:_body})
                        .then(function(r){return r.json();}).then(function(d){ if (d.success) { _batchSelected = {}; _refreshBatchBar(); loadFavs(); } else alert(d.error || "\u79fb\u52a8\u5931\u8d25"); });
                    });
                }));
                if (_selN > 0) {
                    _batchBar.appendChild(_mkBB("🗑 删除(" + _selN + ")", function(){
                        var _indices = Object.keys(_batchSelected).map(Number).sort(function(a,b){return b-a;});
                        var tags = getTags();
                        _indices.forEach(function(i){ var _rm2 = tags[i]; if (_rm2 && _hiddenTags[_rm2]) delete _hiddenTags[_rm2]; tags.splice(i, 1); });
                        _saveHidden();
                        _batchSelected = {};
                        setTags(tags);
                        _refreshBatchBar();
                    }));
                    _batchBar.appendChild(_mkBB("👁 隐藏(" + _selN + ")", function(){
                        var _t1 = getTags();
                        Object.keys(_batchSelected).forEach(function(k){ _hiddenTags[_t1[Number(k)]] = true; });
                        _batchSelected = {};
                        syncWidget();
                        _refreshBatchBar();
                        if (_chipMode) renderChips();
                    }));
                }
                if (_hidN > 0) {
                    _batchBar.appendChild(_mkBB("👁 显示全部(" + _hidN + ")", function(){
                        _hiddenTags = {};
                        _saveHidden();
                        syncWidget();
                        _refreshBatchBar();
                        if (_chipMode) renderChips();
                    }));
                }
                _batchBar.appendChild(_mkBB("✕ 取消", function(){
                    _batchMode = false; _batchSelected = {};
                    _batchBtn.style.background = "rgba(255,255,255,0.06)"; _batchBtn.style.color = "var(--anima-mute)"; _batchBtn.style.borderColor = "rgba(255,255,255,0.08)";
                    _refreshBatchBar();
                    if (_chipMode) renderChips();
                }));
            }

            function openPresetPopup() {
                if (window.showPresetTagPopup) {
                    window.showPresetTagPopup(function(tag) { _insertTag(tag); syncWidget(); if (_chipMode) renderChips(); });
                } else {
                    alert("未找到预制 Tag 弹窗模块");
                }
            }

            function _migrateMapKey(map, from, to) {
                if (!map || from == null || to == null || from === to) return;
                if (Object.prototype.hasOwnProperty.call(map, from) && !Object.prototype.hasOwnProperty.call(map, to)) map[to] = map[from];
                delete map[from];
            }
            function _absorbWeightedToken(s) {
                if (!s) return s;
                var p = window.animaParseWeightTag ? window.animaParseWeightTag(s) : { tag: s, weight: 1 };
                var inner = p.tag || s;
                if (inner && inner !== s) {
                    _migrateMapKey(_hiddenTags, s, inner);
                    _migrateMapKey(_tlCache, s, inner);
                    _migrateMapKey(_tlMissing, s, inner);
                    if (_sentenceTags) _migrateMapKey(_sentenceTags, s, inner);
                    _migrateMapKey(_weights, s, inner);
                    if (window.animaHasWeight && window.animaHasWeight(p.weight)) _weights[inner] = p.weight;
                    else delete _weights[inner];
                } else {
                    delete _weights[inner];
                }
                return inner;
            }
            function _fmtStoredTag(t) {
                var p = window.animaParseWeightTag ? window.animaParseWeightTag(t) : { tag: t, weight: 1 };
                var base = p.tag || t;
                if (window.animaHasWeight && window.animaHasWeight(p.weight) && _weights[base] == null) _weights[base] = p.weight;
                return window.animaFmtWeightTag ? window.animaFmtWeightTag(base, _weights[base]) : t;
            }
            function _isHiddenTag(t) {
                if (!t) return false;
                if (_hiddenTags[t]) return true;
                var p = window.animaParseWeightTag ? window.animaParseWeightTag(t) : null;
                return !!(p && p.tag && _hiddenTags[p.tag]);
            }
            function _normalizeHiddenKeys() {
                var keys = Object.keys(_hiddenTags || {});
                for (var i = 0; i < keys.length; i++) {
                    var hk = keys[i];
                    var inner = window.animaParseWeightTag ? window.animaParseWeightTag(hk).tag : hk;
                    if (inner && inner !== hk) {
                        _hiddenTags[inner] = true;
                        delete _hiddenTags[hk];
                    }
                }
            }
            function _mergeHiddenKeysIntoTextarea() {
                _normalizeHiddenKeys();
                var present = {};
                var tags = getTags();
                for (var i = 0; i < tags.length; i++) present[tags[i]] = true;
                var keys = Object.keys(_hiddenTags || {});
                for (var hi = 0; hi < keys.length; hi++) {
                    var hk = keys[hi];
                    if (!hk) continue;
                    var inner = window.animaParseWeightTag ? window.animaParseWeightTag(hk).tag : hk;
                    if (present[hk] || present[inner]) continue;
                    tagTextarea.value += (tagTextarea.value ? ", " : "") + _fmtStoredTag(hk);
                    present[inner || hk] = true;
                }
            }
            function _pruneHiddenToText() {
                _normalizeHiddenKeys();
                var present = {};
                var tags = getTags();
                for (var i = 0; i < tags.length; i++) present[tags[i]] = true;
                var keys = Object.keys(_hiddenTags || {});
                for (var hi = 0; hi < keys.length; hi++) {
                    var hk = keys[hi];
                    var inner = window.animaParseWeightTag ? window.animaParseWeightTag(hk).tag : hk;
                    if (present[hk] || present[inner]) continue;
                    delete _hiddenTags[hk];
                }
            }
            function _renameChipTag(ot, v, ii) {
                var p = window.animaParseWeightTag ? window.animaParseWeightTag(v) : { tag: v, weight: 1 };
                var base = (p.tag || v).trim();
                if (!base) return;
                var hasW = window.animaHasWeight && window.animaHasWeight(p.weight);
                if (hasW) _weights[base] = p.weight;
                if (base !== ot) {
                    _migrateMapKey(_hiddenTags, ot, base);
                    _migrateMapKey(_tlCache, ot, base);
                    _migrateMapKey(_tlMissing, ot, base);
                    if (_sentenceTags) _migrateMapKey(_sentenceTags, ot, base);
                    if (!hasW) _migrateMapKey(_weights, ot, base);
                    else delete _weights[ot];
                }
                var t2 = getTags();
                t2[ii] = base;
                setTags(t2);
            }
            function getTags() {
                return tagTextarea.value.split(/[,，]+/).map(function(s) {
                    s = s.trim();
                    if (!s) return "";
                    return _absorbWeightedToken(s);
                }).filter(Boolean);
            }
            function setTags(tags) {
                tagTextarea.value = tags.map(_fmtStoredTag).join(", ");
                syncWidget();
                if (_chipMode) renderChips();
            }
            var syncWidget = function() {
                _avUserEdit = true;
                var tw = textWidget || (node.widgets && node.widgets.find(function(w){ return w.name === "text"; }));
                if (!tw) return;
                try { localStorage.setItem("db_av_content_" + node.id, tagTextarea.value); } catch(e) {}
                var _fw1 = node.widgets?.find(function(w){return w.name==="_db_full_tags";}); if (_fw1) _fw1.value = tagTextarea.value;
                var tags = getTags().filter(function(t){ return !_isHiddenTag(t); });
                var out = tags.map(function(t){
                    var w = _weights[t];
                    return window.animaFmtWeightTag ? window.animaFmtWeightTag(t, w) : ((w && w !== 1.0) ? "(" + t + ":" + w.toFixed(1) + ")" : t);
                }).join(", ").replace(/; /g, ", ");
                tw.value = out;
            };

            var _renderGen = 0;
            function _syncChipSortLock() {
                if (chipArea._animaSortableSetDisabled) chipArea._animaSortableSetDisabled(!!_batchMode || !!_mergeMode);
                chipArea.classList.toggle("anima-chip-area-pick", !!(_batchMode || _mergeMode));
            }
            function _resolveArtistForFlyout(tag) {
                var p = window.animaParseWeightTag ? window.animaParseWeightTag(tag) : { tag: String(tag || "") };
                var inner = p.tag || String(tag || "");
                var _an = window.animaArtistNorm ? window.animaArtistNorm(inner) : inner.replace(/^@+/, "").replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/_/g, " ").trim().toLowerCase();
                if (!_an) return Promise.resolve({});
                var _anQuery = inner.replace(/^@+/, "").replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/_/g, " ").trim();
                return _loadArtistFavs().then(function(list) {
                    var found = null;
                    for (var fi = 0; fi < list.length; fi++) {
                        var key = window.animaArtistNorm ? window.animaArtistNorm(list[fi].tag) : list[fi].tag.replace(/^@+/, "").replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/_/g, " ").toLowerCase();
                        if (key === _an) { found = list[fi]; break; }
                    }
                    if (found && found.thumb) return { thumbUrl: found.thumb, useAdexProxy: false, found: found };
                    return _loadAdexArtistThumb(_anQuery || _an).then(function(adexThumb) {
                        if (adexThumb) return { thumbUrl: adexThumb, useAdexProxy: true, found: found };
                        return found ? { found: found } : {};
                    });
                });
            }
            function renderChips() {
                var gen = ++_renderGen;
                try { if (window.animaKillChipFlyouts) window.animaKillChipFlyouts(); } catch(e) {}
                chipArea.innerHTML = "";
                var tags = getTags();
                if (!tags.length) {
                    chipArea.appendChild($el("span", { textContent: "无标签", className: "anima-chip-empty" }));
                    _syncChipSortLock();
                    return;
                }
                var unknown = tags.filter(function(t) { return !(t in _tlCache) && !(t in _tlMissing); });
                if (unknown.length > 0) {
                    var apiTags = unknown.map(function(t) { return t.replace(/ /g, "_"); });
                    fetch("/danbooru_anima/translate_tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: apiTags }) })
                        .then(function(r) { return r.json(); }).then(function(d) {
                            if (d.success && d.translations) {
                                for (var i = 0; i < unknown.length; i++) {
                                    var orig = unknown[i];
                                    var apiTag = apiTags[i];
                                    var _tv = d.translations[apiTag] || ""; if (_tv) _tlCache[orig] = _tv; else _tlMissing[orig] = 1;
                                }
                            }
                            if (_renderGen === gen) renderChips();
                        }).catch(function() {});
                }
                for (var i = 0; i < tags.length; i++) {
                    (function(ii) {
                        var tag = tags[ii];
                        var _isMerged = tag.indexOf("; ") >= 0;
                        var cn = _tlCache[tag] || "";
                        var col = _tagColor(tag);
                        var _isHidden = _isHiddenTag(tag);
                        var _isSentence = !!_sentenceTags[tag];
                        var _isWide = _isMerged || (_isSentence && tag.length > 40);
                        var _isSelChip = (_batchMode && _batchSelected[String(ii)]) || (_mergeMode && _mergeSelected[String(ii)]);
                        var chip = $el("div", { style: { whiteSpace: _isWide ? "normal" : "nowrap", flexBasis: _isWide ? "100%" : "auto", maxWidth: _isWide ? "none" : "300px", width: _isWide ? "100%" : "auto" } });
                        if (typeof window.animaApplyTagChip === "function") window.animaApplyTagChip(chip, col, { wide: _isWide, merged: _isMerged, sentence: _isSentence, selected: _isSelChip, hidden: _isHidden, pick: (_batchMode || _mergeMode) });
                        else { chip.style.background = col + "22"; chip.style.border = "1px solid " + col + "88"; chip.style.borderLeft = "3px solid " + col; chip.style.borderRadius = "8px"; chip.style.padding = "4px 9px 4px 10px"; chip.style.color = "var(--anima-ink-chip)"; if (_isHidden) { chip.style.opacity = "0.45"; chip.style.filter = "grayscale(0.72)"; } }
                        chip._ci = ii; chip.dataset.ci = ii;
                        chip.style.userSelect = "none";
                        chip._didx = ii;
                        var chipRow = $el("span", { style: { display: "inline-flex", alignItems: "center", gap: "2px" } });
                        if (_batchMode || _mergeMode) {
                            var _selKey = String(ii);
                            var _isSel = _batchMode ? !!_batchSelected[_selKey] : !!_mergeSelected[_selKey];
                            var cb = $el("span", { className: "anima-chip-check", textContent: _isSel ? "☑" : "☐", style: { cursor: "pointer", color: _isSel ? "#e94560" : "#888", fontSize: "13px", marginRight: "2px" } });
                            chipRow.append(cb);
                        }
                        var labelSpan = $el("span", { textContent: window.animaChipLabel ? window.animaChipLabel(tag, _weights[tag], _isMerged) : (_isMerged ? tag.replace(/; /g, ", ") : (_weights[tag] && _weights[tag] !== 1.0 ? "(" + tag + ":" + _weights[tag].toFixed(1) + ")" : tag)), className: "anima-chip-en", style: { cursor: "pointer" } });
                        labelSpan.onmousedown = function(ev) {
                            if (ev.detail !== 2) return;
                            ev.preventDefault();
                            ev.stopPropagation();
                            var oldTag = tags[ii];
                            var rect = labelSpan.getBoundingClientRect();
                            var input = document.createElement("input");
                            input.type = "text";
                            input.value = oldTag;
                            input.style.cssText = "position:fixed;z-index:99999;left:" + rect.left + "px;top:" + rect.top + "px;width:" + Math.max(80, rect.width) + "px;height:" + rect.height + "px;padding:1px 4px;border:1px solid var(--anima-accent-soft);border-radius:3px;background:var(--anima-well);color:#e0e0e0;font-size:11px;outline:none;";
                            document.body.appendChild(input);
                            input.focus();
                            input.select();
                            input.onblur = function() { var val = input.value.trim(); input.remove(); if (val && val !== oldTag) _renameChipTag(oldTag, val, ii); };
                            input.onkeydown = function(ev2) { if (ev2.key === "Enter") { ev2.preventDefault(); input.blur(); } if (ev2.key === "Escape") { ev2.preventDefault(); input.remove(); } };
                        };
                        chipRow.append(labelSpan);
                        chip.appendChild(chipRow);
                        if (cn) { chip.appendChild($el("span", { textContent: cn, className: "anima-chip-cn" })); }
                        var _chipIsArtist = window.animaChipLooksArtist ? window.animaChipLooksArtist(tag, _favArtCache) : (tag.replace(/^\s*\(+/, "").indexOf("@") === 0);
                        if (typeof window.animaBindChipFlyout === "function") {
                            window.animaBindChipFlyout(chip, {
                                rightClick: true,
                                disabled: function(){ return !!_batchMode || !!_mergeMode; },
                                getWeight: function(){ var w = _weights[tag]; return (w != null && isFinite(w)) ? w : 1; },
                                setWeight: function(nw){
                                    nw = window.animaClampWeight ? window.animaClampWeight(nw) : nw;
                                    if (nw == null || !isFinite(nw) || Math.abs(nw-1)<0.01) delete _weights[tag];
                                    else _weights[tag] = nw;
                                    tagTextarea.value = tags.map(function(t) {
                                        return window.animaFmtWeightTag ? window.animaFmtWeightTag(t, _weights[t]) : t;
                                    }).join(", ");
                                    labelSpan.textContent = window.animaChipLabel ? window.animaChipLabel(tag, _weights[tag], _isMerged) : tag;
                                    syncWidget();
                                },
                                isHidden: function(){ return !!_isHiddenTag(tag); },
                                onHide: function(){
                                    if (_hideLock) return;
                                    _hideLock = true;
                                    setTimeout(function(){ _hideLock = false; }, 100);
                                    if (_hiddenTags[tag]) delete _hiddenTags[tag];
                                    else _hiddenTags[tag] = true;
                                    syncWidget(); renderChips(); _saveHidden();
                                },
                                onDelete: function(){
                                    var _rm = getTags()[ii];
                                    if (_rm && _hiddenTags[_rm]) delete _hiddenTags[_rm];
                                    setTags(getTags().filter(function(_, j) { return j !== ii; }));
                                    _saveHidden();
                                },
                                isMerged: function(){ return _isMerged; },
                                onUnmerge: _isMerged ? function(){
                                    var t2 = getTags();
                                    var p2 = tag.split("; ");
                                    t2.splice(ii, 1);
                                    for (var pi = p2.length-1; pi >= 0; pi--) { t2.splice(ii, 0, p2[pi]); }
                                    setTags(t2);
                                } : null,
                                resolveArtist: _chipIsArtist ? function(){ return _resolveArtistForFlyout(tag); } : null,
                                favImgUrl: _favImgUrl,
                                tag: tag,
                                onPin: function(found, btn){
                                    fetch("/danbooru_anima/favorites/star", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag: found.tag, category: "artists"})})
                                    .then(function(r){return r.json();}).then(function(d){
                                        if (d.success) { btn.textContent = animaTxt("★ 已置顶"); btn.className = "anima-flyout-pin is-on"; _favArtCache = null; }
                                        else { btn.textContent = animaTxt("收藏失败"); btn.style.color = "#e94560"; }
                                    }).catch(function(){ btn.textContent = animaTxt("收藏失败"); btn.style.color = "#e94560"; });
                                }
                            });
                        }
                        chip.addEventListener("mousedown", function(e) {
                            if (e.button !== 0) return;
                            if (window.animaKillChipFlyouts) window.animaKillChipFlyouts();
                            if (_batchMode || _mergeMode) {
                                if (chipArea._animaMarqueeBound) return;
                                e.stopImmediatePropagation();
                                if (_batchMode) {
                                    var _k = String(this._didx);
                                    _batchSelected[_k] = !_batchSelected[_k];
                                    if (!_batchSelected[_k]) delete _batchSelected[_k];
                                    _refreshBatchBar(); renderChips(); return;
                                }
                                var _k2 = String(this._didx);
                                _mergeSelected[_k2] = !_mergeSelected[_k2];
                                if (!_mergeSelected[_k2]) delete _mergeSelected[_k2];
                                renderChips(); return;
                            }
                            if (_hiddenTags[tag]) {
                                if (typeof window.animaHiddenChipClickUnhide === "function") {
                                    window.animaHiddenChipClickUnhide(e, function(){
                                        if (_hideLock) return;
                                        if (!_hiddenTags[tag]) return;
                                        _hideLock = true;
                                        setTimeout(function(){ _hideLock = false; }, 100);
                                        delete _hiddenTags[tag];
                                        _saveHidden(); syncWidget(); renderChips();
                                    });
                                }
                                return;
                            }
                            if (chipArea._animaSortable) return;
                            if (typeof window.animaBindLegacyChipDragStart === "function") {
                                window.animaBindLegacyChipDragStart(e, chip, chipArea, {
                                    getIndex: function(){ return chip._didx; },
                                    getTags: getTags,
                                    setTags: setTags
                                });
                            }
                        }, true);
                        chipArea.appendChild(chip);
                    })(i);
                }
                _syncChipSortLock();
            }
            if (typeof window.animaEnsureSortableScript === "function") window.animaEnsureSortableScript();
            if (typeof window.animaBindChipMarquee === "function") {
                window.animaBindChipMarquee(chipArea, {
                    isActive: function(){ return !!_batchMode || !!_mergeMode; },
                    getSelectedIndices: function() {
                        var map = _batchMode ? _batchSelected : _mergeSelected;
                        var out = [];
                        for (var k in map) {
                            if (!map[k]) continue;
                            var n = Number(k);
                            if (isFinite(n)) out.push(n);
                        }
                        return out;
                    },
                    onClickIndex: function(i) {
                        var k = String(i);
                        if (_batchMode) {
                            _batchSelected[k] = !_batchSelected[k];
                            if (!_batchSelected[k]) delete _batchSelected[k];
                            renderChips(); _refreshBatchBar();
                        } else if (_mergeMode) {
                            _mergeSelected[k] = !_mergeSelected[k];
                            if (!_mergeSelected[k]) delete _mergeSelected[k];
                            renderChips();
                        }
                    },
                    onMarqueeIndices: function(ids) {
                        var map = _batchMode ? _batchSelected : _mergeSelected;
                        for (var mi = 0; mi < ids.length; mi++) map[String(ids[mi])] = true;
                        renderChips();
                        if (_batchMode) _refreshBatchBar();
                    },
                    onBatchReorder: function(idxs, restAt) {
                        var t = getTags();
                        var r = window.animaMoveTagsTogether ? window.animaMoveTagsTogether(t, idxs, restAt) : null;
                        if (!r || !r.movedCount) return;
                        var same = r.tags.length === t.length;
                        if (same) {
                            for (var si = 0; si < t.length; si++) { if (r.tags[si] !== t[si]) { same = false; break; } }
                        }
                        var map = {};
                        for (var i = 0; i < r.movedCount; i++) map[String(r.insertAt + i)] = true;
                        if (_batchMode) _batchSelected = map;
                        else _mergeSelected = map;
                        if (same) {
                            renderChips();
                            if (_batchMode) _refreshBatchBar();
                            return;
                        }
                        setTags(r.tags);
                        if (_batchMode) _refreshBatchBar();
                    }
                });
            }
            if (typeof window.animaBindChipSortable === "function") {
                window.animaBindChipSortable(chipArea, {
                    isDisabled: function(){ return !!_batchMode || !!_mergeMode; },
                    onReorder: function(from, to) {
                        var t = getTags();
                        if (from === to || from < 0 || to < 0 || from >= t.length || to >= t.length) return;
                        var it = t.splice(from, 1)[0];
                        t.splice(to, 0, it);
                        setTags(t);
                    }
                });
            }
            // ── 收藏夹弹窗 ──
            var _favPopup = null;
            function openFavPopup() {
            if (!window._dbInputDlg) {
                window._dbInputDlg = function(o){
                    var _ov = document.createElement("div");
                    _ov.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:transparent;z-index:200000;display:flex;align-items:center;justify-content:center;";
                    var _bx = document.createElement("div");
                    _bx.style.cssText = "background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid rgba(var(--anima-accent-rgb),0.3);border-radius:12px;padding:16px;min-width:320px;max-width:80vw;box-shadow:0 8px 32px rgba(0,0,0,0.6);display:flex;flex-direction:column;gap:10px;";
                    var _t = document.createElement("div"); _t.textContent = o.title || ""; _t.style.cssText = "color:var(--anima-accent-soft);font-size:14px;font-weight:bold;"; _bx.appendChild(_t);
                    var _inp = document.createElement("input"); _inp.type = "text"; _inp.value = o.value || ""; _inp.placeholder = o.placeholder || "";
                    _inp.style.cssText = "padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:var(--anima-well);color:#e0e0e0;font-size:13px;outline:none;width:100%;box-sizing:border-box;"; _bx.appendChild(_inp);
                    var _row = document.createElement("div"); _row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";
                    var _cb = document.createElement("button"); _cb.textContent = "\u53d6\u6d88"; _cb.style.cssText = "padding:6px 18px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);cursor:pointer;font-size:12px;background:rgba(255,255,255,0.06);color:var(--anima-mute);"; _cb.onclick = function(){ _ov.remove(); };
                    var _ob = document.createElement("button"); _ob.textContent = "\u786e\u5b9a"; _ob.style.cssText = "padding:6px 18px;border-radius:8px;border:1px solid rgba(var(--anima-accent-rgb),0.5);cursor:pointer;font-size:12px;background:linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi));color:#ffffff;"; _ob.onclick = function(){ _ov.remove(); if (o.onOk) o.onOk(_inp.value); };
                    _row.appendChild(_cb); _row.appendChild(_ob); _bx.appendChild(_row);
                    _ov.appendChild(_bx);
                    if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(_bx);
                    _ov.onmousedown = function(e){ if (e.target === _ov) _ov.remove(); };
                    document.body.appendChild(_ov);
                    _inp.focus(); _inp.select();
                    _inp.onkeydown = function(e){ if (e.key === "Enter") { _ov.remove(); if (o.onOk) o.onOk(_inp.value); } else if (e.key === "Escape") { _ov.remove(); } };
                };
                window._dbConfirmDlg = function(o){
                    var _ov = document.createElement("div");
                    _ov.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:transparent;z-index:200000;display:flex;align-items:center;justify-content:center;";
                    var _bx = document.createElement("div");
                    _bx.style.cssText = "background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid rgba(233,69,96,0.3);border-radius:12px;padding:16px;min-width:320px;max-width:80vw;box-shadow:0 8px 32px rgba(0,0,0,0.6);display:flex;flex-direction:column;gap:10px;";
                    var _t = document.createElement("div"); _t.textContent = o.title || ""; _t.style.cssText = "color:#ffd93d;font-size:14px;font-weight:bold;"; _bx.appendChild(_t);
                    var _m = document.createElement("div"); _m.textContent = o.message || ""; _m.style.cssText = "color:var(--anima-mute);font-size:12px;line-height:1.5;"; _bx.appendChild(_m);
                    var _row = document.createElement("div"); _row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";
                    var _c = document.createElement("button"); _c.textContent = "\u53d6\u6d88"; _c.style.cssText = "padding:6px 18px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);cursor:pointer;font-size:12px;background:rgba(255,255,255,0.06);color:var(--anima-mute);"; _c.onclick = function(){ _ov.remove(); };
                    var _k = document.createElement("button"); _k.textContent = "\u786e\u5b9a"; _k.style.cssText = "padding:6px 18px;border-radius:8px;border:1px solid rgba(233,69,96,0.5);cursor:pointer;font-size:12px;background:linear-gradient(160deg,#3a1a1a 0%,#2a1414 60%,#221010 100%);color:#e94560;"; _k.onclick = function(){ _ov.remove(); if (o.onOk) o.onOk(); };
                    _row.appendChild(_c); _row.appendChild(_k); _bx.appendChild(_row);
                    _ov.appendChild(_bx);
                    if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(_bx);
                    _ov.onmousedown = function(e){ if (e.target === _ov) _ov.remove(); };
                    document.body.appendChild(_ov);
                };
            }
                if (_favPopup) { _favPopup.remove(); _favPopup = null; return; }
                var div = document.createElement('div');
                var _favSize2 = JSON.parse(localStorage.getItem('db_fav_tag_size') || '{"w":480,"h":500}'); _favSize2.w = Math.min(_favSize2.w, window.innerWidth-40); _favSize2.h = Math.min(_favSize2.h, window.innerHeight-40);
                div.style.cssText = 'position:fixed;z-index:99999;width:'+_favSize2.w+'px;height:'+_favSize2.h+'px;min-width:300px;min-height:300px;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid var(--anima-title);border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,0.7);display:flex;flex-direction:column;overflow:auto;resize:both;';
                div.onmouseup = function(){var nw=Math.max(300,div.offsetWidth);var nh=Math.max(300,div.offsetHeight);if(nw!==_favSize2.w||nh!==_favSize2.h){_favSize2.w=nw;_favSize2.h=nh;localStorage.setItem('db_fav_tag_size',JSON.stringify(_favSize2));} localStorage.setItem('db_fav_tag_pos',JSON.stringify({top:parseInt(div.style.top)||0,left:parseInt(div.style.left)||0}));};
                var _savedPos = JSON.parse(localStorage.getItem('db_fav_tag_pos') || '{}');
                div.style.top = Math.max(20, _savedPos.top != null ? _savedPos.top : (window.innerHeight-_favSize2.h)/2)+'px';
                div.style.left = Math.max(20, _savedPos.left != null ? _savedPos.left : (window.innerWidth-_favSize2.w)/2)+'px';
                window.clampPopup(div);
                if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(div);
                var hdr = document.createElement('div');
                hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid var(--anima-title);';
                var _tagMode = 'anima';  // 'anima' | 'noob'
                var _multiMode = false, _multiSelected = [];
                // 弹窗按钮浮光特效（幂等注入）
                (function(){ if (document.getElementById('tp-sheen-css')) return; var _s = document.createElement('style'); _s.id = 'tp-sheen-css'; _s.textContent = '#_multiToggle,#_comboListBtn,#_atToggle,#tp-hide-pin,#tp-pin-fold,.tp-src-tab{transition:transform .15s ease,filter .15s ease,box-shadow .15s ease;cursor:pointer;}#_multiToggle:hover,#_comboListBtn:hover,#_atToggle:hover,#tp-hide-pin:hover,#tp-pin-fold:hover,.tp-src-tab:hover{transform:translateY(-1px);filter:brightness(1.4);box-shadow:0 0 10px rgba(var(--anima-accent-rgb),0.35);text-shadow:0 0 8px rgba(var(--anima-accent-rgb),0.45);}.tp-card{transition:box-shadow .15s ease,border-color .15s ease;}.tp-card:hover{box-shadow:0 0 0 1px rgba(var(--anima-accent-rgb),0.45),0 4px 12px rgba(0,0,0,0.25),0 0 10px rgba(var(--anima-accent-rgb),0.2);}.tp-pin-chip{transition:transform .15s ease,box-shadow .15s ease;}.tp-pin-chip:hover{transform:translateY(-1px);box-shadow:0 0 10px rgba(var(--anima-accent-rgb),0.35);}.tp-tab{color:var(--anima-mute);}.tp-tab:hover{color:var(--anima-accent-soft) !important;background:rgba(var(--anima-accent-rgb),0.08);box-shadow:inset 0 -2px 0 rgba(var(--anima-accent-rgb),0.6);}#_multiToggle,#fav_multi_toggle{cursor:pointer;font-size:12px;margin-left:12px;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:var(--anima-mute);user-select:none;transition:all .15s ease;}#_multiToggle.on,#fav_multi_toggle.on{background:rgba(var(--anima-accent-rgb),0.15);border-color:rgba(var(--anima-accent-rgb),0.5);color:var(--anima-accent-soft);}#_noteToggle{cursor:pointer;font-size:12px;margin-left:8px;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:var(--anima-mute);user-select:none;transition:all .15s ease;}#_noteToggle.on{background:rgba(255,193,7,0.15);border-color:rgba(255,193,7,0.5);color:#ffd93d;}'; document.head.appendChild(_s); })();
                var _curCat = null;
                var _favPage = 1;
                var pagerBar = null;
                var _showCatFn = null;
                var _favData = null;
                var _favSource = 'danbooru';
                hdr.innerHTML = '<span style="color:var(--anima-ink);font-size:13px;">✨ 收藏 tag</span><span id="_multiToggle" style="margin-left:12px;">☐ 多选</span><span id="_noteToggle" style="margin-left:8px;">\u270f\ufe0f \u5907\u6ce8</span><span id="_comboListBtn" style="cursor:pointer;font-size:12px;color:var(--anima-accent-soft);margin-left:8px;">📋 组合</span><span id="_atToggle" style="cursor:pointer;font-size:12px;color:var(--anima-accent-soft);margin-right:auto;margin-left:12px;">🌐 Anima</span><span style="cursor:pointer;color:#e94560;font-size:16px;">✕</span>';
                setTimeout(function(){
                    var atEl = document.getElementById('_atToggle');
                    if(atEl){atEl.onclick=function(){_tagMode=_tagMode==='anima'?'noob':_tagMode==='noob'?'raw':'anima'; var _clrs={anima:'var(--anima-accent-soft)',noob:'#ffab91',raw:'var(--anima-mute)'}; var _lbls={anima:'🌐 Anima',noob:'🌐 Noob',raw:'🔤 原始'}; atEl.style.color=_clrs[_tagMode];atEl.textContent=_lbls[_tagMode];};}
                
                    var multiEl = div.querySelector("#_multiToggle");
                    if(multiEl) multiEl.onclick = function(){
                        _multiMode = !_multiMode;
                        multiEl.classList.toggle('on', _multiMode);
                        multiEl.textContent = _multiMode ? "☑ 多选(0)" : "☐ 多选";
                        if (!_multiMode){ _multiSelected = []; var ftd2 = div.querySelector("#multi-float-save"); if(ftd2) ftd2.style.display = "none"; }
                        if (_curCat && typeof _showCatFn === "function") _showCatFn(_curCat);
                    };
                    var noteEl = div.querySelector("#_noteToggle");
                    if(noteEl) noteEl.onclick = function(){ _noteMode = !_noteMode; noteEl.classList.toggle('on', _noteMode); };
                    var comboBtn = div.querySelector("#_comboListBtn");
                    if (comboBtn) comboBtn.onclick = function(){
                        openArtistComboList();
                    };
                        function openArtistComboList(){
                        var oldPopup = document.getElementById("artist-combo-popup");
                        if (oldPopup) {
                            if (oldPopup._comboUnsub) oldPopup._comboUnsub();
                            oldPopup.remove();
                            return;
                        }
                        var bx = document.createElement("div");
                        bx.id = "artist-combo-popup";
                        bx.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(var(--anima-bg-deep-rgb),.18);border:1px solid var(--anima-title);border-radius:12px;z-index:100000;min-width:360px;min-height:200px;max-width:80vw;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.6);resize:both;overflow:auto;";
                        if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(bx);
                        // 可拖拽 header
                        var hdr2 = document.createElement("div");
                        hdr2.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:move;border-bottom:1px solid var(--anima-title);flex-shrink:0;";
                        hdr2.innerHTML = '<span style="color:var(--anima-ink);font-size:14px;">📋 画师组合</span><span id="combo-close" style="cursor:pointer;color:#e94560;font-size:18px;">✕</span>';
                        hdr2.onmousedown = function(e){ if(e.target.id==="combo-close") return; var rect=bx.getBoundingClientRect(); var dx=e.clientX-rect.left,dy=e.clientY-rect.top; bx.style.top=rect.top+"px"; bx.style.left=rect.left+"px"; bx.style.transform="none"; function mm(ev){ bx.style.left=(ev.clientX-dx)+"px"; bx.style.top=(ev.clientY-dy)+"px"; window.clampPopup(bx); } function mu(){ document.removeEventListener("mousemove",mm); document.removeEventListener("mouseup",mu); } document.addEventListener("mousemove",mm); document.addEventListener("mouseup",mu); };
                        bx.appendChild(hdr2);
                        var body2 = document.createElement("div");
                        body2.style.cssText = "flex:1;overflow-y:auto;padding:12px 16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;align-content:flex-start;";
                        function renderComboList(){
                            body2.innerHTML = "";
                            try { var combos = JSON.parse(localStorage.getItem("danbooru_artist_combos")||"[]"); } catch(e) { combos = []; }
                            if (!combos.length) { body2.innerHTML = '<div style="color:var(--anima-mute);text-align:center;padding:20px;">暂无保存的组合</div>'; }
                            combos.forEach(function(combo, ci){
                                var row = document.createElement("div");
                                row.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px;border-radius:8px;background:rgba(255,255,255,0.03);cursor:pointer;text-align:center;";
                                row.onmouseover = function(){ this.style.background="rgba(255,255,255,0.06)"; };
                                row.onmouseout = function(){ this.style.background="rgba(255,255,255,0.03)"; };
                                row.onclick = function(){
                                    (combo.artists||[]).forEach(function(a){ _insertTag(a); });
                                };
                                // 缩略图
                                if (combo.thumbs && combo.thumbs.length) {
                                    var tn = document.createElement("img");
                                    tn.src = window.animaFavGrid ? window.animaFavGrid.proxySrc(combo.thumbs[0], "danbooru", false) : (String(combo.thumbs[0]).indexOf("/danbooru_anima/combo_thumb/") >= 0 ? combo.thumbs[0] : ("/danbooru_anima/image_proxy?url="+encodeURIComponent(combo.thumbs[0])));
                                    tn.style.cssText = "width:100%;aspect-ratio:1/1;border-radius:6px;object-fit:cover;";
                                    tn.onerror = function(){ this.style.display="none"; };
                                    row.appendChild(tn);
                                }
                                var nm2 = document.createElement("span");
                                nm2.textContent = ci+1+". "+combo.name; nm2.style.cssText = "color:#e0e0e0;font-size:12px;min-width:80px;";
                                row.appendChild(nm2);
                                var tags2 = document.createElement("span");
                                tags2.textContent = (combo.artists||[]).join(" + "); tags2.style.cssText = "color:var(--anima-accent-soft);font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
                                row.appendChild(tags2);
                                var delBtn = document.createElement("span");
                                delBtn.textContent = "🗑"; delBtn.title = animaTxt("删除"); delBtn.style.cssText = "cursor:pointer;color:#e94560;font-size:14px;";
                                delBtn.onclick = (function(idx2){ return function(e){ e.stopPropagation(); combos.splice(idx2,1); if (window.animaPublishArtistCombos) window.animaPublishArtistCombos(combos); else localStorage.setItem("danbooru_artist_combos", JSON.stringify(combos)); renderComboList(); }; })(ci);
                                row.appendChild(delBtn);
                                body2.appendChild(row);
                            });
                        }
                        renderComboList();
                        function onComboStore(ev) {
                            if (ev && ev.type === "storage" && ev.key !== "danbooru_artist_combos") return;
                            if (!document.body.contains(bx)) { unsubComboStore(); return; }
                            renderComboList();
                        }
                        function unsubComboStore() {
                            window.removeEventListener("storage", onComboStore);
                            window.removeEventListener("anima-artist-combos", onComboStore);
                        }
                        window.addEventListener("storage", onComboStore);
                        window.addEventListener("anima-artist-combos", onComboStore);
                        bx._comboUnsub = unsubComboStore;
                        bx.appendChild(body2);
                        document.body.appendChild(bx);
                        bx.querySelector("#combo-close").onclick = function(){ unsubComboStore(); bx.remove(); };
                    }
                },0);
                hdr.onmousedown = function(e){var dx=e.clientX-div.offsetLeft,dy=e.clientY-div.offsetTop;function mm(ev){div.style.left=(ev.clientX-dx)+'px';div.style.top=(ev.clientY-dy)+'px'}function mu(){document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);localStorage.setItem('db_fav_tag_pos',JSON.stringify({top:parseInt(div.style.top)||0,left:parseInt(div.style.left)||0}));}document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);};
                hdr.lastChild.onclick = function(){div.remove();_favPopup=null;};
                div.appendChild(hdr);
                // D/G source toggle
                var srcBar2 = document.createElement('div');
                srcBar2.style.cssText = 'display:flex;gap:0;padding:4px 12px;border-bottom:1px solid var(--anima-title);flex-shrink:0;';
                ['danbooru','gelbooru'].forEach(function(sk,i){
                    var tb2 = document.createElement('span');
                    tb2.textContent = sk==='danbooru'?'D站':'G站';
                    tb2.style.cssText = 'flex:1;padding:4px;text-align:center;cursor:pointer;font-size:11px;font-weight:bold;border-radius:4px;'+(i===0?'background:var(--anima-title);color:var(--anima-accent-soft);':'background:transparent;color:var(--anima-mute);');
                    tb2.onclick = function(){
                        _favSource = sk;
                        Array.from(srcBar2.children).forEach(function(b,j){b.style.background=j===i?'var(--anima-title)':'transparent';b.style.color=j===i?'var(--anima-accent-soft)':'var(--anima-mute)';});
                        _favData = null;
                        _multiSelected = []; var ftd3 = div.querySelector("#multi-float-save"); if(ftd3) ftd3.style.display = "none"; var me3 = div.querySelector("#_multiToggle"); if(me3) { me3.textContent = "\u2610 \u591a\u9009"; me3.classList.remove('on'); }
                        _favPage = 1;
                        loadFavs();
                    };
                    srcBar2.appendChild(tb2);
                });
                div.appendChild(srcBar2);
                var tabBar = document.createElement('div');
                tabBar.style.cssText = 'display:flex;border-bottom:1px solid #222;flex-shrink:0;';
                div.appendChild(tabBar);
                var pinnedBar = document.createElement("div");
                pinnedBar.style.cssText = "display:none;flex-wrap:wrap;gap:6px;padding:0 12px 0;margin-bottom:4px;min-height:0;flex-shrink:0;border-bottom:1px solid rgba(var(--anima-accent-rgb),.25);align-items:flex-start;position:relative;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(var(--anima-accent-rgb),0.35) transparent;";
                // 隐藏置顶开关状态（localStorage 持久化，全局共享）
                var _hidePinned = localStorage.getItem('tp_hide_pinned') === '1';
                // 置顶栏折叠状态
                var _pinCollapsed = localStorage.getItem('tp_pin_collapsed') === '1';
                var _pinRows = Math.min(8, Math.max(1, parseInt(localStorage.getItem('tp_pin_rows') || '1', 10) || 1));
                var _pinPage = 1;
                var _pinPageSize = 48;
                var _pinOrderFull = [];
                var _pinSort = "rate";
                try {
                    var _pinSortSaved = localStorage.getItem("tp_pin_sort") || "";
                    if (_pinSortSaved === "rate" || _pinSortSaved === "rate_asc" || _pinSortSaved === "new" || _pinSortSaved === "old" || _pinSortSaved === "name" || _pinSortSaved === "manual") _pinSort = _pinSortSaved;
                } catch (ePs) {}
                var _pinSortFull = { rate: "高分在前", rate_asc: "低分在前", "new": "最新加入", old: "最早加入", name: "按名称", manual: "手动顺序" };
var _pinEnsureResize = function(){
    if (pinnedBar.querySelector('#tp-pin-resize')) return;
    var _pr = document.createElement("div");
    _pr.id = "tp-pin-resize";
    _pr.style.cssText = "position:sticky;bottom:0;left:0;width:100%;height:8px;cursor:ns-resize;z-index:6;user-select:none;border-radius:0 0 8px 8px;transition:background 0.15s;flex-shrink:0;background:rgba(var(--anima-well-rgb),0.92);";
    _pr.innerHTML = '<div style="position:absolute;left:30%;right:30%;top:2px;height:3px;border-radius:3px;background:rgba(var(--anima-accent-rgb),0.55);box-shadow:0 0 8px rgba(var(--anima-accent-rgb),0.4);"></div>';
    _pr.onmouseenter = function(){ _pr.style.background = "rgba(var(--anima-accent-rgb),0.18)"; };
    _pr.onmouseleave = function(){ _pr.style.background = ""; };
    _pr.onmousedown = function(e){
        e.preventDefault(); e.stopPropagation();
        var _sy = e.clientY, _sh = pinnedBar.offsetHeight || (_pinHeadC + _pinRows * _pinRowH - 6 + 8);
        var _chips = pinnedBar.querySelectorAll('.tp-pin-chip');
        for (var _ci = 0; _ci < _chips.length; _ci++) _chips[_ci].style.transition = "none";
        var _raf = null;
        var _mv = function(ev){
            var _dy = ev.clientY - _sy;
            if (_raf) return;
            _raf = requestAnimationFrame(function(){
                _raf = null;
                pinnedBar.style.maxHeight = Math.max(54, _sh + _dy) + "px";
            });
        };
        var _up = function(){
            if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
            try { localStorage.setItem('tp_pin_h', String(pinnedBar.offsetHeight)); } catch(e2){}
            _pinRows = Math.min(8, Math.max(1, Math.round((pinnedBar.offsetHeight - _pinHeadC - 8) / _pinRowH)));
            _pinApplyHeight();
            for (var _ci2 = 0; _ci2 < _chips.length; _ci2++) _chips[_ci2].style.transition = "";
            var _rbtn = pinnedBar.querySelector('#tp-pin-rows-btn');
            if (_rbtn) _rbtn.textContent = '\u{1f4d0} ' + _pinRows + ' \u884c \u25be';
            try { localStorage.setItem('tp_pin_rows', String(_pinRows)); } catch(e2){}
            document.removeEventListener("mousemove", _mv);
            document.removeEventListener("mouseup", _up);
        };
        document.addEventListener("mousemove", _mv);
        document.addEventListener("mouseup", _up);
    };
    pinnedBar.appendChild(_pr);
};
var _pinHeadC = 30, _pinRowH = 56, _pinFullH = 200;
var _pinApplyHeight = function(){
    _pinEnsureResize();
    pinnedBar.style.maxHeight = "none";
    _pinFullH = pinnedBar.scrollHeight || 200;
    var _cs2 = pinnedBar.querySelectorAll('.tp-pin-chip');
    var _rows = Math.min(8, Math.max(1, _pinRows));
    var _target = Math.max(54, _pinFullH - 1);
    if (_cs2.length) {
        var _pb = pinnedBar.getBoundingClientRect();
        var _ptop = 6;
        try { _ptop = parseFloat(getComputedStyle(pinnedBar).paddingTop) || 6; } catch(e){}
        var _rowTops = [];
        var _pt = null;
        for (var _i4 = 0; _i4 < _cs2.length; _i4++) {
            var _t4 = _cs2[_i4].getBoundingClientRect().top;
            if (_pt === null || _t4 > _pt + 2) { _rowTops.push(_t4); _pt = _t4; }
        }
        _pinHeadC = Math.max(20, _rowTops[0] - _pb.top - _ptop);
        if (_rowTops.length >= 2) _pinRowH = _rowTops[1] - _rowTops[0];
        else _pinRowH = Math.round(_cs2[0].getBoundingClientRect().height) + 6;
        if (_rowTops.length > _rows) {
            _target = Math.max(54, (_rowTops[_rows] - _pb.top - _ptop) - 6 + 8 - 1);
        }
    }
    var _savedH = parseInt(localStorage.getItem('tp_pin_h') || '0', 10);
    if (_savedH >= 54) { pinnedBar.style.maxHeight = Math.min(_pinFullH, _savedH) + "px"; return; }
    pinnedBar.style.maxHeight = _target + "px";
};
                // SortableJS 本地注入（拖拽排序）
                (function(){if(window.Sortable)return;if(document.getElementById("tp-sortable-js"))return;var s=document.createElement("script");s.id="tp-sortable-js";s.src=window.animaAsset("sortable.min.js");document.head.appendChild(s);})();
                div.appendChild(pinnedBar);
                var folderBar = document.createElement("div");
                folderBar.style.cssText = "display:none;gap:6px;padding:4px 12px;border-bottom:1px solid rgba(var(--anima-accent-rgb),.25);flex-shrink:0;overflow-x:auto;white-space:nowrap;align-items:center;";
                div.appendChild(folderBar);
                // 置顶栏拖拽排序（SortableJS，一次初始化）
                setTimeout(function(){
                    try {
                        if (window.Sortable && pinnedBar && !pinnedBar._sortable) {
                            pinnedBar._sortable = Sortable.create(pinnedBar, {
                                animation: 150,
                                draggable: ".tp-pin-chip",
                                chosenClass: "tp-sortable-chosen",
                                ghostClass: "tp-sortable-ghost",
                                onStart: function() { window.__animaChipDragging = true; },
                                onEnd: function() {
                                    window.__animaChipDragging = false;
                                    try {
                                        var visible = [];
                                        pinnedBar.querySelectorAll(".tp-pin-chip").forEach(function(ch){ if (ch.dataset && ch.dataset.tag) visible.push(ch.dataset.tag); });
                                        var full = _pinOrderFull || [];
                                        var start = (_pinPage - 1) * _pinPageSize;
                                        var order = full.length ? full.slice(0, start).concat(visible).concat(full.slice(start + _pinPageSize)) : visible;
                                        localStorage.setItem('tp_pin_order', JSON.stringify(order));
                                        if (typeof _showCatFn === "function" && _curCat) _showCatFn(_curCat);
                                    } catch(e){}
                                }
                            });
                        }
                    } catch(e){}
                }, 300);
                // 悬窗（置顶 chip hover 大图）
                var hoverPop = document.createElement("div");
                hoverPop.style.cssText = "display:none;position:fixed;z-index:100004;pointer-events:none;border-radius:8px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.15);";
                var hoverImg = document.createElement("img");
                hoverImg.style.cssText = "width:280px;height:280px;object-fit:contain;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);";
                hoverPop.appendChild(hoverImg);
                document.body.appendChild(hoverPop);
                var body = document.createElement('div');
                body.style.cssText = 'flex:1;overflow-y:auto;padding:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:6px;align-content:start;min-width:0;';
                body.innerHTML = '<div style="color:var(--anima-mute);padding:20px;text-align:center;">加载中...</div>';
                var floatSaveDiv = document.createElement("div");
                floatSaveDiv.id = "multi-float-save";
                floatSaveDiv.style.cssText = "display:none;position:absolute;bottom:12px;right:12px;z-index:10;";
                var floatBtn = document.createElement("button");
                floatBtn.textContent = animaTxt("💾 保存组合");
                floatBtn.style.cssText = "padding:10px 20px;border-radius:10px;border:1px solid rgba(var(--anima-accent-rgb),0.35);cursor:pointer;font-size:13px;background:linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi));color:#ffffff;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.4);pointer-events:auto;transition:all .15s ease;";
                floatBtn.onmouseover = function(){ this.style.background="#21463c"; this.style.transform="translateY(-1px)"; };
                floatBtn.onmouseout = function(){ this.style.background="var(--anima-title)"; this.style.transform=""; };
                floatBtn.onclick = function(){
                    var mini = document.createElement("div");
                    mini.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid rgba(var(--anima-accent-rgb),0.3);border-radius:10px;padding:14px;z-index:100001;display:flex;flex-direction:column;gap:8px;min-width:300px;box-shadow:0 4px 16px rgba(0,0,0,0.6);";
                    floatSaveDiv.appendChild(mini);
                    mini.innerHTML = '<span style="color:var(--anima-accent-soft);font-size:14px;font-weight:bold;">💾 保存画师组合</span><span style="color:var(--anima-mute);font-size:11px;">组合名称（不影响实际输出标签）</span>';
                    var miniInp = document.createElement("input");
                    miniInp.type = "text"; miniInp.placeholder = animaTxt("组合名称"); miniInp.value = _multiSelected.slice(0,3).join("+");
                    miniInp.style.cssText = "padding:6px 10px;border-radius:6px;border:1px solid rgba(var(--anima-accent-rgb),0.3);background:var(--anima-input);color:#e0e0e0;font-size:12px;outline:none;";
                    mini.appendChild(miniInp);
                    var miniRow = document.createElement("div");
                    miniRow.style.cssText = "display:flex;gap:6px;justify-content:flex-end;";
                    var miniCancel = document.createElement("button");
                    miniCancel.textContent = animaTxt("取消"); miniCancel.style.cssText = "padding:5px 12px;border-radius:6px;border:1px solid var(--anima-title);background:transparent;color:var(--anima-mute);cursor:pointer;font-size:11px;transition:all .15s ease;";
                    miniCancel.onclick = function(){ mini.remove(); };
                    var miniSave = document.createElement("button");
                    miniSave.textContent = animaTxt("💾 保存"); miniSave.style.cssText = "padding:5px 14px;border-radius:6px;border:1px solid rgba(var(--anima-accent-rgb),0.35);cursor:pointer;font-size:11px;background:linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi));color:#ffffff;font-weight:bold;transition:all .15s ease;";
                    miniSave.onmouseover = function(){ this.style.background = "#21463c"; this.style.transform = "translateY(-1px)"; };
                    miniSave.onmouseout = function(){ this.style.background = "var(--anima-title)"; this.style.transform = ""; };
                    miniSave.onclick = function(){
                        var nm = miniInp.value.trim() || _multiSelected.slice(0,3).join("+");
                        try { var combos = JSON.parse(localStorage.getItem("danbooru_artist_combos")||"[]"); } catch(e) { combos = []; }
                        var artists = _multiSelected.map(function(t){ return (_curCat==="artists" && !t.startsWith("@")) ? "@"+t : t; });
                        // 取第一个画师的缩略图
                        var thumbs = [];
                        try { if (_multiSelected.length>0) { var info = _favData[_curCat] && _favData[_curCat][_multiSelected[0]]; if (info && info.thumb) thumbs.push(info.thumb); } } catch(e) {}
                        combos.push({name: nm, artists: artists, thumbs: thumbs});
                        if (window.animaPublishArtistCombos) window.animaPublishArtistCombos(combos);
                        else localStorage.setItem("danbooru_artist_combos", JSON.stringify(combos));
                        mini.remove(); _multiMode = false; _multiSelected = [];
                        var multiEl4 = document.getElementById("_multiToggle");
                        if(multiEl4){ multiEl4.classList.remove('on'); multiEl4.textContent = animaTxt("☐ 多选"); }
                        floatSaveDiv.style.display = "none";
                        if (_curCat && typeof _showCatFn === "function") _showCatFn(_curCat);
                    };
                    miniRow.appendChild(miniCancel); miniRow.appendChild(miniSave); mini.appendChild(miniRow);
                };
                floatSaveDiv.appendChild(floatBtn);
                var _activeFolder = '__uncat';
                var _folderPickMenu = function(x, y, onPick) {
                    var _fld0 = (_favData && _favData._folders && _favData._folders.artists) || {};
                    var _menu = document.createElement("div");
                    _menu.style.cssText = "position:fixed;left:" + x + "px;top:" + y + "px;background:var(--anima-bg);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:4px;z-index:100100;min-width:150px;max-height:300px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.6);";
                    var _mi = function(t, cb) { var _d = document.createElement("div"); _d.textContent = t; _d.style.cssText = "padding:6px 12px;cursor:pointer;color:var(--anima-mute);font-size:12px;border-radius:4px;"; _d.onmouseenter = function(){ _d.style.background = "var(--anima-bg)"; }; _d.onmouseleave = function(){ _d.style.background = ""; }; _d.onclick = function(){ _menu.remove(); document.removeEventListener("mousedown", _cm); cb(); }; _menu.appendChild(_d); };
                    _mi("\ud83d\udcc2 \u672a\u5206\u7c7b", function(){ onPick('__uncat'); });
                    for (var _fn0 in _fld0) { if (_fn0 === "__tmp") continue; (function(_nm0){ _mi("\ud83d\udcc1 " + _nm0, function(){ onPick(_nm0); }); })(_fn0); }
                    document.body.appendChild(_menu);
                    var _cm = function(ev){ if (!_menu.contains(ev.target)) { _menu.remove(); document.removeEventListener("mousedown", _cm); } };
                    setTimeout(function(){ document.addEventListener("mousedown", _cm); }, 0);
                };
                var _moveOneArtist = function(e, tag) {
                    e.preventDefault(); e.stopPropagation();
                    if (hoverPop) hoverPop.style.display = "none";
                    if (_favSource !== "danbooru") { alert("\u6587\u4ef6\u5939\u5206\u7c7b\u4ec5\u652f\u6301 D\u7ad9\u6536\u85cf"); return; }
                    if (!tag) return;
                    _folderPickMenu(e.clientX, e.clientY, function(_tgt){
                        var _keys = [tag];
                        var _body = _tgt === '__uncat'
                            ? JSON.stringify({action:"remove_from_all",category:"artists",item_keys:_keys})
                            : JSON.stringify({action:"move",category:"artists",item_keys:_keys,target_folder:_tgt});
                        fetch("/danbooru_anima/favorites/folder", {method:"POST",headers:{"Content-Type":"application/json"},body:_body})
                        .then(function(r){return r.json();}).then(function(d){ if (d.success) loadFavs(); else alert(d.error || "\u79fb\u52a8\u5931\u8d25"); });
                    });
                };
                var _noteMode = false;
                var setArtistNote = function(_tag2){
                    if (_favSource !== "danbooru") { alert("\u5907\u6ce8\u4ec5\u652f\u6301 D\u7ad9\u6536\u85cf"); return; }
                    var _cur2 = (_favData && _favData.artists && _favData.artists[_tag2] && _favData.artists[_tag2].note) || "";
                    window._dbInputDlg({title:"\u5907\u6ce8\u540d", placeholder:"\u7559\u7a7a\u5373\u6e05\u9664", value:_cur2, onOk:function(_nn){
                    fetch("/danbooru_anima/favorites/note", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag:_tag2, category:"artists", note:_nn.trim()})})
                    .then(function(r){return r.json();}).then(function(d){ if (d.success) loadFavs(); else alert(d.error || "\u8bbe\u7f6e\u5931\u8d25"); });
                    }});
                };
                var floatMoveBtn = document.createElement("button");
                floatMoveBtn.textContent = "\ud83d\udcc1 \u79fb\u52a8";
                floatMoveBtn.style.cssText = "padding:10px 20px;border-radius:10px;border:1px solid rgba(var(--anima-accent-rgb),0.35);cursor:pointer;font-size:13px;background:linear-gradient(160deg,var(--anima-title) 0%,var(--anima-well) 60%,var(--anima-well) 100%);color:var(--anima-accent-soft);font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.4);pointer-events:auto;transition:all .15s ease;margin-left:8px;";
                floatMoveBtn.onmouseover = function(){ this.style.background="var(--anima-title)"; this.style.transform="translateY(-1px)"; };
                floatMoveBtn.onmouseout = function(){ this.style.background="var(--anima-title)"; this.style.transform=""; };
                floatMoveBtn.onclick = function(e){
                    if (_favSource !== "danbooru") { alert("\u6587\u4ef6\u5939\u5206\u7c7b\u4ec5\u652f\u6301 D\u7ad9\u6536\u85cf"); return; }
                    _folderPickMenu(e.clientX, e.clientY, function(_tgt){
                        var _keys = _multiSelected.slice();
                        if (!_keys.length) return;
                        var _body = _tgt === '__uncat'
                            ? JSON.stringify({action:"remove_from_all",category:"artists",item_keys:_keys})
                            : JSON.stringify({action:"move",category:"artists",item_keys:_keys,target_folder:_tgt});
                        fetch("/danbooru_anima/favorites/folder", {method:"POST",headers:{"Content-Type":"application/json"},body:_body})
                        .then(function(r){return r.json();}).then(function(d){ if (d.success) { _multiSelected = []; var _ftd2 = div.querySelector("#multi-float-save"); if(_ftd2) _ftd2.style.display = "none"; var _me2 = div.querySelector("#_multiToggle"); if(_me2) _me2.textContent = "\u2610 \u591a\u9009"; loadFavs(); } else alert(d.error || "\u79fb\u52a8\u5931\u8d25"); });
                    });
                };
                floatSaveDiv.appendChild(floatMoveBtn);
                div.appendChild(floatSaveDiv);
                if (window.animaFavGrid) window.animaFavGrid.mountBar(div, { getGrid: function(){ return body; }, onSort: function(){ _favPage = 1; if (_curCat && typeof _showCatFn === "function") _showCatFn(_curCat, {reset:true, gridOnly:true}); } });
                div.appendChild(body);
                pagerBar = window.animaFavGrid ? window.animaFavGrid.mountPager(div, { onPage: function(p){ _favPage = p; if (_curCat && typeof _showCatFn === "function") _showCatFn(_curCat, {top:true, gridOnly:true}); } }) : null;
                document.body.appendChild(div);
                _favPopup = div;
                function loadFavs(){
                    var favUrl = _favSource === 'danbooru' ? '/danbooru_anima/favorites?cats=artists,characters,series,general' : '/gelbooru_anima/favorites?cats=artists,characters,series,general';
                    fetch(favUrl).then(function(r){return r.json();}).then(function(d){
                    if(!d.success){body.innerHTML='<div class="fav-empty" style="color:#e94560;padding:20px;grid-column:1/-1;">加载失败</div>'; if (window.animaFavGrid) window.animaFavGrid.finish(body); return;}
                    var favs = d.favorites || {};
                    _favData = favs;
                    var cats = ['artists','characters','series','general'];
                    var catNames = {'artists':'🎨 画师','characters':'👤 角色','series':'📺 系列','general':'🏷 通用'};
                    var _folderPickMenu = function(x, y, onPick) {
                        var _fld0 = (_favData && _favData._folders && _favData._folders.artists) || {};
                        var _menu = document.createElement("div");
                        _menu.style.cssText = "position:fixed;left:" + x + "px;top:" + y + "px;background:var(--anima-bg);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:4px;z-index:100100;min-width:150px;max-height:300px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.6);";
                        var _mi = function(t, cb) { var _d = document.createElement("div"); _d.textContent = t; _d.style.cssText = "padding:6px 12px;cursor:pointer;color:var(--anima-mute);font-size:12px;border-radius:4px;"; _d.onmouseenter = function(){ _d.style.background = "var(--anima-bg)"; }; _d.onmouseleave = function(){ _d.style.background = ""; }; _d.onclick = function(){ _menu.remove(); document.removeEventListener("mousedown", _cm); cb(); }; _menu.appendChild(_d); };
                        _mi("\ud83d\udcc2 \u672a\u5206\u7c7b", function(){ onPick('__uncat'); });
                        for (var _fn0 in _fld0) { if (_fn0 === "__tmp") continue; (function(_nm0){ _mi("\ud83d\udcc1 " + _nm0, function(){ onPick(_nm0); }); })(_fn0); }
                        document.body.appendChild(_menu);
                        var _cm = function(ev){ if (!_menu.contains(ev.target)) { _menu.remove(); document.removeEventListener("mousedown", _cm); } };
                        setTimeout(function(){ document.addEventListener("mousedown", _cm); }, 0);
                    };
                    function _renderFolderBar() {
                        folderBar.innerHTML = "";
                        var _fld = (_favData && _favData._folders && _favData._folders.artists) || {};
                        var _allIn = new Set();
                        for (var _fn in _fld) { if (_fn === "__tmp") continue; (_fld[_fn] || []).forEach(function(k){ _allIn.add(k); }); }
                        var _uncat = Object.keys((_favData && _favData.artists) || {}).filter(function(k){ return k !== "_order" && !_allIn.has(k); });
                        var _mkChip = function(text, sel, onClick, onCtx) {
                            var _c = document.createElement("span");
                            _c.textContent = text;
                            _c.style.cssText = "padding:2px 10px;border-radius:999px;cursor:pointer;font-size:11px;white-space:nowrap;user-select:none;border:1px solid " + (sel ? "rgba(var(--anima-accent-rgb),0.5)" : "rgba(255,255,255,0.1)") + ";background:" + (sel ? "rgba(var(--anima-accent-rgb),0.15)" : "rgba(255,255,255,0.04)") + ";color:" + (sel ? "var(--anima-accent-soft)" : "var(--anima-mute)") + ";";
                            _c.onclick = onClick;
                            if (onCtx) _c.oncontextmenu = onCtx;
                            return _c;
                        };
                        folderBar.appendChild(_mkChip("\ud83d\udcc2 \u672a\u5206\u7c7b (" + _uncat.length + ")", _activeFolder === '__uncat', function(){ _activeFolder = '__uncat'; showCategory(_curCat, {reset:true}); }));
                        for (var _fn2 in _fld) {
                            if (_fn2 === "__tmp") continue;
                            (function(_nm){
                                var _cnt = (_fld[_nm] || []).length;
                                folderBar.appendChild(_mkChip("\ud83d\udcc1 " + _nm + " (" + _cnt + ")", _activeFolder === _nm, function(){ _activeFolder = _nm; showCategory(_curCat, {reset:true}); }, function(e){
                                    e.preventDefault(); e.stopPropagation();
                                    var _menu2 = document.createElement("div");
                                    _menu2.style.cssText = "position:fixed;left:" + e.clientX + "px;top:" + e.clientY + "px;background:var(--anima-bg);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:4px;z-index:100101;min-width:130px;box-shadow:0 8px 24px rgba(0,0,0,0.6);";
                                    var _mi2 = function(t, cb) { var _d2 = document.createElement("div"); _d2.textContent = t; _d2.style.cssText = "padding:6px 12px;cursor:pointer;color:var(--anima-mute);font-size:12px;border-radius:4px;"; _d2.onmouseenter = function(){ _d2.style.background = "var(--anima-bg)"; }; _d2.onmouseleave = function(){ _d2.style.background = ""; }; _d2.onclick = function(){ _menu2.remove(); document.removeEventListener("mousedown", _cm2); cb(); }; _menu2.appendChild(_d2); };
                                    _mi2("\u270f\ufe0f \u91cd\u547d\u540d", function(){
                                        window._dbInputDlg({title:"\u91cd\u547d\u540d", value:_nm, onOk:function(_nn){
                                        if (_nn && _nn.trim() && _nn !== _nm) {
                                            fetch("/danbooru_anima/favorites/folder", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"rename",category:"artists",name:_nm,new_name:_nn.trim()})})
                                            .then(function(r){return r.json();}).then(function(d){ if (d.success) { if (_activeFolder === _nm) _activeFolder = _nn.trim(); loadFavs(); } else alert(d.error || "\u91cd\u547d\u540d\u5931\u8d25"); });
                                        }
                                        }});
                                    });
                                    _mi2("\ud83d\uddd1 \u5220\u9664", function(){
                                        window._dbConfirmDlg({title:"\u5220\u9664\u6587\u4ef6\u5939", message:"\u5220\u9664\u6587\u4ef6\u5939\u300c" + _nm + "\u300d\uff1f\u91cc\u9762\u7684\u753b\u5e08\u5c06\u56de\u5230\u672a\u5206\u7c7b\u3002", onOk:function(){
                                        fetch("/danbooru_anima/favorites/folder", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"delete",category:"artists",name:_nm})})
                                        .then(function(r){return r.json();}).then(function(d){ if (d.success) { if (_activeFolder === _nm) _activeFolder = '__uncat'; loadFavs(); } else alert(d.error || "\u5220\u9664\u5931\u8d25"); });
                                        }});
                                    });
                                    document.body.appendChild(_menu2);
                                    var _cm2 = function(ev){ if (!_menu2.contains(ev.target)) { _menu2.remove(); document.removeEventListener("mousedown", _cm2); } };
                                    setTimeout(function(){ document.addEventListener("mousedown", _cm2); }, 0);
                                }));
                            })(_fn2);
                        }
                        var _addC = document.createElement("span");
                        _addC.textContent = "\uff0b \u65b0\u5efa";
                        _addC.style.cssText = "padding:2px 10px;border-radius:999px;cursor:pointer;font-size:11px;white-space:nowrap;user-select:none;border:1px dashed rgba(var(--anima-accent-rgb),0.4);color:var(--anima-accent-soft);background:rgba(var(--anima-accent-rgb),0.06);";
                        _addC.onclick = function(){
                            window._dbInputDlg({title:"\u65b0\u5efa\u6587\u4ef6\u5939", placeholder:"\u6587\u4ef6\u5939\u540d\u79f0", onOk:function(_nm){
                            if (_nm && _nm.trim()) {
                                fetch("/danbooru_anima/favorites/folder", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"create",category:"artists",name:_nm.trim()})})
                                .then(function(r){return r.json();}).then(function(d){ if (d.success) { _activeFolder = _nm.trim(); loadFavs(); } else alert(d.error || "\u521b\u5efa\u5931\u8d25"); });
                            }
                            }});
                        };
                        folderBar.appendChild(_addC);
                    }
                    function _paintFavMulti(tag) {
                        var sel = _multiSelected.indexOf(tag) >= 0;
                        var i, el, cards = body.querySelectorAll(".tp-card");
                        for (i = 0; i < cards.length; i++) {
                            el = cards[i];
                            if (!el.dataset || el.dataset.tag !== tag) continue;
                            el.style.border = sel ? "2px solid var(--anima-accent-soft)" : "1px solid rgba(255,255,255,.08)";
                            el.style.background = sel ? "rgba(var(--anima-title-rgb),.42)" : "rgba(var(--anima-well-rgb),.22)";
                        }
                        var chips = pinnedBar.querySelectorAll(".tp-pin-chip");
                        for (i = 0; i < chips.length; i++) {
                            el = chips[i];
                            if (!el.dataset || el.dataset.tag !== tag) continue;
                            el.style.border = sel ? "1px solid var(--anima-accent-soft)" : "1px solid rgba(255,255,255,0.08)";
                            el.style.background = sel ? "rgba(var(--anima-accent-rgb),0.15)" : "rgba(255,255,255,0.04)";
                        }
                    }
                    function showCategory(cat, opt) {
                        opt = opt || {};
                        var items = favs[cat] || {};
                        if (!opt.keepGrid) {
                            var _keepY = body.scrollTop || 0;
                            if (opt.reset) { _favPage = 1; _keepY = 0; }
                            if (opt.top) _keepY = 0;
                            _curCat = cat;
                            pinnedBar.style.display = (cat === 'artists') ? 'flex' : 'none';
                            folderBar.style.display = (cat === 'artists') ? 'flex' : 'none';
                            if (cat === 'artists' && !opt.gridOnly) _renderFolderBar();
                            if (!opt.gridOnly) {
                                body.innerHTML = '';
                                body._favCardPool = {};
                            }
                            if (window.animaFavGrid) window.animaFavGrid.applyGrid(body);
                        }
                        // ── 置顶栏（artists 分类）──
                        if (cat === 'artists' && !opt.gridOnly) {
                            pinnedBar.innerHTML = '<div id="tp-pin-head" style="position:sticky;top:0;z-index:5;display:flex;align-items:center;flex-wrap:wrap;width:100%;min-width:0;flex-shrink:0;gap:6px;padding-top:6px;background:rgba(var(--anima-bg-deep-rgb),.42);"><span id="tp-hide-pin" title="开启后隐藏列表中的已收藏画师" style="cursor:pointer;font-size:12px;width:24px;height:24px;line-height:22px;text-align:center;border-radius:50%;user-select:none;margin-right:6px;flex-shrink:0;' + (_hidePinned ? 'background:rgba(var(--anima-accent-rgb),0.18);border:1px solid rgba(var(--anima-accent-rgb),0.4);color:var(--anima-accent-soft);' : 'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:var(--anima-mute);') + '">' + (_hidePinned
                            ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6"/><path d="M4.5 16.5L8 13M19.5 16.5L16 13"/></svg>'
                            : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/></svg>') + '</span>' + '<span style="color:#ffd93d;font-size:10px;font-weight:600;margin-right:4px;white-space:nowrap;line-height:22px;">📌 置顶</span>' + '<span id="tp-pin-fold" title="折叠/展开置顶栏" style="cursor:pointer;font-size:10px;padding:2px 9px;border-radius:999px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);color:var(--anima-mute);line-height:18px;user-select:none;margin-left:6px;flex-shrink:0;">' + (_pinCollapsed ? '▼ 展开' : '▲ 收起') + '</span>' + '<span id="tp-pin-rows-btn" title="\u8c03\u6574\u7f6e\u9876\u680f\u663e\u793a\u884c\u6570" style="cursor:pointer;font-size:10px;padding:2px 9px;border-radius:999px;background:rgba(var(--anima-accent-rgb),0.1);border:1px solid rgba(var(--anima-accent-rgb),0.3);color:var(--anima-accent-soft);line-height:18px;user-select:none;margin-left:6px;flex-shrink:0;">\u{1f4d0} ' + _pinRows + ' \u884c \u25be</span></div>';
                            var _hpEl = pinnedBar.querySelector('#tp-hide-pin');
                            if (_hpEl) _hpEl.onclick = function() {
                                _hidePinned = !_hidePinned;
                                localStorage.setItem('tp_hide_pinned', _hidePinned ? '1' : '0');
                                showCategory(cat);
                            };
                            var _foldEl = pinnedBar.querySelector('#tp-pin-fold');
                            if (_foldEl) _foldEl.onclick = function() {
                                _pinCollapsed = !_pinCollapsed;
                                localStorage.setItem('tp_pin_collapsed', _pinCollapsed ? '1' : '0');
                                showCategory(cat, {keepGrid:true});
                            };
                            var _rowsBtnEl = pinnedBar.querySelector('#tp-pin-rows-btn');
                            if (_rowsBtnEl) _rowsBtnEl.onclick = function(e){
                                e.stopPropagation();
                                var _oldM = document.getElementById('tp-pin-rows-menu'); if (_oldM) _oldM.remove();
                                var _menu = document.createElement("div");
                                _menu.id = "tp-pin-rows-menu";
                                var _rct = _rowsBtnEl.getBoundingClientRect();
                                _menu.style.cssText = "position:fixed;top:" + (_rct.bottom + 4) + "px;left:" + Math.min(_rct.left, window.innerWidth - 280) + "px;z-index:100000;background:var(--anima-bg);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:4px;display:flex;gap:2px;box-shadow:0 8px 24px rgba(0,0,0,0.6);";
                                for (var _ri = 1; _ri <= 8; _ri++) { (function(_r){
                                    var _b2 = document.createElement("span");
                                    _b2.textContent = _r + "\u884c";
                                    _b2.style.cssText = "padding:2px 8px;border-radius:6px;cursor:pointer;font-size:11px;color:" + (_r === _pinRows ? "var(--anima-accent-soft)" : "var(--anima-mute)") + ";background:" + (_r === _pinRows ? "rgba(var(--anima-accent-rgb),0.15)" : "rgba(255,255,255,0.04)") + ";";
                                    _b2.onclick = function(){ _menu.remove(); try { localStorage.removeItem('tp_pin_h'); } catch(e2){} _pinRows = _r; try { localStorage.setItem('tp_pin_rows', String(_pinRows)); } catch(e2){} _pinApplyHeight(); showCategory(cat, {keepGrid:true}); };
                                    _menu.appendChild(_b2);
                                })(_ri); }
                                document.body.appendChild(_menu);
                                var _closeM = function(ev){ if (!_menu.contains(ev.target)) { _menu.remove(); document.removeEventListener("mousedown", _closeM); } };
                                setTimeout(function(){ document.addEventListener("mousedown", _closeM); }, 0);
                            };
                            var pinnedTags = Object.keys(items).filter(function(k){return k!=='_order' && (items[k].starred || items[k].star);});
                            var _po = null;
                            try { _po = JSON.parse(localStorage.getItem('tp_pin_order') || 'null'); } catch(e){}
                            (function(){
                                var _join = items._order || [];
                                var _joinAt = {};
                                for (var _ji = 0; _ji < _join.length; _ji++) _joinAt[_join[_ji]] = _ji;
                                function _pinRate(tag) {
                                    var n = parseInt((items[tag] && items[tag].rating) || 0, 10);
                                    if (!(n > 0)) return 0;
                                    if (n > 5) return 5;
                                    return n;
                                }
                                function _pinName(tag) {
                                    var inf = items[tag] || {};
                                    return String(inf.note || tag || "");
                                }
                                function _manualAt(tag) {
                                    if (!_po || !_po.length) return 9999;
                                    var at = _po.indexOf(tag);
                                    return at < 0 ? 9999 : at;
                                }
                                pinnedTags.sort(function(a, b) {
                                    if (_pinSort === "manual") {
                                        var ma = _manualAt(a), mb = _manualAt(b);
                                        if (ma !== mb) return ma - mb;
                                        return String(a).localeCompare(String(b));
                                    }
                                    if (_pinSort === "name") {
                                        var na = _pinName(a), nb = _pinName(b);
                                        var nc = na.localeCompare(nb, "zh");
                                        if (nc) return nc;
                                        return String(a).localeCompare(String(b));
                                    }
                                    if (_pinSort === "new" || _pinSort === "old") {
                                        var ja = Object.prototype.hasOwnProperty.call(_joinAt, a) ? _joinAt[a] : 99999;
                                        var jb = Object.prototype.hasOwnProperty.call(_joinAt, b) ? _joinAt[b] : 99999;
                                        if (ja !== jb) return _pinSort === "new" ? jb - ja : ja - jb;
                                        return String(a).localeCompare(String(b));
                                    }
                                    var ra = _pinRate(a), rb = _pinRate(b);
                                    var aU = ra === 0, bU = rb === 0;
                                    if (aU !== bU) return aU ? 1 : -1;
                                    if (ra !== rb) return _pinSort === "rate_asc" ? ra - rb : rb - ra;
                                    var oa = _manualAt(a), ob = _manualAt(b);
                                    if (oa !== ob) return oa - ob;
                                    return String(a).localeCompare(String(b));
                                });
                            })();
                            _pinPageSize = Math.max(48, (_pinRows || 1) * 16);
                            var _pinPages = Math.max(1, Math.ceil(pinnedTags.length / _pinPageSize) || 1);
                            if (_pinPage > _pinPages) _pinPage = _pinPages;
                            if (_pinPage < 1) _pinPage = 1;
                            var _pinStart = (_pinPage - 1) * _pinPageSize;
                            var _pinSlice = pinnedTags.slice(_pinStart, _pinStart + _pinPageSize);
                            _pinOrderFull = pinnedTags.slice();
                            var _pinHead = pinnedBar.querySelector("#tp-pin-head");
                            if (_pinHead) {
                                var _pinTools = document.createElement("div");
                                _pinTools.id = "tp-pin-tools";
                                _pinTools.style.cssText = "flex:1 0 100%;display:flex;align-items:center;gap:8px;min-width:0;padding:2px 0 4px;";
                                var _pinSortBtn = document.createElement("span");
                                _pinSortBtn.id = "tp-pin-sort-btn";
                                _pinSortBtn.title = "置顶画师的排序";
                                _pinSortBtn.textContent = "排序：" + (_pinSortFull[_pinSort] || "高分在前");
                                _pinSortBtn.style.cssText = "cursor:pointer;font-size:12px;padding:3px 10px;border-radius:999px;background:rgba(var(--anima-accent-rgb),0.16);border:1px solid rgba(var(--anima-accent-rgb),0.45);color:var(--anima-accent-soft);line-height:18px;user-select:none;flex-shrink:0;";
                                _pinSortBtn.onclick = function(ev) {
                                    ev.stopPropagation();
                                    var _oldSort = document.getElementById("tp-pin-sort-menu");
                                    if (_oldSort) { _oldSort.remove(); return; }
                                    var _smenu = document.createElement("div");
                                    _smenu.id = "tp-pin-sort-menu";
                                    var _sr = _pinSortBtn.getBoundingClientRect();
                                    _smenu.style.cssText = "position:fixed;top:" + (_sr.bottom + 4) + "px;left:" + Math.max(8, Math.min(_sr.left, window.innerWidth - 148)) + "px;z-index:100000;background:var(--anima-bg);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:4px;display:flex;flex-direction:column;gap:2px;box-shadow:0 8px 24px rgba(0,0,0,0.6);min-width:128px;";
                                    var _smodes = [["rate", "高分在前"], ["rate_asc", "低分在前"], ["new", "最新加入"], ["old", "最早加入"], ["name", "按名称"], ["manual", "手动顺序"]];
                                    for (var _smi = 0; _smi < _smodes.length; _smi++) { (function(_sid, _slab) {
                                        var _sb = document.createElement("span");
                                        _sb.textContent = _slab;
                                        _sb.style.cssText = "padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;color:" + (_sid === _pinSort ? "var(--anima-accent-soft)" : "var(--anima-mute)") + ";background:" + (_sid === _pinSort ? "rgba(var(--anima-accent-rgb),0.15)" : "transparent") + ";";
                                        _sb.onclick = function() {
                                            _smenu.remove();
                                            if (_pinSort === _sid) return;
                                            _pinSort = _sid;
                                            try { localStorage.setItem("tp_pin_sort", _sid); } catch (e2) {}
                                            _pinPage = 1;
                                            showCategory(cat, {keepGrid:true});
                                        };
                                        _smenu.appendChild(_sb);
                                    })(_smodes[_smi][0], _smodes[_smi][1]); }
                                    document.body.appendChild(_smenu);
                                    var _sclose = function(ev2) { if (!_smenu.contains(ev2.target)) { _smenu.remove(); document.removeEventListener("mousedown", _sclose); } };
                                    setTimeout(function(){ document.addEventListener("mousedown", _sclose); }, 0);
                                };
                                _pinTools.appendChild(_pinSortBtn);
                                if (_pinPages > 1) {
                                var _pinPager = document.createElement("span");
                                _pinPager.id = "tp-pin-pager";
                                _pinPager.style.cssText = "margin-left:auto;display:flex;align-items:center;gap:4px;flex-shrink:0;";
                                var _mkPinPg = function(label, title, dis, fn) {
                                    var b = document.createElement("span");
                                    b.textContent = label;
                                    b.title = title;
                                    b.style.cssText = "cursor:" + (dis ? "default" : "pointer") + ";font-size:12px;line-height:18px;padding:2px 8px;border-radius:999px;user-select:none;border:1px solid rgba(255,255,255,0.12);color:" + (dis ? "rgba(255,255,255,0.28)" : "var(--anima-accent-soft)") + ";background:rgba(255,255,255,0.05);";
                                    if (!dis) b.onclick = function(ev) { ev.stopPropagation(); fn(); };
                                    return b;
                                };
                                _pinPager.appendChild(_mkPinPg("\u2039", "\u4e0a\u4e00\u9875", _pinPage <= 1, function() { _pinPage--; showCategory(cat, {keepGrid:true}); }));
                                var _pinLab = document.createElement("span");
                                _pinLab.textContent = "\u7b2c " + _pinPage + "/" + _pinPages + " \u9875";
                                _pinLab.title = "\u7f6e\u9876 " + pinnedTags.length + " \u4e2a\uff0c\u6bcf\u9875 " + _pinPageSize + " \u4e2a";
                                _pinLab.style.cssText = "font-size:12px;color:var(--anima-ink, #e8e8e8);min-width:72px;text-align:center;white-space:nowrap;";
                                _pinPager.appendChild(_pinLab);
                                _pinPager.appendChild(_mkPinPg("\u203a", "\u4e0b\u4e00\u9875", _pinPage >= _pinPages, function() { _pinPage++; showCategory(cat, {keepGrid:true}); }));
                                _pinTools.appendChild(_pinPager);
                                }
                                _pinHead.appendChild(_pinTools);
                            }
                            for (var _pi=0; _pi<_pinSlice.length; _pi++) {
                                (function(_pt){
                                    var _pinfo = items[_pt]||{};
                                    var _psel = _multiSelected.indexOf(_pt)>=0;
                                    var _pchip = document.createElement("div");
                                    _pchip.className = "tp-pin-chip";
                                    _pchip.dataset.tag = _pt;
                                    _pchip.style.cssText = "display:flex;align-items:center;gap:4px;padding:4px 10px 4px 4px;border-radius:8px;cursor:pointer;background:"+(_psel?"rgba(var(--anima-accent-rgb),0.15)":"rgba(255,255,255,0.04)")+";border:1px solid "+(_psel?"var(--anima-accent-soft)":"rgba(255,255,255,0.08)")+";transition:all 0.15s;max-width:none;";
                                    _pchip.onmouseover = function(){ this.style.background="rgba(255,255,255,0.1)"; };
                                    _pchip.onmouseout = function(){ var _live = _multiSelected.indexOf(_pt)>=0; this.style.background=_live?"rgba(var(--anima-accent-rgb),0.15)":"rgba(255,255,255,0.04)"; };
                                    _pchip.onclick = function(){
                                        if (_noteMode) { setArtistNote(_pt); return; }
                                        if (_multiMode) {
                                            var _idx = _multiSelected.indexOf(_pt);
                                            if (_idx>=0) _multiSelected.splice(_idx,1); else _multiSelected.push(_pt);
                                            var _me = div.querySelector("#_multiToggle"); if(_me) _me.textContent = "☑ 多选("+_multiSelected.length+")";
                                            var _ftd = div.querySelector("#multi-float-save"); if(_ftd) _ftd.style.display = _multiSelected.length>=1?"block":"none";
                                            _paintFavMulti(_pt);
                                        } else {
                                            _insertTag(formatTag(_pt, true, _tagMode));
                                        }
                                    };
                                    _pchip.oncontextmenu = function(e){ _moveOneArtist(e, _pt); };
                                    if (_pinfo.thumb) {
                                        _pchip.onmouseenter = function(){
                                            if (window.__animaChipDragging) return;
                                            if (_pchip._hovT) { clearTimeout(_pchip._hovT); }
                                            _pchip._hovT = setTimeout(function(){
                                                _pchip._hovT = null;
                                                if (window.__animaChipDragging) return;
                                                if (!_pchip.matches(':hover')) return;
                                                hoverImg.src = (window.animaFavGrid?window.animaFavGrid.proxySrc(_pinfo.thumb,_favSource,false):((_favSource==='danbooru'?'/danbooru_anima/image_proxy?url=':'/gelbooru_anima/image_proxy?url=')+encodeURIComponent(_pinfo.thumb)));
                                                var _r = _pchip.getBoundingClientRect();
                                                var _t = _r.bottom+4, _l = _r.left;
                                                if (_t+160>window.innerHeight) _t = _r.top-160;
                                                if (_l+160>window.innerWidth) _l = window.innerWidth-170;
                                                hoverPop.style.top=_t+"px"; hoverPop.style.left=_l+"px";
                                                hoverPop.style.display="block";
                                            }, 400);
                                        };
                                        _pchip.onmouseleave = function(){ if (_pchip._hovT) { clearTimeout(_pchip._hovT); _pchip._hovT = null; } hoverPop.style.display="none"; };
                                        _pchip.addEventListener("mousedown", function(){ if (_pchip._hovT) { clearTimeout(_pchip._hovT); _pchip._hovT = null; } hoverPop.style.display="none"; }, true);
                                        var _ptn = document.createElement("img");
                                        _ptn.style.cssText = "width:40px;height:40px;border-radius:6px;object-fit:cover;flex-shrink:0;";
                                        if (window.animaFavGrid) window.animaFavGrid.bindImg(_ptn, _pinfo.thumb, _favSource, {eager:false,width:"40px",height:"40px",objectFit:"cover",borderRadius:"6px",tag:_pt,cat:"artists"});
                                        else { _ptn.src = (_favSource==='danbooru'?'/danbooru_anima/image_proxy?url=':'/gelbooru_anima/image_proxy?url=')+encodeURIComponent(_pinfo.thumb); _ptn.onerror = function(){ this.style.display="none"; }; }
                                        _pchip.appendChild(_ptn);
                                    }
                                    var _plb = document.createElement("span");
                                    _plb.textContent = "@" + (_pinfo.note || _pt);
                                    _plb.title = "@" + (_pinfo.note || _pt);
                                    _plb.style.cssText = "color:#e0e0e0;font-size:13px;font-weight:600;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.6);";
                                    var _pcol = document.createElement("div");
                                    _pcol.style.cssText = "display:flex;flex-direction:column;align-items:flex-start;min-width:0;gap:2px;";
                                    _pcol.appendChild(_plb);
                                    if (window.animaFavGrid && window.animaFavGrid.makeRateRow) {
                                        _pcol.appendChild(window.animaFavGrid.makeRateRow((_pinfo && _pinfo.rating) || 0, function(n){
                                            window.animaFavGrid.rateFavorite(_favSource, _pt, "artists", n).then(function(d){
                                                if (!d || !d.success) return;
                                                items[_pt] = items[_pt] || {};
                                                items[_pt].rating = n;
                                                if (window.animaFavGrid.paintRateTag) window.animaFavGrid.paintRateTag(_pt, n, div);
                                                if (_pinSort === "rate" || _pinSort === "rate_asc") showCategory(cat, {keepGrid:true});
                                            });
                                        }, { size: 12, tag: _pt }));
                                    }
                                    _pchip.appendChild(_pcol);
                                    pinnedBar.appendChild(_pchip);
                                })(_pinSlice[_pi]);
                            }
                            if (!pinnedTags.length) pinnedBar.innerHTML = '<span style="color:var(--anima-mute);font-size:10px;">📌 暂无置顶画师</span>';
                        }
                        if (_pinCollapsed) pinnedBar.querySelectorAll('.tp-pin-chip').forEach(function(ch){ ch.style.display = 'none'; }); var _pr2 = pinnedBar.querySelector('#tp-pin-resize'); if (_pr2) _pr2.style.display = _pinCollapsed ? 'none' : 'block'; _pinApplyHeight();
                        if (opt.keepGrid) return;
                        var order = items._order || Object.keys(items).filter(function(k){return k!=='_order';});
                        if (window.animaFavGrid && window.animaFavGrid.applyJoinSort) order = window.animaFavGrid.applyJoinSort(order);
                        if (cat === 'artists' && _favData && _favData._folders && _favData._folders.artists) {
                            var _fldf = _favData._folders.artists;
                            if (_activeFolder === '__uncat') {
                                var _allInF = new Set();
                                for (var _fnf in _fldf) { if (_fnf === "__tmp") continue; (_fldf[_fnf] || []).forEach(function(k){ _allInF.add(k); }); }
                                order = order.filter(function(k){ return !_allInF.has(k); });
                            } else {
                                var _flKeys = _fldf[_activeFolder] || [];
                                order = order.filter(function(k){ return _flKeys.indexOf(k) >= 0; });
                            }
                        }
                        // 👁 隐藏置顶：主列表过滤掉已收藏（置顶）的标签，只留未收藏
                        if (_hidePinned) {
                            order = order.filter(function(k){ return !(items[k] && (items[k].starred || items[k].star)); });
                        }
                        var cnt = 0;
                        if (!order.length) {
                            if (pagerBar) pagerBar.paint({page:1,pages:1,total:0,size:24});
                        } else {
                            var _pg = (window.animaFavGrid && window.animaFavGrid.slicePage) ? window.animaFavGrid.slicePage(order, _favPage) : {page:1,pages:1,total:order.length,items:order};
                            _favPage = _pg.page;
                            if (pagerBar) pagerBar.paint(_pg);
                            order = _pg.items;
                        }
                        if (opt.gridOnly) {
                            while (body.firstChild) body.removeChild(body.firstChild);
                        }
                        if (!body._favCardPool) body._favCardPool = {};
                        var _favPool = body._favCardPool;
                        for(var oi=0;oi<order.length;oi++){
                            var tag = order[oi];
                            var info = items[tag];
                            if(!info) continue;
                            cnt++;
                            var _ckey = cat + "\0" + tag;
                            var _hit = _favPool[_ckey];
                            if (_hit) {
                                var _on = _multiMode && _multiSelected.indexOf(tag) >= 0;
                                _hit.style.border = _on ? "2px solid var(--anima-accent-soft)" : "1px solid rgba(255,255,255,.08)";
                                _hit.style.background = _on ? "rgba(var(--anima-title-rgb),.42)" : "rgba(var(--anima-well-rgb),.22)";
                                var _lb = _hit.querySelector(".fav-lbl");
                                var _dn = info.note ? info.note : (info.cn ? info.cn + " (" + tag + ")" : tag);
                                if (_lb && _lb.textContent !== _dn) _lb.textContent = _dn;
                                var _sb = _hit.querySelector(".fav-star-btn");
                                var _st = !!(info.starred || info.star);
                                if (_sb) {
                                    _sb.textContent = _st ? "\u2605" : "\u2606";
                                    _sb.style.color = _st ? "#ffeb3b" : "var(--anima-mute)";
                                    _sb.title = _st ? "\u53d6\u6d88\u661f\u6807" : "\u661f\u6807\u7f6e\u9876";
                                }
                                var _rr = _hit.querySelector(".anima-fav-rate");
                                if (_rr) {
                                    if (_st) _rr.classList.remove("is-unpin"); else _rr.classList.add("is-unpin");
                                    if (typeof _rr._setRating === "function") _rr._setRating((info && info.rating) || 0);
                                }
                                body.appendChild(_hit);
                                continue;
                            }
                            var card = document.createElement('div');
                            card.className = 'tp-card';
                            card.dataset.tag = tag;
                            card.style.cssText = 'display:flex;flex-direction:column;align-items:center;min-width:0;padding:4px;border-radius:6px;background:rgba(var(--anima-well-rgb),.22);border:1px solid rgba(255,255,255,.08);cursor:pointer;box-sizing:border-box;position:relative;transition:box-shadow .15s ease,border-color .15s ease;';
                            if (_multiMode && _multiSelected.indexOf(tag) >= 0) { card.style.border = '2px solid var(--anima-accent-soft)'; card.style.background = 'rgba(var(--anima-title-rgb),.42)'; }
                            // ── ⭐ 按钮 ──
                            var _starred = info.starred || false;
                            var starBtn = document.createElement('span');
                            starBtn.className = 'fav-star-btn';
                            starBtn.textContent = _starred ? '★' : '☆';
                            starBtn.title = _starred ? '取消星标' : '星标置顶';
                            starBtn.style.cssText = 'position:absolute;top:4px;right:4px;cursor:pointer;width:26px;height:26px;border-radius:50%;background:rgba(13,17,22,0.55);display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;color:' + (_starred ? '#ffeb3b' : 'var(--anima-mute)') + ';z-index:3;opacity:1;transition:transform .15s ease;';
                            starBtn.onclick = (function(_tag, _cat){
                                return function(e){
                                    e.stopPropagation();
                                var starUrl = _favSource === 'danbooru' ? '/danbooru_anima/favorites/star' : '/gelbooru_anima/favorites/star';
                                    fetch(starUrl, {
                                        method: 'POST', headers: {'Content-Type':'application/json'},
                                        body: JSON.stringify({tag: _tag, category: _cat})
                                    }).then(function(r){return r.json();}).then(function(d){
                                        if (d.success) {
                                        items[_tag] = items[_tag] || {}; items[_tag].starred = d.starred;
                                        var _needGrid = !!(_hidePinned && !d.starred);
                                        if (_needGrid) { showCategory(_cat); return; }
                                        var _cards = body.querySelectorAll(".tp-card");
                                        for (var _ci = 0; _ci < _cards.length; _ci++) {
                                            if (!_cards[_ci].dataset || _cards[_ci].dataset.tag !== _tag) continue;
                                            var _sb = _cards[_ci].querySelector(".fav-star-btn");
                                            if (_sb) {
                                                _sb.textContent = d.starred ? "★" : "☆";
                                                _sb.style.color = d.starred ? "#ffeb3b" : "var(--anima-mute)";
                                                _sb.title = d.starred ? "取消星标" : "星标置顶";
                                            }
                                            var _rr = _cards[_ci].querySelector(".anima-fav-rate");
                                            if (_rr) { if (d.starred) _rr.classList.remove("is-unpin"); else _rr.classList.add("is-unpin"); }
                                            if (_hidePinned && d.starred) _cards[_ci].remove();
                                            break;
                                        }
                                        if (_cat === "artists") showCategory(_cat, { keepGrid: true });
                                    }
                                    }).catch(function(){});
                                };
                            })(tag, cat);
                            card.appendChild(starBtn);
                            var img = document.createElement('div');
                            img.className = 'fav-img-wrap';
                            img.style.cssText = 'width:100%;height:240px;border-radius:4px;background:rgba(var(--anima-title-rgb),.16);border:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;flex-shrink:0;';
                            var letter = document.createElement('span');
                            letter.className = 'fav-letter';
                            letter.textContent = (tag||'?')[0].toUpperCase();
                            img.appendChild(letter);
                            if(info.thumb || (window.animaFavGrid && window.animaFavGrid.live && window.animaFavGrid.live() && cat === "artists") || (window.animaFavGrid && window.animaFavGrid.liveThumb && window.animaFavGrid.liveThumb(tag))){
                                var imgEl = document.createElement('img');
                                if (window.animaFavGrid) window.animaFavGrid.bindImg(imgEl, info.thumb || "", _favSource, { tag: tag, cat: cat });
                                else {
                                    var proxyUrl = _favSource === 'danbooru' ? '/danbooru_anima/image_proxy?url=' : '/gelbooru_anima/image_proxy?url=';
                                    imgEl.src = proxyUrl + encodeURIComponent(info.thumb);
                                    imgEl.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:4px;';
                                    imgEl.onerror = function(){ this.style.display='none'; };
                                }
                                img.appendChild(imgEl);
                            }
                            card.appendChild(img);
                            var lbl = document.createElement('span');
                            lbl.className = 'fav-lbl';
                            lbl.style.cssText = 'font-size:11px;color:#b0bec5;margin-top:2px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;';
                            var displayName = info.note ? info.note : (info.cn ? info.cn + ' (' + tag + ')' : tag);
                            lbl.textContent = displayName;
                            card.appendChild(lbl);
                            if (cat === 'artists' && window.animaFavGrid && window.animaFavGrid.makeRateRow) {
                                (function(_rtag, _pin){
                                img.appendChild(window.animaFavGrid.makeRateRow((info && info.rating) || 0, function(n){
                                    window.animaFavGrid.rateFavorite(_favSource, _rtag, "artists", n).then(function(d){
                                        if (!d || !d.success) return;
                                        items[_rtag] = items[_rtag] || {};
                                        items[_rtag].rating = n;
                                        if (window.animaFavGrid.paintRateTag) window.animaFavGrid.paintRateTag(_rtag, n, div);
                                    });
                                }, { center: true, size: 12, overlay: true, unpin: !_pin, tag: _rtag }));
                                })(tag, _starred);
                            }
                            (function(_tag, _cat){
                                card.onclick = function(){
                                    if (_noteMode) { setArtistNote(_tag); return; }
                                    if (_multiMode) {
                                        var idx2 = _multiSelected.indexOf(_tag);
                                        if (idx2 >= 0) { _multiSelected.splice(idx2, 1); card.style.border = "1px solid rgba(255,255,255,.08)"; card.style.background = "rgba(var(--anima-well-rgb),.22)"; }
                                        else { _multiSelected.push(_tag); card.style.border = "2px solid var(--anima-accent-soft)"; card.style.background = "rgba(var(--anima-title-rgb),.42)"; }
                                        var multiEl2 = div.querySelector("#_multiToggle");
                                        if(multiEl2) multiEl2.textContent = "☑ 多选("+_multiSelected.length+")";
                                        var ftd = div.querySelector("#multi-float-save");
                                        if(ftd) ftd.style.display = _multiSelected.length >= 1 ? "block" : "none";
                                        _paintFavMulti(_tag);
                                        return;
                                    }
                                    var outTag = _tag;
                                    _insertTag(formatTag(outTag, _cat==='artists', _tagMode));
                                };
                                if (_cat === 'artists') card.oncontextmenu = function(e){ _moveOneArtist(e, _tag); };
                            })(tag, cat);
                            body.appendChild(card);
                            _favPool[_ckey] = card;
                        }
                        if(!cnt) body.innerHTML = '<div class="fav-empty" style="color:var(--anima-mute);padding:20px;text-align:center;grid-column:1/-1;">暂无收藏</div>';
                        if (window.animaFavGrid) window.animaFavGrid.finish(body);
                        body.scrollTop = _keepY;
                        Array.from(tabBar.children).forEach(function(t){
                            t.style.background = t.dataset.cat === cat ? 'var(--anima-title)' : 'transparent';
                            t.style.borderBottom = t.dataset.cat === cat ? '2px solid var(--anima-accent-soft)' : '2px solid transparent';
                            t.style.color = t.dataset.cat === cat ? 'var(--anima-accent-soft)' : 'var(--anima-mute)';
                        });
                    }
                    _showCatFn = showCategory;
                    tabBar.innerHTML = '';
                    for(var ci=0;ci<cats.length;ci++){
                        (function(cat){
                            var tab = document.createElement('span');
                            tab.textContent = catNames[cat] || cat;
                            tab.className = 'tp-tab';
                            tab.dataset.cat = cat;
                            tab.style.cssText = 'padding:6px 12px;font-size:12px;cursor:pointer;color:var(--anima-mute);transition:all .2s;';
                            tab.onclick = function(){_multiSelected = []; var ft = div.querySelector("#multi-float-save"); if(ft) ft.style.display = "none"; var me = div.querySelector("#_multiToggle"); if(me) me.textContent = animaTxt("☑ 多选(0)"); showCategory(cat, {reset:true});};
                            tabBar.appendChild(tab);
                        })(cats[ci]);
                    }
                    if (_curCat) { showCategory(_curCat); return; }
                    for(var ci2=0;ci2<cats.length;ci2++){
                        var items2 = favs[cats[ci2]] || {};
                        if(Object.keys(items2).length > 1 || (Object.keys(items2).length === 1 && Object.keys(items2)[0] !== '_order')){
                            showCategory(cats[ci2], {reset:true}); return;
                        }
                    }
                    showCategory(cats[0], {reset:true});
                });
                }
                loadFavs();
            }
            // ── Animadex 弹窗 ──
            var _animPopup = null;
            function openAnimadex() {
                if (_animPopup) { _animPopup.remove(); _animPopup = null; return; }
                var mode = 'artists', query = '', filters = {}, page = 1, sort = 'count', total = 0;
                var charMode = 'tag'; // 'tag' | 'tag+tags'
                var div = document.createElement('div');
                div.style.cssText = 'position:fixed;z-index:99999;width:560px;max-height:650px;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid var(--anima-title);border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,0.7);display:flex;flex-direction:column;overflow:hidden;';
                var hdr = document.createElement('div');
                hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid var(--anima-title);cursor:move;';
                hdr.innerHTML = '<span style="color:#888;font-size:13px;">A 搜索</span><span style="cursor:pointer;color:#e94560;font-size:16px;">✕</span>';
                hdr.onmousedown = function(e){var dx=e.clientX-div.offsetLeft,dy=e.clientY-div.offsetTop;function mm(ev){div.style.left=(ev.clientX-dx)+'px';div.style.top=(ev.clientY-dy)+'px'}function mu(){document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);localStorage.setItem('db_fav_tag_pos',JSON.stringify({top:parseInt(div.style.top)||0,left:parseInt(div.style.left)||0}));}document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);};
                hdr.lastChild.onclick = function(){div.remove();_animPopup=null;};
                div.appendChild(hdr);
                // Search bar
                var searchRow = document.createElement('div');
                searchRow.style.cssText = 'display:flex;padding:6px 10px;gap:4px;border-bottom:1px solid #222;flex-shrink:0;';
                var searchInp = document.createElement('input');
                searchInp.type = 'text';
                searchInp.placeholder = '搜索角色或画师...';
                searchInp.style.cssText = 'flex:1;padding:5px 8px;border:1px solid var(--anima-title);border-radius:4px;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);color:#e0e0e0;font-size:12px;outline:none;';
                searchInp.onkeydown = function(ev){if(ev.key==='Enter'){search();}};
                var searchBtn = document.createElement('span');
                searchBtn.textContent = '🔍';
                searchBtn.style.cssText = 'padding:4px 10px;cursor:pointer;font-size:14px;background:var(--anima-title);border-radius:4px;color:var(--anima-accent-soft);';
                searchBtn.onclick = function(){search();};
                searchRow.append(searchInp, searchBtn);
                div.appendChild(searchRow);
                // Mode & Sort bar
                var bar = document.createElement('div');
                bar.style.cssText = 'display:flex;padding:4px 10px;gap:6px;border-bottom:1px solid #222;flex-shrink:0;align-items:center;';
                var btnArtists = document.createElement('span');
                btnArtists.textContent = animaTxt("🎨 画师"); btnArtists.style.cssText = 'padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;';
                btnArtists.onclick = function(){mode='artists';_setMode();search();};
                var btnChars = document.createElement('span');
                btnChars.textContent = animaTxt("👤 角色"); btnChars.style.cssText = 'padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;';
                btnChars.onclick = function(){mode='characters';_setMode();search();};
                var btnHot = document.createElement('span');
                btnHot.textContent = animaTxt("🔥 热门"); btnHot.style.cssText = 'padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;';
                btnHot.onclick = function(){sort='count';page=1;_setMode();search();};
                var btnFav = document.createElement('span');
                btnFav.textContent = animaTxt("❤️ 喜欢"); btnFav.style.cssText = 'padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;';
                btnFav.onclick = function(){sort='fav_count';page=1;_setMode();search();};
                var btnRand = document.createElement('span');
                btnRand.textContent = animaTxt("🔀 随机"); btnRand.style.cssText = 'padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;';
                btnRand.onclick = function(){sort='random';page=1;_setMode();search();};
                var _charToggle = document.createElement('span');
                _charToggle.textContent = '📋 tag'; _charToggle.style.cssText = 'padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;color:var(--anima-accent-soft);margin-left:auto;display:none;';
                _charToggle.onclick = function(){charMode=charMode==='tag'?'tag+tags':'tag';_charToggle.textContent=charMode==='tag'?'📋 tag':'📋 tag+特征';_charToggle.style.color=charMode==='tag'?'var(--anima-accent-soft)':'#ff9800';};
                function _setMode() {
                    var ms = [btnArtists, btnChars, btnHot, btnFav, btnRand];
                    ms.forEach(function(b){b.style.background='transparent';b.style.color='#888';b.style.border='1px solid transparent';});
                    if(mode==='artists'){btnArtists.style.background='var(--anima-title)';btnArtists.style.color='var(--anima-accent-soft)';btnChars.style.color='#666';}
                    else{btnChars.style.background='var(--anima-title)';btnChars.style.color='var(--anima-accent-soft)';btnArtists.style.color='#666';}
                    var sv = btnHot; if(sort==='fav_count')sv=btnFav; if(sort==='random')sv=btnRand;
                    sv.style.border='1px solid var(--anima-accent-soft)';
                    _charToggle.style.display = mode==='characters'?'inline':'none';
                }
                _setMode();
                bar.append(btnArtists, btnChars, btnHot, btnFav, btnRand, _charToggle);
                div.appendChild(bar);
                // Body
                var body = document.createElement('div');
                body.style.cssText = 'flex:1;overflow-y:auto;padding:8px;display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start;';
                body.innerHTML = '<div style="color:#555;padding:30px;text-align:center;">输入关键词搜索</div>';
                div.appendChild(body);
                // Page bar
                var pageBar = document.createElement('div');
                pageBar.style.cssText = 'display:flex;justify-content:center;gap:4px;padding:6px;border-top:1px solid #222;flex-shrink:0;';
                div.appendChild(pageBar);
                document.body.appendChild(div);
                div.style.left = Math.max(10,(window.innerWidth-560)/2)+'px';
                div.style.top = Math.max(10,(window.innerHeight-650)/2)+'px';
                // 打开时自动加载
                setTimeout(function(){doSearch();}, 100);
                _animPopup = div;
                function search(){
                    var q = searchInp.value.trim();
                    query = q; page = 1;
                    doSearch();
                }
                function doSearch(){
                    body.innerHTML = '<div style="color:#555;padding:30px;text-align:center;">搜索中...</div>';
                    fetch('/danbooru_anima/animadex_search',{
                        method:'POST',headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({mode:mode,query:query,filters:filters,page:page,sort:sort})
                    }).then(function(r){return r.json();}).then(function(d){
                        if(!d.success){body.innerHTML='<div style="color:#e94560;padding:20px;">搜索失败</div>';return;}
                        total = d.total || 0;
                        var results = d.results || [];
                        body.innerHTML = '';
                        for(var ri=0;ri<results.length;ri++){
                            (function(item){
                                var card = document.createElement('div');
                                card.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:calc(25% - 5px);padding:4px;border-radius:6px;background:rgba(var(--anima-well-rgb),.22);border:1px solid rgba(255,255,255,.08);cursor:pointer;box-sizing:border-box;';
                                var imgDiv = document.createElement('div');
                                imgDiv.style.cssText = 'width:100%;aspect-ratio:1;border-radius:4px;background:rgba(var(--anima-title-rgb),.16);background-size:contain;background-repeat:no-repeat;background-position:center;font-size:15px;color:rgba(var(--anima-ink-rgb),.82);';
                                if(item.thumb_url){
                                    imgDiv.style.backgroundImage = "url('/danbooru_anima/animadex_image?url=" + encodeURIComponent(item.thumb_url) + "')";
                                    
                                } else {
                                    imgDiv.textContent = '🖼';
                                }
                                card.appendChild(imgDiv);
                                var lbl = document.createElement('span');
                                lbl.style.cssText = 'font-size:10px;color:#b0bec5;margin-top:2px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;';
                                lbl.textContent = item.name || item.slug||'';
                                card.appendChild(lbl);
                                card.onclick = function(){
                                    var outTag = '';
                                    if(mode==='artists'){
                                        var at = item.trigger || item.slug || item.name||'';
                                        outTag = '@' + at.replace(/ /g,'_');
                                    } else {
                                        var ct = item.trigger || item.slug || item.name||'';
                                        ct = ct.replace(/ /g,'_');
                                        if(charMode==='tag+tags' && item.tags && item.tags.length){
                                            var featureTags = item.tags.slice(0,5).map(function(t){return t.replace(/ /g,'_');});
                                            outTag = ct + ', ' + featureTags.join(', ');
                                        } else {
                                            outTag = ct;
                                        }
                                    }
                                                                        _insertTag(outTag);
                                };
                                body.appendChild(card);
                            })(results[ri]);
                        }
                        if(!results.length) body.innerHTML = '<div style="color:#555;padding:30px;text-align:center;">无结果</div>';
                        // Page
                        pageBar.innerHTML = '';
                        var totalPages = Math.ceil(total / 36) || 1;
                        if(page>1){
                            var prev = document.createElement('span');
                            prev.textContent = '◀'; prev.style.cssText = 'padding:2px 6px;cursor:pointer;font-size:12px;color:var(--anima-accent-soft);';
                            prev.onclick = function(){page--;doSearch();};
                            pageBar.appendChild(prev);
                        }
                        for(var pi=Math.max(1,page-2);pi<=Math.min(totalPages,page+2);pi++){
                            var pn = document.createElement('span');
                            pn.textContent = pi; pn.style.cssText = 'padding:2px 6px;cursor:pointer;font-size:12px;'+(pi===page?'color:var(--anima-accent-soft);font-weight:bold;background:var(--anima-title);border-radius:3px;':'color:#888;');
                            pn.onclick = function(p){return function(){page=p;doSearch();};}(pi);
                            pageBar.appendChild(pn);
                        }
                        if(page<totalPages){
                            var next = document.createElement('span');
                            next.textContent = '▶'; next.style.cssText = 'padding:2px 6px;cursor:pointer;font-size:12px;color:var(--anima-accent-soft);';
                            next.onclick = function(){page++;doSearch();};
                            pageBar.appendChild(next);
                        }
                    }).catch(function(){body.innerHTML='<div style="color:#e94560;padding:20px;">加载失败</div>';});
                }
            }
            function _insertTag(tag) {
                var ta = tagTextarea;
                var pos = ta.selectionStart;
                if(pos !== undefined && pos !== null && pos < ta.value.length){
                    var bef = ta.value.substring(0, pos);
                    var aft = ta.value.substring(ta.selectionEnd);
                    var sepB = bef.length>0 && !bef.endsWith(',') && !bef.endsWith(', ') ? ', ' : '';
                    var sepA = aft.length>0 && !aft.startsWith(',') && !aft.startsWith(', ') ? ', ' : '';
                    ta.value = bef + sepB + tag + sepA + aft;
                    var np = (bef + sepB + tag).length;
                    ta.setSelectionRange(np, np);
                } else {
                    ta.value = ta.value ? ta.value + ', ' + tag : tag;
                }
                syncWidget();
                if(typeof renderChips==='function' && _chipMode) renderChips();
            }
            tagTextarea.oninput = function(){syncWidget();};
            var acTimeout=null;
            // ── 画师缩略图 URL：http 直链走代理（cdn.donmai.us 浏览器直连会失败） ──
            function _favImgUrl(u, tag) {
                if (!u && !tag) return "";
                if (window.animaFavGrid && window.animaFavGrid.favSrc) {
                    return window.animaFavGrid.favSrc(u, /gelbooru\.com/i.test(u || "") ? "gelbooru" : "danbooru", tag);
                }
                if (u && u.indexOf("http") === 0) return "/danbooru_anima/image_proxy?url=" + encodeURIComponent(u);
                return u || "";
            }
            // ── AnimaDex 画师缩略图回退：本地收藏夹没有时去 AnimaDex 搜 ──
            var _adexArtCache = {};
            function _loadAdexArtistThumb(artistName) {
                var _key = String(artistName || "").toLowerCase();
                if (!_key) return Promise.resolve("");
                if (_key in _adexArtCache) return Promise.resolve(_adexArtCache[_key]);
                return fetch("/danbooru_anima/animadex_search", {
                    method: "POST", headers: {"Content-Type":"application/json"},
                    body: JSON.stringify({mode: "artists", query: artistName, limit: 20})
                }).then(function(r){ return r.json(); }).then(function(d){
                    var items = (d && d.results) || [];
                    var hit = null;
                    // 查询词：下划线→空格，取括号前主名
                    var _qFull = String(artistName || "").replace(/_/g, " ").toLowerCase();
                    var _qMain = _qFull.replace(/\(.*?\)/g, "").trim();
                    for (var i = 0; i < items.length; i++) {
                        var slug = String(items[i].slug || "").toLowerCase();
                        var nm = String(items[i].name || "").toLowerCase();
                        var slugMain = slug.replace(/\(.*?\)/g, "").replace(/_/g, " ").trim();
                        var nmMain = nm.replace(/\(.*?\)/g, "").trim();
                        if (slug === _qFull || slug === artistName.toLowerCase()
                            || nm === _qFull || nm === _qMain
                            || slugMain === _qMain || nmMain === _qMain) { hit = items[i]; break; }
                    }
                    // 精确/主名都没匹配到 → 不取第一条兜底（会显示错误画师），返回空
                    var thumb = (hit && hit.thumb_url) || "";
                    _adexArtCache[_key] = thumb;
                    return thumb;
                }).catch(function(){ _adexArtCache[_key] = ""; return ""; });
            }
            // ── 画师收藏缓存（@ 触发下拉） ──
            var _favArtCache = null;
            var _favArtLoading = null;
            function _loadArtistFavs() {
                if (_favArtCache) return Promise.resolve(_favArtCache);
                if (_favArtLoading) return _favArtLoading;
                _favArtLoading = fetch("/danbooru_anima/favorites?cats=artists").then(function(r){ return r.json(); }).then(function(d){
                    var arts = (d.favorites && d.favorites.artists) || {};
                    var list = [];
                    for (var k in arts) { if (k === "_order") continue; list.push({ tag: k, thumb: arts[k] && arts[k].thumb || "", cn: arts[k] && arts[k].cn || "", starred: !!(arts[k] && (arts[k].starred || arts[k].star)) }); }
                    _favArtCache = list;
                    _favArtLoading = null;
                    return list;
                }).catch(function(){ _favArtLoading = null; return []; });
                return _favArtLoading;
            }
            _loadArtistFavs().then(function(){
                try { if (document.querySelector(".anima-chip-flyout")) return; } catch (e) {}
                if (_chipMode && typeof renderChips === "function") renderChips();
            });
            // ── @ 画师下拉 ──
            function _showArtistDropdown(q) {
                var kw = q.indexOf("@") === 0 ? q.slice(1).toLowerCase() : q.toLowerCase();
                _loadArtistFavs().then(function(list){
                    if (searchInput.value.trim().indexOf("@") !== 0) { acList.style.display = "none"; return; }
                    var hit = [];
                    for (var i = 0; i < list.length; i++) {
                        var nm = list[i].tag.replace(/^@/, "");
                        var nml = nm.toLowerCase();
                        var cn = String(list[i].cn || "").toLowerCase();
                        if (!kw || nml.indexOf(kw) >= 0 || (cn && cn.indexOf(kw) >= 0)) hit.push(list[i]);
                    }
                    if (kw && window.animaFuzzyCmp) {
                        hit.sort(function (a, b) {
                            return window.animaFuzzyCmp(kw, { tag: String(a.tag || "").replace(/^@/, ""), cn: a.cn }, { tag: String(b.tag || "").replace(/^@/, ""), cn: b.cn });
                        });
                    }
                    hit = hit.slice(0, 20);
                    acList.innerHTML = "";
                    if (!hit.length) { acList.innerHTML = '<div style="padding:8px;text-align:center;color:#555;font-size:12px;">未找到画师</div>'; acList.style.display = "block"; return; }
                    for (var hi = 0; hi < hit.length; hi++) { (function(item){
                        var row = document.createElement("div");
                        row.style.cssText = "display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer;color:#ccc;font-size:13px;border-bottom:1px solid var(--anima-bg);";
                        var im = document.createElement("img");
                        im.style.cssText = "width:40px;height:40px;border-radius:4px;object-fit:cover;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);flex-shrink:0;";
                        if (item.thumb) { im.src = _favImgUrl(item.thumb, item.tag); im.onerror = function(){ this.style.display = "none"; }; } else { im.style.display = "none"; }
                        var lb = document.createElement("span");
                        lb.textContent = "@" + item.tag.replace(/^@/, "").replace(/_/g, " ");
                        row.appendChild(im); row.appendChild(lb);
                        row.onclick = function(){
                            var out = "@" + item.tag.replace(/^@/, "").replace(/ /g, "_");
                            _insertTag(out);
                            acList.style.display = "none"; searchInput.value = ""; searchInput.focus();
                        };
                        row.onmouseover = function(){ row.style.background = "var(--anima-title)"; };
                        row.onmouseout = function(){ row.style.background = "transparent"; };
                        acList.appendChild(row);
                    })(hit[hi]); }
                    acList.style.display = "block";
                });
            }
            searchInput.oninput = function(){
                clearTimeout(acTimeout);
                var q = searchInput.value.trim();
                if(!q){acList.style.display="none";return;}
                if (q.indexOf("@") === 0) { _showArtistDropdown(q); return; }
                acTimeout=setTimeout(async function(){
                    try{var r=await fetch("/danbooru_anima/fuzzy_tags",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:q})});var d=await r.json();var items=d.tags||[];acList.innerHTML="";if(!items.length){acList.innerHTML='<div style="padding:8px;text-align:center;color:#555;font-size:12px;">无结果</div>';acList.style.display="block";return;}
                        for(var ai=0;ai<Math.min(items.length,20);ai++){(function(item){var tn=item.tag||"",cn2=item.cn||"",lb=cn2?cn2+" ("+tn+")":tn;var row=$el("div",{textContent:lb,style:{padding:"5px 10px",cursor:"pointer",color:"#ccc",fontSize:"13px",borderBottom:"1px solid var(--anima-bg)"}});row.onclick=function(){_insertTag(tn);acList.style.display="none";searchInput.value="";searchInput.focus();};row.onmouseover=function(){row.style.background="var(--anima-title)";};row.onmouseout=function(){row.style.background="transparent";};acList.appendChild(row);})(items[ai]);}
                        acList.style.display="block";
                    }catch(e){acList.style.display="none";}
                },200);
            };
            document.addEventListener("click",function(e){if(!container.contains(e.target))acList.style.display="none";});

            container.append(searchInput, acList, toolbar, _batchBar, chipArea, chipInputRow, tagTextarea);

// (高级节点无暂停/继续功能)
            // 初始化恢复
            function _avRestoreUi() {
                if (!_avConfigured) return;
                _ensurePersistWidgets();
                _loadNodeHidden();
                var lsContent = "";
                try { lsContent = localStorage.getItem("db_av_content_" + node.id) || ""; } catch (e) {}
                var _fw2 = node.widgets?.find(function(w){return w.name==="_db_full_tags";});
                var _pw = node.widgets?.find(function(w){return w.name==="text";});
                var fullW = (_fw2 && _fw2.value) ? String(_fw2.value) : "";
                var textW = _pw ? String(_pw.value || "") : "";
                // text 控件只存「去掉隐藏标签后的输出」。完整列表在本地记录和 _db_full_tags 里。
                var fromFull = _pickLonger(lsContent, fullW);
                tagTextarea.value = fromFull || textW || "";
                if (!fromFull) {
                    var globalDump = "";
                    var nodeDump = "";
                    try { globalDump = localStorage.getItem("db_av_hidden") || ""; } catch (e) {}
                    try { nodeDump = localStorage.getItem("db_av_hidden_" + node.id) || ""; } catch (e2) {}
                    // 和旧的全局隐藏表完全一样时，不要把别的节点用过的标签补进来。
                    if (!(globalDump && nodeDump && globalDump === nodeDump)) _mergeHiddenKeysIntoTextarea();
                }
                _pruneHiddenToText();
                var _keepEdit = _avUserEdit;
                _saveHidden();
                syncWidget();
                _avUserEdit = _keepEdit;
                _applyChipLayout();
                if (_chipMode) renderChips();
                collapseHiddenWidgets();
            }
            function _avInitBlank() {
                if (_avConfigured || _avUserEdit) return;
                _hiddenTags = {};
                tagTextarea.value = "";
                var hw = node.widgets?.find(function(w){return w.name==="_db_hidden_tags";});
                if (hw) hw.value = "{}";
                var fw = node.widgets?.find(function(w){return w.name==="_db_full_tags";});
                if (fw) fw.value = "";
                var tw = node.widgets?.find(function(w){return w.name==="text";});
                if (tw) tw.value = "";
                try { localStorage.removeItem("db_av_content_" + node.id); } catch(e) {}
                try { localStorage.removeItem("db_av_hidden_" + node.id); } catch(e) {}
                _applyChipLayout();
                if (_chipMode) renderChips();
                collapseHiddenWidgets();
            }
            var _prevOnCfg = node.onConfigure;
            node.onConfigure = function() {
                _avConfigured = true;
                var r;
                if (typeof _prevOnCfg === "function") r = _prevOnCfg.apply(this, arguments);
                try { _avRestoreUi(); } catch(e) { console.error("[AV] restore", e); }
                return r;
            };
            setTimeout(function(){ if (_avConfigured) _avRestoreUi(); else _avInitBlank(); }, 200);
            setTimeout(function(){ if (_avUserEdit) return; if (_avConfigured) _avRestoreUi(); else _avInitBlank(); }, 500);
            var _prevAvResize = node.onResize;
            node.onResize = function () {
                var r;
                if (typeof _prevAvResize === "function") r = _prevAvResize.apply(this, arguments);
                if (_chipMode) _applyChipLayout();
                return r;
            };
            node.serialize_widgets = true;
            this.addDOMWidget("db_pt_ui","div",container,{onDraw:function(){}});
            collapseHiddenWidgets();
            setTimeout(collapseHiddenWidgets, 80);
            setTimeout(collapseHiddenWidgets, 400);
            container.style.pointerEvents = "auto";
            container.style.position = "relative";
            // 默认大小（宽2倍，高3倍）
            if (node.size && !node._initialSizeSet) { node.setSize([node.size[0]*2, node.size[1]*3]); node._initialSizeSet = true; }
        };
    },
});

