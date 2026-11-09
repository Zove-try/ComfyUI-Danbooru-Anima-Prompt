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
import { openPromptFavPopup } from "./danbooru_prompt_favorites.js";
import { $el } from "/scripts/ui.js";
import { api } from "/scripts/api.js";
import "./00_anima_theme.js";
import "./00_anima_fav_grid.js";
import "./01_anima_chip_flyout.js?v=19";
console.log("[PT] Module loaded");

// ── graphToPrompt 补丁（对齐参考节点 PromptStashPassthrough）──
// 内容模式（use_input_text=false）时，queue 提交前把透传节点的 text 输入链接从 API prompt 删掉。
// lazy 的 check_lazy_status 是后端执行时才调用，前端 graphToPrompt 会把所有连接节点都收进 prompt——
// 若反推链上有输出节点（cleanGpuUsed/PreviewImage 等）会拖整条链。删掉 text 链接后反推链
// 无法进入执行图。不动任何 node.mode（不碰用户手动设置），不修改外部节点。
let _ptG2PPatched = false;
const _PT_REV_TYPES = { "QwenTE_ImageInfer": true, "QwenTE_ModelLoader": true, "WD14Tagger|pysssss": true, "WD14Tagger": true, "llama_cpp_instruct_adv": true };
const _PT_OUR_TYPES = {};
["DanbooruText","DanbooruTextConcat","DanbooruTextAdvanced","DanbooruTagPreview",
 "DanbooruTagDedup","DanbooruTagClassifier","AnimaPromptConverter","TagMapper",
 "AnimaPromptCreator","NewbiePromptCreator"].forEach(function(t){ _PT_OUR_TYPES[t] = true; });
function patchPtGraphToPrompt() {
    if (_ptG2PPatched) return;
    if (typeof app.graphToPrompt !== "function") return;
    _ptG2PPatched = true;
    const orig = app.graphToPrompt.bind(app);
    app.graphToPrompt = async function(...args) {
        const result = await orig(...args);
        try {
            const output = result?.output;
            if (!output || typeof output !== "object") return result;
            const g = app.graph;
            if (!g) return result;
            const nodeMap = {};
            g._nodes.forEach(function(n){ nodeMap[n.id] = n; });
            // 对每个内容模式（use_input_text=false）的透传节点处理
            for (const n of g._nodes) {
                if (!n || n.type !== "DanbooruTextPassthrough") continue;
                const uw = n.widgets?.find(function(w){ return w.name === "use_input_text"; });
                if (!uw || uw.value !== false) continue;
                const tin = n.inputs && n.inputs.find(function(i){ return i.name === "text"; });
                if (!tin || tin.link == null) continue;
                const startLink = g.links[tin.link];
                if (!startLink) continue;
                // 1. 找出 text 上游链全部节点
                const visited = new Set();
                const queue = [startLink.origin_id];
                const chainIds = new Set();
                while (queue.length) {
                    const id = queue.shift();
                    if (visited.has(id)) continue;
                    visited.add(id);
                    const nn = nodeMap[id];
                    if (!nn) continue;
                    chainIds.add(id);
                    (nn.inputs || []).forEach(function(inp){
                        if (inp.link != null) { const l = g.links[inp.link]; if (l) queue.push(l.origin_id); }
                    });
                }
                // 2. 从 prompt 删除链上的反推节点（耗时大头）+ 我们插件的文本节点
                const removed = new Set();
                chainIds.forEach(function(id){
                    const nn = nodeMap[id];
                    if (!nn || !output[id]) return;
                    if (_PT_REV_TYPES[nn.type] || _PT_OUR_TYPES[nn.type]) {
                        delete output[id];
                        removed.add(id);
                    }
                });
                // 3. 清理剩余节点对已删节点的引用
                if (removed.size) {
                    for (const pid in output) {
                        const entry = output[pid];
                        if (!entry || !entry.inputs) continue;
                        for (const k in entry.inputs) {
                            const v = entry.inputs[k];
                            if (Array.isArray(v) && v.length === 2 && removed.has(v[0])) delete entry.inputs[k];
                        }
                    }
                }
            }
        } catch(e) { console.error("[PT] strip reverse chain failed:", e); }
        return result;
    };
}
patchPtGraphToPrompt();

// ── 标签格式转化（与提示词组合器规则一致）──
var KEEP_UNDERSCORE = ["score_","absurdres","highres","newest","masterpiece","best quality","very aesthetic","ultra detailed"];
function formatTag(tag, isArtist, mode) {
    var t = (tag||"").trim();
    if (!t) return t;
    if (mode==="raw") return t;  // 原始模式：不做任何转化
    var tl = t.toLowerCase();
    // 1. 下划线→空格（白名单保留）
    var keep = KEEP_UNDERSCORE.some(function(p){ return tl.indexOf(p)===0; });
    if (!keep) t = t.replace(/_/g, " ");
    // 2. 括号转义（权重标签 (tag:1.2) 除外）
    var isWeight = window.animaParseWeightTag ? (window.animaParseWeightTag(t).tag !== t) : (t.indexOf("(")===0 && t.lastIndexOf(")")===t.length-1 && t.indexOf(":")>0);
    if (!isWeight) {
        t = t.replace(/(?<!\\)\(/g, "\\(");
        t = t.replace(/(?<!\\)\)/g, "\\)");
    }
    // 3. @ 管理（仅画师标签）
    if (isArtist) {
        if (mode==="anima" && t.indexOf("@")!==0) t = "@" + t;
        else if (mode==="noob") t = t.replace(/^@+/, "");
        // raw 模式：不做任何 @ 处理
    }
    return t;
}

app.registerExtension({
    name: "Comfy.DanbooruTextPassthrough",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DanbooruTextPassthrough") return;
        window.hookAnimaNodeChrome(nodeType);
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onCreated?.apply(this, arguments);
            const node = this;
            window.applyAnimaNodeChrome(this);
            // 翻译按钮脉冲动画
            if (!document.getElementById("db-pt-pulse-style")) {
                var _style3 = document.createElement("style");
                _style3.id = "db-pt-pulse-style";
                _style3.textContent = "@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}";
                document.head.appendChild(_style3);
            }

            const _ptHideWidgets = new Set(["use_input_text", "prompt_text", "text", "_version", "_db_hidden_tags", "_db_full_tags"]);
            function collapseHiddenWidgets() {
                for (const wg of node.widgets || []) {
                    if (!_ptHideWidgets.has(wg.name)) continue;
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

            var _pauseMode = localStorage.getItem("db_pt_pause_" + node.id) === "true", _useInput = true, _soundPopup = null, _currentAudio = null;

            const container = $el("div", { style: { width: "100%", height: "100%", position: "relative", display: "flex", flexDirection: "column", background: "var(--anima-bg)", borderRadius: "4px", overflow: "hidden" } });
            if (typeof window.applyAnimaPanelGlow === "function") window.applyAnimaPanelGlow(container);
            container.classList.add("anima-pt-shell");
            if (window.animaEnsureModeFrame) window.animaEnsureModeFrame(container);
            function _paintModeFrame() {
                if (window.animaPaintNodeModeFrame) window.animaPaintNodeModeFrame(container, { input: !!_useInput, pause: !!_pauseMode });
            }
            if (typeof requestAnimationFrame === "function") {
                requestAnimationFrame(function () { requestAnimationFrame(_paintModeFrame); });
            } else {
                setTimeout(_paintModeFrame, 40);
            }

            // ── 搜索栏 ──
            const searchInput = $el("input", { type: "text", placeholder: animaTxt("🔍 搜 tag（中文也行）"), style: { width: "100%", padding: "8px 10px", fontSize: "14px", border: "none", background: "var(--anima-well)", color: "#e0e0e0", outline: "none", boxSizing: "border-box", flexShrink: 0 } });
            const acList = $el("div", { style: { display: "none", maxHeight: "150px", overflowY: "auto", background: "var(--anima-bg)", borderBottom: "1px solid var(--anima-title)", flexShrink: 0 } });

            // ── 工具栏 ──
            const toolbar = $el("div", { style: { display: "flex", gap: "6px", padding: "3px 6px", borderBottom: "1px solid var(--anima-title)", background: "var(--anima-bg-deep)", flexShrink: 0, flexWrap: "wrap", alignItems: "center" } });
            const chipArea = $el("div", { style: { flex: 1, padding: "6px 8px", overflowY: "auto", display: "flex", flexWrap: "wrap", gap: "6px", alignContent: "flex-start" } });
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
                        if (en) { en = en.replace(/, /g, "; ");
                            _insertTag(en); _tlCache[en] = v; _sentenceTags[en] = true; inp.value = ""; if (_chipMode) renderChips(); }
                    }
                } catch(e) { console.error("[PT] chip翻译失败:", e); }
                inp.disabled = false; inp.style.background = "";
                chipTransBtn.textContent = animaTxt("🗘 翻译"); chipTransBtn.style.pointerEvents = ""; chipTransBtn.style.animation = "";
            }
            const tagTextarea = $el("textarea", { placeholder: "在此输入或编辑 tag，逗号分隔", style: { flex: 1, width: "100%", padding: "6px 8px", border: "1px solid var(--anima-title)", background: "rgba(var(--anima-well-rgb),.62)", color: "#e0e0e0", fontSize: "13px", outline: "none", resize: "none", boxSizing: "border-box", fontFamily: "inherit", lineHeight: "1.5" } });

            var _chipMode = localStorage.getItem("db_pt_chip_mode") === "1", _tlCache = {}, _tlMissing = {}, _tagColorCache = {}, _renderGen = 0, _hideLock = false;
            var _sentenceTags = {};  // 翻译生成的句子芯片
            var _weights = {};  // tag权重 {tag: 1.2}
            function _applyChipLayout() {
                chipArea.style.display = _chipMode ? "flex" : "none";
                chipInputRow.style.display = _chipMode ? "flex" : "none";
                chipInputRow.classList.toggle("is-on", !!_chipMode);
                chipTransBtn.style.display = _chipMode ? "inline-flex" : "none";
                chipInput.style.display = _chipMode ? "block" : "none";
                tagTextarea.style.display = _chipMode ? "none" : "flex";
            }
            _applyChipLayout();
            fetch("/danbooru_anima/tag_colors").then(function(r){return r.json();}).then(function(d){_tagColorCache=d||{};}).catch(function(){});
            var _mapperCatColors = {};
            fetch("/danbooru_anima/tag_mapper_cats").then(function(r){return r.json();}).then(function(cs){for(var ci=0;ci<cs.length;ci++){_mapperCatColors[cs[ci].v]=cs[ci].c;}}).catch(function(){});
            var _mapperKwColor = {};
            var _mapperKwTs = 0;
            function _refreshMapperColors(){fetch("/danbooru_anima/tag_mapper_cats").then(function(r){return r.json();}).then(function(cs){for(var ci=0;ci<cs.length;ci++){_mapperCatColors[cs[ci].v]=cs[ci].c;}}).catch(function(){});fetch("/danbooru_anima/tag_mapper_rules").then(function(r){return r.json();}).then(function(d){if(d.success&&d.rules){var rs=d.rules;var oldTs=_mapperKwTs;var keys=Object.keys(rs);for(var ri=0;ri<keys.length;ri++){var kw=keys[ri];var col=_mapperCatColors[rs[kw]]||"#888";_mapperKwColor[kw]=col;_mapperKwColor[kw.replace(/ /g,"_")]=col;_mapperKwColor[kw.replace(/_/g," ")]=col;var kwClean=kw.replace(/\\\(/g,"(").replace(/\\\)/g,")").replace(/\\\[/g,"[").replace(/\\\]/g,"]");_mapperKwColor[kwClean]=col;_mapperKwColor[kwClean.replace(/ /g,"_")]=col;_mapperKwColor[kwClean.replace(/_/g," ")]=col;}if(_chipMode&&_mapperKwTs&&renderChips)renderChips();_mapperKwTs=Date.now();}}).catch(function(){});fetch("/danbooru_anima/tag_mapper_mappings").then(function(r){return r.json();}).then(function(d){var tags=d.mappings||{};var keys=Object.keys(tags);for(var ri=0;ri<keys.length;ri++){var kw=keys[ri];var col=_mapperCatColors[tags[kw]]||"#888";_mapperKwColor[kw]=col;_mapperKwColor[kw.replace(/ /g,"_")]=col;_mapperKwColor[kw.replace(/_/g," ")]=col;var kwClean=kw.replace(/\\\(/g,"(").replace(/\\\)/g,")").replace(/\\\[/g,"[").replace(/\\\]/g,"]");_mapperKwColor[kwClean]=col;_mapperKwColor[kwClean.replace(/ /g,"_")]=col;_mapperKwColor[kwClean.replace(/_/g," ")]=col;}if(_chipMode&&_mapperKwTs&&renderChips)renderChips();_mapperKwTs=Date.now();}).catch(function(){})}
            _refreshMapperColors();
            node._ptColorTimer = setInterval(_refreshMapperColors, 60000);
            function _tagColor(tag) {
                var _r = "#555555";
                if (!tag) return _r;
                if (window.animaParseWeightTag) tag = window.animaParseWeightTag(tag).tag || tag;
                if (tag.startsWith("@")) return "#e91e63";
                if (window.animaChipLooksArtist && window.animaChipLooksArtist(tag, _favArtCache)) return "#e91e63";
                if (/^score_|^rating_|^year_/.test(tag)) _r = "#ff9800";
                else if (/^\d+(?:girl|boy|other|1other)$/.test(tag)) _r = "#00bcd4";
                else if (/^1(shot|girl|boy|other|head|breast|animal|pov|night|day)$/.test(tag)) _r = "#00bcd4";
                else { var _mck2=tag;var _mci2=tag.lastIndexOf("_");if(_mci2>0)_mck2=tag.slice(_mci2+1); var _cleanTag = tag.replace(/\\\(/g,"(").replace(/\\\)/g,")").replace(/\\\[/g,"[").replace(/\\\]/g,"]"); var _mc2 = _mapperKwColor[tag] || _mapperKwColor[tag.replace(/_/g," ")] || _mapperKwColor[_cleanTag] || _mapperKwColor[_cleanTag.replace(/_/g," ")]; if(!_mc2){var _words=tag.split(/[ _]+/);for(var _wi=0;_wi<_words.length;_wi++){_mc2=_mapperKwColor[_words[_wi]];if(_mc2)break;}} if(!_mc2)_mc2=_mapperKwColor[_mck2]; if(_mc2)_r=_mc2; else { var _c = _tagColorCache[tag] || _tagColorCache[tag.replace(/ /g,"_")] || _tagColorCache[_cleanTag] || _tagColorCache[_cleanTag.replace(/ /g,"_")]; if (_c) _r = _c.c; } }
                return _r;
            }
            // ── 工具栏 ──
            function _btn(x, txt, title, bg, fc, fn) {
                var b = $el("span", { textContent: txt, title: title, style: { fontSize: "11px", cursor: "pointer", background: bg || "rgba(255,255,255,0.06)", color: fc || "var(--anima-mute)", padding: "4px 10px", borderRadius: "6px", whiteSpace: "nowrap", userSelect: "none", border: "1px solid rgba(255,255,255,0.08)", transition: "all .15s ease" }, onclick: fn });
                b.onmouseover = function(){
                    if (this.classList && this.classList.contains("anima-mode-sw")) return;
                    if (window.animaCheapFx && window.animaCheapFx()) { this.style.borderColor = "rgba(var(--anima-accent-soft-rgb),.45)"; return; }
                    this.style.filter = "brightness(1.35)"; this.style.transform = "translateY(-1px)";
                };
                b.onmouseout = function(){
                    this.style.filter = ""; this.style.transform = "";
                    if (!(this.classList && this.classList.contains("anima-mode-sw"))) this.style.borderColor = "";
                };
                return b;
            }
            var _bx = 2;
            var _chipModeBtn = _btn(0, _chipMode ? "⬡ 标签模式" : "📋 原文模式", "点击切换 原文 ↔ CHIP 芯片模式", "var(--anima-title)", "var(--anima-accent-soft)", function(){_chipMode=!_chipMode;localStorage.setItem("db_pt_chip_mode",_chipMode?"1":"0");_applyChipLayout();_chipModeBtn.textContent=_chipMode?"⬡ 标签模式":"📋 原文模式";if(window.animaPaintModeSwitch)window.animaPaintModeSwitch(_chipModeBtn,"chip",_chipMode);if(_chipMode)renderChips();}); if(window.animaPaintModeSwitch)window.animaPaintModeSwitch(_chipModeBtn,"chip",_chipMode); toolbar.appendChild(_chipModeBtn);
            toolbar.appendChild(_btn(0, "📂 预制", "预制 tag", null, null, function(){openPresetPopup();}));
            toolbar.appendChild(_btn(0, "✨ 收藏", "收藏 tag", null, null, function(){openFavPopup();}));
            toolbar.appendChild(_btn(0, "A 搜索", "Animadex 搜索", null, null, function(){
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
                if (window.openAdexPopup) window.openAdexPopup(); else alert("未找到 Animadex 画师弹窗。请先在画布中添加「提示词创作器」节点后再使用 A 搜索。");
            }));
            var _sep = function(){ return $el("span", { textContent: "|", style: { color: "#333", fontSize: "14px", userSelect: "none" } }); };
toolbar.appendChild(_sep());
            var _cloudBtn = _btn(0, "🌐 翻译", "翻译未翻译标签", null, null, async function(){
                if (!_chipMode) { alert("请先切换到 CHIP 模式（📋）再使用翻译"); return; }
                var _allTags = getTags();
                // 合并块（含;）即使内部碎片有缓存，整块仍需重新翻译
                var _utags = _allTags.filter(function(t){ return !(t in _tlCache) || t.indexOf("; ") >= 0; });
                if (!_utags.length) { alert("所有标签已翻译 ✓"); return; }
                _cloudBtn.textContent = "⏳"; _cloudBtn.style.pointerEvents = "none";
                var _cfg = window.animaResolveTranslator();
                var _miss = window.animaTransConfigError(_cfg);
                if (_miss) { alert(_miss); _cloudBtn.textContent = "🌐"; _cloudBtn.style.pointerEvents = ""; return; }
                _transProvider = _cfg.rawProvider; _freeMode = _cfg.freeMode; _transApiKey = _cfg.apiKey;
                var _prov = _cfg.provider; var _key = _cfg.apiKey; var _mod = _cfg.model; var _url = _cfg.baseUrl;
                var _apiTags = _utags.map(function(t){
                    // 合并块还原逗号再发
                    if (t.indexOf("; ") >= 0) return t.replace(/; /g, ", ");
                    // 自然语言块（含空格或逗号）保持原样，tag 才转下划线
                    return (t.indexOf(" ") >= 0 || t.indexOf(",") >= 0) ? t : t.replace(/ /g, "_");
                });
                try {
                    var _map = await window.animaCloudTranslate(_apiTags, { cfg: _cfg });
                    var _td = { success: true, translations: _map || {} };
                    if (_td.success && _td.translations) {
                        var _cnt = 0;
                        for (var ui = 0; ui < _utags.length; ui++) {
                            var _hit = window.animaPickTranslation(_td.translations, _utags[ui], _apiTags[ui]); if (_hit) { _tlCache[_utags[ui]] = _hit; _cnt++; }
                            // 合并块：先用已有缓存拼，缺少的才请求 API
                            else if (_utags[ui].indexOf("; ") >= 0) {
                                var _parts = _utags[ui].split("; ");
                                var _needApi = [];
                                for (var pi = 0; pi < _parts.length; pi++) {
                                    var _lookup = _parts[pi];
                                    if (!_tlCache[_lookup] && !_tlCache[_lookup.replace(/ /g, "_")]) {
                                        _needApi.push(_lookup);
                                    }
                                }
                                if (_needApi.length) {
                                    var _pApi = _needApi.map(function(p){ return p.replace(/ /g, "_"); });
                                    try {
                                        var _pmap = await window.animaCloudTranslate(_pApi, { cfg: _cfg });
                                        if (_pmap) {
                                            for (var ni = 0; ni < _needApi.length; ni++) {
                                                var _pv = window.animaPickTranslation(_pmap, _needApi[ni], _pApi[ni]);
                                                if (_pv) _tlCache[_needApi[ni]] = _pv;
                                            }
                                        }
                                    } catch(e2) {}
                                }
                                // 用缓存拼出合并块翻译
                                var _combined = [];
                                for (var pi = 0; pi < _parts.length; pi++) {
                                    _combined.push(_tlCache[_parts[pi]] || _tlCache[_parts[pi].replace(/ /g, "_")] || _parts[pi]);
                                }
                                _tlCache[_utags[ui]] = _combined.join(", ");
                                _cnt++;
                            }
                        }
                        renderChips();
                        if (_cnt === 0 && _utags.length > 0) { alert("翻译完成，但未获取到翻译结果。后端返回: " + JSON.stringify(_td).slice(0,200) + "。请检查顶栏翻译设置，或换一个提供商后再试。"); }
                        else if (_cnt < _utags.length) { alert("已翻译 " + _cnt + "/" + _utags.length + " 条，其余没有返回。可以再点一次翻译补齐。"); }
                    } else {
                        alert("翻译失败: " + (_td.error || "未知错误"));
                    }
                } catch(e) { alert("请求失败: " + ((e && e.message) ? e.message : e)); }
                _cloudBtn.textContent = "🌐"; _cloudBtn.style.pointerEvents = "";
            });
            toolbar.appendChild(_cloudBtn);
            // ── 合并模式 ──
            var _mergeMode = false;
            var _mergeSelected = {};
            var _mergeBtn = _btn(0, "🧩 合并块", "合并自然语言块", null, null, function(){
                if (!_chipMode) { alert("请先切换到 CHIP 模式（📋）"); return; }
                if (_mergeMode) {
                    // 执行合并
                    var _sel = Object.keys(_mergeSelected).map(Number).sort(function(a,b){return a-b;});
                    if (_sel.length < 2) { _mergeMode = false; _mergeSelected = {}; _mergeBtn.textContent = animaTxt("🧩 合并块"); _mergeBtn.style.background = ""; _mergeBtn.style.color = ""; renderChips(); return; }
                    // 检查是否相邻
                    for (var mi = 1; mi < _sel.length; mi++) {
                        if (_sel[mi] !== _sel[mi-1] + 1) { alert("只能合并相邻的芯片，请重新选择"); return; }
                    }
                    var _all = getTags();
                    var _merged = [];
                    for (var mj = _sel[0]; mj <= _sel[_sel.length-1]; mj++) { _merged.push(_all[mj]); }
                    var _newBlock = _merged.join("; ");
                    // 替换
                    var _newTags = [];
                    for (var mk = 0; mk < _all.length; mk++) {
                        if (mk === _sel[0]) { _newTags.push(_newBlock); }
                        else if (mk > _sel[0] && mk <= _sel[_sel.length-1]) { continue; }
                        else { _newTags.push(_all[mk]); }
                    }
                    setTags(_newTags);
                    _mergeMode = false; _mergeSelected = {};
                    _mergeBtn.textContent = "🧩"; _mergeBtn.style.background = "";
                } else {
                    // 进入合并选择模式
                    _mergeMode = true; _mergeSelected = {};
                    if (_batchMode) { _batchMode = false; _batchSelected = {}; _batchBtn.textContent = animaTxt("☑ 批量"); _batchBtn.style.background = ""; _batchBtn.style.color = ""; _refreshBatchBar(); }
                    _mergeBtn.textContent = animaTxt("🧩 合并选中"); _mergeBtn.style.background = "#e94560";
                    _mergeBtn.style.color = "#fff";
                    renderChips();
                }
            });
            toolbar.appendChild(_mergeBtn);
            // ── 批量模式 ──
            var _batchMode = false;
            var _batchSelected = {};
            var _hiddenTags = {};
            try { _hiddenTags = JSON.parse(localStorage.getItem("db_pt_hidden") || "{}") || {}; } catch(e) { _hiddenTags = {}; }
            // migrate legacy per-node key (historical versions)
            var _oldH = null;
            try { _oldH = JSON.parse(localStorage.getItem("db_pt_hidden_" + node.id) || "null"); } catch(e) {}
            if (_oldH && typeof _oldH === "object") {
                var _changed2 = false;
                for (var _ok in _oldH) { if (!_hiddenTags[_ok]) { _hiddenTags[_ok] = true; _changed2 = true; } }
                if (_changed2) { try { localStorage.setItem("db_pt_hidden", JSON.stringify(_hiddenTags)); } catch(e) {} }
                try { localStorage.removeItem("db_pt_hidden_" + node.id); } catch(e) {}
            }
            var _saveHidden = function() { var _s = JSON.stringify(_hiddenTags); try { localStorage.setItem("db_pt_hidden", _s); } catch(e) {} try { localStorage.setItem("db_pt_hidden_" + node.id, _s); } catch(e) {} var _hw1 = node.widgets?.find(function(w){return w.name==="_db_hidden_tags";}); if (_hw1) _hw1.value = _s; };
            var _batchBtn = _btn(0, "☑ 批量", animaTxt("空白处框选，拖动已选标签可一起改顺序"), null, null, function(){
                if (!_chipMode) { alert("请先切换到 CHIP 模式（⬡）"); return; }
                if (_mergeMode) { _mergeMode = false; _mergeSelected = {}; _mergeBtn.textContent = animaTxt("🧩 合并块"); _mergeBtn.style.background = ""; _mergeBtn.style.color = ""; }
                _batchMode = !_batchMode;
                _batchSelected = {};
                _batchBtn.textContent = _batchMode ? "☑ 批量 开" : "☑ 批量";
                _batchBtn.style.background = _batchMode ? "#e94560" : "";
                _batchBtn.style.color = _batchMode ? "#fff" : "";
                renderChips();
                _refreshBatchBar();
            });
            toolbar.appendChild(_batchBtn);
            // ── 持久批量操作栏 ──
            var _batchBar = $el("div", { style: { display: "none", gap: "8px", padding: "4px 8px", borderBottom: "1px solid var(--anima-title)", background: "var(--anima-bg-deep)", flexWrap: "wrap", alignItems: "center" } });
            function _refreshBatchBar() {
                _batchBar.innerHTML = "";
                _batchBar.style.display = _batchMode ? "flex" : "none";
                if (!_batchMode) return;
                var _sel = Object.keys(_batchSelected);
                var _selAll = $el("span",{textContent:"\u2611 \u5168\u9009",style:{padding:"3px 8px",borderRadius:"3px",background:"var(--anima-title)",color:"var(--anima-accent-soft)",cursor:"pointer",fontSize:"11px",userSelect:"none"},onclick:function(){var _allT=getTags();_batchSelected={};for(var _ai=0;_ai<_allT.length;_ai++)_batchSelected[String(_ai)]=true;renderChips();_refreshBatchBar();}}); _batchBar.appendChild(_selAll);
                    var _mvB = $el("span",{textContent:"\ud83d\udcc1 \u79fb\u52a8("+_sel.length+")",style:{padding:"3px 8px",borderRadius:"3px",background:"var(--anima-title)",color:"var(--anima-accent-soft)",cursor:"pointer",fontSize:"11px",userSelect:"none"},onclick:function(){
                        var _rc = _mvB.getBoundingClientRect();
                        _folderPickMenu(_rc.left, _rc.bottom + 4, function(_tgt){
                            var _keys = _sel.map(function(i){ return getTags()[Number(i)]; }).filter(Boolean);
                            if (!_keys.length) return;
                            var _body = _tgt === '__uncat'
                                ? JSON.stringify({action:"remove_from_all",category:"artists",item_keys:_keys})
                                : JSON.stringify({action:"move",category:"artists",item_keys:_keys,target_folder:_tgt});
                            fetch("/danbooru_anima/favorites/folder", {method:"POST",headers:{"Content-Type":"application/json"},body:_body})
                            .then(function(r){return r.json();}).then(function(d){ if (d.success) { _batchSelected = {}; _refreshBatchBar(); loadFavs(); } else alert(d.error || "\u79fb\u52a8\u5931\u8d25"); });
                        });
                    }}); _batchBar.appendChild(_mvB);
                if (_sel.length) {
                    var _delB = $el("span",{textContent:animaTxt("🗑 删除(")+_sel.length+")",style:{padding:"3px 8px",borderRadius:"3px",background:"#3a1a1a",color:"#e94560",cursor:"pointer",fontSize:"11px",userSelect:"none"},onclick:function(){var _t3=getTags();var _s3=_sel.map(Number).sort(function(a,b){return b-a;});for(var si=0;si<_s3.length;si++){var _rm3=_t3[_s3[si]];if(_rm3&&_hiddenTags[_rm3])delete _hiddenTags[_rm3];_t3.splice(_s3[si],1);}_saveHidden();_batchSelected={};setTags(_t3);renderChips();_refreshBatchBar();}}); _batchBar.appendChild(_delB);
                    var _hideB = $el("span",{textContent:"👁 隐藏("+_sel.length+")",style:{padding:"3px 8px",borderRadius:"3px",background:"linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi))",color:"#ffffff",cursor:"pointer",fontSize:"11px",userSelect:"none"},onclick:function(){var _t1=getTags();for(var si=0;si<_sel.length;si++){_hiddenTags[_t1[Number(_sel[si])]]=true;}_saveHidden();_batchSelected={};renderChips();syncWidget();_refreshBatchBar();}}); _batchBar.appendChild(_hideB);
                }
                if (Object.keys(_hiddenTags).length) {
                    var _showB = $el("span",{textContent:"👁 显示全部("+Object.keys(_hiddenTags).length+")",style:{padding:"3px 8px",borderRadius:"3px",background:"#1a3a1a",color:"#4caf50",cursor:"pointer",fontSize:"11px",userSelect:"none"},onclick:function(){_hiddenTags={};_saveHidden();renderChips();syncWidget();_refreshBatchBar();}}); _batchBar.appendChild(_showB);
                }
            }
            var pauseBtn = _btn(0, _pauseMode?"⏸ 暂停 开":"⏸ 暂停 关", "点击开启暂停模式", _pauseMode?"var(--anima-title)":null, _pauseMode?"var(--anima-accent-soft)":null, function(){_pauseMode=!_pauseMode;pauseBtn.textContent=_pauseMode?"⏸ 暂停 开":"⏸ 暂停 关";if(window.animaPaintModeSwitch)window.animaPaintModeSwitch(pauseBtn,"pause",_pauseMode);_paintModeFrame();localStorage.setItem("db_pt_pause_"+node.id,_pauseMode);var _pw3=node.widgets?.find(function(w){return w.name==="prompt_text";});if(_pw3){_pw3.value=_pw3.value+" "; if(_pw3.element)_pw3.element.value=_pw3.value;}}); if(window.animaPaintModeSwitch)window.animaPaintModeSwitch(pauseBtn,"pause",_pauseMode);
            var uiBtn = _btn(0, "📥 输入", "使用上游输入", "var(--anima-title)", "var(--anima-accent-soft)", function(){_useInput=!_useInput;uiBtn.textContent=_useInput?"📥 输入":"📝 内容";if(window.animaPaintModeSwitch)window.animaPaintModeSwitch(uiBtn,"io",_useInput);_paintModeFrame();var uw=node.widgets?.find(function(w){return w.name==="use_input_text";});if(uw)uw.value=_useInput;console.log("[PT] 模式切换 nodeId="+node.id+" isInput="+_useInput+" api="+(!!api));if(api)api.dispatchEvent(new CustomEvent("db-pt-mode-change",{detail:{nodeId:node.id,isInputMode:_useInput}}));}); if(window.animaPaintModeSwitch)window.animaPaintModeSwitch(uiBtn,"io",_useInput);
            var continueBtn = _btn(0, "⏭ 确认输出", "编辑完成后点此输出到下游", "#e94560", "#fff", function(){}); continueBtn.style.display = "none"; continueBtn.style.fontSize = "13px"; continueBtn.style.fontWeight = "bold"; continueBtn.style.boxShadow = "0 0 8px rgba(233,69,96,0.4)";
            toolbar.appendChild(pauseBtn);
            toolbar.appendChild(uiBtn);
            toolbar.appendChild(continueBtn);
            // ── 提示音系统 ──
            var _soundEnabled = localStorage.getItem("db_pt_sound") !== "off";
            var _soundLock = false;
            var _soundType = parseInt(localStorage.getItem("db_pt_sound_type") || "0");
            var _transProvider = localStorage.getItem("db_trans_provider") || "free";
            var _transApiKey = localStorage.getItem("db_trans_api_key") || "";
            var _transModel = localStorage.getItem("db_trans_model") || "";
            var _transBaseUrl = localStorage.getItem("db_trans_base_url") || "";
            var _freeMode = localStorage.getItem("db_trans_free_mode") || localStorage.getItem("db_free_mode") || "baidu";
            var _dsModel = localStorage.getItem("db_ds_model") || "flash";
            var _akInp = null;  // API Key 输入框引用（设置弹窗创建后赋值）
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
            function _saveTransKey(k) {
                var p = _transProvider;
                if (p === "deepseek") localStorage.setItem("db_trans_key_ds", k);
                else if (p === "siliconflow") localStorage.setItem("db_trans_key_sf", k);
                else if (p === "custom") localStorage.setItem("db_trans_key_cu", k);
                else if (_freeMode === "baidu") localStorage.setItem("db_trans_key_bd", k);
                else localStorage.setItem("db_trans_key_ms", k);
                _transApiKey = k;
            }
            _loadTransKey();
            var _customSoundUrls = {
    "曼波": "data:audio/mpeg;base64,SUQzBAAAAAABRlRYWFgAAAASAAADbWFqb3JfYnJhbmQAaXNvbQBUWFhYAAAAEwAAA21pbm9yX3ZlcnNpb24ANTEyAFRYWFgAAAAoAAADY29tcGF0aWJsZV9icmFuZHMAaXNvbWlzbzJhdmMxbXA0MWlzbzUAVFhYWAAAAC4AAANkZXNjcmlwdGlvbgBQYWNrZWQgYnkgQmlsaWJpbGkgWENvZGVyIHYyLjAuMgBUU1NFAAAADwAAA0xhdmY1OC43Ni4xMDAAAAAAAAAAAAAAAP/7UAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEluZm8AAAAPAAAAMgAAUnEABwwMEREWFhsbICAmJisrMDA1NTo6Pz9ERElJTk5TU1hYXV1iYmdnbGxycnd3fHyBgYaGi4uQkJWVmpqfn6SkqamurrOzubm+vsPDyMjNzdLS19fc3OHh5ubr6/Dw9fX6+v//AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQFhgAAAAAAAFJxxO31qQAAAAAAAAAAAAAAAAAAAAD/+5BkAA/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV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ADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kGRBD/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqg==",
    "曼波duang": "data:audio/mpeg;base64,SUQzBAAAAAABRlRYWFgAAAASAAADbWFqb3JfYnJhbmQAaXNvbQBUWFhYAAAAEwAAA21pbm9yX3ZlcnNpb24ANTEyAFRYWFgAAAAoAAADY29tcGF0aWJsZV9icmFuZHMAaXNvbWlzbzJhdmMxbXA0MWlzbzUAVFhYWAAAAC4AAANkZXNjcmlwdGlvbgBQYWNrZWQgYnkgQmlsaWJpbGkgWENvZGVyIHYyLjAuMgBUU1NFAAAADwAAA0xhdmY1OC43Ni4xMDAAAAAAAAAAAAAAAP/7UAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEluZm8AAAAPAAAAQwAAbjMABQkNDREUFBgcHCAkJCcrKy8zMzY6Oj5CQkZJSU1RUVVZWVxgYGRoaGxvb3N3d3t/f4KGhoqOjpKVlZmdnaGkpKisrLC0tLe7u7/Dw8fKys7S0tba2t3h4eXp6e3w8PT4+Pz/AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQFXQAAAAAAAG4zOCDibQAAAAAAAAAAAAAAAAAAAAD/+5BkAA/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVFg3lAEABrsQBn625tqWJp41xhzPpzyZB8B5xycKxoCtptgHxnyeZl6dJluSBs41RmYK4OQsxcG4xqF4wfHgzAJQxWKw1KXY08CYxqb46gng2GJQ0RoOjXTGHg3pGARgOhpjYuNBYUAgEGK6LgJqMzSLgZYRgkfAANQnCspAQNBzEc5Bu//uSZEIP8AAAaQAAAAgAAA0gAAABABwCAAMAACAGgEAA8AAEblQmMiWrOCe0SFCczeMDyAwdOz9gwiXnkJ/GsWQr321+LIm1+LH2FlV77Czljl1/sOav5t/FnNv4v+jmt/RyzHXvlOu5HLCA+OkIjwOAjLCACOkIjo+DJ4fARlhIBHSGCA+AjbMdpmOuABO15fM7omMT9LP03bOGuuPSGMMkThMfACEhYMXyLPKlMWrOjXJsxrJBymwRXXQMBDMAjKuxKkaAsqQzCo5LcObgQQY4kY4Ew0CgS37/JDq7gpYR1H3a/PP4BZwEDBGK1hQYUFESNtRBFGwmj1Ri0ert0gybdCQBGWEAEdIRHB8BGePgZtGCI+DJg+BmePgZtHiI+DBg+Bm4+TPrzJ8GnH6575N9e6+/deQzVWhTWJFJMtoigy7x2jaQYaM2QIo3aVfTRQVmM0Qw01OgyjFpFJMQIawx3BoDEUH8NBoeowdAYxqPc6BTUy1Qg5URIz/T00q2g+8DEzliQ6cR41uXQ22GI26Eg2HKE1CQIx5LcwKHoLieIv/7kmT/i/csSJ2ru2SiroUDsHdJXFrxgogPdM1KYBnQge4VOAwFQfBgFK4ZM7rrTk3SYy5ZieT69p94c6VhkD0LKNoaHHjF5qK0E0zD2k5FYZBNVxbP+7fZ+J32f5WatBOHqdyH/7tO7mw//7PU1KSkw6BMxyppFFatlJEOMGDyB5U1K1oJmFnSkGDJoWJVUaMrZpw0zhODsa74OPIogw2DYzGIVaNHNcE2W2pzIRFPM4oWI53TTAcSNxBQyyDTkjKMZAEKj80ONzF4sNfHYVP5itSHYFUY1KJnhtHQBsaDHJn8tmPi0YWEosGkaFXPQ8O2VKYrfRwWO3CA5iUgofDguJK0xCPVqb////6KimKLDhwuKHDKTCP//5U0ZCK5uoyZNA50UGjJlUgYUDUY2vecld9lC6FpBAeDgghGCBMWVUgmgoZPgYEQvooHPCKc86EIRkZSdGQQ3nehBZ0n0JOBn6zufzgZP/+d7HP0EUI2pxZCE9Cfo10ADnww/g+7UCYnL4Pg+gE5J0GA1u5hELBJKnUypXD6etcA4Jneo/4f////+5JkPIjy5Um9kwwR4DQh15EExgIJ/LcRNLKAAP0uIEKMIAEoCCi6OU//wQOBYMfWHy58lD4Y+SPn3EAYa6VA4Nidby99xUMWWZWMM5AIBA4JGoyNOnOovRlbzuJ7VFxdxgcAMXc/OewmBxd6jD/kFDn5D1g4t9bQ+9YOAgGJeciBwgdQ7IP4IdQZUwgm6u+qz4WdDtBw6T2O9TMje/6P/kAG/////0FmEDIVwjH8joI////5zuQYcg3/xAh6i1DlRYQ5yf9QaKEzRu2+6q//qdlBQFKJYhlkbbi95bU4hWJUNtyYlmCUN2NjZ4eM2HbjYsexYcKECy5jLnCwfOEsrKNRlMocUUkQKDcbnk6F7T6ytRyaea/bMp2e7L2dDJlvfaWebMfaj9x6j+j77/77uif17kJVphqmrqwEQAANYrgpA3LCOgw4w4oYQF3RXGVJRzzaL3uW9R8HIQQ//Jn9+dMf6CT/+z6KLUWuxX+I0S/t/Xg1Pr+vl9n9sWa+Dw5LnpQ50IdokXNzyciEKu2NhOeCQLDlJAsEQFgFFHRggDwJ//uSZGuAA1RjSk4w4AI7Y8jpwZQADf0BcbjzgBDkqGd3CwACyjHFGQHgzg/ExAmPqKBYcw6JYlgSYuTMIOYUPLk88uKS5LTp9/zvv0bu7HnG+j8gYECYEMlEgRmACPVw4U+hMIBoMDIIBAACQIBgNi8uRvAdJc2LvgTxzgxuv6FJD/U7f////+yav1/9v///+p3////6Z0OBtZTXq4VIICE9Y4CoHXh2GnkTqMMQjmGIHOxhgbGUcQSTCILHhalnJrrmZB/GTAuxJ8/EDHgMJOlS8h5iR/jPzLf6gx4xBBdyUGmSvC+b8V83riKiF3ZD0+aZby+PSirP/9xQeZgkEhwkCZgKxRqbSZOCjXNsAQAAAIAgJDFHpYCyqMEB4zwVgy8kOLcjCADnnkiulQXADUBAo2ZmjJ1Dr59oUFlrv////O//49bP6n4LoqkOVzA4tLcrqwUsoQcXHMo//p/mR7o//VukZEBykyh4eU1BEBDjU7iYiuMVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVViAAgAAMSAP/7kmSDAPOKJFf/beAAAAANIOAAAQ0hBVetPK3QAAA0gAAABBQCIfuu4qih2Ah+uhS+KOUZRBGtkQkHLtfALEAYKvElfsDs5IiDVdJVhix0ky4////+//uHCs9q3oeoXpwmIxpaLeMfjG9EwSLED2T//mT2/6tWkyoxTkZBBjMeKyv27+on2mHcYAAwFAQAwAE85sDrUMMlk8OfAwdAwXJGg4SnF6kYwCimRacGgAw2rBYqKfi7IhCADIRJFj68oJBAkht5zwiQS6v4Wc6Tn/UoLX/2MQfV5UgMtDF6tllAjoEqm/5BCb0AS5y4eS8l03qnibQrPP/////i4aVr/pf9e5uWEIqyiRYQTSQ6kFDlkuIAjDGvRifioRYb1U22dmQiAAAwAwHzAwB+MRduM0Mh9jAQAdMAEAowKA2zJMSWPGJaUyFg3zB3AoMA8D8wlSGzLDJlEiBCgFsw4SDMiENfYo3+ZjEoWLcEorMhigzcKwQHjCwOMNDY04zjFiQMNSSjoQSJRyMMZ17tLsvUMIGBRZpK5mQYAAo8yw0xw0w5U1b/+5BkwoDzYD7T+28r4gAADSAAAAES3TU9rmUPyAAANIAAAATERsjPiSUoY00DUJ01JmDBzE5hTpgB4w2NxmG0ZryiXiEwCDUhAQPIALrNp//////////////9yC5juE3LJdciL+vzGGXoVrZmmAMwMcARWeFfkrAwdLBcwGABYQYAY0hlLcFcRKMOS6jhPXDc/OwHD71S6S1Idm6n0u73Znj6I9gABAwIQfzDhUXMVwNcwUgHDBRAeMBMYw0VwGzEUBlMEkEYwDQJTFGLIMvAK04l+MDAjAyk4i6MoUzamcwYEFSExMGMIFzQi1zDXVEHRo/mQuYp579nSQZiZMSsuE77hSO7nnJ6tZrrOlUIrDKXgiVMgtJhyhUBKMBdDoQIDMZEy5j7FEBBSaTHgrMGpBg6aSoWuU8PUOf////////////////65+t9w/r6utSPOvhratsQUVfRuJQK36a7Gk5XJjN2CoTJoje/XYxIe41rXzs9TctePkxBTUUzLjEwMKqqqqqqoAAAABAAQ5LOoymUaCIxWDXkYeCDcawHSSL/+5Jk/4/3/0/IA9zToAAADSAAAAEa3TMqD28siAAANIAAAATKxAADFkUMOAAu20FaAQa5RelIVAtmJx6WFUGxeimR0DhgOfPvZa5/N8W96RvdjVcCuVA36quGG7LSMSgimI5xxkl+MP841f/////+i01ILqQonZyhGhxMxrr/mY5xM6CuEAAAoAHPuDoBmwoMpET7GwSZxxkH5WAyTxYG84rdsxoBssAq5xg4TwDLODActFzrhNqmAVARzRlpyRgINiVXvxcjNq1+4RZ/5tyr+6zuZX37TnTCcZ/XLJQSvotWVjMoJQhZ+1cQkxoC/VWIOzehVBXs8/5n///+x0YllOIgKzkRUGkThiSDwL4uSjEFJchZv88mRyIXHUKnHZE9TEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVXTAADQBAC41Dr9I0nLiUNAlZy0jKFGOEDtA5DAwIWT2k4RdMIYC4UJLgEQ1AIEFUkfE230tQnmFqteeWnE//uSZMwE89tMUWOPLbIAAA0gAAABE2k/OO7pT8AAADSAAAAECxE2klcEK5iL33XCZ3Gs4/Kf/mNa9hXYjLeLzaey2PWm4iERKMCACOkAeyRLBESkTpkffUat//7//dnaki62UZEk7F0sqWs4zuzL6l1s971zEw5xUUBMh/9WAAgQAw1NJaIJC40jOkssh+DAqMB58MTwnBIDAUCzDJNjkgzx4cBkqFAs5LdMkDxELCgACDQ8kKBxiVAQAmpnZohBCIZMTKF+vNUlQ0LRGRTLzS7/uy7/eqWxOk47sWvVhwLgme6ooYYAuQ68iRgDgs+SARQ9WZKVuT2//7P/8zZbGZtNUzY0QNiy5azG5eWmpq1ZkaVubpnDEvqtMzYn5/EyIIACBAESeFhQ6TzEsST9ZeYGAxuUOG4xMqEqA0wXmjcLLAoGMFBkWABou4GOQQgoTCMytICtzod2AA4BmoAcnwv20YEIseitLorNpcMWO2u/H738kiJdqziyaHrNZqKzPlLMgkeD5lrQBSGh2tytwm9oe4s2lfb9zDv//N/+TseGCv/7kmTdhPS1TM9TmotwAAANIAAAARRpOTku7a3IAAA0gAAABCWDOaQSoIompWoraVKECoOcbAhKzjZEAAbcAH+/9fjH/jArmN2QESN0fz////zE3DKLn2BGbR1n///+qOn7+lGRWMwQDAFJQqwBDYWAAzmKtByHxEAYozJgoEwKA1JwwbDg4hC8aKtEpUpgkwpqBISAKIhm+8enDmVgK8hUIJVsFGkVoGtGKgNNhihOafhqNvFFOymU87lJJXT3Z1xWCUjhNdk8OQCqRVN5LqHQSDgMASmVQrDGXwzKOa7U+n////5nrR0VGMDIQqI/cuUrYYKim3R7t844f//X//6/rsl35uje////7iIBMzioiGWJW6oIICIIcJJCry55Fzv/+8dUJAKCCrbUl61WZ6bHaCw80SpgQIAAAgC1UY1qqSxsVIJQx1PYwZHTLgRdgvoYBG50wfBCaBwRDAkOKkyoS0Ui2IVChjWbGPgwpeMABeIG6/ktl4i1EpBarK1SvWLxwJzVx9JZz4m4F7J/oZgS9KmxSB+Jej0DwqTgJ928ZY7/+5Jk/4Tkvk/OM5kVQCvMpvMAKfZSbSM9TuxPyO6y2sgD69m9/K639/lqWXufT//8/nq2xeyngQchCMyu7f+sAQUxm8qAAYf//+X//q7bv////qWPgzAYfA46bOAseA8asAhEB+1AWUDKEKSf9zQUuCN0LeQFVifA1xEEXo1WhDBacEeaPMJ3mQIq10hEwxEcmhipdJaJUADCaoBDkUhQgDwi2leUYBJYa4HQ7BEdMBAmod4spBef3k8LN/+q6lj+0FFz8YD/8duXb+acJklihcJLqdyQdGxZXA4wyhP0b//08wz+p7TGUCwlqFhsiwnrv4Q/4W1SsNC2k7f6Z+ZgAACSMD/+X/qv//q37//91///u3////9IoAYLh5kzAB6ABQAG4BX4bCkYt/WcCIQLQImcdkR+ACEFlRdVwCBCAAAAKNDksCmU3gtFMCdQuuECB1pAknk7hh8YdECMCXPITYDMWF2kQyYKuGZK7DqF2BD8iJf24Qhhyrt41vfzTxQjX1mb/3bPYpdxoV+vdjbjyUtqbgUYaGAqQxOwY3l/GaTD//uSZPUGhGlJT+uYFNA57LbCBBSeUAkzTa2dfJDysxvoEE24v65Vn/zN//9+MXnfUCcoNZoHvfRfE+Qz0D4/Gos8gAn/8n///l9X/////9f/7etuvq///6PrU+oph6IyQ5JVMTQOiA2DxCgTcc0wf9AvhjUVEWUZoJpJikRBEqvmKABj/Ndd4KAZnJmTCqiKYhKQHFGCZr9RkZMiM5QtdwkAzE3xNSNNZEICD7JGpvHAApmlh/HjC7e2OwW1zHtJNvln9xvcvlchUIz3kOGnqsTlQXFO51GzFLJQ8cNl94T3K8vK7T/nPaoNb//ohPTIV+XoIg9Tiz01PhIuWDgXCLwJu1CECEoVlIV0f////////cwUMDRUOQpmRUPV///1/b/0//9lYGCBo6CWCggYIOgfd/AIVFRUVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVlAQDBAAAAAAZ4deacaeZomxeAUJgVImaOq8i1EmeLdWWNMXcWG7Fb//7kmTyBuQlTNHreCzQPYzGcQQQtBBw/0mN4LUA1K8RSAEO+LWgDFHRDLcX4ICdTH4mlpb1bnEbr7XNf6HFrruRG45dxjODxKm4B90xnKgilXDcsFhk1K2F5gwk46z6m//+qdDb0dzK12CMkVlh/RTNGbU1aFCSuPsw4QPJy7tDfE5QuH6EIiAYDAAAAQAADuyxvgwKZtpMM7UoHXJXBV06jhiKqs1/J8EFAOiTPizHgRzfd5IbIBgCVP3YrhcSwWx1935r6IYtb+FNe+UmSV4xs4TKtZG9iBayJ8+Qbo+TVOQT4XHXfqM5Wg7DoR+Pwmxn//1X9L2VEkB3oAroHgGBs4W3bQ3Q3CYqY5hSix3JyNw+oMHATDHE1U4/QMFsYNVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVrFGAAAA43JsqgjiW3ynm4hfuC0xfVYhCBMrQFh6mCOgJpC7J/WGmBOnJ4JnPHYFWgsrkE1HwUQZ3qu7/+5Jk0wD0Vk3Ue089sAAADSAAAAETOYVP7Ty2wAAANIAAAASOWXvRJ7X/lj+V2GefACZjyUcxIwwTAkbto471FF9FtYpTUjPZ67ArGH+oPxzIBKEAh//6CU3YEVMhjGDWqA4RhsVKLQkj9863RqzjEMVlYj5ug751hM28cJGEH3RyUYggww4coHQGajNCsbkJLgWCgEIKWtsCAobEDJWBnOVtM2v8xCDFIq2GFhKBwAWpjqSJn7aVSuevARZItI6r1d/3qb7////cTjH7Z8hvGblIpWrC8lAsGULnJfaLiMas1/rj700Rh1hKl1NUvTcHly53//nONc31ErLlRCYbHQ4rk0Om126H/82SXsdq+o3Z1l8dEpdiZOPOXkNnVY7OTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpBDAABgIDlOW2GHXE7VpIiGYRlgLcmVHQuOHLp4cLl2AaLmuOJNUF6kVwAdANNBxAj+rk7IQA4V2eDdY//uSZNyG9M9cUltCP5AAAA0gAAABE8GHQo5o80gAADSAAAAEcv7WzYx9ZU5j/7//pcucpmtUt+2krC5RkjqUihl/KpfinnNXmz3+S1JDDfI9PBwf//9SG/7UMKs9BzLFWa5StX+r/6aiJ9n1I7oV9wgPxIu1kHtxIuFJYAQWaOiLzB9OKwK1xQMyM0z0QWUrZkVTCaDngjEamQ6EDBHUMaA8MHQUBJg9TGHU2WAcpio8Z9wJX2hQyVAhlBbIrNsgBO7J6Vqj09/5Jz/tXL0ulKzHLu21HB5mzTJJUlgA4/BTqA0oZYI2Z2sA5U6110ENkFJzU9IkN//9Wf/5WAZ3U4cEA6ExQB3sCt/hCIDrfhnEgbN0R6Cw/qmM5hFyYulKqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqAEAAwAABOV6QZAYLDq3oZVkC49PBApWFhAoKzQ3NNLgNTSWGJWAZOICtr5DIIMrtYiMEPy6GAMNN5QEYcQ8BO5Nydyf+tTW//Vzn83f/7kmTdBvSaXlFjeCzSAAANIAAAARShcTkOaLNAAAA0gAAABO+xmoYuixIiEZE2NSAUDAZyEFCocluAlHssoTS979SLNyYcsWNt///v//d3qBKyASgQeEDIxxJ4jc0ETrAl705qZpO65ZL5t2EqzACAwMdkXwwgADDAJAJMAoCIwQRpTHuE3MCUCQwHgFzBRA2MZBJoxqQTjBmAdDgEjA9CQMcQOsKgDRswGADzA+BdMYAFyXrVLjGanizuPO6OGjFIXevRZlF7Pu63/3GHP3Mw3Jo1AyiwUPrfipeYzOw3AjBnxgC59C6urDtDB13IFnXfMcfFnb7P6zhddW8Ju//////f/e/69b9swkRcIAWFHMZWxbrTTzGWg+SrbZOa4OpkSUowAsIwlzEeRtMFMFkwBgJjAZA/MIIgU1zxLzC5BEMBoD8wFQvDB9n4McARwDCGqBGA0DmYyJAhgIAgDgCgIAFAgUBjrBqgoCwLgEoCTFIom0mosOGRY1NWatYoE0WSdvYw7+W80k+/KXpUYqwMSgRUMh4WrNZMJOD06MSElzD/+5Jk5YX0nD9PU5kU0AAADSAAAAEWwT8wD2kTQAAANIAAAASgEAe4WGGGlsgIJmJIrI402IChItfO/S0ggEIVHijR//9bDz5dP5xHcikOtQ9S60wAm5547ihSOksWI5LosoiGvJJ8YAFgmqylzZL0/1f6v/sr/0b8iv/+6i4QFRcmTkn6yZG6ujdup/5FEgQPrEBwfEYAQABdqgTAQqDhlktRh6AiNBgGB5iAXxk+fhKA6TYOCQyVu4i1QwfAMSBFIMxSLEuoGA+PAqQSDih1TUUnKrpLq72LAQTCe/qQ//1+/+6Tv6vS3WckUCsZ0gjHmlSK/p4fEUKJQG/7GBIq331kpQghv8H2vdVDv//qdynv1fnPqC5tDeQctl8r/+e///v/+6//1mAewG+P//+/tdf/f9ahugYyF7zpwfIAsgWOmkhi0JgHgJGCYDmatI1ZiwABkQNQkDaYhpWhy8AaGIoC2YRoRBh2CKmkOgKbzwExhshDgUEUwJgrDG1JYMD0BghAQMEgD8wSA2jI7BQCAN2QFwjNYiMZABd6QpicHmyQ//uSZP+G5ilLSgPbbNItjLYRBAV+UQkPN07o8YCSstpAAMvRskFRKAFp207j1mFH39wTh8GMJmGZsrEAcMRBl9GWCgEMaJEzwO1bggQGCjKPy8xMASYPEQkMjl00iIgUAlMJ4CkUzAE0uJfMIeupfzjf////////gvdfw1bi2LQ3UFRmAbyMQZwp0Osl5noS1n5pNKMvfSSc3uC5waLCVet7lpwc3fbtNmFFZD9H6kGeq+/0eiEdaohp3M32PtZ0OpNFymbPDNt7rfP52Pnyv/e/lJOgcBQ8OZG2eSpWVWNG58ptp72OmXgExSKJkMqBn/ICjkrGJ92p2dVa2SupdVT2qrXUp66lIFcQkGyRcOjA3gcCWINTDL5MANZAJkiQL7H0xX0iBAEZdAdAJMAIOg2IhfTAeAFQIEAJ5hfkYmw0MyhyGAdzBUJiNcqFMykARDBuA0GgljCmIMPKGEFClcZiIxGL8EbBFDWREDjFxYMmBEwAB7Zg4kGni4Bh9St0EAIXa/OsdUU9/7l2dPNP9baOsoQgBGxBIMgIhB5erJvDCf/7kmTujOcmTcgD3HzQe6zmMgjU5lnpNyJPca/Ag7LdzACr0gOCFSZMF48bTQ5BBCYQyEABAAAYDmn6HAlWdv6B+5N+3///miGouE08mXxwGosx6mgVYSoJqZpIEUcI6DIJZzhMOHR7lNx8MjWYlZkiOY/M2Kj0kA8v/zllznOf///lcP4Lr///////xcNXhRANjhgiwyHaHAAAATBRyDgITBhA/NeUWEwowDjAkABMC8CoyTDbDJwDhMJEEIwYAVTDtGYNqcDowEAIjAqAuMAcAQxIRXgU8p+BYLFXM/wrBQVDLQwNjiwClUIAEMgzKh13ZsgBkwZ5S+XVcKatV3/KXfdZPU1hetkvMVijXmWoBzCwxDYRARjpEYfjg0pNgJR4IQ+QCO/qma/WkX7x////+Z0JbDAbDYQpNUehkDBIK5EFojAbFccEAYNSFRaGU4oSSI8rngqAMQTI/7Ja//3/+fl//qxUiwJWNUEUlLdnQ1611ILSMxmBXBYhvkmTDRM0Nw2A8CNj0HIZmXd2oIsgujZFSTKZJSIgwEyHmUT69X7/+5JkhQ3l+UnJm9tT8HtM5lIFu/ZYTTMiT3Jt2VYymcQKa9m+vWvrn/2ypWxd3Nw/cx/tI6bpF21GkkC7YSvJ5sxdg3BaMEBQMNA9TTCWNJ73XOTEAYAIAhgDAJmAyCUYPw9JqDJkGEsCeYHoCZg4BrGUC4QZG4DJgagBBgEBggkQm8CFIBgDRQJmIioekdpi0ErCDoFNH8kRBkBA56xGTTHYKZi2goEDWA1bEpKODgSsUi47fP+SOZ39ZT3dV8IdltocAbuzMXMMBcIFSIQcCTEJLM0lIyWBiKA3RAFuN4ZZA+KFHaaf////Ptc4fqNydLrG2QEZUOhDlSCDpGZHYiXiaNjUul5aJMsUSAlqWSZNTJk5dkhf/6u2kiXghJAdY0tAZgxSWUDoGhtg5eOspHkm//quq31vQZNbavqV1f//LGsOCzCqCILQNcne81YYG7QwdOOcOsKID4OqM3g0RBDahjStx0Eb81MwaoAAkAQIMxFAEBIOmFCZHRExmIASFADGAgpmy/6mChLGGgJmCIHGJRenx4fGAQHITDBBg80f//uSZBqE9C5BSzu7o0BDjMcAABGOD4SbLE93JVEBMpyAAE44JgRZ6+QWUA5ubSBiQrIheH3VGQQDRbBrOlfXMDL1Pzf2qOh0xeOlICLwQwrkNBrfAaFCdhYRIwuUfQrWv////6k2l310vUpalJozIZ7YwCgL9YbgBsmiBs/SC6wdspmP/////qWX1Fwih5P9TCzxkzN/JgDxI8WQZplgPgGZE7kXOjMAdgWZNTyUwIKDTiGByYnc4sgBAZKoiPAOGCqAoBo3jCPAFMJgKMPQ7OigUNdiDMHwGMAgACoBnxITgoDyIGRQEzCsii3xfwhBQxDOQDsM5iBA6PFuJBzCzXuc2B7q0af6/P/9fT/93P//dfKhcybl8sL/ibDT5eZFZAk1xwmwl+Ji9/2an//+e+ah+QI/xPQt2p+cC6Qty1f////0+4qBAx4C18tP/JQG1RNQuKf8fQN1gsNEC3OCFgB2i5jdMGig9IhUm0DUgIMUDeoPvYACAeCXxbEwAQCjAiDfM24swDCOg4CswBAWjDZVkMd8M0wWQEjAIAmMFsWE0P/7kmQWhPSRP8qz24twLmzngAANrhGo/yxO7K/AuTPeAAA2uEQDzCRAVBRoARM1D7NsJhwNipnLaeMWCwbL1smZDhh4C+iWphC+XjU/qPSLeH///u3nnzLX9mojIbsvZcwh4XVM4KZl2VMwAmmHgYQ8LTxAYXGTiUU4YP/////W/9THTdGs8T8P//CiAm5uJKU6xwDwY6JeJmfBbyXFuhrdAmDjHR6yeBNR4M4fkfqmYXEkxhmmZfIA4MakBmBAEG2O0goW2YCAEzGfLCfMhIF1WGFRcn0STGaIeGDQAA0DjA4bz4AhmJQNGLDZmVOJF+EsAJINPzc+ogmECI0N0ldnTnyPn3LH3Wy2b/fidvPUGqbQLTrlRxQBqKJXBcINeRDBgJ42xmWGIOX3veN8Vb1x2Md7n/////6N1H8SagcEzgCP0Bv/x3FIyNlJioIlGCsA8HRwg3C+jWYB4E7MhLijrRJpKoOSRs/1D6CeiKMWkUlnARxWJIATAjAoMkw6QwWQEgwBQwEwNzBYOyMNkZQwEAGzAhAFMAAJQxx1BDHAAoP/+5JkF470xz7Ki9ubcies52AAEK4TdP0qD21RgJgznYAAQrg1Dx4lMHkSWPKAMSQSsnMaQAWPvZJwoIGkBD+U7cRweA0HqrOpKOp/6s/hZS2fjvt1VxztgkC3X3EGqGVmQ8Gq7RLBLkboHMkEgQCSgIYFkJGorohMRHFakE////rJ99b61tk2OCkkTB6N//6jYT0LC8QCDZWMA1Mnxm3nAAUGxB3LA4DD4x47/WtIzOCLtkqOxymSiQARgTAUmYKPmGCohwIZgMAGGEeWAaqAoRhPAbmCSA8YNAVpkPpwmTAEKYMoBwCAZAgDJiag0KFgIDFfhgVcBy7lAosPJ7UZ9uIJBw6qgek4XzVb3H5/tStMJYd+lUPscnVMV9S1wxCDmD04XB2vF4jBSY01zHiZS8rBBg0TNt4zKmPf06FLz////xEdR3KkZ+WCAtly3/2Vf/+pJFSR0nTjppRJT6kAMxzRA7rMg9cOw2tASsevoMSobcRLmJqqgAIAAEg/LzMUEgEzJkEDCA4hwAcwFAODCpEZNAoPciBxMAgAAwFwjzFG//uSZBUE5MQ+S7vbk3AmrIbwABKuUm0LLC7trcCYspvIAB56SZMYUI0yY8CCMRFB7RYkDAb+iKIBWdS7WUY8Ew5uwMkYsRV/uDAC6eWOMAbgyOSpWj/r3u/8cKAWlisAmgBBEXBgK7AJEzNU5FoMDRKITgrm1IMaGjqF5////mCTbGvMHywM+aTMxcXPzUnKZ+Jv///5kkSgHIFwxDOga2TABxJxLQngXpMFqMSqBARQR5+dKoa0HjOgFdyETzAQJjkGwjFAGjAkDzBIMjFvOzINQTEcRDCIKTEkaDlD3jgsUjZg9E4GnZhLyvpcSuxBjAIqa/KFtmFlC4ezBCXpR394LAN9z6k7ytQKHsV/7sQ+taWg3sufaTGUqzdnLW4CV8yoLV6iecCqARRu4VgVpGdQwxA////mRBbOGmcFq9MaBOtZqezp/mNbraawg/7//////+ppUBothEAcFQcljghDgHF2qNXGpaKwdjinCEAgaH1AKB61gASB+Yyx7ZVAZL2KTMFQz804QozA7AeCwDZgjARGX2ioYkAMRhkQkxAMKP/7kmQXjeTJR0qL3JtwJGymkAQUjlP1JSRPco3AozIcDABOOQA5qKBYDUhUAhidGGSgEpN2CEEmMg+s2mjoBMo8L6TdZ+6P/uX9Z4KUw7z9u7y5DbpXX50IAAaIC63HveQxEE1D7EOAmcDqQnmNw6gYWNcjSd////Wb+ZmukeeeFiK1TFo10UubP+dNq8l//P/9X1/qY86Cal////1//q////+pFwM5ODsl8sBk4HRPqNVjAf1uxVAHMAYGIwmV9jAcAOR4MBkC0wtCCzjhADGg7zAGA8MA0RkwLIdTBODBMEiAGCEwtHjIR4EQDR2KgNM/y0ywFVTQCVAiCm+gc9rnmNiORLNjkjhhgFu5d139v4ote//y/TRW4vLq6QkwOTLNpSzEHAoeB0pfAIUYCpQdZkZiCw1U1LGOV///+s08odZ6syJ58rEj/Uf/ovz3///1gCj/+pZgUx+C24ChQOKRRjV2///+7dXp+l9v///3YAUAaAaloN2DbzCCmNkAABIBKYlbCIEAbMAYBQwKwSTDwJMOIkEowRQEDASAtMEkNA3/+5JkE430nkJJA9yjQC3MpyAIFdQR3QEkb3KNwJ+eHIAN0sksGVDEtBsMUCsvEYRah6wWAIKruBIbNlJMaTSfDEzAQeMih6zER0FGMl8Cik+s1lETz+ohwuc/+L0QTRcigGHLAuxGEP4YMAwocFhzEOAWCgrINnUomj6lkVPf//7tzvrbTPZm+s82vqKTym+n//////9FAw45P///c0GPE4gaBTIIkcMkapf///////////OhyIn1zUTyF1JacUAO67SlJgBgfGSQvgDgJgEAgYDIH5hRJ6G8GEwKgAmAGAUYJgMJs/mkmHUAmGFYIAhiUen8gGnwpmCAIZBxRhAFNbnQKJBIUr9gZUhnEVDwtanOW85Rd1/6m1tSy3//+rroNTxmmkmESCREiFP4KgE1EOt5NxAy8UBVKRJH1f///X1t0PPI6D6y62iaRFLfvDOkhtaBia+eFBFCJCrOXO///////////9SZQErAww4DuGwDuQ8jKhAACAIMbqi8VQYTQddDMDgBsQAGGA+BqYcURxvvhlBUAkMAZMHcDY5VhQTD//uSZBYM5LI/yBvbLNArB5edUAfSkukLIi9wT8CyMB2JQB9SxAHMBYAQmAqMBEWMx6AS5csgsAbmHSQWYEQCLSmqkBgNNH2S9xxD+2CLb/+4//6oW6NWtf///pKCwBO3mvGgKaQr7l9AKsnNwq/o6SgoIrQ5BfTOxY7hXt//////5W4n4Iap+N8TOqd/+gAACAAAACgJf/3////+gCbEA12Qjf10T/R1T//3NCIAEiRf///h9b0f8uQQzCKsnMBQCA0KGBBICItWQAgGDtFUa0IDzIjAWAOMEsY855R0DA7BIT4lpgNCWmygOVgVR4BAw6JXiI3tclQAJAQUYeewKhs2SPFXSG/zW///+6zyWf//rbYC/gsBc5kQhEyaEF7rQC4bM+v8yqRiIBw6zoycFFh4OgJWCvbupvo15f////9+EY1yKUOKGNaFRiN6HDv5cgP//////QTMBywCGoGvYBp5VSb///+b//lAcE////8oJBkVjMIBYn//4nAPMAYH9bkgyBQVDGpM7C4BQFANMBYEAwlTxjNvArMB4AkwGwMDBv/7kmQSjOSTQ8sT26MwLAwXEDQR1hKtHyxO7o0QiTBczAUf2MEFNSAhgw2gUTKRxeJrUMYUKhAEomYFEHVKosGNfdwwEegezQCpuAoRIape/zASX9imGCyIpDOgGoROJmNQIR4HAfFUTgIRgmTAsNIgZiMBm1uIQAKARNf///zr920V88erIebqm5xqkGzA08Af//////di+AlQvxgU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MaBxYG/agSAmQ4gxIDbMrFeHIlb///+f6+d/yweaPoq5ZLBWebkgjnOo0zMd//////4c//1yYOv////KiX//0Fp///9AkDRRiFwRRW6R0OaS5kGcvmesehQAACJc5qXZhAGB7YMQsSIGAMGhsaVfYbnEmYdgQYPB4YQQibpQMDQTMIj/+5JkFYz0PklLG7kT8i4Mt7AoDcYRjSksbuRP0KIzIAAgKygkEAVmOKDgKBMx0ySYpLhWF1ifdxAqFJ5b5cx/v///9X//v/92dyrvQNLSp/23MbMObceDhVMFAI/twCgS1l7Y5aa1R///////XryaCCiHyOjEoQjm+iqwco7NnXf//////EcN//5w2////6i9/+uoep////kmOYbKjrSULqhjiSjKRLyxiN4qgnZ8QAAABTEvMCAhMKy8O33TMFwyC4LmHANG/u/DzHiwWkAKmyOfnZyKhQEAaApimdZkcahuVG0IKjgKZOKT6cOVY+oo2aNd1cv/a/+4f///O/vuHNytuU7Shc0yyjXEZ8j+BVSwSg0ODBy6Eccg/f93///////yH/VcCKOUODFsHngjm/U44N0cSqhpdPR//////4MJOf/xW///1FcCcRQ4ee5APBIE9Q9FYannwoxbdR4YYTi2fYBDgAAESxiajBjGtJ0CwhgqCbCjBggDabOwgJDAUMzF8DzYDZTKE1zCoijCQcDC9rRaiDAsDh4NUlRofVB2//uSZB8A9BBKy7uyFNAmTLggCAfYTfj7Km4lsUjOCiJAB5Soz/CjM9FBkIis36suGab/lOZoGZVQLB0MiiLFMTcQQLpCchzAsiA/AiRx/////+hjfggrOUrYYUYl6qpPsrliS3BHZ2j//7un//+pYMIf//+a3//+EJJHqAccprR0BpFjjhJGxwSmKwFTgp0AQABnSgIsCjaGNPYPMHKmsZtcx1+rG1k6YOF5gevHydMc/bwCGJjpKmynmb4WphUKmJAiykDCELAmFhkS7BUU6shyveRIiaWZ//G5wSdERTGzyO0oCmwSC7gPJw3X/3/////87rao2bxptKJ391r003jfRzgpIp2HhHo2OKvA+p291PxMxxYs4oCBzxJHa3xBo4Y//8//ED5D4f/sEC4YrzyF9DlKzkv0WFBEWQFF2izwUNhw4FBQSGURB001c415gy5YGCWNLfYjCHeh7dxj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VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV",
    "曼波欧耶": "data:audio/mpeg;base64,SUQzBAAAAAABRlRYWFgAAAASAAADbWFqb3JfYnJhbmQAaXNvbQBUWFhYAAAAEwAAA21pbm9yX3ZlcnNpb24ANTEyAFRYWFgAAAAoAAADY29tcGF0aWJsZV9icmFuZHMAaXNvbWlzbzJhdmMxbXA0MWlzbzUAVFhYWAAAAC4AAANkZXNjcmlwdGlvbgBQYWNrZWQgYnkgQmlsaWJpbGkgWENvZGVyIHYyLjAuMgBUU1NFAAAADwAAA0xhdmY1OC43Ni4xMDAAAAAAAAAAAAAAAP/7UAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEluZm8AAAAPAAAANQAAV1cABwsLEBAVFRoaHx8jIygoLTIyNzc7O0BARUVKSk5OU1NYXV1iYmZma2twcHV1enp+foOIiI2NkZGWlpuboKClpamprrOzuLi9vcHBxsbLy9DQ1NTZ3t7j4+jo7Ozx8fb2+/v/AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQDsQAAAAAAAFdX/hsJyQAAAAAAAAAAAAAAAAAAAAD/+5BkAA/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVEOlUcQ51pLDPcctPhOeUzZRVkML3c9TX86Og7mqWNPFVNuD8bSE4/XxY6PMFlFTeKo+Ay3Vp5MJYRojLLxlNayjY2S4gzKpQTMCMy8rA5gYqyRphIQlGaFSCb88PhxyNpmuXosZC4yNmyUv0B2oyNifSwZWn2InIJ6aD1oeSDd3m8BWORmXs0mYsqumGaaGupm9YP6cJ7XZg6jvGB4oYbQxx5xpkGm/gmQa36mZmmG8GWqQuZ6pFpoAIcGIulaZkZlBolCElaGI6vldXNm0wtDkEmls+0XK9MZlgCjT/mck7Iui5NcPEaTH7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rR1MQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5Jk3wP2ljQbK9hNIgAADSAAAAENPFAwru9QAAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==",
    "曼波傻笑": "data:audio/mpeg;base64,SUQzBAAAAAABRlRYWFgAAAASAAADbWFqb3JfYnJhbmQAaXNvbQBUWFhYAAAAEwAAA21pbm9yX3ZlcnNpb24ANTEyAFRYWFgAAAAoAAADY29tcGF0aWJsZV9icmFuZHMAaXNvbWlzbzJhdmMxbXA0MWlzbzUAVFhYWAAAAC4AAANkZXNjcmlwdGlvbgBQYWNrZWQgYnkgQmlsaWJpbGkgWENvZGVyIHYyLjAuMgBUU1NFAAAADwAAA0xhdmY1OC43Ni4xMDAAAAAAAAAAAAAAAP/7UAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEluZm8AAAAPAAAATAAAfOQABQgLDw8SFRkZHB8jIyYpLS0wMzc3Oj1BRERHS05OUVVYWFxfYmJmaWxscHN2dnp9gISEh4qOjpGUmJibnqKipaisrK+ztra5vcDDw8fKzc3R1NfX297h4eXo6+vv8vX1+fz/AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQGkQAAAAAAAHzkWI1sbwAAAAAAAAAAAAAAAAAAAAD/+5BkAA/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV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Ny0yy3+vxyv77rK5lg/deen7dh+7ia4iCZIWzceLp//7kmRbgAcOZkjuZyAAbrCHMMBUABFhMUuZlgABGLsdwwFAAFvu6yYi6P/////////8bf/SY0+P8+xznWSOdGLFHYnL/16Snzp7/////nP///////////////////////+Uw+YWYBhIACgAHgBELkhaR+K6AETwMHhgDFAHBYogYZF4XSAxGEAAQL8jgsABiEhgYeQQGvDEBgYQgYwFAFi2BlUQgYpK4joMKN////JgEQBV////Ax+KARAMvMgERWIQgalozhBBzZWEgov43YsNK/kVNLDgAdBc0SsQ6xCwatu2QiQkTCU6vPx0M1gTFlOpP1u/EXy2ZtobN47UnbzWOij61hp7E6x2u/QgR7Oy4+4tnKZeZmfzdpT5Yea2h3M3nKU3aZPq3H7KTpc1urfyNbO7bfv8zk6fOSPWHAAScFPBFEWdzkP////////////////////////6QWCAxjsDkRwN5BAxZgDMmgDqQGdKgXG/WjRICTJDQtdC+Ikv//AyqQLRiIIf///kGJk1dcQI8rSm9ECxKa/JqmMtyIuUroL/+5JkCYDziE5Xb2GgAAAADSDgAAEN0SlbzBkVAAAANIAAAAQbCJrCynHGbg8lTMkDoE2CxTLrGCNA4dOGjVIIuplIJKVTYlXN0BZhFh/GxZLjkEbHOsvFQlgm5NMisYg5HW6y+l6+6aD///r9XrL69MwNGVPUd1N1IPstbKWyZsSrqQKAg1IgAQeAmfrujMSB8U+oEV2nKzNtki4aYLp6n+oMdNVV7vG7UfrC/lxAxT34d+9pM028/PAlTa9gJeWTCxtQeDke+f/fz36LExSf//z2NtCFafOa9xrqUZgvw7LkoTCb9q/d+FPwwG/ueVnF1gRRhREWgAgFkUnThhTtww2zJ5a6zIAa+MCWeCekY++GKmciXLe5DYM30SyMgZAHRF3UoW1AmKlN5rWGgCyN8nHckFn7mxMq///xiNdqL1T/dY6CKwyU1Ui0X+nkFrC6x3W6jIhigAWhZIu5l9DjpK4Zw1CTksNNODZxMJgmc/t/v////0fzP///obwIlAsYpwElVBAAAAsfIUJFhLxSRM1lMF+Qktx1k5UDYGhkEDds//uSZFiA8zRJ1/sMGmApgSVRJekKDNURV8ekbUDOBZwB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ACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kGRBD/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=",
};

function _playNotify() {
                if (!_soundEnabled) return;
                if (_soundLock) return; _soundLock = true; setTimeout(function(){ _soundLock = false; }, 1000);
                if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; }
                try {
                    if (_soundType === 4 && _customSound) {
                        _currentAudio = new Audio(_customSound);
                        _currentAudio.volume = 0.5;
                        _currentAudio.play().catch(function(){});
                        return;
                    }
                    if (_soundType >= 5) {
                        var _presetNames = ["曼波","曼波duang","曼波欧耶","曼波傻笑"];
                        var _pUrl = _customSoundUrls[_presetNames[_soundType - 5]];
                        if (_pUrl) { var au = new Audio(_pUrl); au.volume = 0.5; _currentAudio = au; au.play().catch(function(){}); return; }
                    }
                    var ctx = new (window.AudioContext || window.webkitAudioContext)();
                    var types = [
                        function(){ /* 叮咚 */ var o=ctx.createOscillator();var g=ctx.createGain();o.type="sine";o.frequency.setValueAtTime(800,ctx.currentTime);o.frequency.setValueAtTime(1200,ctx.currentTime+0.1);g.gain.setValueAtTime(0.3,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+0.3);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+0.3); },
                        function(){ /* 两短 */ for(var si=0;si<2;si++){var o=ctx.createOscillator();var g=ctx.createGain();o.type="sine";o.frequency.setValueAtTime(1000,ctx.currentTime+si*0.15);g.gain.setValueAtTime(0.3,ctx.currentTime+si*0.15);g.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+si*0.15+0.1);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+si*0.15);o.stop(ctx.currentTime+si*0.15+0.1);} },
                        function(){ /* 上升音 */ var o=ctx.createOscillator();var g=ctx.createGain();o.type="sine";o.frequency.setValueAtTime(500,ctx.currentTime);o.frequency.linearRampToValueAtTime(1500,ctx.currentTime+0.3);g.gain.setValueAtTime(0.3,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+0.4);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+0.4); },
                        function(){ /* 和弦 */ [523,659,784].forEach(function(f,i){var o=ctx.createOscillator();var g=ctx.createGain();o.type="sine";o.frequency.setValueAtTime(f,ctx.currentTime);g.gain.setValueAtTime(0.15,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+0.5);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+0.5);}); },
                    ];
                    (types[_soundType] || types[0])();
                } catch(e){}
            }
            var _customSound = localStorage.getItem("db_pt_custom_sound") || "";
            // 设置弹窗
            var _soundBtn = _btn(320, "⚙️ 设置", "设置", null, null, function(){
                if (_soundPopup) { _soundPopup.remove(); _soundPopup = null; return; }
                var pop = document.createElement('div');
                pop.style.cssText = 'position:fixed;z-index:99999;width:360px;max-height:80vh;overflow-y:auto;background:var(--anima-bg);border:1px solid var(--anima-title);border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,0.7);padding:16px;';
                // ── 上半区：提示音设置 ──
                pop.innerHTML = '<div style="color:#e0e0e0;font-size:14px;font-weight:bold;margin-bottom:12px;">🔔 提示音设置</div>';
                var togDiv = document.createElement('div');
                togDiv.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;';
                togDiv.innerHTML = '<span style="color:#888;font-size:13px;">启用提示音</span>';
                var tog = document.createElement('input');
                tog.type = 'checkbox'; tog.checked = _soundEnabled;
                tog.style.cssText = 'width:18px;height:18px;cursor:pointer;';
                tog.onchange = function(){_soundEnabled=tog.checked;localStorage.setItem("db_pt_sound",_soundEnabled?"on":"off");if(!_soundEnabled&&_currentAudio){_currentAudio.pause();_currentAudio=null;}};
                togDiv.appendChild(tog); pop.appendChild(togDiv);
                var selDiv = document.createElement('div');
                selDiv.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;';
                selDiv.innerHTML = '<span style="color:#888;font-size:13px;">提示音</span>';
                var sel = document.createElement('select');
                sel.style.cssText = 'flex:1;padding:4px 6px;border:1px solid var(--anima-title);border-radius:4px;background:var(--anima-well);color:#b0bec5;font-size:12px;cursor:pointer;outline:none;';
                var opts = ['叮咚','两短','上升音','和弦','自定义','曼波','曼波duang','曼波欧耶','曼波傻笑'];
                for(var oi=0;oi<opts.length;oi++){var opt=document.createElement('option');opt.value=oi;opt.textContent=opts[oi];if(oi===_soundType)opt.selected=true;sel.appendChild(opt);}
                sel.onchange = function(){_soundType=parseInt(sel.value);localStorage.setItem("db_pt_sound_type",sel.value);};
                selDiv.appendChild(sel); pop.appendChild(selDiv);
                var upDiv = document.createElement('div');
                upDiv.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;';
                upDiv.innerHTML = '<span style="color:#888;font-size:13px;">上传音效</span>';
                var upInp = document.createElement('input');
                upInp.type = 'file'; upInp.accept = 'audio/*'; upInp.style.cssText = 'flex:1;font-size:11px;color:#888;';
                upInp.onchange = function(ev){var file=ev.target.files?.[0];if(!file)return;var reader=new FileReader();reader.onload=function(ev2){_customSound=ev2.target.result;localStorage.setItem("db_pt_custom_sound",_customSound);};reader.readAsDataURL(file);};
                upDiv.appendChild(upInp); pop.appendChild(upDiv);
                var actDiv = document.createElement('div');
                actDiv.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';
                var testBtn = document.createElement('span');
                testBtn.textContent = animaTxt("▶ 试听"); testBtn.style.cssText = 'padding:4px 10px;border-radius:4px;background:linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi));color:#ffffff;cursor:pointer;font-size:12px;';
                testBtn.onclick = function(){_playNotify();}; actDiv.appendChild(testBtn);
                if(_customSound){var clrBtn=document.createElement('span');clrBtn.textContent=animaTxt("✕ 清除");clrBtn.style.cssText='padding:4px 10px;border-radius:4px;background:#3a1a1a;color:#e94560;cursor:pointer;font-size:12px;';clrBtn.onclick=function(){_customSound='';localStorage.removeItem("db_pt_custom_sound");};actDiv.appendChild(clrBtn);}
                pop.appendChild(actDiv);
                // ── 分隔线 ──
                var sep = document.createElement('hr');
                sep.style.cssText = 'border:none;border-top:1px solid var(--anima-title);margin:12px 0;';
                pop.appendChild(sep);
                // 确定
                var okDiv = document.createElement('div');
                okDiv.style.cssText = 'text-align:center;margin-top:12px;';
                var okBtn = document.createElement('span');
                okBtn.textContent = animaTxt("✓ 确定"); okBtn.style.cssText = 'display:inline-block;padding:5px 20px;border-radius:4px;background:linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi));color:#ffffff;cursor:pointer;font-size:13px;';
                okBtn.onclick = function(){
                    pop.remove();_soundPopup=null;
                };
                okDiv.appendChild(okBtn); pop.appendChild(okDiv);
                document.body.appendChild(pop);
                pop.style.left = Math.max(10,(window.innerWidth-360)/2)+'px';
                pop.style.top = Math.max(10,(window.innerHeight-500)/2)+'px';
                _soundPopup = pop;
            });
            toolbar.appendChild(_soundBtn);
            var _favBtn = _btn(380, "💾 收藏", "提示词收藏夹", null, null, function() {
                openPromptFavPopup(node, tagTextarea.value, function(text) {
                    tagTextarea.value = text;
                    syncWidget();
                    if(_chipMode) renderChips();
                });
            });
            toolbar.appendChild(_favBtn);

            // ── 工具栏分组重排：常用 / 预制 / 编辑（只移动 DOM 不重建，事件保留；失败不影响主流程）──
            try {
                var _tbMap = {};
                Array.from(toolbar.children).forEach(function(b){ var _k = Array.from((b.textContent||"").trim())[0]; if (_k) _tbMap[_k] = b; });
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
                var _gOther = document.createElement("span");
                _gOther.style.cssText = "display:inline-flex;gap:6px;align-items:center;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:3px 8px;";
                function _mv(grp, b) { if (b) { grp.appendChild(b); b.style.margin = "0"; } }
                // 常用区（最左）：输入 / 暂停 / 标签模式 / 确认输出
                _mv(_gCommon, _tbPick(["📥","📝"]));
                _mv(_gCommon, _tbPick(["⏸"]));
                _mv(_gCommon, _tbPick(["⬡","📋"]));
                _mv(_gCommon, _tbPick(["⏭"]));
                // 预制区：预制 / 收藏(标签) / A 搜索 / 💾 收藏(提示词)
                _mv(_gPreset, _tbPick(["📂"]));
                _mv(_gPreset, _tbPick(["✨"]));
                _mv(_gPreset, _tbPick(["A"]));
                _mv(_gPreset, _tbPick(["💾"]));
                // 编辑区：合并块 / 批量 / 权重 / 翻译 / 声音
                _mv(_gEdit, _tbPick(["🧩"]));
                _mv(_gEdit, _tbPick(["☑"]));
                _mv(_gEdit, _tbPick(["🌐"]));
                _mv(_gEdit, _tbPick(["🔊","🔇"]));
                // 其余（分隔符等）丢弃，避免残留
                toolbar.innerHTML = "";
                toolbar.appendChild(_gCommon);
                toolbar.appendChild(_gPreset);
                toolbar.appendChild(_gEdit);
                var _left = Object.keys(_tbMap).map(function(k){ return _tbMap[k]; }).filter(function(b){ return b && (b.textContent||"").indexOf("|") < 0; });
                _left.forEach(function(b){ _gOther.appendChild(b); });
                if (_gOther.children.length) toolbar.appendChild(_gOther);
            } catch(e) { console.error("[PT] 工具栏重排失败", e); }

            // ── 预制 tag 弹出 ──
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
                if(_chipMode) renderChips();
            }
            function syncWidget() {
                try { localStorage.setItem("db_pt_content_" + node.id, tagTextarea.value); } catch(e) {}
                var _fw1 = node.widgets?.find(function(w){return w.name==="_db_full_tags";}); if (_fw1) _fw1.value = tagTextarea.value;
                var _outputTags = getTags().filter(function(t){ return !_isHiddenTag(t); });
                _outputTags = _outputTags.map(function(t){ return window.animaFmtWeightTag ? window.animaFmtWeightTag(t, _weights[t]) : t; });
                var _clean = _outputTags.join(", ").replace(/; /g, ", ");
                var _tw2 = node.widgets?.find(function(w){return w.name==="text";});
                if(_tw2) _tw2.value = _clean;
                var pw = node.widgets?.find(function(w){return w.name==="prompt_text";});
                if(pw) { pw.value = _clean; if(pw.element) pw.element.value = _clean; }
            }
            function _getCleanOutput() {
                var _out = getTags().filter(function(t){ return !_isHiddenTag(t); });
                _out = _out.map(function(t){ return window.animaFmtWeightTag ? window.animaFmtWeightTag(t, _weights[t]) : t; });
                return _out.join(", ").replace(/; /g, ", ");
            }

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
            // ── 渲染 chip ──
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
                var unknown = tags.filter(function(t){return !(t in _tlCache) && !(t in _tlMissing);});
                if (unknown.length > 0) {
                    var apiTags = unknown.map(function(t){return t.replace(/ /g,"_");});
                    fetch("/danbooru_anima/translate_tags",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tags:apiTags})}).then(function(r){return r.json();}).then(function(d){
                        if(d.success&&d.translations){for(var i=0;i<unknown.length;i++){var _tv=d.translations[apiTags[i]]||"";if(_tv)_tlCache[unknown[i]]=_tv;else _tlMissing[unknown[i]]=1;}}
                        if(_renderGen===gen)renderChips();
                    }).catch(function(){});
                }
                for(var i=0;i<tags.length;i++){(function(ii){
                    var tag=tags[ii],cn=_tlCache[tag]||"";
                    var col=_tagColor(tag);
                    var _isMerged = tag.indexOf("; ") >= 0;
                    var _isSentence = !!_sentenceTags[tag];
                    var _isWide = _isMerged || (_isSentence && tag.length > 40);
                    var _isSelChip = ((_mergeMode&&_mergeSelected[ii])||(_batchMode&&_batchSelected[ii]));
                    var chip=$el("div",{style:{flexBasis:_isWide?"100%":"auto",maxWidth:_isWide?"none":"300px",width:_isWide?"100%":"auto"}});
                    chip._didx=ii;chip.dataset.ci=ii;
                    chip.style.userSelect="none";
                    if (typeof window.animaApplyTagChip === "function") window.animaApplyTagChip(chip, col, {wide:_isWide, merged:_isMerged, sentence:_isSentence, selected:_isSelChip, hidden:!!_isHiddenTag(tag), pick:(_mergeMode||_batchMode)});
                    else { chip.style.background = col+"22"; chip.style.border = "1px solid "+col+"88"; chip.style.borderLeft = "3px solid "+col; chip.style.borderRadius = "8px"; chip.style.padding = "4px 9px 4px 10px"; chip.style.color = "var(--anima-ink-chip)"; }
                    if (_mergeMode) {
                        var cb = $el("span", {
                            className: "anima-chip-check",
                            textContent: _mergeSelected[ii] ? "☑" : "☐",
                            style: { cursor: "pointer", fontSize: "14px", color: _mergeSelected[ii] ? "#e94560" : "#888", marginRight: "2px", userSelect: "none", pointerEvents: "auto" }
                        });
                        chip.appendChild(cb);
                    }
                    if (_batchMode) {
                        var bcb = $el("span", { className: "anima-chip-check", textContent: _batchSelected[ii] ? "☑" : "☐", style: { cursor: "pointer", fontSize: "14px", color: _batchSelected[ii] ? "#e94560" : "#888", marginRight: "2px", userSelect: "none" } });
                        chip.appendChild(bcb);
                    }
                    var row=$el("span",{style:{display:"inline-flex",alignItems:"center",gap:"2px"}});
                    var lab=$el("span",{textContent:(window.animaChipLabel?window.animaChipLabel(tag,_weights[tag],_isMerged):( _weights[tag]&&_weights[tag]!==1.0?"("+tag+":"+_weights[tag].toFixed(1)+")":(_isMerged?tag.replace(/; /g,", "):tag))),className:"anima-chip-en",style:{cursor:"pointer",wordBreak:"break-word"}});
                    lab.onmousedown=function(ev){if(ev.detail!==2)return;ev.preventDefault();ev.stopPropagation();var ot=tags[ii];var rc=lab.getBoundingClientRect();var inp=document.createElement("input");inp.type="text";inp.value=ot;inp.style.cssText="position:fixed;z-index:99999;left:"+rc.left+"px;top:"+rc.top+"px;width:"+Math.max(80,rc.width)+"px;height:"+rc.height+"px;padding:1px 4px;border:1px solid var(--anima-accent-soft);border-radius:3px;background:var(--anima-well);color:#e0e0e0;font-size:11px;outline:none;";document.body.appendChild(inp);inp.focus();inp.select();inp.onblur=function(){var v=inp.value.trim();inp.remove();if(v&&v!==ot)_renameChipTag(ot,v,ii);};inp.onkeydown=function(ev2){if(ev2.key==="Enter"){ev2.preventDefault();inp.blur();}if(ev2.key==="Escape"){ev2.preventDefault();inp.remove();}};};
                    row.append(lab);
                    chip.appendChild(row);
                    if(cn)chip.appendChild($el("span",{textContent:cn,className:"anima-chip-cn"}));
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
                                lab.textContent = window.animaChipLabel ? window.animaChipLabel(tag, _weights[tag], _isMerged) : tag;
                                syncWidget();
                            },
                            isHidden: function(){ return !!_isHiddenTag(tag); },
                            onHide: function(){
                                if (_hideLock) return;
                                _hideLock = true;
                                setTimeout(function(){ _hideLock = false; }, 100);
                                if (_hiddenTags[tag]) { delete _hiddenTags[tag]; _saveHidden(); chip.classList.remove("is-hidden"); }
                                else { _hiddenTags[tag] = true; _saveHidden(); chip.classList.add("is-hidden"); }
                            },
                            onDelete: function(){ setTags(getTags().filter(function(_,j){return j!==ii;})); },
                            isMerged: function(){ return _isMerged; },
                            onUnmerge: _isMerged ? function(){
                                var _parts = tag.split("; ");
                                var _t2 = getTags();
                                _t2.splice(ii, 1);
                                for (var _pi = _parts.length-1; _pi >= 0; _pi--) { _t2.splice(ii, 0, _parts[_pi]); }
                                setTags(_t2);
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
                    chip.addEventListener("mousedown", function(e){
                        if(e.button!==0)return;
                        if (window.animaKillChipFlyouts) window.animaKillChipFlyouts();
                        if (_batchMode || _mergeMode) {
                            if (chipArea._animaMarqueeBound) return;
                            e.stopImmediatePropagation();
                            if (_batchMode) {
                                if (_batchSelected[ii]) { delete _batchSelected[ii]; } else { _batchSelected[ii] = true; }
                                renderChips(); _refreshBatchBar(); return;
                            }
                            if (_mergeSelected[ii]) { delete _mergeSelected[ii]; } else { _mergeSelected[ii] = true; }
                            renderChips(); return;
                        }
                        if (e.target && e.target.closest && e.target.closest(".anima-chip-check")) return;
                        if (_hiddenTags[tag]) {
                            if (typeof window.animaHiddenChipClickUnhide === "function") {
                                window.animaHiddenChipClickUnhide(e, function(){
                                    if (_hideLock) return;
                                    if (!_hiddenTags[tag]) return;
                                    _hideLock = true;
                                    delete _hiddenTags[tag];
                                    _saveHidden();
                                    chip.classList.remove("is-hidden");
                                    setTimeout(function(){ _hideLock = false; }, 100);
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
                })(i);}
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
                        if (_batchMode) {
                            if (_batchSelected[i]) delete _batchSelected[i]; else _batchSelected[i] = true;
                            renderChips(); _refreshBatchBar();
                        } else if (_mergeMode) {
                            if (_mergeSelected[i]) delete _mergeSelected[i]; else _mergeSelected[i] = true;
                            renderChips();
                        }
                    },
                    onMarqueeIndices: function(ids) {
                        var map = _batchMode ? _batchSelected : _mergeSelected;
                        for (var mi = 0; mi < ids.length; mi++) map[ids[mi]] = true;
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
                        for (var i = 0; i < r.movedCount; i++) map[r.insertAt + i] = true;
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
            // ── 搜索补全 ──
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
                var _favSize2 = JSON.parse(localStorage.getItem('db_fav_tag_size') || '{"w":960,"h":500}'); _favSize2.w = Math.min(Math.max(_favSize2.w, 900), window.innerWidth-40); _favSize2.h = Math.min(_favSize2.h, window.innerHeight-40);
                div.style.cssText = 'position:fixed;z-index:99999;width:'+_favSize2.w+'px;height:'+_favSize2.h+'px;min-width:300px;min-height:300px;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid var(--anima-title);border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,0.7);display:flex;flex-direction:column;overflow:auto;resize:both;';
                div.onmouseup = function(){var nw=Math.max(300,div.offsetWidth);var nh=Math.max(300,div.offsetHeight);if(nw!==_favSize2.w||nh!==_favSize2.h){_favSize2.w=nw;_favSize2.h=nh;localStorage.setItem('db_fav_tag_size',JSON.stringify(_favSize2));} localStorage.setItem('db_fav_tag_pos',JSON.stringify({top:parseInt(div.style.top)||0,left:parseInt(div.style.left)||0}));};
                // 初始位置：优先读取上次保存的位置，否则居中
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
                (function(){ if (document.getElementById('tp-sheen-css')) return; var _s = document.createElement('style'); _s.id = 'tp-sheen-css'; _s.textContent = '#_multiToggle,#_comboListBtn,#_atToggle,#tp-hide-pin,#tp-pin-fold,.tp-src-tab{transition:transform .15s ease,filter .15s ease,box-shadow .15s ease;cursor:pointer;}#_multiToggle:hover,#_comboListBtn:hover,#_atToggle:hover,#tp-hide-pin:hover,#tp-pin-fold:hover,.tp-src-tab:hover{transform:translateY(-1px);filter:brightness(1.4);box-shadow:0 0 10px rgba(var(--anima-accent-rgb),0.35);text-shadow:0 0 8px rgba(var(--anima-accent-rgb),0.45);}.tp-card{transition:box-shadow .15s ease,border-color .15s ease;}.tp-card:hover{box-shadow:0 0 0 1px rgba(var(--anima-accent-rgb),0.45),0 4px 12px rgba(0,0,0,0.25),0 0 10px rgba(var(--anima-accent-rgb),0.2);}.tp-pin-chip{transition:box-shadow .15s ease;}.tp-pin-chip:hover{transform:translateY(-1px);box-shadow:0 0 10px rgba(var(--anima-accent-rgb),0.35);}.tp-tab{color:var(--anima-mute);}.tp-tab:hover{color:var(--anima-accent-soft) !important;background:rgba(var(--anima-accent-rgb),0.08);box-shadow:inset 0 -2px 0 rgba(var(--anima-accent-rgb),0.6);}#_multiToggle,#fav_multi_toggle{cursor:pointer;font-size:12px;margin-left:12px;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:var(--anima-mute);user-select:none;transition:all .15s ease;}#_multiToggle.on,#fav_multi_toggle.on{background:rgba(var(--anima-accent-rgb),0.15);border-color:rgba(var(--anima-accent-rgb),0.5);color:var(--anima-accent-soft);}#_noteToggle{cursor:pointer;font-size:12px;margin-left:8px;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:var(--anima-mute);user-select:none;transition:all .15s ease;}#_noteToggle.on{background:rgba(255,193,7,0.15);border-color:rgba(255,193,7,0.5);color:#ffd93d;}'; document.head.appendChild(_s); })();
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
                                    (combo.artists||[]).forEach(function(a){ var cleanTag = a.indexOf("@")===0 ? a.slice(1) : a;
_insertTag(formatTag(cleanTag, true, _tagMode)); });
                                };
                                // 缩略图
                                if (combo.thumbs && combo.thumbs.length) {
                                    var tn = document.createElement("img");
                                    var tnSrc2 = combo.thumbs[0];
if (window.animaFavGrid) tn.src = window.animaFavGrid.proxySrc(tnSrc2, tnSrc2.indexOf("gelbooru")>=0 ? "gelbooru" : "danbooru", false);
else if (tnSrc2.indexOf("/danbooru_anima/combo_thumb/") >= 0) tn.src = tnSrc2;
else if (tnSrc2.indexOf("gelbooru")>=0) tn.src = "/gelbooru_anima/image_proxy?url="+encodeURIComponent(tnSrc2);
else tn.src = "/danbooru_anima/image_proxy?url="+encodeURIComponent(tnSrc2);
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
                var _unsubFavSync = null;
                var _favSyncId = "pt-fav-" + String(node.id) + "-" + Date.now();
                hdr.lastChild.onclick = function(){ if (_unsubFavSync) _unsubFavSync(); div.remove();_favPopup=null;if(hoverPop)hoverPop.remove();};
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
                        pinnedBar.innerHTML = ""; pinnedBar.style.display = "none";
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
                var _pinSig = "";
                var _pinOrderFull = [];
                var _pinSort = "rate";
                try {
                    var _pinSortSaved = localStorage.getItem("tp_pin_sort") || "";
                    if (_pinSortSaved === "rate" || _pinSortSaved === "rate_asc" || _pinSortSaved === "new" || _pinSortSaved === "old" || _pinSortSaved === "name" || _pinSortSaved === "manual") _pinSort = _pinSortSaved;
                } catch (ePs) {}
                var _pinSortNames = { rate: "高分", rate_asc: "低分", "new": "最新", old: "最早", name: "名称", manual: "手动" };
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
                (function(){if(window.Sortable)return;if(document.getElementById("tp-sortable-js"))return;var s=document.createElement("script");s.id="tp-sortable-js";s.src="/extensions/ComfyUI-Danbooru-Anima-Prompt/js/sortable.min.js";document.head.appendChild(s);})();
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
                                        var full = (_pinOrderFull || []).slice();
                                        var start = (_pinPage - 1) * _pinPageSize;
                                        var next = full.length ? full.slice(0, start).concat(visible).concat(full.slice(start + _pinPageSize)) : visible;
                                        localStorage.setItem('tp_pin_order', JSON.stringify(next));
                                        _pinSig = "";
                                        if (typeof _showCatFn === "function" && _curCat) _showCatFn(_curCat, {keepGrid:true});
                                    } catch(e){}
                                }
                            });
                        }
                    } catch(e){}
                }, 300);
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
                        var artists = _multiSelected.map(function(t){ return t.startsWith("@") ? t.slice(1) : t; });
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
                        // ── 画师置顶栏 ──
                        if (cat === 'artists' && !opt.gridOnly) {
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
                            var _sigParts = [String(_pinPage), String(_pinPageSize), _pinSort, _multiSelected.join(",")];
                            for (var _si = 0; _si < pinnedTags.length; _si++) {
                                var _sinf = items[pinnedTags[_si]] || {};
                                _sigParts.push(pinnedTags[_si], _sinf.note || "", _sinf.thumb || "", String(_sinf.rating || 0), (_sinf.starred || _sinf.star) ? "1" : "0");
                            }
                            var _sig = _sigParts.join("\u0000");
                            var _pinSame = _sig === _pinSig && (pinnedTags.length ? !!pinnedBar.querySelector("#tp-pin-head") : !!pinnedBar.querySelector(".tp-pin-empty"));
                            if (!_pinSame) {
                            _pinSig = _sig;
                            pinnedBar.innerHTML = '<div id="tp-pin-head" style="position:sticky;top:0;z-index:5;display:flex;align-items:center;flex-wrap:wrap;width:100%;min-width:0;flex-shrink:0;gap:6px;padding-top:6px;background:rgba(var(--anima-bg-deep-rgb),.42);"><span id="tp-hide-pin" title="开启后隐藏列表中的已收藏画师" style="cursor:pointer;font-size:12px;width:24px;height:24px;line-height:22px;text-align:center;border-radius:50%;user-select:none;margin-right:6px;flex-shrink:0;' + (_hidePinned ? 'background:rgba(var(--anima-accent-rgb),0.18);border:1px solid rgba(var(--anima-accent-rgb),0.4);color:var(--anima-accent-soft);' : 'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:var(--anima-mute);') + '">' + (_hidePinned
                            ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6"/><path d="M4.5 16.5L8 13M19.5 16.5L16 13"/></svg>'
                            : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/></svg>') + '</span>' + '<span style="color:#ffd93d;font-size:10px;font-weight:600;margin-right:4px;white-space:nowrap;line-height:22px;">\u{1f4cc} \u7f6e\u9876</span>' + '<span id="tp-pin-fold" title="折叠/展开置顶栏" style="cursor:pointer;font-size:10px;padding:2px 9px;border-radius:999px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);color:var(--anima-mute);line-height:18px;user-select:none;margin-left:6px;flex-shrink:0;">' + (_pinCollapsed ? '\u25bc \u5c55\u5f00' : '\u25b2 \u6536\u8d77') + '</span>' + '<span id="tp-pin-rows-btn" title="\u8c03\u6574\u7f6e\u9876\u680f\u663e\u793a\u884c\u6570" style="cursor:pointer;font-size:10px;padding:2px 9px;border-radius:999px;background:rgba(var(--anima-accent-rgb),0.1);border:1px solid rgba(var(--anima-accent-rgb),0.3);color:var(--anima-accent-soft);line-height:18px;user-select:none;margin-left:6px;flex-shrink:0;">\u{1f4d0} ' + _pinRows + ' \u884c \u25be</span></div>';
                            var _hpEl = pinnedBar.querySelector('#tp-hide-pin');
                            if (_hpEl) _hpEl.onclick = function() {
                                _hidePinned = !_hidePinned;
                                localStorage.setItem('tp_hide_pinned', _hidePinned ? '1' : '0');
                                _hpEl.style.background = _hidePinned ? 'rgba(var(--anima-accent-rgb),0.18)' : 'rgba(255,255,255,0.06)';
                                _hpEl.style.border = _hidePinned ? '1px solid rgba(var(--anima-accent-rgb),0.4)' : '1px solid rgba(255,255,255,0.12)';
                                _hpEl.style.color = _hidePinned ? 'var(--anima-accent-soft)' : 'var(--anima-mute)';
                                _hpEl.innerHTML = _hidePinned
                                    ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6"/><path d="M4.5 16.5L8 13M19.5 16.5L16 13"/></svg>'
                                    : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/></svg>';
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

                            var _pinSortFull = { rate: "高分在前", rate_asc: "低分在前", "new": "最新加入", old: "最早加入", name: "按名称", manual: "手动顺序" };
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
                                        _pinSig = "";
                                        showCategory(cat, {keepGrid:true});
                                    };
                                    _smenu.appendChild(_sb);
                                })(_smodes[_smi][0], _smodes[_smi][1]); }
                                document.body.appendChild(_smenu);
                                var _sclose = function(ev2) { if (!_smenu.contains(ev2.target)) { _smenu.remove(); document.removeEventListener("mousedown", _sclose); } };
                                setTimeout(function(){ document.addEventListener("mousedown", _sclose); }, 0);
                            };
                            var _pinHead = pinnedBar.querySelector("#tp-pin-head");
                            if (_pinHead) {
                                var _pinTools = document.createElement("div");
                                _pinTools.id = "tp-pin-tools";
                                _pinTools.style.cssText = "flex:1 0 100%;display:flex;align-items:center;gap:8px;min-width:0;padding:2px 0 4px;";
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
                                _pinPager.appendChild(_mkPinPg("\u2039", "\u4e0a\u4e00\u9875", _pinPage <= 1, function() { _pinPage--; _pinSig = ""; showCategory(cat, {keepGrid:true}); }));
                                var _pinLab = document.createElement("span");
                                _pinLab.textContent = "\u7b2c " + _pinPage + "/" + _pinPages + " \u9875";
                                _pinLab.title = "\u7f6e\u9876 " + pinnedTags.length + " \u4e2a\uff0c\u6bcf\u9875 " + _pinPageSize + " \u4e2a";
                                _pinLab.style.cssText = "font-size:12px;color:var(--anima-ink, #e8e8e8);min-width:72px;text-align:center;white-space:nowrap;";
                                _pinPager.appendChild(_pinLab);
                                _pinPager.appendChild(_mkPinPg("\u203a", "\u4e0b\u4e00\u9875", _pinPage >= _pinPages, function() { _pinPage++; _pinSig = ""; showCategory(cat, {keepGrid:true}); }));
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
                                            var _me = div.querySelector("#_multiToggle"); if(_me) _me.textContent = "\u2611 \u591a\u9009("+_multiSelected.length+")";
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
                                            window.animaFavGrid.rateFavorite(_favSource, _pt, "artists", n, _favSyncId).then(function(d){
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
                            if (!pinnedTags.length) pinnedBar.innerHTML = '<span class="tp-pin-empty" style="color:var(--anima-mute);font-size:10px;">\u{1f4cc} \u6682\u65e0\u7f6e\u9876\u753b\u5e08</span>';
                            }
                        }
                        var _foldNow = pinnedBar.querySelector('#tp-pin-fold'); if (_foldNow) _foldNow.textContent = _pinCollapsed ? '\u25bc \u5c55\u5f00' : '\u25b2 \u6536\u8d77'; pinnedBar.querySelectorAll('.tp-pin-chip').forEach(function(ch){ ch.style.display = _pinCollapsed ? 'none' : 'flex'; }); var _pr2 = pinnedBar.querySelector('#tp-pin-resize'); if (_pr2) _pr2.style.display = _pinCollapsed ? 'none' : 'block'; _pinApplyHeight();
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
                                    _sb.textContent = _st ? "\u2b50" : "\u2606";
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
                            card.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:100%;padding:4px;border-radius:6px;background:rgba(var(--anima-well-rgb),.22);border:1px solid rgba(255,255,255,.08);cursor:pointer;box-sizing:border-box;position:relative;transition:box-shadow .15s ease;';
                            if (_multiMode && _multiSelected.indexOf(tag) >= 0) { card.style.border = '2px solid var(--anima-accent-soft)'; card.style.background = 'rgba(var(--anima-title-rgb),.42)'; }
                            // ── ⭐ 按钮 ──
                            var _starred = info.starred || info.star || false;
                            var starBtn = document.createElement('span');
                            starBtn.className = 'fav-star-btn';
                            starBtn.textContent = _starred ? '\u2b50' : '\u2606';
                            starBtn.title = _starred ? '\u53d6\u6d88\u661f\u6807' : '\u661f\u6807\u7f6e\u9876';
                            starBtn.style.cssText = 'position:absolute;top:4px;right:4px;cursor:pointer;width:26px;height:26px;border-radius:50%;background:rgba(13,17,22,0.55);display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;color:' + (_starred ? '#ffeb3b' : 'var(--anima-mute)') + ';z-index:3;opacity:1;transition:transform .15s ease;';
                            starBtn.onclick = (function(_tag, _cat, _curStarred){
                                return function(e){
                                    e.stopPropagation();
                                    var _liveInfo = items[_tag] || {};
                                    var _isStarred = !!(_liveInfo.starred || _liveInfo.star);
                                    var starUrl = _favSource === 'danbooru' ? '/danbooru_anima/favorites/star' : '/gelbooru_anima/favorites/star';
                                    var body2 = {tag: _tag, category: _cat};
                                    if (_favSource !== 'danbooru') body2.star = !_isStarred;
                                    fetch(starUrl, {
                                        method: 'POST', headers: {'Content-Type':'application/json'},
                                        body: JSON.stringify(body2)
                                    }).then(function(r){return r.json();}).then(function(d){
                                        if (d.success) {
                                        items[_tag] = items[_tag] || {};
                                        var _ns = _favSource==='danbooru'?d.starred:!_isStarred;
                                        if(_favSource==='danbooru') items[_tag].starred = _ns; else items[_tag].star = _ns;
                                        if (window.animaFavGrid && window.animaFavGrid.emitChange) window.animaFavGrid.emitChange(_favSyncId);
                                        var _needGrid = !!(_hidePinned && !_ns);
                                        if (_needGrid) { showCategory(_cat); return; }
                                        var _cards = body.querySelectorAll(".tp-card");
                                        for (var _ci = 0; _ci < _cards.length; _ci++) {
                                            if (!_cards[_ci].dataset || _cards[_ci].dataset.tag !== _tag) continue;
                                            var _sb = _cards[_ci].querySelector(".fav-star-btn");
                                            if (_sb) {
                                                _sb.textContent = _ns ? "\u2b50" : "\u2606";
                                                _sb.style.color = _ns ? "#ffeb3b" : "var(--anima-mute)";
                                                _sb.title = _ns ? "\u53d6\u6d88\u661f\u6807" : "\u661f\u6807\u7f6e\u9876";
                                            }
                                            var _rr = _cards[_ci].querySelector(".anima-fav-rate");
                                            if (_rr) { if (_ns) _rr.classList.remove("is-unpin"); else _rr.classList.add("is-unpin"); }
                                            if (_hidePinned && _ns) _cards[_ci].remove();
                                            break;
                                        }
                                        if (_cat === "artists") showCategory(_cat, { keepGrid: true });
                                    }
                                    }).catch(function(){});
                                };
                            })(tag, cat, _starred);
                            card.appendChild(starBtn);
                            starBtn.onmouseover = function(e2){ e2.stopPropagation(); };
                            starBtn.onmouseout = function(e2){ e2.stopPropagation(); };
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
                                    window.animaFavGrid.rateFavorite(_favSource, _rtag, "artists", n, _favSyncId).then(function(d){
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
                                        if(multiEl2) multiEl2.textContent = "\u2611 \u591a\u9009("+_multiSelected.length+")";
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
                        if(!cnt) body.innerHTML = _hidePinned
                            ? '<div class="fav-empty" style="color:var(--anima-mute);padding:20px;text-align:center;grid-column:1/-1;">👁 已开启隐藏置顶 · 所有画师均已收藏（可在上方置顶栏调用）</div>'
                            : '<div class="fav-empty" style="color:var(--anima-mute);padding:20px;text-align:center;grid-column:1/-1;">\u6682\u65e0\u6536\u85cf</div>';
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
                }); // end loadFavs .then
                }
                loadFavs();
                if (window.animaFavGrid && window.animaFavGrid.onChange) {
                    _unsubFavSync = window.animaFavGrid.onChange(function(){ if (div.isConnected) loadFavs(); }, _favSyncId);
                }
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
                body.style.cssText = 'flex:1;overflow-y:auto;padding:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px;align-content:flex-start;';
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
            // ── 画师收藏缓存（@ 触发下拉 + chip hover 缩略图共用） ──
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
                        row.style.cssText = "display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer;color:#ccc;font-size:13px;borderBottom:1px solid var(--anima-bg);";
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
            node._ptAcCloseFn = function(e){ if(!container.contains(e.target))acList.style.display="none"; };
            document.addEventListener("click", node._ptAcCloseFn);

            container.append(searchInput, acList, toolbar, _batchBar, chipArea, chipInputRow, tagTextarea);

            // ── 暂停逻辑 ──
            // 移除旧 listener 防止重复注册
            if (node._ptHandler) api.removeEventListener("db-pt-show-continue", node._ptHandler);
            var _ptGen = (node._ptHandlerGen || 0) + 1;
            node._ptHandlerGen = _ptGen;
            node._ptHandler = function(e) {
                // 代际检查：旧 handler 即使残留也直接忽略，防止过期闭包自动透传
                if (node._ptHandlerGen !== _ptGen) return;
                if (e.detail.node_id != node.id) return;
                // 每次触发同步暂停状态（防内存变量与 localStorage 分裂）
                _pauseMode = localStorage.getItem("db_pt_pause_" + node.id) === "true";
                if (_pauseMode) { pauseBtn.textContent = "\u23f8 \u6682\u505c \u5f00"; }
                else { pauseBtn.textContent = "\u23f8 \u6682\u505c \u5173"; }
                if (window.animaPaintModeSwitch) window.animaPaintModeSwitch(pauseBtn, "pause", _pauseMode);
                _paintModeFrame();
                                continueBtn.style.right = uiBtn.style.right;
                if (!_useInput) {
                    var uw = node.widgets?.find(function(w){return w.name==="use_input_text";});
                    if (uw) tagTextarea.value = uw.value ? (e.detail.text || "") : (tagTextarea.value || "");
                } else {
                    tagTextarea.value = e.detail.text || "";
                    // merge hidden tags back: hidden data must not be lost (else syncWidget persists filtered list)
                    _weights = {};
                    _mergeHiddenKeysIntoTextarea();
                }
                                syncWidget();
                if(_chipMode) renderChips();
                if (!_pauseMode) {
                    fetch("/danbooru_anima/pt_continue/" + node.id, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ text: _getCleanOutput(), gen: e.detail.gen || 0 }) }).catch(function(){});
                    return;
                }
                continueBtn.style.display = "inline"; _playNotify();
                continueBtn.onclick = async function() {
                    try {
                        await fetch("/danbooru_anima/pt_continue/" + node.id, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: _getCleanOutput(), gen: e.detail.gen || 0 }) });
                        continueBtn.style.display = "none";
                    } catch(e){}
                };
            };
            api.addEventListener("db-pt-show-continue", node._ptHandler);
            if (node._ptIntHandler) {
                api.removeEventListener("execution_interrupted", node._ptIntHandler);
                api.removeEventListener("db-pt-hide-continue", node._ptIntHandler);
            }
            node._ptIntHandler = function(e) {
                var nid = e && e.detail && e.detail.node_id;
                if (nid != null && String(nid) !== String(node.id)) return;
                continueBtn.style.display = "none";
            };
            api.addEventListener("execution_interrupted", node._ptIntHandler);
            api.addEventListener("db-pt-hide-continue", node._ptIntHandler);

            // ── 节点删除时清理定时器/监听器（防累积泄漏，对齐 D站浏览器模式）──
            if (!node._ptCleaned) {
                node._ptCleaned = true;
                node.onRemoved = node.onRemoved || function() {
                    try { if (node._ptSaveTimer) clearInterval(node._ptSaveTimer); } catch(e) {}
                    try { if (node._ptColorTimer) clearInterval(node._ptColorTimer); } catch(e) {}
                    try { if (node._ptAcCloseFn) document.removeEventListener("click", node._ptAcCloseFn); } catch(e) {}
                    try { if (node._ptHandler) api.removeEventListener("db-pt-show-continue", node._ptHandler); } catch(e) {}
                    try {
                        if (node._ptIntHandler) {
                            api.removeEventListener("execution_interrupted", node._ptIntHandler);
                            api.removeEventListener("db-pt-hide-continue", node._ptIntHandler);
                        }
                    } catch(e) {}
                };
            }

            // 保存到 localStorage（key 含 node.id，防跨工作流串数据）
            node._ptSaveTimer = setInterval(function() {
                try {
                    if (tagTextarea.value) {
                        localStorage.setItem("db_pt_content_" + node.id, tagTextarea.value);
                        syncWidget();
                    }
                } catch(e){}
            }, 3000);
            // 初始化恢复
            setTimeout(function() {
                var _pw = node.widgets?.find(w => w.name === "prompt_text");
                var _uiw2 = node.widgets?.find(w => w.name === "use_input_text");
                var _tw = node.widgets?.find(w => w.name === "text");
                var _fw2 = node.widgets?.find(function(w){return w.name==="_db_full_tags";});
                var _v = (_fw2 && _fw2.value) ? _fw2.value : "";
                if (!_v) { _v = localStorage.getItem("db_pt_content_" + node.id) || ""; }
                if (!_v) { _v = _pw ? _pw.value : ""; }
                if (_v) tagTextarea.value = _v;
                // merge hidden tags back into list (in case persisted list is filtered)
                _mergeHiddenKeysIntoTextarea();
                _saveHidden();
                if (_uiw2) {
                    _useInput = _uiw2.value;
                    uiBtn.textContent = _useInput ? "📥 输入" : "📝 内容";
                    if (window.animaPaintModeSwitch) window.animaPaintModeSwitch(uiBtn, "io", _useInput);
                    _paintModeFrame();
                }
                syncWidget();
                _applyChipLayout(); if (_chipMode) renderChips();
                collapseHiddenWidgets();
            }, 500);
            var _prevPtResize = node.onResize;
            node.onResize = function () {
                var r;
                if (typeof _prevPtResize === "function") r = _prevPtResize.apply(this, arguments);
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
