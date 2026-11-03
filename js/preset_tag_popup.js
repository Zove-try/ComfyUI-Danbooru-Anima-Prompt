import "./00_anima_i18n.js";
// preset_tag_popup.js - 预制 Tag 弹窗（独立模块，透传/模糊搜索共用）
// 数据源: /weilin_groups /weilin_subgroups /weilin_tags（weilin_tags.db，含 Tag 超市合并数据）
// 功能: 分类树 + 子分类胶囊 + tag 网格（缩略图）+ 搜索 + 编辑/多选/自定义 + 👁 隐藏成年限定限制级
// 不依赖任何节点存在；文件加载即注册

(() => {
    // esc 全局（独立文件必须自带）
    if (typeof window.esc !== "function") {
        window.esc = function(s){ return (s||"").replace(/</g,"&lt;").replace(/>/g,"&gt;"); };
    }
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

    // ── CSS sheen：集中式微交互动画（对齐透传节点 #tp-sheen-css 模式）──
    if (!document.getElementById("preset-sheen-css")) {
        var _ps = document.createElement("style");
        _ps.id = "preset-sheen-css";
        _ps.textContent = [
            ".ps-card{transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease,background .15s ease;}",
            ".ps-card:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(var(--anima-accent-rgb),0.2);border-color:rgba(var(--anima-accent-rgb),0.4)!important;background:rgba(var(--anima-accent-rgb),0.08)!important;}",
            ".ps-tab{transition:all .15s ease;}",
            ".ps-tab:hover{color:var(--anima-accent-soft)!important;background:rgba(var(--anima-accent-rgb),0.1)!important;border-color:rgba(var(--anima-accent-rgb),0.4)!important;}",
            ".ps-tree-item{transition:all .15s ease;}",
            ".ps-tree-item:hover{transform:translateY(-1px);box-shadow:0 2px 8px rgba(var(--anima-accent-rgb),0.12);border-color:rgba(var(--anima-accent-rgb),0.25)!important;}",
            ".ps-toolbar-btn{transition:all .15s ease;}",
            ".ps-toolbar-btn:hover{filter:brightness(1.3);transform:translateY(-1px);}",
        ].join("");
        document.head.appendChild(_ps);
    }

    const _showPresetTagPopup = (onSelect) => {
        if (window._presetTagPopupOpen) return;
        window._presetTagPopupOpen = true;

        // ── 布局容器（overlay 模式，不遮罩背景可操作外部） ──
        const ov = document.createElement("div");
        ov.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:99998;pointer-events:none;";
        document.body.appendChild(ov);

        const bx = document.createElement("div");
        bx.style.cssText = "position:fixed;top:10%;left:12%;width:820px;max-width:92vw;height:72vh;min-height:420px;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid rgba(var(--anima-accent-rgb),.45);border-radius:14px;box-shadow:0 18px 50px -12px rgba(0,0,0,0.7);display:flex;flex-direction:column;overflow:hidden;z-index:99999;resize:both;pointer-events:auto;min-width:480px;";
        // 恢复上次大小/位置
        try {
            const _sz = JSON.parse(localStorage.getItem("db_preset_size2") || "{}");
            if (_sz.w && _sz.w >= 400) bx.style.width = _sz.w + "px";
            if (_sz.h && _sz.h >= 300) bx.style.height = _sz.h + "px";
            if (_sz.left) bx.style.left = _sz.left + "px";
            if (_sz.top) bx.style.top = _sz.top + "px";
            // 恢复位置后强制拉回视口内（防止上次拖出页面导致刷新后卡死）
            setTimeout(() => window.clampPopup(bx), 0);
        } catch(e) {}
        if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(bx);
        ov.appendChild(bx);

        // ── 顶栏 ──
        const hdr = document.createElement("div");
        hdr.style.cssText = "display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--anima-line);cursor:grab;user-select:none;flex-shrink:0;";
        const title = document.createElement("span");
        title.textContent = "📂 预制 Tag";
        title.style.cssText = "color:var(--anima-accent-soft);font-weight:700;font-size:14px;";
        hdr.appendChild(title);
        // 搜索框
        const srch = document.createElement("input");
        srch.type = "text";
        srch.placeholder = "🔍 搜 tag（中英文均可，回车插第一条）";
        srch.style.cssText = "flex:1;min-width:120px;padding:6px 10px;border-radius:8px;border:1px solid var(--anima-line);background:linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%);color:#e0e0e0;font-size:12px;outline:none;";
        hdr.appendChild(srch);
        // 👁 眼睛（默认隐藏成年限定限制级）
        const eyeBtn = document.createElement("span");
        eyeBtn.textContent = "👁";
        eyeBtn.title = "显示/隐藏 成年限定限制级";
        eyeBtn.className = "ps-toolbar-btn";
        let _eyeOn = localStorage.getItem("db_preset_eye") === "1";
        eyeBtn.style.cssText = "padding:4px 8px;border-radius:6px;cursor:pointer;font-size:13px;color:var(--anima-mute);border:1px solid var(--anima-line);user-select:none;transition:all .15s ease;background:" + (_eyeOn ? "rgba(var(--anima-accent-rgb),0.15)" : "transparent") + ";";
        if (_eyeOn) eyeBtn.style.borderColor = "var(--anima-accent-soft)";
        hdr.appendChild(eyeBtn);
        // 编辑/多选/自定义
        const editBtn = document.createElement("span");
        editBtn.textContent = animaTxt("✏️ 编辑");
        editBtn.className = "ps-toolbar-btn";
        editBtn.style.cssText = "padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:#b0bec5;border:1px solid var(--anima-line);user-select:none;transition:all .15s ease;";
        hdr.appendChild(editBtn);
        const selBtn = document.createElement("span");
        selBtn.textContent = animaTxt("☐ 多选");
        selBtn.className = "ps-toolbar-btn";
        selBtn.style.cssText = "padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:#b0bec5;border:1px solid var(--anima-line);user-select:none;transition:all .15s ease;";
        hdr.appendChild(selBtn);
        const addBtn = document.createElement("span");
        addBtn.textContent = "＋";
        addBtn.title = "添加自定义 tag";
        addBtn.className = "ps-toolbar-btn";
        addBtn.style.cssText = "padding:4px 10px;border-radius:6px;cursor:pointer;font-size:14px;color:#ce93d8;border:1px solid #ce93d8;user-select:none;transition:all .15s ease;";
        hdr.appendChild(addBtn);
        // 关闭（在眼睛左边？用户说眼睛在关闭按钮左边——所以关闭在最右）
        const closeBtn = document.createElement("span");
        closeBtn.textContent = animaTxt("✕ 关闭");
        closeBtn.className = "ps-toolbar-btn";
        closeBtn.style.cssText = "padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:#e94560;border:1px solid rgba(233,69,96,0.4);user-select:none;transition:all .15s ease;";
        closeBtn.onclick = () => {
            _closed = true;
            clearTimeout(_srchTimer);
            _saveSize();
            document.removeEventListener("mousemove", _psOnMove);
            document.removeEventListener("mouseup", _psOnUp);
            ov.remove();
            window._presetTagPopupOpen = false;
        };
        hdr.appendChild(closeBtn);
        bx.appendChild(hdr);

        // 拖拽 + 大小保存
        const _saveSize = () => {
            try {
                const r = bx.getBoundingClientRect();
                if (r.width > 300 && r.height > 200) {
                    localStorage.setItem("db_preset_size2", JSON.stringify({
                        w: Math.round(r.width), h: Math.round(r.height),
                        left: Math.round(r.left), top: Math.round(r.top)
                    }));
                }
            } catch(e) {}
        };
        let _drag = false, _dx = 0, _dy = 0;
        hdr.onmousedown = (e) => {
            if (e.target.tagName === "INPUT") return;
            _drag = true; _dx = e.clientX - bx.offsetLeft; _dy = e.clientY - bx.offsetTop;
            e.preventDefault();
        };
        const _psOnMove = (e) => {
            if (!_drag) return;
            bx.style.position = "fixed";
            bx.style.left = (e.clientX - _dx) + "px";
            bx.style.top = (e.clientY - _dy) + "px";
            bx.style.margin = "0";
        };
        const _psOnUp = () => { if (_drag) { _drag = false; _saveSize(); } };
        document.addEventListener("mousemove", _psOnMove);
        document.addEventListener("mouseup", _psOnUp);

        // ── 主体：左分类树 + 右内容 ──
        const body = document.createElement("div");
        body.style.cssText = "flex:1;display:flex;overflow:hidden;min-height:0;min-width:0;width:100%;";
        bx.appendChild(body);

        // 左：分类树
        const tree = document.createElement("div");
        tree.style.cssText = "width:150px;flex-shrink:0;overflow-y:auto;border-right:1px solid var(--anima-line);padding:8px 6px;background:linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%);";
        body.appendChild(tree);

        // 右：子分类栏 + tag 网格
        const right = document.createElement("div");
        right.style.cssText = "flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0;min-width:0;width:100%;";
        body.appendChild(right);

        const subBar = document.createElement("div");
        subBar.style.cssText = "display:flex;gap:4px;padding:8px 8px;flex-shrink:0;flex-wrap:wrap;align-items:center;max-height:90px;overflow-y:auto;background:rgba(0,0,0,0.12);border-bottom:2px solid rgba(var(--anima-accent-rgb),0.2);margin-bottom:1px;";
        right.appendChild(subBar);

        // 批量操作栏（多选模式下显示）
        const batchBar = document.createElement("div");
        batchBar.style.cssText = "display:none;padding:4px 8px;flex-shrink:0;align-items:center;gap:8px;background:rgba(var(--anima-accent-rgb),0.05);border-bottom:2px solid rgba(var(--anima-accent-rgb),0.15);";
        right.appendChild(batchBar);

        const grid = document.createElement("div");
        // flex:1 + min-height:0 = flex 滚动容器标准写法（高度受 right 约束，内容超出滚动）
        grid.style.cssText = "flex:1;min-height:0;overflow-y:auto;padding:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;align-content:start;align-items:start;";
        right.appendChild(grid);

        // 底部拖拽条（当顶部标题栏被拖出视口时的备用拖拽点）
        const bottomBar = document.createElement("div");
        bottomBar.style.cssText = "height:10px;flex-shrink:0;cursor:move;border-top:1px solid var(--anima-line);background:rgba(0,0,0,0.15);transition:background .15s ease;";
        bottomBar.onmouseover = function(){ this.style.background = "rgba(var(--anima-accent-rgb),0.12)"; };
        bottomBar.onmouseout = function(){ this.style.background = "rgba(0,0,0,0.15)"; };
        bottomBar.onmousedown = (e) => {
            _drag = true; _dx = e.clientX - bx.offsetLeft; _dy = e.clientY - bx.offsetTop;
            e.preventDefault();
        };
        bx.appendChild(bottomBar);

        // ── 状态 ──
        let _groups = [];       // 大类列表
        let _curGid = null;     // 当前大类 id
        let _curSid = null;     // 当前子分类 id（null=全部）
        let _subs = [];         // 当前大类的子分类
        let _editMode = false;
        let _selMode = false;
        let _closed = false;
        const _selSet = new Set();
        let _customTags = {};   // 自定义 tag（localStorage db_preset_custom）
        let _deleted = {};      // 删除的 tag（localStorage db_preset_deleted）
        let _tagCategories = {};  // 本地分类映射（localStorage db_preset_cats）
        let _catOptions = [];      // 分类选项（从 tag_mapper_cats API 加载）
        let _lastTags = [];         // 上次加载的标签缓存（退出编辑模式时复用）

        // 加载自定义 tag / 删除记录（文件持久化，不清缓存不丢）
        const _loadCustom = () => {
            fetch("/danbooru_anima/preset_data").then(function(r){return r.json();}).then(function(d){
                // 合并而非覆盖：文件中的 key 只在内存中不存在时才写入
                var fd = d.deleted || {};
                for (var k in fd) { if (!(k in _deleted)) _deleted[k] = fd[k]; }
                var fc = d.custom_tags || {};
                for (var k in fc) { if (!(k in _customTags)) _customTags[k] = fc[k]; }
                var ft = d.tag_categories || {};
                for (var k in ft) { if (!(k in _tagCategories)) _tagCategories[k] = ft[k]; }
                // 首次加载后刷新网格（合并逻辑保护已删除的不会被恢复）
                if (grid.children.length > 0 && !grid.textContent.includes("加载中")) loadTags();
            }).catch(function(){});
        };
        _loadCustom();
        // 加载分类选项（用于编辑/多选模式下的分类功能）
        fetch("/danbooru_anima/tag_mapper_cats").then(function(r){return r.json();}).then(function(cs){
            _catOptions = cs.filter(function(c){return c.v;});
        }).catch(function(){});
        const _saveCustom = () => {
            var payload = {deleted: _deleted, custom_tags: _customTags, tag_categories: _tagCategories};
            fetch("/danbooru_anima/preset_data", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload)}).catch(function(){});
        };

        // 大类图标（先定义，loadGroups 使用）
        const _GROUP_ICON = (name) => {
            const map = {
                "人物": "🧬", "服饰": "👗", "表情动作": "🧘", "画面": "📷", "环境": "🏞",
                "场景": "🏰", "物品": "📦", "镜头": "🎥", "汉服": "👘", "魔法系": "🔮"
            };
            return map[name] || "📁";
        };

        // ── 加载大类 ──
        const loadGroups = () => {
            tree.innerHTML = '<div style="color:#555;padding:8px;font-size:11px;">加载中...</div>';
            fetch("/danbooru_anima/weilin_groups").then(r => r.json()).then(gs => {
                _groups = gs;
                renderTree();
                // 默认选第一个
                if (!_curGid && gs.length) { _curGid = gs[0].id; loadSubs(); renderTree(); }
            }).catch(() => { tree.innerHTML = '<div style="color:#e94560;padding:8px;font-size:11px;">加载失败</div>'; });
        };

        // ── 渲染分类树（每次切换时重绘，清除旧选中态）──
        const renderTree = () => {
            tree.innerHTML = "";
            for (const g of _groups) {
                const row = document.createElement("div");
                const isActive = g.id === _curGid;
                row.style.cssText = "padding:8px 10px;border-radius:8px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:6px;margin-bottom:3px;transition:all .18s ease;user-select:none;border:1px solid transparent;" +
                    (isActive
                        ? "background:rgba(var(--anima-accent-rgb),0.15);color:var(--anima-accent-soft);border-color:rgba(var(--anima-accent-rgb),0.35);font-weight:600;box-shadow:0 0 10px rgba(var(--anima-accent-rgb),0.12);"
                        : "color:#b0bec5;");
                row.className = "ps-tree-item";
                row.onmouseover = () => {
                    if (!isActive) { row.style.background = "rgba(255,255,255,0.06)"; row.style.transform = "translateY(-1px)"; row.style.borderColor = "rgba(var(--anima-accent-rgb),0.25)"; row.style.boxShadow = "0 2px 8px rgba(var(--anima-accent-rgb),0.1)"; }
                };
                row.onmouseout = () => {
                    if (!isActive) { row.style.background = "transparent"; row.style.transform = "none"; row.style.borderColor = "transparent"; row.style.boxShadow = ""; }
                };
                row.onmousedown = () => { row.style.transform = "scale(0.97)"; };
                row.onmouseup = () => { row.style.transform = ""; };
                row.onclick = () => {
                    _curGid = g.id; _curSid = null;
                    loadSubs(); renderSubs(); renderTree();
                };
                const icon = document.createElement("span");
                icon.textContent = _GROUP_ICON(g.name);
                icon.style.cssText = "font-size:14px;flex-shrink:0;";
                const nm = document.createElement("span");
                nm.textContent = g.name;
                nm.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
                const cnt = document.createElement("span");
                cnt.textContent = (g.sub_count || 0);
                cnt.style.cssText = "font-size:10px;color:" + (isActive ? "var(--anima-accent-soft)" : "var(--anima-mute-dim)") + ";flex-shrink:0;";
                row.appendChild(icon); row.appendChild(nm); row.appendChild(cnt);
                tree.appendChild(row);
            }
        };

        // ── 加载子分类 ──
        const loadSubs = () => {
            subBar.innerHTML = "";
            if (!_curGid) return;
            fetch("/danbooru_anima/weilin_subgroups?group_id=" + _curGid).then(r => r.json()).then(ss => {
                _subs = ss;
                renderSubs();
            }).catch(() => {});
        };

        const renderSubs = () => {
            subBar.innerHTML = "";
            // "全部" 胶囊
            const allTab = document.createElement("span");
            allTab.textContent = animaTxt("📋 全部");
            allTab.style.cssText = "padding:5px 12px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:500;border:1px solid " + (_curSid === null ? "var(--anima-accent-soft)" : "var(--anima-title)") + ";background:" + (_curSid === null ? "rgba(var(--anima-accent-rgb),0.12)" : "transparent") + ";color:" + (_curSid === null ? "var(--anima-accent-soft)" : "var(--anima-mute)") + ";user-select:none;";
            allTab.className = "ps-tab";
            allTab.onclick = () => { _curSid = null; renderSubs(); loadTags(); };
            subBar.appendChild(allTab);
            for (const s of _subs) {
                // 👁 隐藏：成年限定限制级 默认不显示
                if (!_eyeOn && (s.name.includes("成年限定") || s.name.includes("限制级"))) continue;
                const tab = document.createElement("span");
                tab.textContent = s.name + " (" + (s.tag_count||0) + ")";
                tab.style.cssText = "padding:5px 12px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:500;border:1px solid " + (_curSid === s.id ? "var(--anima-accent-soft)" : "var(--anima-title)") + ";background:" + (_curSid === s.id ? "rgba(var(--anima-accent-rgb),0.12)" : "transparent") + ";color:" + (_curSid === s.id ? "var(--anima-accent-soft)" : "var(--anima-mute)") + ";user-select:none;";
                tab.className = "ps-tab";
                tab.onclick = () => { _curSid = s.id; renderSubs(); loadTags(); };
                subBar.appendChild(tab);
            }
        };

        // ── 加载 tag 网格 ──
        const loadTags = () => {
            grid.innerHTML = '<div style="grid-column:1/-1;color:#888;text-align:center;padding:30px;font-size:12px;">加载中...</div>';
            if (_curSid === null) {
                // 全部：加载当前大类所有子分类的 tag
                const prom = _subs.map(s => fetch("/danbooru_anima/weilin_tags?subgroup_id=" + s.id).then(r => r.json()).catch(() => []));
                Promise.all(prom).then(arrs => {
                    const all = arrs.flat();
                    renderGrid(all);
                });
            } else {
                fetch("/danbooru_anima/weilin_tags?subgroup_id=" + _curSid).then(r => r.json()).then(ts => {
                    renderGrid(ts);
                }).catch(() => {});
            }
        };

        // ── 渲染 tag 网格（分批，防大量 tag 一次性渲染卡顿） ──
        const renderGrid = (tags) => {
            grid.innerHTML = "";
            _lastTags = tags; // 缓存：退出编辑模式时用，避免 re-fetch 导致数据集变化
            // 合并自定义 tag（属于当前子分类的）
            const customList = _customTags[_curSid ? String(_curSid) : "custom"] || [];
            const allTags = tags.filter(t => !_deleted[t.text]).concat(customList);
            if (!allTags.length) {
                grid.innerHTML = '<div style="grid-column:1/-1;color:#888;text-align:center;padding:30px;font-size:12px;">暂无标签</div>';
                return;
            }
            // 分批渲染：每批 40 个，避免一次渲染几百个 DOM 导致布局异常
            const BATCH = 40;
            let _idx = 0;
            const _renderBatch = () => {
                if (_closed || !grid.isConnected) return;
                const _end = Math.min(_idx + BATCH, allTags.length);
                for (; _idx < _end; _idx++) {
                    const t = allTags[_idx];
                    const card = _makeCard(t);
                    if (card) grid.appendChild(card);
                }
                if (_idx < allTags.length) {
                    requestAnimationFrame(_renderBatch);
                }
            };
            _renderBatch();
        };

        // 构建单个卡片（供分批渲染复用）
        const _makeCard = (t) => {
                const tagName = t.text || t.tag || "";
                // 硬检查：被标记删除的 tag 直接跳过
                if (_deleted[tagName]) return null;
                const cn = t.desc || t.cn || "";
                const isCustom = !t.text; // 自定义 tag 没有 text
                const card = document.createElement("div");
                card.className = "ps-card";
                card.style.cssText = "background:rgba(255,255,255,0.03);border:1px solid var(--anima-line);border-radius:8px;overflow:hidden;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease,background .15s ease;position:relative;height:138px;display:flex;flex-direction:column;";
                // ── 编辑模式：左上角删除按钮 ──
                if (_editMode) {
                    const delOverlay = document.createElement("span");
                    delOverlay.textContent = "✕";
                    delOverlay.style.cssText = "position:absolute;top:4px;left:4px;z-index:2;font-size:13px;cursor:pointer;color:#fff;background:rgba(233,69,96,0.85);border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;transition:all .15s ease;";
                    delOverlay.onmouseover = function(){ this.style.transform = "scale(1.15)"; this.style.background = "#e94560"; };
                    delOverlay.onmouseout = function(){ this.style.transform = ""; this.style.background = "rgba(233,69,96,0.85)"; };
                    delOverlay.onclick = function(ev){
                        ev.stopPropagation();
                        _showConfirm("删除 tag「" + tagName.replace(/_/g, " ") + "」？", function(){
                            if (isCustom) {
                                var _cl = _customTags[_curSid ? String(_curSid) : "custom"] || [];
                                _customTags[_curSid ? String(_curSid) : "custom"] = _cl.filter(function(x){ return (x.text || x) !== tagName; });
                            } else {
                                _deleted[tagName] = true;
                            }
                            _saveCustom();
                            // 直接移除 DOM，不触发 loadTags（避免重新渲染把卡片带回来）
                            card.style.opacity = "0";
                            card.style.transition = "opacity .2s ease";
                            card.style.pointerEvents = "none";
                            setTimeout(function(){ try { card.remove(); } catch(e){} }, 200);
                        });
                    };
                    card.appendChild(delOverlay);
                    // 编辑模式：分类按钮
                    const catBtn = document.createElement("span");
                    catBtn.textContent = "📁";
                    catBtn.title = "分类此 tag";
                    catBtn.style.cssText = "position:absolute;top:4px;left:30px;z-index:2;font-size:12px;cursor:pointer;background:rgba(206,147,216,0.7);border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;transition:all .15s ease;";
                    catBtn.onmouseover = function(){ this.style.transform = "scale(1.15)"; this.style.background = "#ce93d8"; };
                    catBtn.onmouseout = function(){ this.style.transform = ""; this.style.background = "rgba(206,147,216,0.7)"; };
                    catBtn.onclick = function(ev){
                        ev.stopPropagation();
                        _showClassifyPicker([tagName], function(){ loadTags(); });
                    };
                    card.appendChild(catBtn);
                    // 编辑模式：📷 缩略图按钮
                    const thumbBtn = document.createElement("span");
                    thumbBtn.textContent = "📷";
                    thumbBtn.title = animaTxt("设置缩略图");
                    thumbBtn.style.cssText = "position:absolute;top:4px;left:56px;z-index:2;font-size:12px;cursor:pointer;background:rgba(255,152,0,0.7);border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;transition:all .15s ease;";
                    thumbBtn.onmouseover = function(){ this.style.transform = "scale(1.15)"; this.style.background = "#ff9800"; };
                    thumbBtn.onmouseout = function(){ this.style.transform = ""; this.style.background = "rgba(255,152,0,0.7)"; };
                    thumbBtn.onclick = function(ev){
                        ev.stopPropagation();
                        _showThumbPicker(tagName, safe);
                    };
                    card.appendChild(thumbBtn);
                }
                // 缩略图区（固定高度，杜绝 img 加载导致的高度抖动/堆叠）
                const imgBox = document.createElement("div");
                imgBox.style.cssText = "width:100%;height:100px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--anima-well);overflow:hidden;position:relative;";
                const safe = String(tagName).replace(/[^a-z0-9_]/g, "_").toLowerCase();
                const img = document.createElement("img");
                img.loading = "lazy";
                img.decoding = "async";
                img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%);";
                // 加载优先级：自定义 jpg → 预置 webp → 占位
                var _thumbLoaded = false;
                img.onload = function(){ _thumbLoaded = true; };
                img.onerror = function() {
                    if (!_thumbLoaded && img.src.indexOf(".jpg") >= 0) {
                        // jpg 失败，试 webp
                        img.src = "/danbooru_anima/thumb/" + safe + ".webp?" + Date.now();
                    } else {
                        img.style.display = "none";
                        imgBox.innerHTML = '<span style="font-size:15px;opacity:.78;">🏷</span>';
                    }
                };
                img.src = "/danbooru_anima/thumb/" + safe + ".jpg?" + Date.now();
                imgBox.appendChild(img);
                card.appendChild(imgBox);
                // 名称区
                const nameBox = document.createElement("div");
                nameBox.style.cssText = "padding:5px 6px;";
                const nm = document.createElement("div");
                nm.textContent = tagName.replace(/_/g, " ");
                nm.style.cssText = "font-size:11px;color:#e0e0e0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
                nameBox.appendChild(nm);
                if (cn) {
                    const cnEl = document.createElement("div");
                    cnEl.textContent = cn;
                    cnEl.style.cssText = "font-size:10px;color:var(--anima-mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
                    nameBox.appendChild(cnEl);
                }
                // 分类标签（显示本地分类）
                var _catV = _tagCategories[tagName] || "";
                if (_catV) {
                    var _catOpt = null;
                    for (var _coi = 0; _coi < _catOptions.length; _coi++) { if (_catOptions[_coi].v === _catV) { _catOpt = _catOptions[_coi]; break; } }
                    if (_catOpt) {
                        var _catTag = document.createElement("div");
                        _catTag.textContent = _catOpt.l;
                        _catTag.style.cssText = "font-size:9px;color:"+_catOpt.c+";overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 2px;";
                        nameBox.appendChild(_catTag);
                    }
                }
                card.appendChild(nameBox);
                // ── 编辑模式：中文翻译可点击编辑 ──
                if (_editMode) {
                    const cnEdit = document.createElement("div");
                    cnEdit.textContent = cn || "＋ 添加翻译";
                    cnEdit.style.cssText = "padding:2px 6px 4px;font-size:10px;color:" + (cn ? "var(--anima-mute)" : "#555") + ";cursor:text;border-top:1px solid rgba(255,255,255,0.04);transition:all .15s ease;";
                    cnEdit.onmouseover = function(){ this.style.color = "var(--anima-accent-soft)"; };
                    cnEdit.onmouseout = function(){ this.style.color = cn ? "var(--anima-mute)" : "#555"; };
                    cnEdit.onclick = function(ev){
                        ev.stopPropagation();
                        const rc = cnEdit.getBoundingClientRect();
                        const inp = document.createElement("input");
                        inp.type = "text";
                        inp.value = cn || "";
                        inp.placeholder = animaTxt("输入中文翻译");
                        inp.style.cssText = "position:fixed;z-index:100002;left:" + rc.left + "px;top:" + rc.top + "px;width:" + Math.max(100, rc.width) + "px;padding:3px 6px;border:1px solid var(--anima-accent-soft);border-radius:4px;background:linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%);color:#e0e0e0;font-size:10px;outline:none;";
                        document.body.appendChild(inp);
                        inp.focus();
                        inp.select();
                        inp.onblur = function(){
                            var v = inp.value.trim();
                            inp.remove();
                            if (v) {
                                if (isCustom) {
                                    var key = _curSid ? String(_curSid) : "custom";
                                    var cl = _customTags[key] || [];
                                    for (var ci = 0; ci < cl.length; ci++) {
                                        if ((cl[ci].text || cl[ci]) === tagName) {
                                            if (typeof cl[ci] === "string") cl[ci] = {text: cl[ci], desc: v};
                                            else cl[ci].desc = v;
                                            break;
                                        }
                                    }
                                    _customTags[key] = cl;
                                    _saveCustom();
                                }
                                cnEdit.textContent = v;
                                cnEdit.style.color = "var(--anima-mute)";
                            } else if (!cn) {
                                cnEdit.textContent = "＋ 添加翻译";
                                cnEdit.style.color = "#555";
                            }
                        };
                        inp.onkeydown = function(ev2){
                            if (ev2.key === "Enter") { ev2.preventDefault(); inp.blur(); }
                            if (ev2.key === "Escape") { ev2.preventDefault(); inp.remove(); }
                        };
                    };
                    card.appendChild(cnEdit);
                }
                // 点击
                card.onclick = (ev) => {
                    if (_selMode) {
                        if (_selSet.has(tagName)) { _selSet.delete(tagName); card.style.outline = "none"; }
                        else { _selSet.add(tagName); card.style.outline = "2px solid var(--anima-accent-soft)"; }
                        _showBatchBar();
                        return;
                    }
                    if (_editMode) {
                        // 编辑模式：点击卡片空白区域直接删除
                        if (isCustom) {
                            const _cl = _customTags[_curSid ? String(_curSid) : "custom"] || [];
                            _customTags[_curSid ? String(_curSid) : "custom"] = _cl.filter(function(x){ return (x.text || x) !== tagName; });
                            _saveCustom();
                        } else {
                            _deleted[tagName] = true;
                            _saveCustom();
                        }
                        loadTags();
                        return;
                    }
                    if (onSelect) onSelect(tagName);
                };
                return card;
        };

        // ── 搜索（加权 + 防抖） ──
        let _srchTimer = null;
        srch.oninput = () => {
            clearTimeout(_srchTimer);
            const q = srch.value.trim();
            _srchTimer = setTimeout(() => {
                if (_closed) return;
                if (!q) { loadTags(); return; }
                // 本地过滤当前所有 tag + fuzzy_tags 搜索
                const isCJK = /[\u4e00-\u9fff]/.test(q);
                if (isCJK) {
                    fetch("/danbooru_anima/fuzzy_tags", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({query:q})})
                        .then(r => r.json()).then(d => {
                            const items = (d.tags || []).slice(0, 30);
                            renderGrid(items.map(it => ({text: it.tag, desc: it.cn})));
                        }).catch(() => {});
                } else {
                    // 英文：调 weilin 全部？用 fuzzy_tags
                    fetch("/danbooru_anima/fuzzy_tags", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({query:q})})
                        .then(r => r.json()).then(d => {
                            const items = (d.tags || []).slice(0, 30);
                            renderGrid(items.map(it => ({text: it.tag, desc: it.cn})));
                        }).catch(() => {});
                }
            }, 200);
        };
        srch.onkeydown = (e) => {
            if (e.key === "Enter") {
                const q = srch.value.trim();
                if (!q) return;
                // Enter 直接插入第一条结果
                fetch("/danbooru_anima/fuzzy_tags", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({query:q})})
                    .then(r => r.json()).then(d => {
                        const items = (d.tags || []);
                        if (items.length && onSelect) { onSelect(items[0].tag); srch.value = ""; }
                    }).catch(() => {});
            }
        };

        // ── 👁 切换 ──
        eyeBtn.onclick = () => {
            _eyeOn = !_eyeOn;
            localStorage.setItem("db_preset_eye", _eyeOn ? "1" : "0");
            eyeBtn.style.background = _eyeOn ? "rgba(var(--anima-accent-rgb),0.15)" : "transparent";
            eyeBtn.style.borderColor = _eyeOn ? "var(--anima-accent-soft)" : "var(--anima-line)";
            renderSubs();
            loadTags();
        };

        // ── 确认弹窗（通用，替代浏览器 confirm）──
        const _showConfirm = (msg, onOk) => {
            if (document.getElementById("ps-cfm-dlg")) return;
            const _dlg = document.createElement("div");
            _dlg.id = "ps-cfm-dlg";
            _dlg.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:100005;display:flex;align-items:center;justify-content:center;pointer-events:none;";
            const _inner = document.createElement("div");
            _inner.style.cssText = "background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid rgba(var(--anima-accent-rgb),.45);border-radius:12px;padding:16px 20px;min-width:280px;max-width:400px;box-shadow:0 12px 40px rgba(0,0,0,0.7);pointer-events:auto;display:flex;flex-direction:column;gap:12px;";
            _inner.innerHTML = '<div style="color:#e0e0e0;font-size:13px;line-height:1.5;">' + msg + '</div>' +
                '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
                '<button id="ps-cfm-cancel" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#b0bec5;cursor:pointer;font-size:12px;transition:all .15s ease;" onmouseover="this.style.borderColor=\'rgba(255,255,255,0.3)\';this.style.color=\'#e0e0e0\'" onmouseout="this.style.borderColor=\'rgba(255,255,255,0.12)\';this.style.color=\'#b0bec5\'">取消</button>' +
                '<button id="ps-cfm-ok" style="padding:6px 16px;border-radius:6px;border:none;background:#e94560;color:#fff;cursor:pointer;font-size:12px;font-weight:600;transition:all .15s ease;" onmouseover="this.style.background=\'#ff5c72\';this.style.transform=\'translateY(-1px)\'" onmouseout="this.style.background=\'#e94560\';this.style.transform=\'\'">确认删除</button></div>';
            _dlg.appendChild(_inner);
            document.body.appendChild(_dlg);
            var _close = function(){ _dlg.remove(); };
            _inner.querySelector("#ps-cfm-cancel").onclick = _close;
            _inner.querySelector("#ps-cfm-ok").onclick = function(){
                _close();
                if (onOk) onOk();
            };
            _dlg.onclick = function(e){ if (e.target === _dlg) _close(); };
        };

        // ── 编辑/多选切换 ──
        editBtn.onclick = () => {
            _editMode = !_editMode;
            if (_editMode && _selMode) { _selMode = false; _selSet.clear(); selBtn.style.background = "transparent"; selBtn.style.borderColor = "var(--anima-line)"; selBtn.style.color = "#b0bec5"; _showBatchBar(); }
            editBtn.style.background = _editMode ? "rgba(var(--anima-accent-rgb),0.15)" : "transparent";
            editBtn.style.borderColor = _editMode ? "var(--anima-accent-soft)" : "var(--anima-line)";
            editBtn.style.color = _editMode ? "var(--anima-accent-soft)" : "#b0bec5";
            if (_editMode) { loadTags(); } else if (_lastTags.length > 0) { renderGrid(_lastTags); }
        };
        // ── 批量操作栏渲染（直接 DOM 创建，不用 innerHTML，避免事件丢失）──
        const _showBatchBar = () => {
            batchBar.innerHTML = "";
            if (!_selMode || _selSet.size === 0) { batchBar.style.display = "none"; return; }
            batchBar.style.display = "flex";
            const _mkBBtn = (txt, bg, fg, bd, fn) => {
                const b = document.createElement("span");
                b.textContent = txt;
                b.style.cssText = "padding:3px 10px;border-radius:6px;cursor:pointer;font-size:11px;background:"+bg+";color:"+fg+";border:1px solid "+bd+";user-select:none;transition:all .15s ease;";
                b.onmouseover = function(){ this.style.filter="brightness(1.3)"; this.style.transform="translateY(-1px)"; };
                b.onmouseout = function(){ this.style.filter=""; this.style.transform=""; };
                if (fn) b.onclick = fn;
                return b;
            };
            batchBar.appendChild(_mkBBtn("已选 " + _selSet.size + " 个", "transparent", "var(--anima-accent-soft)", "transparent", null));
            batchBar.appendChild(_mkBBtn("📥 插入全部", "rgba(var(--anima-accent-rgb),0.12)", "var(--anima-accent-soft)", "rgba(var(--anima-accent-rgb),0.3)", function(){
                _selSet.forEach(function(t){ if(onSelect) onSelect(t); });
                _selSet.clear(); _selMode = false;
                selBtn.style.background = "transparent"; selBtn.style.borderColor = "var(--anima-line)"; selBtn.style.color = "#b0bec5";
                _showBatchBar(); loadTags();
            }));
            batchBar.appendChild(_mkBBtn("📁 批量分类", "rgba(206,147,216,0.1)", "#ce93d8", "rgba(206,147,216,0.3)", function(){
                _showClassifyPicker(Array.from(_selSet), function(){
                    _selSet.clear(); _selMode = false;
                    selBtn.style.background = "transparent"; selBtn.style.borderColor = "var(--anima-line)"; selBtn.style.color = "#b0bec5";
                    _showBatchBar(); loadTags();
                });
            }));
            batchBar.appendChild(_mkBBtn("🗑 删除所选", "rgba(233,69,96,0.1)", "#e94560", "rgba(233,69,96,0.3)", function(){
                var cnt = _selSet.size;
                _showConfirm("确认删除已选的 " + cnt + " 个 tag？此操作不可撤销。", function(){
                    _selSet.forEach(function(t){ _deleted[t] = true; });
                    _saveCustom();
                    // 直接淡出并移除选中的卡片
                    var allCards = document.querySelectorAll('.ps-card');
                    allCards.forEach(function(c){
                        var tagDivs = c.querySelectorAll('div');
                        for (var j = 0; j < tagDivs.length; j++) {
                            var divTxt = tagDivs[j].textContent.trim();
                            if (divTxt && _selSet.has(divTxt.replace(/ /g, '_'))) {
                                c.style.opacity = "0";
                                c.style.transition = "opacity .2s ease";
                                c.style.pointerEvents = "none";
                                setTimeout((function(card){ return function(){ try { card.remove(); } catch(e){} }; })(c), 200);
                                break;
                            }
                        }
                    });
                    _selSet.clear();
                    _showBatchBar();
                });
            }));
            batchBar.appendChild(_mkBBtn("✕ 取消", "transparent", "#b0bec5", "rgba(255,255,255,0.1)", function(){
                _selSet.clear(); _showBatchBar(); loadTags();
            }));
        };
        selBtn.onclick = () => {
            _selMode = !_selMode;
            _selSet.clear();
            if (_selMode && _editMode) { _editMode = false; editBtn.style.background = "transparent"; editBtn.style.borderColor = "var(--anima-line)"; editBtn.style.color = "#b0bec5"; }
            selBtn.style.background = _selMode ? "rgba(var(--anima-accent-rgb),0.15)" : "transparent";
            selBtn.style.borderColor = _selMode ? "var(--anima-accent-soft)" : "var(--anima-line)";
            selBtn.style.color = _selMode ? "var(--anima-accent-soft)" : "#b0bec5";
            _showBatchBar();
            if (_selMode) { loadTags(); } else if (_lastTags.length > 0) { renderGrid(_lastTags); }
        };

        // ── 缩略图设置器（编辑模式 📷 按钮）──
        // ── 缩略图设置弹窗（移植自提示词创作器：G站搜索 + 本地上传 + 裁剪缩放）──
        const _showThumbPicker = (tagName, safeName) => {
            if (document.getElementById("ps-tp-dlg")) return;
            var t = safeName; // 后端存盘用 safeName
            var bx3 = document.createElement("div");
            bx3.id = "ps-tp-dlg";
            bx3.style.cssText = "position:fixed;top:8%;left:8%;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid rgba(var(--anima-accent-rgb),.45);border-radius:16px;padding:16px;width:720px;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.9);z-index:100006;resize:both;overflow:auto;";
            if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(bx3);
            try { var _gp = JSON.parse(localStorage.getItem("ps_gelpop_pos")||"{}"); if(_gp.left) bx3.style.left = _gp.left+"px"; if(_gp.top) bx3.style.top = _gp.top+"px"; if(_gp.w) bx3.style.width = _gp.w+"px"; if(_gp.h) bx3.style.height = _gp.h+"px"; } catch(e) {}
            if (typeof ResizeObserver !== "undefined") { var _roGel = new ResizeObserver(function(){ try { localStorage.setItem("ps_gelpop_pos", JSON.stringify({left:parseInt(bx3.style.left)||0,top:parseInt(bx3.style.top)||0,w:bx3.offsetWidth,h:bx3.offsetHeight})); } catch(e) {} }); _roGel.observe(bx3); }
            var hdr3 = document.createElement("div");
            hdr3.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:8px;cursor:grab;user-select:none;";
            hdr3.onmousedown = function(e3){ var dx=e3.clientX-bx3.offsetLeft,dy=e3.clientY-bx3.offsetTop; function mm(ev){bx3.style.left=(ev.clientX-dx)+'px';bx3.style.top=(ev.clientY-dy)+'px'} function mu(){document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);try{localStorage.setItem("ps_gelpop_pos",JSON.stringify({left:parseInt(bx3.style.left)||0,top:parseInt(bx3.style.top)||0}));}catch(e){} setTimeout(function(){ if(window.clampPopup) window.clampPopup(bx3); },0);} document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu); };
            hdr3.innerHTML = '<span style="color:var(--anima-accent-soft);font-weight:bold;">\ud83d\udd0d 缩略图：</span><span style="color:var(--anima-accent-soft);font-weight:bold;font-size:13px;">'+tagName.replace(/_/g," ")+'</span><span style="color:#888;font-size:11px;margin-left:4px;">点击图片进入裁剪</span>';
            var _soloOn = false;
            var soloBtn = document.createElement("button");
            soloBtn.textContent = "\ud83d\udc64"; soloBtn.title = "单人筛选开关";
            soloBtn.style.cssText = "padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#ccc;cursor:pointer;font-size:13px;";
            soloBtn.onmousedown = function(e){ e.stopPropagation(); };
            soloBtn.onclick = function(){
                _soloOn = !_soloOn;
                soloBtn.textContent = "\ud83d\udc64"; soloBtn.title = _soloOn ? "单人筛选：开" : "单人筛选：关";
                soloBtn.style.background = _soloOn ? "var(--anima-title)" : "transparent";
                soloBtn.style.color = _soloOn ? "var(--anima-accent-soft)" : "#ccc";
                soloBtn.style.borderColor = _soloOn ? "var(--anima-accent-soft)" : "rgba(255,255,255,0.06)";
                doGelSearch(0);
            };
            var _gelSort = "score";
            var sortBtn = document.createElement("button");
            sortBtn.textContent = "\u2b50 评分"; sortBtn.title = animaTxt("排序：评分/最新");
            sortBtn.style.cssText = "padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#ccc;cursor:pointer;font-size:11px;";
            sortBtn.onmousedown = function(e){ e.stopPropagation(); };
            sortBtn.onclick = function(){
                _gelSort = _gelSort==="score"?"date":"score";
                sortBtn.textContent = _gelSort==="score"?"\u2b50 评分":"\ud83d\udd50 最新";
                doGelSearch(0);
            };
            var _gelRatings = {"general":true};
            var ratingBar = document.createElement("div");
            ratingBar.style.cssText = "display:flex;gap:3px;";
            var ratingOpts = [["general","\ud83d\udfe2 普通"],["sensitive","\ud83d\udfe1 敏感"],["questionable","\ud83d\udfe0 可疑"],["explicit","\ud83d\udd34 明确"]];
            var ratingBtns = {};
            var _gelAll = false;
            function updateRatingBar(){
                for(var rk in ratingBtns){
                    var on = !_gelAll && !!_gelRatings[rk];
                    ratingBtns[rk].style.background = on ? "var(--anima-title)" : "transparent";
                    ratingBtns[rk].style.color = on ? "var(--anima-accent-soft)" : "#555";
                    ratingBtns[rk].style.borderColor = on ? "var(--anima-accent-soft)" : "rgba(255,255,255,0.1)";
                }
                if (allBtn) {
                    allBtn.style.background = _gelAll ? "var(--anima-title)" : "transparent";
                    allBtn.style.color = _gelAll ? "var(--anima-accent-soft)" : "#9ca3af";
                    allBtn.style.borderColor = _gelAll ? "var(--anima-accent-soft)" : "rgba(255,255,255,0.15)";
                }
            }
            for(var ri=0;ri<ratingOpts.length;ri++){
                (function(){
                    var rk = ratingOpts[ri][0], rl = ratingOpts[ri][1];
                    var rb = document.createElement("span");
                    rb.textContent = rl; rb.style.cssText = "padding:3px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;font-size:10px;user-select:none;";
                    rb.onmousedown = function(e){ e.stopPropagation(); };
                    rb.onclick = function(){
                        _gelAll = false; _gelRatings[rk] = !_gelRatings[rk];
                        updateRatingBar(); doGelSearch(0);
                    };
                    ratingBtns[rk] = rb; ratingBar.appendChild(rb);
                })();
            }
            var allBtn = document.createElement("span");
            allBtn.textContent = "\u26aa 全部"; allBtn.style.cssText = "padding:3px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);cursor:pointer;font-size:10px;user-select:none;background:transparent;color:#ccc;";
            allBtn.onmousedown = function(e){ e.stopPropagation(); };
            allBtn.onclick = function(){
                _gelAll = !_gelAll;
                updateRatingBar(); doGelSearch(0);
            };
            ratingBar.appendChild(allBtn);
            updateRatingBar();
            var cls3 = document.createElement("button");
            cls3.textContent = animaTxt("关闭"); cls3.style.cssText = "margin-left:auto;background:transparent;border:none;color:#ccc;cursor:pointer;";
            cls3.onmousedown = function(e){ e.stopPropagation(); };
            cls3.onclick = function(){ bx3.remove(); };
            // 本地上传
            var uploadBtn = document.createElement("button");
            uploadBtn.textContent = "\ud83d\udcc1 本地上传"; uploadBtn.title = animaTxt("从本地选择图片作为缩略图");
            uploadBtn.style.cssText = "padding:4px 8px;border-radius:6px;border:1px solid rgba(var(--anima-accent-rgb),0.35);background:rgba(var(--anima-accent-rgb),0.08);color:var(--anima-accent-soft);cursor:pointer;font-size:11px;";
            uploadBtn.onmousedown = function(e){ e.stopPropagation(); }; // 防止触发标题栏拖拽导致 click 丢失
            var fileInp = document.createElement("input");
            fileInp.type = "file"; fileInp.accept = "image/*"; fileInp.style.display = "none";
            uploadBtn.onclick = function(){ fileInp.click(); };
            // 本地图片 → 裁剪弹窗（供文件选择/粘贴/拖拽三个入口共用）
            function openLocalCrop(dataUrl) {
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
                var _psMv2 = function(e2){ if(!dragging2||!cov2.parentNode)return; panX2=spx2+(e2.clientX-sx2); panY2=spy2+(e2.clientY-sy2); applyZoom2(); };
                var _psMu2 = function(){ if(dragging2){dragging2=false;cbox2.style.cursor="grab";} };
                var _psCleanCov2 = function(){ try{ window.removeEventListener("mousemove",_psMv2); window.removeEventListener("mouseup",_psMu2); }catch(e){} };
                window.addEventListener("mousemove",_psMv2);
                window.addEventListener("mouseup",_psMu2);
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
                cbtnCancel2.onclick=function(){_psCleanCov2(); cov2.remove();};
                var cbtnSkip2 = document.createElement("button");
                cbtnSkip2.textContent="\ud83d\uddbc \u4e0d\u88c1\u526a";cbtnSkip2.style.cssText="padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#b0bec5;cursor:pointer;font-size:13px;";
                cbtnSkip2.onclick=function(){ saveLocalThumb(dataUrl); };
                function saveLocalThumb(dataUrl2){
                    fetch("/danbooru_anima/save_thumb",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag:t, image:dataUrl2})}).then(function(r3){return r3.json();}).then(function(d3){
                        if(d3.success && d3.url){
                            if(window._psRefreshThumbs) window._psRefreshThumbs();
                            _psCleanCov2(); cov2.remove();
                        }
                    }).catch(function(){});
                }
                var cbtnOk2 = document.createElement("button");
                cbtnOk2.textContent="\u2705 \u786e\u8ba4";cbtnOk2.style.cssText="padding:8px 18px;border-radius:8px;border:none;background:var(--anima-title);color:var(--anima-accent-soft);cursor:pointer;font-weight:bold;font-size:13px;";
                cbtnOk2.onclick=function(){
                    var nw2=cimg2.naturalWidth, nh2=cimg2.naturalHeight;
                    var scale2 = imgScale2 * (zoom2/100);
                    var iw2 = Math.round(nw2*scale2), ih2 = Math.round(nh2*scale2);
                    var maxDX2 = Math.max(0, iw2-VW2), maxDY2 = Math.max(0, ih2-VH2);
                    var px = maxDX2>0 ? Math.round((-panX2/maxDX2)*100) : 50;
                    var py = maxDY2>0 ? Math.round((-panY2/maxDY2)*100) : 50;
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
            }
            var fileInp = document.createElement("input");
            fileInp.type = "file"; fileInp.accept = "image/*"; fileInp.style.display = "none";
            fileInp.onchange = function(){
                if (!fileInp.files || !fileInp.files[0]) return;
                var file = fileInp.files[0];
                var reader = new FileReader();
                reader.onload = function(ev){ openLocalCrop(ev.target.result); fileInp.value = ""; };
                reader.readAsDataURL(file);
            };
            // 粘贴图片通道（不依赖文件选择框）
            var _psPasteHandler = function(e){
                var items = (e.clipboardData || {}).items || [];
                for (var _pi = 0; _pi < items.length; _pi++) {
                    if (items[_pi].type && items[_pi].type.indexOf("image") === 0) {
                        var _pf = items[_pi].getAsFile();
                        if (!_pf) continue;
                        e.preventDefault();
                        var _pr = new FileReader();
                        _pr.onload = function(ev){ openLocalCrop(ev.target.result); };
                        _pr.readAsDataURL(_pf);
                        return;
                    }
                }
            };
            document.addEventListener("paste", _psPasteHandler);
            // 拖拽图片通道（不依赖文件选择框）
            bx3.addEventListener("dragover", function(e){ e.preventDefault(); });
            bx3.addEventListener("drop", function(e){
                e.preventDefault();
                var _df = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                if (_df && _df.type && _df.type.indexOf("image") === 0) {
                    var _dr = new FileReader();
                    _dr.onload = function(ev){ openLocalCrop(ev.target.result); };
                    _dr.readAsDataURL(_df);
                }
            });
            var _origCls3 = cls3.onclick;
            cls3.onclick = function(){ document.removeEventListener("paste", _psPasteHandler); _origCls3(); };

            hdr3.appendChild(uploadBtn);
            bx3.appendChild(fileInp);
            hdr3.appendChild(soloBtn); hdr3.appendChild(sortBtn); hdr3.appendChild(ratingBar); hdr3.appendChild(cls3); bx3.appendChild(hdr3);
            var grid3 = document.createElement("div");
            grid3.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;overflow-y:auto;flex:1;min-height:200px;";
            grid3.innerHTML = '<div style="color:#888;text-align:center;grid-column:1/-1;padding:20px;">搜索中...</div>';
            bx3.appendChild(grid3); document.body.appendChild(bx3);
            var _gelPage = 0;
            function doGelSearch(pg) {
                _gelPage = pg; grid3.innerHTML = '<div style="color:#888;text-align:center;grid-column:1/-1;padding:20px;">搜索中...</div>';
                var _q = safeName;
                if (_soloOn) _q = "solo "+_q;
                var ratingArr = _gelAll ? null : Object.keys(_gelRatings).filter(function(k){return _gelRatings[k];});
                fetch("/gelbooru_anima/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tags:_q,page:pg,limit:30,order:_gelSort,rating:ratingArr})}).then(function(r2){return r2.json();}).then(function(d2){
                var posts = d2.posts||[];
                grid3.innerHTML = "";
                if(!posts.length){grid3.innerHTML='<div style="color:#888;text-align:center;grid-column:1/-1;padding:20px;">无结果</div>';return;}
                posts.forEach(function(p){
                    var c2 = document.createElement("div");
                    c2.style.cssText = "border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid transparent;transition:all 0.2s;min-height:200px;position:relative;background:rgba(255,255,255,0.03);";
                    c2.onmouseover = function(){ c2.style.borderColor="var(--anima-accent-soft)"; };
                    c2.onmouseout = function(){ c2.style.borderColor="transparent"; };
                    c2.onclick = function(){
                        // 用 preview 优先：结果网格已加载过（浏览器缓存），秒显；sample 大图可能拉取超时导致黑框
                        var imgUrl = p.preview_url||p.sample_url||p.file_url||"";
                        if(!imgUrl){ if(window._psRefreshThumbs) window._psRefreshThumbs(); bx3.remove(); return; }
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
                        cimg.onerror = function(){ cimg.style.display = "none"; cbox.style.borderColor = "#e94560"; };
                        var zoom=100, panX=0, panY=0, imgScale=1;
                        cimg.onload = function(){
                            var nw=cimg.naturalWidth, nh=cimg.naturalHeight;
                            if(!nw||!nh) return;
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
                        var dragging=false, sx=0, sy=0, spx=0, spy=0;
                        cbox.addEventListener("mousedown",function(e2){ dragging=true; cbox.style.cursor="grabbing"; sx=e2.clientX; sy=e2.clientY; spx=panX; spy=panY; e2.preventDefault(); });
                        var _psMv = function(e2){ if(!dragging||!cov.parentNode)return; panX=spx+(e2.clientX-sx); panY=spy+(e2.clientY-sy); applyZoom(); };
                        var _psMu = function(){ if(dragging){dragging=false;cbox.style.cursor="grab";} };
                        var _psCleanCov = function(){ try{ window.removeEventListener("mousemove",_psMv); window.removeEventListener("mouseup",_psMu); }catch(e){} };
                        window.addEventListener("mousemove",_psMv);
                        window.addEventListener("mouseup",_psMu);
                        cbox.appendChild(cimg);
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
                        cbtnCancel.onclick=function(){_psCleanCov(); cov.remove();};
                        var cbtnOk = document.createElement("button");
                        cbtnOk.textContent="\u2705 \u786e\u8ba4";cbtnOk.style.cssText="padding:8px 18px;border-radius:8px;border:none;background:var(--anima-title);color:var(--anima-accent-soft);cursor:pointer;font-weight:bold;font-size:13px;";
                        cbtnOk.onclick=function(){
                            var nw2=cimg.naturalWidth, nh2=cimg.naturalHeight;
                            var scale2 = imgScale * (zoom/100);
                            var iw2 = Math.round(nw2*scale2), ih2 = Math.round(nh2*scale2);
                            var maxDX2 = Math.max(0, iw2-VW), maxDY2 = Math.max(0, ih2-VH);
                            var px = maxDX2>0 ? Math.round((-panX/maxDX2)*100) : 50;
                            var py = maxDY2>0 ? Math.round((-panY/maxDY2)*100) : 50;
                            var cv2 = document.createElement("canvas"); cv2.width = VW; cv2.height = VH;
                            var ctx2 = cv2.getContext("2d");
                            var nw3=cimg.naturalWidth, nh3=cimg.naturalHeight;
                            var scale3 = imgScale * (zoom/100);
                            ctx2.drawImage(cimg, panX, panY, Math.round(nw3*scale3), Math.round(nh3*scale3));
                            fetch("/danbooru_anima/save_thumb",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag:t, image:cv2.toDataURL("image/jpeg",0.85)})}).then(function(r5){return r5.json()}).then(function(d5){
                                if(d5.success&&d5.url){ if(window._psRefreshThumbs) window._psRefreshThumbs(); }
                                _psCleanCov(); cov.remove();
                            }).catch(function(){ _psCleanCov(); cov.remove(); });
                        };
                        cbar.appendChild(zoomOut);cbar.appendChild(zoomSlider);cbar.appendChild(zoomIn);cbar.appendChild(zoomLabel);
                        var cbtnSkip = document.createElement("button");
                        cbtnSkip.textContent="\ud83d\uddbc \u4e0d\u88c1\u526a";cbtnSkip.style.cssText="padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#b0bec5;cursor:pointer;font-size:13px;";
                        cbtnSkip.onclick=function(){
                            var cv3 = document.createElement("canvas"); cv3.width = VW; cv3.height = VH;
                            var ctx3 = cv3.getContext("2d"); ctx3.fillStyle = "#000"; ctx3.fillRect(0,0,VW,VH);
                            var nw4=cimg.naturalWidth, nh4=cimg.naturalHeight;
                            var scale4 = Math.min(VW/nw4, VH/nh4);
                            var dw=Math.round(nw4*scale4), dh=Math.round(nh4*scale4);
                            ctx3.drawImage(cimg, (VW-dw)/2, (VH-dh)/2, dw, dh);
                            fetch("/danbooru_anima/save_thumb",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag:t, image:cv3.toDataURL("image/jpeg",0.85)})}).then(function(r6){return r6.json()}).then(function(d6){
                                if(d6.success&&d6.url){ if(window._psRefreshThumbs) window._psRefreshThumbs(); }
                                _psCleanCov(); cov.remove();
                            }).catch(function(){ _psCleanCov(); cov.remove(); });
                        };
                        cbar.appendChild(cbtnCancel);cbar.appendChild(cbtnSkip);cbar.appendChild(cbtnOk);
                        cov.appendChild(cbox); cov.appendChild(cbar); document.body.appendChild(cov);
                        if(cimg.complete && cimg.naturalWidth) cimg.onload();
                    };
                    var ti2 = document.createElement("img");
                    ti2.src = "/gelbooru_anima/image_proxy?url="+encodeURIComponent(p.preview_url||p.sample_url||"");
                    ti2.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;";
                    ti2.onerror = function(){ c2.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;">\u274c</div>'; };
                    c2.appendChild(ti2); grid3.appendChild(c2);
                });
                var pgBar = document.createElement("div");
                pgBar.style.cssText = "display:flex;gap:8px;justify-content:center;margin-top:8px;flex-shrink:0;";
                var pgPrev = document.createElement("button");
                pgPrev.textContent = "\u25c0 上一页"; pgPrev.disabled = _gelPage<=0;
                pgPrev.style.cssText = "padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:"+(_gelPage>0?"var(--anima-accent-soft)":"#555")+";cursor:"+(_gelPage>0?"pointer":"default")+";font-size:11px;";
                pgPrev.onclick = function(){ if(_gelPage>0) doGelSearch(_gelPage-1); };
                var pgNext = document.createElement("button");
                pgNext.textContent = "下一页 \u25b6"; pgNext.disabled = posts.length<30;
                pgNext.style.cssText = "padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:"+(posts.length>=30?"var(--anima-accent-soft)":"#555")+";cursor:"+(posts.length>=30?"pointer":"default")+";font-size:11px;";
                pgNext.onclick = function(){ doGelSearch(_gelPage+1); };
                pgBar.appendChild(pgPrev); pgBar.appendChild(pgNext);
                var oldPg = bx3.querySelector(".gel-pg-bar"); if(oldPg) oldPg.remove();
                pgBar.className = "gel-pg-bar"; bx3.appendChild(pgBar);
                }).catch(function(){grid3.innerHTML='<div style="color:#e94560;text-align:center;grid-column:1/-1;padding:20px;">搜索失败</div>';});
            }
            doGelSearch(0);
        };
        // 缩略图存盘后刷新网格（裁剪弹窗回调用）
        window._psRefreshThumbs = function(){ loadTags(); };

        // ── 分类选择器（编辑模式单tag / 多选模式批量）──
        const _showClassifyPicker = (tagList, onDone) => {
            if (!_catOptions.length) { alert("分类选项加载中，请稍后"); return; }
            if (document.getElementById("ps-cp-dlg")) return;
            const _dlg = document.createElement("div");
            _dlg.id = "ps-cp-dlg";
            _dlg.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:100003;display:flex;align-items:center;justify-content:center;pointer-events:none;";
            const _inner = document.createElement("div");
            _inner.style.cssText = "background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid rgba(var(--anima-accent-rgb),.45);border-radius:12px;padding:14px 18px;min-width:260px;max-width:360px;box-shadow:0 12px 40px rgba(0,0,0,0.7);pointer-events:auto;display:flex;flex-direction:column;gap:8px;max-height:70vh;overflow-y:auto;";
            _inner.innerHTML = '<div style="color:var(--anima-accent-soft);font-weight:700;font-size:13px;">\ud83d\udcc1 \u5206\u7c7b ' + tagList.length + ' \u4e2a tag</div>' +
                '<div style="color:var(--anima-mute);font-size:10px;">' + tagList.slice(0,3).join(", ").replace(/_/g," ") + (tagList.length>3?" \u2026":"") + '</div>' +
                '<div id="ps-cp-list" style="display:flex;flex-direction:column;gap:3px;"></div>' +
                '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px;">' +
                '<button id="ps-cp-cancel" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#b0bec5;cursor:pointer;font-size:11px;">\u53d6\u6d88</button></div>';
            _dlg.appendChild(_inner);
            document.body.appendChild(_dlg);
            const _close = function(){ _dlg.remove(); };
            _inner.querySelector("#ps-cp-cancel").onclick = _close;
            _dlg.onclick = function(e){ if (e.target === _dlg) _close(); };
            // 渲染分类选项
            const _list = _inner.querySelector("#ps-cp-list");
            // "清除分类" 选项
            const _clr = document.createElement("div");
            _clr.textContent = "\u2715 \u6e05\u9664\u5206\u7c7b";
            _clr.style.cssText = "padding:6px 10px;border-radius:6px;cursor:pointer;font-size:11px;color:#b0bec5;border:1px solid rgba(var(--anima-accent-rgb),.45);transition:all .15s ease;";
            _clr.onmouseover = function(){ this.style.background="rgba(255,255,255,0.06)"; };
            _clr.onmouseout = function(){ this.style.background="transparent"; };
            _clr.onclick = function(){
                tagList.forEach(function(t){ _tagCategories[t] = ""; });
                _saveCustom(); _close(); if(onDone) onDone();
            };
            _list.appendChild(_clr);
            for (var ci = 0; ci < _catOptions.length; ci++) {
                (function(cat){
                    var _row = document.createElement("div");
                    _row.textContent = cat.l;
                    _row.style.cssText = "padding:6px 10px;border-radius:6px;cursor:pointer;font-size:11px;color:"+cat.c+";border:1px solid rgba(var(--anima-accent-rgb),.45);transition:all .15s ease;";
                    _row.onmouseover = function(){ this.style.background=cat.c+"22"; this.style.borderColor=cat.c; };
                    _row.onmouseout = function(){ this.style.background="transparent"; this.style.borderColor="rgba(255,255,255,0.08)"; };
                    _row.onclick = function(){
                        tagList.forEach(function(t){ _tagCategories[t] = cat.v; });
                        _saveCustom(); _close(); if(onDone) onDone();
                    };
                    _list.appendChild(_row);
                })(_catOptions[ci]);
            }
        };

        // ── ＋ 自定义 ──
        const _showAddCustomDialog = () => {
            if (document.getElementById("ps-ac-dlg")) return;
            const _dlg = document.createElement("div");
            _dlg.id = "ps-ac-dlg";
            _dlg.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:100001;display:flex;align-items:center;justify-content:center;pointer-events:none;";
            const _inner = document.createElement("div");
            _inner.style.cssText = "background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid rgba(var(--anima-accent-rgb),.45);border-radius:12px;padding:16px 20px;min-width:320px;box-shadow:0 12px 40px rgba(0,0,0,0.7);pointer-events:auto;display:flex;flex-direction:column;gap:10px;";
            _inner.innerHTML = '<div style="color:var(--anima-accent-soft);font-weight:700;font-size:14px;">＋ 添加自定义 Tag</div>' +
                '<input id="ps-ac-tag" placeholder="Tag 名称（英文，如 blonde_hair）" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--anima-line);background:linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%);color:#e0e0e0;font-size:12px;outline:none;box-sizing:border-box;transition:border-color .15s ease;" onfocus="this.style.borderColor=\'var(--anima-accent-soft)\'" onblur="this.style.borderColor=\'var(--anima-line)\'">' +
                '<input id="ps-ac-cn" placeholder="中文翻译（可选）" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--anima-line);background:linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%);color:#e0e0e0;font-size:12px;outline:none;box-sizing:border-box;transition:border-color .15s ease;" onfocus="this.style.borderColor=\'var(--anima-accent-soft)\'" onblur="this.style.borderColor=\'var(--anima-line)\'">' +
                '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
                '<button id="ps-ac-cancel" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#b0bec5;cursor:pointer;font-size:12px;transition:all .15s ease;" onmouseover="this.style.borderColor=\'rgba(255,255,255,0.3)\';this.style.color=\'#e0e0e0\'" onmouseout="this.style.borderColor=\'rgba(255,255,255,0.12)\';this.style.color=\'#b0bec5\'">取消</button>' +
                '<button id="ps-ac-ok" style="padding:6px 16px;border-radius:6px;border:none;background:rgba(var(--anima-accent-rgb),0.15);color:var(--anima-accent-soft);cursor:pointer;font-size:12px;font-weight:600;transition:all .15s ease;" onmouseover="this.style.background=\'rgba(var(--anima-accent-rgb),0.25)\';this.style.transform=\'translateY(-1px)\'" onmouseout="this.style.background=\'rgba(var(--anima-accent-rgb),0.15)\';this.style.transform=\'\'">确认</button></div>';
            _dlg.appendChild(_inner);
            document.body.appendChild(_dlg);
            const _tagInp = _inner.querySelector("#ps-ac-tag");
            const _cnInp = _inner.querySelector("#ps-ac-cn");
            _tagInp.focus();
            const _close = () => _dlg.remove();
            _inner.querySelector("#ps-ac-cancel").onclick = _close;
            _inner.querySelector("#ps-ac-ok").onclick = () => {
                const _tv = _tagInp.value.trim().replace(/ /g, "_").toLowerCase();
                if (!_tv) { _tagInp.focus(); return; }
                const _cv = _cnInp.value.trim();
                const key = _curSid ? String(_curSid) : "custom";
                const list = _customTags[key] || [];
                if (!list.some(function(x){ return (x.text || x) === _tv; })) {
                    list.push({text: _tv, desc: _cv});
                    _customTags[key] = list;
                    _saveCustom();
                    loadTags();
                }
                _close();
            };
            _dlg.onclick = function(e) { if (e.target === _dlg) _close(); };
            _tagInp.onkeydown = function(e) { if (e.key === "Enter") _inner.querySelector("#ps-ac-ok").click(); };
            _cnInp.onkeydown = function(e) { if (e.key === "Enter") _inner.querySelector("#ps-ac-ok").click(); };
        };
        addBtn.onclick = _showAddCustomDialog;

        // ── 初始化 ──
        loadGroups();
        if (_curGid) { loadSubs(); loadTags(); }
    };

    // 导出
    window.showPresetTagPopup = _showPresetTagPopup;
    if (window.app?.registerExtension) {
        window.app.registerExtension({
            name: "danbooru-anima.preset-tag-popup",
            async beforeRegisterNodeDef() {},
        });
    }
})();
