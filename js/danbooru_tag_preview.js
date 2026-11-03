import { app } from "/scripts/app.js";
import { $el } from "/scripts/ui.js";
import "./00_anima_theme.js";

app.registerExtension({
    name: "Comfy.DanbooruTagPreview",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DanbooruTagPreview") return;
        window.hookAnimaNodeChrome(nodeType);
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onCreated?.apply(this, arguments);
            const node = this;
            window.applyAnimaNodeChrome(this);
            function collapseHiddenWidgets() {
                for (const wg of node.widgets || []) {
                    if (wg.name !== "tags") continue;
                    wg.computeSize = () => [0, -4];
                    wg.draw = function() {};
                    wg.serialize = true;
                    try { wg.hidden = true; } catch(e) {}
                    if (wg.options) wg.options.hidden = true;
                    else wg.options = { hidden: true };
                    wg.computedHeight = -4;
                }
            }
            collapseHiddenWidgets();
            setTimeout(collapseHiddenWidgets, 80);
            setTimeout(collapseHiddenWidgets, 400);

            let _lastVal = "";
            // 接收执行结果
            node.onExecuted = function(output) {
                let raw = output?.tags;
                if (Array.isArray(raw)) raw = raw[0] || "";
                const v = (raw || "").trim();
                if (v !== _lastVal) { _lastVal = v; render(); }
            };

            // ── 颜色同步（与文本节点一致） ──
            var _tagColorCache = {}, _mapperCatColors = {}, _mapperKwColor = {};
            fetch("/danbooru_anima/tag_colors").then(r=>r.json()).then(d=>{_tagColorCache=d||{};}).catch(()=>{});
            fetch("/danbooru_anima/tag_mapper_cats").then(r=>r.json()).then(cs=>{for(var ci=0;ci<cs.length;ci++)_mapperCatColors[cs[ci].v]=cs[ci].c;}).catch(()=>{});
            function _refreshMapperColors(){fetch("/danbooru_anima/tag_mapper_cats").then(r=>r.json()).then(cs=>{for(var ci=0;ci<cs.length;ci++)_mapperCatColors[cs[ci].v]=cs[ci].c;}).catch(()=>{});fetch("/danbooru_anima/tag_mapper_rules").then(r=>r.json()).then(d=>{if(d.success&&d.rules){var rs=d.rules;var keys=Object.keys(rs);for(var ri=0;ri<keys.length;ri++){var kw=keys[ri];var col=_mapperCatColors[rs[kw]]||"#888";var kwClean=kw.replace(/\\\(/g,"(").replace(/\\\)/g,")").replace(/\\\[/g,"[").replace(/\\\]/g,"]");_mapperKwColor[kw]=col;_mapperKwColor[kw.replace(/ /g,"_")]=col;_mapperKwColor[kw.replace(/_/g," ")]=col;_mapperKwColor[kwClean]=col;_mapperKwColor[kwClean.replace(/ /g,"_")]=col;_mapperKwColor[kwClean.replace(/_/g," ")]=col;}}}).catch(()=>{});fetch("/danbooru_anima/tag_mapper_mappings").then(r=>r.json()).then(d=>{var tags=d.mappings||{};var keys=Object.keys(tags);for(var ri=0;ri<keys.length;ri++){var kw=keys[ri];var col=_mapperCatColors[tags[kw]]||"#888";var kwClean=kw.replace(/\\\(/g,"(").replace(/\\\)/g,")").replace(/\\\[/g,"[").replace(/\\\]/g,"]");_mapperKwColor[kw]=col;_mapperKwColor[kw.replace(/ /g,"_")]=col;_mapperKwColor[kw.replace(/_/g," ")]=col;_mapperKwColor[kwClean]=col;_mapperKwColor[kwClean.replace(/ /g,"_")]=col;_mapperKwColor[kwClean.replace(/_/g," ")]=col;}}).catch(()=>{});}
            _refreshMapperColors();
            node._tpColorTimer = setInterval(_refreshMapperColors, 60000); // 静态配置，60s 低频轮询避免每3秒刷3个请求
            // 节点删除时清理轮询（防累积泄漏）
            if (!node._tpCleaned) {
                node._tpCleaned = true;
                node.onRemoved = node.onRemoved || function() {
                    try { if (node._tpColorTimer) clearInterval(node._tpColorTimer); } catch(e) {}
                };
            }
            function _tagColor(tag) {
                var _r = "#555555";
                if (!tag) return _r;
                if (tag.startsWith("@")) return "#e91e63";
                if (/^score_|^rating_|^year_/.test(tag)) return "#ff9800";
                // 映射器颜色优先
                var _mck2=tag;var _mci2=tag.lastIndexOf("_");if(_mci2>0)_mck2=tag.slice(_mci2+1);
                var _cleanTag = tag.replace(/\\\(/g,"(").replace(/\\\)/g,")").replace(/\\\[/g,"[").replace(/\\\]/g,"]");
                var _mc2 = _mapperKwColor[tag] || _mapperKwColor[tag.replace(/_/g," ")] || _mapperKwColor[_cleanTag] || _mapperKwColor[_cleanTag.replace(/_/g," ")];
                if(!_mc2){var _words=tag.split(/[ _]+/);for(var _wi=0;_wi<_words.length;_wi++){_mc2=_mapperKwColor[_words[_wi]];if(_mc2)break;}}
                if(!_mc2)_mc2=_mapperKwColor[_mck2];
                if(_mc2) return _mc2;
                var _c = _tagColorCache[tag] || _tagColorCache[tag.replace(/ /g,"_")] || _tagColorCache[_cleanTag] || _tagColorCache[_cleanTag.replace(/ /g,"_")];
                return _c ? _c.c : "#555555";
            }

            const container = $el("div", { style: { width: "100%", height: "100%", position: "relative", display: "flex", flexDirection: "column", background: "var(--anima-bg)", borderRadius: "4px", overflow: "hidden" } });
            if (typeof window.applyAnimaPanelGlow === "function") window.applyAnimaPanelGlow(container);
            const chipArea = $el("div", {
                style: {
                    width: "100%", height: "100%", flex: "1", minHeight: "0", position: "relative",
                    padding: "6px 8px", overflowY: "auto", boxSizing: "border-box",
                    display: "flex", flexWrap: "wrap", gap: "6px",
                    alignContent: "flex-start",
                    background: "transparent", color: "var(--anima-ink)",
                }
            });
            chipArea.textContent = "等待执行...";

            function _makeChip(disp, apiTag, cn) {
                var col = _tagColor(apiTag);
                var _isMerged = disp.indexOf("; ") >= 0;
                var _isWide = _isMerged || disp.length > 40;
                var chip = $el("div", { style: { flexBasis: _isWide ? "100%" : "auto", maxWidth: _isWide ? "none" : "300px", width: _isWide ? "100%" : "auto" } });
                if (typeof window.animaApplyTagChip === "function") window.animaApplyTagChip(chip, col, { static: true, wide: _isWide, merged: _isMerged });
                else { chip.style.background = col+"22"; chip.style.border = "1px solid "+col+"88"; chip.style.borderLeft = "3px solid "+col; chip.style.borderRadius = "8px"; chip.style.padding = "4px 9px 4px 10px"; chip.style.color = "var(--anima-ink-chip)"; chip.style.display = "inline-flex"; chip.style.flexDirection = "column"; }
                chip.appendChild($el("span", { textContent: _isMerged ? disp.replace(/; /g, ", ") : disp, className: "anima-chip-en" }));
                if (cn) chip.appendChild($el("span", { textContent: cn, className: "anima-chip-cn" }));
                return chip;
            }
            function _paintChips(tags, map) {
                for (var i = 0; i < tags.length; i++) {
                    var api = tags[i].replace(/ /g, "_");
                    chipArea.appendChild(_makeChip(tags[i], api, (map && map[api]) || ""));
                }
            }

            let _chipMode = true;

            const modeBtn = $el("span", {
                textContent: "📋", title: "切换模式",
                style: { position: "absolute", top: "2px", right: "2px", zIndex: 10, fontSize: "12px", cursor: "pointer", opacity: 0.7, background: "rgba(var(--anima-bg-deep-rgb),.55)", padding: "1px 5px", borderRadius: "3px", lineHeight: "1.2" },
                onclick: () => { _chipMode = !_chipMode; render(); }
            });
            chipArea.style.position = "relative";
            chipArea.appendChild(modeBtn);
            render();

            function render() {
                chipArea.innerHTML = ""; chipArea.style.position = "relative"; chipArea.appendChild(modeBtn);
                const raw = _lastVal.trim();
                if (!raw) { chipArea.innerHTML = '<span style="color:var(--anima-mute-dim);">等待标签...</span>'; chipArea.appendChild(modeBtn); return; }
                if (!_chipMode) {
                    chipArea.innerHTML = `<div style="color:#e0e0e0;font-size:12px;padding:4px;line-height:1.6;word-break:keep-all;">${raw.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>`;
                    chipArea.appendChild(modeBtn); return;
                }
                const tags = raw.split(/[,，]+/).map(s => s.trim()).filter(Boolean);
                if (!tags.length) { chipArea.innerHTML = '<span style="color:var(--anima-mute-dim);">等待标签...</span>'; chipArea.appendChild(modeBtn); return; }
                const apiTags = tags.map(t => t.replace(/ /g, "_"));
                if (!window._tpTransCache) window._tpTransCache = {};
                const _ck = apiTags.join(",");
                const _cached = window._tpTransCache[_ck];
                if (_cached) {
                    chipArea.innerHTML = ""; chipArea.style.position = "relative"; chipArea.appendChild(modeBtn);
                    _paintChips(tags, _cached);
                    return;
                }
                fetch("/danbooru_anima/translate_tags", {
                    method: "POST", headers: {"Content-Type":"application/json"},
                    body: JSON.stringify({tags: apiTags}),
                }).then(r => r.json()).then(td => {
                    const tl = (td.success && td.translations) || {};
                    window._tpTransCache[_ck] = tl;  // 缓存（含空翻译），避免重复请求
                    chipArea.innerHTML = ""; chipArea.style.position = "relative"; chipArea.appendChild(modeBtn);
                    _paintChips(tags, tl);
                }).catch(() => {});
            }

            container.appendChild(chipArea);
            node.addDOMWidget("db_tag_preview_ui", "div", container, { onDraw: () => {} });
        };
    },
});
