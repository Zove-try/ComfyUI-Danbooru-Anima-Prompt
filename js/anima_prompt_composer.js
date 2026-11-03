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


const TIME_ZH = { '(无)':'无','newest':'最新','recent':'近现代','mid':'中期','early':'早期','old':'老作品','year 2025':'2025年','year 2024':'2024年' };
const SAFETY_ZH = { '(无)':'无','safe':'安全','sensitive':'敏感','nsfw':'NSFW','explicit':'限制级' };
// ── SortableJS 拖拽排序 ──
(function(){if(window.Sortable)return;if(document.getElementById("apc-sortable-js"))return;var s=document.createElement("script");s.id="apc-sortable-js";s.src="/extensions/ComfyUI-Danbooru-Anima-Prompt/js/sortable.min.js";document.head.appendChild(s);})();
(function(){if(document.getElementById("apc-sortable-css"))return;var s=document.createElement("style");s.id="apc-sortable-css";s.textContent=".apc-sortable-chosen{z-index:10;box-shadow:0 4px 16px rgba(var(--anima-accent-rgb),0.28)}.apc-sortable-ghost{opacity:0.35;border:1px dashed var(--anima-accent-soft)!important;background:rgba(var(--anima-accent-rgb),0.08)!important}";document.head.appendChild(s);})();
(function(){var _oldApcTh=document.getElementById("apc-composer-theme-v4");if(_oldApcTh)_oldApcTh.remove();if(document.getElementById("apc-composer-theme-v5"))return;var s=document.createElement("style");s.id="apc-composer-theme-v5";s.textContent=".apc-composer-panel{--ink:#ffffff;--mute:var(--anima-mute);--sage:var(--anima-accent-soft);--well:rgba(var(--anima-well-deep-rgb),.94);--glass:rgba(var(--anima-accent-hi-rgb),.18);--line:rgba(255,255,255,.28);--spec:inset 0 1px 0 rgba(255,255,255,.22);scrollbar-width:thin;scrollbar-color:var(--anima-accent) transparent;color:#fff;font-weight:600}.apc-composer-panel::-webkit-scrollbar{width:6px}.apc-composer-panel::-webkit-scrollbar-track{background:transparent}.apc-composer-panel::-webkit-scrollbar-thumb{background:var(--anima-accent);border-radius:8px}.apc-composer-panel input,.apc-composer-panel textarea,.apc-composer-panel select{transition:border-color .15s ease,box-shadow .15s ease;color-scheme:dark;background:var(--well)!important;border-color:rgba(var(--anima-accent-rgb),.5)!important;color:#fff!important;font-size:13px!important;font-weight:700!important;box-shadow:var(--spec)}.apc-composer-panel input:focus,.apc-composer-panel textarea:focus,.apc-composer-panel select:focus{border-color:var(--anima-accent)!important;box-shadow:0 0 0 2px rgba(var(--anima-accent-rgb),.38)}.apc-composer-panel input::placeholder,.apc-composer-panel textarea::placeholder{color:var(--anima-placeholder)!important;opacity:1;font-weight:600}.apc-composer-panel button{font-weight:700}";document.head.appendChild(s);})();
import { app } from "/scripts/app.js";
import "./00_anima_i18n.js";
import { $el } from "/scripts/ui.js";
import { openPromptFavPopup } from "./danbooru_prompt_favorites.js";
import "./00_anima_theme.js";
import "./01_anima_chip_flyout.js";

app.registerExtension({
    name: "Comfy.AnimaPromptComposer",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "AnimaPromptCreator") return;
        window.hookAnimaNodeChrome(nodeType);

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onCreated?.apply(this, arguments);
            this.setSize([650, 830]);
            this.title = animaTxt("✏️ 提示词创作器");
            window.applyAnimaNodeChrome(this);
            this.computeSize = () => { return [650, 830]; };

            const node = this;
            const w = {};
            const _knownWidgets = new Set([
                "quality_tags","count_tags","character_tags","series_tags",
                "artist_tags","general_tags","model_mode","natural_language",
                "time_tag","safety_tag","meta_tags"
            ]);
            function collapseHiddenWidgets() {
                for (const wg of node.widgets || []) {
                    if (!_knownWidgets.has(wg.name)) continue;
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
            for (const wg of node.widgets || []) {
                w[wg.name] = wg;
            }
            collapseHiddenWidgets();
            function setW(n, v) {
                const gw = w[n];
                if (gw && gw.value !== v) { gw.value = v; node.setDirtyCanvas(true, true); }
            }
            function esc(s) { return (s||"").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

            const panel = document.createElement("div");
            panel.className = "apc-composer-panel";
            panel.style.cssText = "width:100%;height:100%;overflow-y:auto;padding:8px;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:radial-gradient(ellipse 80% 55% at 100% -8%,rgba(var(--anima-glow-core-rgb),.5) 0%,transparent 58%),linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid rgba(var(--anima-accent-rgb),.45);border-radius:14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.18);color:#ffffff;font-weight:600;";

            // ── 便捷入口 ──
            function mkLabel(text,clr) { return $el("span",{textContent:text,style:{color:clr||"#ffffff",fontSize:"14px",fontWeight:"800",display:"block",marginBottom:"4px",letterSpacing:"0"}}); }
            function mkTextarea(wk, ph, rows) {
                const ta = document.createElement("textarea");
                ta.value = w[wk]?.value || "";
                ta.placeholder = ph || "";
                ta.style.cssText = "width:100%;padding:6px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(8,10,14,.88);color:#ffffff;font-size:13px;outline:none;resize:none;box-sizing:border-box;height:"+(rows||2)*18+"px;";
                ta.oninput = () => { setW(wk, ta.value); refreshPreview(); };
                return ta;
            }
            function mkInput(wk, ph) {
                const inp = document.createElement("input");
                inp.type = "text";
                inp.value = w[wk]?.value || "";
                inp.placeholder = ph || "";
                inp.style.cssText = "width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(8,10,14,.88);color:#ffffff;font-size:13px;outline:none;box-sizing:border-box;";
                inp.oninput = () => { setW(wk, inp.value); refreshPreview(); };
                return inp;
            }

            // ── 顶部：模型模式 ──
            const topBar = document.createElement("div");
            topBar.style.cssText = "display:flex;align-items:center;gap:8px;flex-shrink:0;padding:6px 10px;border-radius:10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);";
            topBar.appendChild($el("span",{textContent:"模型:",style:{color:"#ffffff",fontSize:"13px",fontWeight:"700",letterSpacing:"0"}}));
            const MODES = ["Anima","Noob","Aesthetic"];
            const MCOLORS = ["var(--anima-accent-hi)","#3a2c28","#1c2428"];
            const MTCOLORS = ["#ffffff","#f0c4b0","var(--anima-ink-chip)"];
            const modeBtn = document.createElement("button");
            function updateModeBtn() {
                const m = w.model_mode?.value || 0;
                modeBtn.textContent = MODES[m] || MODES[0];
                modeBtn.style.background = MCOLORS[m];
                modeBtn.style.color = MTCOLORS[m];
                modeBtn.style.border = "1px solid " + (m===0 ? "rgba(var(--anima-accent-rgb),0.45)" : m===1 ? "rgba(240,196,176,0.45)" : "rgba(var(--anima-accent-rgb),0.45)");
            }
            modeBtn.style.cssText = "padding:4px 12px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:bold;transition:all .15s ease;";
            updateModeBtn();
            modeBtn.onclick = () => {
                const m = ((w.model_mode?.value || 0) + 1) % 3;
                setW("model_mode", m);
                updateModeBtn();
                refreshPreview();
            };
            topBar.appendChild(modeBtn);
            panel.appendChild(topBar);

            // ── 主布局：左编辑区 + 右预览区 ──
            const mainRow = document.createElement("div");
            mainRow.style.cssText = "display:flex;flex-direction:row;gap:10px;flex:1;min-height:0;";
            const leftCol = document.createElement("div");
            leftCol.style.cssText = "flex:1;display:flex;flex-direction:column;gap:4px;overflow-y:auto;min-width:0;";
            const rightCol = document.createElement("div");
            rightCol.style.cssText = "width:320px;flex-shrink:0;overflow-y:auto;";
            mainRow.appendChild(leftCol); mainRow.appendChild(rightCol);


            // ── 1. 质量词 ──
            const qCard = document.createElement("div"); qCard.style.cssText = "flex-shrink:0;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:10px 10px 10px 12px;margin-bottom:8px;box-shadow:inset 0 1px 0 rgba(255,255,255,.18);";
            qCard.appendChild(mkLabel(animaTxt("📝 质量词"), "#9ec4e0"));
            const qArea = mkTextarea("quality_tags","留空自动填模型默认质量词", 2);
            qCard.appendChild(qArea);
            panel.appendChild(qCard);

            // ── 1b-1d. 时间/安全/元标签 合并卡片 ──
            const tsmCard = document.createElement("div");
            tsmCard.style.cssText = "flex-shrink:0;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:10px 10px 10px 12px;margin-bottom:8px;box-shadow:inset 0 1px 0 rgba(255,255,255,.18);";
            const tRow = document.createElement("div"); tRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:4px;";
            tRow.appendChild(mkLabel(animaTxt("🕐 时间"), "#c4b3dc"));
            const tSel = document.createElement("select");
            tSel.style.cssText = "padding:3px 6px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(8,10,14,.88);color:#ffffff;font-size:13px;";
            const times = ["year 2025","year 2024","year 2023","year 2022","year 2021","year 2020","newest","recent","mid","early","old"];
            for (const tv of times) { const o = document.createElement("option"); o.value=tv; o.textContent=(typeof animaIsZh==="function"&&animaIsZh())?(TIME_ZH[tv]||tv):tv; if (tv===w.time_tag?.value) o.selected=true; tSel.appendChild(o); }
            tSel.onchange = () => { setW("time_tag", tSel.value); refreshPreview(); };
            tRow.appendChild(tSel); tsmCard.appendChild(tRow);

            // ── 1c. 安全词 ──
            const sfRow = document.createElement("div"); sfRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:4px;";
            sfRow.appendChild(mkLabel(animaTxt("🔒 安全"), "#e8a0b0"));
            const sfSel = document.createElement("select");
            sfSel.style.cssText = "padding:3px 6px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(8,10,14,.88);color:#ffffff;font-size:13px;";
            ["(无)","safe","sensitive","nsfw","explicit"].forEach(function(sv){ const o = document.createElement("option"); o.value=sv; o.textContent=(typeof animaIsZh==="function"&&animaIsZh())?(SAFETY_ZH[sv]||sv):(sv==="(无)"?animaTxt("(无)"):sv); if (sv===w.safety_tag?.value) o.selected=true; sfSel.appendChild(o); });
            sfSel.onchange = () => { setW("safety_tag", sfSel.value); refreshPreview(); };
            sfRow.appendChild(sfSel); tsmCard.appendChild(sfRow);

            // ── 1d. 元标签 ──
            const mRow = document.createElement("div"); mRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;";
            mRow.appendChild(mkLabel(animaTxt("📋 元标签"), "#e8d48a"));
            const mChips = document.createElement("div"); mChips.style.cssText = "display:flex;flex-wrap:wrap;gap:3px;";
            const presets = ["highres","absurdres","anime screenshot","jpeg artifacts","official art","sketch","monochrome","sepia","watermark","greyscale","3d","photo","anime coloring","comic","oil painting","watercolor"];
            const mCN = {"highres":"高清","absurdres":"超高分辨率","anime screenshot":"动画截图","jpeg artifacts":"JPEG伪影","official art":"官方美术","sketch":"草图","monochrome":"黑白","sepia":"怀旧色调","watermark":"水印","greyscale":"灰度","3d":"3D","photo":"照片","anime coloring":"动画上色","comic":"漫画","oil painting":"油画","watercolor":"水彩"};
            const mLabel = function(t){ return (typeof animaIsZh === "function" && animaIsZh()) && mCN[t] ? mCN[t] : t; };
            let _mSelected = (w.meta_tags?.value||"").split(/[,，]+/).map(function(t){return t.trim();}).filter(Boolean);
if (!_mSelected.length && !w.meta_tags?.value) { _mSelected = ["highres","absurdres"]; setW("meta_tags", "highres, absurdres"); }
            function renderMChips() {
                mChips.innerHTML = "";
                var all = [...new Set([...presets, ..._mSelected])];
                for (var pi=0; pi<all.length; pi++) {
                    var t = all[pi]; var sel = _mSelected.indexOf(t) >= 0;
                    var chip = document.createElement("span");
                    chip.textContent = mLabel(t); chip.style.cssText = "padding:1px 6px;border-radius:3px;cursor:pointer;font-size:12px;background:"+(sel?"var(--anima-accent-hi)":"rgba(8,14,16,.82)")+";color:"+(sel?"var(--anima-accent-soft)":"var(--anima-mute)")+";border:1px solid "+(sel?"rgba(var(--anima-accent-rgb),0.45)":"rgba(255,255,255,.16)")+";";
                    chip.onmouseover = function(){ if (!sel) this.style.color="var(--anima-accent-soft)"; }
                    chip.onmouseout = function(){ if (!sel) this.style.color="var(--anima-mute)"; }
                    chip.onclick = function(t2){ return function(){ if (_mSelected.indexOf(t2)>=0) { _mSelected = _mSelected.filter(function(x){return x!==t2;}); } else { _mSelected.push(t2); } setW("meta_tags", _mSelected.join(", ")); renderMChips(); } }(t);
                    mChips.appendChild(chip);
                }
                var customInp = document.createElement("input");
                customInp.type = "text"; customInp.placeholder = animaTxt("+自定义"); customInp.style.cssText = "width:60px;padding:1px 4px;border-radius:3px;border:1px solid rgba(255,255,255,.16);background:rgba(8,10,14,.88);color:#ffffff;font-size:12px;";
                customInp.onkeydown = function(e){ if (e.key==="Enter" && this.value.trim()) { _mSelected.push(this.value.trim()); setW("meta_tags", _mSelected.join(", ")); this.value = ""; renderMChips(); } };
                mChips.appendChild(customInp);
            }
            renderMChips();
            mRow.appendChild(mChips); tsmCard.appendChild(mRow); panel.appendChild(tsmCard);

            // ── 2. 计数 ──
            const cCard = document.createElement("div"); cCard.style.cssText = "flex-shrink:0;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:10px 10px 10px 12px;margin-bottom:8px;box-shadow:inset 0 1px 0 rgba(255,255,255,.18);";
            cCard.appendChild(mkLabel(animaTxt("🔢 计数"), "var(--anima-accent-soft)"));
            const cSel = document.createElement("select");
            cSel.style.cssText = "width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(8,10,14,.88);color:#ffffff;font-size:13px;outline:none;box-sizing:border-box;";
            ["","1girl","1boy","2girls","2boys","1girl, 1boy","3girls","4girls","5girls","solo","multiple girls","multiple boys"].forEach(v => {
                const o = document.createElement("option"); o.value = v; o.textContent = v || "（不填）";
                if (v === (w.count_tags?.value || "")) o.selected = true;
                cSel.appendChild(o);
            });
            cSel.onchange = () => { setW("count_tags", cSel.value); refreshPreview(); };
            cCard.appendChild(cSel);
            panel.appendChild(cCard);

            // ── 3. 角色 ──
            const chCard = document.createElement("div"); chCard.style.cssText = "flex-shrink:0;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:10px 10px 10px 12px;margin-bottom:8px;box-shadow:inset 0 1px 0 rgba(255,255,255,.18);";
            chCard.appendChild(mkLabel(animaTxt("👤 角色"), "#e2c48a"));
            const chBar = document.createElement("div"); chBar.style.cssText = "display:flex;gap:4px;align-items:center;";
            const chWrap = document.createElement("div"); chWrap.style.cssText = "position:relative;flex:1;min-width:0;";
            const chInp = document.createElement("input");
            chInp.type = "text";
            chInp.value = w.character_tags?.value || "";
            chInp.placeholder = animaTxt("角色名+特征，逗号分隔");
            chInp.style.cssText = "width:100%;padding:5px 18px 5px 5px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(8,10,14,.88);color:#ffffff;font-size:13px;outline:none;box-sizing:border-box;";
            chInp.oninput = () => { setW("character_tags", chInp.value); setW("series_tags", w.series_tags?.value||""); refreshPreview(); };
            chWrap.appendChild(chInp);
            const chClear = document.createElement("span");
            chClear.textContent = "✕"; chClear.title = animaTxt("清空角色");
            chClear.style.cssText = "position:absolute;top:50%;transform:translateY(-50%);right:5px;cursor:pointer;color:#e94560;font-size:11px;line-height:1;display:none;";
            chClear.onclick = function(){ chInp.value = ""; setW("character_tags", ""); refreshPreview(); };
            chWrap.appendChild(chClear);
            chWrap.onmouseenter = function(){ chClear.style.display="block"; };
            chWrap.onmouseleave = function(){ chClear.style.display="none"; };
            chBar.appendChild(chWrap);
            // AnimaDex 选角色（图标按钮，与 NewBie 工具栏同步）
            const chAdexBtn = document.createElement("button");
            chAdexBtn.textContent = "🌐 ADex"; chAdexBtn.title = animaTxt("搜角色 (Animadex)");
            chAdexBtn.style.cssText = "display:inline-flex;align-items:center;gap:3px;padding:4px 9px;border-radius:8px;cursor:pointer;font-size:13px;background:rgba(255,255,255,.08);color:var(--anima-accent-soft);border:1px solid rgba(255,255,255,.16);transition:all 0.15s ease;user-select:none;vertical-align:middle;flex-shrink:0;";
            chAdexBtn.onmouseenter = function(){ chAdexBtn.style.background="rgba(var(--anima-accent-rgb),0.15)"; chAdexBtn.style.color="var(--anima-accent-soft)"; chAdexBtn.style.borderColor="rgba(255,255,255,.28)"; chAdexBtn.style.transform="translateY(-1px)"; };
            chAdexBtn.onmouseleave = function(){ chAdexBtn.style.background="rgba(255,255,255,.08)"; chAdexBtn.style.color="var(--anima-accent-soft)"; chAdexBtn.style.borderColor="rgba(255,255,255,.16)"; chAdexBtn.style.transform=""; };
            chAdexBtn.onclick = () => { window._artistFavOnSelect = null; window._adexOnSelect = applyCharPick; window.openAdexPopup("char"); };
            chBar.appendChild(chAdexBtn);
            // G站 选角色（图标按钮，与 NewBie 工具栏同步）
            const chGelBtn = document.createElement("button");
            chGelBtn.textContent = animaTxt("🔍 G站"); chGelBtn.title = animaTxt("搜角色 (G站)");
            chGelBtn.style.cssText = "display:inline-flex;align-items:center;gap:3px;padding:4px 9px;border-radius:8px;cursor:pointer;font-size:13px;background:rgba(255,255,255,.08);color:var(--anima-accent-soft);border:1px solid rgba(255,255,255,.16);transition:all 0.15s ease;user-select:none;vertical-align:middle;flex-shrink:0;";
            chGelBtn.onmouseenter = function(){ chGelBtn.style.background="rgba(var(--anima-accent-rgb),0.15)"; chGelBtn.style.color="var(--anima-accent-soft)"; chGelBtn.style.borderColor="rgba(255,255,255,.28)"; chGelBtn.style.transform="translateY(-1px)"; };
            chGelBtn.onmouseleave = function(){ chGelBtn.style.background="rgba(255,255,255,.08)"; chGelBtn.style.color="var(--anima-accent-soft)"; chGelBtn.style.borderColor="rgba(255,255,255,.16)"; chGelBtn.style.transform=""; };
            chGelBtn.onclick = () => { window._artistFavOnSelect = null; window._adexOnSelect = applyCharPick; window.openGelCharsPopup(); };
            chBar.appendChild(chGelBtn);
            chCard.appendChild(chBar);
            // 角色卡按钮（独立一行，更显眼）
            const chCardRow = document.createElement("div");
            chCardRow.style.cssText = "flex-shrink:0;margin-top:2px;";
            const chCardBtn2 = document.createElement("button");
            chCardBtn2.textContent = animaTxt("🃏 角色卡"); chCardBtn2.title = animaTxt("管理/加载角色卡");
            chCardBtn2.style.cssText = "padding:5px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.22);cursor:pointer;background:rgba(var(--anima-accent-rgb),.12);color:var(--anima-accent-soft);font-size:13px;font-weight:600;transition:all 0.2s ease;";
            chCardBtn2.onmouseover = function(){ chCardBtn2.style.background="rgba(var(--anima-accent-rgb),0.22)"; };
            chCardBtn2.onmouseout = function(){ chCardBtn2.style.background="rgba(var(--anima-accent-rgb),.12)"; };
            chCardBtn2.onclick = function(){ showCharCardManager(); };
            chCardRow.appendChild(chCardBtn2);
            chCard.appendChild(chCardRow);
            panel.appendChild(chCard);

            // ── 角色+系列共享清空按钮 ──
            const chsClearBar = document.createElement("div");
            chsClearBar.style.cssText = "display:flex;justify-content:center;margin-bottom:6px;";
            const chsClear = document.createElement("button");
            chsClear.textContent = animaTxt("✕ 同时清空角色与系列"); chsClear.title = animaTxt("同时清空角色栏与系列栏");
            chsClear.style.cssText = "padding:5px 14px;border-radius:14px;border:1px solid rgba(233,69,96,0.4);cursor:pointer;background:rgba(233,69,96,0.1);color:#e94560;font-size:13px;font-weight:600;transition:all 0.2s ease;";
            chsClear.onmouseover = function(){ chsClear.style.background="rgba(233,69,96,0.25)"; chsClear.style.borderColor="#e94560"; };
            chsClear.onmouseout = function(){ chsClear.style.background="rgba(233,69,96,0.1)"; chsClear.style.borderColor="rgba(233,69,96,0.4)"; };
            chsClear.onclick = function(){ chInp.value = ""; sInp.value = ""; setW("character_tags", ""); setW("series_tags", ""); refreshPreview(); };
            chsClearBar.appendChild(chsClear);
            panel.appendChild(chsClearBar);

            // ── 4. 系列 ──
            const sCard = document.createElement("div"); sCard.style.cssText = "display:flex;align-items:center;gap:4px;flex-shrink:0;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:10px 10px 10px 12px;margin-bottom:8px;box-shadow:inset 0 1px 0 rgba(255,255,255,.18);";
            sCard.appendChild(mkLabel(animaTxt("📺 系列"), "#8fc9c0"));
            const sWrap = document.createElement("div"); sWrap.style.cssText = "position:relative;flex:1;min-width:0;";
            const sInp = mkInput("series_tags","逗号分隔系列名");
            sInp.style.cssText += ";padding-right:18px;";
            sWrap.appendChild(sInp);
            const sClear = document.createElement("span");
            sClear.textContent = "✕"; sClear.title = "清空系列";
            sClear.style.cssText = "position:absolute;top:50%;transform:translateY(-50%);right:5px;cursor:pointer;color:#e94560;font-size:11px;line-height:1;display:none;";
            sClear.onclick = function(){ sInp.value = ""; setW("series_tags", ""); refreshPreview(); };
            sWrap.appendChild(sClear);
            sWrap.onmouseenter = function(){ sClear.style.display="block"; };
            sWrap.onmouseleave = function(){ sClear.style.display="none"; };
            sCard.appendChild(sWrap);
            panel.appendChild(sCard);

            // ── 5. 画师 ──
            const aCard = document.createElement("div"); aCard.style.cssText = "flex-shrink:0;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:10px 10px 10px 12px;margin-bottom:8px;box-shadow:inset 0 1px 0 rgba(255,255,255,.18);";
            aCard.appendChild(mkLabel(animaTxt("🎨 画师"), "#e3a8b8"));
            const aBar = document.createElement("div"); aBar.style.cssText = "display:flex;gap:4px;align-items:center;";
            const aWrap = document.createElement("div"); aWrap.style.cssText = "position:relative;flex:1;min-width:0;";
            const aInp = mkInput("artist_tags","逗号分隔画师");
            aInp.style.cssText += ";padding-right:18px;";
            aWrap.appendChild(aInp);
            const aClear = document.createElement("span");
            aClear.textContent = "✕"; aClear.title = "清空画师";
            aClear.style.cssText = "position:absolute;top:50%;transform:translateY(-50%);right:5px;cursor:pointer;color:#e94560;font-size:11px;line-height:1;display:none;";
            aClear.onclick = () => { aInp.value = ""; setW("artist_tags", ""); refreshPreview(); };
            aWrap.appendChild(aClear);
            aWrap.onmouseenter = function(){ aClear.style.display="block"; };
            aWrap.onmouseleave = function(){ aClear.style.display="none"; };
            aBar.appendChild(aWrap);
            const aFavBtn = document.createElement("button");
            aFavBtn.textContent = animaTxt("⭐ 收藏"); aFavBtn.title = animaTxt("画师收藏夹");
            aFavBtn.style.cssText = "display:inline-flex;align-items:center;gap:3px;padding:4px 9px;border-radius:8px;cursor:pointer;font-size:13px;background:rgba(255,255,255,.08);color:var(--anima-accent-soft);border:1px solid rgba(255,255,255,.16);transition:all 0.15s ease;user-select:none;vertical-align:middle;flex-shrink:0;";
            aFavBtn.onmouseenter = function(){ aFavBtn.style.background="rgba(var(--anima-accent-rgb),0.15)"; aFavBtn.style.color="var(--anima-accent-soft)"; aFavBtn.style.borderColor="rgba(255,255,255,.28)"; aFavBtn.style.transform="translateY(-1px)"; };
            aFavBtn.onmouseleave = function(){ aFavBtn.style.background="rgba(255,255,255,.08)"; aFavBtn.style.color="var(--anima-accent-soft)"; aFavBtn.style.borderColor="rgba(255,255,255,.16)"; aFavBtn.style.transform=""; };
            aFavBtn.onclick = () => { window._adexOnSelect = null; window._artistFavOnSelect = applyArtistFav; window.showArtistFavPopup("danbooru"); };
            aBar.appendChild(aFavBtn);
            const aAdexBtn = document.createElement("button");
            aAdexBtn.textContent = "🎨 ADex"; aAdexBtn.title = "搜画师 (Animadex)";
            aAdexBtn.style.cssText = "display:inline-flex;align-items:center;gap:3px;padding:4px 9px;border-radius:8px;cursor:pointer;font-size:13px;background:rgba(255,255,255,.08);color:var(--anima-accent-soft);border:1px solid rgba(255,255,255,.16);transition:all 0.15s ease;user-select:none;vertical-align:middle;flex-shrink:0;";
            aAdexBtn.onmouseenter = function(){ aAdexBtn.style.background="rgba(var(--anima-accent-rgb),0.15)"; aAdexBtn.style.color="var(--anima-accent-soft)"; aAdexBtn.style.borderColor="rgba(255,255,255,.28)"; aAdexBtn.style.transform="translateY(-1px)"; };
            aAdexBtn.onmouseleave = function(){ aAdexBtn.style.background="rgba(255,255,255,.08)"; aAdexBtn.style.color="var(--anima-accent-soft)"; aAdexBtn.style.borderColor="rgba(255,255,255,.16)"; aAdexBtn.style.transform=""; };
            aAdexBtn.onclick = () => { window._artistFavOnSelect = null; window._adexOnSelect = applyArtistPick; window.openArtistBrowse(); };
            aBar.appendChild(aAdexBtn);
            aCard.appendChild(aBar);
            panel.appendChild(aCard);

            // ── 6. 通用标签（折叠分类） ──
            const gCard = document.createElement("div"); gCard.style.cssText = "flex-shrink:0;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:10px 10px 10px 12px;margin-bottom:8px;box-shadow:inset 0 1px 0 rgba(255,255,255,.18);";
            gCard.appendChild(mkLabel(animaTxt("🏷 通用标签"), "#e8d48a"));

            // ── 通用标签工具栏 ──
            const gBar = document.createElement("div");
            gBar.style.cssText = "display:flex;gap:4px;align-items:center;margin-bottom:4px;flex-wrap:wrap;";
            let _gHidden = {};
            const _gRaw = w.general_tags?.value ? w.general_tags.value.split(/[,，]+/).map(t=>t.trim()).filter(Boolean) : [];
            let _gTagList = _gRaw.slice();

            // ── 翻译辅助（单次批量，省 token，和文本透传同款）──
            async function translateTags(tags, useCloud) {
                if (!tags.length) return {};
                const results = {};
                const unknown = [];
                for (const t of tags) {
                    const tl = t.replace(/ /g, "_").toLowerCase();
                    if (_allTranslations[tl] || _allTranslations[t]) continue;
                    // 优先用预制翻译，不请求云端
                    const preset = (typeof PRESET_TRANSLATIONS !== "undefined" && PRESET_TRANSLATIONS[tl]) || (typeof PRESET_TRANSLATIONS !== "undefined" && PRESET_TRANSLATIONS[t]);
                    if (preset) { results[t] = preset; results[tl] = preset; continue; }
                    unknown.push(t);
                }
                if (!unknown.length || !useCloud) return results;
                var _tf = window.animaTranslateFields();
                var _missTf = window.animaTransConfigError(_tf.cfg);
                if (_missTf) { return results; }
                try {
                    const r = await fetch("/danbooru_anima/cloud_translate", {
                        method: "POST", headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({tags: unknown, provider: _tf.provider, api_key: _tf.api_key, model: _tf.model, base_url: _tf.base_url, baidu_appid: _tf.baidu_appid})
                    });
                    if (r.ok) {
                        const d = await r.json();
                        if (d.success && d.translations) Object.assign(results, d.translations);
                    }
                } catch(e) {}
                return results;
            }

            const _customPresets = {};  // category → [tag1, tag2, ...]
            try { const d = JSON.parse(localStorage.getItem("apc_custom_presets")||"{}"); Object.assign(_customPresets, d); } catch(e) {}
            var _userDataReady = false;
            var _userDataPromise = null;
            // 从插件文件夹加载持久化数据（跨浏览器同步）——文件数据覆盖本地
            _userDataPromise = fetch("/danbooru_anima/load_userdata").then(function(r){return r.json();}).then(function(d2){if(d2.success&&d2.data){if(d2.data.apc_custom_presets){var _cp={};try{_cp=JSON.parse(localStorage.getItem("apc_custom_presets")||"{}");}catch(e){}for(var k in d2.data.apc_custom_presets){_cp[k]=d2.data.apc_custom_presets[k];}localStorage.setItem("apc_custom_presets",JSON.stringify(_cp));for(var k in _cp){_customPresets[k]=_cp[k];}}["apc_subcats","apc_custom_subcats","apc_deleted"].forEach(function(_dk){if(d2.data[_dk]){try{localStorage.setItem(_dk,d2.data[_dk]);}catch(e){}}});if(d2.data.apc_user_thumbs){var _eThumbs={};try{_eThumbs=JSON.parse(localStorage.getItem("apc_tag_thumbs")||"{}");}catch(e){}for(var _k2 in d2.data.apc_user_thumbs){_eThumbs[_k2]=d2.data.apc_user_thumbs[_k2];}try{localStorage.setItem("apc_tag_thumbs",JSON.stringify(_eThumbs));}catch(e){}}saveCustom();}}).catch(function(){}).then(function(){_userDataReady=true;});
            const _deleted = {};
            try { const sd = JSON.parse(localStorage.getItem("apc_deleted")||"{}"); for (const k in sd) { _deleted[k] = sd[k]; } } catch(e) {}
            // 画师组合后端持久化（换浏览器不丢）
            function _loadCombosFromServer(){
                return fetch("/danbooru_anima/load_userdata").then(function(r){return r.json();}).then(function(d){
                    if (d && d.success && d.data && Array.isArray(d.data.danbooru_artist_combos)) {
                        var local = []; try { local = JSON.parse(localStorage.getItem("danbooru_artist_combos")||"[]"); } catch(e) {}
                        var server = d.data.danbooru_artist_combos;
                        var names = {}; local.forEach(function(c){ if(c && c.name) names[c.name]=true; });
                        server.forEach(function(c){ if(c && c.name && !names[c.name]) { local.push(c); names[c.name]=true; } });
                        if (local.length) { try { localStorage.setItem("danbooru_artist_combos", JSON.stringify(local)); } catch(e) {} }
                    }
                }).catch(function(){});
            }
            function _saveCombosToServer(combos){
                return fetch("/danbooru_anima/load_userdata").then(function(r){return r.json();}).then(function(d){
                    var data = (d && d.success && d.data) ? d.data : {};
                    data.danbooru_artist_combos = combos;
                    return fetch("/danbooru_anima/save_userdata", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
                }).catch(function(){});
            }
            // 启动自动迁移：本地有组合且服务器没有时，自动上传到服务器（防止服务器数据被覆盖后丢失）
            (function(){
                try {
                    var _localC = JSON.parse(localStorage.getItem("danbooru_artist_combos")||"[]");
                    if (!_localC.length) return;
                    fetch("/danbooru_anima/load_userdata").then(function(r){return r.json();}).then(function(d){
                        var serverHas = d && d.success && d.data && Array.isArray(d.data.danbooru_artist_combos) && d.data.danbooru_artist_combos.length > 0;
                        if (!serverHas) _saveCombosToServer(_localC);
                    }).catch(function(){});
                } catch(e) {}
            })();

            function saveCustom() { try { localStorage.setItem("apc_custom_presets", JSON.stringify(_customPresets)); syncUserData(); } catch(e) {} }
            function syncUserData() {
                try {
                    var ud = {};
                    var allThumbs = {};
                    try { allThumbs = JSON.parse(localStorage.getItem("apc_tag_thumbs")||"{}"); } catch(e) {}
                    var userThumbs = {};
                    for (var k in allThumbs) { if (!(k in PRESET_THUMBS)) userThumbs[k] = allThumbs[k]; }
                    ud.apc_custom_presets = _customPresets;
                    ud.apc_user_thumbs = userThumbs;
                    var subcats = localStorage.getItem("apc_subcats");
                    if (subcats) ud.apc_subcats = subcats;
                    var customSubcats = localStorage.getItem("apc_custom_subcats");
                    if (customSubcats) ud.apc_custom_subcats = customSubcats;
                    var deleted = localStorage.getItem("apc_deleted");
                    if (deleted) ud.apc_deleted = deleted;
                    fetch("/danbooru_anima/save_userdata",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(ud)}).catch(function(){});
                } catch(e) {}
            }
            let _allTranslations = {};
            try { const saved = JSON.parse(localStorage.getItem("apc_translations")||"{}"); if (saved && Object.keys(saved).length) _allTranslations = saved; } catch(e) {}
            let _lastProvider = localStorage.getItem("db_trans_provider") || "";
            const _gTagColors = {};  // tag -> category color
            function _gChipCol(t) {
                return _gTagColors[t] || _gTagColors[(t||"").replace(/ /g,"_")] || _gTagColors[(t||"").replace(/_/g," ")] || "var(--anima-accent-soft)";
            }

            // 🗑 清除全部
            const gClearBtn = document.createElement("button");
            gClearBtn.textContent = animaTxt("🗑 清除全部");
            gClearBtn.style.cssText = "padding:4px 9px;border-radius:8px;border:1px solid rgba(255,255,255,.16);cursor:pointer;font-size:13px;background:rgba(255,255,255,.08);color:var(--anima-ink-chip);font-weight:500;";
            gClearBtn.onclick = () => { _gTagList = []; _gHidden = {}; renderGChips(); syncG(); }; var gCloudBtn = document.createElement("button"); gCloudBtn.textContent = "🌐"; gCloudBtn.title = "\u4e91\u7aef\u7ffb\u8bd1\u672a\u7ffb\u8bd1\u6807\u7b7e"; gCloudBtn.style.cssText = "padding:3px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.16);cursor:pointer;font-size:12px;background:rgba(255,255,255,.08);color:var(--anima-accent-soft);"; gCloudBtn.onclick = function(){ var allTags = _gTagList.filter(function(t){ return !_gHidden[t]; }); var untrans = allTags.filter(function(t){ return !_allTranslations[t.replace(/ /g,"_")] && !_allTranslations[t]; }); if (!untrans.length) return;  gCloudBtn.textContent = "..."; gCloudBtn.disabled = true; translateTags(untrans.map(function(t){return t.replace(/ /g,"_");}), true).then(function(tl){  Object.assign(_allTranslations, tl); renderGChips(); gCloudBtn.textContent = "🌐"; gCloudBtn.disabled = false; }).catch(function(){ gCloudBtn.textContent = "🌐"; gCloudBtn.disabled = false; }); }; gBar.appendChild(gCloudBtn);
            gBar.appendChild(gClearBtn); 
            gCard.appendChild(gBar);
            const gFavBtn = document.createElement("button");
            // ── 导出完整 layout 供收藏夹使用 ──
            node._getComposerLayout = function() {
                var _nlJson = "[]";
                try { _nlJson = JSON.stringify(JSON.parse(w.natural_language?.value || "[]")); } catch(e) {}
                return {
                    quality: qArea.value || "",
                    time: (w.time_tag?.value && w.time_tag.value !== "(无)") ? w.time_tag.value : "",
                    meta: w.meta_tags?.value || "",
                    safety: (w.safety_tag?.value && w.safety_tag.value !== "(无)") ? w.safety_tag.value : "",
                    count: cSel.value || "",
                    characters: chInp.value || "",
                    series: sInp.value || "",
                    artists: aInp.value || "",
                    general: _gTagList.join(", "),
                    nl_data: _nlJson,
                    model: w.model_mode?.value || 0
                };
            };
            gFavBtn.textContent = animaTxt("💾 收藏");
            gFavBtn.title = "提示词收藏夹";
            gFavBtn.style.cssText = "padding:3px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.16);cursor:pointer;font-size:12px;background:rgba(255,255,255,.08);color:#e8d48a;";
            gFavBtn.onclick = () => {
                var _fullText = [
                    qArea.value ? "[quality] " + qArea.value : "",
                    w.time_tag?.value && w.time_tag.value !== "(无)" ? "[time] " + w.time_tag.value : "",
                    w.meta_tags?.value ? "[meta] " + w.meta_tags.value : "",
                    w.safety_tag?.value && w.safety_tag.value !== "(无)" ? "[safety] " + w.safety_tag.value : "",
                    cSel.value ? "[count] " + cSel.value : "",
                    chInp.value ? "[char] " + chInp.value : "",
                    sInp.value ? "[series] " + sInp.value : "",
                    aInp.value ? "[artist] " + aInp.value : "",
                    _gTagList.length ? "[general] " + _gTagList.join(", ") : ""
                ].filter(Boolean).join("\n");
                openPromptFavPopup(node, _fullText, (selectedText) => {
                    // 尝试解析所有标记
                    const markers = {quality: "", time: "", meta: "", safety: "", count: "", char: "", series: "", artist: "", general: "", nl_data: "", model: ""};
                    const lines = selectedText.split(/\n|\\n/);
                    let hasMarkers = false;
                    for (const line of lines) {
                        const m = line.match(/^\[(quality|time|meta|safety|count|char|series|artist|general|nl_data|model)\]\s*(.*)/i);
                        if (m) { markers[m[1].toLowerCase()] = m[2].trim(); hasMarkers = true; }
                    }
                    // ── 收集所有已存在的 tag（用于去重）──
                    var _existingTags = new Set();
                    function _addExisting(text) {
                        if (!text) return;
                        text.split(/[,，]+/).forEach(function(t){ var _tk = t.trim().toLowerCase().replace(/_/g, " ").replace(/^@/, ""); if (_tk) _existingTags.add(_tk); });
                    }
                    _addExisting(qArea.value); _addExisting(chInp.value); _addExisting(sInp.value);
                    _addExisting(aInp.value); _addExisting(w.meta_tags?.value || "");
                    _gTagList.forEach(function(t){ _existingTags.add(t.toLowerCase().replace(/_/g, " ")); });
                    function _dedupTags(tagStr) {
                        if (!tagStr) return tagStr;
                        return tagStr.split(/[,，]+/).map(function(t){ return t.trim(); }).filter(function(t){
                            var _tk = t.toLowerCase().replace(/_/g, " ").replace(/^@/, "");
                            return _tk && !_existingTags.has(_tk);
                        }).join(", ");
                    }
                    if (hasMarkers) {
                        // 有标记 → 恢复到各栏位（带去重）
                        if (markers.quality) { var _q = _dedupTags(markers.quality); qArea.value = _q; setW("quality_tags", _q); }
                        if (markers.time && markers.time !== "(无)") {
                            for (var _ti = 0; _ti < tSel.options.length; _ti++) { if (tSel.options[_ti].value === markers.time) { tSel.selectedIndex = _ti; break; } }
                            setW("time_tag", markers.time);
                        }
                        if (markers.meta) { setW("meta_tags", markers.meta); _mSelected = markers.meta.split(/[,，]+/).map(function(t){return t.trim();}).filter(Boolean); renderMChips(); }
                        if (markers.safety && markers.safety !== "(无)") {
                            for (var _si = 0; _si < sfSel.options.length; _si++) { if (sfSel.options[_si].value === markers.safety) { sfSel.selectedIndex = _si; break; } }
                            setW("safety_tag", markers.safety);
                        }
                        if (markers.count) { cSel.value = markers.count; setW("count_tags", markers.count); }
                        if (markers.char) { var _ch = _dedupTags(markers.char); chInp.value = _ch; setW("character_tags", _ch); }
                        if (markers.series) { var _se = _dedupTags(markers.series); sInp.value = _se; setW("series_tags", _se); }
                        if (markers.artist) { var _ar = _dedupTags(markers.artist); aInp.value = _ar; setW("artist_tags", _ar); }
                        if (markers.general) {
                            var gDeduped = markers.general.split(/[,，]+/).map(function(t){ return t.trim(); }).filter(function(t){
                                var _tk = t.toLowerCase().replace(/_/g, " ").replace(/^@/, "");
                                return _tk && !_existingTags.has(_tk);
                            });
                            for (var _gi = 0; _gi < gDeduped.length; _gi++) addGTag(gDeduped[_gi]);
                        }
                        if (markers.model) { var _mv = parseInt(markers.model) || 0; setW("model_mode", Math.min(2, Math.max(0, _mv))); updateModeBtn(); }
                        if (markers.nl_data) {
                            try { var _nl = JSON.parse(markers.nl_data); if (Array.isArray(_nl) && _nl.length) { setW("natural_language", JSON.stringify(_nl)); _nlItems = _nl; renderNL(); } } catch(e) {}
                        }
                    } else {
                        // 无标记 → 全部进通用（带去重）
                        var _allExisting = new Set();
                        _addExisting2(qArea.value); _addExisting2(chInp.value); _addExisting2(sInp.value);
                        _addExisting2(aInp.value); _addExisting2(w.meta_tags?.value || "");
                        _gTagList.forEach(function(t){ _allExisting.add(t.toLowerCase().replace(/_/g, " ")); });
                        function _addExisting2(text) {
                            if (!text) return;
                            text.split(/[,，]+/).forEach(function(t){ var _tk = t.trim().toLowerCase().replace(/_/g, " ").replace(/^@/, ""); if (_tk) _allExisting.add(_tk); });
                        }
                        var allTags = selectedText.split(/[,，]+/).map(function(t){ return t.trim(); }).filter(function(t){
                            var _tk = t.toLowerCase().replace(/_/g, " ").replace(/^@/, "");
                            return _tk && !_allExisting.has(_tk);
                        });
                        for (var _ai = 0; _ai < allTags.length; _ai++) addGTag(allTags[_ai]);
                    }
                    refreshPreview();
                });
            };
            // 💾 保存（记录栏位）
            const gSaveBtn = document.createElement("button");
            gSaveBtn.textContent = animaTxt("💾 保存");
            gSaveBtn.title = "保存当前提示词";
            gSaveBtn.style.cssText = "padding:3px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.16);cursor:pointer;font-size:12px;background:rgba(255,255,255,.08);color:var(--anima-accent-soft);";
            gSaveBtn.onclick = () => {
                var _nlJson = "[]";
                try { _nlJson = JSON.stringify(JSON.parse(w.natural_language?.value || "[]")); } catch(e) {}
                const layout = {
                    quality: qArea.value,
                    time: (w.time_tag?.value && w.time_tag.value !== "(无)") ? w.time_tag.value : "",
                    meta: w.meta_tags?.value || "",
                    safety: (w.safety_tag?.value && w.safety_tag.value !== "(无)") ? w.safety_tag.value : "",
                    count: cSel.value,
                    characters: chInp.value,
                    series: sInp.value,
                    artists: aInp.value,
                    general: _gTagList.join(", "),
                    nl_data: _nlJson,
                    model: w.model_mode?.value || 0
                };
                const text = [
                    layout.quality ? "[quality] " + layout.quality : "",
                    layout.time ? "[time] " + layout.time : "",
                    layout.meta ? "[meta] " + layout.meta : "",
                    layout.safety ? "[safety] " + layout.safety : "",
                    layout.count ? "[count] " + layout.count : "",
                    layout.characters ? "[char] " + layout.characters : "",
                    layout.series ? "[series] " + layout.series : "",
                    layout.artists ? "[artist] " + layout.artists : "",
                    layout.general ? "[general] " + layout.general : "",
                    layout.nl_data && layout.nl_data !== "[]" ? "[nl_data] " + layout.nl_data : "",
                    "[model] " + layout.model
                ].filter(Boolean).join("\n");
                const payload = JSON.stringify({text: text, layout: JSON.stringify(layout), title: layout.characters || "提示词", source: "composer", folder: "__composer__"});
                fetch("/danbooru_anima/prompt_favorites/save", {method:"POST", headers:{"Content-Type":"application/json"}, body: payload}).then(r=>r.json()).then(d=>{if(d.success) { var _toast = document.createElement("div"); _toast.textContent = animaTxt("已保存到 ✏️ 创作器"); _toast.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--anima-accent-hi);color:var(--anima-accent-soft);padding:8px 20px;border-radius:10px;border:1px solid rgba(var(--anima-accent-rgb),0.3);font-size:13px;z-index:99999;pointer-events:none;transition:opacity 0.5s;"; document.body.appendChild(_toast); setTimeout(function(){ _toast.style.opacity = "0"; setTimeout(function(){ _toast.remove(); }, 500); }, 2000); }});
            };
            gBar.appendChild(gSaveBtn);gBar.appendChild(gFavBtn);
            gCard.appendChild(gBar);

            // 芯片展示区
            const gChips = document.createElement("div");
            gChips.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;min-height:20px;align-items:flex-start;";
            gCard.appendChild(gChips);

            function syncG() {
                const out = _gTagList.map(t => {
                    if (_gHidden[t] || !t) return null;
                    const w = _gWeights[t];
                    if (window.animaHasWeight ? window.animaHasWeight(w) : (w && Math.abs(w - 1.0) > 0.01)) return "(" + t + ":" + Number(w).toFixed(1) + ")";
                    return t;
                }).filter(Boolean).join(", ");
                setW("general_tags", out);
                refreshPreview();
            }
            // _gWeights from parsed general_tags
            const _gWeights = {};
            for (const t of _gRaw) {
                const m = t.match(/^\((.+):(-?\d+(?:\.\d+)?)\)$/);
                if (m) { _gWeights[m[1].trim()] = parseFloat(m[2]); _gTagList = _gTagList.filter(x => x !== t); _gTagList.push(m[1].trim()); }
            }

            function renderGChips() {
                try { if (window.animaKillChipFlyouts) window.animaKillChipFlyouts(); } catch(e) {}
                gChips.innerHTML = "";
                const apiTags = _gTagList.filter(t => !_gHidden[t]).map(t => t.replace(/ /g,"_"));
                for (let i = 0; i < _gTagList.length; i++) {
                    const t = _gTagList[i];
                    const hidden = !!_gHidden[t];
                    const _isMerged = t.indexOf("; ") >= 0;
                    const col = _gChipCol(t);
                    const chip = document.createElement("div");
                    chip.style.cursor = "grab";
                    if (typeof window.animaApplyTagChip === "function") window.animaApplyTagChip(chip, col, { hidden: hidden, merged: _isMerged });
                    else {
                        chip.style.cssText = "display:inline-flex;align-items:center;gap:2px;padding:2px 6px;border-radius:8px;background:var(--anima-well);color:"+col+";font-size:12px;border:1px solid "+col+"44;";
                        if (hidden) { chip.style.opacity = "0.4"; chip.style.filter = "grayscale(0.8)"; }
                    }
                    const lab = document.createElement("span");
                    lab.className = "anima-chip-en";
                    lab.style.cursor = "pointer";
                    lab.textContent = window.animaChipLabel ? window.animaChipLabel(t, _gWeights[t], _isMerged) : t;
                    lab.onmousedown = (ev) => { if (ev.detail !== 2) return; ev.preventDefault(); ev.stopPropagation(); const inp = document.createElement("input"); inp.type="text"; inp.value=t; inp.style.cssText="position:fixed;z-index:99999;left:"+lab.getBoundingClientRect().left+"px;top:"+lab.getBoundingClientRect().top+"px;width:80px;height:18px;padding:1px 4px;border:1px solid var(--anima-accent-soft);border-radius:3px;background:rgba(8,10,14,.88);color:#ffffff;font-size:12px;outline:none;"; document.body.appendChild(inp); inp.focus(); inp.select(); inp.onblur=()=>{const v=inp.value.trim();inp.remove();if(v&&v!==t){_gTagList[i]=v;renderGChips();syncG();}}; inp.onkeydown=(ev2)=>{if(ev2.key==="Enter"){ev2.preventDefault();inp.blur();}if(ev2.key==="Escape"){ev2.preventDefault();inp.remove();}}; };
                    chip.appendChild(lab);
                    var cn = _allTranslations[t.replace(/ /g,"_")] || _allTranslations[t] || "";
                    if (cn) {
                        const cnEl = document.createElement("span");
                        cnEl.className = "anima-chip-cn";
                        cnEl.textContent = cn;
                        chip.appendChild(cnEl);
                    }
                    if (typeof window.animaBindChipFlyout === "function") {
                        window.animaBindChipFlyout(chip, {
                            getWeight: function(){ var w = _gWeights[t]; return (w != null && isFinite(w)) ? w : 1; },
                            setWeight: function(nw){
                                nw = window.animaClampWeight ? window.animaClampWeight(nw) : nw;
                                if (nw == null || !isFinite(nw) || Math.abs(nw-1)<0.01) delete _gWeights[t];
                                else _gWeights[t] = nw;
                                lab.textContent = window.animaChipLabel ? window.animaChipLabel(t, _gWeights[t], _isMerged) : t;
                                syncG();
                            },
                            isHidden: function(){ return !!_gHidden[t]; },
                            onHide: function(){
                                if (_gHidden[t]) delete _gHidden[t];
                                else _gHidden[t] = true;
                                renderGChips();
                                syncG();
                            },
                            onDelete: function(){
                                _gTagList=_gTagList.filter((_,j)=>j!==i);
                                delete _gWeights[t];
                                delete _gHidden[t];
                                renderGChips();
                                syncG();
                            },
                            isMerged: function(){ return _isMerged; },
                            onUnmerge: _isMerged ? function(){
                                var parts = t.split("; ");
                                _gTagList.splice(i, 1);
                                for (var pi = parts.length-1; pi >= 0; pi--) _gTagList.splice(i, 0, parts[pi]);
                                renderGChips();
                                syncG();
                            } : null
                        });
                    }
                    chip.addEventListener("mousedown", function(e){
                        if (e.button !== 0) return;
                        if (!hidden) return;
                        if (typeof window.animaHiddenChipClickUnhide === "function") {
                            window.animaHiddenChipClickUnhide(e, function(){
                                if (_gHidden[t]) { delete _gHidden[t]; renderGChips(); syncG(); }
                            });
                        }
                    }, true);
                    gChips.appendChild(chip);
                }
                if (apiTags.length) {
                    if (window.__nbTransTimer) clearTimeout(window.__nbTransTimer);
                    window.__nbTransTimer = setTimeout(() => {
                        translateTags(apiTags, true).then(tl => {
                            Object.assign(_allTranslations, tl);
                            const chips = gChips.children;
                            for (let j = 0; j < Math.min(chips.length, _gTagList.length); j++) {
                                const tt = _gTagList[j];
                                if (_gHidden[tt]) continue;
                                const cn2 = tl[tt.replace(/ /g,"_")] || tl[tt] || "";
                                if (!cn2) continue;
                                let cnEl = chips[j].querySelector(".anima-chip-cn");
                                if (!cnEl) {
                                    cnEl = document.createElement("span");
                                    cnEl.className = "anima-chip-cn";
                                    chips[j].appendChild(cnEl);
                                }
                                cnEl.textContent = cn2;
                            }
                        }).catch(function(){});
                    }, 800);
                }
            }
            function addGTag(tag) {
                if (!tag) return;
                const clean = tag.replace(/ /g,"_");
                if (!_gTagList.includes(clean) && !_gTagList.includes(tag)) {
                    _gTagList.push(tag);
                    renderGChips(); syncG();
                }
            }
            function _makeGSortable() {
                if (!window.Sortable) return;
                if (gChips._sortable) gChips._sortable.destroy();
                var cheapSort = window.animaCheapFx && window.animaCheapFx();
                gChips._sortable = Sortable.create(gChips, {
                    animation: cheapSort ? 0 : 150,
                    swapAnimation: !cheapSort,
                    forceFallback: true,
                    fallbackOnBody: true,
                    fallbackTolerance: 4,
                    chosenClass: "apc-sortable-chosen",
                    ghostClass: "apc-sortable-ghost",
                    onStart: function(evt) {
                        window.__animaChipDragging = true;
                        if (window.animaKillChipFlyouts) window.animaKillChipFlyouts();
                        if (window.animaAttachChipDragGhost) window.animaAttachChipDragGhost(evt.item, evt.originalEvent);
                    },
                    onEnd: function(evt) {
                        window.__animaChipDragging = false;
                        if (window.animaDetachChipDragGhost) window.animaDetachChipDragGhost();
                        var moved = _gTagList.splice(evt.oldIndex, 1)[0];
                        _gTagList.splice(evt.newIndex, 0, moved);
                        renderGChips();
                        syncG();
                    }
                });
            }
            _makeGSortable();
            renderGChips();
            fetch("/danbooru_anima/tag_colors").then(function(r){ return r.json(); }).then(function(d){
                if (!d) return;
                for (var k in d) {
                    var rec = d[k];
                    if (rec && rec.c) _gTagColors[k] = rec.c;
                }
                renderGChips();
            }).catch(function(){});

            // 分类折叠
            const CATS = [
                ["body_features","🧬 身体特征","#e91e63"],["clothing","👗 服装","var(--anima-accent-soft)"],["pose","🧘 姿势","#e2c48a"],
                ["expression","😊 表情","var(--anima-accent-soft)"],["background","🌆 背景","#c4b3dc"],["accessories","💍 配饰","#e8b8a8"],
                ["other","🔖 其他","var(--anima-mute)"]
            ];
            
            const PRESETS = {
                body_features: ["blonde_hair","brown_hair","black_hair","white_hair","blue_hair","pink_hair","red_hair","green_hair","purple_hair","silver_hair","long_hair","short_hair","very_long_hair","medium_hair","twintails","ponytail","braid","bun","messy_hair","straight_hair","wavy_hair","curly_hair","ahoge","hair_bun","hair_ribbon","hair_ornament","drill_hair","hime_cut","bob_cut","twin_braids","blue_eyes","red_eyes","green_eyes","brown_eyes","purple_eyes","heterochromia","glasses","aqua_eyes","pink_eyes","yellow_eyes","orange_eyes","black_eyes","grey_eyes","closed_eyes","half-closed_eyes","eyelashes","thick_eyelashes",,"sunglasses",,"slit_pupils","cat_eyes","round_eyes","tsurime","tareme","sanpaku","one_eye_closed","no_eyebrows","thick_eyebrows","covered_eyes","pointy_ears","elf_ears","cat_ears","fox_ears","dog_ears","animal_ears","earrings","fangs","sharp_teeth","lips","lipstick","blush","freckles","mole","beauty_mark","scar","bandaid","bandage","eye_patch","horns","halo","tail","cat_tail","fox_tail","wings","tanned","dark_skin","pale_skin","muscular","skinny"],
                clothing: ["school_uniform","serafuku","dress","pleated_skirt","miniskirt","skirt","jeans","shorts","jacket","hoodie","t-shirt","crop_top","sweater","cardigan","blouse","shirt","camisole","leotard","bodysuit","swimsuit","bikini","kimono","china_dress","maid_uniform","apron","coat","cape","scarf","gloves","thighhighs"],
                pose: ["standing","sitting","lying","kneeling","squatting","looking_at_viewer","looking_back","looking_away","arms_up","arms_behind_back","arms_crossed","hands_on_hips","hands_in_pockets","saluting","waving","pointing","peace_sign","holding","grabbing","reaching_out","leaning_forward","fighting_pose","running","walking","jumping","floating","stretching","dancing","crouching","crossed_legs"],
                expression: ["smile","open_mouth","closed_eyes","blush","angry","sad","surprised","happy","embarrassed","laughing","crying","tears","pout","tongue_out","wink","seductive_smile","evil_smile","serious","nervous","determined","sleepy","tired","screaming","frowning","blank_eyes","half-closed_eyes","glaring","pensive","scared","grinning"],
                background: ["simple_background","white_background","gradient_background","grey_background","black_background","outdoors","indoors","cityscape","sky","night_sky","starry_sky","sunset","sunrise","rain","snow","underwater","space","school","classroom","bedroom","street","nature","forest","beach","ocean","mountain","river","field","park","rooftop"],
                accessories: ["glasses","sunglasses","necktie","ribbon","choker","necklace","bracelet","earrings","watch","ring","headphones","hat","beret","cap","crown","hair_ornament","hair_ribbon","hairband","hairpin","mask","bandage","eyepatch","bag","backpack","umbrella","sword","gun","shield","wings","tattoo"],
                other: ["from_above","from_below","from_behind","from_side","close-up","full_body","cowboy_shot","portrait","upper_body",,"dutch_angle","monochrome","sepia","bloom","lens_flare","depth_of_field","motion_lines","speed_lines","film_grain","bokeh","backlighting",,"sunlight","moonlight","candlelight","neon_lights","sparkle","glowing","light_particles","silhouette"]
            };
            const PRESET_THUMBS = {"blonde_hair":"/danbooru_anima/thumb/blonde_hair.jpg","brown_hair":"/danbooru_anima/thumb/brown_hair.jpg","sparkling_eyes":"/danbooru_anima/thumb/sparkling_eyes.jpg","battlesuit":"/danbooru_anima/thumb/battlesuit.jpg","two-tone_jumpsuit":"/danbooru_anima/thumb/two_tone_jumpsuit.jpg","black_hair":"/danbooru_anima/thumb/black_hair.jpg","white_hair":"/danbooru_anima/thumb/white_hair.jpg","blue_hair":"/danbooru_anima/thumb/blue_hair.jpg","pink_hair":"/danbooru_anima/thumb/pink_hair.jpg","red_hair":"/danbooru_anima/thumb/red_hair.jpg","green_hair":"/danbooru_anima/thumb/green_hair.jpg","purple_hair":"/danbooru_anima/thumb/purple_hair.jpg","silver_hair":"/danbooru_anima/thumb/silver_hair.jpg","long_hair":"/danbooru_anima/thumb/long_hair.jpg","short_hair":"/danbooru_anima/thumb/short_hair.jpg","very_long_hair":"/danbooru_anima/thumb/very_long_hair.jpg","medium_hair":"/danbooru_anima/thumb/medium_hair.jpg","twintails":"/danbooru_anima/thumb/twintails.jpg","ponytail":"/danbooru_anima/thumb/ponytail.jpg","high_ponytail":"/danbooru_anima/thumb/high_ponytail.jpg","braid":"/danbooru_anima/thumb/braid.jpg","bun":"/danbooru_anima/thumb/bun.jpg","side_ponytail":"/danbooru_anima/thumb/side_ponytail.jpg","messy_hair":"/danbooru_anima/thumb/messy_hair.jpg","straight_hair":"/danbooru_anima/thumb/straight_hair.jpg","wavy_hair":"/danbooru_anima/thumb/wavy_hair.jpg","eyes_in_shadow":"/danbooru_anima/thumb/eyes_in_shadow.jpg","ahoge":"/danbooru_anima/thumb/ahoge.jpg","hair_bun":"/danbooru_anima/thumb/hair_bun.jpg","drill_hair":"/danbooru_anima/thumb/drill_hair.jpg","hime_cut":"/danbooru_anima/thumb/hime_cut.jpg","bob_cut":"/danbooru_anima/thumb/bob_cut.jpg","twin_braids":"/danbooru_anima/thumb/twin_braids.jpg","aqua_eyes":"/danbooru_anima/thumb/aqua_eyes.jpg","pink_eyes":"/danbooru_anima/thumb/pink_eyes.jpg","jacket":"/danbooru_anima/thumb/jacket.jpg","hoodie":"/danbooru_anima/thumb/hoodie.jpg","t-shirt":"/danbooru_anima/thumb/t_shirt.jpg","yellow_eyes":"/danbooru_anima/thumb/yellow_eyes.jpg","orange_eyes":"/danbooru_anima/thumb/orange_eyes.jpg","black_eyes":"/danbooru_anima/thumb/black_eyes.jpg","grey_eyes":"/danbooru_anima/thumb/grey_eyes.jpg","closed_eyes":"/danbooru_anima/thumb/closed_eyes.jpg","half-closed_eyes":"/danbooru_anima/thumb/half_closed_eyes.jpg","eyelashes":"/danbooru_anima/thumb/eyelashes.jpg","thick_eyelashes":"/danbooru_anima/thumb/thick_eyelashes.jpg","cat_eyes":"/danbooru_anima/thumb/cat_eyes.jpg","round_eyes":"/danbooru_anima/thumb/round_eyes.jpg","covered_eyes":"/danbooru_anima/thumb/covered_eyes.jpg","one_eye_closed":"/danbooru_anima/thumb/one_eye_closed.jpg","dog_ears":"/danbooru_anima/thumb/dog_ears.jpg","animal_ears":"/danbooru_anima/thumb/animal_ears.jpg","no_eyebrows":"/danbooru_anima/thumb/no_eyebrows.jpg","thick_eyebrows":"/danbooru_anima/thumb/thick_eyebrows.jpg","pointy_ears":"/danbooru_anima/thumb/pointy_ears.jpg","elf_ears":"/danbooru_anima/thumb/elf_ears.jpg","cat_ears":"/danbooru_anima/thumb/cat_ears.jpg","fox_ears":"/danbooru_anima/thumb/fox_ears.jpg","fangs":"/danbooru_anima/thumb/fangs.jpg","sharp_teeth":"/danbooru_anima/thumb/sharp_teeth.jpg","lips":"/danbooru_anima/thumb/lips.jpg","lipstick":"/danbooru_anima/thumb/lipstick.jpg","blush":"/danbooru_anima/thumb/blush.jpg","mole":"/danbooru_anima/thumb/mole.jpg","beauty_mark":"/danbooru_anima/thumb/beauty_mark.jpg","scar":"/danbooru_anima/thumb/scar.jpg","bandaid":"/danbooru_anima/thumb/bandaid.jpg","bandage":"/danbooru_anima/thumb/bandage.jpg","eye_patch":"/danbooru_anima/thumb/eye_patch.jpg","horns":"/danbooru_anima/thumb/horns.jpg","halo":"/danbooru_anima/thumb/halo.jpg","tail":"/danbooru_anima/thumb/tail.jpg","cat_tail":"/danbooru_anima/thumb/cat_tail.jpg","fox_tail":"/danbooru_anima/thumb/fox_tail.jpg","wings":"/danbooru_anima/thumb/wings.jpg","school_uniform":"/danbooru_anima/thumb/school_uniform.jpg","serafuku":"/danbooru_anima/thumb/serafuku.jpg","dress":"/danbooru_anima/thumb/dress.jpg","pleated_skirt":"/danbooru_anima/thumb/pleated_skirt.jpg","miniskirt":"/danbooru_anima/thumb/miniskirt.jpg","skirt":"/danbooru_anima/thumb/skirt.jpg","jeans":"/danbooru_anima/thumb/jeans.jpg","shorts":"/danbooru_anima/thumb/shorts.jpg","crop_top":"/danbooru_anima/thumb/crop_top.jpg","sweater":"/danbooru_anima/thumb/sweater.jpg","cardigan":"/danbooru_anima/thumb/cardigan.jpg","blouse":"/danbooru_anima/thumb/blouse.jpg","shirt":"/danbooru_anima/thumb/shirt.jpg","camisole":"/danbooru_anima/thumb/camisole.jpg","leotard":"/danbooru_anima/thumb/leotard.jpg","bodysuit":"/danbooru_anima/thumb/bodysuit.jpg","swimsuit":"/danbooru_anima/thumb/swimsuit.jpg","bikini":"/danbooru_anima/thumb/bikini.jpg","kimono":"/danbooru_anima/thumb/kimono.jpg","china_dress":"/danbooru_anima/thumb/china_dress.jpg","maid_uniform":"/danbooru_anima/thumb/maid_uniform.jpg","apron":"/danbooru_anima/thumb/apron.jpg","coat":"/danbooru_anima/thumb/coat.jpg","cape":"/danbooru_anima/thumb/cape.jpg","thighhighs":"/danbooru_anima/thumb/thighhighs.jpg","standing":"/danbooru_anima/thumb/standing.jpg","sitting":"/danbooru_anima/thumb/sitting.jpg","lying":"/danbooru_anima/thumb/lying.jpg","kneeling":"/danbooru_anima/thumb/kneeling.jpg","squatting":"/danbooru_anima/thumb/squatting.jpg","looking_at_viewer":"/danbooru_anima/thumb/looking_at_viewer.jpg","looking_back":"/danbooru_anima/thumb/looking_back.jpg","looking_away":"/danbooru_anima/thumb/looking_away.jpg","arms_up":"/danbooru_anima/thumb/arms_up.jpg","arms_behind_back":"/danbooru_anima/thumb/arms_behind_back.jpg","arms_crossed":"/danbooru_anima/thumb/arms_crossed.jpg","hands_on_hips":"/danbooru_anima/thumb/hands_on_hips.jpg","hands_in_pockets":"/danbooru_anima/thumb/hands_in_pockets.jpg","saluting":"/danbooru_anima/thumb/saluting.jpg","waving":"/danbooru_anima/thumb/waving.jpg","pointing":"/danbooru_anima/thumb/pointing.jpg","peace_sign":"/danbooru_anima/thumb/peace_sign.jpg","holding":"/danbooru_anima/thumb/holding.jpg","reaching_out":"/danbooru_anima/thumb/reaching_out.jpg","leaning_forward":"/danbooru_anima/thumb/leaning_forward.jpg","fighting_pose":"/danbooru_anima/thumb/fighting_pose.jpg","running":"/danbooru_anima/thumb/running.jpg","walking":"/danbooru_anima/thumb/walking.jpg","jumping":"/danbooru_anima/thumb/jumping.jpg","floating":"/danbooru_anima/thumb/floating.jpg","stretching":"/danbooru_anima/thumb/stretching.jpg","dancing":"/danbooru_anima/thumb/dancing.jpg","crouching":"/danbooru_anima/thumb/crouching.jpg","crossed_legs":"/danbooru_anima/thumb/crossed_legs.jpg","smile":"/danbooru_anima/thumb/smile.jpg","open_mouth":"/danbooru_anima/thumb/open_mouth.jpg","angry":"/danbooru_anima/thumb/angry.jpg","sad":"/danbooru_anima/thumb/sad.jpg","surprised":"/danbooru_anima/thumb/surprised.jpg","happy":"/danbooru_anima/thumb/happy.jpg","embarrassed":"/danbooru_anima/thumb/embarrassed.jpg","laughing":"/danbooru_anima/thumb/laughing.jpg","crying":"/danbooru_anima/thumb/crying.jpg","tears":"/danbooru_anima/thumb/tears.jpg","pout":"/danbooru_anima/thumb/pout.jpg","tongue_out":"/danbooru_anima/thumb/tongue_out.jpg","wink":"/danbooru_anima/thumb/wink.jpg","seductive_smile":"/danbooru_anima/thumb/seductive_smile.jpg","evil_smile":"/danbooru_anima/thumb/evil_smile.jpg","serious":"/danbooru_anima/thumb/serious.jpg","nervous":"/danbooru_anima/thumb/nervous.jpg","determined":"/danbooru_anima/thumb/determined.jpg","sleepy":"/danbooru_anima/thumb/sleepy.jpg","tired":"/danbooru_anima/thumb/tired.jpg","screaming":"/danbooru_anima/thumb/screaming.jpg","frowning":"/danbooru_anima/thumb/frowning.jpg","blank_eyes":"/danbooru_anima/thumb/blank_eyes.jpg","glaring":"/danbooru_anima/thumb/glaring.jpg","pensive":"/danbooru_anima/thumb/pensive.jpg","scared":"/danbooru_anima/thumb/scared.jpg","grinning":"/danbooru_anima/thumb/grinning.jpg","simple_background":"/danbooru_anima/thumb/simple_background.jpg","white_background":"/danbooru_anima/thumb/white_background.jpg","gradient_background":"/danbooru_anima/thumb/gradient_background.jpg","grey_background":"/danbooru_anima/thumb/grey_background.jpg","black_background":"/danbooru_anima/thumb/black_background.jpg","outdoors":"/danbooru_anima/thumb/outdoors.jpg","indoors":"/danbooru_anima/thumb/indoors.jpg","cityscape":"/danbooru_anima/thumb/cityscape.jpg","sky":"/danbooru_anima/thumb/sky.jpg","night_sky":"/danbooru_anima/thumb/night_sky.jpg","starry_sky":"/danbooru_anima/thumb/starry_sky.jpg","sunset":"/danbooru_anima/thumb/sunset.jpg","sunrise":"/danbooru_anima/thumb/sunrise.jpg","rain":"/danbooru_anima/thumb/rain.jpg","snow":"/danbooru_anima/thumb/snow.jpg","underwater":"/danbooru_anima/thumb/underwater.jpg","space":"/danbooru_anima/thumb/space.jpg","school":"/danbooru_anima/thumb/school.jpg","classroom":"/danbooru_anima/thumb/classroom.jpg","bedroom":"/danbooru_anima/thumb/bedroom.jpg","street":"/danbooru_anima/thumb/street.jpg","nature":"/danbooru_anima/thumb/nature.jpg","forest":"/danbooru_anima/thumb/forest.jpg","beach":"/danbooru_anima/thumb/beach.jpg","ocean":"/danbooru_anima/thumb/ocean.jpg","mountain":"/danbooru_anima/thumb/mountain.jpg","river":"/danbooru_anima/thumb/river.jpg","field":"/danbooru_anima/thumb/field.jpg","park":"/danbooru_anima/thumb/park.jpg","rooftop":"/danbooru_anima/thumb/rooftop.jpg","glasses":"/danbooru_anima/thumb/glasses.jpg","sunglasses":"/danbooru_anima/thumb/sunglasses.jpg","necktie":"/danbooru_anima/thumb/necktie.jpg","ribbon":"/danbooru_anima/thumb/ribbon.jpg","choker":"/danbooru_anima/thumb/choker.jpg","necklace":"/danbooru_anima/thumb/necklace.jpg","bracelet":"/danbooru_anima/thumb/bracelet.jpg","earrings":"/danbooru_anima/thumb/earrings.jpg","watch":"/danbooru_anima/thumb/watch.jpg","ring":"/danbooru_anima/thumb/ring.jpg","headphones":"/danbooru_anima/thumb/headphones.jpg","hat":"/danbooru_anima/thumb/hat.jpg","beret":"/danbooru_anima/thumb/beret.jpg","cap":"/danbooru_anima/thumb/cap.jpg","crown":"/danbooru_anima/thumb/crown.jpg","hair_ornament":"/danbooru_anima/thumb/hair_ornament.jpg","hair_ribbon":"/danbooru_anima/thumb/hair_ribbon.jpg","mask":"/danbooru_anima/thumb/mask.jpg","eyepatch":"/danbooru_anima/thumb/eyepatch.jpg","bag":"/danbooru_anima/thumb/bag.jpg","backpack":"/danbooru_anima/thumb/backpack.jpg","umbrella":"/danbooru_anima/thumb/umbrella.jpg","sword":"/danbooru_anima/thumb/sword.jpg","gun":"/danbooru_anima/thumb/gun.jpg","shield":"/danbooru_anima/thumb/shield.jpg","tattoo":"/danbooru_anima/thumb/tattoo.jpg","from_above":"/danbooru_anima/thumb/from_above.jpg","from_below":"/danbooru_anima/thumb/from_below.jpg","from_behind":"/danbooru_anima/thumb/from_behind.jpg","from_side":"/danbooru_anima/thumb/from_side.jpg","close-up":"/danbooru_anima/thumb/close_up.jpg","full_body":"/danbooru_anima/thumb/full_body.jpg","cowboy_shot":"/danbooru_anima/thumb/cowboy_shot.jpg","portrait":"/danbooru_anima/thumb/portrait.jpg","upper_body":"/danbooru_anima/thumb/upper_body.jpg","dutch_angle":"/danbooru_anima/thumb/dutch_angle.jpg","monochrome":"/danbooru_anima/thumb/monochrome.jpg","lens_flare":"/danbooru_anima/thumb/lens_flare.jpg","depth_of_field":"/danbooru_anima/thumb/depth_of_field.jpg","motion_lines":"/danbooru_anima/thumb/motion_lines.jpg","speed_lines":"/danbooru_anima/thumb/speed_lines.jpg","film_grain":"/danbooru_anima/thumb/film_grain.jpg","bokeh":"/danbooru_anima/thumb/bokeh.jpg","backlighting":"/danbooru_anima/thumb/backlighting.jpg","sunlight":"/danbooru_anima/thumb/sunlight.jpg","candlelight":"/danbooru_anima/thumb/candlelight.jpg","neon_lights":"/danbooru_anima/thumb/neon_lights.jpg","sparkle":"/danbooru_anima/thumb/sparkle.jpg","glowing":"/danbooru_anima/thumb/glowing.jpg","light_particles":"/danbooru_anima/thumb/light_particles.jpg","silhouette":"/danbooru_anima/thumb/silhouette.jpg","purple_eyes":"/danbooru_anima/thumb/purple_eyes.jpg","brown_eyes":"/danbooru_anima/thumb/brown_eyes.jpg","blue_pupils":"/danbooru_anima/thumb/blue_pupils.jpg","tsurime":"/danbooru_anima/thumb/tsurime.jpg","heterochromia":"/danbooru_anima/thumb/heterochromia.jpg","hairpin":"/danbooru_anima/thumb/hairpin.jpg","slit_pupils":"/danbooru_anima/thumb/slit_pupils.jpg","tanned":"/danbooru_anima/thumb/tanned.jpg","muscular":"/danbooru_anima/thumb/muscular.jpg","green_eyes":"/danbooru_anima/thumb/green_eyes.jpg","blue_eyes":"/danbooru_anima/thumb/blue_eyes.jpg","pale_skin":"/danbooru_anima/thumb/pale_skin.jpg","red_eyes":"/danbooru_anima/thumb/red_eyes.jpg","hairband":"/danbooru_anima/thumb/hairband.jpg","freckles":"/danbooru_anima/thumb/freckles.jpg","grabbing":"/danbooru_anima/thumb/grabbing.jpg","curly_hair":"/danbooru_anima/thumb/curly_hair.jpg","dark_skin":"/danbooru_anima/thumb/dark_skin.jpg","moonlight":"/danbooru_anima/thumb/moonlight.jpg","scarf":"/danbooru_anima/thumb/scarf.jpg","sepia":"/danbooru_anima/thumb/sepia.jpg","sanpaku":"/danbooru_anima/thumb/sanpaku.jpg","tareme":"/danbooru_anima/thumb/tareme.jpg","gloves":"/danbooru_anima/thumb/gloves.jpg","bloom":"/danbooru_anima/thumb/bloom.jpg","skinny":"/danbooru_anima/thumb/skinny.jpg","close_up":"/danbooru_anima/thumb/close_up.jpg","half_closed_eyes":"/danbooru_anima/thumb/half_closed_eyes.jpg","two_tone_jumpsuit":"/danbooru_anima/thumb/two_tone_jumpsuit.jpg","t_shirt":"/danbooru_anima/thumb/t_shirt.jpg"};
            const PRESET_TRANSLATIONS = {"blonde_hair":"\u91d1\u8272\u5934\u53d1","brown_hair":"\u68d5\u8272\u5934\u53d1","black_hair":"\u9ed1\u5934\u53d1","white_hair":"\u94f6\u53d1","blue_hair":"\u84dd\u8272\u5934\u53d1","pink_hair":"\u7c89\u8272\u5934\u53d1","red_hair":"\u7ea2\u5934\u53d1","green_hair":"\u7eff\u53d1","purple_hair":"\u7d2b\u53d1","grey_hair":"\u7070\u53d1","orange_hair":"\u6a59\u53d1","long_hair":"\u957f\u5934\u53d1","short_hair":"\u77ed\u5934\u53d1","very_long_hair":"\u6781\u957f\u53d1","medium_hair":"\u4e2d\u53d1","twintails":"\u53cc\u5c3e","ponytail":"\u9a6c\u5c3e\u8fab","braid":"\u53d1\u8fab","side_ponytail":"\u4fa7\u9a6c\u5c3e","messy_hair":"\u51cc\u4e71\u53d1\u578b","straight_hair":"\u76f4\u53d1","wavy_hair":"\u6ce2\u6d6a\u53d1","curly_hair":"\u5377\u66f2\u5934\u53d1","ahoge":"\u5446\u6bdb","blunt_bangs":"\u9f50\u5218\u6d77","asymmetrical_bangs":"\u4e0d\u5bf9\u79f0\u5218\u6d77","swept_bangs":"\u504f\u5206\u5218\u6d77","school_uniform":"\u5b66\u751f\u670d","serafuku":"\u65e5\u5f0f\u5236\u670d","dress":"\u8fde\u8863\u88d9","pleated_skirt":"\u767e\u8936\u88d9","miniskirt":"\u8ff7\u4f60\u88d9","skirt":"\u88d9\u88c5","jeans":"\u725b\u4ed4\u88e4","shorts":"\u70ed\u88e4","jacket":"\u5939\u514b","hoodie":"\u5957\u5934\u886b","t-shirt":"T\u6064","crop_top":"\u9732\u8110\u77ed\u886b","sweater":"\u9488\u7ec7\u886b","cardigan":"\u5f00\u895f\u886b","blouse":"\u5973\u5f0f\u886c\u886b","shirt":"\u886c\u8863","camisole":"\u540a\u5e26\u80cc\u5fc3","leotard":"\u83b1\u5965\u5854\u670d","bodysuit":"\u8fde\u4f53\u7d27\u8eab\u8863","swimsuit":"\u6cf3\u670d","bikini":"\u6bd4\u57fa\u5c3c","one-piece_swimsuit":"\u8fde\u4f53\u6cf3\u8863","school_swimsuit":"\u5b66\u6821\u6cf3\u8863","armor":"\u94e0\u7532","kimono":"\u548c\u670d","yukata":"\u6d74\u8863","china_dress":"\u65d7\u888d","standing":"\u7ad9\u7740","sitting":"\u5750\u7740","lying":"\u5e73\u8eba","kneeling":"\u8dea\u5750","squatting":"\u8e72\u4e0b","looking_at_viewer":"\u770b\u5411\u89c2\u4f17","looking_back":"\u56de\u5934\u770b","looking_away":"\u56de\u907f\u89c6\u7ebf","looking_up":"\u4ef0\u89c6","looking_down":"\u5411\u4e0b\u770b","arms_up":"\u53cc\u624b\u9ad8\u4e3e","arms_behind_back":"\u53cc\u624b\u80cc\u5728\u8eab\u540e","hands_in_pockets":"\u53cc\u624b\u63d2\u888b","waving":"\u6325\u624b\u52a8\u4f5c","pointing":"\u6307\u7740","thumbs_up":"\u5927\u62c7\u6307\u70b9\u8d5e","holding":"\u62ff\u63e1","grabbing":"\u63e1","leaning_forward":"\u524d\u503e","leaning_back":"\u5411\u540e\u503e\u659c","running":"\u75be\u8d70","walking":"\u6b65\u884c","jumping":"\u8e66\u8df3","smile":"\u5fae\u7b11","open_mouth":"\u5f20\u5634","closed_eyes":"\u95ed\u76ee","blush":"\u8138\u7ea2","angry":"\u751f\u6c14","sad":"\u60b2\u4f24","surprised":"\u60ca\u8bb6","happy":"\u5f00\u5fc3","embarrassed":"\u5c34\u5c2c","laughing":"\u5927\u7b11","crying":"\u54ed\u6ce3","tears":"\u6d41\u6cea","pout":"\u5658\u5634","tongue_out":"\u5410\u820c","tongue":"\u5634\u90e8","seductive_smile":"\u9b45\u60d1\u5fae\u7b11","evil_smile":"\u90aa\u6076\u5fae\u7b11","forced_smile":"\u5f3a\u989c\u6b22\u7b11","serious":"\u4e25\u8083","nervous":"\u7d27\u5f20","determined":"\u575a\u5b9a","sleepy":"\u56f0\u5026","yawning":"\u6253\u54c8\u6b20","screaming":"\u5c16\u53eb","shouting":"\u558a\u53eb","blank_eyes":"\u773c\u795e\u7a7a\u6d1e","half-closed_eyes":"\u534a\u95ed\u773c","simple_background":"\u7b80\u5355\u80cc\u666f","white_background":"\u767d\u8272\u80cc\u666f","gradient_background":"\u6e10\u53d8\u80cc\u666f","grey_background":"\u7070\u8272\u80cc\u666f","black_background":"\u9ed1\u8272\u80cc\u666f","blue_background":"\u84dd\u8272\u80cc\u666f","outdoors":"\u5ba4\u5916","indoors":"\u5ba4\u5185","cityscape":"\u57ce\u5e02\u666f\u89c2","sky":"\u4e91\u7a7a","starry_sky":"\u591c\u7a7a","sunset":"\u65e5\u843d","sunrise":"\u666f\u8272","rain":"\u4e0b\u96e8","snow":"\u96ea","underwater":"\u6d77\u5e95","space":"\u592a\u7a7a\u73af\u5883","school":"\u5b66\u6821","classroom":"\u6559\u5ba4","bedroom":"\u5367\u5ba4","living_room":"\u5ba2\u5385","bathroom":"\u6d74\u5ba4","street":"\u8857\u666f","alley":"\u5c0f\u5df7","nature":"\u98ce\u666f","forest":"\u68ee\u6797","beach":"\u6d77\u6ee9","ocean":"\u6d77","glasses":"\u773c\u955c","sunglasses":"\u592a\u9633\u955c","necktie":"\u9886\u5e26","bowtie":"\u8776\u5f62\u9886\u7ed3","ribbon":"\u4e1d\u5e26","choker":"\u9879\u5708","necklace":"\u9879\u94fe","bracelet":"\u624b\u956f","earrings":"\u8033\u73af","watch":"\u624b\u8868","ring":"\u6212\u6307","headphones":"\u8033\u673a","hat":"\u5e3d\u5b50","beret":"\u8d1d\u96f7\u5e3d","crown":"\u738b\u51a0","hair_ornament":"\u53d1\u9970","hair_ribbon":"\u53d1\u5e26","hairband":"\u53d1\u5e26","hairpin":"\u53d1\u5939","hair_bun":"\u53d1\u9afb","mask":"\u9762\u5177","eyepatch":"\u773c\u7f69","bag":"\u5305","backpack":"\u80cc\u5305","handbag":"\u624b\u63d0\u5305","umbrella":"\u4f1e","weapon":"\u5175\u5668","sword":"\u5251","from_above":"\u4e0a\u65b9\u89c6\u89d2","from_below":"\u4ef0\u89c6\u89c6\u89d2","from_behind":"\u80cc\u540e\u89c6\u89d2","from_side":"\u4fa7\u9762\u89c6\u89d2","close-up":"\u8fd1\u666f","full_body":"\u5168\u8eab\u50cf","cowboy_shot":"\u4e2d\u666f","portrait":"\u534a\u8eab\u50cf","upper_body":"\u4e0a\u8eab","lower_body":"\u4e0b\u534a\u8eab","head_only":"\u53ea\u6709\u5934\u90e8","dutch_angle":"\u503e\u659c\u6784\u56fe","monochrome":"\u5355\u4e00\u8272\u8c03","sepia":"\u6df1\u8910\u8272","bloom":"\u5f00\u82b1","lens_flare":"\u955c\u5934\u5149\u6655","depth_of_field":"\u666f\u6df1","motion_lines":"\u52a8\u6001\u7ebf\u6761","speed_lines":"\u52a8\u6001\u7ebf","chromatic_aberration":"\u955c\u5934\u6548\u679c","film_grain":"\u80f6\u7247\u9897\u7c92","bokeh":"\u80cc\u666f\u865a\u5316","backlighting":"\u9006\u5149","sunlight":"\u65e5\u5149","moonlight":"\u591c\u665a","blue_eyes":"\u84dd\u8272\u773c\u7738","red_eyes":"\u7ea2\u77b3","green_eyes":"\u7eff\u8272\u773c\u775b","brown_eyes":"\u68d5\u8272\u773c\u775b","yellow_eyes":"\u9ec4\u773c\u775b","purple_eyes":"\u7d2b\u773c\u775b","pink_eyes":"\u7c89\u8272\u773c\u775b","grey_eyes":"\u7070\u8272\u773c\u775b","aqua_eyes":"\u9752\u77b3","heterochromia":"\u5f02\u8272\u77b3","freckles":"\u6591\u70b9","mole":"\u76ae\u80a4\u6591\u70b9","dark_skin":"\u9ed1\u8089","pale_skin":"\u8272\u767d","tan":"\u6652\u9ed1\u7ebf","fang":"\u864e\u7259","sharp_teeth":"\u5c16\u7259","animal_ears":"\u517d\u65cf\u8033","cat_ears":"\u732b\u8033","fox_ears":"\u72d0\u8033","dog_ears":"\u72ac\u8033","horns":"\u5934\u89d2","wings":"\u5929\u4f7f\u7ffc","halo":"\u5723\u6d01","tail":"\u517d\u5c3e","cat_tail":"\u732b\u5c3e","fox_tail":"\u72d0\u72f8\u5c3e\u5df4","multicolored_hair":"\u5f69\u53d1","gradient_hair":"\u6e10\u53d8\u5934\u53d1","hair_between_eyes":"\u53d1\u4e1d\u5782\u5728\u773c\u775b\u4e4b\u95f4","hair_over_one_eye":"\u5355\u773c\u906e\u76d6","thick_eyebrows":"\u6d53\u7709","makeup":"\u7f8e\u5986","parted_lips":"\u5fae\u5f20\u7684\u5634\u5507","piercing":"\u6027\u7269\u54c1","skin_fang":"\u864e\u7259","chibi":"Q\u7248","silver_hair":"\u94f6\u53d1","bun":"\u53d1\u9afb","bangs":"\u5218\u6d77","beauty_mark":"\u7f8e\u4eba\u75e3","veiny":"\u591a\u7b4b\u7684","meganekko":"\u6885\u6839\u5c3c\u514b","dutch_angle_closeup":"dutch_angle_closeup","floating":"\u6f02\u6d6e","falling":"\u5760\u843d","stretching":"\u62c9\u4f38","spread_arms":"\u5f20\u5f00\u53cc\u81c2","dancing":"\u8df3\u821e","on_bed":"\u5728\u5e8a\u4e0a","on_floor":"\u5728\u5730\u677f\u4e0a","against_wall":"\u9760\u5899","on_grass":"\u8349\u5730\u4e0a","crossed_legs":"\u4ea4\u53c9\u53cc\u817f","hanging":"\u540a\u6302","climbing":"\u6500\u722c","splashing":"\u98de\u6e85","praying":"\u53cc\u624b\u5408\u5341","arms_crossed":"\u53cc\u81c2\u4ea4\u53c9","hands_on_hips":"\u53cc\u624b\u53c9\u8170","hands_clasped":"\u53cc\u624b\u5408\u63e1","saluting":"\u656c\u793c","peace_sign":"\u548c\u5e73\u624b\u52bf","reaching_out":"\u4f38\u624b","fighting_pose":"\u6218\u6597\u59ff\u52bf","crouching":"\u8e72\u4f0f","hand_on_chin":"\u624b\u6258\u4e0b\u5df4","hand_to_mouth":"\u624b\u6342\u5634","looking_over_shoulder":"\u56de\u5934\u671b","upside_down":"\u5012\u7acb","gloves":"\u624b\u5957","drill_hair":"\u94bb\u5934\u53d1","hime_cut":"\u59ec\u53d1\u5f0f","bob_cut":"\u6ce2\u6ce2\u5934","twin_braids":"\u53cc\u53d1\u8fab","orange_eyes":"\u6a59\u8272\u773c\u775b","black_eyes":"\u9ed1\u77b3","eyelashes":"\u773c\u90e8","thick_eyelashes":"\u6d53\u5bc6\u776b\u6bdb","slit_pupils":"slit_upils","tsurime":"tsurime","tareme":"\u5854\u96f7\u59c6","sanpaku":"\u6851\u5e15\u5e93","one_eye_closed":"\u5355\u773c\u95ed\u5408","no_eyebrows":"\u65e0\u7709\u6bdb","covered_eyes":"\u773c\u775b\u88ab\u906e","pointy_ears":"\u5c16\u8033","fangs":"\u5c16\u7259","lips":"\u5507\u90e8","lipstick":"\u53e3\u7ea2","scar":"\u75a4\u75d5","bandaid":"\u521b\u53ef\u8d34","muscular":"\u7b4b\u8089","skinny":"\u83ef\u5962","eyes_in_shadow":"\u9634\u5f71\u4e2d\u7684\u773c\u775b","apron":"\u5bb6\u5c45\u670d","coat":"\u957f\u8863","cape":"\u6597\u7bf7","thighhighs":"\u957f\u7b52\u889c","maid_uniform":"\u5973\u4ec6\u88c5","bandage":"\u7ef7\u5e26","contacts":"\u8054\u7cfb\u4eba","dark_sclera":"dark_screra","cat_eyes":"\u732b\u773c","round_eyes":"\u5706\u5f62\u773c\u775b","elf_ears":"\u7cbe\u7075\u8033","eye_patch":"\u773c\u7f69","tanned":"\u6652\u9ed1\u7684","mole_under_eye":"\u773c\u4e0b\u75e3","hairclip":"\u53d1\u5939","shimokitazawa_high_school_uniform":"shimokitazawa_\u9ad8\u4e2d_\u5b66\u6821","white_shirt":"\u767d\u886c\u886b","collared_shirt":"\u6709\u9886\u886c\u886b","long_sleeves":"\u957f\u8896","glaring":"\u6012\u89c6","pensive":"\u6c89\u601d","scared":"\u5bb3\u6015","wink":"\u7728\u773c","tired":"\u75b2\u5026","frowning":"\u76b1\u7709","grinning":"\u9732\u9f7f\u7b11","mountain":"\u5c71","river":"\u6c5f\u6cb3","field":"\u539f\u91ce","park":"\u516c\u56ed","rooftop":"\u5c4b\u9876\u573a\u666f","gun":"\u67aa","shield":"\u76fe\u724c","tattoo":"\u7eb9\u8eab","cap":"\u5e3d\u5b50","candlelight":"\u70db\u5149","neon_lights":"\u9713\u8679\u706f","sparkle":"\u95ea\u70c1","glowing":"\u8f89\u5149","light_particles":"\u5149\u5f71\u7c92\u5b50","silhouette":"\u8f6e\u5ed3","dynamic_angle":"\u52a8\u6001\u89d2\u5ea6","rim_lighting":"\u8fb9\u7f18\u5149"};
            const PRESET_SUBCATS = {"clothing":[["custom_tops","\u4e0a\u8863",""],["custom_bottoms","\u4e0b\u8863",""],["custom_suit","\u5957\u88c5",""]],"other":[["custom_view","\u89c6\u89d2",""],["custom_style","\u98ce\u683c",""],["custom_fx","\u753b\u9762\u6548\u679c",""]]};
            const PRESET_SUBASSIGN = {"body_features":{"school_uniform":"custom_suit","serafuku":"custom_suit","dress":"custom_suit","pleated_skirt":"custom_bottoms","miniskirt":"custom_bottoms","skirt":"custom_bottoms","jeans":"custom_bottoms","shorts":"custom_bottoms","leotard":"custom_suit","bodysuit":"custom_suit","swimsuit":"custom_suit","bikini":"custom_suit","kimono":"custom_suit","china_dress":"custom_suit","maid_uniform":"custom_suit","apron":"custom_suit","coat":"custom_tops","cape":"custom_tops","scarf":"other","thighhighs":"custom_bottoms","hoodie":"custom_tops","t-shirt":"custom_tops","crop_top":"custom_tops","jacket":"custom_tops","cardigan":"custom_tops","sweater":"custom_tops","blouse":"custom_tops","shirt":"custom_tops","camisole":"custom_tops","one_eye_closed":"eyes","from_above":"custom_view","from_below":"custom_view","from_behind":"custom_view","from_side":"custom_view","close-up":"custom_view","full_body":"custom_view","cowboy_shot":"custom_view","portrait":"custom_view","upper_body":"custom_view","dutch_angle":"custom_view","monochrome":"custom_style","depth_of_field":"custom_fx","lens_flare":"custom_fx","motion_lines":"custom_fx","speed_lines":"custom_fx","film_grain":"custom_fx","bokeh":"custom_fx","backlighting":"custom_fx","sunlight":"custom_fx","moonlight":"custom_fx","candlelight":"custom_fx","neon_lights":"custom_fx","sparkle":"custom_fx","glowing":"custom_fx","light_particles":"custom_fx","silhouette":"custom_fx","purple_eyes":"eyes","brown_eyes":"eyes","blue_pupils":"eyes"}};

            function showTagPopup(ck2, cl2, col) {
                        if (!_customPresets[ck2]) _customPresets[ck2] = [];
                        // 缩略图数据层
                        let _thumbs2 = {};
                        let _removed2 = {};
                        try { _thumbs2 = JSON.parse(localStorage.getItem("apc_tag_thumbs")||"{}"); } catch(e) {}
                        try { _removed2 = JSON.parse(localStorage.getItem("apc_tag_removed")||"{}"); } catch(e) {}
                        // 迁移旧 URL 格式
                        var _migrated = false;
                        for (var _k in _thumbs2) {
                            var _v = _thumbs2[_k];
                            if (typeof _v === "string" && _v.indexOf("/extensions/ComfyUI-Danbooru-Anima-Prompt/thumbs/") >= 0) {
                                _thumbs2[_k] = _v.replace(/\/extensions\/ComfyUI-Danbooru-Anima-Prompt\/thumbs\//g, "/danbooru_anima/thumb/");
                                _migrated = true;
                            }
                        }
                        if (_migrated) { try { localStorage.setItem("apc_tag_thumbs", JSON.stringify(_thumbs2)); } catch(e) {} }
                        // 首次加载：合并预置缩略图
                        // 合并预置缩略图（自动补缺）
                        var _seedCount = 0;
                        for (var _pk in PRESET_THUMBS) { if (!(_pk in _thumbs2)) { _thumbs2[_pk] = PRESET_THUMBS[_pk]; _seedCount++; } }
                        if (_seedCount > 0) { try { localStorage.setItem("apc_tag_thumbs", JSON.stringify(_thumbs2)); } catch(e) {} }
                        function saveThumbs2() { try { localStorage.setItem("apc_tag_thumbs", JSON.stringify(_thumbs2)); localStorage.setItem("apc_tag_removed", JSON.stringify(_removed2)); syncUserData(); } catch(e) {} }
                         // tag → cn
                        const bx2 = document.createElement("div");
                        bx2.style.cssText = "position:fixed;top:15%;left:15%;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid rgba(var(--anima-accent-rgb),.45);border-radius:24px;padding:20px;width:600px;max-height:78vh;display:flex;flex-direction:column;box-shadow:0 25px 50px -12px rgba(0,0,0,0.7);z-index:99999;resize:both;overflow:auto;";
                        // 恢复上次拖拽大小
                        try { var _popSize = JSON.parse(localStorage.getItem("apc_popup_size")||"{}"); if (_popSize.w) bx2.style.width = _popSize.w+"px"; if (_popSize.h) bx2.style.height = _popSize.h+"px"; } catch(e) {}
                        // 恢复上次位置
                        try { var _popPos = JSON.parse(localStorage.getItem("apc_popup_pos")||"{}"); if (_popPos.left) bx2.style.left = _popPos.left+"px"; if (_popPos.top) bx2.style.top = _popPos.top+"px"; } catch(e) {}
                        // 监听 resize 保存大小
                        if (typeof ResizeObserver !== "undefined") {
                            var _ro2 = new ResizeObserver(function() {
                                try { localStorage.setItem("apc_popup_size", JSON.stringify({w: parseInt(bx2.style.width)||bx2.offsetWidth, h: parseInt(bx2.style.height)||bx2.offsetHeight})); } catch(e) {}
                                try { localStorage.setItem("apc_popup_pos", JSON.stringify({left: parseInt(bx2.style.left)||bx2.offsetLeft, top: parseInt(bx2.style.top)||bx2.offsetTop})); } catch(e) {}
                            });
                            _ro2.observe(bx2);
                        }
                        const hdr2 = document.createElement("div");
                        hdr2.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-shrink:0;cursor:grab;user-select:none;";
                        hdr2.innerHTML = '<span style="color:'+col+';font-weight:700;font-size:15px;">'+cl2+' - 标签管理</span>';
                        const cls2 = document.createElement("button");
                        cls2.textContent = animaTxt("关闭"); cls2.style.cssText = "background:transparent;border:none;color:#ccc;padding:6px 14px;cursor:pointer;font-size:13px;border-radius:8px;";
                        cls2.onmouseover = () => cls2.style.background="rgba(255,255,255,0.08)"; cls2.onmouseout = () => cls2.style.background="transparent";
                        cls2.onclick = () => bx2.remove(); hdr2.appendChild(cls2); bx2.appendChild(hdr2);
                        let _drg=false,_dx=0,_dy=0;
                        hdr2.onmousedown=(e)=>{_drg=true;_dx=e.clientX-bx2.offsetLeft;_dy=e.clientY-bx2.offsetTop;e.preventDefault();};
                        document.addEventListener("mousemove",(e)=>{if(!_drg)return;bx2.style.left=(e.clientX-_dx)+"px";bx2.style.top=(e.clientY-_dy)+"px"});
                        document.addEventListener("mouseup",()=>{if(_drg){try{localStorage.setItem("apc_popup_pos",JSON.stringify({left:parseInt(bx2.style.left)||0,top:parseInt(bx2.style.top)||0}));}catch(e){} setTimeout(function(){ window.clampPopup(bx2); },0);}_drg=false;});
                        
                        const toolbar = document.createElement("div");
                        toolbar.style.cssText = "display:flex;gap:6px;margin-bottom:8px;flex-shrink:0;";
                        const srch2 = document.createElement("input");
                        srch2.type = "text"; srch2.placeholder = "搜索添加标签...";
                        srch2.style.cssText = "flex:1;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:var(--anima-well-lo);color:#ffffff;font-size:12px;outline:none;";
                        const editBtn = document.createElement("button");
                        let _editMode = false;
                        editBtn.textContent = animaTxt("✏️ 编辑"); editBtn.title = animaTxt("删除自定义标签");
                        editBtn.style.cssText = "padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;font-size:13px;background:transparent;color:#ccc;";
                        editBtn.onclick = () => { _editMode = !_editMode; editBtn.style.background = _editMode ? "#e94560" : "transparent"; editBtn.style.color = _editMode ? "#fff" : "var(--anima-mute)"; if (_subCats && buildSubBar) buildSubBar(); renderAll(); };
                        toolbar.appendChild(srch2); toolbar.appendChild(editBtn);
                        // ── 自定义标签 ──
                        const addCustomBtn2 = document.createElement("button");
                        addCustomBtn2.textContent = "+"; addCustomBtn2.title = "添加自定义标签";
                        addCustomBtn2.style.cssText = "padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.22);cursor:pointer;font-size:14px;font-weight:bold;background:transparent;color:var(--anima-accent-soft);transition:all 0.2s ease;";
                        addCustomBtn2.onmouseover = function(){ addCustomBtn2.style.background="var(--anima-accent-soft)"; addCustomBtn2.style.color="var(--anima-bg)"; };
                        addCustomBtn2.onmouseout = function(){ addCustomBtn2.style.background="transparent"; addCustomBtn2.style.color="var(--anima-accent-soft)"; };
                        addCustomBtn2.onclick = function(){
                            var _ov3 = document.createElement("div");
                            _ov3.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:100005;display:flex;align-items:center;justify-content:center;";;
                            _ov3.onclick = null;
                            var _bx3 = document.createElement("div");
                            _bx3.style.cssText = "background:var(--anima-bg);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:20px;width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.8);";
                            _bx3.innerHTML = '<h3 style="color:#ffffff;margin:0 0 12px;">+ 自定义标签</h3>'+
                                '<input id=\"apcct-tag\" placeholder=\"标签名（英文）\" style=\"width:100%;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:var(--anima-well-lo);color:#ffffff;font-size:13px;outline:none;box-sizing:border-box;margin-bottom:8px;\">'+
                                '<input id=\"apcct-cn\" placeholder=\"中文翻译\" style=\"width:100%;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:var(--anima-well-lo);color:#ffffff;font-size:13px;outline:none;box-sizing:border-box;margin-bottom:8px;\">'+
                                '<button id=\"apcct-thumb\" style=\"width:100%;padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#ccc;cursor:pointer;font-size:12px;margin-bottom:8px;\">📷 设置缩略图</button>'+
                                '<div style=\"display:flex;gap:8px;\"><button id=\"apcct-ok\" style=\"flex:1;padding:8px;border-radius:6px;border:none;background:linear-gradient(180deg,#e8eef2,#c5d0d8);color:var(--anima-bg);cursor:pointer;font-size:13px;\">确认</button><button id=\"apcct-cancel\" style=\"flex:1;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#ccc;cursor:pointer;font-size:13px;\">取消</button></div>';
                            _ov3.appendChild(_bx3); document.body.appendChild(_ov3);
                            var _ti2 = _bx3.querySelector("#apcct-tag");
                            var _ci2 = _bx3.querySelector("#apcct-cn");
                            _bx3.querySelector("#apcct-cancel").onclick = function(){ _ov3.remove(); };
                            _bx3.querySelector("#apcct-thumb").onclick = function(){
                                var _tmp = _ti2.value.trim();
                                if (!_tmp) { alert("请先输入标签名"); return; }
                                // 创建临时卡片，借用它的完整 📷 弹窗
                                var _tmpCard = document.createElement("div");
                                _tmpCard.style.display = "none";
                                var _tmpSetBtn = document.createElement("span");
                                _tmpSetBtn.textContent = "📷"; _tmpSetBtn.title = animaTxt("设置缩略图");
                                _tmpCard.appendChild(_tmpSetBtn);
                                document.body.appendChild(_tmpCard);
                                // 复制完整缩略图弹窗的 onclick（用 setTimeout 等待 DOM 就绪）
                                setTimeout(function(){
                                    // 找到 ANY card's setBtn onclick 来复用 - 用 _customPresets 临时插入一个 dummy tag
                                    if (!_customPresets[ck2]) _customPresets[ck2] = [];
                                    var _wasAdded = _customPresets[ck2].indexOf(_tmp) < 0;
                                    if (_wasAdded) { _customPresets[ck2].push(_tmp); }
                                    var _oldSubCat = _subCat; _subCat = "all";
                                    renderAll();
                                    _subCat = _oldSubCat;
                                    setTimeout(function(){
                                        var _cards = document.querySelectorAll('[data-tag=\"'+_tmp+'\"]');
                                        if (_cards.length > 0) {
                                            var _sBtn = _cards[0].querySelector('[title=\"设置缩略图\"]');
                                            if (_sBtn) _sBtn.click();
                                        }
                                        if (_wasAdded) {
                                            _customPresets[ck2] = _customPresets[ck2].filter(function(x){return x!==_tmp;});
                                            renderAll();
                                        }
                                        _tmpCard.remove();
                                    }, 150);
                                }, 50);
                            };
                            _bx3.querySelector("#apcct-ok").onclick = function(){
                                var _tn2 = _ti2.value.trim();
                                if (!_tn2) return;
                                if (!_customPresets[ck2]) _customPresets[ck2] = [];
                                if (_customPresets[ck2].indexOf(_tn2) >= 0) { _ov3.remove(); return; }
                                _customPresets[ck2].push(_tn2); saveCustom();
                                var _ct3 = _ci2.value.trim();
                                if (_ct3) {
                                    _allTranslations[_tn2] = _ct3;
                                    try { var _ctrans = JSON.parse(localStorage.getItem("apc_custom_translations")||"{}"); _ctrans[_tn2] = _ct3; localStorage.setItem("apc_custom_translations", JSON.stringify(_ctrans)); } catch(e) {}
                                    try { var _ctrans2 = JSON.parse(localStorage.getItem("apc_translations")||"{}"); _ctrans2[_tn2] = _ct3; localStorage.setItem("apc_translations", JSON.stringify(_ctrans2)); } catch(e) {}
                                }
                                // 归入当前子分类
                                if (_subCat && _subCat !== "all") { _subAssign[_tn2] = _subCat; saveSubAssign(); }
                                _ov3.remove(); renderAll();
                            };
                        };
                        toolbar.appendChild(addCustomBtn2);
                        // ── 多选模式 ──
                        let _selMode = false, _selSelected = [];
                        const selBtn2 = document.createElement("button");
                        selBtn2.textContent = animaTxt("☐ 多选"); selBtn2.title = animaTxt("多选模式");
                        selBtn2.style.cssText = "padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;font-size:13px;background:transparent;color:#ccc;";
                        selBtn2.onclick = () => { _selMode = !_selMode; selBtn2.style.background = _selMode ? "var(--anima-accent-hi)" : "transparent"; selBtn2.style.color = _selMode ? "var(--anima-accent-soft)" : "var(--anima-mute)"; selBtn2.style.borderColor = _selMode ? "var(--anima-accent-soft)" : "rgba(255,255,255,0.1)"; if (!_selMode) { _selSelected = []; } selBtn2.textContent = _selMode ? ("☑ 多选("+_selSelected.length+")") : "☐ 多选"; _showSelBar2(); renderAll(); };
                        toolbar.appendChild(selBtn2);
                        // ── 多选浮动栏 ──
                        const selBar2 = document.createElement("div");
                        selBar2.style.cssText = "display:none;padding:6px 10px;margin-bottom:6px;background:rgba(32,46,44,0.9);border-radius:8px;align-items:center;gap:8px;flex-shrink:0;";
                        function _showSelBar2(){
                            if (_selSelected.length > 0 && _selMode) {
                                selBar2.style.display = "flex";
                                selBar2.innerHTML = '<span style="color:var(--anima-accent-soft);font-size:13px;font-weight:600;">已选 '+_selSelected.length+' 个</span>';
                                const _delAll2 = document.createElement("span");
                                _delAll2.textContent = "🗑"; _delAll2.title = "删除选中标签";
                                _delAll2.style.cssText = "cursor:pointer;color:#e94560;font-size:14px;";
                                _delAll2.onclick = () => { if(!confirm("确认删除选中的 "+_selSelected.length+" 个标签？"))return; for (const _st of _selSelected) { if ((_customPresets[ck2]||[]).includes(_st)) { _customPresets[ck2] = _customPresets[ck2].filter(x=>x!==_st); saveCustom(); } else { _deleted[ck2] = _deleted[ck2]||{}; _deleted[ck2][_st] = true; try { localStorage.setItem("apc_deleted", JSON.stringify(_deleted)); } catch(e) {} } } _selSelected = []; selBtn2.textContent = animaTxt("☐ 多选"); selBtn2.style.background = "transparent"; selBtn2.style.color = "var(--anima-mute)"; selBtn2.style.borderColor = "rgba(255,255,255,0.1)"; _selMode = false; _showSelBar2(); renderAll(); };
                                selBar2.appendChild(_delAll2);
                                // 分类下拉
                                const _clsSel2 = document.createElement("select");
                                _clsSel2.style.cssText = "padding:2px 6px;border-radius:8px;border:1px solid var(--anima-accent-soft);background:var(--anima-well);color:var(--anima-accent-soft);font-size:13px;outline:none;";
                                const _clsOpt02 = document.createElement("option"); _clsOpt02.value=""; _clsOpt02.textContent=animaTxt("分类到..."); _clsSel2.appendChild(_clsOpt02);
                                const _allSubs2 = getAllSubCats();
                                for (let _si2=1; _si2<_allSubs2.length; _si2++) {
                                    const _cso2 = document.createElement("option"); _cso2.value=_allSubs2[_si2][0]; _cso2.textContent=_allSubs2[_si2][1]; _clsSel2.appendChild(_cso2);
                                }
                                _clsSel2.onchange = () => { const _cv2 = _clsSel2.value; _okBtn2.style.display = _cv2 ? "inline" : "none"; };
                                selBar2.appendChild(_clsSel2);
                                const _okBtn2 = document.createElement("span");
                                _okBtn2.textContent = "✅"; _okBtn2.title = "确认分类"; _okBtn2.style.cssText = "display:none;cursor:pointer;font-size:14px;";
                                _okBtn2.onclick = () => { const _cv3 = _clsSel2.value; if (!_cv3) return; for (const _st2 of _selSelected) { _subAssign[_st2] = _cv3; } saveSubAssign(); _selSelected = []; selBtn2.textContent = animaTxt("☐ 多选"); selBtn2.style.background = "transparent"; selBtn2.style.color = "var(--anima-mute)"; selBtn2.style.borderColor = "rgba(255,255,255,0.1)"; _selMode = false; _showSelBar2(); renderAll(); };
                                selBar2.appendChild(_okBtn2);
                            } else { selBar2.style.display = "none"; }
                        }
                        // 恢复已删除标签
                        const restoreBtn = document.createElement("button");
                        restoreBtn.textContent = animaTxt("↩ 恢复"); restoreBtn.title = animaTxt("恢复该分类已删除的预置标签");
                        restoreBtn.style.cssText = "padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;font-size:13px;background:transparent;color:#ccc;";
                        restoreBtn.onclick = () => { if (_deleted[ck2]) { delete _deleted[ck2]; try { localStorage.setItem("apc_deleted", JSON.stringify(_deleted)); } catch(e) {} } renderAll(); };
                        toolbar.appendChild(restoreBtn);
                        // 🌐 云端翻译按钮
                        const cloudBtn = document.createElement("button");
                        cloudBtn.textContent = "🌐"; cloudBtn.title = animaTxt("云端翻译无中文的标签");
                        cloudBtn.style.cssText = "padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;font-size:13px;background:transparent;color:#ccc;";
                        cloudBtn.onmouseover = () => cloudBtn.style.background="rgba(255,255,255,0.08)"; cloudBtn.onmouseout = () => cloudBtn.style.background="transparent";
                        cloudBtn.onclick = () => {
                            const allTags = [...(PRESETS[ck2]||[]).filter(t => !(_deleted[ck2]||{})[t]), ...(_customPresets[ck2]||[])];
                            var _tf2 = window.animaTranslateFields();
                var _miss2 = window.animaTransConfigError(_tf2.cfg);
                if (_miss2) { alert(_miss2); cloudBtn.textContent = "\u{1f310}"; cloudBtn.disabled = false; return; }

                fetch("/danbooru_anima/cloud_translate", {
                                method:"POST",headers:{"Content-Type":"application/json"},
                                body:JSON.stringify({tags:allTags, provider: _tf2.provider, api_key: _tf2.api_key, model: _tf2.model, base_url: _tf2.base_url, baidu_appid: _tf2.baidu_appid})
                            }).then(r=>r.json()).then(d=>{
                                const tl=(d.success&&d.translations)||{};
                                Object.assign(_allTranslations, tl);
                                try { localStorage.setItem("apc_translations", JSON.stringify(_allTranslations)); } catch(e) {}
                                renderAll();
                            }).catch(()=>{}).finally(()=>{cloudBtn.textContent="\u{1f310}";cloudBtn.disabled=false;});
                        };
                        toolbar.appendChild(cloudBtn); bx2.appendChild(toolbar);
                        
                        const srchDrop = document.createElement("div");
                        srchDrop.style.cssText = "display:none;max-height:300px;overflow-y:auto;border:1px solid rgba(255,255,255,0.1);border-radius:8px;background:var(--anima-well-lo);margin-bottom:4px;flex-shrink:0;";
                        bx2.appendChild(srchDrop);
                        let _srchTimer = null;
                        srch2.oninput = () => { clearTimeout(_srchTimer); _srchTimer = setTimeout(() => { const q = srch2.value.trim(); if(!q){srchDrop.style.display="none";return;} srchDrop.style.display="block"; srchDrop.innerHTML='<div style="color:var(--anima-mute);padding:8px;font-size:13px;">搜索中...</div>'; fetch("/danbooru_anima/fuzzy_tags",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:q,limit:50})}).then(r=>r.json()).then(d=>{const items=d.tags||d.results||[];srchDrop.innerHTML="";if(!items.length){srchDrop.style.display="none";return;} for(const it of items){const tag=it.tag||it.en||"";if(!tag)continue;const allCurrent=[...presetArr,...(_customPresets[ck2]||[])];if(allCurrent.includes(tag))continue;const row=document.createElement("div");row.style.cssText="padding:5px 10px;cursor:pointer;font-size:13px;color:var(--anima-ink-chip);border-bottom:1px solid rgba(255,255,255,0.04);";row.onmouseover=()=>row.style.background="rgba(255,255,255,0.06)";row.onmouseout=()=>row.style.background="transparent";row.onclick=()=>{srchDrop.style.display="none";srch2.value="";const allCurrent=[...presetArr,...(_customPresets[ck2]||[])];if(!allCurrent.includes(tag)){_customPresets[ck2].push(tag);saveCustom();if(it.cn)_allTranslations[tag]=it.cn;if(_subCat!=="all"){_subAssign[tag]=_subCat;saveSubAssign();}}renderAll();};row.textContent=tag.replace(/_/g," ")+(it.cn?" ("+it.cn+")":"");srchDrop.appendChild(row);}if(!srchDrop.children.length){srchDrop.innerHTML='<div style="color:var(--anima-mute);padding:8px;font-size:13px;text-align:center;">已全部添加，换关键词试试</div>';}}).catch(()=>{srchDrop.style.display="none";});},200);};
                        
                        // 身体特征子分类
                        const _subCats = ck2 === "body_features" ? [
                            ["all","📋 全部",""],
                            ["hair","💇 发型","hair,ponytail,twintails,braid,bun,bangs,ahoge,hime_cut,bob_cut,drill"],
                            ["eyes","👁 眼睛","eyes,heterochromia,glasses,eyelashes,pupils,tsurime,tareme,sanpaku,sclera,contacts,sunglasses"],
                            ["body","💪 身体","ears,fangs,teeth,lips,blush,freckles,mole,scar,bandaid,bandage,patch,horns,halo,tail,wings,tanned,skin,muscular,skinny,earrings"]
                        ] : [["all","📋 全部",""]];
                        // 用户自定义子分类（按分类存储）
                        var _customSubCats = [];
                        try { var cd2 = JSON.parse(localStorage.getItem("apc_custom_subcats")||"{}"); if (cd2[ck2]) _customSubCats = cd2[ck2]; } catch(e) {}
                        try { if(typeof PRESET_SUBCATS!=="undefined"&&PRESET_SUBCATS[ck2]){var _ps=PRESET_SUBCATS[ck2];for(var _si=0;_si<_ps.length;_si++){var _found=false;for(var _sj=0;_sj<_customSubCats.length;_sj++){if(_customSubCats[_sj][1]===_ps[_si][1]){_found=true;break;}}if(!_found)_customSubCats.push(_ps[_si]);}saveCustomSubCats();}}catch(e){}
                        let _subCat = "all";
                        function getAllSubCats() { return (_subCats||[]).concat(_customSubCats).concat([["other","🔖 未分类",""]]); }
                        function isPresetSub(sc) { return (_subCats||[]).some(function(s2){return s2[0]===sc;}) || sc==="other"; }
                        const _subAssign = {}; // tag → sub-category
                        // 先加载用户数据（所有分类）
                        try { const d=JSON.parse(localStorage.getItem("apc_subcats")||"{}"); for (var _dk in d) { if (d[_dk]) Object.assign(_subAssign, d[_dk]); } } catch(e) {}
                        // 再用预置补缺（不覆盖已有）
                        try { if(typeof PRESET_SUBASSIGN!=="undefined"){var _psa=PRESET_SUBASSIGN[ck2];if(_psa){for(var _k2 in _psa){if(!_subAssign[_k2])_subAssign[_k2]=_psa[_k2];}saveSubAssign();}}}catch(e){}
                        function autoClassify(t) {
                            if (_subAssign[t]) return _subAssign[t];
                            for (const sc of getAllSubCats().slice(1,-1)) {
                                const kws = sc[2].split(",").filter(Boolean);
                                for (const kw of kws) { if (t.includes(kw)) return sc[0]; }
                            }
                            return "body";
                        }
                        function filterBySubCat(arr) {
                            if (!_subCats || _subCat==="all") return arr;
                            return arr.filter(function(t){ return (_subAssign[t]||autoClassify(t))===_subCat; });
                        }
                        function saveSubAssign() {
                            try { var d=JSON.parse(localStorage.getItem("apc_subcats")||"{}"); d.body_features=_subAssign; localStorage.setItem("apc_subcats",JSON.stringify(d)); syncUserData(); } catch(e) {}
                        }
                        function saveCustomSubCats() {
                            try { var d2=JSON.parse(localStorage.getItem("apc_custom_subcats")||"{}"); d2[ck2]=_customSubCats; localStorage.setItem("apc_custom_subcats",JSON.stringify(d2)); syncUserData(); } catch(e) {}
                        }
                        
                        const body2 = document.createElement("div");
                        body2.style.cssText = "flex:1;overflow-y:auto;";
                        // 子分类切换栏（仅身体特征）
                        if (_subCats) {
                            var buildSubBar = function() {
                                // 清除旧的子标签（保留 + 按钮）
                                var existing = subBar.querySelectorAll(".sub-tab");
                                for (var ei=0;ei<existing.length;ei++) existing[ei].remove();
                                var existingPlus = subBar.querySelector(".sub-plus");
                                if (existingPlus) existingPlus.remove();
                                var allCats = getAllSubCats();
                                for (var si=0;si<allCats.length;si++) {
                                    (function(){
                                        var sc = allCats[si][0], sl = allCats[si][1], sk = allCats[si][2];
                                        var stab = document.createElement("span");
                                        stab.className = "sub-tab";
                                        stab.textContent = sl; stab.dataset.cat = sc;
                                        stab.style.cssText = "padding:6px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:"+(sc===_subCat?"600":"400")+";color:"+(sc===_subCat?"var(--anima-accent-soft)":"var(--anima-ink-chip)")+";border:1px solid "+(sc===_subCat?"rgba(var(--anima-accent-rgb),0.5)":"rgba(255,255,255,0.12)")+";background:"+(sc===_subCat?"rgba(var(--anima-accent-rgb),0.15)":"rgba(255,255,255,0.04)")+";transition:all 0.2s ease;display:inline-flex;align-items:center;gap:4px;";
                                        stab.onclick = function() {
                                            _subCat = sc;
                                            buildSubBar();
                                            renderAll();
                                        };
                                        // 非预设 + 编辑模式 → 删除按钮
                                        if (_editMode && !isPresetSub(sc)) {
                                            var delSub = document.createElement("span");
                                            delSub.textContent = "✕"; delSub.style.cssText = "color:#e94560;font-size:12px;cursor:pointer;margin-left:2px;";
                                            delSub.onclick = function(e2){ e2.stopPropagation(); if(!confirm("删除子分类「"+sl+"」？其中的标签会移到「未分类」"))return; for (var k3 in _subAssign) { if (_subAssign[k3]===sc) _subAssign[k3]="other"; } saveSubAssign(); _customSubCats = _customSubCats.filter(function(x){return x[0]!==sc;}); if(_subCat===sc) _subCat="other"; saveCustomSubCats(); buildSubBar(); renderAll(); };
                                            stab.appendChild(delSub);
                                        }
                                        subBar.appendChild(stab);
                                    })();
                                }
                                // + 按钮
                                var plusBtn = document.createElement("span");
                                plusBtn.className = "sub-plus";
                                plusBtn.textContent = "+"; plusBtn.title = "添加自定义子分类";
                                plusBtn.style.cssText = "padding:6px 10px;border-radius:8px;cursor:pointer;font-size:15px;color:var(--anima-ink-chip);border:1px dashed rgba(255,255,255,0.18);background:rgba(255,255,255,0.03);";
                                plusBtn.onclick = function(){
                                    var nm = prompt("请输入子分类名称：");
                                    if (!nm || !nm.trim()) return;
                                    var id = "custom_"+Date.now();
                                    _customSubCats.push([id, nm.trim(), ""]);
                                    saveCustomSubCats(); buildSubBar();
                                };
                                subBar.appendChild(plusBtn);
                            }
                            const subBar = document.createElement("div");
                            subBar.style.cssText = "display:flex;gap:4px;margin-bottom:8px;flex-shrink:0;flex-wrap:wrap;";
                            buildSubBar();
                            bx2.appendChild(subBar);
                        }
                        bx2.appendChild(body2);
                        bx2.appendChild(selBar2);
                        document.body.appendChild(bx2);
                        
                        const presetArr = (PRESETS[ck2]||[]).filter(t => !(_deleted[ck2]||{})[t]);

                        function renderAll() {
                            body2.innerHTML = "";
                            const curPresetArr = (PRESETS[ck2]||[]).filter(t => !(_deleted[ck2]||{})[t]);
                            const allRaw = [...curPresetArr, ...(_customPresets[ck2]||[])];
                            const all = filterBySubCat(allRaw);
                            if (!all.length) { body2.innerHTML = '<div style="color:var(--anima-mute);text-align:center;padding:30px;">暂无标签</div>'; return; }
                            const grid2 = document.createElement("div");
                            grid2.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;";
                            for (const t of all) {
                                const isCustom = (_customPresets[ck2]||[]).includes(t);
                                const cn = _allTranslations[t] || (typeof PRESET_TRANSLATIONS!=="undefined"?PRESET_TRANSLATIONS[t]:null) || "";
                                const card = document.createElement("div");
                                card.setAttribute("data-tag", t);
                                card.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px;border-radius:10px;cursor:pointer;font-size:12px;background:rgba(255,255,255,0.03);border:1px solid "+col+"33;transition:all 0.2s ease;text-align:center;position:relative;box-sizing:border-box;";
                                card.onmouseover = () => { card.style.background=col+"22"; card.style.color="#fff"; };
                                card.onmouseout = () => { card.style.background="rgba(255,255,255,0.03)"; card.style.color="#ccc"; };
                                card.onclick = () => {
                                if (_selMode) {
                                    const _idx = _selSelected.indexOf(t);
                                    if (_idx >= 0) { _selSelected.splice(_idx, 1); card.style.border = "1px solid "+col+"33"; card.style.background = "rgba(255,255,255,0.03)"; }
                                    else { _selSelected.push(t); card.style.border = "2px solid var(--anima-accent-soft)"; card.style.background = "rgba(var(--anima-accent-rgb),0.08)"; }
                                    selBtn2.textContent = "☑ 多选("+_selSelected.length+")";
                                    _showSelBar2();
                                    return;
                                }
                                addGTag(t, col);
                            };
                                // 缩略图区
                                const td = document.createElement("div");
                                td.style.cssText = "width:100%;aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:6px;overflow:hidden;background:rgba(255,255,255,0.04);position:relative;clip-path:inset(0);";
                                const thumbRaw = _thumbs2[t] || _removed2[t] || (typeof PRESET_THUMBS!=="undefined"?PRESET_THUMBS[t]:null) || "";
                                var thumbUrl = thumbRaw, thumbPx=50, thumbPy=50, thumbZoom=100;
                                // 跳过旧 URL 格式
                                if (typeof thumbUrl === "string" && thumbUrl.indexOf("/extensions/ComfyUI-Danbooru-Anima-Prompt/thumbs/") >= 0) thumbUrl = "";
                                try { var td2 = JSON.parse(thumbRaw); if(td2.url){ thumbUrl=td2.url; thumbPx=td2.px!=null?td2.px:50; thumbPy=td2.py!=null?td2.py:50; thumbZoom=td2.zoom!=null?td2.zoom:100; if (typeof thumbUrl === "string" && thumbUrl.indexOf("/extensions/") >= 0) thumbUrl = ""; } } catch(e) {}
                                if (typeof thumbUrl !== "string") thumbUrl = "";
                                // 空 URL 时用 PRESET_THUMBS 兜底
                                if (!thumbUrl && typeof PRESET_THUMBS!=="undefined" && PRESET_THUMBS[t]) {
                                    var _fb = PRESET_THUMBS[t];
                                    if (typeof _fb === "string" && _fb.startsWith("{")) { try { var _fbo = JSON.parse(_fb); if(_fbo.url) thumbUrl=_fbo.url; } catch(e) {} } else { thumbUrl = _fb; }
                                }
                                if (thumbUrl) {
                                    const ti = document.createElement("img");
                                        ti.loading = "lazy"; ti.decoding = "async";
                                        ti.loading = "lazy"; ti.decoding = "async";
                                    // 本地预置缩略图，直接加载（已预裁剪）
                                    if (thumbUrl.startsWith("/danbooru_anima/thumb/")) {
                                        ti.src = thumbUrl; ti.loading = "lazy";
                                        ti.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;";
                                    } else if (thumbUrl.startsWith("data:")) {
                                        ti.src = thumbUrl;
                                        ti.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;";
                                    } else if (thumbUrl.startsWith("/extensions/")) {
                                        ti.src = thumbUrl;
                                    } else {
                                        ti.src = "/gelbooru_anima/image_proxy?url="+encodeURIComponent(thumbUrl); ti.loading = "lazy";
                                    }
                                    ti.alt = "";
                                    if (thumbZoom === 0) {
                                        // 不裁剪模式：完整显示，不拉伸
                                        ti.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;";
                                    } else if (thumbZoom > 100) {
                                        ti.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;object-position:"+thumbPx+"% "+thumbPy+"%;transform:scale("+(thumbZoom/100)+");transform-origin:"+thumbPx+"% "+thumbPy+"%;";
                                    } else {
                                        ti.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;object-position:"+thumbPx+"% "+thumbPy+"%;";
                                    }
                                    ti.onerror = () => { td.innerHTML = '<span style="font-size:28px;">🖼</span>'; };
                                    td.appendChild(ti);
                                } else { td.innerHTML = '<span style="font-size:28px;">🖼</span>'; }
                                // 设置按钮
                                const setBtn = document.createElement("span");
                                setBtn.textContent = "📷"; setBtn.style.cssText = "position:absolute;top:3px;right:3px;font-size:14px;cursor:pointer;opacity:0.85;z-index:1;background:rgba(0,0,0,0.6);border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;line-height:1;";
                                setBtn.title = animaTxt("设置缩略图");
                                setBtn.onclick = (e) => { e.stopPropagation();
                                    // G站缩略图搜索弹窗（浮动窗口）
                                    var q = t; // G站搜索用下划线格式
                                    var bx3 = document.createElement("div");
                                    bx3.style.cssText = "position:fixed;top:8%;left:8%;background:var(--anima-bg);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:16px;width:720px;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.9);z-index:100006;resize:both;overflow:auto;";
                                    // 恢复上次位置和大小
                                    try { var _gp = JSON.parse(localStorage.getItem("apc_gelpop_pos")||"{}"); if(_gp.left) bx3.style.left = _gp.left+"px"; if(_gp.top) bx3.style.top = _gp.top+"px"; if(_gp.w) bx3.style.width = _gp.w+"px"; if(_gp.h) bx3.style.height = _gp.h+"px"; } catch(e) {}
                                    if (typeof ResizeObserver !== "undefined") { var _roGel = new ResizeObserver(function(){ try { localStorage.setItem("apc_gelpop_pos", JSON.stringify({left:parseInt(bx3.style.left)||0,top:parseInt(bx3.style.top)||0,w:bx3.offsetWidth,h:bx3.offsetHeight})); } catch(e) {} }); _roGel.observe(bx3); }
                                    // 拖拽
                                    var hdr3 = document.createElement("div");
                                    hdr3.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:8px;cursor:grab;user-select:none;";
                                    hdr3.onmousedown = function(e3){ var dx=e3.clientX-bx3.offsetLeft,dy=e3.clientY-bx3.offsetTop; function mm(ev){bx3.style.left=(ev.clientX-dx)+'px';bx3.style.top=(ev.clientY-dy)+'px'} function mu(){document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);try{localStorage.setItem("apc_gelpop_pos",JSON.stringify({left:parseInt(bx3.style.left)||0,top:parseInt(bx3.style.top)||0}));}catch(e){} setTimeout(function(){ window.clampPopup(bx3); },0);} document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu); };
                                    hdr3.innerHTML = '<span style="color:var(--anima-accent-soft);font-weight:bold;">🔍 缩略图：</span><span style="color:var(--anima-accent-soft);font-weight:bold;font-size:13px;">'+t.replace(/_/g," ")+'</span><span style="color:var(--anima-mute);font-size:13px;margin-left:4px;">点击图片进入裁剪</span>';
                                    // Solo 开关
                                    var _soloOn = false; // 默认不限制人数
                                    var soloBtn = document.createElement("button");
                                    soloBtn.textContent = "👤"; soloBtn.title = "单人筛选开关";
                                    soloBtn.style.cssText = "padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#ccc;cursor:pointer;font-size:13px;";
                                    soloBtn.onclick = function(){
                                        _soloOn = !_soloOn;
                                        soloBtn.textContent = "👤"; soloBtn.title = _soloOn ? "单人筛选：开" : "单人筛选：关";
                                        soloBtn.style.background = _soloOn ? "var(--anima-accent-hi)" : "transparent";
                                        soloBtn.style.color = _soloOn ? "var(--anima-accent-soft)" : "#ccc";
                                        soloBtn.style.borderColor = _soloOn ? "var(--anima-accent-soft)" : "rgba(255,255,255,0.06)";
                                        doGelSearch(0);
                                    };
                                    // 排序切换
                                    var _gelSort = "score";
                                    var sortBtn = document.createElement("button");
                                    sortBtn.textContent = animaTxt("⭐ 评分"); sortBtn.title = animaTxt("排序：评分/最新");
                                    sortBtn.style.cssText = "padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#ccc;cursor:pointer;font-size:13px;";
                                    sortBtn.onclick = function(){
                                        _gelSort = _gelSort==="score"?"date":"score";
                                        sortBtn.textContent = _gelSort==="score"?"⭐ 评分":"🕐 最新";
                                        doGelSearch(0);
                                    };
                                    // 分级多选
                                    var _gelRatings = {"general":true}; // 默认普通
                                    var ratingBar = document.createElement("div");
                                    ratingBar.style.cssText = "display:flex;gap:3px;";
                                    var ratingOpts = [["general","🟢 普通"],["sensitive","🟡 敏感"],["questionable","🟠 可疑"],["explicit","🔴 明确"]];
                                    var ratingBtns = {};
                                    var _gelAll = false; // 不限分级模式（默认关闭，只显示普通）
                                    function updateRatingBar(){
                                        for(var rk in ratingBtns){
                                            var on = !_gelAll && !!_gelRatings[rk];
                                            ratingBtns[rk].style.background = on ? "var(--anima-accent-hi)" : "transparent";
                                            ratingBtns[rk].style.color = on ? "var(--anima-accent-soft)" : "#555";
                                            ratingBtns[rk].style.borderColor = on ? "var(--anima-accent-soft)" : "rgba(255,255,255,0.1)";
                                        }
                                        if (allBtn) {
                                            allBtn.style.background = _gelAll ? "var(--anima-accent-hi)" : "transparent";
                                            allBtn.style.color = _gelAll ? "var(--anima-accent-soft)" : "var(--anima-mute)";
                                            allBtn.style.borderColor = _gelAll ? "var(--anima-accent-soft)" : "rgba(255,255,255,0.15)";
                                        }
                                    }
                                    for(var ri=0;ri<ratingOpts.length;ri++){
                                        (function(){
                                            var rk = ratingOpts[ri][0], rl = ratingOpts[ri][1];
                                            var rb = document.createElement("span");
                                            rb.textContent = rl; rb.style.cssText = "padding:3px 6px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;font-size:12px;user-select:none;";
                                            rb.onclick = function(){
                                                _gelAll = false; _gelRatings[rk] = !_gelRatings[rk];
                                                updateRatingBar(); doGelSearch(0);
                                            };
                                            ratingBtns[rk] = rb; ratingBar.appendChild(rb);
                                        })();
                                    }
                                    // 全部切换
                                    var allBtn = document.createElement("span");
                                    allBtn.textContent = animaTxt("⚪ 全部"); allBtn.style.cssText = "padding:3px 6px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);cursor:pointer;font-size:12px;user-select:none;background:transparent;color:#ccc;";
                                    allBtn.onclick = function(){
                                        _gelAll = !_gelAll;
                                        updateRatingBar(); doGelSearch(0);
                                    };
                                    ratingBar.appendChild(allBtn);
                                    updateRatingBar();
                                    var cls3 = document.createElement("button");
                                    cls3.textContent = animaTxt("关闭"); cls3.style.cssText = "margin-left:auto;background:transparent;border:none;color:#ccc;cursor:pointer;";
                                    cls3.onclick = function(){ bx3.remove(); };
                                    // 本地上传按钮
                                    var uploadBtn = document.createElement("button");
                                    uploadBtn.textContent = animaTxt("📁 本地上传"); uploadBtn.title = animaTxt("从本地选择图片作为缩略图");
                                    uploadBtn.style.cssText = "padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#ccc;cursor:pointer;font-size:13px;";
                                    var fileInp = document.createElement("input");
                                    fileInp.type = "file"; fileInp.accept = "image/*"; fileInp.style.display = "none";
                                    uploadBtn.onclick = function(){ fileInp.click(); };
                                    fileInp.onchange = function(){
                                        if (!fileInp.files || !fileInp.files[0]) return;
                                        var file = fileInp.files[0];
                                        var reader = new FileReader();
                                        reader.onload = function(ev){
                                            var dataUrl = ev.target.result;
                                            bx3.remove();
                                            // 打开裁剪弹窗（和 G站 选中图片后一样）
                                            var cov2 = document.createElement("div");
                                            cov2.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.92);z-index:100006;display:flex;align-items:center;justify-content:center;flex-direction:column;";
                                            var VW2=400,VH2=400;
                                            var cbox2 = document.createElement("div");
                                            cbox2.style.cssText = "position:relative;width:"+VW2+"px;height:"+VH2+"px;overflow:hidden;border:2px solid var(--anima-accent-soft);border-radius:8px;background:#000;cursor:grab;";
                                            var cimg2 = document.createElement("img");
                                            cimg2.src = dataUrl;
                                            cimg2.draggable = false;
                                            cimg2.style.cssText = "position:absolute;pointer-events:none;user-select:none;";
                                            var zoom2=100, panX2=0, panY2=0, imgScale2=1;
                                            cimg2.onload = function(){
                                                var nw=cimg2.naturalWidth, nh=cimg2.naturalHeight;
                                                if(!nw||!nh) return;
                                                imgScale2 = Math.max(VW2/nw, VH2/nh);
                                                zoom2 = 100;
                                                applyZoom2();
                                            };
                                            function applyZoom2(){
                                                var nw=cimg2.naturalWidth, nh=cimg2.naturalHeight;
                                                if(!nw||!nh) return;
                                                var scale = imgScale2 * (zoom2/100);
                                                var iw = Math.round(nw * scale), ih = Math.round(nh * scale);
                                                cimg2.style.width = iw+"px";
                                                cimg2.style.height = ih+"px";
                                                var maxDX = Math.max(0, iw - VW2), maxDY = Math.max(0, ih - VH2);
                                                panX2 = Math.max(-maxDX, Math.min(0, panX2));
                                                panY2 = Math.max(-maxDY, Math.min(0, panY2));
                                                cimg2.style.left = panX2+"px";
                                                cimg2.style.top = panY2+"px";
                                            }
                                            var dragging2=false, sx2=0, sy2=0, spx2=0, spy2=0;
                                            cbox2.addEventListener("mousedown",function(e2){ dragging2=true; cbox2.style.cursor="grabbing"; sx2=e2.clientX; sy2=e2.clientY; spx2=panX2; spy2=panY2; e2.preventDefault(); });
                                            window.addEventListener("mousemove",function(e2){ if(!dragging2||!cov2.parentNode)return; panX2=spx2+(e2.clientX-sx2); panY2=spy2+(e2.clientY-sy2); applyZoom2(); });
                                            window.addEventListener("mouseup",function(){ if(dragging2){dragging2=false;cbox2.style.cursor="grab";} });
                                            cbox2.appendChild(cimg2);
                                            var cbar2 = document.createElement("div");
                                            cbar2.style.cssText = "display:flex;gap:12px;align-items:center;margin-top:14px;";
                                            var zoomOut2 = document.createElement("button");
                                            zoomOut2.textContent="\u2212";zoomOut2.style.cssText="width:30px;height:30px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#fff;cursor:pointer;font-size:18px;line-height:1;";
                                            zoomOut2.onclick=function(){ zoom2=Math.max(100,zoom2-20); applyZoom2(); };
                                            var zoomSlider2 = document.createElement("input");
                                            zoomSlider2.type="range";zoomSlider2.min="100";zoomSlider2.max="300";zoomSlider2.value=zoom2;
                                            zoomSlider2.style.cssText="width:140px;accent-color:var(--anima-accent-soft);";
                                            var zoomIn2 = document.createElement("button");
                                            zoomIn2.textContent="+";zoomIn2.style.cssText="width:30px;height:30px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#fff;cursor:pointer;font-size:18px;line-height:1;";
                                            zoomIn2.onclick=function(){ zoom2=Math.min(300,zoom2+20); applyZoom2(); };
                                            zoomSlider2.oninput=function(){ zoom2=parseInt(zoomSlider2.value); applyZoom2(); };
                                            var zoomLabel2 = document.createElement("span");
                                            zoomLabel2.style.cssText="color:#ccc;font-size:12px;min-width:40px;";
                                            var origApply2=applyZoom2; applyZoom2=function(){ origApply2(); zoomLabel2.textContent=zoom2+"%"; zoomSlider2.value=zoom2; };
                                            var cbtnCancel2 = document.createElement("button");
                                            cbtnCancel2.textContent="\u53d6\u6d88";cbtnCancel2.style.cssText="padding:8px 18px;border-radius:8px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer;font-size:13px;margin-left:auto;";
                                            cbtnCancel2.onclick=function(){cov2.remove();};
                                            var cbtnSkip2 = document.createElement("button");
                                            cbtnSkip2.textContent="\u{1f5bc} \u4e0d\u88c1\u526a";cbtnSkip2.style.cssText="padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:var(--anima-ink-chip);cursor:pointer;font-size:13px;";
                                            cbtnSkip2.onclick=function(){ saveLocalThumb(dataUrl); };
                                            function saveLocalThumb(dataUrl2){
                                                fetch("/danbooru_anima/save_thumb",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag:t, image:dataUrl2})}).then(function(r3){return r3.json();}).then(function(d3){
                                                    if(d3.success && d3.url){
                                                        _thumbs2[t] = d3.url; // 直接存 URL，不包 JSON
                                                        saveThumbs2(); cov2.remove(); renderAll();
                                                    }
                                                }).catch(function(){});
                                            }
                                            var cbtnOk2 = document.createElement("button");
                                            cbtnOk2.textContent="\u2705 \u786e\u8ba4";cbtnOk2.style.cssText="padding:8px 18px;border-radius:8px;border:none;background:var(--anima-accent-hi);color:var(--anima-accent-soft);cursor:pointer;font-weight:bold;font-size:13px;";
                                            cbtnOk2.onclick=function(){
                                                var nw2=cimg2.naturalWidth, nh2=cimg2.naturalHeight;
                                                var scale2 = imgScale2 * (zoom2/100);
                                                var iw2 = Math.round(nw2*scale2), ih2 = Math.round(nh2*scale2);
                                                var maxDX2 = Math.max(0, iw2-VW2), maxDY2 = Math.max(0, ih2-VH2);
                                                var px = maxDX2>0 ? Math.round((-panX2/maxDX2)*100) : 50;
                                                var py = maxDY2>0 ? Math.round((-panY2/maxDY2)*100) : 50;
                                                // 用 canvas 裁剪并保存
                                                var cv = document.createElement("canvas");
                                                cv.width = VW2; cv.height = VH2;
                                                var ctx = cv.getContext("2d");
                                                ctx.drawImage(cimg2, panX2, panY2, Math.round(nw2*scale2), Math.round(nh2*scale2));
                                                saveLocalThumb(cv.toDataURL("image/jpeg", 0.85));
                                            };
                                            cbar2.appendChild(zoomOut2);cbar2.appendChild(zoomSlider2);cbar2.appendChild(zoomIn2);cbar2.appendChild(zoomLabel2);
                                            cbar2.appendChild(cbtnCancel2);cbar2.appendChild(cbtnSkip2);cbar2.appendChild(cbtnOk2);
                                            cov2.appendChild(cbox2); cov2.appendChild(cbar2); document.body.appendChild(cov2);
                                            if(cimg2.complete && cimg2.naturalWidth) cimg2.onload();
                                            fileInp.value = "";
                                        };
                                        reader.readAsDataURL(file);
                                    };
                                    hdr3.appendChild(uploadBtn);
                                    bx3.appendChild(fileInp);
                                    hdr3.appendChild(soloBtn); hdr3.appendChild(sortBtn); hdr3.appendChild(ratingBar); hdr3.appendChild(cls3); bx3.appendChild(hdr3);
                                    var grid3 = document.createElement("div");
                                    grid3.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;overflow-y:auto;flex:1;min-height:200px;";
                                    grid3.innerHTML = '<div style="color:var(--anima-mute);text-align:center;grid-column:1/-1;padding:20px;">搜索中...</div>';
                                    bx3.appendChild(grid3); document.body.appendChild(bx3);
                                    var _gelPage = 0;
                                    function doGelSearch(pg) {
                                        _gelPage = pg; grid3.innerHTML = '<div style="color:var(--anima-mute);text-align:center;grid-column:1/-1;padding:20px;">搜索中...</div>';
                                        var _q = q;
                                        if (_soloOn) _q = "solo "+_q;
                                        var ratingArr = _gelAll ? null : Object.keys(_gelRatings).filter(function(k){return _gelRatings[k];});
                                        var allSel = ratingArr;
                                        fetch("/gelbooru_anima/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tags:_q,page:pg,limit:30,order:_gelSort,rating:allSel})}).then(function(r2){return r2.json();}).then(function(d2){
                                        var posts = d2.posts||[];
                                        grid3.innerHTML = "";
                                        if(!posts.length){grid3.innerHTML='<div style="color:var(--anima-mute);text-align:center;grid-column:1/-1;padding:20px;">无结果</div>';return;}
                                        posts.forEach(function(p){
                                            var c2 = document.createElement("div");
                                            c2.style.cssText = "border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid transparent;transition:all 0.2s;min-height:200px;position:relative;background:rgba(255,255,255,0.03);";
                                            c2.onmouseover = function(){ c2.style.borderColor="var(--anima-accent-soft)"; };
                                            c2.onmouseout = function(){ c2.style.borderColor="transparent"; };
                                            c2.onclick = function(){
                                                var imgUrl = p.sample_url||p.preview_url||p.file_url||"";
                                                if(!imgUrl){ _thumbs2[t] = p.preview_url||""; saveThumbs2(); bx3.remove(); renderAll(); return; }
                                                bx3.remove();
                                                var cov = document.createElement("div");
                                                cov.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.92);z-index:100006;display:flex;align-items:center;justify-content:center;flex-direction:column;";
                                                var VW=400,VH=400;
                                                var cbox = document.createElement("div");
                                                cbox.style.cssText = "position:relative;width:"+VW+"px;height:"+VH+"px;overflow:hidden;border:2px solid var(--anima-accent-soft);border-radius:8px;background:#000;cursor:grab;";
                                                var cimg = document.createElement("img");
                                                cimg.src = "/gelbooru_anima/image_proxy?url="+encodeURIComponent(imgUrl);
                                                cimg.draggable = false;
                                                cimg.style.cssText = "position:absolute;pointer-events:none;user-select:none;";
                                                var zoom=100, panX=0, panY=0, imgScale=1;
                                                cimg.onload = function(){
                                                    var nw=cimg.naturalWidth, nh=cimg.naturalHeight;
                                                    if(!nw||!nh) return;
                                                    // 初始缩放：短边填满裁剪框
                                                    imgScale = Math.max(VW/nw, VH/nh);
                                                    zoom = 100;
                                                    applyZoom();
                                                };
                                                function applyZoom(){
                                                    var nw=cimg.naturalWidth, nh=cimg.naturalHeight;
                                                    if(!nw||!nh) return;
                                                    var scale = imgScale * (zoom/100);
                                                    var iw = Math.round(nw * scale), ih = Math.round(nh * scale);
                                                    cimg.style.width = iw+"px";
                                                    cimg.style.height = ih+"px";
                                                    var maxDX = Math.max(0, iw - VW), maxDY = Math.max(0, ih - VH);
                                                    panX = Math.max(-maxDX, Math.min(0, panX));
                                                    panY = Math.max(-maxDY, Math.min(0, panY));
                                                    cimg.style.left = panX+"px";
                                                    cimg.style.top = panY+"px";
                                                }
                                                // 拖拽
                                                var dragging=false, sx=0, sy=0, spx=0, spy=0;
                                                cbox.addEventListener("mousedown",function(e2){ dragging=true; cbox.style.cursor="grabbing"; sx=e2.clientX; sy=e2.clientY; spx=panX; spy=panY; e2.preventDefault(); });
                                                window.addEventListener("mousemove",function(e2){ if(!dragging||!cov.parentNode)return; panX=spx+(e2.clientX-sx); panY=spy+(e2.clientY-sy); applyZoom(); });
                                                window.addEventListener("mouseup",function(){ if(dragging){dragging=false;cbox.style.cursor="grab";} });
                                                cbox.appendChild(cimg);
                                                // 工具栏
                                                var cbar = document.createElement("div");
                                                cbar.style.cssText = "display:flex;gap:12px;align-items:center;margin-top:14px;";
                                                var zoomOut = document.createElement("button");
                                                zoomOut.textContent="\u2212";zoomOut.style.cssText="width:30px;height:30px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#fff;cursor:pointer;font-size:18px;line-height:1;";
                                                zoomOut.onclick=function(){ zoom=Math.max(100,zoom-20); applyZoom(); };
                                                var zoomSlider = document.createElement("input");
                                                zoomSlider.type="range";zoomSlider.min="100";zoomSlider.max="300";zoomSlider.value=zoom;
                                                zoomSlider.style.cssText="width:140px;accent-color:var(--anima-accent-soft);";
                                                var zoomIn = document.createElement("button");
                                                zoomIn.textContent="+";zoomIn.style.cssText="width:30px;height:30px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#fff;cursor:pointer;font-size:18px;line-height:1;";
                                                zoomIn.onclick=function(){ zoom=Math.min(300,zoom+20); applyZoom(); };
                                                zoomSlider.oninput=function(){ zoom=parseInt(zoomSlider.value); applyZoom(); };
                                                var zoomLabel = document.createElement("span");
                                                zoomLabel.style.cssText="color:#ccc;font-size:12px;min-width:40px;";
                                                var origApply=applyZoom; applyZoom=function(){ origApply(); zoomLabel.textContent=zoom+"%"; zoomSlider.value=zoom; };
                                                var cbtnCancel = document.createElement("button");
                                                cbtnCancel.textContent="\u53d6\u6d88";cbtnCancel.style.cssText="padding:8px 18px;border-radius:8px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer;font-size:13px;margin-left:auto;";
                                                cbtnCancel.onclick=function(){cov.remove();};
                                                var cbtnOk = document.createElement("button");
                                                cbtnOk.textContent="\u2705 \u786e\u8ba4";cbtnOk.style.cssText="padding:8px 18px;border-radius:8px;border:none;background:var(--anima-accent-hi);color:var(--anima-accent-soft);cursor:pointer;font-weight:bold;font-size:13px;";
                                                cbtnOk.onclick=function(){
                                                    var nw2=cimg.naturalWidth, nh2=cimg.naturalHeight;
                                                    var scale2 = imgScale * (zoom/100);
                                                    var iw2 = Math.round(nw2*scale2), ih2 = Math.round(nh2*scale2);
                                                    var maxDX2 = Math.max(0, iw2-VW), maxDY2 = Math.max(0, ih2-VH);
                                                    var px = maxDX2>0 ? Math.round((-panX/maxDX2)*100) : 50;
                                                    var py = maxDY2>0 ? Math.round((-panY/maxDY2)*100) : 50;
                                                    // 先写内存（显示旧图顶住），等存盘完再写 localStorage
                                                    var _oldVal = _thumbs2[t];
                                                    _thumbs2[t] = JSON.stringify({url:imgUrl, px:px, py:py, zoom:zoom});
                                                    var cv2 = document.createElement("canvas"); cv2.width = VW; cv2.height = VH;
                                                    var ctx2 = cv2.getContext("2d");
                                                    var nw3=cimg.naturalWidth, nh3=cimg.naturalHeight;
                                                    var scale3 = imgScale * (zoom/100);
                                                    ctx2.drawImage(cimg, panX, panY, Math.round(nw3*scale3), Math.round(nh3*scale3));
                                                    fetch("/danbooru_anima/save_thumb",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag:t, image:cv2.toDataURL("image/jpeg",0.85)})}).then(function(r5){return r5.json()}).then(function(d5){if(d5.success&&d5.url){_thumbs2[t]=d5.url+"?v="+Date.now();}else{_thumbs2[t]=_oldVal;}saveThumbs2();renderAll();}).catch(function(){_thumbs2[t]=_oldVal;renderAll();});
                                                    renderAll(); // 先用旧URL顶着
                                                    cov.remove();
                                                    saveThumbs2(); cov.remove(); renderAll();
                                                };
                                                cbar.appendChild(zoomOut);cbar.appendChild(zoomSlider);cbar.appendChild(zoomIn);cbar.appendChild(zoomLabel);
                                                var cbtnSkip = document.createElement("button");
                                                cbtnSkip.textContent="\u{1f5bc} \u4e0d\u88c1\u526a";cbtnSkip.style.cssText="padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:var(--anima-ink-chip);cursor:pointer;font-size:13px;";
                                                cbtnSkip.onclick=function(){
                                                    _thumbs2[t] = JSON.stringify({url:imgUrl, px:50, py:50, zoom:0});
                                                    saveThumbs2();
                                                    // 不裁剪存本地（等完成再刷新）
                                                    var cv3 = document.createElement("canvas"); cv3.width = VW; cv3.height = VH;
                                                    var ctx3 = cv3.getContext("2d"); ctx3.fillStyle = "#000"; ctx3.fillRect(0,0,VW,VH);
                                                    var nw4=cimg.naturalWidth, nh4=cimg.naturalHeight;
                                                    var scale4 = Math.min(VW/nw4, VH/nh4);
                                                    var dw=Math.round(nw4*scale4), dh=Math.round(nh4*scale4);
                                                    ctx3.drawImage(cimg, (VW-dw)/2, (VH-dh)/2, dw, dh);
                                                    fetch("/danbooru_anima/save_thumb",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag:t, image:cv3.toDataURL("image/jpeg",0.85)})}).then(function(r6){return r6.json()}).then(function(d6){if(d6.success&&d6.url){_thumbs2[t]=d6.url;saveThumbs2();}renderAll();}).catch(function(){renderAll();});
                                                    cov.remove();
                                                    saveThumbs2(); cov.remove(); renderAll();
                                                };
                                                cbar.appendChild(cbtnCancel);cbar.appendChild(cbtnSkip);cbar.appendChild(cbtnOk);
                                                cov.appendChild(cbox); cov.appendChild(cbar); document.body.appendChild(cov);
                                                if(cimg.complete && cimg.naturalWidth) cimg.onload();
                                            }
                                            var ti2 = document.createElement("img");
                                            ti2.src = "/gelbooru_anima/image_proxy?url="+encodeURIComponent(p.preview_url||p.sample_url||"");
                                            ti2.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;";
                                            ti2.onerror = function(){ c2.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--anima-mute);">❌</div>'; };
                                            c2.appendChild(ti2); grid3.appendChild(c2);
                                        });
                                        // 翻页
                                        var pgBar = document.createElement("div");
                                        pgBar.style.cssText = "display:flex;gap:8px;justify-content:center;margin-top:8px;flex-shrink:0;";
                                        var pgPrev = document.createElement("button");
                                        pgPrev.textContent = animaTxt("◀ 上一页"); pgPrev.disabled = _gelPage<=0;
                                        pgPrev.style.cssText = "padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:"+(_gelPage>0?"var(--anima-accent-soft)":"#555")+";cursor:"+(_gelPage>0?"pointer":"default")+";font-size:13px;";
                                        pgPrev.onclick = function(){ if(_gelPage>0) doGelSearch(_gelPage-1); };
                                        var pgNext = document.createElement("button");
                                        pgNext.textContent = animaTxt("下一页 ▶"); pgNext.disabled = posts.length<30;
                                        pgNext.style.cssText = "padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:"+(posts.length>=30?"var(--anima-accent-soft)":"#555")+";cursor:"+(posts.length>=30?"pointer":"default")+";font-size:13px;";
                                        pgNext.onclick = function(){ doGelSearch(_gelPage+1); };
                                        pgBar.appendChild(pgPrev); pgBar.appendChild(pgNext);
                                        var oldPg = bx3.querySelector(".gel-pg-bar"); if(oldPg) oldPg.remove();
                                        pgBar.className = "gel-pg-bar"; bx3.appendChild(pgBar);
                                    }).catch(function(){grid3.innerHTML='<div style="color:#e94560;text-align:center;grid-column:1/-1;padding:20px;">搜索失败</div>';});
                                    }
                                    doGelSearch(0);
                                };
                                td.appendChild(setBtn);
                                card.appendChild(td);
                                card.appendChild(setBtn);
                                // 标签名
                                const nm = document.createElement("div");
                                nm.textContent = t.replace(/_/g," "); nm.style.cssText = "color:#ddd;font-weight:600;line-height:1.2;word-break:break-word;font-size:13px;";
                                card.appendChild(nm);
                                if (_editMode) {
                                    const cnEdit = document.createElement("span");
                                    cnEdit.textContent = cn || "点击添加翻译";
                                    cnEdit.style.cssText = "color:"+(cn?"var(--anima-ink-chip)":"#555")+";font-size:13px;line-height:1.2;cursor:text;border-bottom:1px dashed rgba(255,255,255,0.15);padding:0 4px;";
                                    cnEdit.title = "点击编辑翻译";
                                    cnEdit.onclick = function(e3){ e3.stopPropagation();
                                        var inp3 = document.createElement("input");
                                        inp3.type="text";inp3.value=cn||"";
                                        inp3.style.cssText = "position:fixed;z-index:99999;width:100px;padding:2px 4px;border-radius:8px;border:1px solid var(--anima-accent-soft);background:rgba(8,10,14,.88);color:#ffffff;font-size:12px;outline:none;";
                                        var rect=cnEdit.getBoundingClientRect();inp3.style.left=rect.left+"px";inp3.style.top=rect.top+"px";
                                        document.body.appendChild(inp3);inp3.focus();inp3.select();
                                        inp3.onblur = function(){ var v=inp3.value.trim();inp3.remove();if(v){_allTranslations[t]=v;cnEdit.textContent=v;cnEdit.style.color="var(--anima-ink-chip)";try{localStorage.setItem("apc_translations",JSON.stringify(_allTranslations));}catch(e){}}else if(!cn){cnEdit.textContent=animaTxt("点击添加翻译");cnEdit.style.color="#555";} };
                                        inp3.onkeydown = function(e4){ if(e4.key==="Enter"){e4.preventDefault();inp3.blur();}if(e4.key==="Escape"){e4.preventDefault();inp3.remove();} };
                                    };
                                    card.appendChild(cnEdit);
                                } else if (cn) { const cnDiv = document.createElement("div"); cnDiv.textContent = cn; cnDiv.style.cssText = "color:var(--anima-ink-chip);font-size:13px;line-height:1.2;"; card.appendChild(cnDiv); }
                                if (_editMode) {
                                    const del2 = document.createElement("span");
                                    del2.textContent = "✕"; del2.style.cssText = "cursor:pointer;color:#e94560;font-weight:bold;font-size:14px;position:absolute;top:4px;left:4px;z-index:1;";
                                    del2.onclick = (e) => { e.stopPropagation(); if(!confirm("确定删除标签「"+t.replace(/_/g," ")+"」？"))return; var isC2=(_customPresets[ck2]||[]).includes(t); if(isC2){_customPresets[ck2]=_customPresets[ck2].filter(function(x){return x!==t;});saveCustom();}else{if(!_deleted[ck2])_deleted[ck2]={};_deleted[ck2][t]=true;_removed2[t]=_thumbs2[t]||"";saveThumbs2();try{localStorage.setItem("apc_deleted",JSON.stringify(_deleted));}catch(e){}}renderAll();};
                                    card.appendChild(del2);
                                    // 子分类分配（仅身体特征）
                                    if (_subCats) {
                                        const subSel = document.createElement("select");
                                        subSel.style.cssText = "position:absolute;bottom:4px;right:4px;font-size:11px;padding:1px 2px;border-radius:3px;border:1px solid "+col+"44;background:var(--anima-well);color:#ccc;z-index:1;max-width:55px;";
                                        var allCats2 = getAllSubCats();
                                        for (var si2=0;si2<allCats2.length;si2++) {
                                            var sv = allCats2[si2][0], sl2 = allCats2[si2][1];
                                            if (sv==="all") continue;
                                            const o2 = document.createElement("option");
                                            o2.value = sv; o2.textContent = sl2;
                                            if ((_subAssign[t]||autoClassify(t))===sv) o2.selected = true;
                                            subSel.appendChild(o2);
                                        }
                                        subSel.onchange = function() { _subAssign[t] = subSel.value; saveSubAssign(); renderAll(); };
                                        subSel.onclick = function(e2) { e2.stopPropagation(); };
                                        card.appendChild(subSel);
                                    }
                                }
                                grid2.appendChild(card);
                            }
                            body2.appendChild(grid2);
                        }
                        renderAll();
                        
                        // 翻译所有标签
                        const allTags = [...(PRESETS[ck2]||[]).filter(t => !(_deleted[ck2]||{})[t]), ...(_customPresets[ck2]||[])];
                        if (allTags.length) {
                            fetch("/danbooru_anima/translate_tags", {
                                method:"POST",headers:{"Content-Type":"application/json"},
                                body:JSON.stringify({tags:allTags, cloud:false})
                            }).then(r=>r.json()).then(d=>{var _td=(d.success&&d.translations)||{};for(var _k in _td){_allTranslations[_k]=_td[_k]||"";}renderAll();}).catch(()=>{});
                        }
}
                    

            
            // ── 通用标签分类按钮 ──
            const catRow = document.createElement("div");
            catRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;padding:4px 0;margin-bottom:4px;";
            for (const [ck, cl, cc] of CATS) {
                const btn = document.createElement("span");
                btn.textContent = cl; btn.title = cl + " - 管理标签";
                btn.style.cssText = "padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;color:"+cc+";border:1px solid "+cc+"44;background:rgba(255,255,255,0.03);transition:all 0.2s ease;user-select:none;";
                btn.onmouseover = () => { btn.style.background=cc+"22"; btn.style.borderColor=cc; };
                btn.onmouseout = () => { btn.style.background="rgba(255,255,255,0.03)"; btn.style.borderColor=cc+"44"; };
                btn.onclick = () => { showTagPopup(ck, cl, cc); };
                catRow.appendChild(btn);
            }
            gCard.appendChild(catRow);

            panel.appendChild(gCard);
            
            // ── 自然语言 ──
            const nlCard = document.createElement("div"); nlCard.style.cssText = "flex-shrink:0;margin-top:4px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:10px 10px 10px 12px;margin-bottom:8px;box-shadow:inset 0 1px 0 rgba(255,255,255,.18);";
            nlCard.appendChild(mkLabel(animaTxt("💬 自然语言"), "var(--anima-accent-soft)"));
            let _nlItems = [];
            try { _nlItems = JSON.parse(w.natural_language?.value || "[]"); } catch(e) { _nlItems = []; }
            const nlContainer = document.createElement("div"); nlContainer.style.cssText = "display:flex;flex-direction:column;gap:6px;";
            
            function syncNL() {
                const arr = _nlItems.map(function(it){ return {cn:it.cn||"", en:it.en||"", position:it.position||"end"}; });
                setW("natural_language", JSON.stringify(arr));
                refreshPreview();
            }
            
            function renderNL() {
                nlContainer.innerHTML = "";
                for (let i = 0; i < _nlItems.length; i++) {
                    const it = _nlItems[i];
                    const row = document.createElement("div");
                    row.style.cssText = "display:flex;gap:4px;align-items:center;";
                    const inp = document.createElement("input");
                    inp.type = "text"; inp.value = it.cn || ""; inp.placeholder = animaTxt("输入中文自然语言...");
                    inp.style.cssText = "flex:1;padding:4px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(8,10,14,.88);color:#ffffff;font-size:13px;outline:none;";
                    const posSel = document.createElement("select");
                    posSel.style.cssText = "padding:4px 6px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(8,10,14,.88);color:#ffffff;font-size:12px;";
                    const positions = [
                        ["start","最前面"],["after_quality","质量词后"],["after_meta","元标签后"],["after_time","时间词后"],["after_count","人数后"],
                        ["after_character","角色后"],["after_safety","安全词后"],["after_artist","画师后"],["end","最后面"]
                    ];
                    for (const [pv, pl] of positions) {
                        const opt = document.createElement("option");
                        opt.value = pv; opt.textContent = pl;
                        if (it.position === pv) opt.selected = true;
                        posSel.appendChild(opt);
                    }
                    posSel.onchange = function(){ _nlItems[i].position = posSel.value; syncNL(); };
                    const delBtn = document.createElement("button");
                    delBtn.textContent = "✕"; delBtn.style.cssText = "padding:4px 7px;border-radius:8px;border:1px solid rgba(255,255,255,.16);cursor:pointer;background:var(--anima-accent-hi);color:#e94560;font-size:13px;";
                    delBtn.onclick = function(){ _nlItems.splice(i,1); renderNL(); setTimeout(function(){ try { if (!_nlItems.length) { _nlItems = JSON.parse(w.natural_language?.value || "[]"); renderNL(); } } catch(e) {} }, 200); setTimeout(function(){ try { if (!_nlItems.length) { _nlItems = JSON.parse(w.natural_language?.value || "[]"); renderNL(); } } catch(e) {} }, 800); syncNL(); };
                    
                    let _nlTimer = null;
                    inp.oninput = function(){ _nlItems[i].cn = inp.value; syncNL(); };
                    var tlBtn = document.createElement("button");
                    tlBtn.textContent = "🌐"; tlBtn.title = animaTxt("翻译为英文");
                    tlBtn.style.cssText = "padding:4px 7px;border-radius:8px;border:1px solid rgba(255,255,255,.16);cursor:pointer;background:var(--anima-accent-hi);color:var(--anima-accent-soft);font-size:12px;";
                    tlBtn.onclick = function(){ 
                        var q = inp.value.trim(); if (!q) return;
                        tlBtn.textContent = "..."; tlBtn.disabled = true;
                        translateNL(q, function(en){ 
                            _nlItems[i].en = en; syncNL(); if (row._enLabel) row._enLabel.textContent = en;
                            tlBtn.textContent = "🌐"; tlBtn.disabled = false;
                        });
                    };
                    row.appendChild(tlBtn);
                    var enLabel = document.createElement("span");
                    enLabel.style.cssText = "color:var(--anima-accent-soft);font-size:11px;word-break:break-all;max-width:200px;";
                    if (_nlItems[i].en) enLabel.textContent = _nlItems[i].en;
                    row.appendChild(enLabel);
                    // Store reference for update
                    row._enLabel = enLabel;row.appendChild(inp); row.appendChild(posSel); row.appendChild(delBtn);
                    nlContainer.appendChild(row);
                }
                const addBtn = document.createElement("button");
                addBtn.textContent = animaTxt("➕ 添加自然语言");
                addBtn.style.cssText = "padding:5px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.22);cursor:pointer;background:rgba(255,255,255,.08);color:var(--anima-accent-soft);font-size:12px;width:100%;";
                addBtn.onclick = function(){ _nlItems.push({cn:"",en:"",position:"end"}); renderNL(); setTimeout(function(){ try { if (!_nlItems.length) { _nlItems = JSON.parse(w.natural_language?.value || "[]"); renderNL(); } } catch(e) {} }, 200); setTimeout(function(){ try { if (!_nlItems.length) { _nlItems = JSON.parse(w.natural_language?.value || "[]"); renderNL(); } } catch(e) {} }, 800); };
                nlContainer.appendChild(addBtn);
            }
            
            // 自然语言翻译——和文本透传同款
            function translateNL(text, callback) {
                var _tf3 = window.animaTranslateFields();
                var _miss3 = window.animaTransConfigError(_tf3.cfg);
                if (_miss3) { alert(_miss3); callback(""); return; }

                fetch("/danbooru_anima/cloud_translate", {
                    method: "POST", headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({tags: [text], provider: _tf3.provider, api_key: _tf3.api_key, model: _tf3.model, base_url: _tf3.base_url, baidu_appid: _tf3.baidu_appid, as_sentence: true, from_lang: "zh", to_lang: "en"})
                }).then(function(r){return r.json()}).then(function(d){
                    var en = "";
                    if (d.success && d.translations) { en = (Object.values(d.translations)[0] || "").replace(/\.$/,""); }
                     callback(en);
                }).catch(function(e){  callback(""); });
            }
            
            renderNL(); setTimeout(function(){ try { if (!_nlItems.length) { _nlItems = JSON.parse(w.natural_language?.value || "[]"); renderNL(); } } catch(e) {} }, 200); setTimeout(function(){ try { if (!_nlItems.length) { _nlItems = JSON.parse(w.natural_language?.value || "[]"); renderNL(); } } catch(e) {} }, 800);
            nlCard.appendChild(nlContainer);
            panel.appendChild(nlCard);

            // ── 预览（右侧浮窗） ──
            const previewCard = document.createElement("div");
            previewCard.style.cssText = "flex-shrink:0;margin-top:6px;border-top:1px solid rgba(255,255,255,.15);padding-top:8px;";
            previewCard.appendChild($el("span",{textContent:"👁️ 预览",style:{color:"#ffffff",fontSize:"14px",fontWeight:"800",display:"block",marginBottom:"6px",letterSpacing:"0"}}));
            const previewEl = document.createElement("div");
            previewEl.style.cssText = "color:var(--anima-ink-chip);font-size:13px;line-height:1.8;min-height:24px;word-break:break-all;background:rgba(8,10,14,.88);padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.16);white-space:pre-wrap;";
            previewCard.appendChild(previewEl);
            panel.appendChild(previewCard);

            // ── 默认质量词（必须在使用前定义） ──
            const DEFAULT_QUALITY = {
                "Anima": "masterpiece, best quality, score_7, score_9, very aesthetic, ultra detailed",
                "Noob": "masterpiece, best quality, newest, absurdres, highres",
                "Aesthetic": "masterpiece, best quality, very aesthetic, ultra detailed",
            };

            node.addDOMWidget("anima_composer_ui", "div", panel, {show_title: false});
            collapseHiddenWidgets();
            setTimeout(collapseHiddenWidgets, 80);
            setTimeout(collapseHiddenWidgets, 400);

            
            // 保存角色卡
            function esc(s){ return (s||"").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
            
            // 角色卡列表弹窗
            function showCharCardList() {
                var ov = document.createElement("div");
                ov.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;";
                ov.onclick = function(e){ if(e.target===ov) ov.remove(); };
                var bx = document.createElement("div");
                bx.style.cssText = "background:linear-gradient(180deg,#1c2228 0%,#14181c 140px);border:1px solid #2a3238;border-radius:14px;box-shadow:0 18px 50px -12px rgba(0,0,0,0.7);padding:12px;width:600px;max-height:85vh;overflow-y:auto;display:flex;flex-direction:column;";
                bx.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:var(--anima-accent-soft);font-weight:bold;font-size:14px;">角色卡</span><button id="ccl-close" style="padding:3px 10px;border-radius:999px;border:1px solid rgba(233,69,96,0.4);cursor:pointer;background:linear-gradient(135deg,rgba(233,69,96,0.15),rgba(233,69,96,0.06));color:#e94560;font-size:12px;font-weight:bold;">关闭</button></div><div id="ccl-body" style="color:var(--anima-mute);text-align:center;padding:20px;">加载中...</div>';
                bx.querySelector("#ccl-close").onclick = function(){ ov.remove(); };
                document.body.appendChild(bx);
                fetch("/anima_random/character_cards").then(function(r){return r.json()}).then(function(d){
                    var cards = d.cards||[]; var body = bx.querySelector("#ccl-body");
                    body.innerHTML = ""; body.style.cssText = "";
                    if(!cards.length){ body.innerHTML = '<div style="color:var(--anima-mute);text-align:center;padding:20px;">暂无角色卡</div>'; return; }
                    var grid = document.createElement("div");
                    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;";
                    for(var i=0;i<cards.length;i++){ (function(cc){
                        var card = document.createElement("div");
                        card.style.cssText = "display:flex;flex-direction:column;align-items:center;padding:4px;border-radius:6px;cursor:pointer;background:var(--anima-well);border:1px solid rgba(255,255,255,.16);position:relative;";
                        card.onmouseover = function(){ card.style.background="var(--anima-well)"; };
                        card.onmouseout = function(){ card.style.background="var(--anima-well)"; };
                        card.onclick = function(){
                            ov.remove(); var cur = chInp.value.split(/[,，]+/).map(function(t){return t.trim();}).filter(Boolean);
                            if(!cur.includes(cc.name)){ cur.push(cc.name); chInp.value = cur.join(", "); setW("character_tags",chInp.value); }
                            if(cc.series && !w.series_tags?.value?.includes(cc.series)){ var ss = w.series_tags?.value ? w.series_tags.value.split(/[,，]+/).map(function(t){return t.trim();}).filter(Boolean) : []; if(!ss.includes(cc.series)){ ss.push(cc.series); setW("series_tags",ss.join(", ")); sInp.value = ss.join(", "); } }
                            if(cc.tags){ var ts = typeof cc.tags==="string"?cc.tags.split(/[,，]+/).map(function(t){return t.trim();}).filter(Boolean):(cc.tags||[]); for(var j=0;j<ts.length;j++){ if(ts[j] && !_gTagSet.has(ts[j])){ _gTagSet.add(ts[j]); } } renderGChips(); syncG(); }
                            refreshPreview();
                        };
                        if(cc.thumb){ var tn = document.createElement("img"); tn.src = cc.thumb; tn.style.cssText = "width:130px;height:150px;border-radius:4px;object-fit:contain;background:var(--anima-bg);"; tn.onerror = function(){ tn.style.display="none"; }; card.appendChild(tn); }
                        var nm = document.createElement("div"); nm.textContent = cc.name||""; nm.style.cssText = "color:#ffffff;font-size:13px;font-weight:bold;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;margin-top:3px;"; card.appendChild(nm);
                        var delBtn = document.createElement("button"); delBtn.textContent = "🗑"; delBtn.style.cssText = "position:absolute;top:1px;right:1px;padding:1px 4px;border-radius:3px;border:none;cursor:pointer;background:rgba(233,69,96,0.6);color:#fff;font-size:12px;";
                        delBtn.onclick = function(e){ e.stopPropagation(); if(confirm("删除角色卡 "+cc.name+"?")){ ((typeof window.deleteCharacterCard==="function")?window.deleteCharacterCard(cc):fetch("/anima_random/character_cards/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:cc.id})})).then(function(){ card.remove(); }); } };
                        card.appendChild(delBtn);
                        var edBtn = document.createElement("button"); edBtn.textContent = "✏️"; edBtn.style.cssText = "position:absolute;top:1px;right:22px;padding:1px 4px;border-radius:3px;border:none;cursor:pointer;background:rgba(var(--anima-accent-rgb),0.6);color:#fff;font-size:11px;";
                        edBtn.onclick = function(e){ e.stopPropagation(); ov.remove(); var etgs = typeof cc.tags==="string"?cc.tags.split(/[,，]+/).map(function(t){return t.trim();}).filter(Boolean):(cc.tags||[]); window.saveCharCard(cc.name||"",cc.series||"",etgs,cc.thumb||"",false); };
                        card.appendChild(edBtn); grid.appendChild(card);
                    })(cards[i]); }
                    body.appendChild(grid);
                }).catch(function(){ bx.querySelector("#ccl-body").innerHTML = '<div style="color:#e94560;text-align:center;padding:20px;">加载失败</div>'; });
            }

            function showCharCardManager() {
                var ov = document.createElement("div");
                ov.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:transparent;z-index:99999;display:flex;align-items:center;justify-content:center;pointer-events:none;";
                ov.onclick = function(e){ if(e.target===ov) ov.remove(); };
                var bx = document.createElement("div");
                bx.style.cssText = "background:linear-gradient(180deg,#1c2228 0%,#14181c 140px);border:1px solid #2a3238;border-radius:14px;box-shadow:0 18px 50px -12px rgba(0,0,0,0.7);padding:12px;width:650px;max-height:85vh;overflow-y:auto;display:flex;flex-direction:column;pointer-events:auto;";
                bx.style.cursor = "grab";
                bx.innerHTML = "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;\"><span style=\"color:var(--anima-accent-soft);font-weight:bold;font-size:15px;\">角色卡管理</span><button id=\"ccm-close\" style=\"padding:3px 10px;border-radius:999px;border:1px solid rgba(233,69,96,0.4);cursor:pointer;background:linear-gradient(135deg,rgba(233,69,96,0.15),rgba(233,69,96,0.06));color:#e94560;font-size:12px;font-weight:bold;\">关闭</button></div><div id=\"ccm-grid\" style=\"color:var(--anima-mute);text-align:center;padding:20px;\">加载中...</div>";
                bx.querySelector("#ccm-close").onclick = function(){ _ccmClean(); ov.remove(); };
                ov.onclick = function(e){ if(e.target===ov) { _ccmClean(); ov.remove(); } };
                // 拖拽
                var _ccmDrag=false,_ccmDx=0,_ccmDy=0;
                var _ccmMove=function(e2){if(!_ccmDrag)return;bx.style.left=(e2.clientX-_ccmDx)+"px";bx.style.top=(e2.clientY-_ccmDy)+"px"};
                var _ccmUp=function(){_ccmDrag=false;try{localStorage.setItem("apc_ccm_pos",JSON.stringify({left:bx.offsetLeft,top:bx.offsetTop}));}catch(e){}};
                var _ccmClean=function(){document.removeEventListener("mousemove",_ccmMove);document.removeEventListener("mouseup",_ccmUp);};
                bx.addEventListener("mousedown",function(e2){if(e2.target.tagName==="BUTTON")return;_ccmDrag=true;_ccmDx=e2.clientX-bx.offsetLeft;_ccmDy=e2.clientY-bx.offsetTop;bx.style.position="fixed";bx.style.margin="0";bx.style.left=bx.offsetLeft+"px";bx.style.top=bx.offsetTop+"px";e2.preventDefault();});
                document.addEventListener("mousemove",_ccmMove);
                document.addEventListener("mouseup",_ccmUp);
                try{var _ccmPos=JSON.parse(localStorage.getItem("apc_ccm_pos")||"{}");if(_ccmPos.left){bx.style.left=_ccmPos.left+"px";bx.style.top=_ccmPos.top+"px";bx.style.position="fixed";bx.style.margin="0";}}catch(e){} setTimeout(function(){ window.clampPopup(bx); },0);
                ov.appendChild(bx); document.body.appendChild(ov);
                var grid = bx.querySelector("#ccm-grid");
                fetch("/anima_random/character_cards").then(function(r){return r.json()}).then(function(d){
                    var cards = d.cards || [];
                    grid.innerHTML = ""; grid.style.display = "grid"; grid.style.gridTemplateColumns = "repeat(auto-fill,minmax(180px,1fr))"; grid.style.gap = "8px";
                    if (!cards.length) { grid.style.display = "block"; grid.innerHTML = "<div style=\"color:var(--anima-mute);text-align:center;padding:20px;\">暂无角色卡</div>"; return; }
                    for (var ci=0; ci<cards.length; ci++) {
                        var cd = cards[ci];
                        var card = document.createElement("div");
                        card.style.cssText = "display:flex;flex-direction:column;align-items:center;padding:4px;border-radius:6px;background:var(--anima-well);border:1px solid rgba(255,255,255,.16);position:relative;";
                        if (cd.thumb) {
                            var tn = document.createElement("img");
                            tn.src = cd.thumb; tn.style.cssText = "width:100%;height:140px;border-radius:4px;object-fit:contain;background:var(--anima-bg);";
                            tn.onerror = function(){ this.style.display = "none"; };
                            card.appendChild(tn);
                        }
                        var nm = document.createElement("div");
                        nm.textContent = cd.name || ""; nm.style.cssText = "color:#ffffff;font-size:12px;font-weight:bold;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;text-align:center;";
                        card.appendChild(nm);
                        if (cd.series) {
                            var sr = document.createElement("div");
                            sr.textContent = cd.series; sr.style.cssText = "color:var(--anima-accent-soft);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;text-align:center;";
                            card.appendChild(sr);
                        }
                        var edBtn = document.createElement("button");
                        edBtn.textContent = animaTxt("编辑"); edBtn.title = animaTxt("编辑");
                        edBtn.style.cssText = "padding:2px 6px;margin:2px;border-radius:3px;border:none;cursor:pointer;background:var(--anima-well);color:var(--anima-accent-soft);font-size:12px;";
                        edBtn.onclick = (function(cardData){ return function(e){ e.stopPropagation();
                            var tags = (cardData.tags||"").split(/[,，]+/).filter(Boolean);
                            window.saveCharCard(cardData.name||"", cardData.series||"", tags, cardData.thumb||"", false, (window.isAdexCharCard&&window.isAdexCharCard(cardData))?"":(cardData.id||""));
                            ov.remove();
                        }})(cd);
                        card.appendChild(edBtn);
                        var delBtn = document.createElement("button");
                        delBtn.textContent = animaTxt("删除"); delBtn.title = animaTxt("删除");
                        delBtn.style.cssText = "padding:2px 6px;margin:2px;border-radius:3px;border:none;cursor:pointer;background:#5a1a1a;color:#ff8a80;font-size:12px;";
                        delBtn.onclick = (function(cardData, cardEl){ return function(e){ e.stopPropagation();
                            if (!confirm("确定删除 "+cardData.name+" ？")) return;
                            ((typeof window.deleteCharacterCard==="function")?window.deleteCharacterCard(cardData):fetch("/anima_random/character_cards/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:cardData.id})})).then(function(){ cardEl.remove(); });
                        }})(cd, card);
                        card.appendChild(delBtn);
                        var outBtn = document.createElement("button");
                        outBtn.textContent = animaTxt("输出"); outBtn.title = animaTxt("输出到节点");
                        outBtn.style.cssText = "padding:2px 6px;margin:2px;border-radius:3px;border:none;cursor:pointer;background:var(--anima-accent-hi);color:var(--anima-accent-soft);font-size:12px;border:1px solid rgba(var(--anima-accent-rgb),0.3);";
                        outBtn.onclick = (function(cardData){ return function(e){ e.stopPropagation();
                            var outTags = (cardData.tags||"").split(/[,，]+/).map(function(t){return t.trim();}).filter(Boolean);
                            var curCh = chInp.value.split(/[,，]+/).map(function(t){return t.trim();}).filter(Boolean);
                            if (cardData.name && !curCh.includes(cardData.name)) { curCh.push(cardData.name); chInp.value = curCh.join(", "); setW("character_tags", chInp.value); }
                            if (cardData.series) { var curS = w.series_tags?.value ? w.series_tags.value.split(/[,，]+/).map(function(t){return t.trim();}).filter(Boolean) : []; if (!curS.includes(cardData.series)) { curS.push(cardData.series); setW("series_tags", curS.join(", ")); sInp.value = curS.join(", "); } }
                            var traits = outTags.filter(function(t){ return t !== cardData.name && t !== cardData.series && !/^\d/.test(t) && !/^(1girl|1boy|solo|multiple)/i.test(t); });
                            for (var ti=0; ti<traits.length; ti++) { addGTag(traits[ti], null); }
                            refreshPreview(); ov.remove();
                        }})(cd);
                        card.appendChild(outBtn);
                        grid.appendChild(card);
                    }
                }).catch(function(){ grid.innerHTML = "<div style=\"color:#e94560;text-align:center;padding:20px;\">加载失败</div>"; });
            }
function refreshPreview() {
                const mode = MODES[w.model_mode?.value || 0];
                const q = w.quality_tags?.value || DEFAULT_QUALITY[mode];
                const ct = w.count_tags?.value || "";
                const ch = w.character_tags?.value || "";
                const s = w.series_tags?.value || "";
                const a = w.artist_tags?.value || "";
                const g = w.general_tags?.value || "";
                const tm = w.time_tag?.value ? (w.time_tag.value === "(无)" ? "" : w.time_tag.value) : "";
                const sf = w.safety_tag?.value ? (w.safety_tag.value === "(无)" ? "" : w.safety_tag.value) : "";
                const _mtArr = (w.meta_tags?.value || "").split(/[,，]+/).map(function(t){return t.trim();}).filter(Boolean);
const mt = _mtArr.join(", ");
                const isNoob = mode === "Noob";
                const isAnima = mode === "Anima";
                // 格式化函数
                function fmtTag(t) { return t.replace(/_/g, " ").replace(/\(([^:)]*)\)/g, "\\($1\\)"); }
                function fmtArtist(t) { return t.split(",").map(function(at){ at=at.trim(); if(!at)return""; var f=fmtTag(at); if (!isAnima) return f; return f.indexOf("@")===0 ? f : "@"+f; }).filter(Boolean).join(", "); }
                var rawSegs = []; // [[pos,tag],[pos,tag],...]
                function addSeg(pos, txt) { if(txt) rawSegs.push([pos, txt]); }
                if (isNoob) {
                    if (ct) addSeg("count", ct);
                    if (ch) addSeg("char", ch.split(",").map(fmtTag).join(", "));
                    if (s) addSeg("series", s.split(",").map(fmtTag).join(", "));
                    if (a) addSeg("artist", fmtArtist(a));
                    if (g) addSeg("general", g.split(",").map(fmtTag).join(", "));
                    if (q) { rawSegs.unshift(["quality", q]); }
                } else {
                    if (q) { rawSegs.push(["start", ""]); addSeg("quality", q); }
                    if (tm) addSeg("time", fmtTag(tm));
                    if (mt) addSeg("meta", mt);
                    if (sf) addSeg("safety", sf);
                    if (ct) addSeg("count", ct);
                    if (ch) addSeg("char", ch.split(",").map(fmtTag).join(", "));
                    if (s) addSeg("series", s.split(",").map(fmtTag).join(", "));
                    if (a) addSeg("artist", fmtArtist(a));
                    if (g) addSeg("general", g.split(",").map(fmtTag).join(", "));
                }
                // Insert NL items at correct positions
                var nlItems2 = []; try { nlItems2 = JSON.parse(w.natural_language?.value || "[]"); } catch(e) {}
                var nlGroups = {};
                for (var _ni = 0; _ni < nlItems2.length; _ni++) { var _it = nlItems2[_ni]; var _en = (_it.en||"").trim().replace(/\.$/, "").trim(); if (!_en) continue; var _pos = _it.position || "end"; if (!nlGroups[_pos]) nlGroups[_pos] = []; nlGroups[_pos].push(_en); }
                // Map NL positions to insertion points in rawSegs
                var _nlPosToSeg = {"after_quality":"quality","after_time":"time","after_meta":"meta","after_safety":"safety","after_count":"count","after_character":"char","after_artist":"artist"};
                function insertNL(nlPos) { if (!nlGroups[nlPos]) return; var targetPos = _nlPosToSeg[nlPos]; var insertIdx = rawSegs.length; if (targetPos) { for (var i = rawSegs.length - 1; i >= 0; i--) { if (rawSegs[i][0] === targetPos) { insertIdx = i + 1; break; } } } rawSegs.splice(insertIdx, 0, ...nlGroups[nlPos].map(function(e){ return ["nl", e]; })); delete nlGroups[nlPos]; }
                insertNL("after_artist");
                insertNL("after_character");
                insertNL("after_count");
                insertNL("after_safety");
                insertNL("after_meta");
                insertNL("after_time");
                insertNL("after_quality");
                if (nlGroups["start"]) rawSegs.unshift(...nlGroups["start"].map(function(e){ return ["nl", e]; }));
                if (nlGroups["end"]) rawSegs.push(...nlGroups["end"].map(function(e){ return ["nl", e]; }));
                var CAT_COL = {quality:"var(--anima-accent-soft)",time:"var(--anima-accent-soft)",meta:"var(--anima-accent-soft)",safety:"#ef9a9a",count:"var(--anima-accent-soft)",char:"#e2c48a",series:"#8fc9c0",artist:"#e3a8b8",general:"#e8d48a",nl:"var(--anima-accent-soft)"};
                var rawPartsHtml = rawSegs.filter(function(s){ return s[0]!=="start"; }).map(function(s){ var pos=s[0],txt=s[1]; var col=CAT_COL[pos]||"var(--anima-ink-chip)"; return '<span style="color:'+col+'">'+txt+'</span>'; });
                var isZH = (typeof animaIsZh === "function") ? animaIsZh() : true;
var CAT_ZH = {quality:isZH?"质量词":"Quality",time:isZH?"时间词":"Time",meta:isZH?"元标签":"Meta",safety:isZH?"安全词":"Safety",count:isZH?"计数":"Count",char:isZH?"角色":"Character",series:isZH?"系列":"Series",artist:isZH?"画师":"Artist",general:isZH?"通用":"General",nl:isZH?"自然语言":"NL"};
var pvLines = [];
function pvLine(cat, txt) { if(!txt)return; pvLines.push('<span style="color:'+(CAT_COL[cat]||"#fff")+';font-weight:600;">['+CAT_ZH[cat]+']</span> <span style="color:#ccc;">'+txt+'</span>'); }
pvLine("quality", q);
if (!isNoob) { pvLine("time", tm ? fmtTag(tm):""); pvLine("meta", mt); pvLine("safety", sf); }
pvLine("count", ct);
pvLine("char", ch.split(",").map(fmtTag).join(", "));
pvLine("series", s.split(",").map(fmtTag).join(", "));
pvLine("artist", isAnima ? fmtArtist(a) : fmtTag(a));
pvLine("general", g.split(",").map(fmtTag).join(", "));
var nlItems2 = []; try { nlItems2 = JSON.parse(w.natural_language?.value || "[]"); } catch(e) {}
for (var _ni = 0; _ni < nlItems2.length; _ni++) { var _it = nlItems2[_ni]; var _en2 = (_it.en||"").trim().replace(/\.$/, "").trim(); if (_en2) pvLine("nl", _en2); }
previewEl.innerHTML = (rawPartsHtml.length ? '<div style="color:var(--anima-accent-soft);font-size:13px;font-weight:700;margin-bottom:4px;letter-spacing:0;">📋 完整提示词</div><div style="padding:8px 10px;background:rgba(var(--anima-accent-rgb),0.06);border:1px solid rgba(var(--anima-accent-rgb),0.14);border-radius:8px;color:var(--anima-ink-chip);font-size:13px;word-break:break-all;margin-bottom:8px;">'+rawPartsHtml.join(", ")+'</div>' : "") + (pvLines.length ? '<div style="color:var(--anima-mute);font-size:12px;margin-bottom:2px;">'+(isZH?"分类明细":"Details")+'</div>'+pvLines.join("<br>") : "");
            }
            refreshPreview();

            (function(){if(document.getElementById("apc-anim"))return;var st=document.createElement("style");st.id="apc-anim";st.textContent="@keyframes sk-pulse{0%,100%{opacity:.3}50%{opacity:.6}}@keyframes sk-spin{to{transform:rotate(360deg)}}";document.head.appendChild(st);})();
            // ── AnimaDex 角色弹窗（全屏 modal）──
            function filterCards(pp) { for (const c of pp._grid.children) { const hf=(pp._hairSel?.value||"").replace(/ /g,"_"); const ef=(pp._eyeSel?.value||"").replace(/ /g,"_"); const sf=pp._seriesSel?.value||""; const t=(c.dataset.tags||"").replace(/ /g,"_"); let show=true; if(hf&&!t.includes(hf)) show=false; if(ef&&!t.includes(ef)) show=false; if(sf&&!t.includes(sf)) show=false; c.style.display=show?"":"none"; } }

            // ── G站 角色弹窗（全屏 modal）──

            // ── AnimaDex 画师弹窗（全屏 modal）──

            // ── 画师收藏弹窗 ──
                        

            // ── 延迟恢复 ──
            setTimeout(() => {
                if (w.count_tags?.value) cSel.value = w.count_tags.value;
                if (w.character_tags?.value) chInp.value = w.character_tags.value;
                if (w.series_tags?.value) sInp.value = w.series_tags.value;
                if (w.artist_tags?.value) aInp.value = w.artist_tags.value;
                if (w.general_tags?.value) {
                    _gTagList = w.general_tags.value.split(/[,，]+/).map(t=>t.trim()).filter(Boolean);
                    // 重新解析权重格式 (tag:1.2) → _gWeights
                    for (var _ti = 0; _ti < _gTagList.length; _ti++) {
                        var _rt = _gTagList[_ti];
                        var _rm = _rt.match(/^\((.+):(-?\d+(?:\.\d+)?)\)$/);
                        if (_rm) { _gWeights[_rm[1].trim()] = parseFloat(_rm[2]); _gTagList[_ti] = _rm[1].trim(); }
                    }
                    renderGChips();
                }
                // ── SortableJS 延迟初始化 ──
                _makeGSortable();
                updateModeBtn();
                refreshPreview();
            }, 200);

            // ── 延迟同步下拉值（ComfyUI 在 onNodeCreated 后恢复 widget 值）──
            setTimeout(function(){
                if (w.time_tag?.value && tSel.value !== w.time_tag.value) tSel.value = w.time_tag.value;
                if (w.safety_tag?.value && sfSel.value !== w.safety_tag.value) sfSel.value = w.safety_tag.value;
                if (w.meta_tags?.value) {
                    _mSelected = w.meta_tags.value.split(/[,，]+/).map(function(t){return t.trim();}).filter(Boolean);
                    renderMChips();
                }
            }, 200);

            // ═══ 导出给其他节点复用 ═══
            window.saveCharCard = (window.saveCharCard) || function(){ alert("未找到角色卡保存模块"); };
            window.openAdexPopup = (window.openAdexPopup) || function(){ alert("未找到 Animadex 弹窗模块"); };
            window.openGelCharsPopup = (window.openGelCharsPopup) || function(){ alert("未找到 G站 角色弹窗模块"); };
            window.openArtistBrowse = (window.openArtistBrowse) || function(){ alert("未找到 AnimaDex 画师弹窗模块"); };
            window.showArtistFavPopup = (window.showArtistFavPopup) || function(){ alert("未找到画师收藏弹窗模块"); };

            function _pickTagList(raw) {
                if (!raw) return [];
                if (Array.isArray(raw)) return raw.map(function(x){ return String(x).trim(); }).filter(Boolean);
                return String(raw).split(/[\s,，]+/).map(function(x){ return x.trim(); }).filter(Boolean);
            }
            function applyCharPick(it) {
                if (!it) return;
                var q = String(it.name || "").replace(/^@+/, "").replace(/[\s-]+/g, "_").toLowerCase();
                if (q) {
                    var cur = chInp.value.split(/[,，]+/).map(function(t){ return t.trim(); }).filter(Boolean);
                    if (cur.indexOf(q) < 0) { cur.push(q); chInp.value = cur.join(", "); setW("character_tags", chInp.value); }
                }
                if (it.copyright_name) {
                    var cp = String(it.copyright_name).replace(/[\s-]+/g, "_").toLowerCase();
                    var ss = (w.series_tags && w.series_tags.value ? w.series_tags.value : "").split(/[,，]+/).map(function(t){ return t.trim(); }).filter(Boolean);
                    if (cp && ss.indexOf(cp) < 0) { ss.push(cp); setW("series_tags", ss.join(", ")); sInp.value = ss.join(", "); }
                }
                var meta = ["highres","absurdres","full_body","cowboy_shot","half_body","portrait","close-up","animated","commentary","english_text","text_focus"];
                _pickTagList(it.tags).filter(function(t){
                    var tl = t.replace(/ /g, "_").toLowerCase();
                    return tl && tl !== q && !/^\d/.test(tl) && !/^(solo|1girl|1boy|multiple)/i.test(tl) && meta.indexOf(tl) < 0;
                }).slice(0, 8).forEach(function(t){ addGTag(t); });
                renderGChips(); syncG(); refreshPreview();
            }
            function applyArtistName(name) {
                var raw = String(name || "").replace(/^@+/, "").replace(/[\s-]+/g, "_").toLowerCase();
                if (!raw) return;
                var nn = "@" + raw;
                var cur = aInp.value.split(/[,，]+/).map(function(t){ return t.trim(); }).filter(Boolean);
                if (cur.indexOf(nn) < 0) { cur.push(nn); aInp.value = cur.join(", "); setW("artist_tags", aInp.value); }
                refreshPreview();
            }
            function applyArtistPick(it) { if (it && it.name) applyArtistName(it.name); }
            function applyArtistFav(nm) { applyArtistName(nm); }
            window._adexCharFallback = applyCharPick;
            window._adexFallbackSelect = function(it) { applyArtistPick(it); };
            window._adexFallbackAddTag = function(ft) { addGTag((ft || "").replace(/_/g, " ")); };
            window._gelFallbackSelect = function(it) { applyCharPick(it); };
            // ── AnimaDex 画师弹窗无回调时的兜底（对应 artist_browse_popup.js）──
            window._artistBrowseFallback = function(it) {
                if (!it || !it.name) return;
                const _raw = (it.name || "").replace(/[\s-]+/g, "_").toLowerCase();
                const nn = _raw.indexOf("@") === 0 ? _raw : "@" + _raw;
                const cur = aInp.value.split(/[,，]+/).map(function(t){return t.trim();}).filter(Boolean);
                if (!cur.includes(nn)) { cur.push(nn); aInp.value = cur.join(", "); setW("artist_tags", aInp.value); }
                refreshPreview();
            };
            // ── 画师收藏弹窗无回调时的兜底（对应 artist_fav_popup.js）──
            window._artistFavFallback = function(t) {
                if (!t) return;
                const nn = String(t).indexOf("@") === 0 ? String(t) : "@" + String(t);
                const cur = aInp.value.split(/[,，]+/).map(function(s){return s.trim();}).filter(Boolean);
                if (cur.indexOf(nn) < 0) { cur.push(nn); aInp.value = cur.join(", "); setW("artist_tags", aInp.value); }
            };
            window._artistFavFallbackRefresh = function() { refreshPreview(); };

        };
    },
});
