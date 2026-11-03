import { app } from "/scripts/app.js";
import "./00_anima_i18n.js";
import { $el } from "/scripts/ui.js";
import "./00_anima_theme.js";

app.registerExtension({
    name: "Comfy.TagMapper",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "TagMapper") return;

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onCreated?.apply(this, arguments);
            this.setSize([540, 700]);
            this.isChanged = true;
            const node = this;

            let tags = [];
            let mappings = {};
            let _translations = {};

            const CATS = [
                { v: "", l: animaTxt("— 不分类 —"), c: "#888" },
                { v: "body_features", l: animaTxt("身体特征"), c: "#e94560" },
                { v: "clothing", l: animaTxt("服装"), c: "#6bcb77" },
                { v: "pose", l: animaTxt("姿势"), c: "#ffd93d" },
                { v: "expression", l: animaTxt("表情"), c: "#ff6ec7" },
                { v: "background", l: animaTxt("背景"), c: "var(--anima-accent-range)" },
                { v: "accessories", l: animaTxt("配饰"), c: "#ce93d8" },
                { v: "other", l: animaTxt("其他"), c: "#888" },
            ];

            // 隐藏原始 widget，保留端口
            const tagW = node.widgets?.find(w => w.name === "标签列表");
            if (tagW) {
                tagW.computeSize = () => [0.1, 20];
                tagW.serialize = false;
            }

            // ── DOM 容器（和D站浏览器一样） ──
            const container = $el("div.tag-mapper-ui", {
                style: {
                    width: "100%", height: "100%", overflow: "hidden",
                    position: "relative",
                    display: "flex", flexDirection: "column",
                    background: "var(--anima-bg)", borderRadius: "4px",
                }
            });
            if (typeof window.applyAnimaPanelGlow === "function") window.applyAnimaPanelGlow(container);

            // 顶栏
            const bar = $el("div", {
                style: {
                    display: "flex", justifyContent: "space-between",
                    alignItems: "center", padding: "8px 10px",
                    borderBottom: "1px solid var(--anima-title)", flexShrink: 0,
                }
            });
            bar.innerHTML = '<span style="color:#e0e0e0;font-size:13px;font-weight:bold;">🏷 标签映射器</span><span id="tmInfo" style="color:#888;font-size:11px;">等待数据...</span><span id="tmRulesBtn" style="margin-left:auto;cursor:pointer;font-size:13px;opacity:0.5;user-select:none;">📋</span>';
            bar.querySelector("#tmRulesBtn").onclick = toggleRules;

            // 标签列表
            const list = $el("div", {
                style: {
                    flex: 1, overflowY: "auto", padding: "6px 8px",
                }
            });

            let _activeRules = {};  // {keyword: category}
            let _openPopup = null;
            function closePopup() { if (_openPopup) { _openPopup.remove(); _openPopup = null; } }

            // 从 tag 名提取 keyword（最后一个 _ 之后的部分）
            function extractKeyword(tag) {
                const idx = tag.lastIndexOf("_");
                return idx > 0 ? tag.slice(idx + 1) : tag;
            }

            function render() {
                list.innerHTML = "";
                if (!tags.length) {
                    list.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#666;font-size:13px;line-height:2;">将分类器的「未分类标签」端口连上来<br><span style="font-size:11px;color:#555;">连线后执行工作流即可</span></div>';
                    bar.querySelector("#tmInfo").textContent = animaTxt("等待数据...");
                    return;
                }
                let uncat = 0;
                const wrap = $el("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" } });
                for (const tag of tags) {
                    const cn = _translations[tag];
                    const cur = mappings[tag] || "";
                    const catColor = CATS.find(c => c.v === cur)?.c || "#555";
                    const chip = $el("span", {
                        textContent: cn ? `${tag}(${cn})` : tag,
                        style: {
                            display: "inline-flex", alignItems: "center", gap: "3px",
                            padding: "3px 8px", borderRadius: "4px",
                            fontSize: "11px", cursor: "pointer",
                            background: cur ? catColor + "33" : "#2a2a3a",
                            color: cur ? catColor : "#b0bec5",
                            border: "1px solid " + (cur ? catColor : "#444"),
                            whiteSpace: "nowrap",
                            transition: "all 0.1s",
                        },
                        onclick: (ev) => {
                            ev.stopPropagation();
                            closePopup();
                            // 创建弹出菜单
                            const popup = $el("div", {
                                style: {
                                    position: "fixed", zIndex: 9999,
                                    padding: "4px", borderRadius: "6px",
                                    background: "var(--anima-bg)", border: "1px solid var(--anima-title)",
                                    boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                                    display: "flex", flexDirection: "column", gap: "2px",
                                }
                            });
                            const rect = chip.getBoundingClientRect();
                            popup.style.left = Math.min(rect.left, window.innerWidth - 140) + "px";
                            popup.style.top = (rect.bottom + 4) + "px";
                            // 不分类选项
                            const noneOpt = $el("div", {
                                textContent: animaTxt("— 不分类 —"),
                                style: { padding: "4px 10px", borderRadius: "4px", fontSize: "11px", cursor: "pointer", color: "#888" },
                                onclick: () => { delete mappings[tag]; closePopup(); render(); updateInfo(); }
                            });
                            popup.appendChild(noneOpt);
                            for (const c of CATS.filter(x => x.v)) {
                                const opt = $el("div", {
                                    textContent: c.l,
                                    style: {
                                        padding: "4px 10px", borderRadius: "4px",
                                        fontSize: "11px", cursor: "pointer",
                                        background: c.v === cur ? c.c + "44" : "transparent",
                                        color: c.c, borderLeft: "3px solid " + c.c,
                                    },
                                    onclick: () => { mappings[tag] = c.v; closePopup(); render(); updateInfo(); }
                                });
                                popup.appendChild(opt);
                            }
                            // ── 批量规则分隔线 ──
                            const sep = $el("div", { style: { borderTop: "1px solid #333", margin: "4px 0" } });
                            popup.appendChild(sep);
                            const defaultKw = extractKeyword(tag);
                            // 中文 tag → 自动建议英文名
                            let kwInitial = defaultKw;
                            fetch("/danbooru_anima/fuzzy_tags", {
                                method: "POST", headers: {"Content-Type":"application/json"},
                                body: JSON.stringify({query: defaultKw, limit: 1}),
                            }).then(r => r.json()).then(d => {
                                const first = (d.tags || [])[0];
                                if (first && first.tag && first.tag !== defaultKw && (first.cn || "").includes(defaultKw)) {
                                    kwInput.value = first.tag;
                                }
                            }).catch(() => {});
                            const kwInput = $el("input", {
                                type: "text", value: kwInitial,
                                style: { width: "100%", padding: "3px 6px", borderRadius: "4px", border: "1px solid #555", background: "var(--anima-well)", color: "#e0e0e0", fontSize: "11px", boxSizing: "border-box", marginBottom: "3px" }
                            });
                            const kwRow = $el("div", { style: { display: "flex", alignItems: "center", gap: "3px", fontSize: "11px", color: "#aaa" } });
                            kwRow.append(kwInput);
                            const kwHint = $el("span", { textContent: "含此关键词的 tag 都归入" });
                            kwRow.appendChild(kwHint);
                            const kwCatSel = $el("select", { style: { fontSize: "11px", padding: "2px 4px", borderRadius: "3px", background: "var(--anima-well)", color: "#e0e0e0", border: "1px solid #555" } });
                            for (const c of CATS.filter(x => x.v)) {
                                kwCatSel.innerHTML += `<option value="${c.v}">${c.l}</option>`;
                            }
                            kwRow.appendChild(kwCatSel);
                            popup.appendChild(kwRow);
                            const applyRuleBtn = $el("button", {
                                textContent: "✓ 应用规则",
                                style: { width: "100%", padding: "4px", borderRadius: "4px", border: "none", background: "var(--anima-title)", color: "var(--anima-accent-soft)", cursor: "pointer", fontSize: "11px", marginTop: "2px" }
                            });
                            applyRuleBtn.onclick = async () => {
                                const keyword = kwInput.value.trim().toLowerCase();
                                console.log("[TAGMAPPER] applyRule keyword输入:", JSON.stringify(kwInput.value), "→", JSON.stringify(keyword));
                                const category = kwCatSel.value;
                                if (keyword.length < 2) return;
                                try {
                                    const r = await fetch("/danbooru_anima/tag_mapper_rule_save", {
                                        method: "POST", headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ keyword, category }),
                                    });
                                    const d = await r.json();
                                    if (d.success) {
                                        console.log("[TAGMAPPER] 规则保存:", keyword, "→", category);
                                        _activeRules[keyword] = category;
                                        closePopup();
                                        refreshRulesPanel();
                                        // 立即重新分类：匹配此规则的 tag 自动标记
                                        for (const t of tags) {
                                            if (t.toLowerCase().includes(keyword) && !mappings[t]) {
                                                mappings[t] = category;
                                            }
                                        }
                                        render(); updateInfo();
                                        st.textContent = `✅ 规则已保存: ${keyword} → ${category}`;
                                    } else { st.textContent = "❌ " + (d.error || "保存失败"); }
                                } catch (e) { st.textContent = animaTxt("❌ 网络错误"); }
                            };
                            popup.appendChild(applyRuleBtn);
                            document.body.appendChild(popup);
                            _openPopup = popup;
                            // 点击 popup 内部不关闭，点击外部关闭
                            popup.addEventListener("click", (e) => e.stopPropagation());
                            setTimeout(() => document.addEventListener("click", () => closePopup(), { once: true }), 0);
                        }
                    });
                    wrap.appendChild(chip);
                    if (!mappings[tag]) uncat++;
                }
                list.appendChild(wrap);
                bar.querySelector("#tmInfo").textContent = `${uncat} 个未分类 · ${Object.keys(mappings).length} 个已分配`;
            }
            function updateInfo() {
                const uncat = tags.filter(t => !mappings[t]).length;
                bar.querySelector("#tmInfo").textContent = `${uncat} 个未分类 · ${Object.keys(mappings).length} 个已分配`;
            }

            // ── 规则管理面板 ──
            const rulesBar = $el("div", {
                style: { display: "none", padding: "4px 8px", borderTop: "1px solid var(--anima-title)", background: "var(--anima-well)", flexShrink: 0, maxHeight: "100px", overflowY: "auto" }
            });
            const rulesTitle = $el("span", { textContent: "📋 批量规则", style: { fontSize: "11px", color: "#888", marginBottom: "4px", display: "block" } });
            rulesBar.appendChild(rulesTitle);
            const rulesList = $el("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" } });
            rulesBar.appendChild(rulesList);
            let _rulesOpen = false;
            function toggleRules() { _rulesOpen = !_rulesOpen; rulesBar.style.display = _rulesOpen && Object.keys(_activeRules).length ? "block" : "none"; }
            let _ruleTl = {};
            function _lookupKw(kw) {
                return fetch("/danbooru_anima/fuzzy_tags", {
                    method: "POST", headers: {"Content-Type":"application/json"},
                    body: JSON.stringify({query: kw, limit: 5, cloud: true}),
                }).then(r => r.json()).then(d => {
                    for (const item of (d.tags || [])) {
                        if (item.cn && item.cn.includes(kw)) {
                            _ruleTl[kw] = item.tag;
                            return true;
                        }
                    }
                    return false;
                }).catch(() => false);
            }
            function refreshRulesPanel() {
                rulesList.innerHTML = "";
                const entries = Object.entries(_activeRules);
                // 给中文关键词查英文名
                for (const [kw] of entries) {
                    if (/[\u4e00-\u9fff]/.test(kw) && !_ruleTl[kw]) {
                        _lookupKw(kw).then(function(found) { if (found) refreshRulesPanel(); });
                        break;
                    }
                }
                if (!entries.length) { rulesBar.style.display = "none"; return; }
                if (_rulesOpen) rulesBar.style.display = "block";
                for (const [kw, cat] of entries) {
                    const catColor = CATS.find(c => c.v === cat)?.c || "#888";
                    const tag = $el("span", {
                        style: { display: "inline-flex", alignItems: "center", gap: "3px", padding: "2px 6px", borderRadius: "3px", fontSize: "10px", background: catColor + "33", color: catColor, border: "1px solid " + catColor }
                    });
                    const isCn = /[\u4e00-\u9fff]/.test(kw);
                    const kwLabel = isCn && _ruleTl[kw] ? _ruleTl[kw] + "(" + kw + ")" : kw;
                    tag.innerHTML = `<span style="font-weight:bold;">${kwLabel}</span> → ${cat}`;
                    const delBtn = $el("span", { textContent: "✕", style: { marginLeft: "3px", cursor: "pointer", opacity: 0.6, fontSize: "10px" } });
                    delBtn.onclick = async () => {
                        try {
                            const r = await fetch("/danbooru_anima/tag_mapper_rule_delete", {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ keyword: kw }),
                            });
                            if ((await r.json()).success) { delete _activeRules[kw]; refreshRulesPanel(); }
                        } catch {}
                    };
                    tag.appendChild(delBtn);
                    rulesList.appendChild(tag);
                }
            }

            // ── 手动添加标签（带模糊搜索） ──
            const addBar = $el("div", {
                style: { display: "flex", gap: "4px", padding: "4px 8px", borderTop: "1px solid var(--anima-title)", flexShrink: 0, alignItems: "center", position: "relative" }
            });
            const addWrapper = $el("div", { style: { flex: 1, position: "relative" } });
            const addInput = $el("input", {
                type: "text", placeholder: "🔍 搜 tag 后添加",
                style: { width: "100%", padding: "4px 6px", borderRadius: "3px", border: "1px solid #555", background: "var(--anima-well)", color: "#e0e0e0", fontSize: "11px", outline: "none", boxSizing: "border-box" }
            });
            const addAc = $el("div", {
                style: { display: "none", position: "absolute", bottom: "100%", left: 0, right: 0, maxHeight: "150px", overflowY: "auto", background: "var(--anima-bg)", border: "1px solid var(--anima-title)", borderRadius: "4px", zIndex: 100 }
            });
            let acTimer = null;
            addInput.oninput = () => {
                clearTimeout(acTimer);
                const q = addInput.value.trim();
                if (!q) { addAc.style.display = "none"; return; }
                acTimer = setTimeout(async () => {
                    try {
                        const r = await fetch("/danbooru_anima/fuzzy_tags", {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ query: q }),
                        });
                        const d = await r.json();
                        const items = d.tags || [];
                        addAc.innerHTML = "";
                        if (!items.length) { addAc.style.display = "none"; return; }
                        for (const item of items.slice(0, 15)) {
                            const tagName = item.tag || item.name || "";
                            const cn = item.cn || item.cn_name || "";
                            const label = cn ? `${cn} (${tagName})` : tagName;
                            const row = $el("div", {
                                textContent: label,
                                style: { padding: "4px 8px", cursor: "pointer", color: "#ccc", fontSize: "11px", borderBottom: "1px solid var(--anima-well)" },
                                onclick: () => { addInput.value = tagName; addAc.style.display = "none"; addInput.focus(); },
                                onmouseover: () => { row.style.background = "var(--anima-title)"; },
                                onmouseout: () => { row.style.background = "transparent"; },
                            });
                            addAc.appendChild(row);
                        }
                        addAc.style.display = "block";
                    } catch { addAc.style.display = "none"; }
                }, 200);
            };
            addInput.onblur = () => setTimeout(() => addAc.style.display = "none", 200);
            addWrapper.append(addInput, addAc);
            const addBtn = $el("button", {
                textContent: "+ 添加",
                style: { padding: "4px 10px", borderRadius: "3px", border: "none", background: "var(--anima-title)", color: "var(--anima-accent-soft)", cursor: "pointer", fontSize: "11px", fontWeight: "bold", flexShrink: 0 }
            });
            const doAddTag = async () => {
                const t = addInput.value.trim();
                if (!t || tags.includes(t)) return;
                tags.push(t);
                addInput.value = "";
                addInput.focus();
                // 获取翻译
                if (!_translations[t]) {
                    try {
                        const r = await fetch("/danbooru_anima/translate_tags", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ tags: [t] }),
                        });
                        const d = await r.json();
                        if (d.success && d.translations) {
                            Object.assign(_translations, d.translations);
                        }
                    } catch {}
                }
                render();
                updateInfo();
            };
            addBtn.onclick = doAddTag;
            addInput.onkeydown = (e) => { if (e.key === "Enter") doAddTag(); };
            addBar.append(addWrapper, addBtn);

            // 底部
            const footer = $el("div", {
                style: {
                    display: "flex", gap: "6px", padding: "6px 10px",
                    borderTop: "1px solid var(--anima-title)", flexShrink: 0,
                    alignItems: "center",
                }
            });
            const st = $el("span", {
                textContent: animaTxt("就绪"),
                style: { flex: 1, color: "#888", fontSize: "11px" }
            });
            const btn = $el("button", {
                textContent: "💾 保存映射",
                style: {
                    padding: "6px 14px", borderRadius: "4px",
                    border: "none", background: "#e94560",
                    color: "#fff", cursor: "pointer",
                    fontSize: "12px", fontWeight: "bold",
                }
            });
            btn.onclick = async () => {
                const toMap = Object.entries(mappings).filter(([t, v]) => v && t);
                if (!toMap.length) { st.textContent = animaTxt("⚠️ 没有需要保存的映射"); return; }
                st.textContent = animaTxt("⏳ 保存中..."); btn.disabled = true;
                try {
                    const mapObj = {};
                    for (const [t, v] of toMap) mapObj[t] = v;
                    const r = await fetch("/danbooru_anima/tag_mapper_save", {
                        method: "POST", headers: {"Content-Type":"application/json"},
                        body: JSON.stringify({mappings: mapObj}),
                    });
                    const d = await r.json();
                    st.textContent = d.success ? `✅ 已保存 ${d.count} 条映射` : `❌ 保存失败: ${d.error}`;
                } catch (e) {
                    st.textContent = animaTxt("❌ 保存失败: ") + e.message;
                }
                btn.disabled = false;
            };
            // ── 导出 / 导入 ──
            const exportBtn = $el("button", {
                textContent: animaTxt("📤 导出"),
                title: "导出映射和规则为 JSON",
                style: { padding: "6px 10px", borderRadius: "4px", border: "1px solid var(--anima-title)", background: "transparent", color: "var(--anima-accent-soft)", cursor: "pointer", fontSize: "11px" }
            });
            exportBtn.onclick = async () => {
                st.textContent = animaTxt("⏳ 导出中...");
                try {
                    const r = await fetch("/danbooru_anima/tag_mapper_export");
                    const d = await r.json();
                    if (d.success) {
                        const blob = new Blob([JSON.stringify(d.data, null, 2)], { type: "application/json" });
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = "tag_mapper_backup.json";
                        a.click();
                        URL.revokeObjectURL(a.href);
                        st.textContent = animaTxt("✅ 导出完成");
                    } else { st.textContent = animaTxt("❌ 导出失败"); }
                } catch { st.textContent = animaTxt("❌ 导出失败"); }
            };
            const importBtn = $el("button", {
                textContent: animaTxt("📥 导入"),
                title: "导入映射和规则 JSON",
                style: { padding: "6px 10px", borderRadius: "4px", border: "1px solid var(--anima-title)", background: "transparent", color: "#6bcb77", cursor: "pointer", fontSize: "11px" }
            });
            importBtn.onclick = () => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".json";
                input.onchange = async () => {
                    const file = input.files?.[0];
                    if (!file) return;
                    st.textContent = animaTxt("⏳ 导入中...");
                    try {
                        const text = await file.text();
                        const data = JSON.parse(text);
                        const r = await fetch("/danbooru_anima/tag_mapper_import", {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ data, mode: "merge" }),
                        });
                        const d = await r.json();
                        if (d.success) {
                            st.textContent = `✅ 已导入 ${d.mappings_count} 条映射, ${d.patterns_count} 条规则`;
                            // 强制刷新数据
                            _lastHash = "";
                            poll();
                        } else { st.textContent = "❌ " + (d.error || "导入失败"); }
                    } catch (e) { st.textContent = animaTxt("❌ 导入失败: ") + e.message; }
                };
                input.click();
            };
            footer.prepend(exportBtn, importBtn, $el("span", { textContent: "|", style: { color: "#333", fontSize: "11px" } }));
            footer.append(st, btn);
            container.append(bar, list, rulesBar, addBar, footer);

            // ── DOM widget 注册（和D站浏览器完全一样） ──
            this.addDOMWidget("tag_mapper_ui", "div", container, { onDraw: () => {} });

            // ── 轮询 ──
            let _lastHash = "";
            async function poll() {
                try {
                    const r = await fetch("/danbooru_anima/tag_mapper_tags");
                    const d = await r.json();
                    const h = JSON.stringify(d.tags);
                    if (d.tags && h !== _lastHash) {
                        _lastHash = h; tags = d.tags;
                        fetch("/danbooru_anima/translate_tags", {
                            method: "POST", headers: {"Content-Type":"application/json"},
                            body: JSON.stringify({tags: tags.filter(t => !(t in _translations))}),
                        }).then(r => r.json()).then(d2 => {
                            if (d2.success) {
                                for (var _tk in d2.translations) { _translations[_tk] = d2.translations[_tk] || ""; }
                                render();
                            }
                        }).catch(() => render());
                        render();
                    }
                } catch {}
            }
            // 加载已有规则
            fetch("/danbooru_anima/tag_mapper_rules").then(r => r.json()).then(d => {
                if (d.success) { _activeRules = d.rules || {}; refreshRulesPanel(); }
            }).catch(() => {});
            setTimeout(poll, 500);
            node._tmPollTimer = setInterval(poll, 30000);
            // 节点删除时清理轮询（防累积泄漏）
            if (!node._tmCleaned) {
                node._tmCleaned = true;
                node.onRemoved = node.onRemoved || function() {
                    try { if (node._tmPollTimer) clearInterval(node._tmPollTimer); } catch(e) {}
                };
            }
        };
    },
});
