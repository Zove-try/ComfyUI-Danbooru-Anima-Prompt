// artist_fav_popup.js - 画师收藏弹窗（独立模块）
// 从 anima_prompt_composer.js 抽取，供 newbie 等节点独立使用
// 收藏数据存后端 /danbooru_anima/favorites + /gelbooru_anima/favorites

import "./00_anima_fav_grid.js";
import "./00_anima_i18n.js";

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

    // 画师组合后端持久化（从创作器迁移，独立模块必须自带）
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
    const _exportArtistFav = () => {
                        function showArtistFavPopup(initSrc) {
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
                initSrc = initSrc || "danbooru";
                var bx = document.createElement("div");
                bx.style.cssText = "position:fixed;top:8%;left:8%;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid rgba(var(--anima-accent-rgb),.45);border-radius:24px;padding:20px;width:620px;max-height:82vh;display:flex;flex-direction:column;resize:both;overflow:hidden;min-width:420px;min-height:320px;z-index:99999;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);";
                if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(bx);
                try { var _fsz = JSON.parse(localStorage.getItem('apc_fav_artist_size') || 'null'); if (_fsz && _fsz.w > 420 && _fsz.h > 300) { bx.style.width = Math.min(_fsz.w, window.innerWidth - 60) + 'px'; bx.style.height = Math.min(_fsz.h, Math.round(window.innerHeight * 0.8)) + 'px'; } } catch(e){}
                const _saveFavSize = () => { try { const _r = bx.getBoundingClientRect(); if (_r.width > 420 && _r.height > 300) localStorage.setItem('apc_fav_artist_size', JSON.stringify({w: Math.round(_r.width), h: Math.round(_r.height)})); } catch(e){} };
                (function(){ if (document.getElementById('tp-afav-sheen')) return; var _s = document.createElement('style'); _s.id = 'tp-afav-sheen'; _s.textContent = '.tp-card{transition:transform .15s ease,box-shadow .15s ease;}.tp-pin-chip{transition:transform .15s ease,box-shadow .15s ease;}.tp-pin-chip:hover{transform:translateY(-1px);box-shadow:0 0 10px rgba(var(--anima-accent-rgb),0.35);}#tp-hide-pin,#tp-pin-fold{transition:transform .15s ease,filter .15s ease,box-shadow .15s ease;}#tp-hide-pin:hover,#tp-pin-fold:hover{transform:translateY(-1px);filter:brightness(1.4);box-shadow:0 0 10px rgba(var(--anima-accent-rgb),0.35);}'; document.head.appendChild(_s); })()
                try { var _pp = JSON.parse(localStorage.getItem("apc_fav_artist_pos")||"{}"); if(_pp.left) bx.style.left = _pp.left+"px"; if(_pp.top) bx.style.top = _pp.top+"px"; } catch(e) {}
                // resize 结束（含拖拽 resize 手柄）时保存大小
                bx.addEventListener("mouseup", function(){ _saveFavSize(); });
                // header
                var hdr = document.createElement("div");
                (function(){ if (document.getElementById('tp-multi-css')) return; var _mcs = document.createElement('style'); _mcs.id = 'tp-multi-css'; _mcs.textContent = '#_multiToggle,#fav_multi_toggle{cursor:pointer;font-size:12px;margin-left:12px;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:var(--anima-mute);user-select:none;transition:all .15s ease;}#_multiToggle.on,#fav_multi_toggle.on{background:rgba(var(--anima-accent-rgb),0.15);border-color:rgba(var(--anima-accent-rgb),0.5);color:var(--anima-accent-soft);}#fav_note_toggle{cursor:pointer;font-size:12px;margin-left:8px;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:var(--anima-mute);user-select:none;transition:all .15s ease;}#fav_note_toggle.on{background:rgba(255,193,7,0.15);border-color:rgba(255,193,7,0.5);color:#ffd93d;}'; document.head.appendChild(_mcs); })();
                hdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-shrink:0;cursor:grab;user-select:none;";
                hdr.innerHTML = '<span style="color:#ffd93d;font-weight:700;font-size:15px;">⭐ 收藏夹-画师</span><span id="fav_multi_toggle" style="margin-left:12px;">☐ 多选</span><span id="fav_note_toggle" style="margin-left:8px;">\u270f\ufe0f \u5907\u6ce8</span><span id="fav_combo_btn" style="cursor:pointer;font-size:12px;color:var(--anima-accent-soft);margin-left:12px;padding:4px 10px;border-radius:4px;border:1px solid var(--anima-title);background:var(--anima-title);">📋 组合</span>';
                var closeBtn = document.createElement("button");
                closeBtn.textContent = animaTxt("关闭"); closeBtn.style.cssText = "background:transparent;border:none;color:var(--anima-ink);padding:6px 14px;cursor:pointer;font-size:13px;border-radius:8px;";
                closeBtn.onmouseover = function(){ closeBtn.style.background="rgba(255,255,255,0.08)"; }; closeBtn.onmouseout = function(){ closeBtn.style.background="transparent"; };
                var _unsubFav = null;
                var _favSyncId = "afav-" + Date.now();
                closeBtn.onclick = function(){ if (_unsubFav) _unsubFav(); window._artistFavOnSelect = null; bx.remove(); if (hoverPop) hoverPop.remove(); };
                hdr.appendChild(closeBtn);
                bx.appendChild(hdr);
                // drag
                var _drg3=false,_dx3=0,_dy3=0;
                hdr.onmousedown = function(e2){ if(e2.target.id.indexOf("fav_")===0||e2.target===closeBtn)return; _drg3=true;_dx3=e2.clientX-bx.offsetLeft;_dy3=e2.clientY-bx.offsetTop;e2.preventDefault(); };
                document.addEventListener("mousemove",function(e2){if(!_drg3)return;bx.style.left=(e2.clientX-_dx3)+"px";bx.style.top=(e2.clientY-_dy3)+"px"});
                document.addEventListener("mouseup",function(){
                    if(_drg3){
                        try{localStorage.setItem("apc_fav_artist_pos",JSON.stringify({left:parseInt(bx.style.left)||0,top:parseInt(bx.style.top)||0}));}catch(e){}
                        _saveFavSize();
                    }
                    _drg3=false;
                });
                // D/G tabs
                var srcBar = document.createElement("div");
                srcBar.style.cssText = "display:flex;gap:0;margin-bottom:8px;flex-shrink:0;";
                var _src = initSrc;
                var _dArt = {}, _gArt = {};
                var _starred = {};
                var _favPage = 1;
                var pagerBar = null;
                var _multiMode = false;
                var _multiSelected = [];
                var grid = document.createElement("div");
                grid.className = "fav-art-grid";
                grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));grid-auto-rows:min-content;align-items:start;gap:6px;overflow-y:auto;min-height:0;flex:1;min-width:0;align-content:start;";
                // pinned bar
                var pinnedBar = document.createElement("div");
                pinnedBar.style.cssText = "display:none;flex-wrap:wrap;gap:6px;padding:0;margin-bottom:6px;min-height:0;flex-shrink:0;border-bottom:1px solid rgba(var(--anima-accent-rgb),.25);align-items:flex-start;position:relative;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(var(--anima-accent-rgb),0.35) transparent;";
                var _hidePinned = localStorage.getItem('tp_hide_pinned') === '1';
                var _pinCollapsed = localStorage.getItem('tp_pin_collapsed') === '1';
                var _pinRows = Math.min(8, Math.max(1, parseInt(localStorage.getItem('tp_pin_rows') || '1', 10) || 1));
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
                (function(){if(window.Sortable)return;if(document.getElementById("tp-sortable-js"))return;var s=document.createElement("script");s.id="tp-sortable-js";s.src="/extensions/ComfyUI-Danbooru-Anima-Prompt/js/sortable.min.js";document.head.appendChild(s);})();
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
                                        var order = [];
                                        pinnedBar.querySelectorAll(".tp-pin-chip").forEach(function(ch){ if (ch.dataset && ch.dataset.tag) order.push(ch.dataset.tag); });
                                        localStorage.setItem('tp_pin_order', JSON.stringify(order));
                                        renderSrc(); renderPinned();
                                    } catch(e){}
                                }
                            });
                        }
                    } catch(e){}
                }, 300);
                // hover preview pop
                var hoverPop = document.createElement("div");
                hoverPop.style.cssText = "display:none;position:fixed;z-index:100004;pointer-events:none;border-radius:8px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.15);";
                var hoverImg = document.createElement("img");
                hoverImg.style.cssText = "width:280px;height:280px;object-fit:contain;background:rgba(var(--anima-well-rgb),.22);";
                hoverPop.appendChild(hoverImg);
                document.body.appendChild(hoverPop);
                var _activeFolder = '__uncat';
                var _foldData = {};
                var _folderPickMenu = function(x, y, onPick) {
                    var _fld0 = _foldData.artists || {};
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
                    var _fld = _foldData.artists || {};
                    var _allIn = new Set();
                    for (var _fn in _fld) { if (_fn === "__tmp") continue; (_fld[_fn] || []).forEach(function(k){ _allIn.add(k); }); }
                    var _art = _src === "danbooru" ? _dArt : _gArt;
                    var _uncat = Object.keys(_art).filter(function(k){ return k !== "_order" && !_allIn.has(k); });
                    var _mkChip = function(text, sel, onClick, onCtx) {
                        var _c = document.createElement("span");
                        _c.textContent = text;
                        _c.style.cssText = "padding:2px 10px;border-radius:999px;cursor:pointer;font-size:11px;white-space:nowrap;user-select:none;border:1px solid " + (sel ? "rgba(var(--anima-accent-rgb),0.5)" : "rgba(255,255,255,0.1)") + ";background:" + (sel ? "rgba(var(--anima-accent-rgb),0.15)" : "rgba(255,255,255,0.04)") + ";color:" + (sel ? "var(--anima-accent-soft)" : "var(--anima-mute)") + ";";
                        _c.onclick = onClick;
                        if (onCtx) _c.oncontextmenu = onCtx;
                        return _c;
                    };
                    folderBar.appendChild(_mkChip("\ud83d\udcc2 \u672a\u5206\u7c7b (" + _uncat.length + ")", _activeFolder === '__uncat', function(){ _activeFolder = '__uncat'; renderSrc({reset:true}); }));
                    for (var _fn2 in _fld) {
                        if (_fn2 === "__tmp") continue;
                        (function(_nm){
                            var _cnt = (_fld[_nm] || []).length;
                            folderBar.appendChild(_mkChip("\ud83d\udcc1 " + _nm + " (" + _cnt + ")", _activeFolder === _nm, function(){ _activeFolder = _nm; renderSrc({reset:true}); }, function(e){
                                e.preventDefault(); e.stopPropagation();
                                var _menu2 = document.createElement("div");
                                _menu2.style.cssText = "position:fixed;left:" + e.clientX + "px;top:" + e.clientY + "px;background:var(--anima-bg);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:4px;z-index:100101;min-width:130px;box-shadow:0 8px 24px rgba(0,0,0,0.6);";
                                var _mi2 = function(t, cb) { var _d2 = document.createElement("div"); _d2.textContent = t; _d2.style.cssText = "padding:6px 12px;cursor:pointer;color:var(--anima-mute);font-size:12px;border-radius:4px;"; _d2.onmouseenter = function(){ _d2.style.background = "var(--anima-bg)"; }; _d2.onmouseleave = function(){ _d2.style.background = ""; }; _d2.onclick = function(){ _menu2.remove(); document.removeEventListener("mousedown", _cm2); cb(); }; _menu2.appendChild(_d2); };
                                _mi2("\u270f\ufe0f \u91cd\u547d\u540d", function(){
                                    window._dbInputDlg({title:"\u91cd\u547d\u540d", value:_nm, onOk:function(_nn){
                                    if (_nn && _nn.trim() && _nn !== _nm) {
                                        fetch("/danbooru_anima/favorites/folder", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"rename",category:"artists",name:_nm,new_name:_nn.trim()})})
                                        .then(function(r){return r.json();}).then(function(d){ if (d.success) { if (_activeFolder === _nm) _activeFolder = _nn.trim(); _reloadArt(); } else alert(d.error || "\u91cd\u547d\u540d\u5931\u8d25"); });
                                    }
                                    }});
                                });
                                _mi2("\ud83d\uddd1 \u5220\u9664", function(){
                                    window._dbConfirmDlg({title:"\u5220\u9664\u6587\u4ef6\u5939", message:"\u5220\u9664\u6587\u4ef6\u5939\u300c" + _nm + "\u300d\uff1f\u91cc\u9762\u7684\u753b\u5e08\u5c06\u56de\u5230\u672a\u5206\u7c7b\u3002", onOk:function(){
                                    fetch("/danbooru_anima/favorites/folder", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"delete",category:"artists",name:_nm})})
                                    .then(function(r){return r.json();}).then(function(d){ if (d.success) { if (_activeFolder === _nm) _activeFolder = '__uncat'; _reloadArt(); } else alert(d.error || "\u5220\u9664\u5931\u8d25"); });
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
                            .then(function(r){return r.json();}).then(function(d){ if (d.success) { _activeFolder = _nm.trim(); _reloadArt(); } else alert(d.error || "\u521b\u5efa\u5931\u8d25"); });
                        }
                        }});
                    };
                    folderBar.appendChild(_addC);
                }
                var _reloadArt = function(){
                    Promise.all([
                        fetch("/danbooru_anima/favorites?cats=artists").then(function(r){return r.json();}).catch(function(){return {};}),
                        fetch("/gelbooru_anima/favorites?cats=artists").then(function(r){return r.json();}).catch(function(){return {};})
                    ]).then(function(results){
                        _dArt = (results[0].favorites||{}).artists||{};
                        _gArt = (results[1].favorites||{}).artists||{};
                        _foldData = (results[0].favorites||{})._folders||{};
                        _starred = {};
                        var initArt = _src === "danbooru" ? _dArt : _gArt;
                        Object.keys(initArt).forEach(function(k){ if (k!=="_order" && (initArt[k].starred || initArt[k].star)) _starred[k] = true; });
                        renderSrc();
                        if (Object.keys(_starred).length) renderPinned(); else pinnedBar.style.display = "none";
                    });
                };
                if (window.animaFavGrid && window.animaFavGrid.onChange) {
                    _unsubFav = window.animaFavGrid.onChange(function(){ if (bx.isConnected) _reloadArt(); }, _favSyncId);
                }
                var _moveOneArtist = function(e, tag) {
                    e.preventDefault(); e.stopPropagation();
                    if (hoverPop) hoverPop.style.display = "none";
                    if (_src !== "danbooru") { alert("\u6587\u4ef6\u5939\u5206\u7c7b\u4ec5\u652f\u6301 D\u7ad9\u6536\u85cf"); return; }
                    if (!tag) return;
                    _folderPickMenu(e.clientX, e.clientY, function(_tgt){
                        var _keys = [tag];
                        var _body = _tgt === '__uncat'
                            ? JSON.stringify({action:"remove_from_all",category:"artists",item_keys:_keys})
                            : JSON.stringify({action:"move",category:"artists",item_keys:_keys,target_folder:_tgt});
                        fetch("/danbooru_anima/favorites/folder", {method:"POST",headers:{"Content-Type":"application/json"},body:_body})
                        .then(function(r){return r.json();}).then(function(d){ if (d.success) _reloadArt(); else alert(d.error || "\u79fb\u52a8\u5931\u8d25"); });
                    });
                };
                // float save
                var floatSave = document.createElement("div");
                floatSave.style.cssText = "display:none;margin-top:8px;flex-shrink:0;";
                var floatSaveBtn = document.createElement("button");
                var _noteMode = false;
                var setArtistNote = function(_tag2){
                    if (_src !== "danbooru") { alert("\u5907\u6ce8\u4ec5\u652f\u6301 D\u7ad9\u6536\u85cf"); return; }
                    var _cur2 = (_dArt[_tag2] && _dArt[_tag2].note) || "";
                    window._dbInputDlg({title:"\u5907\u6ce8\u540d", placeholder:"\u7559\u7a7a\u5373\u6e05\u9664", value:_cur2, onOk:function(_nn){
                    fetch("/danbooru_anima/favorites/note", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag:_tag2, category:"artists", note:_nn.trim()})})
                    .then(function(r){return r.json();}).then(function(d){ if (d.success) _reloadArt(); else alert(d.error || "\u8bbe\u7f6e\u5931\u8d25"); });
                    }});
                };
                var floatMoveBtn = document.createElement("button");
                floatMoveBtn.textContent = "\ud83d\udcc1 \u79fb\u52a8";
                floatMoveBtn.style.cssText = "padding:8px 16px;border-radius:8px;border:1px solid rgba(var(--anima-accent-rgb),0.35);cursor:pointer;font-size:12px;background:var(--anima-title);color:var(--anima-accent-soft);font-weight:bold;transition:all .15s ease;margin-left:8px;";
                floatMoveBtn.onmouseover = function(){ this.style.background = "var(--anima-title)"; this.style.transform = "translateY(-1px)"; };
                floatMoveBtn.onmouseout = function(){ this.style.background = "var(--anima-title)"; this.style.transform = ""; };
                floatMoveBtn.onclick = function(e){
                    if (_src !== "danbooru") { alert("\u6587\u4ef6\u5939\u5206\u7c7b\u4ec5\u652f\u6301 D\u7ad9\u6536\u85cf"); return; }
                    _folderPickMenu(e.clientX, e.clientY, function(_tgt){
                        var _keys = _multiSelected.slice();
                        if (!_keys.length) return;
                        var _body = _tgt === '__uncat'
                            ? JSON.stringify({action:"remove_from_all",category:"artists",item_keys:_keys})
                            : JSON.stringify({action:"move",category:"artists",item_keys:_keys,target_folder:_tgt});
                        fetch("/danbooru_anima/favorites/folder", {method:"POST",headers:{"Content-Type":"application/json"},body:_body})
                        .then(function(r){return r.json();}).then(function(d){ if (d.success) { _multiSelected = []; floatSave.style.display = "none"; _reloadArt(); } else alert(d.error || "\u79fb\u52a8\u5931\u8d25"); });
                    });
                };
                floatSave.appendChild(floatMoveBtn);
                floatSaveBtn.textContent = animaTxt("💾 保存组合");
                floatSaveBtn.style.cssText = "padding:8px 16px;border-radius:8px;border:1px solid rgba(var(--anima-accent-rgb),0.35);cursor:pointer;font-size:12px;background:var(--anima-title);color:var(--anima-accent-soft);font-weight:bold;transition:all .15s ease;";
                        floatSaveBtn.onmouseover = function(){ this.style.background = "#21463c"; this.style.transform = "translateY(-1px)"; };
                        floatSaveBtn.onmouseout = function(){ this.style.background = "var(--anima-title)"; this.style.transform = ""; };
                floatSaveBtn.onclick = function(){
                    var mini = document.createElement("div");
                    mini.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--anima-bg);border:1px solid var(--anima-title);border-radius:10px;padding:14px;z-index:100006;display:flex;flex-direction:column;gap:8px;min-width:300px;box-shadow:0 4px 16px rgba(0,0,0,0.6);";
                    mini.innerHTML = '<span style="color:var(--anima-accent-soft);font-size:14px;font-weight:bold;">保存画师组合</span>';
                    var miniInp = document.createElement("input");
                    miniInp.type = "text"; miniInp.placeholder = animaTxt("组合名称"); miniInp.value = _multiSelected.slice(0,3).join(" + ");
                    miniInp.style.cssText = "padding:6px 10px;border-radius:6px;border:1px solid var(--anima-title);background:var(--anima-bg);color:#e0e0e0;font-size:12px;outline:none;";
                    mini.appendChild(miniInp);
                    var miniRow = document.createElement("div");
                    miniRow.style.cssText = "display:flex;gap:6px;justify-content:flex-end;";
                    var miniCancel = document.createElement("button");
                    miniCancel.textContent = animaTxt("取消"); miniCancel.style.cssText = "padding:6px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:var(--anima-mute);cursor:pointer;font-size:12px;";
                    miniCancel.onclick = function(){ mini.remove(); };
                    var miniOk = document.createElement("button");
                    miniOk.textContent = animaTxt("保存"); miniOk.style.cssText = "padding:6px 12px;border-radius:6px;border:1px solid rgba(var(--anima-accent-rgb),0.35);background:var(--anima-title);color:var(--anima-accent-soft);cursor:pointer;font-size:12px;font-weight:bold;transition:all .15s ease;";
                            miniOk.onmouseover = function(){ this.style.background = "#21463c"; this.style.transform = "translateY(-1px)"; };
                            miniOk.onmouseout = function(){ this.style.background = "var(--anima-title)"; this.style.transform = ""; };
                    miniOk.onclick = function(){
                        var name2 = miniInp.value.trim() || _multiSelected.slice(0,3).join("+");
                        var combos2 = []; try { combos2 = JSON.parse(localStorage.getItem("danbooru_artist_combos")||"[]"); } catch(e) {}
                        var thumbs2 = [];
                        if (_multiSelected.length > 0) { var info0 = (_src==="danbooru"?_dArt:_gArt)[_multiSelected[0]]||{}; var t2 = info0.thumb || info0.preview_url || info0.file_url || info0.sample_url || ""; if (!t2) { console.warn("[Anima] combo: no thumb for", _multiSelected[0], "src:",_src, "keys:", Object.keys(_src==="danbooru"?_dArt:_gArt).slice(0,5)); } if (t2) thumbs2.push(t2); }
                        combos2.push({name:name2, artists:_multiSelected.slice(), thumbs:thumbs2});
                        try { localStorage.setItem("danbooru_artist_combos", JSON.stringify(combos2)); } catch(e) {}
                        _saveCombosToServer(combos2);
                        _multiMode = false; _multiSelected = [];
                        var mt2 = bx.querySelector("#fav_multi_toggle"); if(mt2){ mt2.textContent=animaTxt("☐ 多选"); mt2.classList.remove('on'); }
                        floatSave.style.display = "none";
                        mini.remove();
                        renderSrc(); renderPinned();
                    };
                    miniRow.appendChild(miniCancel); miniRow.appendChild(miniOk);
                    mini.appendChild(miniRow);
                    document.body.appendChild(mini);
                };
                floatSave.appendChild(floatSaveBtn);
                bx.appendChild(floatSave);
                function toggleStar(tag, callback) {
                    var isStarred = !!_starred[tag];
                    var apiUrl = _src === "danbooru" ? "/danbooru_anima/favorites/star" : "/gelbooru_anima/favorites/star";
                    var body = {tag: tag, category: "artists"};
                    if (_src !== "danbooru") body.star = !isStarred;
                    fetch(apiUrl, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)})
                        .then(function(r){return r.json();})
                        .then(function(d){
                            if (d.success) {
                                var newStar = _src === "danbooru" ? d.starred : !isStarred;
                                _starred[tag] = newStar;
                                if (callback) callback(newStar);
                                if (window.animaFavGrid && window.animaFavGrid.emitChange) window.animaFavGrid.emitChange(_favSyncId);
                                var needGrid = !!(_hidePinned && !newStar);
                                if (needGrid) { renderSrc(); renderPinned(); return; }
                                var cards = grid.querySelectorAll(".tp-card");
                                for (var ci = 0; ci < cards.length; ci++) {
                                    if (!cards[ci].dataset || cards[ci].dataset.tag !== tag) continue;
                                    var rr = cards[ci].querySelector(".anima-fav-rate");
                                    if (rr) { if (newStar) rr.classList.remove("is-unpin"); else rr.classList.add("is-unpin"); }
                                    if (_hidePinned && newStar) cards[ci].remove();
                                    break;
                                }
                                renderPinned();
                            }
                        }).catch(function(e){ console.error("toggleStar:", e); });
                }
                function ratePinnedArtist(tag, n) {
                    if (!window.animaFavGrid || typeof window.animaFavGrid.rateFavorite !== "function") return;
                    window.animaFavGrid.rateFavorite(_src, tag, "artists", n, _favSyncId).then(function(d){
                        if (!d || !d.success) return;
                        var art = _src === "danbooru" ? _dArt : _gArt;
                        if (art[tag] && typeof art[tag] === "object") art[tag].rating = n;
                        if (window.animaFavGrid && window.animaFavGrid.paintRateTag) window.animaFavGrid.paintRateTag(tag, n, bx);
                    });
                }
                function _paintFavMulti(tag) {
                    var sel = _multiSelected.indexOf(tag) >= 0;
                    var i, el, cards = grid.querySelectorAll(".tp-card");
                    for (i = 0; i < cards.length; i++) {
                        el = cards[i];
                        if (!el.dataset || el.dataset.tag !== tag) continue;
                        el.style.border = sel ? "3px solid var(--anima-accent-soft)" : "1px solid rgba(255,255,255,0.06)";
                    }
                    var chips = pinnedBar.querySelectorAll(".tp-pin-chip");
                    for (i = 0; i < chips.length; i++) {
                        el = chips[i];
                        if (!el.dataset || el.dataset.tag !== tag) continue;
                        el.style.border = sel ? "1px solid var(--anima-accent-soft)" : "1px solid rgba(255,255,255,0.08)";
                        el.style.background = sel ? "rgba(var(--anima-accent-rgb),0.15)" : "rgba(255,255,255,0.04)";
                    }
                }
                function renderPinned() {
                    var art = _src === "danbooru" ? _dArt : _gArt;
                    var pinned = Object.keys(art).filter(function(k){return k!=="_order" && !!_starred[k];});
                    var _po = null;
                    try { _po = JSON.parse(localStorage.getItem('tp_pin_order') || 'null'); } catch(e){}
                    if (window.animaFavGrid && window.animaFavGrid.sortPinned) {
                        window.animaFavGrid.sortPinned(pinned, function(k){ var inf = art[k] || {}; return inf.rating; }, _po);
                    } else if (Array.isArray(_po) && _po.length) {
                        pinned.sort(function(a,b){
                            var ia = _po.indexOf(a), ib = _po.indexOf(b);
                            if (ia < 0) ia = 9999; if (ib < 0) ib = 9999;
                            return ia - ib;
                        });
                    }
                    if (!pinned.length) { pinnedBar.style.display = "none"; return; }
                    pinnedBar.style.display = "flex";
                    pinnedBar.innerHTML = '<div id="tp-pin-head" style="position:sticky;top:0;z-index:5;display:flex;align-items:center;flex-wrap:nowrap;width:100%;min-width:0;flex-shrink:0;gap:6px;padding-top:6px;background:rgba(var(--anima-bg-deep-rgb),.42);"><span id="tp-hide-pin" title="开启后隐藏列表中的已收藏画师" style="cursor:pointer;font-size:12px;width:24px;height:24px;line-height:22px;text-align:center;border-radius:50%;user-select:none;margin-right:6px;flex-shrink:0;' + (_hidePinned ? 'background:rgba(var(--anima-accent-rgb),0.18);border:1px solid rgba(var(--anima-accent-rgb),0.4);color:var(--anima-accent-soft);' : 'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:var(--anima-mute);') + '">' + (_hidePinned
                        ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6"/><path d="M4.5 16.5L8 13M19.5 16.5L16 13"/></svg>'
                        : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/></svg>') + '</span>' + '<span style="color:#ffd93d;font-size:10px;font-weight:600;margin-right:4px;white-space:nowrap;line-height:22px;">\u{1f4cc} \u7f6e\u9876</span>' + '<span id="tp-pin-fold" title="折叠/展开置顶栏" style="cursor:pointer;font-size:10px;padding:2px 9px;border-radius:999px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);color:var(--anima-mute);line-height:18px;user-select:none;margin-left:6px;flex-shrink:0;">' + (_pinCollapsed ? '\u25bc \u5c55\u5f00' : '\u25b2 \u6536\u8d77') + '</span>' + '<span id="tp-pin-rows-btn" title="\u8c03\u6574\u7f6e\u9876\u680f\u663e\u793a\u884c\u6570" style="cursor:pointer;font-size:10px;padding:2px 9px;border-radius:999px;background:rgba(var(--anima-accent-rgb),0.1);border:1px solid rgba(var(--anima-accent-rgb),0.3);color:var(--anima-accent-soft);line-height:18px;user-select:none;margin-left:6px;flex-shrink:0;">\u{1f4d0} ' + _pinRows + ' \u884c \u25be</span></div>';
                    var _hpEl = pinnedBar.querySelector('#tp-hide-pin');
                    if (_hpEl) _hpEl.onclick = function() {
                        _hidePinned = !_hidePinned;
                        localStorage.setItem('tp_hide_pinned', _hidePinned ? '1' : '0');
                        renderSrc(); renderPinned();
                    };
                    var _foldEl = pinnedBar.querySelector('#tp-pin-fold');
                    if (_foldEl) _foldEl.onclick = function() {
                        _pinCollapsed = !_pinCollapsed;
                        localStorage.setItem('tp_pin_collapsed', _pinCollapsed ? '1' : '0');
                        renderSrc(); renderPinned();
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
                            _b2.onclick = function(){ _menu.remove(); try { localStorage.removeItem('tp_pin_h'); } catch(e2){} _pinRows = _r; try { localStorage.setItem('tp_pin_rows', String(_pinRows)); } catch(e2){} _pinApplyHeight(); renderPinned(); };
                            _menu.appendChild(_b2);
                        })(_ri); }
                        document.body.appendChild(_menu);
                        var _closeM = function(ev){ if (!_menu.contains(ev.target)) { _menu.remove(); document.removeEventListener("mousedown", _closeM); } };
                        setTimeout(function(){ document.addEventListener("mousedown", _closeM); }, 0);
                    };
                    for (var pi=0; pi<pinned.length; pi++) {
                        var _tag = pinned[pi];
                        var _info = art[_tag]||{};
                        var _sel = _multiSelected.indexOf(_tag)>=0;
                        var _chip = document.createElement("div");
                        _chip.className = "tp-pin-chip";
                        _chip.dataset.tag = _tag;
                        _chip.style.cssText = "display:flex;align-items:center;gap:4px;padding:4px 10px 4px 4px;border-radius:8px;cursor:pointer;background:"+(_sel?"rgba(var(--anima-accent-rgb),0.15)":"rgba(255,255,255,0.04)")+";border:1px solid "+(_sel?"var(--anima-accent-soft)":"rgba(255,255,255,0.08)")+";transition:all 0.2s ease;max-width:none;";
                        (function(t, sel, info, chip){
                            chip.onmouseover = function(){ this.style.background="rgba(255,255,255,0.1)"; };
                            chip.onmouseout = function(){ var live = _multiSelected.indexOf(t)>=0; this.style.background=live?"rgba(var(--anima-accent-rgb),0.15)":"rgba(255,255,255,0.04)"; };
                            chip.onclick = function(e){
                                if (_noteMode) { setArtistNote(t); return; }
                                if (_multiMode) {
                                    var idx = _multiSelected.indexOf(t);
                                    if (idx>=0) _multiSelected.splice(idx,1); else _multiSelected.push(t);
                                    var mt = bx.querySelector("#fav_multi_toggle"); if(mt) mt.textContent = "\u2611 \u591a\u9009("+_multiSelected.length+")";
                                    floatSave.style.display = _multiSelected.length>=2?"block":"none";
                                    _paintFavMulti(t);
                                } else {
                                    if (window._artistFavOnSelect) { window._artistFavOnSelect(t.indexOf("@")===0?t.slice(1):t); return; }
                                    if (window._artistFavFallback) { window._artistFavFallback(t); }
                                }
                            };
                            chip.oncontextmenu = function(e){ _moveOneArtist(e, t); };
                            if (info.thumb) {
                                chip.onmouseenter = function(){
                                    if (window.__animaChipDragging) return;
                                    if (chip._hovT) { clearTimeout(chip._hovT); }
                                    chip._hovT = setTimeout(function(){
                                        chip._hovT = null;
                                        if (window.__animaChipDragging) return;
                                        if (!chip.matches(':hover')) return;
                                        hoverImg.src = window.animaFavGrid && window.animaFavGrid.favSrc ? window.animaFavGrid.favSrc(info.thumb, _src, _tag) : (window.animaFavGrid ? window.animaFavGrid.proxySrc(info.thumb, _src, false) : (_src==="danbooru" ? ("/danbooru_anima/image_proxy?url="+encodeURIComponent(info.thumb)) : ("/gelbooru_anima/image_proxy?url="+encodeURIComponent(info.thumb))));
                                        var rect = chip.getBoundingClientRect();
                                        var top = rect.bottom + 4, left = rect.left;
                                        if (top + 160 > window.innerHeight) top = rect.top - 160;
                                        if (left + 160 > window.innerWidth) left = window.innerWidth - 170;
                                        hoverPop.style.top = top + "px"; hoverPop.style.left = left + "px";
                                        hoverPop.style.display = "block";
                                    }, 400);
                                };
                                chip.onmouseleave = function(){ if (chip._hovT) { clearTimeout(chip._hovT); chip._hovT = null; } hoverPop.style.display = "none"; };
                                chip.addEventListener("mousedown", function(){ if (chip._hovT) { clearTimeout(chip._hovT); chip._hovT = null; } hoverPop.style.display = "none"; }, true);
                            }
                        })(_tag, _sel, _info, _chip);
                        if (_info.thumb) {
                            var tn2 = document.createElement("img");
                            tn2.style.cssText = "width:40px;height:40px;border-radius:6px;object-fit:cover;flex-shrink:0;";
                            if (window.animaFavGrid) window.animaFavGrid.bindImg(tn2, _info.thumb, _src, {eager:false,width:"40px",height:"40px",objectFit:"cover",borderRadius:"6px",tag:_tag,cat:"artists"});
                            else { tn2.src = _src==="danbooru" ? ("/danbooru_anima/image_proxy?url="+encodeURIComponent(_info.thumb)) : ("/gelbooru_anima/image_proxy?url="+encodeURIComponent(_info.thumb)); tn2.onerror = function(){ this.style.display="none"; }; }
                            _chip.appendChild(tn2);
                        }
                        var lb2 = document.createElement("span");
                        lb2.textContent = "@" + (_info.note || _tag);
                        lb2.title = "@" + (_info.note || _tag);
                        lb2.style.cssText = "color:var(--anima-accent-soft);font-size:12px;white-space:nowrap;";
                        var col2 = document.createElement("div");
                        col2.style.cssText = "display:flex;flex-direction:column;align-items:flex-start;min-width:0;gap:2px;";
                        col2.appendChild(lb2);
                        if (window.animaFavGrid && window.animaFavGrid.makeRateRow) {
                            col2.appendChild(window.animaFavGrid.makeRateRow((_info && _info.rating) || 0, (function(t){ return function(n){ ratePinnedArtist(t, n); }; })(_tag), { size: 12, tag: _tag }));
                        }
                        _chip.appendChild(col2);
                        pinnedBar.appendChild(_chip);
                    }
                    if (_pinCollapsed) pinnedBar.querySelectorAll('.tp-pin-chip').forEach(function(ch){ ch.style.display = 'none'; }); var _pr2 = pinnedBar.querySelector('#tp-pin-resize'); if (_pr2) _pr2.style.display = _pinCollapsed ? 'none' : 'block'; _pinApplyHeight();
                }
                // render
                function renderSrc(opt){
                    opt = opt || {};
                    var _keepY = grid.scrollTop || 0;
                    if (opt.reset) { _favPage = 1; _keepY = 0; }
                    if (opt.top) _keepY = 0;
                    var art = _src === "danbooru" ? _dArt : _gArt;
                    folderBar.style.display = (_src === "danbooru" && Object.keys(art).length > 0) ? "flex" : "none";
                    if (_src === "danbooru") _renderFolderBar();
                    var keys = ((art._order && art._order.length) ? art._order.slice() : Object.keys(art).filter(function(k){return k!=="_order";}));
                    keys = keys.filter(function(k){ return k !== "_order" && art[k]; });
                    if (window.animaFavGrid && window.animaFavGrid.applyJoinSort) keys = window.animaFavGrid.applyJoinSort(keys);
                    if (_src === "danbooru" && _foldData.artists) {
                        var _fldf = _foldData.artists;
                        if (_activeFolder === '__uncat') {
                            var _allInF = new Set();
                            for (var _fnf in _fldf) { if (_fnf === "__tmp") continue; (_fldf[_fnf] || []).forEach(function(k){ _allInF.add(k); }); }
                            keys = keys.filter(function(k){ return !_allInF.has(k); });
                        } else {
                            var _flKeys = _fldf[_activeFolder] || [];
                            keys = keys.filter(function(k){ return _flKeys.indexOf(k) >= 0; });
                        }
                    }
                    // 👁 隐藏置顶：主列表过滤掉已收藏（置顶）的，只留未收藏
                    if (_hidePinned) {
                        keys = keys.filter(function(k){ return !_starred[k]; });
                    }
                    if (!opt.gridOnly) grid._favCardPool = {};
                    if (opt.gridOnly) {
                        while (grid.firstChild) grid.removeChild(grid.firstChild);
                    } else {
                        grid.innerHTML = "";
                    }
                    if (!grid._favCardPool) grid._favCardPool = {};
                    if (!keys.length) { grid.innerHTML = '<div class="fav-empty" style="color:var(--anima-mute);text-align:center;padding:20px;grid-column:1/-1;">暂无收藏</div>'; if (pagerBar) pagerBar.paint({page:1,pages:1,total:0}); if (window.animaFavGrid) window.animaFavGrid.finish(grid); return; }
                    var _pg = (window.animaFavGrid && window.animaFavGrid.slicePage) ? window.animaFavGrid.slicePage(keys, _favPage) : {page:1,pages:1,total:keys.length,items:keys};
                    _favPage = _pg.page;
                    if (pagerBar) pagerBar.paint(_pg);
                    keys = _pg.items;
                    for (var ki=0; ki<keys.length; ki++) {
                        var tag = keys[ki];
                        var info = art[tag]||{};
                        var selected = _multiSelected.indexOf(tag) >= 0;
                        var _ck = _src + "\0" + tag;
                        var _hit = grid._favCardPool[_ck];
                        if (_hit) {
                            _hit.style.border = selected ? "3px solid var(--anima-accent-soft)" : "1px solid rgba(255,255,255,0.06)";
                            var _lb = _hit.querySelector(".fav-lbl");
                            var _dn = "@" + (info.note || tag);
                            if (_lb && _lb.textContent !== _dn) _lb.textContent = _dn;
                            var _sb = _hit.querySelector(".fav-star-btn");
                            if (_sb) _sb.style.color = (_starred[tag] ? "#ffeb3b" : "var(--anima-mute)");
                            var _rr = _hit.querySelector(".anima-fav-rate");
                            if (_rr) {
                                if (_starred[tag]) _rr.classList.remove("is-unpin"); else _rr.classList.add("is-unpin");
                                if (typeof _rr._setRating === "function") _rr._setRating((info && info.rating) || 0);
                            }
                            grid.appendChild(_hit);
                            continue;
                        }
                        var card = document.createElement("div");
                        card.style.cssText = "display:flex;flex-direction:column;align-items:center;min-width:0;width:100%;height:auto;min-height:min-content;align-self:start;background:rgba(255,255,255,0.04);border:"+(selected?"3px solid var(--anima-accent-soft)":"1px solid rgba(255,255,255,0.06)")+";border-radius:6px;overflow:visible;cursor:pointer;transition:background .15s ease,box-shadow .15s ease;padding:4px;gap:6px;box-sizing:border-box;";
                        card.className = "tp-card";
                        card.dataset.tag = tag;
                        card.onmouseover = (function(t3){ return function(){ this.style.background="rgba(255,255,255,0.08)"; this.style.boxShadow="0 0 0 1px rgba(var(--anima-accent-rgb),0.45),0 4px 12px rgba(0,0,0,0.25),0 0 10px rgba(var(--anima-accent-rgb),0.2)"; }; })(tag);
                        card.onmouseout = (function(t3){ return function(){ this.style.background="rgba(255,255,255,0.04)"; this.style.boxShadow=""; }; })(tag);
                        card.onclick = (function(t2){ return function(){
                            if (_noteMode) { setArtistNote(t2); return; }
                            if (_multiMode) {
                                var idx = _multiSelected.indexOf(t2);
                                if (idx >= 0) _multiSelected.splice(idx,1); else _multiSelected.push(t2);
                                var mt = bx.querySelector("#fav_multi_toggle");
                                if (mt) mt.textContent = "☑ 多选("+_multiSelected.length+")";
                                floatSave.style.display = _multiSelected.length >= 2 ? "block" : "none";
                                _paintFavMulti(t2);
                            } else {
                                if (window._artistFavOnSelect) { window._artistFavOnSelect(t2.indexOf("@")===0 ? t2.slice(1) : t2); return; }
                                if (window._artistFavFallback) { window._artistFavFallback(t2); }
                            }
                        }; })(tag);
                        card.oncontextmenu = (function(t2){ return function(e){ _moveOneArtist(e, t2); }; })(tag);
                        var tnWrap = document.createElement("div");
                        tnWrap.className = "fav-img-wrap";
                        tnWrap.style.cssText = "width:100%;height:240px;overflow:hidden;border-radius:4px;background:rgba(var(--anima-well-rgb),.16);border:1px solid rgba(255,255,255,.06);flex-shrink:0;position:relative;display:flex;align-items:center;justify-content:center;";
                        var letter = document.createElement("span");
                        letter.className = "fav-letter";
                        letter.textContent = ((info.note || tag || "?")[0] || "?").toUpperCase();
                        tnWrap.appendChild(letter);
                        if (info.thumb || (window.animaFavGrid && window.animaFavGrid.live && window.animaFavGrid.live()) || (window.animaFavGrid && window.animaFavGrid.liveThumb && window.animaFavGrid.liveThumb(tag))) {
                            var tn = document.createElement("img");
                            if (window.animaFavGrid) window.animaFavGrid.bindImg(tn, info.thumb || "", _src, { tag: tag, cat: "artists" });
                            else {
                                tn.src = _src==="danbooru" ? ("/danbooru_anima/image_proxy?url="+encodeURIComponent(info.thumb)) : ("/gelbooru_anima/image_proxy?url="+encodeURIComponent(info.thumb));
                                tn.style.cssText = "width:100%;height:100%;object-fit:contain;";
                                tn.onerror = function(){ this.style.display="none"; };
                            }
                            tnWrap.appendChild(tn);
                        }
                        var starBtn = document.createElement("span");
                        starBtn.className = "fav-star-btn";
                        starBtn.textContent = "\u2605"; starBtn.title = "\u2605 \u6536\u85cf";
                        starBtn.style.cssText = "position:absolute;top:4px;right:4px;cursor:pointer;width:26px;height:26px;border-radius:50%;background:rgba(13,17,22,0.55);display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;text-shadow:none;z-index:3;opacity:1;transition:transform .15s ease;";
                        starBtn.style.color = (_starred[tag] ? "#ffeb3b" : "var(--anima-mute)");
                        (function(t2, sbtn){ sbtn.onclick = function(e2){ e2.stopPropagation(); toggleStar(t2, function(starred){ sbtn.style.color = starred ? "#ffd93d" : "var(--anima-mute)"; }); }; sbtn.onmouseover = function(e2){ e2.stopPropagation(); }; sbtn.onmouseout = function(e2){ e2.stopPropagation(); }; })(tag, starBtn);
                        tnWrap.appendChild(starBtn);
                        card.appendChild(tnWrap);
                        var lb = document.createElement("span");
                        lb.className = "fav-lbl";
                        lb.textContent = "@" + (info.note || tag);
                        lb.style.cssText = "color:#e0e0e0;font-weight:600;text-shadow:0 1px 2px rgba(0,0,0,0.6);;font-size:11px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;";
                        card.appendChild(lb);
                        if (window.animaFavGrid && window.animaFavGrid.makeRateRow) {
                            tnWrap.appendChild(window.animaFavGrid.makeRateRow((info && info.rating) || 0, (function(t){ return function(n){ ratePinnedArtist(t, n); }; })(tag), { center: true, size: 12, overlay: true, unpin: !_starred[tag], tag: tag }));
                        }
                        grid.appendChild(card);
                        grid._favCardPool[_ck] = card;
                    }
                    if (window.animaFavGrid) window.animaFavGrid.finish(grid);
                    grid.scrollTop = _keepY;
                }
                ["danbooru","gelbooru"].forEach(function(sk,i){
                    var tb = document.createElement("button");
                    tb.textContent = sk==="danbooru"?"D站":"G站";
                    tb.style.cssText = "flex:1;padding:5px;border:none;cursor:pointer;font-size:11px;font-weight:bold;"+(i===0?"background:var(--anima-title);color:var(--anima-accent-soft);border-radius:4px 0 0 4px;":"background:var(--anima-well-lo);color:var(--anima-mute);border-radius:0 4px 4px 0;");
                    tb.onclick = function(){
                        _src = sk; _favPage = 1; _multiSelected = []; floatSave.style.display = "none";
                        var mt = bx.querySelector("#fav_multi_toggle"); if(mt){ mt.textContent=animaTxt("☐ 多选"); mt.classList.remove('on'); }
                        Array.from(srcBar.children).forEach(function(b,j){b.style.background=j===(sk==="danbooru"?0:1)?"var(--anima-title)":"var(--anima-well-lo)";b.style.color=j===(sk==="danbooru"?0:1)?"var(--anima-accent-soft)":"var(--anima-mute)";});
                        var initArt = _src === "danbooru" ? _dArt : _gArt;
                        _starred = {};
                        Object.keys(initArt).forEach(function(k){ if (k!=="_order" && (initArt[k].starred || initArt[k].star)) _starred[k] = true; });
                        renderSrc();
                        if (Object.keys(_starred).length) renderPinned(); else pinnedBar.style.display = "none";
                    };
                    srcBar.appendChild(tb);
                });
                bx.appendChild(srcBar);
                bx.appendChild(pinnedBar);
                var folderBar = document.createElement("div");
                folderBar.style.cssText = "display:none;gap:6px;padding:4px 12px;border-bottom:1px solid rgba(var(--anima-accent-rgb),.25);flex-shrink:0;overflow-x:auto;white-space:nowrap;align-items:center;";
                bx.appendChild(folderBar);
                if (window.animaFavGrid) window.animaFavGrid.mountBar(bx, { getGrid: function(){ return grid; }, onSort: function(){ _favPage = 1; renderSrc({top:true, gridOnly:true}); } });
                bx.appendChild(grid);
                pagerBar = window.animaFavGrid ? window.animaFavGrid.mountPager(bx, { onPage: function(p){ _favPage = p; renderSrc({top:true, gridOnly:true}); } }) : null;
                document.body.appendChild(bx);
                setTimeout(function(){ if (window.clampPopup) window.clampPopup(bx); }, 0);
                    var noteEl = bx.querySelector("#fav_note_toggle");
                    if(noteEl) noteEl.onclick = function(){ _noteMode = !_noteMode; noteEl.classList.toggle('on', _noteMode); };
                // combo list
                setTimeout(function(){
                    var mt = bx.querySelector("#fav_multi_toggle");
                    if (mt) mt.onclick = function(){
                        _multiMode = !_multiMode;
                        mt.classList.toggle('on', _multiMode);
                        mt.textContent = _multiMode ? "☑ 多选(0)" : "☐ 多选";
                        if (!_multiMode) { _multiSelected = []; floatSave.style.display = "none"; }
                        renderSrc(); renderPinned();
                    };
                    var cb = bx.querySelector("#fav_combo_btn");
                    if (cb) cb.onclick = function(){
                        var old = document.getElementById("apc_combo_list");
                        if (old) { old.remove(); return; }
                        var cbx = document.createElement("div");
                        cbx.id = "apc_combo_list";
                        cbx.style.cssText = "position:fixed;top:25%;left:25%;background:rgba(var(--anima-bg-deep-rgb),.18);border:1px solid var(--anima-title);border-radius:12px;z-index:100003;min-width:380px;max-width:80vw;max-height:60vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.6);resize:both;overflow:auto;";
                        if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(cbx);
                        var chdr = document.createElement("div");
                        chdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:move;border-bottom:1px solid var(--anima-title);flex-shrink:0;";
                        var chdrClose = document.createElement("span");
chdrClose.textContent = "✕"; chdrClose.id = "apc_combo_close";
chdrClose.style.cssText = "cursor:pointer;color:#e94560;font-size:18px;";
chdrClose.onclick = function(){ cbx.remove(); };
chdr.innerHTML = '<span style="color:var(--anima-ink);font-size:14px;">📋 画师组合</span>';
chdr.appendChild(chdrClose);
                        chdr.onmousedown = function(e3){ if(e3.target.id==="apc_combo_close")return;var rect2=cbx.getBoundingClientRect();var dx2=e3.clientX-rect2.left,dy2=e3.clientY-rect2.top;cbx.style.top=rect2.top+"px";cbx.style.left=rect2.left+"px";cbx.style.transform="none";function mm2(ev){cbx.style.left=(ev.clientX-dx2)+"px";cbx.style.top=(ev.clientY-dy2)+"px"}function mu2(){document.removeEventListener("mousemove",mm2);document.removeEventListener("mouseup",mu2);}document.addEventListener("mousemove",mm2);document.addEventListener("mouseup",mu2);};
                        cbx.appendChild(chdr);
                        var cbody = document.createElement("div");
                        cbody.style.cssText = "flex:1;overflow-y:auto;padding:12px 16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;align-content:flex-start;";
                        function renderCombos(){
                            if (!cbx._comboSynced) {
                                cbx._comboSynced = true;
                                _loadCombosFromServer().then(function(){ renderCombos(); });
                                return;
                            }
                            var combos = []; try { combos = JSON.parse(localStorage.getItem("danbooru_artist_combos")||"[]"); } catch(e) {}
                            cbody.innerHTML = "";
                            if (!combos.length) { cbody.innerHTML = '<div style="color:var(--anima-mute);text-align:center;padding:20px;">暂无保存的组合</div>'; }
                            combos.forEach(function(combo,ci){
                                var row = document.createElement("div");
                                row.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px;border-radius:8px;background:rgba(255,255,255,0.03);cursor:pointer;text-align:center;";
                                row.onmouseover = function(){ this.style.background="rgba(255,255,255,0.06)"; };
                                row.onmouseout = function(){ this.style.background="rgba(255,255,255,0.03)"; };
                                row.onclick = function(){
                                    (combo.artists||[]).forEach(function(a){
                                        if (window._artistFavFallback) { window._artistFavFallback(a); }
                                    });
                                    if (window._artistFavFallbackRefresh) window._artistFavFallbackRefresh();
                                };
                                if (combo.thumbs && combo.thumbs.length) {
                                    var tn2 = document.createElement("img");
                                    var tnSrc = combo.thumbs[0];
if (tnSrc.indexOf("http")===0) {
    var _comboSrc = tnSrc.indexOf("gelbooru")>=0 ? "gelbooru" : "danbooru";
    if (window.animaFavGrid) tnSrc = window.animaFavGrid.proxySrc(tnSrc, _comboSrc, false);
    else if (tnSrc.indexOf("gelbooru")>=0) tnSrc = "/gelbooru_anima/image_proxy?url="+encodeURIComponent(tnSrc);
    else tnSrc = "/danbooru_anima/image_proxy?url="+encodeURIComponent(tnSrc);
}
tn2.src = tnSrc;
                                    tn2.style.cssText = "width:100%;aspect-ratio:1/1;border-radius:6px;object-fit:contain;";
                                    tn2.onerror = function(){ this.style.display="none"; };
                                    row.appendChild(tn2);
                                }
                                var nm2 = document.createElement("span");
                                nm2.textContent = (ci+1)+". "+combo.name; nm2.style.cssText = "color:#e0e0e0;font-size:12px;font-weight:600;";
                                row.appendChild(nm2);
                                var tags2 = document.createElement("span");
                                tags2.textContent = (combo.artists||[]).join(" + "); tags2.style.cssText = "color:var(--anima-accent-soft);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;";
                                row.appendChild(tags2);
                                var delBtn = document.createElement("span");
                                delBtn.textContent = "🗑"; delBtn.title = animaTxt("删除"); delBtn.style.cssText = "cursor:pointer;color:#e94560;font-size:14px;";
                                delBtn.onclick = (function(idx2){ return function(e4){ e4.stopPropagation(); combos.splice(idx2,1); localStorage.setItem("danbooru_artist_combos", JSON.stringify(combos)); _saveCombosToServer(combos); renderCombos(); }; })(ci);
                                row.appendChild(delBtn);
                                cbody.appendChild(row);
                            });
                        }
                        renderCombos();
                        cbx.appendChild(cbody);
                        document.body.appendChild(cbx);
                    };
                },0);
                // load data
                Promise.all([
                    fetch("/danbooru_anima/favorites?cats=artists").then(function(r){return r.json();}).catch(function(){return {};}),
                    fetch("/gelbooru_anima/favorites?cats=artists").then(function(r){return r.json();}).catch(function(){return {};})
                ]).then(function(results){
                    _dArt = (results[0].favorites||{}).artists||{};
                    _foldData = (results[0].favorites||{})._folders||{};
                    _gArt = (results[1].favorites||{}).artists||{};
                    var initArt = _src === "danbooru" ? _dArt : _gArt;
                    _starred = {};
                    Object.keys(initArt).forEach(function(k){ if (k!=="_order" && (initArt[k].starred || initArt[k].star)) _starred[k] = true; });
                    renderSrc();
                    if (Object.keys(_starred).length) renderPinned();
                });
            }
        window.showArtistFavPopup = showArtistFavPopup;
    };
    _exportArtistFav();
    if (window.app?.registerExtension) {
        window.app.registerExtension({
            name: "danbooru-anima.artist-fav-popup",
            async beforeRegisterNodeDef() {},
        });
    }
})();
