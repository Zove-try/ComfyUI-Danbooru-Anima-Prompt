import "./00_anima_theme.js";
import "./00_anima_i18n.js";
// 延迟获取 $el，避免 ES module 加载时 window.comfyAPI 尚未初始化
const $el = (...args) => window.comfyAPI?.ui?.$el?.(...args);
/**
 * 提示词收藏夹弹窗
 * 供文本透传/文本模糊搜索节点调用
 */

// ── PNG 提示词通用提取 ───────────────────────────────
function parsePNGTextChunks(arrayBuffer) {
    var result = {};
    var view = new DataView(arrayBuffer);
    if (arrayBuffer.byteLength < 8) return result;
    // 验证 PNG 签名
    if (view.getUint32(0) !== 0x89504E47 || view.getUint32(4) !== 0x0D0A1A0A) return result;
    var offset = 8;
    while (offset < arrayBuffer.byteLength - 4) {
        var length = view.getUint32(offset);
        offset += 4;
        if (offset + 4 > arrayBuffer.byteLength) break;
        var type = String.fromCharCode(view.getUint8(offset), view.getUint8(offset+1), view.getUint8(offset+2), view.getUint8(offset+3));
        offset += 4;
        if (type === 'tEXt' && offset + length <= arrayBuffer.byteLength) {
            var data = new Uint8Array(arrayBuffer, offset, length);
            var text = new TextDecoder().decode(data);
            var nulIdx = text.indexOf('\0');
            if (nulIdx >= 0) {
                result[text.slice(0, nulIdx)] = text.slice(nulIdx + 1);
            }
        } else if (type === 'IEND') {
            break;
        }
        offset += length + 4;
    }
    return result;
}

async function extractPromptFromPNG(file) {
    try {
        var buf = await file.arrayBuffer();
        var chunks = parsePNGTextChunks(buf);
        var workflow = null;
        if (chunks.workflow) {
            try { workflow = JSON.parse(chunks.workflow); } catch(e) {}
        }
        // ① workflow 存在 → 找 type===DanbooruTextPassthrough && id===777
        if (workflow && workflow.nodes) {
            var nodes = workflow.nodes;
            var target = null;
            for (var i = 0; i < nodes.length; i++) {
                if (nodes[i].type === "DanbooruTextPassthrough" && String(nodes[i].id) === "777") {
                    target = nodes[i]; break;
                }
            }
            // ② 无精确匹配 → 取最后一个 DanbooruTextPassthrough
            if (!target) {
                for (var j = nodes.length - 1; j >= 0; j--) {
                    if (nodes[j].type === "DanbooruTextPassthrough") {
                        target = nodes[j]; break;
                    }
                }
            }
            if (target) {
                var wv = target.widgets_values || [];
                var promptText = (wv[2] || "").toString().trim();
                if (promptText) return { text: promptText, error: null };
            }
        }
        // ③ parameters 存在 → 解析 WebUI / C站 格式
        if (chunks.parameters) {
            var params = chunks.parameters;
            var negIdx = params.indexOf("Negative prompt:");
            var promptText = (negIdx >= 0 ? params.slice(0, negIdx) : params).trim();
            if (promptText) return { text: promptText, error: null };
        }
        // ④ 都没找到
        return { text: "", error: "此图像不包含可读取的提示词数据。\n\n请使用最新版通用反推流、WebUI 或 C站生成的图像。" };
    } catch(e) {
        return { text: "", error: "读取图像失败: " + (e.message || e) };
    }
}

export function openPromptFavPopup(node, currentText, onSelect) {
    let _modelTags = [];
    let _prompts = [];
    let _folders = [];
    let _activeFolder = "";
    // ── 来源检测 ──
    var _source = (node && node.type === "AnimaPromptCreator") ? "composer" : "";
    var _composerTab = false;  // 是否选中创作器标签
    var _composerFolders = [];
    var _activeComposerSub = "";  // 创作器子分类

    // 加载数据
    const _load = async () => {
        const [r1, r2] = await Promise.all([
            fetch("/danbooru_anima/prompt_favorites"),
            fetch("/danbooru_anima/prompt_model_tags"),
        ]);
        const d1 = await r1.json();
        const d2 = await r2.json();
        if (d1.success) { _prompts = d1.prompts || []; _folders = d1.folders || []; _composerFolders = d1.composer_folders || []; }
        if (d2.success) _modelTags = d2.tags || [];
    };

    // ── 标签芯片渲染（全文弹窗用） ──
    var _tagColorCache2 = null;
    var _tagTranslationCache2 = {};
    function _stylePfChip(chip, col, selected, pick, merged) {
        chip.style.margin = "2px";
        if (typeof window.animaApplyTagChip === "function") {
            window.animaApplyTagChip(chip, col, { static: true, pick: !!pick, selected: !!selected, merged: !!merged });
        } else {
            chip.style.cssText = "display:inline-flex;flex-direction:column;align-items:center;padding:3px 8px;border-radius:4px;font-size:11px;background:" + col + "22;color:#e0e0e0;border:1px solid " + col + ";margin:2px;";
        }
    }
    async function renderTagChips(container, text, _mergeMode, _mergeSelected, _onMergeChanged) {
        container.innerHTML = '<span style="color:var(--anima-mute);">加载中...</span>';
        var tags = text.split(",").map(function(t){ return t.trim(); }).filter(Boolean);
        if (!tags.length) { container.innerHTML = '<span style="color:var(--anima-mute);">无标签</span>'; return; }
        if (!_tagColorCache2) {
            try {
                var cr = await fetch("/danbooru_anima/tag_colors");
                _tagColorCache2 = await cr.json();
            } catch(e) { _tagColorCache2 = {}; }
        }
        var unknown = tags.filter(function(t){ return !(t in _tagTranslationCache2); });
        if (unknown.length) {
            var apiTags = unknown.map(function(t){ return t.replace(/ /g, "_"); });
            try {
                var tr = await fetch("/danbooru_anima/translate_tags", {
                    method: "POST", headers: {"Content-Type":"application/json"},
                    body: JSON.stringify({tags: apiTags}),
                });
                var td = await tr.json();
                if (td.success && td.translations) {
                    for (var i = 0; i < unknown.length; i++) {
                        _tagTranslationCache2[unknown[i]] = td.translations[apiTags[i]] || "";
                    }
                }
            } catch(e) {}
        }
        container.innerHTML = "";
        for (var i = 0; i < tags.length; i++) {(function(ii){
            var tag = tags[ii];
            var cn = _tagTranslationCache2[tag] || "";
            var colorInfo = _tagColorCache2[tag] || _tagColorCache2[tag.replace(/_/g, " ")] || {};
            var col = colorInfo.c || "#888";
            var chip = document.createElement("span");
            chip.setAttribute("data-pf-chip", "1");
            chip.setAttribute("data-tag", tag);
            var _selChip = !!(_mergeMode && _mergeSelected && _mergeSelected[ii]);
            var _mergedChip = tag.indexOf("; ") >= 0;
            _stylePfChip(chip, col, _selChip, !!_mergeMode, _mergedChip);
            // ── 合并模式复选框 ──
            if (_mergeMode) {
                var _cb2 = document.createElement("span");
                _cb2.textContent = _selChip ? "☑" : "☐";
                _cb2.style.cssText = "cursor:pointer;font-size:13px;color:" + (_selChip ? "#e94560" : "var(--anima-mute)") + ";margin-bottom:2px;user-select:none;";
                var _toggleMerge = function() {
                    if (!_mergeSelected) return;
                    if (_mergeSelected[ii]) { delete _mergeSelected[ii]; _cb2.textContent = "☐"; _cb2.style.color = "var(--anima-mute)"; _stylePfChip(chip, col, false, true, _mergedChip); }
                    else { _mergeSelected[ii] = true; _cb2.textContent = "☑"; _cb2.style.color = "#e94560"; _stylePfChip(chip, col, true, true, _mergedChip); }
                    if (_onMergeChanged) _onMergeChanged();
                };
                _cb2.onmousedown = function(ev2) {
                    ev2.stopPropagation(); ev2.preventDefault();
                    _toggleMerge();
                };
                chip.appendChild(_cb2);
                chip.onmousedown = function(ev2) {
                    if (ev2.target === _cb2) return;
                    ev2.preventDefault(); ev2.stopPropagation();
                    _toggleMerge();
                };
            }
            var tagLab = document.createElement("span");
            tagLab.className = "anima-chip-en";
            tagLab.textContent = tag.indexOf("; ") >= 0 ? tag.replace(/; /g, ", ") : tag;
            chip.appendChild(tagLab);
            // ── ↩ 拆分解合并块 ──
            if (tag.indexOf("; ") >= 0) {
                var _unmerge3 = document.createElement("span");
                _unmerge3.textContent = "↩"; _unmerge3.title = "拆分解";
                _unmerge3.style.cssText = "cursor:pointer;font-size:10px;color:#ffd93d;margin-left:4px;";
                _unmerge3.onclick = function(ev3) {
                    ev3.stopPropagation();
                    var _parts3 = tag.split("; ");
                    // 更新显示文本
                    var _curText = window._pfMergedText2 || text;
                    var _all3 = _curText.split(",").map(function(s){return s.trim();}).filter(Boolean);
                    var _idx3 = -1;
                    for (var _ai3 = 0; _ai3 < _all3.length; _ai3++) { if (_all3[_ai3] === tag) { _idx3 = _ai3; break; } }
                    if (_idx3 >= 0) {
                        _all3.splice(_idx3, 1);
                        for (var _pi3 = _parts3.length-1; _pi3 >= 0; _pi3--) { _all3.splice(_idx3, 0, _parts3[_pi3]); }
                        window._pfMergedText2 = _all3.join(", ");
                        // 保存合并状态
                        fetch("/danbooru_anima/prompt_favorites/save", {
                            method: "POST", headers: {"Content-Type":"application/json"},
                            body: JSON.stringify({id: window._pfCurrentPromptId, merged_text: window._pfMergedText2}),
                        }).catch(function(){});
                    }
                    // 重新渲染
                    renderTagChips(container, window._pfMergedText2, _mergeMode, _mergeSelected, _onMergeChanged);
                };
                chip.appendChild(_unmerge3);
            }
            if (cn) {
                var cnLab = document.createElement("span");
                cnLab.className = "anima-chip-cn";
                cnLab.textContent = cn;
                cnLab.style.cssText = "cursor:pointer;";
                cnLab.title = "点击纠正翻译";
                cnLab.onclick = function(ev) {
                    ev.stopPropagation();
                    var inp = document.createElement("input");
                    inp.type = "text"; inp.value = cn;
                    inp.style.cssText = "width:60px;padding:1px 4px;border:1px solid var(--anima-accent-soft);border-radius:3px;background:var(--anima-well);color:#e0e0e0;font-size:9px;outline:none;text-align:center;";
                    cnLab.replaceWith(inp);
                    inp.focus(); inp.select();
                    inp.onblur = function() { _finishEdit(inp, cnLab); };
                    inp.onkeydown = function(ev2) { if (ev2.key === "Enter") { ev2.preventDefault(); _finishEdit(inp, cnLab); } if (ev2.key === "Escape") { cnLab.textContent = cn; inp.replaceWith(cnLab); } };
                };
                chip.appendChild(cnLab);
            } else {
                // 无翻译时显示空白占位，可点击添加翻译
                var noCn = document.createElement("span");
                noCn.className = "anima-chip-cn";
                noCn.textContent = "+";
                noCn.style.cssText = "cursor:pointer;opacity:.7;";
                noCn.title = "添加翻译";
                noCn.onclick = function(ev) {
                    ev.stopPropagation();
                    var inp = document.createElement("input");
                    inp.type = "text"; inp.value = ""; inp.placeholder = animaTxt("翻译");
                    inp.style.cssText = "width:50px;padding:1px 4px;border:1px solid var(--anima-accent-soft);border-radius:3px;background:var(--anima-well);color:#e0e0e0;font-size:9px;outline:none;text-align:center;";
                    noCn.replaceWith(inp);
                    inp.focus();
                    inp.onblur = function() { _finishAdd(inp, noCn, tag); };
                    inp.onkeydown = function(ev2) { if (ev2.key === "Enter") { ev2.preventDefault(); _finishAdd(inp, noCn, tag); } if (ev2.key === "Escape") { inp.replaceWith(noCn); } };
                };
                chip.appendChild(noCn);
            }
            container.appendChild(chip);
        })(i);}
        // ── 未翻译标签云翻译按钮 ──
        var _stillUnknown = tags.filter(function(t){ return !_tagTranslationCache2[t]; });
        if (_stillUnknown.length > 0) {
            var _trBtn = document.createElement("span");
            _trBtn.textContent = "🌐 翻译 " + _stillUnknown.length + " 个未翻译标签";
            _trBtn.title = "调用云端翻译";
            _trBtn.style.cssText = "display:inline-flex;align-items:center;padding:5px 12px;margin:6px 2px;border-radius:8px;background:linear-gradient(180deg,rgba(var(--anima-accent-range-rgb),.22),rgba(var(--anima-accent-hi-rgb),.10));color:var(--anima-ink-mid);cursor:pointer;font-size:11px;font-weight:600;border:1px solid rgba(var(--anima-accent-soft-rgb),.42);box-shadow:inset 0 1px 0 rgba(255,255,255,.12);";
            _trBtn.onclick = async function() {
                var btn = this;
                btn.textContent = animaTxt("⏳ 翻译中...");
                btn.style.pointerEvents = "none";
                var _curText = window._pfMergedText2 || text;
                var tags = _curText.split(",").map(function(s){return s.trim();}).filter(Boolean);
                var _stillUnknown2 = tags.filter(function(t){ return !_tagTranslationCache2[t] || t.indexOf("; ") >= 0; });
                if (!_stillUnknown2.length) { btn.textContent = "🌐 全部已翻译"; btn.style.pointerEvents = ""; return; }
                if (!_stillUnknown2.length) { btn.textContent = "🌐 全部已翻译"; btn.style.pointerEvents = ""; return; }
                var _apiTags = [];
                var _mergedExtra = {}; // { index: mergedBlockOriginal }
                for (var si = 0; si < _stillUnknown2.length; si++) {
                    var t = _stillUnknown2[si];
                    if (t.indexOf("; ") >= 0) {
                        // 合并块：; 还原为逗号，当完整句子翻译
                        _apiTags.push(t.replace(/; /g, ", "));
                        _mergedExtra[si] = t;
                    } else {
                        _apiTags.push(t.replace(/ /g, "_"));
                    }
                }
                var _prov = localStorage.getItem("db_trans_provider") || "free";
                var _apiKey = ""; var _mod = ""; var _url = "";
                if (_prov === "google" || _prov === "free") {
                    _prov = localStorage.getItem("db_free_mode") || "baidu";
                    _mod = ""; _url = "";
                    if (_prov === "baidu") {
                        _apiKey = localStorage.getItem("db_trans_key_bd") || "";
                        if (!_apiKey || _apiKey.indexOf(":") < 0) { alert("请先设置百度翻译（格式: appid:secret）"); btn.textContent = "🌐 翻译 " + _stillUnknown2.length + " 个未翻译标签"; btn.style.pointerEvents = ""; return; }
                    } else {
                        _apiKey = _prov === "google" ? "" : "";
                    }
                } else if (_prov === "deepseek") {
                    _apiKey = localStorage.getItem("db_trans_key_ds") || "";
                    _mod = window.animaDsModelId(localStorage.getItem("db_trans_ds_model") || localStorage.getItem("db_ds_model") || "flash");
                    _url = "https://api.deepseek.com/v1";
                    if (!_apiKey) { alert("请先设置 DeepSeek API Key"); btn.textContent = "🌐 翻译 " + _stillUnknown2.length + " 个未翻译标签"; btn.style.pointerEvents = ""; return; }
                } else if (_prov === "siliconflow") {
                    _apiKey = localStorage.getItem("db_trans_key_sf") || "";
                    _mod = localStorage.getItem("db_trans_model_sf") || "";
                    _url = "https://api.siliconflow.cn/v1";
                    if (!_apiKey) { alert("请先设置 SiliconFlow API Key"); btn.textContent = "🌐 翻译 " + _stillUnknown2.length + " 个未翻译标签"; btn.style.pointerEvents = ""; return; }
                } else if (_prov === "custom") {
                    _apiKey = localStorage.getItem("db_trans_key_cu") || "";
                    _mod = localStorage.getItem("db_trans_model_cu") || "";
                    _url = localStorage.getItem("db_trans_base_url_cu") || "";
                    if (!_apiKey || !_url) { alert("请先设置自定义 API"); btn.textContent = "🌐 翻译 " + _stillUnknown2.length + " 个未翻译标签"; btn.style.pointerEvents = ""; return; }
                }
                try {
                    var _tr = await fetch("/danbooru_anima/cloud_translate", {
                        method: "POST", headers: {"Content-Type":"application/json"},
                        body: JSON.stringify({tags: _apiTags, provider: _prov, api_key: _apiKey, model: _mod, base_url: _url}),
                    });
                    var _td = await _tr.json();
                    if (_td.success && _td.translations) {
                        for (var ui = 0; ui < _stillUnknown2.length; ui++) {
                            var apiKeyN = _apiTags[ui];
                            if (_mergedExtra[ui]) {
                                var cnVal = _td.translations[apiKeyN];
                                console.log("[pf] merged first key:", apiKeyN.substring(0,40), "found="+!!cnVal);
                                if (!cnVal) {
                                    // 重试：用句子翻译 prompt（非 tag 模式）
                                    try {
                                        var _retryText = _mergedExtra[ui].replace(/; /g, ", ");
                                        var _rr = await fetch("/danbooru_anima/cloud_translate", {
                                            method: "POST", headers: {"Content-Type":"application/json"},
                                            body: JSON.stringify({tags: [_retryText], provider: _prov, api_key: _apiKey, model: _mod, base_url: _url, as_sentence: true}),
                                        });
                                        var _rd = await _rr.json();
                                        console.log("[pf] retry success="+_rd.success+" keys="+Object.keys(_rd.translations||{}).map(function(k){return k.substring(0,30);}));
                                        if (_rd.success && _rd.translations) {
                                            cnVal = _rd.translations[_retryText] || _rd.translations[_retryText.replace(/ /g, "_")] || "";
                                            // fallback: API 可能把长句拆成多段返回，拼接所有译文
                                            if (!cnVal) {
                                                var _allVals = Object.values(_rd.translations);
                                                cnVal = _allVals.join("");
                                            }
                                        }
                                    } catch(e2) {}
                                    if (!cnVal) cnVal = _mergedExtra[ui];
                                }
                                _tagTranslationCache2[_stillUnknown2[ui]] = cnVal;
                            } else {
                                var cnVal2 = _td.translations[apiKeyN];
                                if (!cnVal2) {
                                    // fallback: normalize key（去 LLM 转义）
                                    var nk = apiKeyN.replace(/\\\(/g,"(").replace(/\\\)/g,")").replace(/\\\[/g,"[").replace(/\\\]/g,"]");
                                    if (nk !== apiKeyN) cnVal2 = _td.translations[nk];
                                }
                                if (cnVal2) {
                                    _tagTranslationCache2[_stillUnknown2[ui]] = cnVal2;
                                }
                            }
                        }
                    } else { }
                } catch(e) { console.error("[favorites] 翻译异常:", e); }
                btn.textContent = "🌐 翻译 " + tags.filter(function(t){ return !_tagTranslationCache2[t]; }).length + " 个未翻译标签";
                btn.style.pointerEvents = "";
                // 重渲染
                var _curC = container.parentElement ? container : (_b2 && _b2.querySelector("[data-pf-container]")) || container;
                await renderTagChips(_curC, window._pfMergedText2 || text);
                if (window._pfSaveTrans) { window._pfSaveTrans(); }
            };
            container.appendChild(_trBtn);
        }
    }
    function _finishEdit(inp, cnLab) {
        var newCn = inp.value.trim();
        if (newCn && newCn !== cnLab.textContent) {
            var chip = inp.parentElement;
            var tag = (chip && chip.getAttribute) ? (chip.getAttribute("data-tag") || "") : "";
            if (!tag && chip) {
                var en = chip.querySelector(".anima-chip-en");
                tag = en ? en.textContent.replace(/, /g, "; ") : "";
            }
            if (tag) {
                cnLab.textContent = newCn;
                _tagTranslationCache2[tag] = newCn;
                fetch("/danbooru_anima/save_translation", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({tag: tag, cn: newCn}) }).catch(function(){});
            }
        }
        inp.replaceWith(cnLab);
    }
    function _finishAdd(inp, noCn, tag) {
        var newCn = inp.value.trim();
        if (newCn) {
            _tagTranslationCache2[tag] = newCn;
            var cnLab = document.createElement("span");
            cnLab.className = "anima-chip-cn";
            cnLab.textContent = newCn;
            cnLab.style.cssText = "cursor:pointer;";
            cnLab.title = "点击纠正翻译";
            cnLab.onclick = function(ev) {
                ev.stopPropagation();
                var inp2 = document.createElement("input");
                inp2.type = "text"; inp2.value = cnLab.textContent;
                inp2.style.cssText = "width:60px;padding:1px 4px;border:1px solid var(--anima-accent-soft);border-radius:3px;background:var(--anima-well);color:#e0e0e0;font-size:9px;outline:none;text-align:center;";
                cnLab.replaceWith(inp2);
                inp2.focus(); inp2.select();
                inp2.onblur = function() { _finishEdit(inp2, cnLab); };
                inp2.onkeydown = function(ev2) { if (ev2.key === "Enter") { ev2.preventDefault(); _finishEdit(inp2, cnLab); } if (ev2.key === "Escape") { cnLab.textContent = newCn; inp2.replaceWith(cnLab); } };
            };
            noCn.replaceWith(cnLab);
            fetch("/danbooru_anima/save_translation", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({tag: tag, cn: newCn}) }).catch(function(){});
        } else {
            inp.replaceWith(noCn);
        }
    }

    // 渲染
    var _batchSelMode = false, _batchSelIds = {};
    const render = () => {
        dialog.innerHTML = "";
        const titleRow = $el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" } });
        const titleLeft = $el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } });
        const title = $el("span", { textContent: "💾 提示词收藏夹", style: { fontSize: "18px", fontWeight: "bold", color: "var(--anima-ink)" } });
        // ── 通过图像导入按钮 ──
        var _importFileInput = null;
        const importImgBtn = $el("span", {
            textContent: "📷 通过图像导入提示词",
            title: "从图像中自动提取提示词",
            style: { padding: "3px 10px", borderRadius: "4px", background: "var(--anima-title)", color: "var(--anima-accent-soft)", cursor: "pointer", fontSize: "11px", fontWeight: "bold" },
            onclick: () => {
                if (!_importFileInput) {
                    _importFileInput = document.createElement("input");
                    _importFileInput.type = "file";
                    _importFileInput.accept = "image/png,.jpg,.jpeg,.webp";
                    _importFileInput.style.display = "none";
                    _importFileInput.onchange = async function() {
                        var file = _importFileInput.files[0];
                        if (!file) return;
                        // 提取提示词
                        var result = await extractPromptFromPNG(file);
                        if (result.error) { alert(result.error); return; }
                        var promptText = result.text;
                        // 上传缩略图
                        var fd = new FormData();
                        fd.append("file", file, "temp_" + Date.now() + (file.name ? "_" + file.name : ".png"));
                        var thumbUrl = "";
                        try {
                            var r = await fetch("/danbooru_anima/prompt_favorites/upload_thumb", { method: "POST", body: fd });
                            var d = await r.json();
                            if (d.success) thumbUrl = d.thumb;
                        } catch(ex) {}
                        // 打开编辑弹窗，预填提示词和缩略图
                        var _pop = _makeEditPopup("", promptText, "", "", "", async function(entry) {
                            entry.thumb = thumbUrl || entry.thumb || "";
                            var sr = await fetch("/danbooru_anima/prompt_favorites/save", {
                                method: "POST", headers: {"Content-Type":"application/json"},
                                body: JSON.stringify(entry),
                            });
                            var sd = await sr.json();
                            if (sd.success) { _load().then(render); _pop.remove(); }
                        });
                    };
                    document.body.appendChild(_importFileInput);
                }
                _importFileInput.value = "";
                _importFileInput.click();
            }
        });
        titleLeft.append(title, importImgBtn);
        const closeBtn = $el("span", { textContent: "✕", style: { cursor: "pointer", color: "var(--anima-ink)", fontSize: "16px" }, onclick: () => overlay.remove() });
        titleRow.append(titleLeft, closeBtn);
        dialog.appendChild(titleRow);
        // ── 导入说明（同时作为拖拽区） ──
        var importNote = $el("div", {
            style: { color: "var(--anima-mute)", fontSize: "12px", marginBottom: "10px", lineHeight: "1.5", padding: "10px 8px", background: "rgba(var(--anima-bg-deep-rgb),.32)", borderRadius: "4px", border: "2px dashed var(--anima-title)", textAlign: "center", cursor: "pointer", transition: "border-color 0.2s", minHeight: "40px", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }
        });
        importNote.innerHTML = '<div style="color:var(--anima-accent-soft);font-size:12px;font-weight:bold;margin-bottom:4px;">📷 拖拽图像到此处导入提示词</div><div style="font-size:10px;">支持 WebUI / C 站等含提示词数据的图像<br>ComfyUI 生成的图像，因各工作流不同，复杂工作流可能无法正确读取<br>• 仅支持<b>最新版</b>通用反推流生成的图像<br>• <b>旧版</b>通用反推流生成的图像，读取的提示词可能不准确<br><span style="color:var(--anima-mute);margin-top:4px;">也可点击上方 📷 按钮选择文件</span></div>';
        dialog.appendChild(importNote);
        // ── 拖拽事件 ──
        importNote.ondragover = function(ev) { ev.preventDefault(); ev.stopPropagation(); importNote.style.borderColor = "var(--anima-accent-soft)"; importNote.style.background = "var(--anima-well)"; };
        importNote.ondragleave = function(ev) { importNote.style.borderColor = "var(--anima-title)"; importNote.style.background = "var(--anima-bg-deep)"; };
        importNote.ondrop = async function(ev) {
            ev.preventDefault(); ev.stopPropagation();
            importNote.style.borderColor = "var(--anima-title)"; importNote.style.background = "var(--anima-bg-deep)";
            var file = ev.dataTransfer.files[0];
            if (!file) return;
            // 提取提示词
            var result = await extractPromptFromPNG(file);
            if (result.error) { alert(result.error); return; }
            var promptText = result.text;
            // 上传缩略图
            var fd = new FormData();
            fd.append("file", file, "temp_" + Date.now() + (file.name ? "_" + file.name : ".png"));
            var thumbUrl = "";
            try {
                var tr = await fetch("/danbooru_anima/prompt_favorites/upload_thumb", { method: "POST", body: fd });
                var td = await tr.json();
                if (td.success) thumbUrl = td.thumb;
            } catch(ex) {}
            // 打开编辑弹窗
            var _pop = _makeEditPopup("", promptText, "", "", "", async function(entry) {
                entry.thumb = thumbUrl || entry.thumb || "";
                var sr = await fetch("/danbooru_anima/prompt_favorites/save", {
                    method: "POST", headers: {"Content-Type":"application/json"},
                    body: JSON.stringify(entry),
                });
                var sd = await sr.json();
                if (sd.success) { _load().then(render); _pop.remove(); }
            });
        };

        // 新建/保存按钮
        var _saveBtn = $el("span", {
            textContent: "💾 保存当前节点内提示词",
            style: { padding: "6px 14px", borderRadius: "4px", background: "#e94560", color: "#fff", cursor: "pointer", fontSize: "13px", fontWeight: "bold", display: "inline-block", marginBottom: "12px" },
            onclick: function() {
                if (!currentText || !currentText.trim()) { alert("当前节点提示词为空"); return; }
                var _entryFolder = _source === "composer" ? "__composer__" : "";
                var _entrySource = _source;
                var _entryLayout = null;
                // 创作器来源：用完整 layout 格式保存
                if (_source === "composer" && node._getComposerLayout) {
                    var _lo = node._getComposerLayout();
                    if (_lo) {
                        _entryLayout = JSON.stringify(_lo);
                        currentText = [
                            _lo.quality ? "[quality] " + _lo.quality : "",
                            _lo.time ? "[time] " + _lo.time : "",
                            _lo.meta ? "[meta] " + _lo.meta : "",
                            _lo.safety ? "[safety] " + _lo.safety : "",
                            _lo.count ? "[count] " + _lo.count : "",
                            _lo.characters ? "[char] " + _lo.characters : "",
                            _lo.series ? "[series] " + _lo.series : "",
                            _lo.artists ? "[artist] " + _lo.artists : "",
                            _lo.general ? "[general] " + _lo.general : "",
                            _lo.nl_data ? "[nl_data] " + _lo.nl_data : "",
                            _lo.model != null ? "[model] " + _lo.model : ""
                        ].filter(Boolean).join("\n");
                    }
                }
                var _pop2 = _makeEditPopup("", currentText, "", _entryFolder, "", async function(entry) {
                    entry.source = _entrySource;
                    entry.layout = _entryLayout;
                    if (_entryFolder && !entry.folder) entry.folder = _entryFolder;
                    var r2 = await fetch("/danbooru_anima/prompt_favorites/save", {
                        method: "POST", headers: {"Content-Type":"application/json"},
                        body: JSON.stringify(entry),
                    });
                    var d2 = await r2.json();
                    if (d2.success) { _load().then(render); _pop2.remove(); }
                });
            }
        });
        dialog.appendChild(_saveBtn);

        // 文件夹栏
        const folderBar = $el("div", { style: { display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "10px", padding: "4px 0", borderBottom: "1px solid var(--anima-title)" } });
        const allTab = $el("span", { textContent: "📂 全部", style: { padding: "3px 10px", borderRadius: "3px", cursor: "pointer", fontSize: "12px", background: !_activeFolder ? "var(--anima-title)" : "transparent", color: !_activeFolder ? "var(--anima-accent-soft)" : "var(--anima-mute)" }, onclick: () => { _activeFolder = ""; render(); } });
        folderBar.appendChild(allTab);
        // 未分类
        const uncatTab = $el("span", { textContent: animaTxt("📂 未分类"), style: { padding: "3px 10px", borderRadius: "3px", cursor: "pointer", fontSize: "12px", background: _activeFolder === "__uncat__" ? "var(--anima-title)" : "transparent", color: _activeFolder === "__uncat__" ? "var(--anima-accent-soft)" : "var(--anima-mute)" }, onclick: () => { _activeFolder = "__uncat__"; _composerTab = false; render(); } });
        folderBar.appendChild(uncatTab);
        // ── 创作器分类（特殊图标，仅当 source=composer 或有 composer 数据时显示）──
        if (_source === "composer" || _prompts.some(function(p){ return p.source === "composer"; })) {
            var composerTab = $el("span", { textContent: "✏️ 创作器", style: { padding: "3px 10px", borderRadius: "3px", cursor: "pointer", fontSize: "12px", background: _composerTab ? "var(--anima-title)" : "transparent", color: _composerTab ? "var(--anima-accent-soft)" : "#ce93d8", border: _composerTab ? "1px solid var(--anima-title)" : "1px solid transparent", fontWeight: _composerTab ? "bold" : "normal" }, onclick: () => { _activeFolder = ""; _composerTab = true; _activeComposerSub = ""; render(); } });
            folderBar.appendChild(composerTab);
        }
        for (const f of _folders) {
            const ftab = $el("span", { textContent: "📁 " + f, style: { padding: "3px 10px", borderRadius: "3px", cursor: "pointer", fontSize: "12px", background: _activeFolder === f ? "var(--anima-title)" : "transparent", color: _activeFolder === f ? "var(--anima-accent-soft)" : "var(--anima-mute)" }, onclick: () => { _activeFolder = f; render(); } });
            const delF = $el("span", { textContent: "✕", style: { padding: "2px 5px", borderRadius: "3px", cursor: "pointer", fontSize: "10px", color: "#e94560", marginRight: "4px" }, onclick: async (ev) => { ev.stopPropagation(); if (!confirm('删除文件夹「'+f+'」？提示词将移至未分类')) return; await fetch('/danbooru_anima/prompt_favorites/folder', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',name:f})}); _load().then(render); } });
            ftab.appendChild(delF);
            folderBar.appendChild(ftab);
        }
        // ── 创作器子分类（仅在创作器标签选中时显示）──
        if (_composerTab) {
            for (var _cfi = 0; _cfi < _composerFolders.length; _cfi++) {
                (function(){
                    var _cf = _composerFolders[_cfi];
                    var _cftab = $el("span", { textContent: "📌 " + _cf, style: { padding: "3px 10px", borderRadius: "3px", cursor: "pointer", fontSize: "12px", background: _activeComposerSub === _cf ? "var(--anima-title)" : "transparent", color: _activeComposerSub === _cf ? "var(--anima-accent-soft)" : "var(--anima-mute)" }, onclick: function() { _activeComposerSub = _activeComposerSub === _cf ? "" : _cf; render(); } });
                    var _cfdel = $el("span", { textContent: "✕", style: { padding: "2px 5px", borderRadius: "3px", cursor: "pointer", fontSize: "10px", color: "#e94560", marginRight: "4px" }, onclick: async function(ev) { ev.stopPropagation(); if (!confirm("删除子分类「"+_cf+"」？")) return; await fetch("/danbooru_anima/prompt_favorites/folder", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"delete",name:_cf,type:"composer"})}); _load().then(render); } });
                    _cftab.appendChild(_cfdel);
                    folderBar.appendChild(_cftab);
                })();
            }
            // 创作器下新建子分类
            var _cfNewBtn = $el("span", { textContent: "+", style: { padding: "3px 10px", borderRadius: "3px", cursor: "pointer", fontSize: "14px", color: "var(--anima-accent-soft)" }, onclick: function() {
                var _cfn = prompt("新建创作器子分类:");
                if (_cfn && _cfn.trim()) {
                    fetch("/danbooru_anima/prompt_favorites/folder", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({action:"create",name:_cfn.trim(),type:"composer"}) })
                    .then(function(r){return r.json();}).then(function(d){if(d.success){_load().then(render);}});
                }
            } });
            folderBar.appendChild(_cfNewBtn);
        }
        // 新建文件夹（非创作器模式）
        if (!_composerTab) {
            var _newFolderBtn2 = $el("span", { textContent: "+", style: { padding: "3px 10px", borderRadius: "3px", cursor: "pointer", fontSize: "14px", color: "#6bcb77" }, onclick: function() {
                var _fnName = prompt("新建文件夹名称:");
                if (_fnName && _fnName.trim()) {
                    fetch("/danbooru_anima/prompt_favorites/folder", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({action:"create",name:_fnName.trim()}) })
                    .then(function(r){return r.json();}).then(function(d){if(d.success){_load().then(render);}});
                }
            } });
            folderBar.appendChild(_newFolderBtn2);
        }
        // ── 多选 ──
        var _batchBtn = document.createElement("span");
        _batchBtn.textContent = _batchSelMode ? "☑ 多选 开" : "☑ 多选"; _batchBtn.title = animaTxt("多选模式");
        _batchBtn.style.cssText = "padding:3px 10px;border-radius:3px;cursor:pointer;font-size:12px;background:" + (_batchSelMode ? "#e94560" : "rgba(255,255,255,0.06)") + ";color:" + (_batchSelMode ? "#fff" : "var(--anima-mute)") + ";margin-left:8px;user-select:none;display:inline-block;border:1px solid rgba(255,255,255,0.15);";
        _batchBtn.onclick = function() {
            _batchSelMode = !_batchSelMode; _batchSelIds = {};
            _batchBtn.textContent = _batchSelMode ? "☑ 多选 开" : "☑ 多选";
            _batchBtn.style.background = _batchSelMode ? "#e94560" : "transparent";
            _batchBtn.style.color = _batchSelMode ? "#fff" : "var(--anima-mute)";
            _refreshBatchBar(); render();
        };
        folderBar.appendChild(_batchBtn);
        dialog.appendChild(folderBar);
        // ── 批量操作栏 ──
        var _batchActionBar = $el("div", { style: { display: "none", gap: "8px", padding: "4px 8px", marginBottom: "8px", background: "var(--anima-bg-deep)", borderRadius: "4px", alignItems: "center" } });
        function _refreshBatchBar() {
            _batchActionBar.innerHTML = ""; _batchActionBar.style.display = _batchSelMode ? "flex" : "none";
            if (!_batchSelMode) return;
            var _s = Object.keys(_batchSelIds), _cnt = _s.length;
            _batchActionBar.appendChild($el("span", { textContent: "已选 "+_cnt+" 项", style: { color:"var(--anima-mute)", fontSize:"11px" } }));
            if (_cnt > 0) {
                var _ms = $el("select", { style: { padding:"2px 6px", borderRadius:"3px", border:"1px solid var(--anima-title)", background:"var(--anima-well)", color:"#b0bec5", fontSize:"11px", cursor:"pointer" } });
                _ms.innerHTML = '<option value="">📁 移动到...</option>';
                for (var _fi=0;_fi<_folders.length;_fi++) { var _f=_folders[_fi]; var _o=document.createElement("option"); _o.value=_f; _o.textContent=_f; _ms.appendChild(_o); }
                _ms.onchange = async function() { var _fv=_ms.value; if(!_fv)return; if(!confirm("移动 "+_cnt+" 条到「"+_fv+"」？")){_ms.value="";return;}
                    await fetch("/danbooru_anima/prompt_favorites/batch_move",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids:_s,folder:_fv})});
                    _batchSelIds={}; _load().then(render);
                };
                _batchActionBar.appendChild(_ms);
                var _db = $el("span", { textContent:animaTxt("🗑 删除(")+_cnt+")", style:{padding:"3px 8px",borderRadius:"3px",background:"#3a1a1a",color:"#e94560",cursor:"pointer",fontSize:"11px"}, onclick: async function() {
                    if(!confirm("确定删除 "+_cnt+" 条？不可恢复！"))return;
                    await fetch("/danbooru_anima/prompt_favorites/batch_delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids:_s})});
                    _batchSelIds={}; _load().then(render);
                }});
                _batchActionBar.appendChild(_db);
            }
        }
        dialog.appendChild(_batchActionBar);

        // 提示词列表
        const list = $el("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "6px", flex: 1, overflowY: "auto", alignContent: "start" } });
        var filtered;
        if (_composerTab) {
            // 创作器标签：只显示 source="composer" 的，再按子分类筛选
            filtered = _prompts.filter(function(p) { return p.source === "composer"; });
            if (_activeComposerSub) {
                filtered = filtered.filter(function(p) { return p.folder === _activeComposerSub; });
            }
        } else {
            // 普通文件夹标签：排除 source="composer" 的，按 folder 筛选
            filtered = _prompts.filter(function(p) { return p.source !== "composer"; });
            if (_activeFolder) {
                filtered = filtered.filter(function(p) { return _activeFolder === "__uncat__" ? !p.folder : p.folder === _activeFolder; });
            }
        }
        if (!filtered.length) {
            list.innerHTML = '<div style="text-align:center;color:var(--anima-mute);padding:30px;font-size:13px;grid-column:1/-1;">暂无收藏的提示词</div>';
        } else {
            for (const p of filtered) {
                const card = $el("div", { style: { display: "flex", gap: "8px", background: "rgba(var(--anima-well-rgb),.28)", borderRadius: "6px", padding: "8px", border: "1px solid rgba(255,255,255,.08)", alignItems: "center" } });
                if (_batchSelMode) {
                    const _cb3 = document.createElement("span");
                    _cb3.textContent = _batchSelIds[p.id] ? "☑" : "☐";
                    _cb3.style.cssText = "cursor:pointer;font-size:18px;color:" + (_batchSelIds[p.id] ? "#e94560" : "var(--anima-mute)") + ";flex-shrink:0;user-select:none;";
                    const _toggleSel = function() {
                        if (_batchSelIds[p.id]) { delete _batchSelIds[p.id]; _cb3.textContent = "☐"; _cb3.style.color = "var(--anima-mute)"; card.style.border = "1px solid var(--anima-title)"; }
                        else { _batchSelIds[p.id] = true; _cb3.textContent = "☑"; _cb3.style.color = "#e94560"; card.style.border = "2px solid #e94560"; }
                        _refreshBatchBar();
                    };
                    _cb3.onclick = function(ev) { ev.stopPropagation(); _toggleSel(); };
                    card.appendChild(_cb3);
                    // 点卡片本身也选中，捕获阶段拦截子元素点击
                    card.style.cursor = "pointer";
                    card.addEventListener("click", function(ev) { if (ev.target === _cb3) return; ev.stopPropagation(); ev.preventDefault(); _toggleSel(); }, true);
                    if (_batchSelIds[p.id]) card.style.border = "2px solid #e94560";
                }
                // 缩略图
                const thumbUrl = p.thumb || "";
                if (thumbUrl) {
                    const img = $el("img", { src: thumbUrl, style: { width: "140px", maxHeight: "120px", objectFit: "contain", borderRadius: "4px", flexShrink: 0, background: "rgba(var(--anima-title-rgb),.18)", cursor: "pointer" }, onclick: () => {
                        const _p = $el("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200000, cursor: "zoom-out" }, onclick: () => _p.remove() });
                        const _i = $el("img", { src: thumbUrl, style: { maxWidth: "90vw", maxHeight: "90vh", borderRadius: "8px", objectFit: "contain" } });
                        _p.appendChild(_i);
                        document.body.appendChild(_p);
                    } });
                    card.appendChild(img);
                } else {
                    const ph = $el("div", { textContent: "🖼", style: { width: "140px", height: "80px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", flexShrink: 0, background: "rgba(var(--anima-title-rgb),.16)", border: "1px solid rgba(255,255,255,.06)", color: "rgba(var(--anima-ink-rgb),.82)", fontSize: "15px" } });
                    card.appendChild(ph);
                }
                // 文本 + 模型标识
                const info = $el("div", { style: { flex: "0 1 auto", maxWidth: "200px", minWidth: 0 } });
                const tagBadge = p.model_tag ? $el("span", { textContent: p.model_tag, style: { display: "inline-block", padding: "1px 6px", borderRadius: "3px", fontSize: "10px", background: ({"Anima":"#e94560","Noob":"var(--anima-accent-soft)","光辉":"#ffd93d","Z image":"#6bcb77"})[p.model_tag] || "#888", color: "#fff", marginBottom: "4px" } }) : null;
                if (tagBadge) info.appendChild(tagBadge);
                const fullText = p.text || "";
                const textEl = $el("div", { textContent: fullText.length > 60 ? fullText.slice(0, 60) + "..." : fullText, style: { fontSize: "12px", color: "#b0bec5", lineHeight: "1.4", wordBreak: "break-all", cursor: "pointer" }, onclick: () => {
                    const _p2 = $el("div", { style: { position: "fixed", inset: 0, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200001 } });
                    var _pfPreviewSize = JSON.parse(localStorage.getItem("db_pf_preview_size") || '{"w":600,"h":450}');
                    const _b2 = $el("div", { style: { background: "linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)", borderRadius: "12px", padding: "20px", width: _pfPreviewSize.w + "px", height: _pfPreviewSize.h + "px", minWidth: "360px", minHeight: "260px", maxWidth: "90vw", maxHeight: "85vh", border: "1px solid rgba(var(--anima-accent-soft-rgb),.38)", overflow: "auto", resize: "both", boxShadow: "0 16px 48px rgba(var(--anima-well-deepest-rgb),.55)" } });
                    if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(_b2);
                    _b2.classList.add("anima-fav-popup");
                    _b2.onmouseup = function(){ var nw = Math.max(360, _b2.offsetWidth); var nh = Math.max(260, _b2.offsetHeight); if (nw !== _pfPreviewSize.w || nh !== _pfPreviewSize.h) { _pfPreviewSize.w = nw; _pfPreviewSize.h = nh; localStorage.setItem("db_pf_preview_size", JSON.stringify(_pfPreviewSize)); } };
                    const _h2 = $el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "8px", flexWrap: "wrap" } });
                    _h2.innerHTML = '<span style=\"font-size:15px;font-weight:700;color:var(--anima-ink);letter-spacing:.02em;\">📝 完整提示词</span>';
                    const _h2Tools = $el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginLeft: "auto" } });
                    // ── @ 一键复制画师标签（ANIMA 格式：@ 开头 / 权重括号内 @ 开头） ──
                    var _copyArtistBtn = $el("span", { textContent: "@ 复制画师", title: "一键复制本提示词中的画师标签（ANIMA 格式）", style: { cursor: "pointer", fontSize: "11px", color: "#ce93d8", background: "rgba(206,147,216,0.12)", border: "1px solid rgba(206,147,216,0.35)", borderRadius: "6px", padding: "3px 10px", marginRight: "8px", userSelect: "none", transition: "all .15s ease" } });
                    _copyArtistBtn.onmouseover = function(){ this.style.background = "rgba(206,147,216,0.25)"; this.style.transform = "translateY(-1px)"; };
                    _copyArtistBtn.onmouseout = function(){ this.style.background = "rgba(206,147,216,0.12)"; this.style.transform = ""; };
                    _copyArtistBtn.onclick = function(ev) {
                        ev.stopPropagation();
                        var _txt = window._pfMergedText2 || fullText || "";
                        // 解析：逗号分割 → 剥离权重括号（多层）→ 剥离 :权重 → @ 开头即画师
                        var _arts = [];
                        var _parts = String(_txt).split(",");
                        for (var _ai = 0; _ai < _parts.length; _ai++) {
                            var _t = _parts[_ai].trim();
                            if (!_t) continue;
                            var _inner = _t;
                            while (_inner.charAt(0) === "(" && _inner.charAt(_inner.length - 1) === ")") { _inner = _inner.slice(1, -1).trim(); }
                            _inner = _inner.replace(/:\d+(\.\d+)?\s*$/, "").trim();
                            if (_inner.indexOf("@") === 0) _arts.push(_inner);
                        }
                        if (!_arts.length) { alert("此提示词中没有画师标签（ANIMA 格式 @ 开头）"); return; }
                        var _clip = _arts.join(", ");
                        var _done = function(){ var _ot = _copyArtistBtn.textContent; _copyArtistBtn.textContent = "✅ 已复制 " + _arts.length + " 个"; setTimeout(function(){ _copyArtistBtn.textContent = _ot; }, 1500); };
                        var _fallback = function(){
                            try {
                                var _ta = document.createElement("textarea");
                                _ta.value = _clip;
                                _ta.style.cssText = "position:fixed;opacity:0;";
                                document.body.appendChild(_ta); _ta.select();
                                document.execCommand("copy");
                                _ta.remove(); _done();
                            } catch(e) { alert("复制失败，请手动复制：" + _clip); }
                        };
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText(_clip).then(_done, _fallback);
                        } else { _fallback(); }
                    };
                    _h2Tools.appendChild(_copyArtistBtn);
                    // 🧩 合并按钮
                    var _pfMergeMode2 = false;
                    var _pfMergeSel2 = {};
                    var _pfMergeBtn2 = $el("span", { textContent: "🧩", title: "合并自然语言块", style: { cursor: "pointer", fontSize: "16px", color: "var(--anima-mute)", marginRight: "12px" } });
                    _pfMergeBtn2.onclick = function(ev) {
                        ev.stopPropagation();
                        if (_pfMergeMode2) {
                            var _sel2 = Object.keys(_pfMergeSel2).map(Number).sort(function(a,b){return a-b;});
                            if (_sel2.length < 2) { alert("请至少选择 2 个相邻芯片"); return; }
                            for (var mi2 = 1; mi2 < _sel2.length; mi2++) {
                                if (_sel2[mi2] !== _sel2[mi2-1] + 1) { alert("只能合并相邻芯片"); return; }
                            }
                            var _curTags2 = fullText.split(",").map(function(t){return t.trim();}).filter(Boolean);
                            var _m2 = [];
                            for (var mj2 = _sel2[0]; mj2 <= _sel2[_sel2.length-1]; mj2++) { _m2.push(_curTags2[mj2]); }
                            var _nb2 = _m2.join("; ");
                            var _nt2 = [];
                            for (var mk2 = 0; mk2 < _curTags2.length; mk2++) {
                                if (mk2 === _sel2[0]) { _nt2.push(_nb2); }
                                else if (mk2 > _sel2[0] && mk2 <= _sel2[_sel2.length-1]) { continue; }
                                else { _nt2.push(_curTags2[mk2]); }
                            }
                            // 更新弹窗内显示的文本（不修改原始数据）
                            window._pfMergedText2 = _nt2.join(", ");
                            // 保存合并状态到后端
                            fetch("/danbooru_anima/prompt_favorites/save", {
                                method: "POST", headers: {"Content-Type":"application/json"},
                                body: JSON.stringify({id: p.id, merged_text: window._pfMergedText2}),
                            }).then(function() { p.merged_text = window._pfMergedText2; }).catch(function(){});
                            _pfMergeMode2 = false; _pfMergeSel2 = {};
                            _pfMergeBtn2.textContent = "🧩"; _pfMergeBtn2.style.color = "var(--anima-mute)";
                            _b2.querySelectorAll("[data-pf-container]").forEach(function(c){c.remove();});
                            var _t2 = $el("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px", alignContent: "flex-start" } });
                            _t2.setAttribute("data-pf-container", "1");
                            _b2.appendChild(_t2);
                            renderTagChips(_t2, window._pfMergedText2, _pfMergeMode2, _pfMergeSel2, function(){});
                        } else {
                            _pfMergeMode2 = true; _pfMergeSel2 = {};
                            _pfMergeBtn2.textContent = animaTxt("🧩 合并选中"); _pfMergeBtn2.style.color = "#e94560";
                            _b2.querySelectorAll("[data-pf-container]").forEach(function(c){c.remove();});
                            var _t2 = $el("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px", alignContent: "flex-start" } });
                            _t2.setAttribute("data-pf-container", "1");
                            _b2.appendChild(_t2);
                            renderTagChips(_t2, window._pfMergedText2 || fullText, _pfMergeMode2, _pfMergeSel2, function(){});
                        }
                    };
                    _h2Tools.appendChild(_pfMergeBtn2);
                    // 🗑 清除翻译缓存
                    var _clearTransBtn2 = $el("span", { textContent: "🗑", title: "清除此提示词的翻译缓存", style: { cursor: "pointer", fontSize: "14px", color: "var(--anima-mute)", marginRight: "12px" } });
                    _clearTransBtn2.onclick = function(ev) {
                        ev.stopPropagation();
                        if (!confirm("确定清除此提示词的所有翻译缓存？")) return;
                        _tagTranslationCache2 = {};
                        fetch("/danbooru_anima/prompt_favorites/save", {
                            method: "POST", headers: {"Content-Type":"application/json"},
                            body: JSON.stringify({id: p.id, translations: {}, merged_text: ""}),
                        }).then(function() {
                            _b2.querySelectorAll("[data-pf-container]").forEach(function(c){c.remove();});
                            var _t3 = $el("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px", alignContent: "flex-start" } });
                            _t3.setAttribute("data-pf-container", "1");
                            _b2.appendChild(_t3);
                            renderTagChips(_t3, window._pfMergedText2 || fullText, false, {}, function(){});
                        }).catch(function(){});
                    };
                    _h2Tools.appendChild(_clearTransBtn2);
                    var _closeX2 = $el("span", { textContent: "✕", style: { cursor: "pointer", color: "#ffb4b4", fontSize: "16px", width: "28px", height: "28px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "8px", border: "1px solid rgba(248,113,113,.45)", background: "rgba(233,69,96,.12)" } });
                    _closeX2.onclick = () => { delete window._pfMergedText2; _p2.remove(); };
                    _h2Tools.appendChild(_closeX2);
                    _h2.appendChild(_h2Tools);
                    _b2.appendChild(_h2);
                    var _t2 = $el("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px", alignContent: "flex-start" } });
                    _t2.setAttribute("data-pf-container", "1");
                    _b2.appendChild(_t2);
                    // 预加载该提示词的已有翻译 + 合并状态
                    var _displayText = (p.merged_text || fullText);
                    window._pfMergedText2 = _displayText;
                    window._pfCurrentPromptId = p.id;
                    if (p.translations && typeof p.translations === "object") {
                        Object.assign(_tagTranslationCache2, p.translations);
                    }
                    renderTagChips(_t2, _displayText, _pfMergeMode2, _pfMergeSel2, function(){});
                    // ── 翻译持久化辅助函数 ──
                    window._pfSaveTrans = function() {
                        var _td = {};
                        var _displayText2 = window._pfMergedText2 || fullText;
                        var _allTags = _displayText2.split(",").map(function(s){return s.trim();}).filter(Boolean);
                        for (var ti = 0; ti < _allTags.length; ti++) {
                            if (_tagTranslationCache2[_allTags[ti]]) _td[_allTags[ti]] = _tagTranslationCache2[_allTags[ti]];
                        }
                        // 同时保存翻译 + 合并状态
                        fetch("/danbooru_anima/prompt_favorites/save", {
                            method: "POST", headers: {"Content-Type":"application/json"},
                            body: JSON.stringify({id: p.id, translations: _td, merged_text: window._pfMergedText2 || ""}),
                        }).then(function() {
                            if (!p.translations) p.translations = {};
                            Object.assign(p.translations, _td);
                        }).catch(function(){});
                    };
                    _p2.appendChild(_b2);
                    document.body.appendChild(_p2);
                } });
                info.appendChild(textEl);
                card.appendChild(info);
                // 操作按钮
                const btnGroup = $el("div", { style: { display: "flex", gap: "4px", flexShrink: 0 } });
                // 输出
                const outBtn = $el("span", { textContent: "📤", title: animaTxt("输出到节点"), style: { padding: "4px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "14px", background: "var(--anima-title)", color: "var(--anima-accent-soft)" }, onclick: () => {
                    if (currentText && currentText.trim()) {
                        if (!confirm("当前节点已有内容，输出后将覆盖。确定继续？")) return;
                    }
                    if (onSelect) onSelect(p.text);
                    overlay.remove();
                } });
                btnGroup.appendChild(outBtn);
                // 编辑
                const editBtn = $el("span", { textContent: "✏️", title: animaTxt("编辑"), style: { padding: "4px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "12px", background: "#2a2a3a", color: "#ffd93d" }, onclick: () => {
                    const _pop = _makeEditPopup(p.id, p.text, p.model_tag, p.folder, p.thumb, async (entry) => {
                        const r = await fetch("/danbooru_anima/prompt_favorites/save", {
                            method: "POST", headers: {"Content-Type":"application/json"},
                            body: JSON.stringify(entry),
                        });
                        const d = await r.json();
                        if (d.success) { _load().then(render); _pop.remove(); }
                    });
                } });
                btnGroup.appendChild(editBtn);
                // 删除
                const delBtn = $el("span", { textContent: "🗑", title: animaTxt("删除"), style: { padding: "4px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "12px", background: "#3a1a1a", color: "#e94560" }, onclick: async () => {
                    if (!confirm("确定删除这条提示词？")) return;
                    const r = await fetch("/danbooru_anima/prompt_favorites/delete", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({id: p.id}) });
                    const d = await r.json();
                    if (d.success) _load().then(render);
                } });
                btnGroup.appendChild(delBtn);
                card.appendChild(btnGroup);
                list.appendChild(card);
            }
        }
        dialog.appendChild(list);
    };

    // 编辑/新建弹窗
    const _makeEditPopup = (id, text, modelTag, folder, existingThumb, onSave) => {
        const mask = $el("div", { style: { position: "fixed", inset: 0, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100001 } });
        const box = $el("div", { style: { background: "linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)", borderRadius: "12px", padding: "20px", width: "420px", maxWidth: "90vw", border: "1px solid rgba(var(--anima-accent-soft-rgb),.38)", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 16px 48px rgba(var(--anima-well-deepest-rgb),.55)" } });
        if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(box);
        box.classList.add("anima-fav-popup");
        box.innerHTML = `<div style="font-size:15px;font-weight:bold;color:#e0e0e0;margin-bottom:10px;">${id ? '✏️ 编辑提示词' : '💾 保存提示词'}</div>`;
        // 文本
        const ta = $el("textarea", { value: text, style: { width: "100%", height: "100px", padding: "6px", borderRadius: "4px", border: "1px solid var(--anima-title)", background: "var(--anima-well)", color: "#e0e0e0", fontSize: "12px", resize: "vertical", boxSizing: "border-box", marginBottom: "8px" } });
        box.appendChild(ta);
        // 模型标识
        const tagRow = $el("div", { style: { display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px" } });
        tagRow.innerHTML = '<span style="color:var(--anima-mute);font-size:12px;">模型:</span>';
        const tagSel = $el("select", { style: { flex: 1, padding: "4px 6px", borderRadius: "4px", border: "1px solid var(--anima-title)", background: "var(--anima-well)", color: "#b0bec5", fontSize: "12px", cursor: "pointer" } });
        // 填充模型标签选项
        const _fillTags = () => {
            tagSel.innerHTML = '<option value="">— 不标记 —</option>';
            for (const t of _modelTags) {
                const opt = document.createElement("option");
                opt.value = t; opt.textContent = t;
                if (t === modelTag) opt.selected = true;
                tagSel.appendChild(opt);
            }
            // 自定义
            const custOpt = document.createElement("option");
            custOpt.value = "__custom__"; custOpt.textContent = "✏️ 自定义...";
            tagSel.appendChild(custOpt);
        };
        _fillTags();
        tagSel.onchange = () => {
            if (tagSel.value === "__custom__") {
                const c = prompt("输入自定义模型标识:");
                if (c && c.trim()) {
                    if (!_modelTags.includes(c.trim())) _modelTags.push(c.trim());
                    fetch("/danbooru_anima/prompt_model_tags/save", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({tags: _modelTags}) });
                    modelTag = c.trim();
                }
                _fillTags();
                // 重新选中自定义值
                for (const opt of tagSel.options) { if (opt.value === modelTag) opt.selected = true; }
            } else {
                modelTag = tagSel.value;
            }
        };
        tagRow.appendChild(tagSel);
        box.appendChild(tagRow);

        // 文件夹
        const fRow = $el("div", { style: { display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px" } });
        fRow.innerHTML = '<span style="color:var(--anima-mute);font-size:12px;">分类:</span>';
        const fSel = $el("select", { style: { flex: 1, padding: "4px 6px", borderRadius: "4px", border: "1px solid var(--anima-title)", background: "var(--anima-well)", color: "#b0bec5", fontSize: "12px", cursor: "pointer" } });
        fSel.innerHTML = '<option value="">— 未分类 —</option>';
        for (const f of _folders) {
            const opt = document.createElement("option");
            opt.value = f; opt.textContent = f;
            if (f === folder) opt.selected = true;
            fSel.appendChild(opt);
        }
        fRow.appendChild(fSel);
        box.appendChild(fRow);

        // 缩略图上传
        const thumbRow = $el("div", { style: { display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px" } });
        thumbRow.innerHTML = '<span style="color:var(--anima-mute);font-size:12px;">缩略图:</span>';
        const thumbInp = $el("input", { type: "file", accept: "image/*", style: { flex: 1, fontSize: "11px", color: "var(--anima-mute)" } });
        let _thumbUrl = existingThumb || "";
        thumbInp.onchange = async (ev) => {
            const file = ev.target.files?.[0];
            if (!file) return;
            const fd = new FormData();
            fd.append("file", file, id || "temp_" + Date.now() + (file.name ? "_" + file.name : ".png"));
            try {
                const r = await fetch("/danbooru_anima/prompt_favorites/upload_thumb", { method: "POST", body: fd });
                const d = await r.json();
                if (d.success) _thumbUrl = d.thumb;
            } catch(ex) { alert("上传失败: " + (ex.message || ex)); }
        };
        thumbRow.appendChild(thumbInp);
        box.appendChild(thumbRow);

        // 按钮
        const btnRow = $el("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "10px" } });
        const cancelBtn = $el("span", { textContent: animaTxt("取消"), style: { padding: "6px 16px", borderRadius: "4px", background: "rgba(255,255,255,0.06)", color: "var(--anima-mute)", cursor: "pointer", fontSize: "13px" }, onclick: () => mask.remove() });
        btnRow.appendChild(cancelBtn);
        const confirmBtn = $el("span", { textContent: id ? "保存修改" : "保存", style: { padding: "6px 16px", borderRadius: "4px", background: "#e94560", color: "#fff", cursor: "pointer", fontSize: "13px", fontWeight: "bold" }, onclick: () => {
            const t = ta.value.trim();
            if (!t) { alert("提示词不能为空"); return; }
            const entry = {
                id: id || "",
                text: t,
                model_tag: modelTag || "",
                thumb: _thumbUrl || "",
                folder: fSel.value || "",
                created_at: id ? undefined : Date.now() / 1000,
            };
            if (onSave) onSave(entry);
        } });
        btnRow.appendChild(confirmBtn);
        box.appendChild(btnRow);
        mask.appendChild(box);
        mask.onclick = (ev) => { if (ev.target === mask) mask.remove(); };
        document.body.appendChild(mask);
        return mask;
    };

    // 主弹窗（可拖拽调整大小）
    var _pfSize = JSON.parse(localStorage.getItem("db_pf_size") || '{"w":640,"h":480}');
    const overlay = $el("div", { style: { position: "fixed", inset: 0, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100000 } });
    const dialog = $el("div", { style: { display: "flex", flexDirection: "column", background: "linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)", borderRadius: "12px", padding: "20px", width: _pfSize.w + "px", height: _pfSize.h + "px", maxWidth: "95vw", maxHeight: "90vh", minWidth: "400px", minHeight: "300px", border: "1px solid rgba(var(--anima-accent-soft-rgb),.38)", boxShadow: "0 16px 48px rgba(var(--anima-well-deepest-rgb),.55)", resize: "both", overflow: "auto" } });
    if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(dialog);
    dialog.classList.add("anima-fav-popup");
    dialog.onmouseup = function(){var nw=Math.max(400,dialog.offsetWidth);var nh=Math.max(300,dialog.offsetHeight);if(nw!==_pfSize.w||nh!==_pfSize.h){_pfSize.w=nw;_pfSize.h=nh;localStorage.setItem("db_pf_size",JSON.stringify(_pfSize));}};
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    _load().then(render);
}
