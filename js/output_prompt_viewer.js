(function () {
    if (window.__animaOutputPromptViewer >= 169) return;
    window.__animaOutputPromptViewer = 169;

    var LS_SKIN = "anima_opv_skin";
    var _skinDockReady = false;
    var OPV_SKIN_CLASS = { hub: "opv-skin-hub", glass: "opv-skin-glass", gallery: "opv-skin-gallery", kawaii: "opv-skin-kawaii" };
    function applyOpvSkin(id) {
        if (!id || !OPV_SKIN_CLASS[id]) {
            id = "default";
            try { localStorage.setItem(LS_SKIN, id); } catch (eSkin0) {}
        }
        var root = document.documentElement;
        var want = OPV_SKIN_CLASS[id] || "";
        var k;
        for (k in OPV_SKIN_CLASS) {
            if (!Object.prototype.hasOwnProperty.call(OPV_SKIN_CLASS, k)) continue;
            if (OPV_SKIN_CLASS[k] && OPV_SKIN_CLASS[k] !== want) root.classList.remove(OPV_SKIN_CLASS[k]);
        }
        root.classList.remove("opv-skin-mist", "opv-skin-chantier", "opv-skin-aqua");
        if (want) root.classList.add(want);
        syncOpvSkinButtons(id);
        if (_skinDockReady) settleDockLayout();
    }
    function setOpvSkinMenu(open) {
        var menu = document.getElementById("opv-skin-menu");
        var toggle = document.getElementById("opv-skin-toggle");
        if (menu) menu.hidden = !open;
        if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }
    function syncOpvSkinButtons(id) {
        if (!id || !OPV_SKIN_CLASS[id]) id = "default";
        var btns = document.querySelectorAll("#opv-skin-menu [data-opv-skin]");
        var i;
        for (i = 0; i < btns.length; i++) {
            var on = btns[i].getAttribute("data-opv-skin") === id;
            btns[i].classList.toggle("on", on);
            btns[i].setAttribute("aria-pressed", on ? "true" : "false");
        }
        var cur = document.getElementById("opv-skin-current");
        var lab = document.querySelector('#opv-skin-menu [data-opv-skin="' + id + '"] .opv-skin-name');
        if (cur && lab) cur.textContent = lab.textContent;
    }
    function setOpvSkin(id) {
        if (!id || !OPV_SKIN_CLASS[id]) id = "default";
        try { localStorage.setItem(LS_SKIN, id); } catch (eSkin) {}
        applyOpvSkin(id);
    }
    function readOpvSkin() {
        try { return localStorage.getItem(LS_SKIN) || "default"; } catch (e) { return "default"; }
    }
    applyOpvSkin(readOpvSkin());
    window.addEventListener("storage", function (ev) {
        if (!ev) return;
        if (ev.key === LS_SKIN) applyOpvSkin(ev.newValue || "default");
        if (ev.key === LS_RATE_FADE) applyRateFade(ev.newValue);
    });

    var LS_RATE_FADE = "anima_opv_rate_fade";
    function clampRateFade(n) {
        n = parseInt(n, 10);
        if (!isFinite(n)) n = 50;
        if (n < 0) n = 0;
        if (n > 100) n = 100;
        return n;
    }
    function readRateFade() {
        try {
            var raw = localStorage.getItem(LS_RATE_FADE);
            if (raw == null || raw === "") return 50;
            return clampRateFade(raw);
        } catch (eFade) { return 50; }
    }
    function applyRateFade(n) {
        n = clampRateFade(n);
        var root = document.documentElement;
        root.style.setProperty("--opv-rate-fade", (n / 100).toFixed(2));
        root.classList.toggle("opv-rate-ghost", n === 0);
        var inp = document.getElementById("opv-rate-fade");
        var lab = document.getElementById("opv-rate-val");
        if (inp && String(inp.value) !== String(n)) inp.value = String(n);
        if (lab) lab.textContent = n + "%";
    }
    function setRateFade(n) {
        n = clampRateFade(n);
        try { localStorage.setItem(LS_RATE_FADE, String(n)); } catch (eSet) {}
        applyRateFade(n);
    }
    applyRateFade(readRateFade());

    var PAGE_SIZES = [12, 24, 36, 48, 60, 80, 100, 120];
    var FLOW_CHUNK = 40;
    var LS_PAGE = "anima_opv_page_size";
    var LS_BROWSE = "anima_opv_browse";

    var LS_FLOW_TILE = "anima_opv_flow_tile";
    var FLOW_TILE_MIN = 90;
    var FLOW_TILE_MAX = 480;
    var FLOW_TILE_STEP = 10;
    var FLOW_TILE_DEF = 150;
    var LS_FX = "anima_opv_fx";
    var LS_INSPECT = "anima_opv_inspect_h";
    var LS_INSPECT_LAYOUT = "anima_opv_inspect_layout";
    var LS_ARTIST = "anima_opv_artist_h";
    var LS_SOLO = "anima_opv_solo_artist";
    var LS_ARTIST_FILTER = "anima_opv_artist_filter";
    var LS_CAST = "anima_opv_cast_filter";
    var LS_CAST_POP = "anima_opv_cast_pop";
    var LS_TAG = "anima_opv_tag_filter";
    var LS_TAG_KEY = "anima_opv_tag_key";
    var LS_TAG_CN = "anima_opv_tag_cn";
    var LS_TAG_POP = "anima_opv_tag_pop";
    var LS_MODEL = "anima_opv_model";
    var LS_MODEL_POP = "anima_opv_model_pop";
    var LS_ARTIST_POP = "anima_opv_artist_pop";
    var LS_PICK_ART = "anima_opv_pick_artist";
    var LS_PICK_UNUSED = "anima_opv_pick_unused";
    var LS_PICK_DEEP = "anima_opv_pick_deep";
    var LS_LIST_DEEP = "anima_opv_list_deep";
    var LS_SORT = "anima_opv_folder_sort";
    var LS_HEART = "anima_opv_heart_rate";
    var LS_PROMPT_SRC = "anima_opv_prompt_src";
    var LS_AUTO_SD = "anima_opv_auto_shutdown";
    var IMG_FAV_SUB = "__img_favs__";
    var _imgFav = { keys: Object.create(null), count: 0 };
    var _favDirInfo = null;
    var _favDirBusy = false;
    var _favDirPickBusy = false;
    var _imgRate = { keys: Object.create(null) };
    var SORT_CYCLE = ["newest", "oldest", "rating", "rating_asc"];
    var _popDock = "";
    var _popCollapsed = false;
    var _popLayLoaded = false;
    var _popFree = { left: 80, top: 72, w: 640, h: 440 };
    var _snapKind = "";
    var _insDock = "bottom";
    var _insCollapsed = false;
    var _insFree = { left: 80, top: 120, w: 720, h: 380 };
    var _castDock = "";
    var _castCollapsed = false;
    var _castLayLoaded = false;
    var _castFree = { left: null, top: null, w: 680, h: 560 };
    var _tagCollapsed = false;
    var _tagDock = "";
    var _tagFree = { left: null, top: null, w: 520, h: 520 };
    var _modelCollapsed = false;
    var _modelDock = "";
    var _modelFree = { left: null, top: null, w: 340, h: 420 };
    var _modelLayLoaded = false;
    var _modelIdxGen = 0;
    var _modelPoll = 0;
    var _modelSawPending = false;
    var _tagLayLoaded = false;
    var _lastInsets = { left: -1, right: -1, top: -1, bottom: -1 };
    var _insetRaf = 0;
    var _dockLayRaf = 0;

    function readPageSize() {
        var n = 36;
        try { n = parseInt(localStorage.getItem(LS_PAGE) || "36", 10); } catch (e) { n = 36; }
        if (PAGE_SIZES.indexOf(n) < 0) n = 36;
        return n;
    }
    function readBrowse() {
        try { return localStorage.getItem(LS_BROWSE) === "flow" ? "flow" : "page"; } catch (e) { return "page"; }
    }
    function readFxOn() {
        var v = "";
        try { v = localStorage.getItem(LS_FX) || "on"; } catch (e) { v = "on"; }
        if (v === "cheap" || v === "off" || v === "0") return false;
        return true;
    }
    function readSoloArtist() {
        try { return localStorage.getItem(LS_SOLO) === "1"; } catch (e) { return false; }
    }
    function readArtistFilter() {
        try { return localStorage.getItem(LS_ARTIST_FILTER) === "1"; } catch (e) { return false; }
    }
    function readCastFilter() {
        try { return localStorage.getItem(LS_CAST) === "1"; } catch (e0) { return false; }
    }
    function readTagFilter() {
        try { return localStorage.getItem(LS_TAG) === "1"; } catch (eT0) { return false; }
    }
    function readTagKey() {
        try { return localStorage.getItem(LS_TAG_KEY) || ""; } catch (eT1) { return ""; }
    }
    function readTagCn() {
        try { return localStorage.getItem(LS_TAG_CN) || ""; } catch (eT2) { return ""; }
    }
    function readModelKey() {
        try { return localStorage.getItem(LS_MODEL) || ""; } catch (eM0) { return ""; }
    }
    function persistModelKey() {
        try { localStorage.setItem(LS_MODEL, state.modelKey || ""); } catch (eM1) {}
    }
    function readPickUnused() {
        var v = "";
        try { v = localStorage.getItem(LS_PICK_UNUSED) || "off"; } catch (e1) { v = "off"; }
        if (v !== "never" && v !== "solo") v = "off";
        return v;
    }
    function readPickDeep() {
        try { return localStorage.getItem(LS_PICK_DEEP) === "1"; } catch (e2) { return false; }
    }
    function readHeartRate() {
        var raw = "";
        try { raw = String(localStorage.getItem(LS_HEART) || ""); } catch (eHr) { raw = ""; }
        if (raw === "none" || raw === "-1") return -1;
        var n = parseInt(raw || "0", 10);
        if (n >= 1 && n <= 5) return n;
        return 0;
    }
    function readListDeep() {
        var v = "";
        try { v = localStorage.getItem(LS_LIST_DEEP); } catch (eLd) { v = ""; }
        if (v === "0" || v === "off" || v === "false") return false;
        return true;
    }
    function listDeepOn() {
        return state.listDeep !== false;
    }
    function folderScopeKey() {
        return String(state.subfolder || "") + "\0" + (listDeepOn() ? "1" : "0");
    }
    function listDeepQuery() {
        return "deep=" + (listDeepOn() ? "1" : "0");
    }

    function sortFolderKey() {
        return String(state.subfolder || "");
    }
    function readSortMap() {
        try {
            var raw = localStorage.getItem(LS_SORT);
            var o = raw ? JSON.parse(raw) : {};
            return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
        } catch (eS0) { return {}; }
    }
    function listSort() {
        var v = readSortMap()[sortFolderKey()];
        return SORT_CYCLE.indexOf(v) >= 0 ? v : "newest";
    }
    function listSortQuery() {
        return "sort=" + listSort();
    }
    function sortLabel(id) {
        if (id === "oldest") return T("最旧在前");
        if (id === "rating") return T("高分在前");
        if (id === "rating_asc") return T("低分在前");
        return T("最新在前");
    }
    function sortHint(id) {
        if (id === "oldest") return T("当前文件夹：最旧的图在最前。再点切换排序。每个文件夹单独记住。");
        if (id === "rating") return T("当前文件夹：爱心多的在最前。再点切换排序。每个文件夹单独记住。");
        if (id === "rating_asc") return T("当前文件夹：爱心少的在最前。再点切换排序。每个文件夹单独记住。");
        return T("当前文件夹：最新的图在最前。再点切换排序。每个文件夹单独记住。");
    }
    function applySortChrome() {
        var btn = document.getElementById("btn-sort");
        if (!btn) return;
        var id = listSort();
        btn.classList.toggle("is-on", id !== "newest");
        btn.setAttribute("aria-pressed", id !== "newest" ? "true" : "false");
        btn.textContent = sortLabel(id);
        btn.title = sortHint(id);
        btn.setAttribute("aria-label", btn.title);
        var rateSort = document.getElementById("filter-rate-sort");
        if (rateSort) rateSort.classList.toggle("is-on", id === "rating");
    }
    function setHeartRate(n) {
        if (n === "none" || n === "-1") n = -1;
        else {
            n = parseInt(n, 10);
            if (n !== -1 && !(n >= 1 && n <= 5)) n = 0;
        }
        if (n && n === state.heartRate) n = 0;
        if (n === state.heartRate) {
            syncHeartRateUi();
            return;
        }
        state.heartRate = n;
        try {
            if (n === -1) localStorage.setItem(LS_HEART, "none");
            else if (n) localStorage.setItem(LS_HEART, String(n));
            else localStorage.removeItem(LS_HEART);
        } catch (eHs) {}
        syncFilterUi();
        state.page = 1;
        state.sel = null;
        closeLightbox();
        _flowEnd = false;
        _stampKey = "";
        loadList();
    }
    function setListSort(next) {
        if (SORT_CYCLE.indexOf(next) < 0) next = "newest";
        if (listSort() === next) {
            applySortChrome();
            return;
        }
        var map = readSortMap();
        var k = sortFolderKey();
        if (next === "newest") delete map[k];
        else map[k] = next;
        try { localStorage.setItem(LS_SORT, JSON.stringify(map)); } catch (eS1) {}
        applySortChrome();
        state.page = 1;
        _flowEnd = false;
        _stampKey = "";
        loadList();
        toast(T("本文件夹：") + sortLabel(next), 1400);
    }
    function cycleListSort() {
        var i = SORT_CYCLE.indexOf(listSort());
        if (i < 0) i = 0;
        setListSort(SORT_CYCLE[(i + 1) % SORT_CYCLE.length]);
    }

    var CMP_MAX = 8;
    var CMP_MODES = [
        { id: "slider", zh: "滑动" },
        { id: "overlay", zh: "叠图" },
        { id: "side", zh: "并排" },
        { id: "blink", zh: "闪切" },
        { id: "diff", zh: "差值" },
        { id: "grid", zh: "宫格" }
    ];

    if (typeof window.clampPopup !== "function") {
        window.clampPopup = function (el) {
            try {
                var w = el.offsetWidth || 400, h = el.offsetHeight || 300;
                var m = 10;
                var L = parseInt(el.style.left, 10) || 0, Tpos = parseInt(el.style.top, 10) || 0;
                var maxL = window.innerWidth - w - m, maxT = window.innerHeight - h - m;
                if (L < m) L = m;
                if (Tpos < m) Tpos = m;
                if (L > maxL) L = Math.max(m, maxL);
                if (Tpos > maxT) Tpos = Math.max(m, maxT);
                el.style.left = L + "px";
                el.style.top = Tpos + "px";
            } catch (e0) {}
        };
    }
    function T(zh) { return (typeof animaTxt === "function") ? animaTxt(zh) : zh; }
    function el(tag, css, text) {
        var n = document.createElement(tag);
        if (css) n.style.cssText = css;
        if (text != null) n.textContent = text;
        return n;
    }

    var state = {
        subfolder: "", page: 1, pages: 1, total: 0, pageSize: readPageSize(), items: [], folders: [], parent: null,
        sel: null, extract: null, lbNative: false, browse: readBrowse(),
        compareOn: false, compareItems: [], compareMode: "slider",
        cmpA: 0, cmpB: 1, overlayPct: 50, blinkMs: 400, wipePct: 50,
        cmpSide: { s: 1, x: 0, y: 0 },
        view: "artist", artistKey: "", artistExact: false, comboName: "", artistIndex: null, artistIndexSub: null, artistIndexBusy: false,
        soloArtist: readSoloArtist(),
        castOn: true, seriesKey: "", characterKey: "", castQ: "",
        castIndex: null, castIndexSub: null, castIndexBusy: false,
        tagOn: true, tagKey: readTagKey(), tagCn: readTagCn(), tagQ: "",
        modelKey: readModelKey(), modelIndex: null, modelIndexSub: null, modelIndexBusy: false,
        tagIndex: null, tagIndexSub: null, tagIndexBusy: false, tagFuzzy: [],
        listDeep: readListDeep(),
        heartRate: readHeartRate()
    };
    var _tagColorCache = {};
    var _tlCache = {};
    var _tlMissing = {};
    var _favArtCache = [];
    var _railThumbSrc = {};
    var _railRaf = 0;
    var _favCharCache = [];
    var _adexArtCache = {};
    var _adexArtRun = 0;
    var _adexArtWait = [];
    var _adexArtPend = {};
    var _castTl = {};
    var _castIdxGen = 0;
    var _castCnBusy = false;
    var _castCnQueued = null;
    var _castTlTried = {};
    var _tagIdxGen = 0;
    var _tagFuzzyT = 0;
    var _tagFuzzyGen = 0;
    var _tagAppliedQ = null;
    var _renderGen = 0;
    var _artistRowGen = 0;
    var _artistIdxGen = 0;
    var _listGen = 0;
    var _listBusy = false;
    var _folderSnaps = Object.create(null);
    var _stampKey = "";
    var _recycleBusy = false;
    var _stampBusy = false;
    var _stampTimer = 0;
    var _refreshPending = false;
    var STAMP_MS = 8000;
    var _blinkTimer = null;
    var _wipeDrag = false;
    var _cmpExtractMemo = {};
    var CMP_PARAM_KEYS = ["尺寸", "种子", "步数", "CFG", "采样器", "模型", "调度器", "降噪"];
    var _peekT = null;
    var _peekGen = 0;
    var _peekAnchor = null;
    var _ctxItem = null;
    var _pickItem = null;
    var _pickBusy = false;
    var _pickSrc = "all";
    var _pickList = [];
    var _pickGen = 0;
    var _pickUnused = readPickUnused();
    var _pickDeep = readPickDeep();
    var _pickMode = "";
    var _pickSelected = [];
    var PICK_CHAIN_MAX = 8;
    var PICK_SOLO_MAX = 100;
    var _usedGen = 0;
    var _usedArt = { key: "", ready: false, loading: false, error: "", all: {}, solo: {} };
    var _usedArtPending = { all: {}, solo: {} };
    var _flowEnd = false;
    var _flowBusy = false;
    var _flowHoldLayout = false;
    var _foldersOpen = false;
    var _fxOn = readFxOn();
    var ICON_PAGE = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.2" y="3.2" width="7.4" height="7.4" rx="1.4" stroke="currentColor" stroke-width="1.8"/><rect x="13.4" y="3.2" width="7.4" height="7.4" rx="1.4" stroke="currentColor" stroke-width="1.8"/><rect x="3.2" y="13.4" width="7.4" height="7.4" rx="1.4" stroke="currentColor" stroke-width="1.8"/><rect x="13.4" y="13.4" width="7.4" height="7.4" rx="1.4" stroke="currentColor" stroke-width="1.8"/></svg>';
    var ICON_FLOW = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.2" y="3.2" width="8.2" height="11.2" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="12.6" y="3.2" width="8.2" height="6.4" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="12.6" y="11.2" width="8.2" height="9.6" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="3.2" y="16" width="8.2" height="4.8" rx="1.5" stroke="currentColor" stroke-width="1.8"/></svg>';
    var ICON_FX = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.2l1.35 6.1L20.8 12l-7.45 2.7L12 20.8l-1.35-6.1L3.2 12l7.45-2.7L12 3.2z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    var ICON_ZOOM = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.7" stroke="currentColor" stroke-width="1.9"/><path d="M15.2 15.2L20 20" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
    var ICON_REFRESH = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.7 12A7.3 7.3 0 0 1 16.8 6.6L19 4.8V10H13.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.3 12A7.3 7.3 0 0 1 7.2 17.4L5 19.2V14H10.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';


    function clampFlowTile(n) {
        n = parseInt(n, 10);
        if (!(n > 0)) n = FLOW_TILE_DEF;
        n = Math.round(n / FLOW_TILE_STEP) * FLOW_TILE_STEP;
        if (n < FLOW_TILE_MIN) n = FLOW_TILE_MIN;
        if (n > FLOW_TILE_MAX) n = FLOW_TILE_MAX;
        return n;
    }
    function readFlowTile() {
        try { return clampFlowTile(localStorage.getItem(LS_FLOW_TILE) || FLOW_TILE_DEF); }
        catch (eFt) { return FLOW_TILE_DEF; }
    }
    var _flowTile = readFlowTile();
    function flowTileMin() { return _flowTile; }
    function applyFlowTileChrome() {
        var n = _flowTile;
        var scale = n / FLOW_TILE_DEF;
        try {
            document.documentElement.style.setProperty("--flow-col", n + "px");
            document.documentElement.style.setProperty("--tile-scale", String(scale));
        } catch (eFt2) {}
        var grid = document.getElementById("grid");
        if (grid) grid.style.setProperty("--flow-col", n + "px");
        var inp = document.getElementById("flow-size");
        if (inp && String(inp.value) !== String(n)) inp.value = String(n);
        var val = document.getElementById("flow-size-val");
        if (val) val.textContent = Math.round(scale * 100) + "%";
        var lab = document.getElementById("flow-size-lab");
        if (lab) lab.textContent = T("图大小");
        var wrap = document.getElementById("flow-size-wrap");
        if (wrap) {
            wrap.title = T("调整图片显示大小。越大每行越少，本机记住。");
            wrap.setAttribute("aria-label", wrap.title);
        }
    }
    function setFlowTile(next) {
        next = clampFlowTile(next);
        var same = _flowTile === next;
        _flowTile = next;
        try { localStorage.setItem(LS_FLOW_TILE, String(next)); } catch (eFt3) {}
        applyFlowTileChrome();
        if (!same) scheduleRelayoutFlow();
    }

    function isFlow() { return state.browse === "flow"; }
    function fxCheap() { return !_fxOn; }
    function applyFxClass() {
        var cheap = fxCheap();
        try {
            document.documentElement.classList.toggle("opv-fx-cheap", cheap);
            document.documentElement.classList.toggle("opv-fx-full", !cheap);
            document.documentElement.classList.toggle("anima-cheap-fx", cheap);
        } catch (e) {}
        var btn = document.getElementById("btn-fx");
        if (!btn) return;
        btn.classList.toggle("is-on", _fxOn);
        btn.innerHTML = ICON_FX;
        btn.title = _fxOn ? (T("动效：开") + " — " + T("点击关闭动效")) : (T("动效：关") + " — " + T("点击开启动效"));
        btn.setAttribute("aria-label", btn.title);
        btn.setAttribute("aria-pressed", _fxOn ? "true" : "false");
    }
    function toggleFx() {
        _fxOn = !_fxOn;
        try { localStorage.setItem(LS_FX, _fxOn ? "on" : "off"); } catch (e) {}
        applyFxClass();
        toast(_fxOn ? T("动效：开") : T("动效：关"), 1400);
    }
    function applyBrowseChrome() {
        var flow = isFlow();
        document.body.classList.toggle("opv-flow", flow);
        var grid = document.getElementById("grid");
        if (grid) grid.classList.toggle("is-flow", flow);
        var btn = document.getElementById("btn-browse");
        if (btn) {
            btn.classList.toggle("is-flow", flow);
            btn.setAttribute("aria-pressed", flow ? "true" : "false");
            btn.innerHTML = flow ? ICON_FLOW : ICON_PAGE;
            btn.title = flow
                ? (T("当前：瀑布流浏览") + " — " + T("点击切换到分页"))
                : (T("当前：分页浏览") + " — " + T("点击切换到瀑布流"));
            btn.setAttribute("aria-label", btn.title);
        }
        var more = document.getElementById("flow-more");
        if (more) {
            more.hidden = !flow;
            if (!flow) more.textContent = "";
        }
        applyDeepChrome();
        applySortChrome();
        applyFlowTileChrome();
    }
    function applyDeepChrome() {
        var btn = document.getElementById("btn-deep");
        if (!btn) return;
        var on = listDeepOn();
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.textContent = on ? T("含子文件夹") : T("不含子文件夹");
        btn.title = on ? T("当前显示本文件夹及子文件夹里的图") : T("当前只显示本文件夹里的图，不含子文件夹");
        btn.setAttribute("aria-label", btn.title);
    }
    function setListDeep(on) {
        var next = !!on;
        if (listDeepOn() === next) {
            applyDeepChrome();
            return;
        }
        state.listDeep = next;
        try { localStorage.setItem(LS_LIST_DEEP, next ? "1" : "0"); } catch (eLd2) {}
        state.page = 1;
        state.sel = null;
        state.artistIndex = null;
        state.artistIndexSub = null;
        state.castIndex = null;
        state.castIndexSub = null;
        state.tagIndex = null;
        state.tagIndexSub = null;
        state.modelIndex = null;
        state.modelIndexSub = null;
        closeLightbox();
        _stampKey = "";
        _refreshPending = false;
        markRefreshPending(false);
        applyDeepChrome();
        if (state.view === "artist") loadArtistIndex();
        if (castFilterOn()) loadCastIndex();
        if (tagFilterOn()) loadTagIndex();
        loadModelIndex();
        loadList();
        toast(next ? T("含子文件夹模式") : T("不含子文件夹模式"), 1400);
    }
    function setBrowse(mode) {
        var next = mode === "flow" ? "flow" : "page";
        if (state.browse === next) {
            applyBrowseChrome();
            return;
        }
        state.browse = next;
        try { localStorage.setItem(LS_BROWSE, next); } catch (e) {}
        _flowEnd = false;
        _flowBusy = false;
        state.page = 1;
        state.sel = null;
        closeLightbox();
        applyBrowseChrome();
        loadList();
        toast(next === "flow" ? T("当前：瀑布流浏览") : T("当前：分页浏览"), 1400);
    }
    function calcFlowColW() {
        var box = document.getElementById("grid");
        var w = (box && box.clientWidth) || 600;
        var min = flowTileMin();
        var gap = 6;
        var cols = Math.max(1, Math.floor((w + gap) / (min + gap)));
        return (w - gap * (cols - 1)) / cols;
    }
    function flowSpans(h) {
        if (!(h > 0)) return 186;
        return Math.max(1, Math.round(h) + 6);
    }
    function layoutFlowTile(tile, img) {
        if (!tile || !isFlow()) return;
        var colW = calcFlowColW();
        var h = 0;
        if (img) {
            if (img.clientHeight > 0) h = img.clientHeight;
            else if (img.naturalWidth && img.naturalHeight) h = colW * (img.naturalHeight / img.naturalWidth);
        }
        tile.style.gridRowEnd = "span " + flowSpans(h);
    }
    function setFlowMore(text) {
        var more = document.getElementById("flow-more");
        if (!more) return;
        more.hidden = !isFlow();
        more.textContent = text || "";
    }
    function recycleFlow() {
        if (!isFlow()) return;
        if (window.__animaGalleryPtrDown) { _flowHoldLayout = true; return; }
        var box = document.getElementById("grid");
        if (!box) return;
        var keep = fxCheap() ? 220 : 420;
        var extra = box.children.length - keep;
        if (extra <= 0) return;
        var gal = document.getElementById("gallery");
        var gridTop = gal ? gal.getBoundingClientRect().top : 0;
        var anchor = null, anchorOff = 0;
        var kids = box.children;
        for (var i = 0; i < kids.length; i++) {
            var r = kids[i].getBoundingClientRect();
            if (r.bottom - gridTop > 0) {
                anchor = kids[i];
                anchorOff = r.top - gridTop;
                break;
            }
        }
        var removed = 0;
        while (removed < extra) {
            var el0 = box.firstElementChild;
            if (!el0 || el0 === anchor) break;
            var key = el0.getAttribute("data-key") || "";
            if (state.sel && itemKey(state.sel) === key) break;
            box.removeChild(el0);
            if (state.items.length && itemKey(state.items[0]) === key) state.items.shift();
            removed++;
        }
        if (removed && anchor && anchor.isConnected && gal) {
            var nowTop = anchor.getBoundingClientRect().top - gal.getBoundingClientRect().top;
            gal.scrollTop += (nowTop - anchorOff);
        }
    }
    function maybeLoadMore() {
        if (_refreshPending && galleryNearTop()) {
            applyPendingRefresh();
            return;
        }
        if (!isFlow() || _flowBusy || _flowEnd) return;
        if (window.__animaGalleryPtrDown) { _flowHoldLayout = true; return; }
        var gal = document.getElementById("gallery");
        var box = document.getElementById("grid");
        if (!gal || !box) return;
        var total = box.querySelectorAll(".tile").length;
        if (!total) return;
        if (gal.scrollHeight <= gal.clientHeight + 120) {
            loadList({ append: true });
            return;
        }
        var sh = gal.scrollHeight || 1;
        var ratio = Math.min(1, (gal.scrollTop + gal.clientHeight) / sh);
        var viewed = Math.floor(total * ratio);
        if (total - viewed < 28) loadList({ append: true });
    }

    try { fetch("/danbooru_anima/tag_colors").then(function (r) { return r.json(); }).then(function (d) { _tagColorCache = d || {}; }).catch(function () {}); } catch (e) {}

    function loadArtistFavs() {
        return fetch("/danbooru_anima/favorites?cats=artists").then(function (r) {
            if (!r.ok) throw new Error("favs " + r.status);
            return r.json();
        }).then(function (d) {
            var arts = (d.favorites && d.favorites.artists) || {};
            var list = [];
            for (var k in arts) {
                if (k === "_order") continue;
                list.push({ tag: k, thumb: (arts[k] && arts[k].thumb) || "", cn: (arts[k] && arts[k].cn) || "", starred: !!(arts[k] && (arts[k].starred || arts[k].star)), rating: (window.animaFavGrid && window.animaFavGrid.clampRating) ? window.animaFavGrid.clampRating(arts[k] && arts[k].rating) : (parseInt((arts[k] && arts[k].rating), 10) || 0) });
            }
            _favArtCache = list;
            return list;
        }).then(function (list) {
            var g = window.animaFavGrid;
            if (g && typeof g.loadThumbMap === "function") return g.loadThumbMap().then(function () { return list; });
            return list;
        }).then(function (list) {
            if (state.view === "artist") renderArtistRail();
            return list;
        }).catch(function () { return _favArtCache || []; });
    }
    loadArtistFavs().then(function () { refreshPinMarks(); });
    if (window.animaFavGrid && typeof window.animaFavGrid.onChange === "function") {
        window.animaFavGrid.onChange(function () {
            loadArtistFavs().then(function () { refreshPinMarks(); });
        });
    }

    function loadCastFavs() {
        return fetch("/danbooru_anima/favorites?cats=characters").then(function (r) { return r.json(); }).then(function (d) {
            var chars = (d.favorites && d.favorites.characters) || {};
            var list = [];
            for (var k in chars) {
                if (k === "_order") continue;
                var rec = chars[k] || {};
                var key = facetNormKey(k);
                if (!key) continue;
                if (rec.cn) {
                    _castTl[key] = rec.cn;
                    _castTl[k] = rec.cn;
                }
                list.push({
                    tag: k,
                    key: key,
                    thumb: rec.thumb || "",
                    cn: rec.cn || "",
                    starred: !!(rec.starred || rec.star)
                });
            }
            _favCharCache = list;
            return list;
        }).catch(function () { return _favCharCache || []; });
    }

    function isAdexThumb(u) {
        u = String(u || "");
        return u.indexOf("/danbooru_anima/animadex_image") >= 0
            || /animadex|mooshieblob/i.test(u);
    }
    function adexSrc(u) {
        if (!u) return "";
        if (String(u).indexOf("/danbooru_anima/animadex_image") >= 0) return u;
        return "/danbooru_anima/animadex_image?url=" + encodeURIComponent(u);
    }
    function favThumbSource(u) {
        return /gelbooru\.com/i.test(u || "") ? "gelbooru" : "danbooru";
    }
    function artistThumbKeys(tag) {
        var p = window.animaParseWeightTag ? window.animaParseWeightTag(tag) : { tag: String(tag || "") };
        var inner = String(p.tag || tag || "").trim();
        var bare = inner.replace(/^@+/, "").replace(/^artist:/i, "").trim();
        var keys = [];
        function add(x) {
            x = String(x || "").trim();
            if (!x) return;
            if (keys.indexOf(x) < 0) keys.push(x);
            var us = x.replace(/\s+/g, "_");
            var sp = x.replace(/_/g, " ");
            if (keys.indexOf(us) < 0) keys.push(us);
            if (keys.indexOf(sp) < 0) keys.push(sp);
        }
        add(tag);
        add(inner);
        add(bare);
        if (bare) {
            add("@" + bare);
            add("artist:" + bare);
        }
        return keys;
    }
    function localFavThumb(tag) {
        var g = window.animaFavGrid;
        if (!g || !g.localThumb || !tag) return "";
        var keys = artistThumbKeys(tag);
        for (var i = 0; i < keys.length; i++) {
            var u = g.localThumb("danbooru", keys[i]) || g.localThumb("gelbooru", keys[i]);
            if (u) return u;
        }
        return "";
    }
    function liveModeOn() {
        var g = window.animaFavGrid;
        if (g && typeof g.live === "function") return !!g.live();
        try { return localStorage.getItem("apc_fav_live") === "1"; } catch (e) { return false; }
    }
    function liveFavThumb(tag) {
        var g = window.animaFavGrid;
        if (!g || typeof g.liveThumb !== "function" || !tag) return "";
        var keys = artistThumbKeys(tag);
        for (var i = 0; i < keys.length; i++) {
            var u = g.liveThumb(keys[i]);
            if (u) return u;
        }
        return "";
    }
    function setLiveMode(on) {
        var g = window.animaFavGrid;
        if (g && typeof g.setLive === "function") return g.setLive(on);
        try { localStorage.setItem("apc_fav_live", on ? "1" : "0"); } catch (e) {}
        applyLiveModeUi();
        return !!on;
    }
    function applyLiveModeUi() {
        var btn = document.getElementById("btn-live");
        var sw = document.getElementById("filter-live-sw");
        var on = liveModeOn();
        if (btn) {
            btn.classList.toggle("is-on", on);
            btn.title = T("AI模式：用该画师的单画师生成图当缩略图。没指定时自动匹配。");
        }
        if (sw) sw.textContent = on ? T("开") : T("关");
        if (state.view === "artist") patchRailThumbs();
    }
    function favImgUrl(u, tag) {
        if (liveModeOn()) return liveFavThumb(tag) || "";
        if (isAdexThumb(u)) return adexSrc(u);
        var loc = localFavThumb(tag);
        if (loc) return loc;
        var g = window.animaFavGrid;
        var source = favThumbSource(u);
        if (g && typeof g.favSrc === "function") return g.favSrc(u, source, tag);
        if (u && u.indexOf("http") === 0) {
            if (g && typeof g.proxySrc === "function") return g.proxySrc(u, source, "tiny");
            return "/danbooru_anima/image_proxy?url=" + encodeURIComponent(u);
        }
        return u || "";
    }
    function bindFavThumb(img, raw, tag, source) {
        if (!img) return false;
        if (liveModeOn()) {
            var lv = liveFavThumb(tag);
            if (lv) {
                img.hidden = false;
                img.style.display = "block";
                img.onerror = function () { img.hidden = true; };
                if ((img.getAttribute("src") || "") !== lv) img.src = lv;
                return true;
            }
            var gq = window.animaFavGrid;
            if (gq && typeof gq.queueLiveAutofill === "function") gq.queueLiveAutofill(tag);
        }
        source = source || favThumbSource(raw);
        var loc = localFavThumb(tag);
        if (loc) {
            img.hidden = false;
            img.style.display = "block";
            img.onerror = function () { img.hidden = true; };
            if ((img.getAttribute("src") || "") !== loc) img.src = loc;
            return true;
        }
        if (isAdexThumb(raw)) {
            var adex = adexSrc(raw);
            if (!adex) { img.hidden = true; return false; }
            img.hidden = false;
            img.src = adex;
            img.onerror = function () { img.hidden = true; };
            return true;
        }
        var g = window.animaFavGrid;
        if (g && typeof g.bindImg === "function" && (raw || tag)) {
            img.hidden = false;
            img.onerror = null;
            g.bindImg(img, raw || "", source, { tag: tag, objectFit: "contain", width: "100%", height: "auto" });
            return !!raw;
        }
        var url = favImgUrl(raw, tag);
        if (!url) { img.hidden = true; return false; }
        img.hidden = false;
        img.src = url;
        img.onerror = function () { img.hidden = true; };
        return true;
    }

    function loadAdexArtist(artistName) {
        var key = String(artistName || "").toLowerCase();
        if (!key) return Promise.resolve({ thumb: "", slug: "" });
        if (key in _adexArtCache) return Promise.resolve(_adexArtCache[key]);
        if (_adexArtPend[key]) return _adexArtPend[key];
        var p = new Promise(function (resolve) {
            function finish(rec) {
                _adexArtCache[key] = rec || { thumb: "", slug: "" };
                resolve(_adexArtCache[key]);
            }
            function run() {
                _adexArtRun++;
                fetch("/danbooru_anima/animadex_search", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mode: "artists", query: artistName, limit: 20 })
                }).then(function (r) { return r.json(); }).then(function (d) {
                    var items = (d && d.results) || [];
                    var hit = null;
                    var qFull = String(artistName || "").replace(/_/g, " ").toLowerCase();
                    var qMain = qFull.replace(/\(.*?\)/g, "").trim();
                    for (var i = 0; i < items.length; i++) {
                        var slug = String(items[i].slug || "").toLowerCase();
                        var nm = String(items[i].name || "").toLowerCase();
                        var slugMain = slug.replace(/\(.*?\)/g, "").replace(/_/g, " ").trim();
                        var nmMain = nm.replace(/\(.*?\)/g, "").trim();
                        if (slug === qFull || slug === String(artistName).toLowerCase()
                            || nm === qFull || nm === qMain
                            || slugMain === qMain || nmMain === qMain) { hit = items[i]; break; }
                    }
                    finish({
                        thumb: (hit && hit.thumb_url) || "",
                        slug: (hit && (hit.slug || hit.name)) || ""
                    });
                }).catch(function () {
                    finish({ thumb: "", slug: "" });
                }).then(function () {
                    _adexArtRun--;
                    var nxt = _adexArtWait.shift();
                    if (nxt) nxt();
                });
            }
            if (_adexArtRun >= 2) _adexArtWait.push(run);
            else run();
        });
        _adexArtPend[key] = p;
        p.then(function () { delete _adexArtPend[key]; }, function () { delete _adexArtPend[key]; });
        return p;
    }

    function danbooruArtistTag(tag, slug) {
        if (typeof window.animaToDanbooruArtistTag === "function") return window.animaToDanbooruArtistTag(tag, slug);
        return String(tag || "").replace(/^@+/, "").replace(/^artist:/i, "").trim().replace(/\s+/g, "_").toLowerCase();
    }

    function openDanbooruArtist(tag, info) {
        var q = danbooruArtistTag(tag, info && info.slug);
        if (!q) { toast(T("没有可复制的内容")); return; }
        window.open("https://danbooru.donmai.us/posts?tags=" + encodeURIComponent(q), "_blank", "noopener,noreferrer");
    }

    function openGelbooruArtist(tag, info) {
        var q = danbooruArtistTag(tag, info && info.slug);
        if (!q) { toast(T("没有可复制的内容")); return; }
        window.open("https://gelbooru.com/index.php?page=post&s=list&tags=" + encodeURIComponent(q), "_blank", "noopener,noreferrer");
    }

    function artistPeekUrl(card, tag, key) {
        var img = card && card.querySelector(".pic img");
        var src = "";
        if (img && !img.hidden) src = img.currentSrc || img.getAttribute("src") || "";
        if (src) return src;
        if (liveModeOn()) return liveFavThumb(tag) || "";
        return localFavThumb(tag) || (key && _railThumbSrc[key]) || "";
    }

    function peekArtistCard(card, tag, key) {
        var url = artistPeekUrl(card, tag, key);
        if (!url) { toast(T("无缩略图"), 1200); return; }
        showPeek({ url: url, filename: artistDisplayName(tag) }, card, { allowWhileBusy: true });
    }

    function openArtistSearchMenu(tag, x, y) {
        var q = danbooruArtistTag(tag);
        if (!q) { toast(T("没有可复制的内容")); return; }
        hidePeek();
        _ctxItem = { tag: tag, filename: q };
        var m = document.getElementById("ctx-menu");
        if (!m) return;
        m.innerHTML = "";
        m.appendChild(ctxBtn(T("去D站"), function () { openDanbooruArtist(tag); }));
        m.appendChild(ctxBtn(T("去G站"), function () { openGelbooruArtist(tag); }));
        m.appendChild(ctxSep());
        m.appendChild(ctxBtn(T("复制画师标签"), function () { copyText(q); }));
        placeCtxMenu(x, y);
    }

    function openTagSearchMenu(tag, x, y) {
        var q = danbooruArtistTag(tag);
        if (!q) { toast(T("没有可复制的内容")); return; }
        hidePeek();
        _ctxItem = { tag: tag, filename: q };
        var m = document.getElementById("ctx-menu");
        if (!m) return;
        m.innerHTML = "";
        m.appendChild(ctxBtn(T("去D站搜"), function () { openDanbooruArtist(tag); }));
        m.appendChild(ctxBtn(T("去G站搜"), function () { openGelbooruArtist(tag); }));
        placeCtxMenu(x, y);
    }

    function resolveArtistForFlyout(tag) {
        var p = window.animaParseWeightTag ? window.animaParseWeightTag(tag) : { tag: String(tag || "") };
        var inner = p.tag || String(tag || "");
        var an = window.animaArtistNorm ? window.animaArtistNorm(inner) : inner.replace(/^@+/, "").replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/_/g, " ").trim().toLowerCase();
        if (!an) return Promise.resolve({});
        var q = inner.replace(/^@+/, "").replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/_/g, " ").trim();
        function pack(found, hit) {
            hit = hit || {};
            var f = found ? {
                tag: found.tag,
                thumb: found.thumb || hit.thumb || "",
                cn: found.cn || _tlCache[inner] || _tlCache[tag] || "",
                starred: !!found.starred,
                rating: artistRateNum(found.rating),
                inFav: true
            } : {
                tag: inner,
                thumb: hit.thumb || "",
                cn: _tlCache[inner] || _tlCache[tag] || "",
                starred: false,
                rating: 0,
                inFav: false
            };
            if (found && found.thumb) {
                return { thumbUrl: found.thumb, useAdexProxy: false, found: f, slug: danbooruArtistTag(found.tag || tag) };
            }
            if (hit.thumb) {
                return { thumbUrl: hit.thumb, useAdexProxy: true, found: f, slug: hit.slug || danbooruArtistTag(f.tag || tag) };
            }
            return { found: f, slug: danbooruArtistTag(f.tag || tag) };
        }
        return loadArtistFavs().then(function (list) {
            var found = null;
            for (var i = 0; i < list.length; i++) {
                var key = window.animaArtistNorm ? window.animaArtistNorm(list[i].tag) : String(list[i].tag || "").toLowerCase();
                if (key === an) { found = list[i]; break; }
            }
            if (liveModeOn()) {
                var packedLive = pack(found);
                packedLive.thumbUrl = liveFavThumb((found && found.tag) || inner) || liveFavThumb(q) || liveFavThumb(tag) || "";
                packedLive.useAdexProxy = false;
                return packedLive;
            }
            if (found && found.thumb) return pack(found);
            var loc = localFavThumb((found && found.tag) || inner) || localFavThumb(q || an) || localFavThumb(tag);
            if (loc) {
                var packed = pack(found);
                packed.thumbUrl = loc;
                packed.useAdexProxy = false;
                return packed;
            }
            return loadAdexArtist(q || an).then(function (hit) { return pack(found, hit); });
        });
    }

    function favStoredTag(tag) {
        var an = window.animaArtistNorm ? window.animaArtistNorm(tag) : String(tag || "").toLowerCase();
        var list = _favArtCache || [];
        for (var i = 0; i < list.length; i++) {
            var key = window.animaArtistNorm ? window.animaArtistNorm(list[i].tag) : String(list[i].tag || "").toLowerCase();
            if (key === an) return list[i].tag;
        }
        return "";
    }

    function favEntry(tag) {
        var stored = favStoredTag(tag);
        if (!stored) return null;
        var list = _favArtCache || [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].tag === stored) return list[i];
        }
        return null;
    }

    function artistIsPinned(tag) {
        var e = favEntry(tag);
        return !!(e && e.starred);
    }

    function applyPinMark(node, tag) {
        if (!node || !tag) return;
        node.setAttribute("data-artist-tag", tag);
        var on = artistIsPinned(tag);
        node.classList.toggle("is-pinned", on);
        var btn = node.classList.contains("opv-pin-btn") ? node : node.querySelector(".opv-pin-btn");
        if (btn) {
            btn.textContent = on ? "★" : "☆";
            btn.classList.toggle("is-on", on);
            btn.title = on ? T("★ 已置顶") : T("⭐ 收藏置顶");
            return;
        }
        var m = node.querySelector(".opv-pin-mark");
        if (!m) {
            m = el("span", "", on ? "★" : "☆");
            m.className = "opv-pin-mark";
            node.appendChild(m);
        } else {
            m.textContent = on ? "★" : "☆";
        }
        m.title = on ? T("★ 已置顶") : T("未置顶");
        var copy = T("点击标签复制");
        node.title = copy + " · " + (on ? T("★ 已置顶") : T("未置顶"));
    }

    function refreshPinMarks() {
        var nodes = document.querySelectorAll("[data-artist-tag]");
        for (var i = 0; i < nodes.length; i++) {
            applyPinMark(nodes[i], nodes[i].getAttribute("data-artist-tag"));
        }
        var bPin = document.querySelector("#actions .act-pin");
        if (!bPin) return;
        var arts = uniqArtists((state.extract && state.extract.artists) || []);
        var allOn = arts.length > 0;
        for (var j = 0; j < arts.length; j++) {
            if (!artistIsPinned(arts[j])) { allOn = false; break; }
        }
        bPin.textContent = allOn ? T("★ 已置顶") : T("⭐ 收藏置顶");
        bPin.classList.toggle("is-on", allOn);
        bPin.title = T("收藏画师标签");
    }


    function artistRateNum(v) {
        if (window.animaFavGrid && typeof window.animaFavGrid.clampRating === "function") return window.animaFavGrid.clampRating(v);
        var n = parseInt(v, 10);
        if (!isFinite(n) || n < 0) n = 0;
        if (n > 5) n = 5;
        return n;
    }
    function setArtistRating(tag, n, opts) {
        opts = opts || {};
        var e = favEntry(tag);
        var name = (e && e.tag) || tag;
        n = artistRateNum(n);
        var key = artistNormKey(name);
        (_favArtCache || []).forEach(function (f) {
            if (!f) return;
            if (artistNormKey(f.tag) === key || f.tag === name) f.rating = n;
        });
        if (!opts.keepRail && state.view === "artist") renderArtistRail();
        var go = (window.animaFavGrid && typeof window.animaFavGrid.rateFavorite === "function")
            ? window.animaFavGrid.rateFavorite("danbooru", name, "artists", n)
            : fetch("/danbooru_anima/favorites/rate", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tag: name, category: "artists", rating: n })
            }).then(function (r) { return r.json(); });
        return go.then(function (d) {
            if (!d || !d.success) { toast(T("评分失败")); return loadArtistFavs().then(function () { refreshPinMarks(); return false; }); }
            return loadArtistFavs().then(function () {
                refreshPinMarks();
                if (!opts.keepRail && state.view === "artist") renderArtistRail();
                return true;
            });
        }).catch(function () { toast(T("评分失败")); return false; });
    }

    function pinArtistFavorite(found, btn, silent, forceOn) {
        var tag = String((found && found.tag) || "").trim();
        if (!tag) {
            if (btn) { btn.textContent = T("收藏失败"); btn.style.color = "#e94560"; }
            if (!silent) toast(T("收藏失败"));
            return Promise.resolve(false);
        }
        var thumb = (found && found.thumb) || "";
        var cn = (found && found.cn) || _tlCache[tag] || "";
        function setBtn(on) {
            if (!btn) return;
            btn.textContent = on ? T("★ 已置顶") : T("⭐ 收藏置顶");
            btn.className = "anima-flyout-pin" + (on ? " is-on" : "");
            btn.style.color = "";
        }
        function fail() {
            if (btn) { btn.textContent = T("收藏失败"); btn.style.color = "#e94560"; }
            if (!silent) toast(T("收藏失败"));
            return false;
        }
        function star(name) {
            return fetch("/danbooru_anima/favorites/star", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tag: name, category: "artists" })
            }).then(function (r) { return r.json(); });
        }
        function add() {
            return fetch("/danbooru_anima/favorites/add", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tag: tag, category: "artists", thumb_url: thumb, cn: cn })
            }).then(function (r) { return r.json(); });
        }
        function finish(d) {
            if (!d || !d.success) return fail();
            var on = d.starred !== false;
            setBtn(on);
            if (!silent) toast(on ? T("★ 已置顶") : T("⭐ 收藏置顶"));
            if (window.animaFavGrid && window.animaFavGrid.emitChange) window.animaFavGrid.emitChange();
            return loadArtistFavs().then(function () {
                refreshPinMarks();
                if (state.view === "artist") renderArtistRail();
                return true;
            });
        }
        return loadArtistFavs().then(function () {
            var existing = favEntry(tag);
            if (forceOn && existing && existing.starred) {
                setBtn(true);
                refreshPinMarks();
                return true;
            }
            if (existing) return star(existing.tag).then(finish);
            return add().then(function (a) {
                if (!a || !a.success) return fail();
                return star(tag).then(finish);
            });
        }).catch(function () { return fail(); });
    }

    function pinArtistTags(tags, btn) {
        var list = uniqArtists(tags || []);
        if (!list.length) { toast(T("这张图没有画师")); return Promise.resolve(false); }
        var okAny = false;
        var chain = Promise.resolve();
        list.forEach(function (tag) {
            chain = chain.then(function () {
                return resolveArtistForFlyout(tag).then(function (info) {
                    return pinArtistFavorite((info && info.found) || { tag: tag }, btn, true, true).then(function (ok) {
                        if (ok) okAny = true;
                    });
                });
            });
        });
        return chain.then(function () {
            toast(okAny ? T("★ 已置顶") : T("收藏失败"));
            return okAny;
        });
    }

    function bindArtistFlyout(node, tag) {
        if (!node || typeof window.animaBindChipFlyout !== "function") return;
        window.animaBindChipFlyout(node, {
            resolveArtist: function () { return resolveArtistForFlyout(tag); },
            favImgUrl: favImgUrl,
            tag: tag,
            cat: "artists",
            noRate: true,
            openMs: 850,
            onDanbooru: function (info) { openDanbooruArtist(tag, info); },
            onGelbooru: function (info) { openGelbooruArtist(tag, info); },
            onPin: function (found, b) { return pinArtistFavorite(found, b); }
        });
    }

    function mountArtThumbPin(wrap, tag) {
        if (!wrap || !tag) return;
        var btn = el("button", "", artistIsPinned(tag) ? "★" : "☆");
        btn.type = "button";
        btn.className = "opv-pin-btn" + (artistIsPinned(tag) ? " is-on" : "");
        btn.title = artistIsPinned(tag) ? T("★ 已置顶") : T("⭐ 收藏置顶");
        btn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            resolveArtistForFlyout(tag).then(function (info) {
                return pinArtistFavorite((info && info.found) || { tag: tag }, null, false);
            });
        };
        wrap.appendChild(btn);
        applyPinMark(wrap, tag);
    }

    function tagColor(tag) {
        var r = "#555555";
        if (!tag) return r;
        if (window.animaParseWeightTag) tag = window.animaParseWeightTag(tag).tag || tag;
        if (tag.indexOf("@") === 0) return "#e91e63";
        if (window.animaChipLooksArtist && window.animaChipLooksArtist(tag, _favArtCache)) return "#e91e63";
        if (/^score_|^rating_|^year_/.test(tag)) return "#ff9800";
        if (/^\d+(?:girl|boy|other|1other)$/.test(tag)) return "#00bcd4";
        if (/^1(shot|girl|boy|other|head|breast|animal|pov|night|day)$/.test(tag)) return "#00bcd4";
        var clean = tag.replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\[/g, "[").replace(/\\\]/g, "]");
        var c = _tagColorCache[tag] || _tagColorCache[tag.replace(/ /g, "_")] || _tagColorCache[clean] || _tagColorCache[clean.replace(/ /g, "_")];
        if (c && c.c) return c.c;
        return r;
    }

    function toast(msg, ms) {
        var t = document.getElementById("toast");
        if (!t) return;
        t.textContent = msg;
        t.classList.remove("show");
        t.style.display = "block";
        void t.offsetWidth;
        t.classList.add("show");
        clearTimeout(toast._tm);
        toast._tm = setTimeout(function () {
            t.classList.remove("show");
            t.style.display = "none";
        }, ms || 1400);
    }

    function copyText(text) {
        text = String(text || "");
        if (!text) { toast(T("没有可复制的内容")); return; }
        function ok() { toast(T("已复制")); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(ok).catch(function () {
                var ta = document.createElement("textarea");
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand("copy"); ok(); } catch (e2) { toast(T("复制失败")); }
                ta.remove();
            });
        } else {
            toast(T("复制失败"));
        }
    }

    function ctxOpen() {
        var m = document.getElementById("ctx-menu");
        return !!(m && !m.hidden);
    }

    function closeCtxMenu() {
        _ctxItem = null;
        var m = document.getElementById("ctx-menu");
        if (m) {
            var subs = m.querySelectorAll(".ctx-sub");
            for (var i = 0; i < subs.length; i++) clearCtxSubTimer(subs[i]);
            m.hidden = true;
            m.innerHTML = "";
        }
    }

    function fetchExtract(it) {
        if (!it) return Promise.reject(new Error("no item"));
        if (state.sel && itemKey(state.sel) === itemKey(it) && state.extract) {
            return Promise.resolve(state.extract);
        }
        var q = "filename=" + encodeURIComponent(it.filename) + "&subfolder=" + encodeURIComponent(it.subfolder || "");
        return fetch("/danbooru_anima/output_prompt/extract?" + q).then(function (r) {
            if (!r.ok) throw new Error(r.status === 404 ? "need_restart" : String(r.status));
            return r.json();
        }).then(function (d) {
            return applyStoredPromptNode(d || {});
        });
    }

    function readPromptSrcMap() {
        try { return JSON.parse(localStorage.getItem(LS_PROMPT_SRC) || "{}") || {}; } catch (e) { return {}; }
    }
    function writePromptSrc(sig, nodeId) {
        if (!sig) return;
        var m = readPromptSrcMap();
        if (!nodeId || nodeId === "auto") delete m[sig];
        else m[sig] = String(nodeId);
        try { localStorage.setItem(LS_PROMPT_SRC, JSON.stringify(m)); } catch (e) {}
    }
    function restoreAutoPrompt(d) {
        if (!d) return d;
        var out = Object.assign({}, d);
        out.text = d.auto_text || "";
        out.tags = d.auto_tags || [];
        out.artists = d.auto_artists || [];
        out.path = d.auto_path || "";
        out.source = d.auto_source || out.source;
        out.picked_id = "";
        if (out.auto_error) out.error = out.auto_error;
        else if (!out.text) out.error = d.error;
        else out.error = null;
        return out;
    }
    function applyCandidateNode(d, nodeId) {
        if (!d || !nodeId || nodeId === "auto") return restoreAutoPrompt(d);
        var list = d.candidates || [];
        var c = null;
        var i;
        for (i = 0; i < list.length; i++) {
            if (String(list[i].id) === String(nodeId)) { c = list[i]; break; }
        }
        if (!c) return restoreAutoPrompt(d);
        var out = Object.assign({}, d);
        out.text = c.text || "";
        out.tags = c.tags || [];
        out.artists = c.artists || [];
        out.path = c.path || d.path || "";
        out.picked_id = String(c.id);
        out.source = "node";
        out.error = out.text ? null : d.error;
        return out;
    }
    function applyStoredPromptNode(d) {
        if (!d) return d;
        if (!d._autoReady) {
            if (d.auto_text == null) d.auto_text = d.text || "";
            d.auto_tags = d.tags ? d.tags.slice() : [];
            d.auto_artists = d.artists ? d.artists.slice() : [];
            if (d.auto_path == null) d.auto_path = d.path || "";
            d.auto_source = d.source || "";
            d.auto_error = d.error || null;
            d._autoReady = true;
        }
        var want = d.graph_sig ? readPromptSrcMap()[d.graph_sig] : "";
        if (!want) return d;
        return applyCandidateNode(d, want);
    }

    function extractErrorText(e) {
        return (e && e.message === "need_restart") ? T("请先重启 ComfyUI，再打开本页") : T("加载失败");
    }

    function downloadImage(it) {
        if (!it || !it.url) { toast(T("没有可复制的内容")); return; }
        var a = document.createElement("a");
        a.href = it.url;
        a.download = it.filename || "image.png";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    function revealLocalFile(it) {
        if (!it || !it.filename) { toast(T("打开失败")); return; }
        fetch("/danbooru_anima/output_prompt/reveal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: it.filename, subfolder: it.subfolder || "" })
        }).then(function (r) {
            if (r.status === 404) throw new Error("need_restart");
            return r.json();
        }).then(function (d) {
            if (!d || !d.ok) toast((d && d.error) || T("打开失败"));
        }).catch(function (e) {
            toast(e && e.message === "need_restart" ? T("请先重启 ComfyUI，再打开本页") : T("打开失败"));
        });
    }


    function recycleLocalFile(it) {
        if (!it || !it.filename) { toast(T("删除失败")); return; }
        if (_recycleBusy) return;
        var name = it.filename || "";
        if (!window.confirm(T("确定把这张图片移到回收站吗？") + "\n" + name)) return;
        _recycleBusy = true;
        fetch("/danbooru_anima/output_prompt/recycle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: it.filename, subfolder: it.subfolder || "" })
        }).then(function (r) {
            if (r.status === 404) throw new Error("need_restart");
            return r.json();
        }).then(function (d) {
            if (!d || !d.ok) { toast((d && d.error) || T("删除失败")); return; }
            dropViewerItem(it);
            toast(T("已移到回收站"), 1400);
        }).catch(function (e) {
            toast(e && e.message === "need_restart" ? T("请先重启 ComfyUI，再打开本页") : T("删除失败"));
        }).then(function () { _recycleBusy = false; });
    }

    var OPV_TRASH_SUB = "查看器回收站";
    var _fsBusy = false;
    var _trashInfo = { count: 0, folders: 0, retention_days: 7 };

    function isImgFavView() { return state.subfolder === IMG_FAV_SUB; }
    function isTrashView() {
        var s = String(state.subfolder || "").replace(/\\/g, "/");
        return s === OPV_TRASH_SUB || s.indexOf(OPV_TRASH_SUB + "/") === 0;
    }
    function isTrashRoot() { return String(state.subfolder || "") === OPV_TRASH_SUB; }
    function canManageFolders() { return !isImgFavView() && !isTrashView(); }

    function postOpvJson(path, body) {
        return fetch("/danbooru_anima/output_prompt/" + path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body || {})
        }).then(function (r) {
            if (r.status === 404) throw new Error("need_restart");
            return r.json();
        });
    }
    function fsRestartToast(e, fallback) {
        toast(e && e.message === "need_restart" ? T("请先重启 ComfyUI，再打开本页") : (fallback || T("操作失败")));
    }
    function parentSub(sub) {
        var s = String(sub || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
        if (!s) return "";
        var i = s.lastIndexOf("/");
        return i < 0 ? "" : s.slice(0, i);
    }
    function trashRelOf(sub) {
        var s = String(sub || "").replace(/\\/g, "/");
        if (s === OPV_TRASH_SUB) return "";
        if (s.indexOf(OPV_TRASH_SUB + "/") === 0) return s.slice(OPV_TRASH_SUB.length + 1).split("/")[0];
        return "";
    }
    function syncTrashToolbar(info) {
        if (info) _trashInfo = info;
        var b = document.getElementById("btn-trash");
        if (b) {
            var on = isTrashView();
            var nFold = (_trashInfo && _trashInfo.folders) || 0;
            var nFile = (_trashInfo && _trashInfo.count) || 0;
            var n = nFold || nFile;
            b.classList.toggle("is-on", on);
            b.setAttribute("aria-pressed", on ? "true" : "false");
            b.textContent = n ? (T("查看器回收站") + " · " + n) : T("查看器回收站");
            b.title = on ? T("返回全部图片") : T("查看器回收站（不是系统回收站）");
        }
        document.body.classList.toggle("opv-trash", isTrashView());
        var emptyBtn = document.getElementById("btn-trash-empty");
        if (emptyBtn) emptyBtn.hidden = !isTrashRoot();
        var mk = document.getElementById("btn-mkdir");
        if (mk) mk.hidden = !canManageFolders();
        var edBtn = document.getElementById("btn-edit");
        if (edBtn) edBtn.hidden = !canManageFolders();
        if (!canManageFolders() && _editOn) setEditMode(false);
    }
    function syncTrashFromList(d) {
        if (d && d.trash) syncTrashToolbar(d.trash);
        else syncTrashToolbar(_trashInfo);
    }
    var _editOn = false;
    var _editSel = Object.create(null);
    var _editAnchor = -1;
    var _editDragSelect = false;
    var EDIT_CAP = 400;
    function editCount() {
        var n = 0;
        for (var k in _editSel) {
            if (_editSel[k]) n++;
        }
        return n;
    }
    function editItems() {
        var out = [];
        for (var k in _editSel) {
            if (_editSel[k]) out.push(_editSel[k]);
        }
        return out;
    }
    function editItemIndex(it) {
        var items = state.items || [];
        var key = itemKey(it);
        for (var i = 0; i < items.length; i++) {
            if (itemKey(items[i]) === key) return i;
        }
        return -1;
    }
    function rememberEdit(it) {
        var key = itemKey(it);
        if (!key || !it) return false;
        if (!_editSel[key] && editCount() >= EDIT_CAP) return false;
        _editSel[key] = { filename: it.filename || "", subfolder: it.subfolder || "" };
        return true;
    }
    function forgetEdit(it) {
        delete _editSel[itemKey(it)];
    }
    function paintEditTiles() {
        var box = document.getElementById("grid");
        if (!box) return;
        var tiles = box.querySelectorAll(".tile");
        var tip = _editOn
            ? T("点选可勾选，按住 Shift 连选")
            : (state.compareOn ? T("点击勾选，用于对比") : T("移到放大镜查看大图，单击查看标签"));
        for (var i = 0; i < tiles.length; i++) {
            var key = tiles[i].getAttribute("data-key") || "";
            tiles[i].classList.toggle("is-edit", !!(_editOn && _editSel[key]));
            tiles[i].title = tip;
        }
    }
    function syncEditBar() {
        var n = editCount();
        var lab = document.getElementById("edit-count");
        if (lab) lab.textContent = T("已选") + " " + n;
        var del = document.getElementById("btn-edit-delete");
        if (del) del.disabled = !n || _recycleBusy;
        var mv = document.getElementById("btn-edit-move");
        if (mv) mv.disabled = !n || _recycleBusy;
        var cl = document.getElementById("btn-edit-clear");
        if (cl) cl.disabled = !n;
    }
    function syncEditChrome() {
        var b = document.getElementById("btn-edit");
        if (b) {
            b.textContent = _editOn ? T("完成") : T("编辑");
            b.title = T("点选或框选都会累加，点空白处取消，再批量移动或删除");
            b.classList.toggle("is-on", _editOn);
            b.setAttribute("aria-pressed", _editOn ? "true" : "false");
        }
        var del = document.getElementById("btn-edit-delete");
        if (del) del.textContent = T("删除选中");
        var mv = document.getElementById("btn-edit-move");
        if (mv) mv.textContent = T("移动到文件夹");
        var cl = document.getElementById("btn-edit-clear");
        if (cl) cl.textContent = T("清除选择");
        var bar = document.getElementById("edit-bar");
        if (bar) bar.hidden = !_editOn;
        syncEditBar();
    }
    function clearEditSel() {
        _editSel = Object.create(null);
        _editAnchor = -1;
        syncEditBar();
        paintEditTiles();
    }
    function closeEditMovePop() {
        var p = document.getElementById("edit-move-pop");
        if (p && p.parentNode) p.parentNode.removeChild(p);
    }
    function setEditMode(on) {
        _editOn = !!on;
        if (!_editOn) {
            _editSel = Object.create(null);
            _editAnchor = -1;
            closeEditMovePop();
        }
        document.body.classList.toggle("opv-edit", _editOn);
        var bands = document.querySelectorAll(".edit-marquee");
        for (var i = 0; i < bands.length; i++) {
            if (bands[i].parentNode) bands[i].parentNode.removeChild(bands[i]);
        }
        syncEditChrome();
        paintEditTiles();
        syncTileFileDrag();
    }
    function editToggle(it) {
        var key = itemKey(it);
        if (_editSel[key]) forgetEdit(it);
        else if (!rememberEdit(it)) toast(T("一次最多选 400 张"));
        _editAnchor = editItemIndex(it);
        syncEditBar();
        paintEditTiles();
    }
    function editRangeTo(it) {
        var items = state.items || [];
        var end = editItemIndex(it);
        if (end < 0) return;
        var start = _editAnchor;
        if (start < 0) start = end;
        var a = Math.min(start, end);
        var b = Math.max(start, end);
        var capped = false;
        for (var i = a; i <= b; i++) {
            if (!rememberEdit(items[i])) capped = true;
        }
        if (capped) toast(T("一次最多选 400 张"));
        syncEditBar();
        paintEditTiles();
    }
    function selectAllEdit() {
        var items = state.items || [];
        var capped = false;
        for (var i = 0; i < items.length; i++) {
            if (!rememberEdit(items[i])) { capped = true; break; }
        }
        if (items.length) _editAnchor = 0;
        if (capped) toast(T("一次最多选 400 张"));
        syncEditBar();
        paintEditTiles();
    }
    function dropMovedEdit(moved) {
        if (!moved || !moved.length) return;
        for (var i = 0; i < moved.length; i++) {
            var name = moved[i].filename || "";
            if (!name) continue;
            delete _editSel[(moved[i].from || "") + "/" + name];
        }
        syncEditBar();
    }
    function openEditMoveMenu(anchor) {
        var batch = editItems();
        if (!batch.length) { toast(T("还没有选中图片")); return; }
        closeEditMovePop();
        var pop = el("div");
        pop.id = "edit-move-pop";
        pop.className = "edit-move-pop";
        function addBtn(label, fn, disabled) {
            var b = el("button", "", label);
            b.type = "button";
            if (disabled) b.disabled = true;
            b.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (disabled) return;
                closeEditMovePop();
                fn();
            };
            pop.appendChild(b);
        }
        addBtn(T("新建文件夹并移动…"), function () { promptMkdir(batch); });
        var sep = el("div");
        sep.className = "sep";
        pop.appendChild(sep);
        document.body.appendChild(pop);
        function placePop() {
            var r = anchor.getBoundingClientRect();
            var pr = pop.getBoundingClientRect();
            var left = Math.max(8, Math.min(r.left, window.innerWidth - pr.width - 8));
            var top = r.bottom + 6;
            if (top + pr.height > window.innerHeight - 8) top = Math.max(8, r.top - pr.height - 6);
            pop.style.left = left + "px";
            pop.style.top = top + "px";
        }
        placePop();
        fetch("/danbooru_anima/output_prompt/manage_folders?current=" + encodeURIComponent(state.subfolder || "")).then(function (r) {
            if (r.status === 404) throw new Error("need_restart");
            return r.json();
        }).then(function (d) {
            if (!pop.parentNode) return;
            var list = (d && d.folders) || [];
            var any = false;
            list.forEach(function (f) {
                var dest = f.subfolder || "";
                var allHere = batch.length > 0;
                for (var i = 0; i < batch.length; i++) {
                    if ((batch[i].subfolder || "") !== dest) { allHere = false; break; }
                }
                if (allHere) return;
                any = true;
                var lab = dest ? dest : T("output 根目录");
                addBtn(lab, function () { moveItemsTo(batch, dest); });
            });
            if (!any) addBtn(T("还没有其它文件夹"), function () {}, true);
            placePop();
        }).catch(function (e) {
            if (!pop.parentNode) return;
            addBtn(extractErrorText(e), function () {}, true);
            placePop();
        });
        setTimeout(function () {
            function onDoc(e) {
                if (!pop.parentNode) {
                    document.removeEventListener("mousedown", onDoc, true);
                    return;
                }
                if (pop.contains(e.target)) return;
                if (anchor && anchor.contains && anchor.contains(e.target)) return;
                closeEditMovePop();
                document.removeEventListener("mousedown", onDoc, true);
            }
            document.addEventListener("mousedown", onDoc, true);
        }, 0);
    }
    function bindEditMarquee() {
        var gal = document.getElementById("gallery");
        if (!gal || gal.dataset.editMarquee) return;
        gal.dataset.editMarquee = "1";
        gal.addEventListener("mousedown", function (e) {
            if (!_editOn || e.button !== 0) return;
            if (e.target.closest && e.target.closest("button, a, input, select, textarea, .edit-bar")) return;
            var fromTile = !!(e.target.closest && e.target.closest(".tile"));
            var gr = gal.getBoundingClientRect();
            var sb = gal.offsetWidth - gal.clientWidth;
            if (sb > 4 && e.clientX > gr.left + gal.clientWidth - 1) return;
            function contentPoint(clientX, clientY) {
                var gr = gal.getBoundingClientRect();
                return {
                    x: clientX - gr.left + gal.scrollLeft,
                    y: clientY - gr.top + gal.scrollTop
                };
            }
            var anchor = contentPoint(e.clientX, e.clientY);
            var lastX = e.clientX;
            var lastY = e.clientY;
            var popWas = !!document.getElementById("edit-move-pop");
            var drag = { on: false, band: null, additive: !!(e.shiftKey || e.ctrlKey || e.metaKey), cappedTold: false, frame: 0 };
            function rangeNow() {
                var p = contentPoint(lastX, lastY);
                return {
                    l: Math.min(anchor.x, p.x),
                    t: Math.min(anchor.y, p.y),
                    r: Math.max(anchor.x, p.x),
                    b: Math.max(anchor.y, p.y)
                };
            }
            function placeBand(rc) {
                if (!drag.band) return;
                var gr = gal.getBoundingClientRect();
                var viewL = gr.left - gal.scrollLeft + rc.l;
                var viewT = gr.top - gal.scrollTop + rc.t;
                var viewR = gr.left - gal.scrollLeft + rc.r;
                var viewB = gr.top - gal.scrollTop + rc.b;
                var dl = Math.max(viewL, gr.left);
                var dt = Math.max(viewT, gr.top);
                var dr = Math.min(viewR, gr.left + gal.clientWidth);
                var db = Math.min(viewB, gr.top + gal.clientHeight);
                drag.band.style.left = dl + "px";
                drag.band.style.top = dt + "px";
                drag.band.style.width = Math.max(0, dr - dl) + "px";
                drag.band.style.height = Math.max(0, db - dt) + "px";
            }
            function absorb(rc) {
                var box = document.getElementById("grid");
                if (!box) return;
                var gr = gal.getBoundingClientRect();
                var tiles = box.querySelectorAll(".tile");
                var changed = false;
                for (var i = 0; i < tiles.length; i++) {
                    var tile = tiles[i];
                    var key = tile.getAttribute("data-key") || "";
                    if (!key || _editSel[key]) continue;
                    var br = tile.getBoundingClientRect();
                    if (br.width < 2 || br.height < 2) continue;
                    var tl = br.left - gr.left + gal.scrollLeft;
                    var tt = br.top - gr.top + gal.scrollTop;
                    var tr = br.right - gr.left + gal.scrollLeft;
                    var tb = br.bottom - gr.top + gal.scrollTop;
                    if (tr < rc.l || tl > rc.r || tb < rc.t || tt > rc.b) continue;
                    var it = { filename: tile.getAttribute("data-fn") || "", subfolder: tile.getAttribute("data-sub") || "" };
                    if (!rememberEdit(it)) {
                        if (!drag.cappedTold) {
                            drag.cappedTold = true;
                            toast(T("一次最多选 400 张"));
                        }
                        break;
                    }
                    changed = true;
                    _editAnchor = editItemIndex(it);
                }
                if (changed) {
                    syncEditBar();
                    paintEditTiles();
                }
            }
            function schedule() {
                if (!drag.on || drag.frame) return;
                drag.frame = requestAnimationFrame(function () {
                    drag.frame = 0;
                    if (!drag.on) return;
                    var rc = rangeNow();
                    placeBand(rc);
                    absorb(rc);
                });
            }
            function move(ev) {
                lastX = ev.clientX;
                lastY = ev.clientY;
                if (!drag.on) {
                    var dx = ev.clientX - e.clientX;
                    var dy = ev.clientY - e.clientY;
                    if (dx * dx + dy * dy < 36) return;
                    drag.on = true;
                    var band = document.createElement("div");
                    band.className = "edit-marquee";
                    document.body.appendChild(band);
                    drag.band = band;
                }
                ev.preventDefault();
                schedule();
            }
            function onScroll() {
                if (drag.on) schedule();
            }
            function up(ev) {
                document.removeEventListener("mousemove", move, true);
                document.removeEventListener("mouseup", up, true);
                gal.removeEventListener("scroll", onScroll);
                if (drag.frame) {
                    cancelAnimationFrame(drag.frame);
                    drag.frame = 0;
                }
                var was = drag.on;
                var additive = drag.additive;
                if (ev) {
                    lastX = ev.clientX;
                    lastY = ev.clientY;
                }
                if (drag.band && drag.band.parentNode) drag.band.parentNode.removeChild(drag.band);
                drag.band = null;
                drag.on = false;
                if (!_editOn) return;
                if (!was) {
                    if (!fromTile && !additive && !popWas) clearEditSel();
                    return;
                }
                if (fromTile) {
                    _editDragSelect = true;
                    setTimeout(function () { _editDragSelect = false; }, 0);
                }
                absorb(rangeNow());
            }
            gal.addEventListener("scroll", onScroll);
            document.addEventListener("mousemove", move, true);
            document.addEventListener("mouseup", up, true);
        }, true);
    }
    function bindFolderManage() {
        var mk = document.getElementById("btn-mkdir");
        if (mk && !mk.dataset.bound) {
            mk.dataset.bound = "1";
            mk.onclick = function () { promptMkdir(); };
        }
        var tb = document.getElementById("btn-trash");
        if (tb && !tb.dataset.bound) {
            tb.dataset.bound = "1";
            tb.onclick = function () {
                if (isTrashView()) changeFolder("");
                else changeFolder(OPV_TRASH_SUB);
            };
        }
        var em = document.getElementById("btn-trash-empty");
        if (em && !em.dataset.bound) {
            em.dataset.bound = "1";
            em.onclick = function () { emptyViewerTrash(); };
        }
        var ed = document.getElementById("btn-edit");
        if (ed && !ed.dataset.bound) {
            ed.dataset.bound = "1";
            ed.onclick = function () { setEditMode(!_editOn); };
        }
        var edel = document.getElementById("btn-edit-delete");
        if (edel && !edel.dataset.bound) {
            edel.dataset.bound = "1";
            edel.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                recycleEditSelection();
            };
        }
        var emv = document.getElementById("btn-edit-move");
        if (emv && !emv.dataset.bound) {
            emv.dataset.bound = "1";
            emv.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                openEditMoveMenu(emv);
            };
        }
        var ecl = document.getElementById("btn-edit-clear");
        if (ecl && !ecl.dataset.bound) {
            ecl.dataset.bound = "1";
            ecl.onclick = function () { clearEditSel(); };
        }
        bindEditMarquee();
        syncEditChrome();
        syncTrashToolbar(_trashInfo);
    }
    function promptMkdir(moveItems, allFromSub) {
        if (!canManageFolders() && !(moveItems || allFromSub)) {
            toast(T("不能在这里新建文件夹"));
            return;
        }
        var name = window.prompt(T("新建文件夹名称:"));
        if (name == null) return;
        name = String(name).trim();
        if (!name) return;
        if (_fsBusy) return;
        _fsBusy = true;
        var parent = state.subfolder || "";
        postOpvJson("mkdir", { parent: parent, name: name }).then(function (d) {
            if (!d || !d.ok) { toast((d && d.error) || T("新建失败")); return null; }
            toast(T("已新建文件夹"));
            var dest = d.subfolder || "";
            _foldersOpen = true;
            if (moveItems) return moveItemsTo(moveItems, dest, true);
            if (allFromSub) return moveAllInFolder(allFromSub, dest, true);
            loadList();
            return null;
        }).catch(function (e) { fsRestartToast(e, T("新建失败")); }).then(function () { _fsBusy = false; });
    }
    function movedLeavesView(it, dest) {
        var sub = (it && it.subfolder) || "";
        dest = dest || "";
        if (sub === dest) return false;
        var cur = state.subfolder || "";
        function inside(folder) {
            if (!cur) return true;
            return folder === cur || folder.indexOf(cur + "/") === 0;
        }
        if (!listDeepOn()) return !cur ? sub === "" : inside(sub);
        return inside(sub) && !inside(dest);
    }
    function dropMovedLocal(items, dest) {
        var drop = {};
        var n = 0;
        for (var i = 0; i < (items || []).length; i++) {
            var it = items[i];
            if (!it || !movedLeavesView(it, dest)) continue;
            var key = itemKey(it);
            if (!key || drop[key]) continue;
            drop[key] = 1;
            n++;
        }
        if (!n) return;
        var curItems = state.items || [];
        var next = [];
        for (var j = 0; j < curItems.length; j++) {
            if (!drop[itemKey(curItems[j])]) next.push(curItems[j]);
        }
        state.items = next;
        if (typeof state.total === "number") state.total = Math.max(0, state.total - (curItems.length - next.length));
        if (state.sel && drop[itemKey(state.sel)]) {
            state.sel = next[0] || null;
            state.extract = null;
            renderDetail();
        }
        renderGrid();
        renderPager();
    }
    function recycleEditSelection() {
        var batch = editItems();
        if (!batch.length) { toast(T("还没有选中图片")); return; }
        if (_recycleBusy) return;
        if (batch.length === 1) {
            recycleLocalFile(batch[0]);
            return;
        }
        if (!window.confirm(T("确定把选中的图片移到回收站吗？") + "\n" + batch.length)) return;
        _recycleBusy = true;
        syncEditBar();
        postOpvJson("recycle_many", { items: batch }).then(function (d) {
            if (!d || !d.ok) {
                toast((d && d.error) || T("删除失败"));
                return;
            }
            var done = d.items || [];
            if (done.length) dropViewerItems(done);
            var n = (typeof d.recycled === "number") ? d.recycled : done.length;
            if (n) toast(T("已移到回收站") + " · " + n, 1600);
            var errs = d.errors || [];
            if (!errs.length && d.error) errs = [d.error];
            if (errs.length) toast(errs[0], 2400);
        }).catch(function (e) {
            fsRestartToast(e, T("删除失败"));
        }).then(function () {
            _recycleBusy = false;
            syncEditBar();
        });
    }
    function moveItemsTo(items, dest, chained) {
        if (_fsBusy && !chained) return;
        if (!chained) _fsBusy = true;
        dropMovedLocal(items, dest);
        return postOpvJson("move", { items: items, dest: dest || "" }).then(function (d) {
            if (!d || !d.ok) {
                toast((d && d.error) || T("移动失败"));
                loadList({ silent: true });
                return;
            }
            var n = d.moved || 0;
            var errs = d.errors || [];
            if (n) toast(T("已移动图片") + " · " + n);
            if (errs.length) toast(errs[0], 2200);
            dropMovedEdit(d.items || []);
            loadList({ silent: true });
            refreshFilterCountsQuiet(d.items || []);
        }).catch(function (e) {
            fsRestartToast(e, T("移动失败"));
            loadList({ silent: true });
        }).then(function () {
            if (!chained) _fsBusy = false;
        });
    }
    function moveAllInFolder(source, dest, chained) {
        if (_fsBusy && !chained) return;
        if (!chained) _fsBusy = true;
        return postOpvJson("move", { all: true, source: source || "", dest: dest || "" }).then(function (d) {
            if (!d || !d.ok) { toast((d && d.error) || T("移动失败")); return; }
            var n = d.moved || 0;
            var errs = d.errors || [];
            toast(n ? (T("已移动图片") + " · " + n) : T("没有可移动的图片"));
            if (errs.length) toast(errs[0], 2200);
            loadList();
            if (n) refreshFilterCountsQuiet(d.items || []);
        }).catch(function (e) { fsRestartToast(e, T("移动失败")); }).then(function () {
            if (!chained) _fsBusy = false;
        });
    }
    function trashFolder(f) {
        var sub = (f && f.subfolder) || "";
        var name = (f && f.name) || sub;
        if (!sub) return;
        if (!window.confirm(T("将把文件夹移到查看器回收站。这不是系统回收站，7 天后会自动删除。确定？") + "\n" + name)) return;
        if (_fsBusy) return;
        _fsBusy = true;
        postOpvJson("trash_folder", { subfolder: sub }).then(function (d) {
            if (!d || !d.ok) { toast((d && d.error) || T("移入回收站失败")); return; }
            toast(T("已移到查看器回收站"));
            var cur = state.subfolder || "";
            if (cur === sub || cur.indexOf(sub + "/") === 0) changeFolder(parentSub(sub));
            else loadList();
        }).catch(function (e) { fsRestartToast(e, T("移入回收站失败")); }).then(function () { _fsBusy = false; });
    }
    function restoreTrashFolder(rel) {
        if (!rel) return;
        if (_fsBusy) return;
        _fsBusy = true;
        postOpvJson("trash_restore", { trash_rel: rel }).then(function (d) {
            if (!d || !d.ok) { toast((d && d.error) || T("还原失败")); return; }
            toast(T("已还原文件夹"));
            changeFolder(d.subfolder || "");
        }).catch(function (e) { fsRestartToast(e, T("还原失败")); }).then(function () { _fsBusy = false; });
    }
    function emptyViewerTrash() {
        if (!window.confirm(T("清空查看器回收站后无法恢复（不是系统回收站）。确定？"))) return;
        if (_fsBusy) return;
        _fsBusy = true;
        postOpvJson("trash_empty", {}).then(function (d) {
            if (!d || !d.ok) { toast((d && d.error) || T("清空失败")); return; }
            toast(T("已清空查看器回收站"));
            _trashInfo = { count: 0, folders: 0, retention_days: (_trashInfo && _trashInfo.retention_days) || 7 };
            changeFolder(OPV_TRASH_SUB);
        }).catch(function (e) { fsRestartToast(e, T("清空失败")); }).then(function () { _fsBusy = false; });
    }
    function ctxAct(label, fn, extraClass) {
        var b = el("button", "", label);
        b.type = "button";
        if (extraClass) b.className = extraClass;
        b.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            closeCtxMenu();
            fn();
        };
        return b;
    }
    function ctxMoveItems(it) {
        if (_editOn && it && _editSel[itemKey(it)]) {
            var batch = editItems();
            if (batch.length > 1) return batch;
        }
        return [it];
    }
    function makeMoveToFolderItem(it, sourceSub, all) {
        var wrap = el("div");
        wrap.className = "ctx-sub";
        var b = el("button");
        b.type = "button";
        b.className = "ctx-has-sub";
        var moveLabel = all ? T("将图片移到文件夹") : T("移动到文件夹");
        if (!all) {
            var moveCount = ctxMoveItems(it).length;
            if (moveCount > 1) moveLabel += "（" + moveCount + "）";
        }
        b.appendChild(document.createTextNode(moveLabel));
        var chev = el("span", "", "▸");
        chev.className = "ctx-chev";
        b.appendChild(chev);
        var fly = el("div");
        fly.className = "ctx-fly";
        wrap.appendChild(b);
        wrap.appendChild(fly);
        var ensure = function () {
            fly.innerHTML = "";
            fly.appendChild(ctxFlyBtn(T("新建文件夹并移动…"), function () {
                closeCtxMenu();
                if (all) promptMkdir(null, sourceSub);
                else promptMkdir(ctxMoveItems(it));
            }));
            fetch("/danbooru_anima/output_prompt/manage_folders?current=" + encodeURIComponent(state.subfolder || "")).then(function (r) {
                if (r.status === 404) throw new Error("need_restart");
                return r.json();
            }).then(function (d) {
                var list = (d && d.folders) || [];
                if (!list.length) {
                    fly.appendChild(ctxFlyBtn(T("还没有其它文件夹"), function () {}, { disabled: true }));
                    return;
                }
                list.forEach(function (f) {
                    var dest = f.subfolder || "";
                    if (all && dest === (sourceSub || "")) return;
                    if (!all) {
                        var moving = ctxMoveItems(it);
                        var stay = moving.length > 0;
                        for (var mi = 0; mi < moving.length; mi++) {
                            if ((moving[mi].subfolder || "") !== dest) { stay = false; break; }
                        }
                        if (stay) return;
                    }
                    var lab = dest ? dest : T("output 根目录");
                    fly.appendChild(ctxFlyBtn(lab, function () {
                        closeCtxMenu();
                        if (all) moveAllInFolder(sourceSub, dest);
                        else moveItemsTo(ctxMoveItems(it), dest);
                    }));
                });
                if (wrap.classList.contains("is-open")) placeCtxFly(wrap);
            }).catch(function (e) {
                fly.appendChild(ctxFlyBtn(extractErrorText(e), function () {}, { disabled: true }));
            });
        };
        var open = bindCtxSub(wrap, ensure);
        b.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            open();
        };
        return wrap;
    }
    function openFolderCtx(f, x, y) {
        if (!f) return;
        hidePeek();
        _ctxItem = null;
        var m = document.getElementById("ctx-menu");
        if (!m) return;
        m.innerHTML = "";
        if (isTrashRoot()) {
            m.appendChild(ctxAct(T("还原文件夹"), function () { restoreTrashFolder(f.name); }));
        } else if (canManageFolders()) {
            m.appendChild(makeMoveToFolderItem(null, f.subfolder, true));
            m.appendChild(ctxSep());
            m.appendChild(ctxAct(T("移到查看器回收站"), function () { trashFolder(f); }, "is-danger"));
        } else {
            return;
        }
        placeCtxMenu(x, y);
    }

    function dropViewerItem(it) {
        var key = itemKey(it);
        delete _imgRate.keys[key];
        delete _editSel[key];
        var items = state.items || [];
        var idx = -1;
        for (var i = 0; i < items.length; i++) {
            if (itemKey(items[i]) === key) { idx = i; break; }
        }
        var next = null;
        if (idx >= 0) {
            next = items[idx + 1] || items[idx - 1] || null;
            items.splice(idx, 1);
        }
        state.items = items;
        if (typeof state.total === "number" && state.total > 0) state.total -= 1;
        if (_facetCache[key]) delete _facetCache[key];
        if (_cmpExtractMemo[key]) delete _cmpExtractMemo[key];
        var ci = cmpFind(it);
        if (ci >= 0) {
            state.compareItems.splice(ci, 1);
            if (state.cmpA >= state.compareItems.length) state.cmpA = 0;
            if (state.cmpB >= state.compareItems.length) state.cmpB = Math.min(1, state.compareItems.length - 1);
            if (state.cmpA === state.cmpB && state.compareItems.length > 1) state.cmpB = state.cmpA === 0 ? 1 : 0;
            if (cmpOpen() && state.compareItems.length < 2) closeCompare();
            else refreshOpenCompare();
            renderCompareDock();
        }
        hidePeek();
        var wasLb = lbOpen();
        var wasSel = !!(state.sel && itemKey(state.sel) === key);
        if (wasLb) closeLightbox();
        if (wasSel) {
            if (next) selectItem(next, false);
            else {
                state.sel = null;
                state.extract = null;
                renderDetail();
            }
        }
        renderGrid();
        renderPager();
        syncEditBar();
        if (wasLb && next) openLightbox(next);
    }

    function dropViewerItems(list) {
        var drop = Object.create(null);
        var n = 0;
        for (var i = 0; i < (list || []).length; i++) {
            var key = itemKey(list[i]);
            if (!key || drop[key]) continue;
            drop[key] = 1;
            n++;
            delete _imgRate.keys[key];
            if (_facetCache[key]) delete _facetCache[key];
            if (_cmpExtractMemo[key]) delete _cmpExtractMemo[key];
            delete _editSel[key];
        }
        if (!n) return;
        var items = state.items || [];
        var selKey = state.sel ? itemKey(state.sel) : "";
        var selGone = !!(selKey && drop[selKey]);
        var neighbor = null;
        if (selGone) {
            var seenSel = false;
            var prev = null;
            for (var t = 0; t < items.length; t++) {
                var kk = itemKey(items[t]);
                if (kk === selKey) { seenSel = true; continue; }
                if (drop[kk]) continue;
                if (!seenSel) prev = items[t];
                else { neighbor = items[t]; break; }
            }
            if (!neighbor) neighbor = prev;
        }
        var nextItems = [];
        for (var j = 0; j < items.length; j++) {
            if (!drop[itemKey(items[j])]) nextItems.push(items[j]);
        }
        var removed = items.length - nextItems.length;
        state.items = nextItems;
        if (typeof state.total === "number") state.total = Math.max(0, state.total - removed);
        var cmp = state.compareItems || [];
        if (cmp.length) {
            var keptCmp = [];
            for (var c = 0; c < cmp.length; c++) {
                if (!drop[itemKey(cmp[c])]) keptCmp.push(cmp[c]);
            }
            if (keptCmp.length !== cmp.length) {
                state.compareItems = keptCmp;
                if (state.cmpA >= keptCmp.length) state.cmpA = 0;
                if (state.cmpB >= keptCmp.length) state.cmpB = Math.min(1, Math.max(0, keptCmp.length - 1));
                if (state.cmpA === state.cmpB && keptCmp.length > 1) state.cmpB = state.cmpA === 0 ? 1 : 0;
                if (cmpOpen() && keptCmp.length < 2) closeCompare();
                else refreshOpenCompare();
                renderCompareDock();
            }
        }
        hidePeek();
        var wasLb = lbOpen();
        if (wasLb && selGone) closeLightbox();
        if (selGone) {
            if (neighbor) selectItem(neighbor, false);
            else {
                state.sel = null;
                state.extract = null;
                renderDetail();
            }
        }
        renderGrid();
        renderPager();
        syncEditBar();
        paintEditTiles();
        if (wasLb && selGone && neighbor) openLightbox(neighbor);
    }

    function fillSelect(sel, items, emptyLabel, current) {
        sel.innerHTML = "";
        var z = document.createElement("option");
        z.value = "";
        z.textContent = emptyLabel;
        sel.appendChild(z);
        (items || []).forEach(function (name) {
            var o = document.createElement("option");
            o.value = name;
            o.textContent = name;
            sel.appendChild(o);
        });
        if (current) sel.value = current;
    }

    function closeFavSave() {
        var box = document.getElementById("fav-save");
        if (!box) return;
        box.hidden = true;
        box.innerHTML = "";
        box.onclick = null;
    }

    function uploadFavThumb(it) {
        return fetch("/danbooru_anima/prompt_favorites/thumb_from_output", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: it.filename, subfolder: it.subfolder || "" })
        }).then(function (r) {
            if (r.status === 404) throw new Error("fallback");
            return r.json();
        }).then(function (d) {
            if (d && d.success && d.thumb) return d.thumb;
            throw new Error("fallback");
        }).catch(function () {
            return fetch(it.url).then(function (r) { return r.blob(); }).then(function (blob) {
                var fd = new FormData();
                var ext = ((it.filename || "").match(/\.[a-z0-9]+$/i) || [".png"])[0];
                fd.append("file", blob, "temp_" + Date.now() + ext);
                return fetch("/danbooru_anima/prompt_favorites/upload_thumb", { method: "POST", body: fd });
            }).then(function (r) { return r.json(); }).then(function (d) {
                if (d && d.success && d.thumb) return d.thumb;
                throw new Error("thumb");
            });
        });
    }

    function openFavSave(it) {
        if (!it) { toast(T("请选择一张图片")); return; }
        closeCtxMenu();
        hidePeek();
        var mask = document.getElementById("fav-save");
        if (!mask) return;
        Promise.all([
            fetchExtract(it),
            fetch("/danbooru_anima/prompt_favorites").then(function (r) { return r.json(); }),
            fetch("/danbooru_anima/prompt_model_tags").then(function (r) { return r.json(); })
        ]).then(function (pack) {
            var d = pack[0] || {};
            var text = (d.text || ((d.tags || []).join(", "))).trim();
            if (!text) { toast(T("没有可收藏的提示词")); return; }
            var folders = (pack[1] && pack[1].folders) || [];
            var modelTags = (pack[2] && pack[2].tags) || [];
            mask.innerHTML = "";
            var box = el("div");
            box.className = "fav-box";
            box.appendChild(el("h2", "", T("保存提示词")));
            var prev = document.createElement("img");
            prev.className = "fav-preview";
            prev.src = it.url;
            prev.alt = it.filename || "";
            box.appendChild(prev);
            var ta = document.createElement("textarea");
            ta.value = text;
            box.appendChild(ta);
            var mRow = el("div");
            mRow.className = "fav-row";
            mRow.appendChild(el("span", "", T("模型"))).className = "k";
            var mSel = document.createElement("select");
            fillSelect(mSel, modelTags, T("— 不标记 —"), "");
            var cust = document.createElement("option");
            cust.value = "__custom__";
            cust.textContent = T("✏️ 自定义...");
            mSel.appendChild(cust);
            mSel.onchange = function () {
                if (mSel.value !== "__custom__") return;
                var c = window.prompt(T("输入自定义模型标识:"));
                if (c && c.trim()) {
                    var name = c.trim();
                    if (modelTags.indexOf(name) < 0) {
                        modelTags.push(name);
                        fetch("/danbooru_anima/prompt_model_tags/save", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ tags: modelTags })
                        }).catch(function () {});
                    }
                    fillSelect(mSel, modelTags, T("— 不标记 —"), name);
                    var again = document.createElement("option");
                    again.value = "__custom__";
                    again.textContent = T("✏️ 自定义...");
                    mSel.appendChild(again);
                    mSel.value = name;
                } else {
                    mSel.value = "";
                }
            };
            mRow.appendChild(mSel);
            box.appendChild(mRow);
            var fRow = el("div");
            fRow.className = "fav-row";
            fRow.appendChild(el("span", "", T("文件夹"))).className = "k";
            var fSel = document.createElement("select");
            fillSelect(fSel, folders, T("— 未分类 —"), "");
            fRow.appendChild(fSel);
            var newF = el("button", "", T("新建文件夹"));
            newF.type = "button";
            newF.className = "act";
            newF.onclick = function () {
                var name = window.prompt(T("新建文件夹名称:"));
                if (!name || !name.trim()) return;
                name = name.trim();
                fetch("/danbooru_anima/prompt_favorites/folder", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "create", name: name })
                }).then(function (r) { return r.json(); }).then(function (fd) {
                    if (!fd || !fd.success) { toast(T("收藏失败")); return; }
                    if (folders.indexOf(name) < 0) folders.push(name);
                    fillSelect(fSel, folders, T("— 未分类 —"), name);
                }).catch(function () { toast(T("收藏失败")); });
            };
            fRow.appendChild(newF);
            box.appendChild(fRow);
            var btns = el("div");
            btns.className = "fav-btns";
            var cancel = el("button", "", T("取消"));
            cancel.type = "button";
            cancel.className = "act";
            cancel.onclick = closeFavSave;
            var ok = el("button", "", T("保存"));
            ok.type = "button";
            ok.className = "act primary";
            ok.onclick = function () {
                var t = (ta.value || "").trim();
                if (!t) { toast(T("没有可收藏的提示词")); return; }
                ok.disabled = true;
                uploadFavThumb(it).then(function (thumb) {
                    return fetch("/danbooru_anima/prompt_favorites/save", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            id: "",
                            text: t,
                            model_tag: mSel.value === "__custom__" ? "" : (mSel.value || ""),
                            folder: fSel.value || "",
                            thumb: thumb || "",
                            created_at: Date.now() / 1000
                        })
                    });
                }).then(function (r) { return r.json(); }).then(function (sd) {
                    if (!sd || !sd.success) { toast((sd && sd.error) || T("收藏失败")); ok.disabled = false; return; }
                    closeFavSave();
                    toast(T("已收藏"));
                }).catch(function () {
                    toast(T("收藏失败"));
                    ok.disabled = false;
                });
            };
            btns.appendChild(cancel);
            btns.appendChild(ok);
            box.appendChild(btns);
            mask.appendChild(box);
            mask.hidden = false;
            mask.onclick = function (e) { if (e.target === mask) closeFavSave(); };
        }).catch(function (e) {
            toast(extractErrorText(e));
        });
    }

    function placeCtxMenu(x, y) {
        var m = document.getElementById("ctx-menu");
        if (!m) return;
        m.style.left = "0px";
        m.style.top = "0px";
        m.hidden = false;
        var w = m.offsetWidth || 198;
        var h = m.offsetHeight || 240;
        var left = x;
        var top = y;
        if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
        if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
        if (left < 8) left = 8;
        if (top < 8) top = 8;
        m.style.left = left + "px";
        m.style.top = top + "px";
    }

    function ctxBtn(label, fn, extraClass) {
        var b = el("button", "", label);
        b.type = "button";
        if (extraClass) b.className = extraClass;
        b.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            var it = _ctxItem;
            closeCtxMenu();
            if (it) fn(it);
        };
        return b;
    }

    function ctxSep() {
        var d = el("div");
        d.className = "sep";
        return d;
    }

    var _facetCache = {};
    function fetchFileFacets(it) {
        if (!it) return Promise.reject(new Error("no item"));
        if (it._facets) return Promise.resolve(it._facets);
        var k = itemKey(it);
        if (_facetCache[k]) {
            it._facets = _facetCache[k];
            return Promise.resolve(_facetCache[k]);
        }
        var q = "filename=" + encodeURIComponent(it.filename) + "&subfolder=" + encodeURIComponent(it.subfolder || "");
        return fetch("/danbooru_anima/output_prompt/file_facets?" + q).then(function (r) {
            if (!r.ok) throw new Error(r.status === 404 ? "need_restart" : String(r.status));
            return r.json();
        }).then(function (d) {
            if (!d || d.ok === false) throw new Error((d && d.error) || "load");
            var rec = {
                artists: d.artists || [],
                characters: d.characters || [],
                series: d.series || []
            };
            it._facets = rec;
            _facetCache[k] = rec;
            return rec;
        });
    }
    function uniqArtistItems(list) {
        var out = [];
        var seen = {};
        (list || []).forEach(function (t) {
            var k = artistNormKey(t);
            if (!k || seen[k]) return;
            seen[k] = 1;
            out.push({ tag: t, key: k });
        });
        return out;
    }
    function uniqFacetItems(list) {
        var out = [];
        var seen = {};
        (list || []).forEach(function (t) {
            var k = facetNormKey(t);
            if (!k || seen[k]) return;
            seen[k] = 1;
            out.push({ tag: t, key: k });
        });
        return out;
    }
    function readPickerArtists() {
        var raw = "";
        try { raw = new URLSearchParams(window.location.search).get("artists") || ""; } catch (e0) { raw = ""; }
        if (!raw) return [];
        try {
            if (raw.charAt(0) === "[") {
                var parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            }
        } catch (e1) {}
        return raw.split(",");
    }
    function readPickerCombo() {
        try { return new URLSearchParams(window.location.search).get("combo") || ""; } catch (e0) { return ""; }
    }
    function readPickerSolo() {
        try { return new URLSearchParams(window.location.search).get("solo") === "1"; } catch (e0) { return false; }
    }
    function readPickerExact() {
        try { return new URLSearchParams(window.location.search).get("exact") === "1"; } catch (e0) { return false; }
    }
    function artistKeyList(raw) {
        return String(raw || "").split(/[,，]/).map(function (s) {
            return artistNormKey(s);
        }).filter(Boolean);
    }
    function artistKeyHas(key) {
        var ks = artistKeyList(state.artistKey);
        return !!(key && ks.indexOf(key) >= 0);
    }
    function clearSoloForQuick() {
        if (!state.soloArtist) return;
        state.soloArtist = false;
        try { localStorage.setItem(LS_SOLO, "0"); } catch (e0) {}
    }
    function applyQuickArtist(arts) {
        var items = uniqArtistItems(arts);
        if (!items.length) { toast(T("这张图没有画师")); return; }
        closeCtxMenu();
        clearSoloForQuick();
        state.artistExact = false;
        state.artistKey = items.map(function (it) { return it.key; }).join(",");
        state.seriesKey = "";
        state.characterKey = "";
        renderCastPop();
        state.page = 1;
        closeLightbox();
        if (!artistFilterOn()) setView("artist");
        else openArtistPop();
        syncFilterUi();
        renderArtistRail();
        loadList();
    }
    function applyQuickCharacter(item) {
        if (!item || !item.key) { toast(T("这张图没有角色标签")); return; }
        closeCtxMenu();
        state.artistExact = false;
        state.artistKey = "";
        state.page = 1;
        closeLightbox();
        if (!castFilterOn()) setCastFilter(true);
        else openCastPop();
        applyCastKeys("", item.key);
    }
    function applyQuickSeries(item) {
        if (!item || !item.key) { toast(T("这张图没有系列标签")); return; }
        closeCtxMenu();
        state.artistExact = false;
        state.artistKey = "";
        state.page = 1;
        closeLightbox();
        if (!castFilterOn()) setCastFilter(true);
        else openCastPop();
        applyCastKeys(item.key, "");
    }
    function placeCtxFly(wrap) {
        if (!wrap) return;
        wrap.classList.remove("fly-left");
        var fly = wrap.querySelector(":scope > .ctx-fly") || wrap.querySelector(".ctx-fly");
        if (!fly) return;
        fly.style.top = "";
        fly.style.maxHeight = "";
        var pad = 8;
        var r = wrap.getBoundingClientRect();
        var fw = fly.offsetWidth || 220;
        if (r.right + fw > window.innerWidth - pad) wrap.classList.add("fly-left");
        var fr = fly.getBoundingClientRect();
        if (fr.height < 2) return;
        var maxH = Math.max(120, window.innerHeight - pad * 2);
        var h = Math.min(fr.height, maxH);
        var top = fr.top;
        if (top + h > window.innerHeight - pad) top = window.innerHeight - pad - h;
        if (top < pad) top = pad;
        var delta = top - fr.top;
        if (delta < -0.5 || delta > 0.5) {
            var base = parseFloat(window.getComputedStyle(fly).top);
            if (!isFinite(base)) base = -6;
            fly.style.top = (base + delta) + "px";
        }
        if (fr.height > h + 0.5) fly.style.maxHeight = h + "px";
    }
    function clearCtxSubTimer(wrap) {
        if (wrap && wrap._ctxCloseT) {
            clearTimeout(wrap._ctxCloseT);
            wrap._ctxCloseT = 0;
        }
    }
    function closeCtxSub(wrap) {
        if (!wrap) return;
        clearCtxSubTimer(wrap);
        wrap.classList.remove("is-open");
        var inner = wrap.querySelectorAll(".ctx-sub.is-open");
        for (var i = 0; i < inner.length; i++) closeCtxSub(inner[i]);
    }
    function closeSiblingCtxSubs(wrap) {
        var p = wrap && wrap.parentNode;
        if (!p || !p.children) return;
        var kids = p.children;
        for (var i = 0; i < kids.length; i++) {
            if (kids[i] !== wrap && kids[i].classList && kids[i].classList.contains("ctx-sub")) {
                closeCtxSub(kids[i]);
            }
        }
    }
    function openCtxSub(wrap, onOpen) {
        if (!wrap) return;
        clearCtxSubTimer(wrap);
        closeSiblingCtxSubs(wrap);
        wrap.classList.add("is-open");
        if (onOpen) onOpen();
        placeCtxFly(wrap);
    }
    function bindCtxSub(wrap, onOpen) {
        wrap.addEventListener("pointerenter", function () { openCtxSub(wrap, onOpen); });
        wrap.addEventListener("pointerleave", function () {
            clearCtxSubTimer(wrap);
            wrap._ctxCloseT = setTimeout(function () {
                wrap._ctxCloseT = 0;
                closeCtxSub(wrap);
            }, 360);
        });
        return function () { openCtxSub(wrap, onOpen); };
    }
    function ctxFlyBtn(label, fn, opts) {
        opts = opts || {};
        var b = el("button", "", label);
        b.type = "button";
        if (opts.disabled) {
            b.className = "is-off";
            b.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (opts.emptyTip) toast(opts.emptyTip);
            };
            return b;
        }
        b.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            fn();
        };
        return b;
    }
    function makeCtxNested(label, rows) {
        var wrap = el("div");
        wrap.className = "ctx-sub";
        var b = el("button");
        b.type = "button";
        b.className = "ctx-has-sub";
        b.appendChild(document.createTextNode(label));
        var chev = el("span", "", "▸");
        chev.className = "ctx-chev";
        b.appendChild(chev);
        var fly = el("div");
        fly.className = "ctx-fly";
        (rows || []).forEach(function (row) { fly.appendChild(row); });
        wrap.appendChild(b);
        wrap.appendChild(fly);
        var open = bindCtxSub(wrap);
        b.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            open();
        };
        return wrap;
    }
    function renderQuickFilterFly(fly, it, d) {
        fly.innerHTML = "";
        var arts = uniqArtistItems((d && d.artists) || []);
        var chars = uniqFacetItems((d && d.characters) || []);
        var series = uniqFacetItems((d && d.series) || []);
        if (!series.length && chars.length) series = [{ tag: "__none__", key: "__none__" }];
        fly.appendChild(ctxFlyBtn(T("查看同画师图片"), function () {
            applyQuickArtist((d && d.artists) || []);
        }, arts.length ? {} : { disabled: true, emptyTip: T("这张图没有画师") }));
        if (chars.length > 1) {
            fly.appendChild(makeCtxNested(T("查看同角色图片"), chars.map(function (c) {
                return ctxFlyBtn(charDisplayName(c), function () { applyQuickCharacter(c); });
            })));
        } else {
            fly.appendChild(ctxFlyBtn(T("查看同角色图片"), function () {
                applyQuickCharacter(chars[0]);
            }, chars.length ? {} : { disabled: true, emptyTip: T("这张图没有角色标签") }));
        }
        if (series.length > 1) {
            fly.appendChild(makeCtxNested(T("查看同系列图片"), series.map(function (s) {
                return ctxFlyBtn(seriesDisplayName(s), function () { applyQuickSeries(s); });
            })));
        } else {
            fly.appendChild(ctxFlyBtn(T("查看同系列图片"), function () {
                applyQuickSeries(series[0]);
            }, series.length ? {} : { disabled: true, emptyTip: T("这张图没有系列标签") }));
        }
    }
    function makeCtxFilterItem() {
        var wrap = el("div");
        wrap.className = "ctx-sub";
        var b = el("button");
        b.type = "button";
        b.className = "ctx-has-sub";
        b.appendChild(document.createTextNode(T("筛选")));
        var chev = el("span", "", "▸");
        chev.className = "ctx-chev";
        b.appendChild(chev);
        var fly = el("div");
        fly.className = "ctx-fly";
        wrap.appendChild(b);
        wrap.appendChild(fly);
        var loadedFor = "";
        function ensure() {
            var it = _ctxItem;
            if (!it) return;
            var k = itemKey(it);
            if (loadedFor === k && fly.childNodes.length && !fly.querySelector("[disabled]")) {
                placeCtxFly(wrap);
                return;
            }
            loadedFor = k;
            fly.innerHTML = "";
            var wait = el("button", "", T("正在加载…"));
            wait.type = "button";
            wait.disabled = true;
            wait.className = "is-off";
            fly.appendChild(wait);
            placeCtxFly(wrap);
            fetchFileFacets(it).then(function (d) {
                if (_ctxItem !== it) return;
                renderQuickFilterFly(fly, it, d);
                placeCtxFly(wrap);
            }).catch(function (e) {
                if (_ctxItem !== it) return;
                fly.innerHTML = "";
                var err = el("button", "", extractErrorText(e));
                err.type = "button";
                err.disabled = true;
                err.className = "is-off";
                fly.appendChild(err);
            });
        }
        var open = bindCtxSub(wrap, ensure);
        b.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            open();
        };
        return wrap;
    }

    var OPV_SITE_SEARCH_KEY = "anima_opv_site_search";
    function workflowBrowsers() {
        var out = { danbooru: false, gelbooru: false, known: false };
        var w = window.opener;
        if (w && !w.closed) {
            try {
                var nodes = (w.app && w.app.graph && w.app.graph._nodes) || [];
                out.known = true;
                for (var i = 0; i < nodes.length; i++) {
                    var t = nodes[i] && nodes[i].type;
                    if (t === "DanbooruBrowser") out.danbooru = true;
                    if (t === "GelbooruBrowser") out.gelbooru = true;
                }
            } catch (e0) {}
        }
        if (!out.known) {
            out.danbooru = true;
            out.gelbooru = true;
        }
        return out;
    }
    function siteSearchQuery(it) {
        var raw = (it && (it.tag || it.key)) || "";
        var k = facetNormKey(raw);
        if (!k || k === "__none__") return "";
        return k;
    }
    function sendToWorkflowSearch(site, it) {
        var q = siteSearchQuery(it);
        if (!q) {
            toast(site === "gelbooru" ? T("这张图没有角色标签") : T("这张图没有画师"));
            return;
        }
        try {
            localStorage.setItem(OPV_SITE_SEARCH_KEY, JSON.stringify({ site: site, q: q, t: Date.now() }));
        } catch (e1) {}
        var w = window.opener;
        if (w && !w.closed) {
            try {
                if (site === "danbooru") w._adexDbSearch = q;
                else w._adexGelSearch = q;
            } catch (e2) {}
            try {
                var nodes = (w.app && w.app.graph && w.app.graph._nodes) || [];
                for (var i = 0; i < nodes.length; i++) {
                    var n = nodes[i];
                    if (!n) continue;
                    if (site === "danbooru" && n.type === "DanbooruBrowser" && typeof n.__dbSearch === "function") n.__dbSearch(q);
                    if (site === "gelbooru" && n.type === "GelbooruBrowser" && typeof n.__gelSearch === "function") n.__gelSearch(q);
                }
            } catch (e3) {}
        }
        closeCtxMenu();
        toast(site === "gelbooru" ? T("已发送到G站") : T("已发送到D站"));
    }
    function makeSearchSiteRows(it) {
        var br = workflowBrowsers();
        var rows = [];
        if (br.danbooru) rows.push(ctxFlyBtn(T("去D站"), function () { sendToWorkflowSearch("danbooru", it); }));
        if (br.gelbooru) rows.push(ctxFlyBtn(T("去G站"), function () { sendToWorkflowSearch("gelbooru", it); }));
        if (!rows.length) {
            rows.push(ctxFlyBtn(T("当前工作流没有 D站或 G站浏览器"), function () {}, { disabled: true, emptyTip: T("当前工作流没有 D站或 G站浏览器") }));
        }
        return rows;
    }
    function searchOneItem(it) {
        var br = workflowBrowsers();
        var nSite = (br.danbooru ? 1 : 0) + (br.gelbooru ? 1 : 0);
        if (!nSite) {
            toast(T("当前工作流没有 D站或 G站浏览器"));
            return;
        }
        if (nSite === 1) {
            sendToWorkflowSearch(br.danbooru ? "danbooru" : "gelbooru", it);
            return;
        }
    }
    function makeSearchLeaf(label, items, emptyTip) {
        var br = workflowBrowsers();
        var nSite = (br.danbooru ? 1 : 0) + (br.gelbooru ? 1 : 0);
        if (!items.length) {
            return ctxFlyBtn(label, function () {}, { disabled: true, emptyTip: emptyTip });
        }
        if (items.length === 1 && nSite <= 1) {
            return ctxFlyBtn(label, function () { searchOneItem(items[0]); }, nSite ? {} : { disabled: true, emptyTip: T("当前工作流没有 D站或 G站浏览器") });
        }
        if (items.length === 1 && nSite > 1) {
            return makeCtxNested(label, makeSearchSiteRows(items[0]));
        }
        var rows = items.map(function (it) {
            var name = it._label || it.tag || it.key || "";
            if (nSite <= 1) return ctxFlyBtn(name, function () { searchOneItem(it); });
            return makeCtxNested(name, makeSearchSiteRows(it));
        });
        return makeCtxNested(label, rows);
    }
    function renderWorkflowSearchFly(fly, d) {
        fly.innerHTML = "";
        var arts = uniqArtistItems((d && d.artists) || []);
        var chars = uniqFacetItems((d && d.characters) || []);
        var series = uniqFacetItems((d && d.series) || []).filter(function (s) { return s.key !== "__none__"; });
        arts.forEach(function (a) { a._label = artistDisplayName(a.tag || a.key); });
        chars.forEach(function (c) { c._label = charDisplayName(c); });
        series.forEach(function (s) { s._label = seriesDisplayName(s); });
        fly.appendChild(makeSearchLeaf(T("角色"), chars, T("这张图没有角色标签")));
        fly.appendChild(makeSearchLeaf(T("系列"), series, T("这张图没有系列标签")));
        fly.appendChild(makeSearchLeaf(T("画师"), arts, T("这张图没有画师")));
    }
    function makeCtxSearchItem() {
        var wrap = el("div");
        wrap.className = "ctx-sub";
        var b = el("button");
        b.type = "button";
        b.className = "ctx-has-sub";
        b.appendChild(document.createTextNode(T("🔍 搜索")));
        var chev = el("span", "", "▸");
        chev.className = "ctx-chev";
        b.appendChild(chev);
        var fly = el("div");
        fly.className = "ctx-fly";
        wrap.appendChild(b);
        wrap.appendChild(fly);
        var loadedFor = "";
        var readyFor = "";
        function ensure() {
            var it = _ctxItem;
            if (!it) return;
            var k = itemKey(it);
            if (readyFor === k) {
                placeCtxFly(wrap);
                return;
            }
            if (loadedFor === k) {
                placeCtxFly(wrap);
                return;
            }
            loadedFor = k;
            fly.innerHTML = "";
            var wait = el("button", "", T("正在加载…"));
            wait.type = "button";
            wait.disabled = true;
            wait.className = "is-off";
            fly.appendChild(wait);
            placeCtxFly(wrap);
            fetchFileFacets(it).then(function (d) {
                if (_ctxItem !== it) return;
                renderWorkflowSearchFly(fly, d);
                readyFor = k;
                placeCtxFly(wrap);
            }).catch(function (e) {
                if (_ctxItem !== it) return;
                fly.innerHTML = "";
                var err = el("button", "", extractErrorText(e));
                err.type = "button";
                err.disabled = true;
                err.className = "is-off";
                fly.appendChild(err);
                loadedFor = "";
            });
        }
        var open = bindCtxSub(wrap, ensure);
        b.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            open();
        };
        return wrap;
    }

    function parseFavArtistList(d, src) {

        var arts = (d && d.favorites && d.favorites.artists) || {};
        var list = [];
        for (var k in arts) {
            if (k === "_order") continue;
            var rec = arts[k] || {};
            list.push({
                tag: k,
                thumb: rec.thumb || "",
                cn: rec.cn || "",
                starred: !!(rec.starred || rec.star),
                src: src || "danbooru"
            });
        }
        return list;
    }

    function pickArtistOpen() {
        var box = document.getElementById("pick-artist");
        return !!(box && !box.hidden);
    }

    function closePickArtist() {
        var box = document.getElementById("pick-artist");
        if (box) box.hidden = true;
        _pickItem = null;
        _pickBusy = false;
        _pickMode = "";
        _pickSelected = [];
        applyPickChrome();
    }

    function savePickArtistBox() {
        var bx = document.getElementById("pick-artist-box");
        if (!bx) return;
        try {
            var r = bx.getBoundingClientRect();
            if (r.width > 360 && r.height > 240) {
                localStorage.setItem(LS_PICK_ART, JSON.stringify({
                    left: Math.round(r.left),
                    top: Math.round(r.top),
                    w: Math.round(r.width),
                    h: Math.round(r.height)
                }));
            }
        } catch (e) {}
    }

    function restorePickArtistBox() {
        var bx = document.getElementById("pick-artist-box");
        if (!bx) return;
        try {
            var st = JSON.parse(localStorage.getItem(LS_PICK_ART) || "null");
            if (!st) return;
            if (st.w > 360) bx.style.width = Math.min(st.w, window.innerWidth - 24) + "px";
            if (st.h > 240) bx.style.height = Math.min(st.h, window.innerHeight - 24) + "px";
            if (st.left != null) bx.style.left = st.left + "px";
            if (st.top != null) bx.style.top = st.top + "px";
            if (typeof window.clampPopup === "function") window.clampPopup(bx);
        } catch (e2) {}
    }

    function mergePickArtists(dList, gList) {
        var byKey = {};
        var out = [];
        function add(it, src) {
            var key = artistNormKey(it.tag);
            if (!key) return;
            var hit = byKey[key];
            if (!hit) {
                hit = {
                    key: key,
                    tag: it.tag,
                    name: artistDisplayName(it.tag),
                    cn: it.cn || "",
                    thumb: it.thumb || "",
                    starred: !!it.starred,
                    rating: artistRateNum(it.rating),
                    src: src
                };
                byKey[key] = hit;
                out.push(hit);
                return;
            }
            if (it.starred) hit.starred = true;
            hit.rating = Math.max(artistRateNum(hit.rating), artistRateNum(it.rating));
            if (!hit.thumb && it.thumb) hit.thumb = it.thumb;
            if (!hit.cn && it.cn) hit.cn = it.cn;
        }
        (dList || []).forEach(function (it) { add(it, "danbooru"); });
        (gList || []).forEach(function (it) { add(it, "gelbooru"); });
        var idx = state.artistIndex;
        if (idx && idx.artists) {
            idx.artists.forEach(function (a) {
                if (!a || !a.key) return;
                if (byKey[a.key]) return;
                var name = artistDisplayName(a.tag || a.key);
                var rec = {
                    key: a.key,
                    tag: a.tag || a.key,
                    name: name,
                    cn: "",
                    thumb: "",
                    starred: false,
                    rating: 0,
                    src: "folder"
                };
                byKey[a.key] = rec;
                out.push(rec);
            });
        }
        out.sort(function (a, b) {
            if (!!a.starred !== !!b.starred) return a.starred ? -1 : 1;
            if (a.starred) {
                var ra = artistRateNum(a.rating), rb = artistRateNum(b.rating);
                if (ra !== rb) return rb - ra;
            }
            if ((a.src === "folder") !== (b.src === "folder")) return a.src === "folder" ? 1 : -1;
            return String(a.name || "").localeCompare(String(b.name || ""));
        });
        return out;
    }

    function usedScopeKey() {
        return String(state.subfolder || "") + "\0" + (_pickDeep ? "1" : "0");
    }
    function asKeySet(arr) {
        var o = {};
        (arr || []).forEach(function (k) {
            var key = artistNormKey(k);
            if (key) o[key] = 1;
        });
        return o;
    }
    function pickSelIndex(key) {
        for (var i = 0; i < _pickSelected.length; i++) {
            if (_pickSelected[i] && _pickSelected[i].key === key) return i;
        }
        return -1;
    }
    function persistPickFilters() {
        try {
            localStorage.setItem(LS_PICK_UNUSED, _pickUnused);
            localStorage.setItem(LS_PICK_DEEP, _pickDeep ? "1" : "0");
        } catch (e) {}
    }
    function applyPickChrome() {
        var box = document.getElementById("pick-artist-box");
        if (box) box.classList.toggle("is-multi", pickMultiOn());
        var filters = document.getElementById("pick-artist-filters");
        if (filters) {
            var unusedBtns = filters.querySelectorAll("[data-unused]");
            for (var i = 0; i < unusedBtns.length; i++) {
                unusedBtns[i].classList.toggle("is-on", unusedBtns[i].getAttribute("data-unused") === _pickUnused);
            }
            var deepBtns = filters.querySelectorAll("[data-deep]");
            for (var j = 0; j < deepBtns.length; j++) {
                var on = (deepBtns[j].getAttribute("data-deep") === "1") === !!_pickDeep;
                deepBtns[j].classList.toggle("is-on", on && _pickUnused !== "off");
                deepBtns[j].disabled = _pickUnused === "off";
            }
        }
        var chainBtn = document.getElementById("pick-mode-chain");
        if (chainBtn) {
            chainBtn.classList.toggle("is-on", _pickMode === "chain");
            chainBtn.setAttribute("aria-pressed", _pickMode === "chain" ? "true" : "false");
            chainBtn.textContent = T("画师串模式");
            chainBtn.title = T("多选后合成一条画师串，生成一张图");
        }
        var soloBtn = document.getElementById("pick-mode-solo");
        if (soloBtn) {
            soloBtn.classList.toggle("is-on", _pickMode === "solo");
            soloBtn.setAttribute("aria-pressed", _pickMode === "solo" ? "true" : "false");
            soloBtn.textContent = T("单画师多选");
            soloBtn.title = T("多选后每位画师各生成一张图");
        }
        var foot = document.getElementById("pick-artist-foot");
        if (foot) foot.hidden = !pickMultiOn();
        var lab = document.getElementById("pick-sel-lab");
        if (lab) {
            if (!_pickSelected.length) {
                lab.textContent = _pickMode === "solo"
                    ? T("点选画师，每位各生成一张单画师图")
                    : T("点选画师，按点击顺序组成画师串");
            } else {
                var names = _pickSelected.map(function (it) { return artistDisplayName(it.tag || it.name || ""); });
                if (_pickMode === "solo") {
                    lab.textContent = T("已选") + " " + names.length + " · " + T("每位各出一张") + " · " + names.join("、");
                } else {
                    lab.textContent = T("已选") + " " + names.length + " · " + names.join(" + ");
                }
            }
        }
        var go = document.getElementById("pick-sel-go");
        if (go) {
            go.disabled = !_pickSelected.length || !!_pickBusy;
            if (_pickMode === "solo") {
                go.textContent = _pickSelected.length
                    ? (T("生成单画师图") + " · " + _pickSelected.length)
                    : T("生成单画师图");
            } else {
                go.textContent = T("生成画师串");
            }
        }
        var fill = document.getElementById("pick-sel-fill");
        if (fill) {
            fill.hidden = _pickMode !== "solo";
            fill.textContent = T("选前100个");
        }
        var clr = document.getElementById("pick-sel-clear");
        if (clr) clr.textContent = T("清空");
        var off = document.getElementById("pick-unused-off");
        if (off) off.textContent = T("关");
        var never = document.getElementById("pick-unused-never");
        if (never) never.textContent = T("从未出现");
        var solo = document.getElementById("pick-unused-solo");
        if (solo) solo.textContent = T("未单独出现");
        var here = document.getElementById("pick-scope-here");
        if (here) here.textContent = T("当前文件夹");
        var deep = document.getElementById("pick-scope-deep");
        if (deep) deep.textContent = T("含子文件夹");
        var unusedLab = document.getElementById("pick-unused-lab");
        if (unusedLab) unusedLab.textContent = T("未用过收藏");
        var scopeLab = document.getElementById("pick-scope-lab");
        if (scopeLab) scopeLab.textContent = T("范围");
    }
    function setPickUnused(mode) {
        _pickUnused = (mode === "never" || mode === "solo") ? mode : "off";
        persistPickFilters();
        applyPickChrome();
        if (_pickUnused === "off") {
            renderPickArtistGrid();
            return;
        }
        ensureUsedArtists().then(function () { renderPickArtistGrid(); });
    }
    function setPickDeep(deep) {
        if (_pickUnused === "off") return;
        _pickDeep = !!deep;
        persistPickFilters();
        _usedArt.ready = false;
        applyPickChrome();
        ensureUsedArtists().then(function () { renderPickArtistGrid(); });
    }
    function pickMultiOn() {
        return _pickMode === "chain" || _pickMode === "solo";
    }
    function setPickMode(mode) {
        if (mode !== "chain" && mode !== "solo") mode = "";
        if (_pickMode === mode) mode = "";
        _pickMode = mode;
        if (!pickMultiOn()) _pickSelected = [];
        applyPickChrome();
        syncPickSelMarks();
    }
    function togglePickSel(it) {
        if (!it || !it.key) return;
        var idx = pickSelIndex(it.key);
        if (idx >= 0) _pickSelected.splice(idx, 1);
        else {
            var cap = _pickMode === "solo" ? PICK_SOLO_MAX : PICK_CHAIN_MAX;
            if (_pickSelected.length >= cap) {
                toast(_pickMode === "solo" ? T("一次最多选 100 个画师") : T("画师串最多 8 个"));
                return;
            }
            _pickSelected.push(it);
        }
        applyPickChrome();
        syncPickSelMarks();
    }
    function mergedUsedSet(kind) {
        var base = kind === "solo" ? (_usedArt.solo || {}) : (_usedArt.all || {});
        var pend = kind === "solo" ? (_usedArtPending.solo || {}) : (_usedArtPending.all || {});
        var o = {};
        var k;
        for (k in base) if (base[k]) o[k] = 1;
        for (k in pend) if (pend[k]) o[k] = 1;
        return o;
    }
    function markArtistsUsed(tags, asSolo) {
        (tags || []).forEach(function (tag) {
            var k = artistNormKey(tag);
            if (!k) return;
            _usedArtPending.all[k] = 1;
            if (asSolo) _usedArtPending.solo[k] = 1;
        });
    }
    function absorbUsedPending() {
        var k;
        for (k in (_usedArt.all || {})) {
            if (_usedArtPending.all[k]) delete _usedArtPending.all[k];
        }
        for (k in (_usedArt.solo || {})) {
            if (_usedArtPending.solo[k]) delete _usedArtPending.solo[k];
        }
    }
    function syncPickSelMarks() {
        var grid = document.getElementById("pick-artist-grid");
        if (!grid) return;
        var cards = grid.querySelectorAll(".pick-art-card");
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            var key = card.getAttribute("data-key") || "";
            var sel = pickSelIndex(key);
            card.classList.toggle("is-on", sel >= 0);
            var pic = card.querySelector(".pic");
            var ord = card.querySelector(".ord");
            if (sel >= 0) {
                if (!ord && pic) {
                    ord = el("span", "", String(sel + 1));
                    ord.className = "ord";
                    pic.appendChild(ord);
                } else if (ord) {
                    ord.textContent = String(sel + 1);
                }
            } else if (ord) {
                ord.remove();
            }
        }
    }
    function prunePickSelectionByFilter() {
        if (_pickUnused === "off" || !_pickSelected.length) return false;
        var used = mergedUsedSet(_pickUnused === "solo" ? "solo" : "all");
        var next = [];
        var dirty = false;
        for (var i = 0; i < _pickSelected.length; i++) {
            var it = _pickSelected[i];
            if (!it || !it.key || used[it.key]) {
                dirty = true;
                continue;
            }
            next.push(it);
        }
        if (!dirty) return false;
        _pickSelected = next;
        return true;
    }
    function prunePickGridByUsed() {
        if (_pickUnused === "off") return false;
        var used = mergedUsedSet(_pickUnused === "solo" ? "solo" : "all");
        var grid = document.getElementById("pick-artist-grid");
        if (!grid) return false;
        var cards = grid.querySelectorAll(".pick-art-card");
        var removed = 0;
        for (var i = 0; i < cards.length; i++) {
            var key = cards[i].getAttribute("data-key") || "";
            if (key && used[key]) {
                cards[i].remove();
                removed++;
            }
        }
        var selDirty = prunePickSelectionByFilter();
        if (removed && !grid.querySelector(".pick-art-card")) {
            renderPickArtistGrid();
            return true;
        }
        if (removed || selDirty) {
            applyPickChrome();
            syncPickSelMarks();
        }
        return !!removed;
    }
    function refreshUsedArtists() {
        if (_pickUnused === "off") {
            _usedArt.ready = false;
            return Promise.resolve();
        }
        if (!pickArtistOpen()) {
            _usedArt.ready = false;
            return Promise.resolve();
        }
        return ensureUsedArtists({ force: true, silent: true }).then(function () {
            absorbUsedPending();
            prunePickGridByUsed();
        });
    }
    function afterPickQueued(tags, asSolo) {
        markArtistsUsed(tags, asSolo);
        if (_pickUnused !== "off") prunePickGridByUsed();
    }
    function ensureUsedArtists(opts) {
        opts = opts || {};
        if (_pickUnused === "off") return Promise.resolve();
        var key = usedScopeKey();
        if (!opts.force && _usedArt.key === key && _usedArt.ready) return Promise.resolve();
        var gen = ++_usedGen;
        _usedArt.loading = true;
        _usedArt.ready = false;
        _usedArt.key = key;
        if (!opts.silent) {
            _usedArt.all = {};
            _usedArt.solo = {};
            _usedArt.error = "";
        }
        var q = "subfolder=" + encodeURIComponent(state.subfolder || "") + "&deep=" + (_pickDeep ? "1" : "0");
        return fetch("/danbooru_anima/output_prompt/used_artists?" + q).then(function (r) {
            if (!r.ok) throw new Error(r.status === 404 ? "need_restart" : String(r.status));
            return r.json();
        }).then(function (d) {
            if (gen !== _usedGen) return;
            if (!d || d.ok === false) throw new Error((d && d.error) || T("加载失败"));
            _usedArt = {
                key: key,
                ready: true,
                loading: false,
                error: "",
                all: asKeySet(d.all_keys),
                solo: asKeySet(d.solo_keys)
            };
            absorbUsedPending();
        }).catch(function (e) {
            if (gen !== _usedGen) return;
            _usedArt.loading = false;
            _usedArt.ready = false;
            _usedArt.error = String(e && e.message === "need_restart" ? T("请先重启 ComfyUI，再打开本页") : ((e && e.message) || e || T("加载失败")));
        });
    }

    function loadPickArtistLists() {
        var gen = ++_pickGen;
        var jobs = [
            fetch("/danbooru_anima/favorites?cats=artists").then(function (r) { return r.json(); }).catch(function () { return {}; }),
            fetch("/gelbooru_anima/favorites?cats=artists").then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
        ];
        if (window.animaFavGrid && typeof window.animaFavGrid.loadThumbMap === "function") jobs.push(window.animaFavGrid.loadThumbMap());
        return Promise.all(jobs).then(function (pair) {
            if (gen !== _pickGen) return;
            var dList = parseFavArtistList(pair[0], "danbooru");
            var gList = parseFavArtistList(pair[1], "gelbooru");
            if (dList.length) _favArtCache = dList.map(function (x) {
                return { tag: x.tag, thumb: x.thumb, cn: x.cn, starred: x.starred };
            });
            _pickList = mergePickArtists(dList, gList);
            var tabs = document.getElementById("pick-artist-tabs");
            if (tabs) tabs.hidden = !(dList.length && gList.length);
            renderPickArtistGrid();
        }).catch(function () {
            if (gen !== _pickGen) return;
            _pickList = mergePickArtists(_favArtCache || [], []);
            renderPickArtistGrid();
        });
    }

    function pickQuery() {
        var inp = document.getElementById("pick-artist-q");
        return inp ? String(inp.value || "").trim().toLowerCase() : "";
    }

    function visiblePickRows() {
        var q = pickQuery();
        var src = _pickSrc || "all";
        var used = mergedUsedSet(_pickUnused === "solo" ? "solo" : "all");
        var rows = (_pickList || []).filter(function (it) {
            if (src === "danbooru" && it.src === "gelbooru") return false;
            if (src === "gelbooru" && it.src !== "gelbooru") return false;
            if (_pickUnused !== "off") {
                if (it.src === "folder") return false;
                if (used && used[it.key]) return false;
            }
            if (!q) return true;
            var blob = ((it.name || "") + " " + (it.tag || "") + " " + (it.cn || "") + " " + (it.key || "")).toLowerCase();
            return blob.indexOf(q) >= 0;
        });
        if (q && window.animaFuzzyCmp) {
            rows.sort(function (a, b) {
                return window.animaFuzzyCmp(q, { tag: a.tag || a.key || a.name, cn: a.cn }, { tag: b.tag || b.key || b.name, cn: b.cn });
            });
        }
        return rows;
    }

    function fillFirstVisibleSolo() {
        if (_pickMode !== "solo") return;
        if (_pickUnused !== "off" && _usedArt.loading && !_usedArt.ready) {
            toast(T("正在统计已用画师…"));
            return;
        }
        var rows = visiblePickRows();
        var next = [];
        var seen = {};
        for (var i = 0; i < rows.length && next.length < PICK_SOLO_MAX; i++) {
            var it = rows[i];
            var key = it && it.key;
            if (!key || seen[key]) continue;
            seen[key] = 1;
            next.push(it);
        }
        if (!next.length) {
            toast(T("当前列表没有可选手"));
            return;
        }
        _pickSelected = next;
        applyPickChrome();
        syncPickSelMarks();
        toast(T("已选") + " " + next.length + " " + T("个画师"));
    }

    function renderPickArtistGrid() {
        var grid = document.getElementById("pick-artist-grid");
        if (!grid) return;
        grid.innerHTML = "";
        if (_pickUnused !== "off" && _usedArt.loading && !_usedArt.ready) {
            var wait = el("div", "", T("正在统计已用画师…"));
            wait.className = "pick-artist-empty";
            grid.appendChild(wait);
            return;
        }
        if (_pickUnused !== "off" && _usedArt.error) {
            var err = el("div", "", _usedArt.error);
            err.className = "pick-artist-empty";
            grid.appendChild(err);
            return;
        }
        var rows = visiblePickRows();
        if (!rows.length) {
            var emptyTxt = T("还没有收藏画师");
            if (pickQuery()) emptyTxt = T("无结果");
            else if (_pickUnused !== "off") emptyTxt = T("没有未用过的收藏画师");
            var empty = el("div", "", emptyTxt);
            empty.className = "pick-artist-empty";
            grid.appendChild(empty);
            return;
        }
        rows.forEach(function (it) {
            grid.appendChild(makePickArtCard(it));
        });
        fillPickMissingThumbs(grid);
    }

    function makePickArtCard(it) {
        var b = el("button");
        b.type = "button";
        b.className = "pick-art-card";
        b.title = it.name || it.tag || "";
        var pic = el("div");
        pic.className = "pic";
        var img = document.createElement("img");
        img.alt = it.name || "";
        img.loading = "lazy";
        img.decoding = "async";
        var thumbRaw = it.thumb || "";
        var srcKind = it.src === "gelbooru" ? "gelbooru" : favThumbSource(thumbRaw);
        if (liveModeOn()) {
            if (liveFavThumb(it.tag || it.name)) bindFavThumb(img, "", it.tag || it.name);
            else img.hidden = true;
        } else {
            var hasLoc = !!localFavThumb(it.tag || it.name);
            if (thumbRaw || hasLoc) {
                bindFavThumb(img, thumbRaw, it.tag || it.name, srcKind);
            } else {
                img.hidden = true;
                b.setAttribute("data-need-thumb", "1");
                b.setAttribute("data-q", it.name || it.tag || "");
            }
        }
        pic.appendChild(img);
        if (it.starred) {
            var star = el("span", "", "★");
            star.className = "star";
            pic.appendChild(star);
        }
        b.appendChild(pic);
        var nm = el("span", "", it.name || it.tag || "");
        nm.className = "nm";
        b.appendChild(nm);
        if (it.cn) {
            var cn = el("span", "", it.cn);
            cn.className = "cn";
            b.appendChild(cn);
        }
        var sel = pickSelIndex(it.key);
        if (sel >= 0) {
            b.classList.add("is-on");
            var ord = el("span", "", String(sel + 1));
            ord.className = "ord";
            pic.appendChild(ord);
        }
        b.setAttribute("data-key", it.key || "");
        b.onclick = function () {
            if (pickMultiOn()) togglePickSel(it);
            else queueSameArtist([it]);
        };
        return b;
    }

    function fillPickMissingThumbs(box) {
        var gen = _pickGen;
        var nodes = box.querySelectorAll(".pick-art-card[data-need-thumb]");
        for (var i = 0; i < nodes.length; i++) {
            (function (card) {
                var q = card.getAttribute("data-q") || "";
                var key = card.getAttribute("data-key") || q;
                var img = card.querySelector("img");
                if (!q || !img) return;
                if (liveModeOn()) {
                    if (liveFavThumb(key) || liveFavThumb(q)) {
                        bindFavThumb(img, "", key || q);
                        card.removeAttribute("data-need-thumb");
                    }
                    return;
                }
                if (localFavThumb(key) || localFavThumb(q)) {
                    bindFavThumb(img, "", key || q);
                    card.removeAttribute("data-need-thumb");
                    return;
                }
                loadAdexArtist(q).then(function (hit) {
                    if (gen !== _pickGen) return;
                    var raw = hit && hit.thumb ? hit.thumb : "";
                    if (!raw) return;
                    bindFavThumb(img, raw, q, favThumbSource(raw));
                    card.removeAttribute("data-need-thumb");
                });
            })(nodes[i]);
        }
    }

    function openPickArtist(item) {
        if (!item) { toast(T("请选择一张图片")); return; }
        hidePeek();
        _pickItem = item;
        if (itemKey(state.sel) !== itemKey(item)) selectItem(item, true);
        var wrap = document.getElementById("pick-artist");
        var sub = document.getElementById("pick-artist-sub");
        if (sub) {
            var name = item.filename || "";
            sub.textContent = T("将替换这张图里的全部画师标签，其余参数保持不变。") + (name ? "  ·  " + name : "");
        }
        var q = document.getElementById("pick-artist-q");
        if (q) q.value = "";
        _pickSrc = "all";
        _pickMode = "";
        _pickSelected = [];
        applyPickChrome();
        var tabs = document.getElementById("pick-artist-tabs");
        if (tabs) {
            var btns = tabs.querySelectorAll("button");
            for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("is-on", btns[i].getAttribute("data-src") === "all");
        }
        restorePickArtistBox();
        if (wrap) wrap.hidden = false;
        if (typeof window.clampPopup === "function") window.clampPopup(document.getElementById("pick-artist-box"));
        var grid = document.getElementById("pick-artist-grid");
        if (grid) grid.innerHTML = '<div class="pick-artist-empty">' + T("加载中...") + "</div>";
        var jobs = [loadPickArtistLists()];
        if (_pickUnused !== "off") jobs.push(ensureUsedArtists());
        Promise.all(jobs).then(function () { renderPickArtistGrid(); });
        if (q) setTimeout(function () { try { q.focus(); } catch (e3) {} }, 40);
    }

    function collectPickTags(arts) {
        var list = Array.isArray(arts) ? arts : (arts ? [arts] : []);
        var tags = [];
        var shown = [];
        var seen = {};
        for (var i = 0; i < list.length; i++) {
            var tag = (list[i] && (list[i].tag || list[i].name)) || "";
            var key = artistNormKey(tag);
            if (!tag || !key || seen[key]) continue;
            seen[key] = 1;
            tags.push(tag);
            shown.push(artistDisplayName(tag));
        }
        return { tags: tags, shown: shown };
    }
    function setPickBusy(on) {
        _pickBusy = !!on;
        applyPickChrome();
        var box = document.getElementById("pick-artist-box");
        if (box) box.classList.toggle("is-queue", _pickBusy);
    }
    function pickQueueError(e) {
        return String(e && e.message === "need_restart" ? T("请先重启 ComfyUI，再打开本页") : ((e && e.message) || e || T("生成失败")));
    }
    function toastPickQueued(d, shown) {
        var remain = Number((d && d.queue_remaining) || 0);
        if (remain > 1) toast(T("已加入队列") + " · " + shown + " · " + T("前面还有任务，将排队执行"), 3600);
        else toast(T("已开始生成") + " · " + shown, 2800);
    }
    function postSameArtistJob(item, tags) {
        var clientId = "";
        try { clientId = "anima-opv-" + Math.random().toString(36).slice(2); } catch (e4) { clientId = "anima-opv"; }
        return fetch("/danbooru_anima/output_prompt/queue_same_artist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filename: item.filename || "",
                subfolder: item.subfolder || "",
                artist: tags.join(", "),
                artists: tags,
                client_id: clientId
            })
        }).then(function (r) {
            if (!r.ok) throw new Error((r.status === 404 || r.status === 405) ? "need_restart" : String(r.status));
            return r.json();
        });
    }
    function clearPickSelection() {
        if (!_pickSelected.length) return;
        _pickSelected = [];
        applyPickChrome();
        syncPickSelMarks();
    }
    function queueSameArtist(arts) {
        var item = _pickItem || state.sel;
        if (!item) { toast(T("请选择一张图片")); return; }
        var pack = collectPickTags(arts && arts.length ? arts : _pickSelected.slice());
        if (!pack.tags.length) { toast(T("请选择画师")); return; }
        if (_pickBusy) return;
        setPickBusy(true);
        toast(T("正在提交生成任务…"), 2200);
        var shown = pack.shown.join(" + ");
        postSameArtistJob(item, pack.tags).then(function (d) {
            setPickBusy(false);
            if (!d || !d.ok) {
                toast((d && d.error) || T("生成失败"), 3200);
                return;
            }
            afterPickQueued(pack.tags, pack.tags.length === 1);
            if (pickMultiOn()) clearPickSelection();
            toastPickQueued(d, shown);
        }).catch(function (e) {
            setPickBusy(false);
            toast(pickQueueError(e), 3200);
        });
    }
    function queueSoloArtistJobs(arts) {
        var item = _pickItem || state.sel;
        if (!item) { toast(T("请选择一张图片")); return; }
        var list = Array.isArray(arts) ? arts.slice() : [];
        var jobs = [];
        var seen = {};
        for (var i = 0; i < list.length; i++) {
            var pack = collectPickTags([list[i]]);
            if (!pack.tags.length || seen[pack.tags[0]]) continue;
            seen[pack.tags[0]] = 1;
            jobs.push(pack);
        }
        if (!jobs.length) { toast(T("请选择画师")); return; }
        if (_pickBusy) return;
        setPickBusy(true);
        var idx = 0;
        var okN = 0;
        var failN = 0;
        var lastOk = null;
        var failMsg = "";
        function next() {
            if (idx >= jobs.length) {
                setPickBusy(false);
                if (okN) clearPickSelection();
                if (okN && !failN) toastPickQueued(lastOk, String(okN) + " " + T("张单画师图"));
                else if (okN && failN) toast(T("已加入队列") + " " + okN + " · " + T("部分任务提交失败") + (failMsg ? " · " + failMsg : ""), 4200);
                else toast(failMsg || T("生成失败"), 3200);
                return;
            }
            var cur = jobs[idx];
            idx++;
            toast(T("正在提交") + " " + idx + "/" + jobs.length + "…", 1800);
            postSameArtistJob(item, cur.tags).then(function (d) {
                if (!d || !d.ok) {
                    failN++;
                    failMsg = (d && d.error) || T("生成失败");
                } else {
                    okN++;
                    lastOk = d;
                    afterPickQueued(cur.tags, true);
                }
                next();
            }).catch(function (e) {
                failN++;
                failMsg = pickQueueError(e);
                next();
            });
        }
        next();
    }

    function bindPickArtist() {
        var closeBtn = document.getElementById("pick-artist-close");
        if (closeBtn) closeBtn.onclick = closePickArtist;
        var q = document.getElementById("pick-artist-q");
        if (q) {
            q.placeholder = T("搜索画师");
            ["input", "keyup", "search", "change"].forEach(function (ev) {
                q.addEventListener(ev, function () { renderPickArtistGrid(); });
            });
            q.addEventListener("keydown", function (e) {
                if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    closePickArtist();
                }
            });
        }
        var tabs = document.getElementById("pick-artist-tabs");
        if (tabs) {
            tabs.addEventListener("click", function (e) {
                var btn = e.target && e.target.closest ? e.target.closest("button") : null;
                if (!btn) return;
                var src = btn.getAttribute("data-src") || "all";
                _pickSrc = src;
                var btns = tabs.querySelectorAll("button");
                for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("is-on", btns[i] === btn);
                renderPickArtistGrid();
            });
        }
        var filters = document.getElementById("pick-artist-filters");
        if (filters) {
            filters.addEventListener("click", function (e) {
                var btn = e.target && e.target.closest ? e.target.closest("button") : null;
                if (!btn || btn.disabled) return;
                if (btn.hasAttribute("data-unused")) {
                    setPickUnused(btn.getAttribute("data-unused") || "off");
                    return;
                }
                if (btn.hasAttribute("data-deep")) {
                    setPickDeep(btn.getAttribute("data-deep") === "1");
                }
            });
        }
        var chainBtn = document.getElementById("pick-mode-chain");
        if (chainBtn) chainBtn.onclick = function () { setPickMode("chain"); };
        var soloBtn = document.getElementById("pick-mode-solo");
        if (soloBtn) soloBtn.onclick = function () { setPickMode("solo"); };
        var go = document.getElementById("pick-sel-go");
        if (go) {
            go.onclick = function () {
                if (_pickMode === "solo") queueSoloArtistJobs(_pickSelected.slice());
                else queueSameArtist(_pickSelected.slice());
            };
        }
        var fillBtn = document.getElementById("pick-sel-fill");
        if (fillBtn) fillBtn.onclick = fillFirstVisibleSolo;
        var clr = document.getElementById("pick-sel-clear");
        if (clr) {
            clr.onclick = function () {
                _pickSelected = [];
                applyPickChrome();
                syncPickSelMarks();
            };
        }
        applyPickChrome();
        var bx = document.getElementById("pick-artist-box");
        var hd = document.getElementById("pick-artist-hd");
        if (bx && hd) {
            var drag = false, dx = 0, dy = 0;
            hd.addEventListener("mousedown", function (e) {
                if (e.button !== 0) return;
                if (e.target && (e.target.id === "pick-artist-close" || (e.target.closest && e.target.closest("button")))) return;
                drag = true;
                var r = bx.getBoundingClientRect();
                dx = e.clientX - r.left;
                dy = e.clientY - r.top;
                hd.style.cursor = "grabbing";
                e.preventDefault();
            });
            document.addEventListener("mousemove", function (e) {
                if (!drag) return;
                bx.style.left = (e.clientX - dx) + "px";
                bx.style.top = (e.clientY - dy) + "px";
                bx.style.right = "auto";
            });
            document.addEventListener("mouseup", function () {
                if (!drag) return;
                drag = false;
                hd.style.cursor = "grab";
                if (typeof window.clampPopup === "function") window.clampPopup(bx);
                savePickArtistBox();
            });
            bx.addEventListener("mouseup", function () { savePickArtistBox(); });
            bindPlainEdges(bx, savePickArtistBox, 420, 320);
        }
    }

    function comboArtistName(tag) {
        var raw = String(tag || "").trim();
        if (!raw) return "";
        var p = window.animaParseWeightTag ? window.animaParseWeightTag(raw) : { tag: raw };
        var inner = String((p && p.tag) || raw).trim();
        return inner.replace(/^@+/, "").replace(/^artist:/i, "").trim();
    }

    function comboArtistList(list) {
        var out = [];
        var seen = {};
        (list || []).forEach(function (t) {
            var name = comboArtistName(t);
            if (!name) return;
            var key = artistNormKey(name);
            if (!key || seen[key]) return;
            seen[key] = 1;
            out.push(name);
        });
        return out;
    }

    function readLocalCombos() {
        var combos = [];
        try { combos = JSON.parse(localStorage.getItem("danbooru_artist_combos") || "[]"); } catch (e0) { combos = []; }
        if (!Array.isArray(combos)) combos = [];
        return combos;
    }

    function mergeComboLists(local, server) {
        var out = (local || []).slice();
        var names = {};
        out.forEach(function (c) { if (c && c.name) names[c.name] = true; });
        (server || []).forEach(function (c) {
            if (c && c.name && !names[c.name]) {
                out.push(c);
                names[c.name] = true;
            }
        });
        return out;
    }

    function loadArtistCombos() {
        var local = readLocalCombos();
        return fetch("/danbooru_anima/load_userdata").then(function (r) { return r.json(); }).then(function (d) {
            var server = (d && d.success && d.data && Array.isArray(d.data.danbooru_artist_combos)) ? d.data.danbooru_artist_combos : [];
            return mergeComboLists(local, server);
        }).catch(function () { return local; });
    }

    function saveArtistCombos(combos) {
        try { localStorage.setItem("danbooru_artist_combos", JSON.stringify(combos)); }
        catch (e1) { return Promise.reject(e1); }
        return fetch("/danbooru_anima/save_userdata", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ danbooru_artist_combos: combos })
        }).then(function (r) { return r.json(); }).catch(function () { return { success: true }; });
    }

    function comboSig(list) {
        var keys = [];
        var seen = {};
        (list || []).forEach(function (t) {
            var k = artistNormKey(t);
            if (!k || seen[k]) return;
            seen[k] = 1;
            keys.push(k);
        });
        keys.sort();
        return keys.join("\0");
    }

    function combosForArtists(combos, artists) {
        var sig = comboSig(artists);
        if (!sig) return [];
        var hits = (combos || []).filter(function (c) { return c && comboSig(c.artists || []) === sig; });
        var prefer = String(state.comboName || "").trim();
        if (!prefer) return hits;
        var named = hits.filter(function (c) { return String(c.name || "") === prefer; });
        return named.length ? named : hits;
    }

    function copyComboThumb(it) {
        if (!it || !it.filename) return Promise.reject(new Error("no file"));
        return fetch("/danbooru_anima/combo_thumb/copy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: it.filename, subfolder: it.subfolder || "" })
        }).then(function (r) { return r.json(); }).then(function (d) {
            if (!d || !d.success || !d.url) throw new Error((d && d.error) || "copy failed");
            return d.url;
        });
    }

    function assignComboThumb(combo, it) {
        closeCtxMenu();
        if (!combo || !it || !it.filename) { toast(T("没有可设为缩略图的图片")); return Promise.resolve(false); }
        var sig = comboSig(combo.artists || []);
        var name = String(combo.name || "");
        return copyComboThumb(it).then(function (url) {
            return loadArtistCombos().then(function (combos) {
                var hit = null;
                var i;
                for (i = 0; i < combos.length; i++) {
                    var c = combos[i];
                    if (c && String(c.name || "") === name && comboSig(c.artists || []) === sig) { hit = c; break; }
                }
                if (!hit) {
                    for (i = 0; i < combos.length; i++) {
                        if (combos[i] && comboSig(combos[i].artists || []) === sig) { hit = combos[i]; break; }
                    }
                }
                if (!hit) { toast(T("没有对应的画师组合")); return false; }
                hit.thumbs = [url];
                return saveArtistCombos(combos).then(function () {
                    toast(T("已设为画师组合缩略图"));
                    return true;
                });
            });
        }).catch(function () { toast(T("保存失败")); return false; });
    }

    function comboThumbChoices(it) {
        var filterArts = artistKeyList(state.artistKey);
        if (filterArts.length) {
            return loadArtistCombos().then(function (combos) {
                return { rows: combosForArtists(combos, filterArts), empty: T("当前筛选没有对应的画师组合") };
            });
        }
        return fetchExtract(it).then(function (d) {
            return loadArtistCombos().then(function (combos) {
                return { rows: combosForArtists(combos, (d && d.artists) || []), empty: T("这张图没有对应的画师组合") };
            });
        });
    }

    function openComboSave(it) {
        if (!it) { toast(T("请选择一张图片")); return; }
        closeCtxMenu();
        hidePeek();
        var mask = document.getElementById("fav-save");
        if (!mask) return;
        fetchExtract(it).then(function (d) {
            var arts = comboArtistList((d && d.artists) || []);
            if (!arts.length) { toast(T("这张图没有画师")); return; }
            var defName = arts.slice(0, 3).join(" + ");
            closeFavSave();
            mask.innerHTML = "";
            var box = el("div");
            box.className = "fav-box";
            box.appendChild(el("h2", "", T("保存画师组合")));
            var hint = el("p", "", T("组合名称（不影响实际输出标签）"));
            hint.className = "combo-hint";
            box.appendChild(hint);
            var prev = document.createElement("img");
            prev.className = "fav-preview";
            prev.src = it.url || "";
            prev.alt = it.filename || "";
            box.appendChild(prev);
            var preview = el("div", "", arts.join(" + "));
            preview.className = "combo-artists";
            box.appendChild(preview);
            var inp = document.createElement("input");
            inp.type = "text";
            inp.className = "combo-name";
            inp.value = defName;
            inp.placeholder = T("组合名称");
            box.appendChild(inp);
            var btns = el("div");
            btns.className = "fav-btns";
            var cancel = el("button", "", T("取消"));
            cancel.type = "button";
            cancel.className = "act";
            cancel.onclick = closeFavSave;
            var ok = el("button", "", T("保存"));
            ok.type = "button";
            ok.className = "act primary";
            ok.onclick = function () {
                var name = (inp.value || "").trim() || defName;
                ok.disabled = true;
                copyComboThumb(it).then(function (url) {
                    return loadArtistCombos().then(function (combos) {
                        combos.push({ name: name, artists: arts.slice(), thumbs: [url] });
                        return saveArtistCombos(combos);
                    });
                }).then(function () {
                    closeFavSave();
                    toast(T("已保存画师组合"));
                }).catch(function () {
                    toast(T("保存失败"));
                    ok.disabled = false;
                });
            };
            inp.onkeydown = function (e) {
                if (e.key === "Enter") { e.preventDefault(); ok.click(); }
                else if (e.key === "Escape") { closeFavSave(); }
            };
            btns.appendChild(cancel);
            btns.appendChild(ok);
            box.appendChild(btns);
            mask.appendChild(box);
            mask.hidden = false;
            mask.onclick = function (e) { if (e.target === mask) closeFavSave(); };
            setTimeout(function () { try { inp.focus(); inp.select(); } catch (e2) {} }, 0);
        }).catch(function (e) {
            toast(extractErrorText(e));
        });
    }

    function assignLiveThumb(tag, it) {
        closeCtxMenu();
        if (!tag || !it) return Promise.resolve(false);
        return fetch("/danbooru_anima/live_thumbs/assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tag: tag, filename: it.filename, subfolder: it.subfolder || "" })
        }).then(function (r) { return r.json(); }).then(function (d) {
            if (!d || !d.success) { toast((d && d.error) || T("指定失败")); return false; }
            toast(T("已设为AI缩略图"));
            var g = window.animaFavGrid;
            var done = (g && typeof g.loadLiveMap === "function") ? g.loadLiveMap(true) : Promise.resolve();
            return done.then(function () {
                if (g && typeof g.refreshImgs === "function") {
                    var grids = document.querySelectorAll(".fav-art-grid, .anima-fav-grid");
                    for (var gi = 0; gi < grids.length; gi++) g.refreshImgs(grids[gi]);
                }
                try { window.dispatchEvent(new CustomEvent("anima-live-mode")); } catch (e3) {}
                return true;
            });
        }).catch(function () { toast(T("指定失败")); return false; });
    }
    function makeCtxLiveThumbItem() {
        var wrap = el("div");
        wrap.className = "ctx-sub";
        var b = el("button");
        b.type = "button";
        b.className = "ctx-has-sub";
        b.appendChild(document.createTextNode(T("设为AI缩略图")));
        var chev = el("span", "", "▸");
        chev.className = "ctx-chev";
        b.appendChild(chev);
        var fly = el("div");
        fly.className = "ctx-fly";
        wrap.appendChild(b);
        wrap.appendChild(fly);
        var loadedFor = "";
        function ensure() {
            var it = _ctxItem;
            if (!it) return;
            var k = itemKey(it);
            if (loadedFor === k && fly.childNodes.length && !fly.querySelector("[disabled]")) {
                placeCtxFly(wrap);
                return;
            }
            loadedFor = k;
            fly.innerHTML = "";
            var wait = el("button", "", T("正在加载…"));
            wait.type = "button";
            wait.disabled = true;
            wait.className = "is-off";
            fly.appendChild(wait);
            placeCtxFly(wrap);
            fetchExtract(it).then(function (d) {
                if (_ctxItem !== it) return;
                var arts = uniqArtistItems((d && d.artists) || []);
                fly.innerHTML = "";
                if (!arts.length) {
                    fly.appendChild(ctxFlyBtn(T("这张图没有画师"), function () {}, { disabled: true, emptyTip: T("这张图没有画师") }));
                } else {
                    arts.forEach(function (a) {
                        fly.appendChild(ctxFlyBtn(a.tag, function () { assignLiveThumb(a.tag, it); }));
                    });
                }
                placeCtxFly(wrap);
            }).catch(function (e) {
                if (_ctxItem !== it) return;
                fly.innerHTML = "";
                var err = el("button", "", extractErrorText(e));
                err.type = "button";
                err.disabled = true;
                err.className = "is-off";
                fly.appendChild(err);
            });
        }
        var open = bindCtxSub(wrap, ensure);
        b.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            open();
        };
        return wrap;
    }

    function makeCtxComboThumbItem() {
        var wrap = el("div");
        wrap.className = "ctx-sub";
        var b = el("button");
        b.type = "button";
        b.className = "ctx-has-sub";
        b.appendChild(document.createTextNode(T("设为画师组合缩略图")));
        var chev = el("span", "", "▸");
        chev.className = "ctx-chev";
        b.appendChild(chev);
        var fly = el("div");
        fly.className = "ctx-fly";
        wrap.appendChild(b);
        wrap.appendChild(fly);
        var loadedFor = "";
        function ensure() {
            var it = _ctxItem;
            if (!it) return;
            var k = itemKey(it) + "\0" + (state.artistKey || "") + "\0" + (state.comboName || "");
            if (loadedFor === k && fly.childNodes.length && !fly.querySelector("[disabled]")) {
                placeCtxFly(wrap);
                return;
            }
            loadedFor = k;
            fly.innerHTML = "";
            var wait = el("button", "", T("正在加载…"));
            wait.type = "button";
            wait.disabled = true;
            wait.className = "is-off";
            fly.appendChild(wait);
            placeCtxFly(wrap);
            comboThumbChoices(it).then(function (pack) {
                if (_ctxItem !== it) return;
                fly.innerHTML = "";
                var rows = (pack && pack.rows) || [];
                if (!rows.length) {
                    var tip = (pack && pack.empty) || T("没有对应的画师组合");
                    fly.appendChild(ctxFlyBtn(tip, function () {}, { disabled: true, emptyTip: tip }));
                } else {
                    rows.forEach(function (c) {
                        fly.appendChild(ctxFlyBtn(c.name || T("未命名组合"), function () { assignComboThumb(c, it); }));
                    });
                }
                placeCtxFly(wrap);
            }).catch(function (e) {
                if (_ctxItem !== it) return;
                fly.innerHTML = "";
                var err = el("button", "", extractErrorText(e));
                err.type = "button";
                err.disabled = true;
                err.className = "is-off";
                fly.appendChild(err);
            });
        }
        var open = bindCtxSub(wrap, ensure);
        b.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            open();
        };
        return wrap;
    }

    function openCtxMenu(it, x, y, opts) {

        if (!it) return;
        hidePeek();
        _ctxItem = it;
        var m = document.getElementById("ctx-menu");
        if (!m) return;
        m.innerHTML = "";
        opts = opts || {};
        var picked = cmpFind(it) >= 0;
        if (!opts.fromLightbox) m.appendChild(ctxBtn(T("查看大图"), function (item) {
            if (itemKey(state.sel) !== itemKey(item)) selectItem(item, true);
            openLightbox(item);
        }));
        m.appendChild(ctxBtn(picked ? T("移出对比") : T("加入对比"), function (item) {
            if (picked) {
                toggleCompareItem(item);
                return;
            }
            if (!state.compareOn) setCompareMode(true);
            if (cmpFind(item) < 0) toggleCompareItem(item);
        }));
        m.appendChild(ctxSep());
        m.appendChild(makeCtxFilterItem());
        m.appendChild(makeCtxSearchItem());
        m.appendChild(ctxSep());
        m.appendChild(ctxBtn(T("使用某个画师生成同款图像"), function (item) {
            openPickArtist(item);
        }));
        m.appendChild(ctxSep());
        m.appendChild(ctxBtn(T("复制画师标签"), function (item) {
            fetchExtract(item).then(function (d) {
                var arts = uniqArtists((d && d.artists) || []);
                if (!arts.length) { toast(T("这张图没有画师")); return; }
                copyText(arts.join(", "));
            }).catch(function (e) { toast(extractErrorText(e)); });
        }));
        m.appendChild(ctxBtn(T("保存为画师组合"), function (item) {
            openComboSave(item);
        }));
        m.appendChild(makeCtxComboThumbItem());
        m.appendChild(ctxBtn(T("复制全部标签"), function (item) {
            fetchExtract(item).then(function (d) {
                copyText((d && (d.text || ((d.tags || []).join(", ")))) || "");
            }).catch(function (e) { toast(extractErrorText(e)); });
        }));
        m.appendChild(ctxBtn(T("复制参数"), function (item) {
            fetchExtract(item).then(function (d) {
                copyText((d && d.params_text) || "");
            }).catch(function (e) { toast(extractErrorText(e)); });
        }));
        m.appendChild(ctxBtn(T("复制文件名"), function (item) { copyText(item.filename || ""); }));
        m.appendChild(ctxSep());
        m.appendChild(ctxBtn(isImgFav(it) ? T("移出收藏夹") : T("加入收藏夹"), function (item) { toggleImgFav(item); }));
        m.appendChild(ctxBtn(T("收藏到提示词收藏夹"), function (item) { openFavSave(item); }));
        m.appendChild(ctxBtn(T("⭐ 收藏置顶（画师）"), function (item) {
            fetchExtract(item).then(function (d) {
                pinArtistTags((d && d.artists) || []);
            }).catch(function (e) { toast(extractErrorText(e)); });
        }));
        m.appendChild(makeCtxLiveThumbItem());
        m.appendChild(ctxBtn(T("新标签页打开"), function (item) {
            if (!item.url) return;
            window.open(item.url, "_blank", "noopener,noreferrer");
        }));
        m.appendChild(ctxBtn(T("下载图片"), downloadImage));
        m.appendChild(ctxBtn(T("在本地文件夹中打开"), revealLocalFile));
        if (canManageFolders()) m.appendChild(makeMoveToFolderItem(it, it.subfolder || "", false));
        if (isTrashView()) {
            m.appendChild(ctxSep());
            m.appendChild(ctxBtn(T("还原所在文件夹"), function (item) {
                restoreTrashFolder(trashRelOf(item.subfolder || ""));
            }));
        } else {
            m.appendChild(ctxSep());
            var delN = (_editOn && it && _editSel[itemKey(it)]) ? editCount() : 0;
            if (delN > 1) {
                m.appendChild(ctxBtn(T("删除选中") + "（" + delN + "）", function () { recycleEditSelection(); }, "is-danger"));
            } else {
                m.appendChild(ctxBtn(T("删除图片"), recycleLocalFile, "is-danger"));
            }
        }
        placeCtxMenu(x, y);
    }

    function bindCtxMenu() {
        document.addEventListener("pointerdown", function (e) {
            var m = document.getElementById("ctx-menu");
            if (!m || m.hidden) return;
            if (m.contains(e.target)) return;
            closeCtxMenu();
        });
        document.addEventListener("contextmenu", function (e) {
            var m = document.getElementById("ctx-menu");
            if (!m || m.hidden) return;
            if (m.contains(e.target)) { e.preventDefault(); return; }
            closeCtxMenu();
        });
        window.addEventListener("blur", closeCtxMenu);
        window.addEventListener("resize", closeCtxMenu);
        var lbImg = document.getElementById("lightbox-img");
        if (lbImg) {
            lbImg.addEventListener("contextmenu", function (e) {
                if (!state.sel) return;
                e.preventDefault();
                e.stopPropagation();
                openCtxMenu(state.sel, e.clientX, e.clientY, { fromLightbox: true });
            });
        }
    }

    function itemKey(it) {
        if (!it) return "";
        return (it.subfolder || "") + "/" + it.filename;
    }

    function isImgFav(it) {
        if (!it) return false;
        return !!_imgFav.keys[itemKey(it)];
    }

    function loadImgFavs() {
        return fetch("/danbooru_anima/output_prompt/img_favs").then(function (r) {
            if (!r.ok) throw new Error(String(r.status));
            return r.json();
        }).then(function (d) {
            if (!d || d.ok === false) return d || {};
            _imgFav.keys = Object.create(null);
            var keys = d.keys || [];
            for (var i = 0; i < keys.length; i++) {
                if (keys[i]) _imgFav.keys[keys[i]] = 1;
            }
            _imgFav.count = typeof d.count === "number" ? d.count : keys.length;
            syncTileFavMarks();
            syncImgFavToolbar();
            if (d.reconciling && (_imgFav.polls || 0) < 40) {
                _imgFav.polls = (_imgFav.polls || 0) + 1;
                clearTimeout(_imgFav.pollTimer);
                _imgFav.pollTimer = setTimeout(function () {
                    loadImgFavs();
                    loadImgRates();
                }, 2000);
            } else if (!d.reconciling) {
                _imgFav.polls = 0;
            }
            return d;
        }).catch(function () { return null; });
    }

    function syncTileFavMarks() {
        var tiles = document.querySelectorAll("#grid .tile[data-fn]");
        for (var i = 0; i < tiles.length; i++) {
            var tile = tiles[i];
            var k = (tile.getAttribute("data-sub") || "") + "/" + (tile.getAttribute("data-fn") || "");
            var on = !!_imgFav.keys[k];
            tile.classList.toggle("is-fav", on);
            var btn = tile.querySelector(".tile-fav");
            if (btn) {
                btn.textContent = on ? "★" : "☆";
                btn.classList.toggle("is-on", on);
                btn.title = on ? T("移出收藏夹") : T("加入收藏夹");
                btn.setAttribute("aria-label", btn.title);
            }
        }
    }

    function syncImgFavToolbar() {
        var b = document.getElementById("btn-imgfavs");
        if (!b) return;
        var on = state.subfolder === IMG_FAV_SUB;
        var n = _imgFav.count || 0;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.textContent = n ? (T("★ 收藏夹") + " · " + n) : T("★ 收藏夹");
        b.title = (on ? T("返回全部图片") : T("查看已收藏的图片")) + " · " + T("右键设置备份目录");
        document.body.classList.toggle("opv-imgfavs", on);
    }

    function bindImgFavToolbar() {
        var b = document.getElementById("btn-imgfavs");
        if (!b || b.dataset.bound) return;
        b.dataset.bound = "1";
        b.onclick = function () {
            if (state.subfolder === IMG_FAV_SUB) changeFolder("");
            else changeFolder(IMG_FAV_SUB);
        };
        syncImgFavToolbar();
    }

    function favDirPayload(raw, info) {
        var s = String(raw || "").trim().replace(/^["']|["']$/g, "");
        if (!s) return "";
        var def = String((info && (info.default_dir || info.dir)) || "").replace(/\\/g, "/").replace(/\/+$/g, "");
        var cur = s.replace(/\\/g, "/").replace(/\/+$/g, "");
        if ((info && info.using_default) && def && cur.toLowerCase() === def.toLowerCase()) return "";
        if (info && info.default_dir) {
            var onlyDef = String(info.default_dir).replace(/\\/g, "/").replace(/\/+$/g, "");
            if (onlyDef && cur.toLowerCase() === onlyDef.toLowerCase()) return "";
        }
        return s;
    }
    function applyFavDirI18n() {
        var map = [
            ["fav-dir-title", "设置"],
            ["opv-skin-lab", "主题"],
            ["opv-skin-default", "默认"],
            ["opv-skin-hub", "贴纸"],
            ["opv-skin-glass", "玻璃"],
            ["opv-skin-gallery", "画廊"],
            ["opv-skin-kawaii", "涂鸦"],
            ["opv-skin-mist", "磨砂"],
            ["opv-skin-chantier", "工坊"],
            ["opv-skin-aqua", "水色"],
            ["opv-rate-lab", "评分透明度"],
            ["opv-rate-sub", "鼠标还没移到评分上时的浓淡。0% 只留淡边；打过分的会露出爱心虚影。"],
            ["fav-dir-backup-lab", "收藏备份目录"],
            ["fav-dir-sub", "收藏图会复制到这个文件夹（不是剪切）"],
            ["fav-dir-lab", "文件夹路径"],
            ["fav-dir-browse", "浏览…"],
            ["fav-dir-default", "使用默认位置"],
            ["fav-dir-open", "打开该目录"],
            ["fav-dir-cancel", "取消"],
            ["fav-dir-ok", "确定"]
        ];
        for (var i = 0; i < map.length; i++) {
            var n = document.getElementById(map[i][0]);
            if (n) n.textContent = T(map[i][1]);
        }
        var inp = document.getElementById("fav-dir-input");
        if (inp) inp.placeholder = T("默认：输出目录/收藏图备份");
        var gear = document.getElementById("btn-fav-dir");
        if (gear) {
            gear.title = T("设置");
            gear.setAttribute("aria-label", T("设置"));
        }
        syncOpvSkinButtons(readOpvSkin());
    }
    function fillFavDirPop(info) {
        _favDirInfo = info || _favDirInfo || {};
        var inp = document.getElementById("fav-dir-input");
        if (inp) inp.value = String((_favDirInfo && _favDirInfo.dir) || "");
        var now = document.getElementById("fav-dir-now");
        if (now) {
            var line = (_favDirInfo && _favDirInfo.using_default) ? T("当前使用默认位置") : T("当前使用自定义位置");
            now.textContent = line + "\n" + String((_favDirInfo && _favDirInfo.dir) || "");
        }
        applyFavDirI18n();
    }
    function closeFavDirPop() {
        var pop = document.getElementById("fav-dir-pop");
        if (!pop) return;
        pop.hidden = true;
        pop.setAttribute("aria-hidden", "true");
    }
    function fetchFavDirInfo() {
        return fetch("/danbooru_anima/output_prompt/fav_backup").then(function (r) {
            if (r.status === 404) throw new Error("need_restart");
            return r.json();
        });
    }
    function openFavDirPop() {
        var pop = document.getElementById("fav-dir-pop");
        if (!pop) return;
        applyFavDirI18n();
        setOpvSkinMenu(false);
        pop.hidden = false;
        pop.setAttribute("aria-hidden", "false");
        var now = document.getElementById("fav-dir-now");
        if (now && !_favDirInfo) now.textContent = T("正在读取备份目录");
        fetchFavDirInfo().then(function (d) {
            if (!d || d.ok === false) {
                toast((d && d.error) || T("加载失败"));
                return;
            }
            fillFavDirPop(d);
            var inp = document.getElementById("fav-dir-input");
            if (inp) {
                inp.focus();
                inp.select();
            }
        }).catch(function (e) {
            toast(e && e.message === "need_restart" ? T("请先重启 ComfyUI，再打开本页") : T("加载失败"));
        });
    }
    function postFavDir(body) {
        return postOpvJson("fav_backup", body || {});
    }
    function saveFavDir(raw, keepOpen) {
        if (_favDirBusy) return;
        _favDirBusy = true;
        var payload = favDirPayload(raw, _favDirInfo);
        postFavDir({ dir: payload }).then(function (d) {
            if (!d || d.ok === false) {
                toast((d && d.error) || T("写入设置失败"));
                return;
            }
            fillFavDirPop(d);
            var n = d.copied || 0;
            toast(n ? (T("已改收藏备份目录") + " · " + T("已复制到新目录") + " " + n) : T("已改收藏备份目录"));
            if (!keepOpen) closeFavDirPop();
        }).catch(function (e) {
            fsRestartToast(e, T("写入设置失败"));
        }).then(function () { _favDirBusy = false; });
    }

    function browseFavDir() {
        if (_favDirPickBusy) {
            toast(T("已经打开了选择窗口"));
            return;
        }
        _favDirPickBusy = true;
        var btn = document.getElementById("fav-dir-browse");
        if (btn) {
            btn.disabled = true;
            btn.textContent = T("选择中…");
        }
        toast(T("请在弹出的窗口里选择文件夹"), 2800);
        var inp = document.getElementById("fav-dir-input");
        postFavDir({ action: "pick", dir: inp ? inp.value : "" }).then(function (d) {
            var pop = document.getElementById("fav-dir-pop");
            var stillOpen = !!(pop && !pop.hidden);
            if (!d || d.ok === false) {
                toast((d && d.error) || T("选择文件夹失败"));
                return;
            }
            if (d.cancelled) {
                if (stillOpen) toast(T("没有选择文件夹"), 1400);
                return;
            }
            if (stillOpen && inp && d.dir) {
                inp.value = d.dir;
                inp.focus();
                toast(T("已选择文件夹，点确定保存"));
            }
        }).catch(function (e) {
            fsRestartToast(e, T("选择文件夹失败"));
        }).then(function () {
            _favDirPickBusy = false;
            var b2 = document.getElementById("fav-dir-browse");
            if (b2) {
                b2.disabled = false;
                b2.textContent = T("浏览…");
            }
        });
    }

    function revealFavDir() {
        if (_favDirBusy) return;
        _favDirBusy = true;
        postFavDir({ action: "reveal" }).then(function (d) {
            if (!d || d.ok === false) toast((d && d.error) || T("打开失败"));
        }).catch(function (e) {
            fsRestartToast(e, T("打开失败"));
        }).then(function () { _favDirBusy = false; });
    }
    function bindFavDirUi() {
        var gear = document.getElementById("btn-fav-dir");
        if (gear && !gear.dataset.bound) {
            gear.dataset.bound = "1";
            gear.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                openFavDirPop();
            };
        }
        var fav = document.getElementById("btn-imgfavs");
        if (fav && !fav.dataset.favdir) {
            fav.dataset.favdir = "1";
            fav.addEventListener("contextmenu", function (e) {
                e.preventDefault();
                e.stopPropagation();
                openFavDirPop();
            });
        }
        var pop = document.getElementById("fav-dir-pop");
        if (pop && !pop.dataset.bound) {
            pop.dataset.bound = "1";
            pop.addEventListener("click", function (e) {
                if (e.target === pop && !_favDirPickBusy) closeFavDirPop();
            });
            var panel = pop.querySelector(".fav-dir-panel");
            if (panel) panel.addEventListener("click", function (e) {
                e.stopPropagation();
                var pick = document.getElementById("opv-skin-pick");
                if (pick && !pick.contains(e.target)) setOpvSkinMenu(false);
            });
            var ok = document.getElementById("fav-dir-ok");
            if (ok) ok.onclick = function () {
                var inp = document.getElementById("fav-dir-input");
                saveFavDir(inp ? inp.value : "", false);
            };
            var cancel = document.getElementById("fav-dir-cancel");
            if (cancel) cancel.onclick = function () { closeFavDirPop(); };
            var defBtn = document.getElementById("fav-dir-default");
            if (defBtn) defBtn.onclick = function () { saveFavDir("", true); };
            var openBtn = document.getElementById("fav-dir-open");
            if (openBtn) openBtn.onclick = function () { revealFavDir(); };
            var browseBtn = document.getElementById("fav-dir-browse");
            if (browseBtn) browseBtn.onclick = function () { browseFavDir(); };
            var skinMenu = document.getElementById("opv-skin-menu");
            if (skinMenu) {
                skinMenu.addEventListener("click", function (e) {
                    var t = e.target;
                    var sid = "";
                    while (t && t !== skinMenu) {
                        if (t.getAttribute && t.getAttribute("data-opv-skin")) {
                            sid = t.getAttribute("data-opv-skin");
                            break;
                        }
                        t = t.parentNode;
                    }
                    if (!sid) return;
                    e.preventDefault();
                    setOpvSkin(sid);
                    setOpvSkinMenu(false);
                });
            }
            var rateFade = document.getElementById("opv-rate-fade");
            if (rateFade && !rateFade.dataset.bound) {
                rateFade.dataset.bound = "1";
                applyRateFade(readRateFade());
                rateFade.oninput = function () { setRateFade(rateFade.value); };
            }
            var skinToggle = document.getElementById("opv-skin-toggle");
            if (skinToggle) {
                skinToggle.addEventListener("click", function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    var menu = document.getElementById("opv-skin-menu");
                    setOpvSkinMenu(!(menu && !menu.hidden));
                });
            }
            var inp = document.getElementById("fav-dir-input");
            if (inp) inp.addEventListener("keydown", function (e) {
                if (e.key === "Enter") {
                    e.preventDefault();
                    saveFavDir(inp.value, false);
                }
            });
        }
        if (!window.__opvFavDirEsc) {
            window.__opvFavDirEsc = true;
            document.addEventListener("keydown", function (e) {
                if (e.key !== "Escape") return;
                var box = document.getElementById("fav-dir-pop");
                if (box && !box.hidden && !_favDirPickBusy) {
                    e.preventDefault();
                    closeFavDirPop();
                }
            });
        }
        applyFavDirI18n();
    }

    function toggleImgFav(it) {
        if (!it || !it.filename) { toast(T("请选择一张图片")); return Promise.resolve(null); }
        var on = !isImgFav(it);
        return fetch("/danbooru_anima/output_prompt/img_fav", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: it.filename, subfolder: it.subfolder || "", on: on })
        }).then(function (r) {
            if (r.status === 404) throw new Error("need_restart");
            return r.json();
        }).then(function (d) {
            if (!d || d.ok === false) {
                toast((d && d.error) || T("收藏失败"));
                return d;
            }
            var key = itemKey(it);
            if (d.on) _imgFav.keys[key] = 1;
            else delete _imgFav.keys[key];
            _imgFav.count = typeof d.count === "number" ? d.count : _imgFav.count;
            toast(d.on ? T("已加入收藏夹") : T("已移出收藏夹"));
            syncTileFavMarks();
            syncImgFavToolbar();
            if (state.sel && itemKey(state.sel) === key) renderDetail();
            if (state.subfolder === IMG_FAV_SUB) {
                if (!d.on) loadList({ silent: true, merge: true });
                else loadList({ silent: true, merge: true });
            }
            return d;
        }).catch(function (e) {
            toast((e && e.message === "need_restart") ? T("接口不存在，请重启 ComfyUI") : T("收藏失败"));
            return null;
        });
    }


    function clampImgRate(n) {
        n = parseInt(n, 10);
        if (!(n > 0)) return 0;
        if (n > 5) return 5;
        return n;
    }
    function imgRating(it) {
        if (!it) return 0;
        var k = itemKey(it);
        if (k && _imgRate.keys[k] != null) return clampImgRate(_imgRate.keys[k]);
        return clampImgRate(it.rating);
    }
    function rememberItemRating(it) {
        if (!it || typeof it.rating !== "number") return;
        var k = itemKey(it);
        if (!k) return;
        var n = clampImgRate(it.rating);
        if (n) _imgRate.keys[k] = n;
        else delete _imgRate.keys[k];
    }
    function paintHeartRow(row, n) {
        if (!row) return;
        n = clampImgRate(n);
        row.setAttribute("data-n", String(n));
        var btns = row.querySelectorAll("button");
        for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("is-on", (i + 1) <= n);
    }
    function makeHeartRow(it, extraClass) {
        var row = el("div");
        row.className = "tile-hearts" + (extraClass ? " " + extraClass : "");
        row.setAttribute("data-rate-key", itemKey(it));
        var cur = imgRating(it);
        for (var i = 1; i <= 5; i++) {
            (function (n) {
                var b = el("button", "", "\u2665");
                b.type = "button";
                b.className = "tile-heart" + (n <= cur ? " is-on" : "");
                b.title = n + T("颗爱心");
                b.setAttribute("aria-label", b.title);
                b.onclick = function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    setImgRate(it, imgRating(it) === n ? 0 : n);
                };
                row.appendChild(b);
            })(i);
        }
        row.onmousedown = function (e) { e.stopPropagation(); };
        row.onclick = function (e) { e.preventDefault(); e.stopPropagation(); };
        paintHeartRow(row, cur);
        return row;
    }
    function syncTileRateMarks() {
        var tiles = document.querySelectorAll("#grid .tile[data-fn]");
        for (var i = 0; i < tiles.length; i++) {
            var tile = tiles[i];
            var k = (tile.getAttribute("data-sub") || "") + "/" + (tile.getAttribute("data-fn") || "");
            paintHeartRow(tile.querySelector(".tile-hearts"), clampImgRate(_imgRate.keys[k]));
        }
        var ins = document.getElementById("inspect-hearts");
        if (ins && state.sel) paintHeartRow(ins, imgRating(state.sel));
    }
    function loadImgRates() {
        return fetch("/danbooru_anima/output_prompt/img_ratings").then(function (r) {
            if (!r.ok) throw new Error(String(r.status));
            return r.json();
        }).then(function (d) {
            if (!d || d.ok === false) return d || {};
            _imgRate.keys = Object.create(null);
            var map = d.ratings || {};
            Object.keys(map).forEach(function (k) {
                var n = clampImgRate(map[k]);
                if (k && n) _imgRate.keys[k] = n;
            });
            syncTileRateMarks();
            return d;
        }).catch(function () { return null; });
    }
    function setImgRate(it, n) {
        if (!it || !it.filename) return Promise.resolve(null);
        n = clampImgRate(n);
        return fetch("/danbooru_anima/output_prompt/img_rate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: it.filename, subfolder: it.subfolder || "", rating: n })
        }).then(function (r) {
            if (r.status === 404) throw new Error("need_restart");
            return r.json();
        }).then(function (d) {
            if (!d || d.ok === false) {
                toast((d && d.error) || T("评分失败"));
                return d;
            }
            var key = itemKey(it);
            var got = clampImgRate(d.rating);
            if (got) _imgRate.keys[key] = got;
            else delete _imgRate.keys[key];
            if (it) it.rating = got;
            syncTileRateMarks();
            if (listSort().indexOf("rating") === 0 || state.heartRate) loadList({ silent: true });
            return d;
        }).catch(function (e) {
            toast((e && e.message === "need_restart") ? T("接口不存在，请重启 ComfyUI") : T("评分失败"));
            return null;
        });
    }

    function lbOpen() {
        return !document.getElementById("lightbox").hidden;
    }
    function cmpOpen() {
        return !document.getElementById("compare").hidden;
    }

    var _lb = { zoom: 1, x: 0, y: 0 };
    var _lbFile = null;
    var _lbDrag = null;
    var _lbSuppressClick = false;
    var _lbMorePinned = false;
    var _lbMoreDrag = null;
    var _lbMoreLeave = 0;
    var _lbMoreSkipClick = false;
    var _lbFanNode = null;
    var _lbPtr = { x: 0, y: 0 };
    var _lbRestOpen = false;
    var _lbActs = [];
    var _lbSubStack = [];
    var _lbSubGen = 0;

    function lbIcon(inner) {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' + inner + '</svg>';
    }
    function lbMetrics() {
        var stage = document.getElementById("lb-stage");
        var img = document.getElementById("lightbox-img");
        var nw = (img && img.naturalWidth) || 0;
        var nh = (img && img.naturalHeight) || 0;
        var sw = (stage && stage.clientWidth) || 0;
        var sh = (stage && stage.clientHeight) || 0;
        var fit = (nw && nh && sw && sh) ? Math.min(sw / nw, sh / nh) : 0;
        return { nw: nw, nh: nh, sw: sw, sh: sh, fit: fit };
    }
    function lbMinZoom() {
        var m = lbMetrics();
        if (!m.fit) return 1;
        return Math.min(1, 1 / m.fit);
    }
    function lbSyncChrome() {
        var b = document.getElementById("lb-fit");
        if (!b) return;
        var fitted = Math.abs(_lb.zoom - 1) <= 0.02;
        state.lbNative = !fitted;
        b.textContent = fitted ? T("实际像素") : T("适应窗口");
        b.title = fitted ? T("按原始像素显示") : T("缩回适应窗口");
    }
    function lbPaint() {
        var img = document.getElementById("lightbox-img");
        var stage = document.getElementById("lb-stage");
        var m = lbMetrics();
        if (!img || !m.nw || !m.fit) return;
        var scale = m.fit * _lb.zoom;
        img.style.width = Math.max(1, Math.round(m.nw * scale)) + "px";
        img.style.height = Math.max(1, Math.round(m.nh * scale)) + "px";
        img.style.left = Math.round(_lb.x) + "px";
        img.style.top = Math.round(_lb.y) + "px";
        var z = document.getElementById("lb-zoom");
        if (z) z.textContent = Math.max(1, Math.round(scale * 100)) + "%";
        if (stage) stage.classList.toggle("is-zoomed", _lb.zoom > 1.02);
        syncLbFileDrag();
        lbSyncChrome();
    }
    function lbFit() {
        var m = lbMetrics();
        if (!m.nw || !m.sw || !m.sh || !m.fit) return;
        _lb.zoom = 1;
        _lb.x = (m.sw - m.nw * m.fit) / 2;
        _lb.y = (m.sh - m.nh * m.fit) / 2;
        lbPaint();
        lbMoreRestore();
    }
    function lbActual() {
        var m = lbMetrics();
        if (!m.nw || !m.fit) return;
        _lb.zoom = 1 / m.fit;
        _lb.x = (m.sw - m.nw) / 2;
        _lb.y = (m.sh - m.nh) / 2;
        lbPaint();
    }
    function setLbNative(on) {
        if (on) lbActual();
        else lbFit();
    }
    function lbWheel(e) {
        var m = lbMetrics();
        if (!m.nw || !m.fit) return;
        var dy = e.deltaY || 0;
        if (e.deltaMode === 1) dy *= 16;
        else if (e.deltaMode === 2) dy *= m.sh || 800;
        var factor = Math.exp(-dy * 0.0016);
        if (!isFinite(factor) || factor === 1) return;
        var next = _lb.zoom * factor;
        var minZ = lbMinZoom();
        var maxZ = Math.max(8, 4 / m.fit);
        if (next < minZ) next = minZ;
        if (next > maxZ) next = maxZ;
        if (Math.abs(next - 1) < 0.03) next = 1;
        var oldScale = m.fit * _lb.zoom;
        var newScale = m.fit * next;
        var stage = document.getElementById("lb-stage");
        var rect = stage.getBoundingClientRect();
        var cx = e.clientX - rect.left;
        var cy = e.clientY - rect.top;
        var ix = oldScale ? (cx - _lb.x) / oldScale : 0;
        var iy = oldScale ? (cy - _lb.y) / oldScale : 0;
        _lb.zoom = next;
        if (next === 1) { lbFit(); return; }
        _lb.x = cx - ix * newScale;
        _lb.y = cy - iy * newScale;
        lbPaint();
    }
    function lbPointerDown(e) {
        if (e.button !== 0) return;
        if (_lb.zoom <= 1.02) return;
        e.preventDefault();
        _lbDrag = { x: e.clientX, y: e.clientY, ox: _lb.x, oy: _lb.y, moved: false, id: e.pointerId };
        var stage = document.getElementById("lb-stage");
        if (stage) {
            stage.classList.add("is-dragging");
            try { stage.setPointerCapture(e.pointerId); } catch (err) {}
        }
    }
    function lbPointerMove(e) {
        if (!_lbDrag || _lbDrag.id !== e.pointerId) return;
        var dx = e.clientX - _lbDrag.x;
        var dy = e.clientY - _lbDrag.y;
        if (dx * dx + dy * dy > 16) _lbDrag.moved = true;
        _lb.x = _lbDrag.ox + dx;
        _lb.y = _lbDrag.oy + dy;
        lbPaint();
    }
    function lbPointerUp(e) {
        if (!_lbDrag) return;
        if (e && e.pointerId != null && _lbDrag.id !== e.pointerId) return;
        if (_lbDrag.moved) _lbSuppressClick = true;
        _lbDrag = null;
        var stage = document.getElementById("lb-stage");
        if (stage) stage.classList.remove("is-dragging");
    }
    function lbMoreOpen() {
        var ring = document.getElementById("lb-more-ring");
        return !!(ring && !ring.hidden);
    }
    function lbClearSub() {
        _lbSubStack = [];
        _lbSubGen++;
        _lbFanNode = null;
        var ring = document.getElementById("lb-more-ring");
        if (!ring) return;
        var fans = ring.querySelectorAll(".lb-fan");
        for (var i = 0; i < fans.length; i++) {
            fans[i].hidden = true;
            fans[i].innerHTML = "";
        }
        var hot = ring.querySelectorAll(".lb-node.is-hot");
        for (var h = 0; h < hot.length; h++) hot[h].classList.remove("is-hot");
    }
    function lbMoreSaved() {
        try {
            var o = JSON.parse(localStorage.getItem("anima_opv_lb_fab") || "");
            if (o && o.custom && typeof o.rx === "number" && typeof o.ry === "number") return o;
        } catch (err) {}
        return null;
    }
    function lbMoreClamp(x, y) {
        var host = document.getElementById("lightbox");
        var btn = document.getElementById("lb-more-btn");
        var w = (btn && btn.offsetWidth) || 58;
        var h = (btn && btn.offsetHeight) || 58;
        var hw = host ? host.clientWidth : 800;
        var hh = host ? host.clientHeight : 600;
        return {
            x: Math.max(10, Math.min(Math.max(10, hw - w - 10), x)),
            y: Math.max(64, Math.min(Math.max(64, hh - h - 12), y))
        };
    }
    function lbMoreApply(x, y) {
        var wrap = document.getElementById("lb-more");
        if (!wrap) return;
        var p = lbMoreClamp(x, y);
        wrap.style.left = Math.round(p.x) + "px";
        wrap.style.top = Math.round(p.y) + "px";
        if (lbMoreOpen()) lbMorePlacePop();
    }
    function lbMoreDefaultXY() {
        var host = document.getElementById("lightbox");
        var img = document.getElementById("lightbox-img");
        var btn = document.getElementById("lb-more-btn");
        var size = (btn && btn.offsetWidth) || 58;
        var hh = host ? host.clientHeight : 600;
        var hw = host ? host.clientWidth : 800;
        var x = 22;
        var y = hh * 0.42;
        if (host && img && img.naturalWidth) {
            var hr = host.getBoundingClientRect();
            var ir = img.getBoundingClientRect();
            var gutter = ir.left - hr.left;
            y = ir.top - hr.top + ir.height / 2 - size / 2;
            var cx = gutter - 16 - size / 2;
            var minC = Math.min(168, hw / 2);
            var maxC = Math.max(minC, hw - minC);
            if (cx < minC) cx = minC;
            if (cx > maxC) cx = maxC;
            x = cx - size / 2;
        }
        return lbMoreClamp(x, y);
    }
    function lbMoreRestore() {
        if (!lbOpen()) return;
        var host = document.getElementById("lightbox");
        var saved = lbMoreSaved();
        if (saved && host && host.clientWidth) lbMoreApply(saved.rx * host.clientWidth, saved.ry * host.clientHeight);
        else {
            var d = lbMoreDefaultXY();
            lbMoreApply(d.x, d.y);
        }
    }
    function lbMoreSave() {
        var wrap = document.getElementById("lb-more");
        var host = document.getElementById("lightbox");
        if (!wrap || !host || !host.clientWidth || !host.clientHeight) return;
        var x = parseFloat(wrap.style.left) || 0;
        var y = parseFloat(wrap.style.top) || 0;
        try {
            localStorage.setItem("anima_opv_lb_fab", JSON.stringify({
                custom: true,
                rx: x / host.clientWidth,
                ry: y / host.clientHeight
            }));
        } catch (err) {}
    }
    function lbMorePlacePop() {
        lbRelayoutRing();
    }
    function lbMoreSet(on) {
        var ring = document.getElementById("lb-more-ring");
        var hit = document.getElementById("lb-more-hit");
        var wrap = document.getElementById("lb-more");
        var btn = document.getElementById("lb-more-btn");
        if (!ring || !wrap || !btn) return;
        wrap.classList.toggle("is-pinned", !!_lbMorePinned);
        btn.classList.toggle("is-pinned", !!_lbMorePinned);
        if (on && !ring.hidden) {
            wrap.classList.add("is-open");
            btn.classList.add("is-on");
            btn.setAttribute("aria-expanded", "true");
            return;
        }
        ring.hidden = !on;
        if (hit) hit.hidden = !on;
        wrap.classList.toggle("is-open", !!on);
        btn.classList.toggle("is-on", !!on);
        btn.setAttribute("aria-expanded", on ? "true" : "false");
        if (on) fillLbMore();
        else {
            _lbRestOpen = false;
            lbHideRest();
            lbClearSub();
        }
    }
    function lbRunRow(row) {
        if (!row || row.disabled) {
            if (row && row.tip) toast(row.tip);
            return;
        }
        if (row.kids) {
            var ret = row.kids();
            if (ret && typeof ret.then === "function") ret.then(function (rows) { lbPushSub(rows || []); });
            else lbPushSub(ret || []);
            return;
        }
        if (row.fn) row.fn();
        if (!_lbMorePinned) lbMoreSet(false);
    }
    function lbEdgeRoom() {
        var host = document.getElementById("lightbox");
        var wrap = document.getElementById("lb-more");
        if (!host || !wrap) return { l: 200, r: 200, t: 200, b: 200 };
        var hr = host.getBoundingClientRect();
        var br = wrap.getBoundingClientRect();
        var cx = br.left + br.width / 2;
        var cy = br.top + br.height / 2;
        return {
            l: cx - hr.left - 8,
            r: hr.right - cx - 8,
            t: cy - hr.top - 60,
            b: hr.bottom - cy - 8
        };
    }
    function lbMainSlots(n) {
        var room = lbEdgeRoom();
        var maxR = Math.min(room.l, room.r, room.t, room.b);
        var rad = Math.min(132, maxR - 46);
        if (rad < 52) rad = Math.max(40, maxR - 24);
        var slots = [];
        for (var k = 0; k < n; k++) {
            var ang = -Math.PI / 2 + Math.PI * 2 * ((k + 0.5) / n);
            slots.push({
                ang: ang,
                left: 29 + Math.cos(ang) * rad - 38,
                top: 29 + Math.sin(ang) * rad - 25
            });
        }
        return slots;
    }
    function lbRelayoutRing() {
        var ring = document.getElementById("lb-more-ring");
        var hit = document.getElementById("lb-more-hit");
        if (!ring) return;
        var nodes = ring.querySelectorAll(":scope > .lb-node");
        if (!nodes.length) return;
        var slots = lbMainSlots(nodes.length);
        var max = 80;
        for (var i = 0; i < nodes.length; i++) {
            var s = slots[i] || slots[slots.length - 1];
            nodes[i].style.left = Math.round(s.left) + "px";
            nodes[i].style.top = Math.round(s.top) + "px";
            nodes[i]._ang = s.ang;
            var dx = s.left + 38 - 29;
            var dy = s.top + 25 - 29;
            var dist = Math.sqrt(dx * dx + dy * dy) + 84;
            if (dist > max) max = dist;
        }
        if (hit) {
            hit.hidden = ring.hidden;
            hit.style.width = Math.round(max * 2) + "px";
            hit.style.height = Math.round(max * 2) + "px";
        }
    }
    function lbParentBox(node) {
        var level = node._level || 0;
        if (level <= 0) return { cx: 38, cy: 25, orb: 50 };
        if (level === 1) return { cx: 36, cy: 18, orb: 36 };
        return { cx: 30, cy: 14, orb: 28 };
    }
    function lbChildBox(level) {
        if (level <= 1) return { w: 72, cx: 36, cy: 18, orb: 36 };
        return { w: 60, cx: 30, cy: 14, orb: 28 };
    }
    function lbRayRoom(x, y, ang) {
        var host = document.getElementById("lightbox");
        if (!host) return 240;
        var hr = host.getBoundingClientRect();
        var dx = Math.cos(ang);
        var dy = Math.sin(ang);
        var lim = 2400;
        if (dx > 0.02) lim = Math.min(lim, (hr.right - 10 - x) / dx);
        if (dx < -0.02) lim = Math.min(lim, (x - hr.left - 10) / -dx);
        if (dy > 0.02) lim = Math.min(lim, (hr.bottom - 10 - y) / dy);
        if (dy < -0.02) lim = Math.min(lim, (y - hr.top - 58) / -dy);
        return lim;
    }
    function lbFanAim(node, wantR) {
        var orb = node.querySelector(".lb-orb");
        var prefer = typeof node._ang === "number" ? node._ang : 0;
        if (!orb) return prefer;
        var r = orb.getBoundingClientRect();
        var x = r.left + r.width / 2;
        var y = r.top + r.height / 2;
        if (lbRayRoom(x, y, prefer) >= wantR * 0.75) return prefer;
        var bestA = prefer;
        var best = lbRayRoom(x, y, prefer);
        for (var deg = 8; deg <= 70; deg += 8) {
            var delta = deg * Math.PI / 180;
            var cands = [prefer + delta, prefer - delta];
            for (var ci = 0; ci < cands.length; ci++) {
                var room = lbRayRoom(x, y, cands[ci]);
                if (room > best) { best = room; bestA = cands[ci]; }
            }
        }
        return bestA;
    }
    function lbWatch(node) {
        node.addEventListener("pointerenter", function (e) {
            _lbPtr.x = e.clientX;
            _lbPtr.y = e.clientY;
            lbArm(node);
        });
        node.addEventListener("pointerleave", function () {
            clearTimeout(node._leaveT);
            node._leaveT = setTimeout(function () {
                node._leaveT = 0;
                var el = document.elementFromPoint(_lbPtr.x, _lbPtr.y);
                if (el && node.contains(el)) return;
                lbShutFan(node);
            }, 280);
        });
    }
    function lbShutFan(node) {
        if (!node) return;
        clearTimeout(node._leaveT);
        node._leaveT = 0;
        if (_lbFanNode === node) _lbFanNode = null;
        node.classList.remove("is-hot");
        var fan = node.querySelector(":scope > .lb-fan");
        if (!fan) return;
        fan.hidden = true;
        fan.innerHTML = "";
    }
    function lbArm(node) {
        if (!node) return;
        clearTimeout(node._leaveT);
        node._leaveT = 0;
        var parent = node.parentNode;
        if (parent) {
            var kids = parent.children;
            for (var i = 0; i < kids.length; i++) {
                if (kids[i] !== node && kids[i].classList && kids[i].classList.contains("lb-node")) lbShutFan(kids[i]);
            }
        }
        node.classList.add("is-hot");
        if (_lbRestOpen && node.classList && node.classList.contains("is-main")) return;
        var act = node._act || {};
        var fan = node.querySelector(":scope > .lb-fan");
        if (act.sub) {
            _lbFanNode = node;
            if (fan) fan.hidden = false;
            act.sub();
            return;
        }
        if (act.kids) {
            _lbFanNode = node;
            if (fan) fan.hidden = false;
            var ret = act.kids();
            var level = (node._level || 0) + 1;
            if (ret && typeof ret.then === "function") {
                ret.then(function (rows) {
                    if (_lbFanNode !== node) return;
                    lbPaintFan(node, rows || [], level);
                });
            } else lbPaintFan(node, ret || [], level);
        }
    }
    function lbPaintFan(node, rows, level) {
        var fan = node.querySelector(":scope > .lb-fan");
        if (!fan) return;
        fan.innerHTML = "";
        fan.hidden = false;
        rows = rows || [];
        if (!rows.length) return;
        var box = lbChildBox(level);
        var parent = lbParentBox(node);
        var n = rows.length;
        var gap = 12;
        var minChord = box.orb + gap;
        var span = n === 1 ? 0 : Math.min(Math.PI * 0.72, Math.max(0.55, n * 0.22));
        var step = n <= 1 ? 1 : span / n;
        var radius = n <= 1 ? (level <= 1 ? 88 : 66) : (minChord / (2 * Math.sin(step / 2)));
        radius = Math.max(radius, level <= 1 ? 88 : 64);
        if (level === 1) {
            var fabBtn = document.getElementById("lb-more-btn");
            var orbNow = node.querySelector(".lb-orb");
            if (fabBtn && orbNow) {
                var fr = fabBtn.getBoundingClientRect();
                var pr = orbNow.getBoundingClientRect();
                var pdist = Math.hypot((pr.left + pr.width / 2) - (fr.left + fr.width / 2), (pr.top + pr.height / 2) - (fr.top + fr.height / 2));
                var reach = 0;
                var mains = document.querySelectorAll("#lb-more-ring > .lb-node > .lb-tile .lb-orb");
                for (var mi = 0; mi < mains.length; mi++) {
                    var mr = mains[mi].getBoundingClientRect();
                    var md = Math.hypot((mr.left + mr.width / 2) - (fr.left + fr.width / 2), (mr.top + mr.height / 2) - (fr.top + fr.height / 2));
                    if (md > reach) reach = md;
                }
                if (reach - pdist > 24) {
                    var phi = span / 2;
                    var want = reach + box.orb / 2 + 36;
                    var cos = Math.cos(phi);
                    var bb = 2 * pdist * cos;
                    var cc = pdist * pdist - want * want;
                    var disc = bb * bb - 4 * cc;
                    var clearR = disc > 0 ? ((-bb + Math.sqrt(disc)) / 2) : want;
                    radius = Math.max(radius, clearR);
                }
            }
        }
        var aim = lbFanAim(node, radius + box.orb);
        var a0 = aim - span / 2;
        var stemW = 56;
        if (n > 1) stemW = Math.max(56, radius * Math.sin(step / 2) * 2 * 0.72);
        for (var i = 0; i < n; i++) {
            var ang = n === 1 ? aim : (a0 + step * (i + 0.5));
            var stem = document.createElement("div");
            stem.className = "lb-stem";
            stem.style.left = parent.cx + "px";
            stem.style.top = parent.cy + "px";
            stem.style.height = Math.round(radius + 6) + "px";
            stem.style.width = Math.round(stemW) + "px";
            stem.style.transform = "translate(-50%, 0) rotate(" + ((ang - Math.PI / 2) * 180 / Math.PI) + "deg)";
            fan.appendChild(stem);
        }
        for (var j = 0; j < n; j++) {
            var row = rows[j];
            var ang2 = n === 1 ? aim : (a0 + step * (j + 0.5));
            var child = document.createElement("div");
            child.className = "lb-node is-l" + level + (row.kids ? " has-sub" : "");
            child._act = row;
            child._level = level;
            child._ang = ang2;
            child.style.left = Math.round(parent.cx + Math.cos(ang2) * radius - box.cx) + "px";
            child.style.top = Math.round(parent.cy + Math.sin(ang2) * radius - box.cy) + "px";
            var b = document.createElement("button");
            b.type = "button";
            b.className = "lb-tile lb-mini" + (row.disabled ? " is-off" : "");
            var glyph = ((row.label || "·").replace(/^\s+/, "").slice(0, 1)) || "·";
            b.innerHTML = '<span class="lb-orb"><span class="lb-glyph"></span></span><span class="lb-cap"></span>';
            b.querySelector(".lb-glyph").textContent = glyph;
            b.querySelector(".lb-cap").textContent = row.label || "";
            var push = box.orb / 2 + 36;
            b.querySelector(".lb-cap").style.transform = "translate(-50%, -50%) translate(" + Math.round(Math.cos(ang2) * push) + "px," + Math.round(Math.sin(ang2) * push) + "px)";
            var subFan = document.createElement("div");
            subFan.className = "lb-fan";
            subFan.hidden = true;
            child.appendChild(b);
            child.appendChild(subFan);
            lbWatch(child);
            b.addEventListener("click", function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                var own = this._row;
                var ownNode = this._node;
                if (own && own.kids) { lbArm(ownNode); return; }
                lbRunRow(own);
            });
            b._row = row;
            b._node = child;
            fan.appendChild(child);
        }
    }
    function lbOpenSub(rows, opts) {
        if (!_lbFanNode) return;
        rows = rows || [];
        opts = opts || {};
        var longN = 0;
        for (var i = 0; i < rows.length; i++) {
            if (((rows[i] && rows[i].label) || "").length > 16) longN++;
        }
        var asList = !!opts.panel || rows.length > 8 || (rows.length > 4 && longN >= rows.length * 0.6);
        if (asList) lbPaintList(_lbFanNode, rows);
        else lbPaintFan(_lbFanNode, rows, (_lbFanNode._level || 0) + 1);
    }
    function lbPushSub(rows) {
        lbOpenSub(rows || []);
    }
    function lbFillArtistFace(img, letter, cnEl, tag, token) {
        resolveArtistForFlyout(tag).then(function (info) {
            if (token !== _lbSubGen || !img.isConnected) return;
            var foundTag = (info && info.found && info.found.tag) || tag;
            var raw = (info && info.thumbUrl) || "";
            var url = "";
            if (raw) url = (info && info.useAdexProxy) ? adexSrc(raw) : (favImgUrl(raw, foundTag) || favImgUrl(raw, tag) || "");
            if (!url) url = localFavThumb(foundTag) || localFavThumb(tag) || liveFavThumb(foundTag) || liveFavThumb(tag) || "";
            if (cnEl && info && info.found && info.found.cn) cnEl.textContent = info.found.cn;
            if (!url && !(info && info.useAdexProxy && raw)) return;
            function showFace() {
                img.hidden = false;
                if (letter) letter.hidden = true;
            }
            function hideFace() {
                img.hidden = true;
                if (letter) letter.hidden = false;
            }
            img.onload = showFace;
            img.onerror = hideFace;
            if (info && info.useAdexProxy && raw) img.src = adexSrc(raw);
            else {
                bindFavThumb(img, raw, foundTag, favThumbSource(raw));
                img.onload = showFace;
                img.onerror = hideFace;
                if (!img.getAttribute("src") && url) img.src = url;
            }
            if (img.complete && img.naturalWidth) showFace();
        });
    }
    function lbPaintList(node, rows) {
        var fan = node.querySelector(":scope > .lb-fan");
        if (!fan) return;
        fan.innerHTML = "";
        fan.hidden = false;
        var list = document.createElement("div");
        list.className = "lb-list";
        var token = _lbSubGen;
        var withFace = false;
        (rows || []).forEach(function (row) {
            if (row && row.thumbTag) withFace = true;
            var b = document.createElement("button");
            b.type = "button";
            b.className = "lb-list-btn" + (row.disabled ? " is-off" : "");
            if (row && row.thumbTag) {
                var ava = document.createElement("span");
                ava.className = "lb-list-ava";
                var letter = document.createElement("span");
                letter.className = "lb-list-letter";
                letter.textContent = ((row.label || "·").replace(/^\s+/, "").slice(0, 1)) || "·";
                var img = document.createElement("img");
                img.className = "lb-list-thumb";
                img.alt = "";
                img.hidden = true;
                ava.appendChild(letter);
                ava.appendChild(img);
                var copy = document.createElement("span");
                copy.className = "lb-list-copy";
                var en = document.createElement("span");
                en.className = "lb-list-en";
                en.textContent = row.label || "";
                var cn = document.createElement("span");
                cn.className = "lb-list-cn";
                copy.appendChild(en);
                copy.appendChild(cn);
                b.appendChild(ava);
                b.appendChild(copy);
                lbFillArtistFace(img, letter, cn, row.thumbTag, token);
            } else {
                b.textContent = row.label || "";
            }
            var sites = [];
            if (row && row.kids && !row.disabled) {
                try { sites = row.kids() || []; } catch (err) { sites = []; }
            }
            if (sites.length) {
                var line = document.createElement("div");
                line.className = "lb-list-row";
                b.onclick = function (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                };
                line.appendChild(b);
                sites.forEach(function (site) {
                    var sb = document.createElement("button");
                    sb.type = "button";
                    sb.className = "lb-site" + (site.disabled ? " is-off" : "");
                    sb.textContent = site.label || "";
                    sb.onclick = function (ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        lbRunRow(site);
                    };
                    line.appendChild(sb);
                });
                list.appendChild(line);
            } else {
                b.onclick = function (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    lbRunRow(row);
                };
                list.appendChild(b);
            }
        });
        if (withFace) list.classList.add("is-faces");
        fan.appendChild(list);
        var box = lbParentBox(node);
        var host = document.getElementById("lightbox");
        var hr = host ? host.getBoundingClientRect() : { left: 0, right: 800, top: 0, bottom: 600 };
        var orb = node.querySelector(".lb-orb");
        var or = orb ? orb.getBoundingClientRect() : { left: 0, right: 0, top: 0, bottom: 0 };
        var w = list.classList.contains("is-faces") ? 300 : 248;
        var openRight = (hr.right - or.right) >= (or.left - hr.left);
        var left = openRight ? (box.cx + box.orb / 2 - 10) : (box.cx - box.orb / 2 + 10 - w);
        list.style.width = w + "px";
        list.style.left = Math.round(left) + "px";
        list.style.top = Math.round(box.cy - 24) + "px";
        requestAnimationFrame(function () {
            if (!list.isConnected) return;
            var r = list.getBoundingClientRect();
            var dx = 0;
            var dy = 0;
            if (r.right > hr.right - 8) dx = hr.right - 8 - r.right;
            if (r.left < hr.left + 8) dx = hr.left + 8 - r.left;
            if (r.bottom > hr.bottom - 8) dy = hr.bottom - 8 - r.bottom;
            if (r.top < hr.top + 60) dy = hr.top + 60 - r.top;
            if (dx || dy) {
                list.style.left = (parseFloat(list.style.left) + dx) + "px";
                list.style.top = (parseFloat(list.style.top) + dy) + "px";
            }
        });
    }
    function lbRingDefault() {
        return ["compare", "artist", "character", "series", "searchArtist", "move", "download"];
    }
    function lbRingIds(available) {
        var allow = {};
        (available || []).forEach(function (a) { allow[a.id] = 1; });
        var saved = null;
        var hasSaved = false;
        try {
            var raw = localStorage.getItem("anima_opv_lb_ring");
            if (raw != null && raw !== "") {
                saved = JSON.parse(raw);
                hasSaved = true;
            }
        } catch (err) {}
        var src = hasSaved && saved && saved.concat ? saved : lbRingDefault();
        var out = [];
        src.forEach(function (id) {
            if (allow[id] && out.indexOf(id) < 0 && out.length < 7) out.push(id);
        });
        return out;
    }
    function lbRingSave(ids) {
        try { localStorage.setItem("anima_opv_lb_ring", JSON.stringify(ids || [])); } catch (err) {}
    }
    function lbHideRest() {
        var panel = document.getElementById("lb-more-rest");
        if (panel) {
            panel.hidden = true;
            panel.innerHTML = "";
        }
        var wrap = document.getElementById("lb-more");
        if (wrap) wrap.classList.remove("is-rest");
    }
    function lbPlaceRest() {
        var panel = document.getElementById("lb-more-rest");
        var host = document.getElementById("lightbox");
        var wrap = document.getElementById("lb-more");
        if (!panel || !host || !wrap) return;
        var hr = host.getBoundingClientRect();
        var wr = wrap.getBoundingClientRect();
        var view = { l: hr.left + 8, t: hr.top + 60, r: hr.right - 8, b: hr.bottom - 8 };
        var box = null;
        var nodes = document.querySelectorAll("#lb-more-ring > .lb-node");
        for (var i = 0; i < nodes.length; i++) {
            var left = wr.left + (parseFloat(nodes[i].style.left) || 0);
            var top = wr.top + (parseFloat(nodes[i].style.top) || 0);
            var b = { l: left - 18, t: top - 14, r: left + 94, b: top + 96 };
            if (!box) box = b;
            else {
                box.l = Math.min(box.l, b.l);
                box.t = Math.min(box.t, b.t);
                box.r = Math.max(box.r, b.r);
                box.b = Math.max(box.b, b.b);
            }
        }
        if (!box) box = { l: wr.left, t: wr.top, r: wr.right, b: wr.bottom };
        var gaps = [
            { x: view.l, y: view.t, w: box.l - view.l - 10, h: view.b - view.t, side: "l" },
            { x: box.r + 10, y: view.t, w: view.r - box.r - 10, h: view.b - view.t, side: "r" },
            { x: view.l, y: view.t, w: view.r - view.l, h: box.t - view.t - 10, side: "t" },
            { x: view.l, y: box.b + 10, w: view.r - view.l, h: view.b - box.b - 10, side: "b" }
        ];
        var more = document.querySelector("#lb-more-ring > .lb-node.is-more");
        var mr = more ? more.getBoundingClientRect() : wr;
        var best = null;
        gaps.forEach(function (g) {
            if (g.w < 176 || g.h < 140) return;
            var score = Math.min(g.w, 304) * Math.min(g.h, 480);
            var dist = 0;
            if (g.side === "l") dist = Math.abs((mr.left + mr.right) / 2 - (g.x + g.w));
            if (g.side === "r") dist = Math.abs((mr.left + mr.right) / 2 - g.x);
            if (g.side === "t") dist = Math.abs((mr.top + mr.bottom) / 2 - (g.y + g.h));
            if (g.side === "b") dist = Math.abs((mr.top + mr.bottom) / 2 - g.y);
            score -= dist;
            if (!best || score > best.score) best = { score: score, g: g };
        });
        var w = 280;
        var x = view.l;
        var y = view.t;
        var maxH = Math.min(480, view.b - view.t);
        if (best) {
            var g = best.g;
            w = Math.min(304, Math.floor(g.w));
            maxH = Math.max(140, Math.min(480, Math.floor(g.h)));
            x = g.side === "l" ? (g.x + g.w - w) : g.x;
            y = g.y;
            if (g.side === "t" || g.side === "b") {
                x = Math.max(g.x, Math.min(mr.left + mr.width / 2 - w / 2, g.x + g.w - w));
            } else {
                var wantY = mr.top - 20;
                y = Math.max(g.y, Math.min(wantY, g.y + g.h - 120));
            }
        }
        panel.style.width = Math.round(w) + "px";
        panel.style.maxHeight = Math.round(maxH) + "px";
        panel.style.left = Math.round(x - wr.left) + "px";
        panel.style.top = Math.round(y - wr.top) + "px";
    }
    function lbShowRest() {
        var panel = document.getElementById("lb-more-rest");
        if (!panel) return;
        var ids = lbRingIds(_lbActs);
        panel.hidden = false;
        panel.innerHTML = "";
        var head = document.createElement("div");
        head.className = "lb-rest-head";
        head.textContent = T("其余功能。点加号放进主圈，主圈上的叉可拿下");
        panel.appendChild(head);
        var grid = document.createElement("div");
        grid.className = "lb-rest-grid";
        _lbActs.forEach(function (item) {
            if (ids.indexOf(item.id) >= 0) return;
            var cell = document.createElement("div");
            cell.className = "lb-rest-cell";
            var b = document.createElement("button");
            b.type = "button";
            b.className = "lb-tile" + (item.act && item.act.danger ? " is-danger" : "");
            b.innerHTML = '<span class="lb-orb"></span><span class="lb-cap"></span>';
            b.querySelector(".lb-orb").innerHTML = item.icon;
            b.querySelector(".lb-cap").textContent = item.name;
            b.onclick = function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                var act = item.act || {};
                if (act.sub) {
                    var node = document.querySelector('#lb-more-ring > .lb-node.is-more');
                    if (node) {
                        _lbFanNode = node;
                        var fan = node.querySelector(":scope > .lb-fan");
                        if (fan) fan.hidden = false;
                        act.sub();
                    }
                    return;
                }
                if (act.fn) act.fn();
                if (!_lbMorePinned) lbMoreSet(false);
            };
            var pin = document.createElement("button");
            pin.type = "button";
            pin.className = "lb-pin";
            pin.title = T("放到主圈");
            pin.textContent = "＋";
            pin.onclick = function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                var next = lbRingIds(_lbActs);
                if (next.length >= 7) {
                    toast(T("主圈最多放 7 个，先拿掉一个"));
                    return;
                }
                next.push(item.id);
                lbRingSave(next);
                _lbRestOpen = true;
                fillLbMore();
            };
            cell.appendChild(b);
            cell.appendChild(pin);
            grid.appendChild(cell);
        });
        panel.appendChild(grid);
        var wrap = document.getElementById("lb-more");
        if (wrap) wrap.classList.add("is-rest");
        lbPlaceRest();
    }
    function lbSearchChoice(item) {
        var br = workflowBrowsers();
        var nSite = (br.danbooru ? 1 : 0) + (br.gelbooru ? 1 : 0);
        var name = item._label || item.tag || item.key || "";
        if (!nSite) return { label: name, disabled: true, tip: T("当前工作流没有 D站或 G站浏览器") };
        if (nSite === 1) return { label: name, fn: function () { searchOneItem(item); } };
        return {
            label: name,
            kids: function () {
                var rows = [];
                if (br.danbooru) rows.push({ label: T("去D站"), fn: function () { sendToWorkflowSearch("danbooru", item); } });
                if (br.gelbooru) rows.push({ label: T("去G站"), fn: function () { sendToWorkflowSearch("gelbooru", item); } });
                return rows;
            }
        };
    }
    function lbSearchSub(kind) {
        var it = state.sel;
        if (!it) return;
        var token = ++_lbSubGen;
        lbOpenSub([{ label: T("正在加载…"), disabled: true }]);
        fetchFileFacets(it).then(function (d) {
            if (token !== _lbSubGen) return;
            var list = [];
            var emptyTip = "";
            if (kind === "character") {
                list = uniqFacetItems((d && d.characters) || []);
                list.forEach(function (c) { c._label = charDisplayName(c); });
                emptyTip = T("这张图没有角色标签");
            } else if (kind === "series") {
                list = uniqFacetItems((d && d.series) || []).filter(function (s) { return s.key !== "__none__"; });
                list.forEach(function (s) { s._label = seriesDisplayName(s); });
                emptyTip = T("这张图没有系列标签");
            } else {
                list = uniqArtistItems((d && d.artists) || []);
                list.forEach(function (a) { a._label = artistDisplayName(a.tag || a.key); });
                emptyTip = T("这张图没有画师");
            }
            if (!list.length) lbOpenSub([{ label: emptyTip, disabled: true, tip: emptyTip }]);
            else if (kind === "artist") {
                lbOpenSub(list.map(function (item) {
                    var row = lbSearchChoice(item);
                    row.thumbTag = item.tag || item.key || "";
                    return row;
                }), { panel: true });
            } else lbOpenSub(list.map(lbSearchChoice));
        }).catch(function (e) {
            if (token !== _lbSubGen) return;
            lbOpenSub([{ label: extractErrorText(e), disabled: true }]);
        });
    }
    function lbCastSub(kind) {
        var it = state.sel;
        if (!it) return;
        var token = ++_lbSubGen;
        lbOpenSub([{ label: T("正在加载…"), disabled: true }]);
        fetchFileFacets(it).then(function (d) {
            if (token !== _lbSubGen) return;
            var list = [];
            var emptyTip = "";
            var apply = null;
            if (kind === "character") {
                list = uniqFacetItems((d && d.characters) || []);
                list.forEach(function (c) { c._label = charDisplayName(c); });
                emptyTip = T("这张图没有角色标签");
                apply = applyQuickCharacter;
            } else {
                list = uniqFacetItems((d && d.series) || []);
                if (!list.length && uniqFacetItems((d && d.characters) || []).length) list = [{ tag: "__none__", key: "__none__", _label: T("无系列") }];
                list.forEach(function (s) { if (!s._label) s._label = seriesDisplayName(s); });
                emptyTip = T("这张图没有系列标签");
                apply = applyQuickSeries;
            }
            if (!list.length) lbOpenSub([{ label: emptyTip, disabled: true, tip: emptyTip }]);
            else lbOpenSub(list.map(function (item) {
                return { label: item._label || item.tag || "", fn: function () { apply(item); } };
            }));
        }).catch(function (e) {
            if (token !== _lbSubGen) return;
            lbOpenSub([{ label: extractErrorText(e), disabled: true }]);
        });
    }
    function lbAiSub() {
        var it = state.sel;
        if (!it) return;
        var token = ++_lbSubGen;
        lbOpenSub([{ label: T("正在加载…"), disabled: true }]);
        fetchExtract(it).then(function (d) {
            if (token !== _lbSubGen) return;
            var arts = uniqArtistItems((d && d.artists) || []);
            if (!arts.length) {
                lbOpenSub([{ label: T("这张图没有画师"), disabled: true, tip: T("这张图没有画师") }]);
                return;
            }
            lbOpenSub(arts.map(function (a) {
                return { label: artistDisplayName(a.tag || a.key), fn: function () { assignLiveThumb(a.tag, it); } };
            }));
        }).catch(function (e) {
            if (token !== _lbSubGen) return;
            lbOpenSub([{ label: extractErrorText(e), disabled: true }]);
        });
    }
    function lbComboThumbSub() {
        var it = state.sel;
        if (!it) return;
        var token = ++_lbSubGen;
        lbOpenSub([{ label: T("正在加载…"), disabled: true }]);
        comboThumbChoices(it).then(function (pack) {
            if (token !== _lbSubGen) return;
            var rows = (pack && pack.rows) || [];
            if (!rows.length) {
                var tip = (pack && pack.empty) || T("没有对应的画师组合");
                lbOpenSub([{ label: tip, disabled: true, tip: tip }]);
                return;
            }
            lbOpenSub(rows.map(function (c) {
                return { label: c.name || T("未命名组合"), fn: function () { assignComboThumb(c, it); } };
            }));
        }).catch(function (e) {
            if (token !== _lbSubGen) return;
            lbOpenSub([{ label: extractErrorText(e), disabled: true }]);
        });
    }
    function lbMoveSub() {
        var it = state.sel;
        if (!it) return;
        var token = ++_lbSubGen;
        lbOpenSub([{ label: T("正在加载…"), disabled: true }], { panel: true });
        fetch("/danbooru_anima/output_prompt/manage_folders?current=" + encodeURIComponent(state.subfolder || "")).then(function (r) {
            if (r.status === 404) throw new Error("need_restart");
            return r.json();
        }).then(function (d) {
            if (token !== _lbSubGen) return;
            var rows = [{
                label: T("新建文件夹并移动…"),
                fn: function () { promptMkdir(ctxMoveItems(state.sel || it)); }
            }];
            var list = (d && d.folders) || [];
            list.forEach(function (f) {
                var dest = f.subfolder || "";
                var moving = ctxMoveItems(state.sel || it);
                var stay = moving.length > 0;
                for (var mi = 0; mi < moving.length; mi++) {
                    if ((moving[mi].subfolder || "") !== dest) { stay = false; break; }
                }
                if (stay) return;
                rows.push({
                    label: dest ? dest : T("output 根目录"),
                    fn: function () { moveItemsTo(ctxMoveItems(state.sel || it), dest); }
                });
            });
            if (rows.length === 1) rows.push({ label: T("还没有其它文件夹"), disabled: true });
            lbOpenSub(rows, { panel: true });
        }).catch(function (e) {
            if (token !== _lbSubGen) return;
            lbOpenSub([{ label: extractErrorText(e), disabled: true }], { panel: true });
        });
    }
    function lbTile(icon, name, act) {
        act = act || {};
        var node = document.createElement("div");
        node.className = "lb-node is-main" + (act.more ? " is-more" : "") + (act.sub ? " has-sub" : "") + (act.danger ? " is-danger" : "");
        node._act = act;
        node._level = 0;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "lb-tile" + (act.danger ? " is-danger" : "");
        b.innerHTML = '<span class="lb-orb"></span><span class="lb-cap"></span>';
        b.querySelector(".lb-orb").innerHTML = icon;
        b.querySelector(".lb-cap").textContent = name;
        var fan = document.createElement("div");
        fan.className = "lb-fan";
        fan.hidden = true;
        node.appendChild(b);
        node.appendChild(fan);
        if (act.id && !act.more) {
            var unpin = document.createElement("button");
            unpin.type = "button";
            unpin.className = "lb-unpin";
            unpin.title = T("移出主圈");
            unpin.textContent = "×";
            unpin.onclick = function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                var next = lbRingIds(_lbActs).filter(function (id) { return id !== act.id; });
                lbRingSave(next);
                _lbRestOpen = true;
                fillLbMore();
            };
            node.appendChild(unpin);
        }
        lbWatch(node);
        b.addEventListener("click", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            if (act.more) {
                _lbRestOpen = !_lbRestOpen;
                lbClearSub();
                if (_lbRestOpen) lbShowRest();
                else lbHideRest();
                return;
            }
            if (act.sub || act.kids) {
                lbArm(node);
                return;
            }
            if (act.fn) act.fn();
            if (!_lbMorePinned) lbMoreSet(false);
        });
        return node;
    }
    function lbCloseMenu() {
        _lbMorePinned = false;
        lbMoreSet(false);
    }
    function fillLbMore() {
        var ring = document.getElementById("lb-more-ring");
        var it = state.sel;
        if (!ring || !it) return;
        lbClearSub();
        ring.innerHTML = "";
        var picked = cmpFind(it) >= 0;
        var favOn = isImgFav(it);
        var catalog = [];
        function add(id, icon, name, act) {
            act = act || {};
            act.id = id;
            catalog.push({ id: id, icon: icon, name: name, act: act });
        }
        var stroke = 'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
        add("compare", lbIcon('<rect x="3.5" y="5" width="7" height="14" rx="1.4" ' + stroke + '/><rect x="13.5" y="5" width="7" height="14" rx="1.4" ' + stroke + '/>'), picked ? T("移出对比") : T("加入对比"), {
            fn: function () {
                var cur = state.sel; if (!cur) return;
                if (cmpFind(cur) >= 0) toggleCompareItem(cur);
                else {
                    if (!state.compareOn) setCompareMode(true);
                    if (cmpFind(cur) < 0) toggleCompareItem(cur);
                }
                if (_lbMorePinned && lbMoreOpen()) fillLbMore();
            }
        });
        add("artist", lbIcon('<circle cx="8" cy="8" r="2.5" ' + stroke + '/><path d="M3.8 18c.7-2.8 2.4-4.2 4.2-4.2s3.5 1.4 4.2 4.2" ' + stroke + '/><path d="M16 7.5h4.5M18.2 5.2v4.6" ' + stroke + '/>'), T("同画师"), {
            fn: function () {
                var cur = state.sel; if (!cur) return;
                fetchFileFacets(cur).then(function (d) { applyQuickArtist((d && d.artists) || []); }).catch(function (e) { toast(extractErrorText(e)); });
            }
        });
        add("character", lbIcon('<circle cx="12" cy="8" r="3" ' + stroke + '/><path d="M5 19c1.2-3 3.6-4.5 7-4.5S17.8 16 19 19" ' + stroke + '/>'), T("同角色"), { sub: function () { lbCastSub("character"); } });
        add("series", lbIcon('<path d="M4 7.5 12 4l8 3.5L12 11 4 7.5z" ' + stroke + '/><path d="M4 12.2 12 15.7l8-3.5M4 16.5 12 20l8-3.5" ' + stroke + '/>'), T("同系列"), { sub: function () { lbCastSub("series"); } });
        add("searchChar", lbIcon('<circle cx="10.5" cy="10.5" r="5.2" ' + stroke + '/><path d="M15 15.2 20 20" ' + stroke + '/>'), T("搜角色"), { sub: function () { lbSearchSub("character"); } });
        add("searchSeries", lbIcon('<circle cx="10.5" cy="10.5" r="5.2" ' + stroke + '/><path d="M15 15.2 20 20M8 10.5h5" ' + stroke + '/>'), T("搜系列"), { sub: function () { lbSearchSub("series"); } });
        add("searchArtist", lbIcon('<circle cx="10.5" cy="10.5" r="5.2" ' + stroke + '/><path d="M15 15.2 20 20M10.5 8.2v4.6" ' + stroke + '/>'), T("搜画师"), { sub: function () { lbSearchSub("artist"); } });
        add("remix", lbIcon('<path d="M12 3.5 13.6 8H18l-3.6 2.8 1.4 4.5L12 12.6 8.2 15.3 9.6 10.8 6 8h4.4L12 3.5z" ' + stroke + '/>'), T("生成同款"), {
            fn: function () { var cur = state.sel; lbCloseMenu(); if (cur) openPickArtist(cur); }
        });
        add("copyArtist", lbIcon('<rect x="8" y="4" width="11" height="14" rx="1.6" ' + stroke + '/><path d="M5 8v11.2A1.8 1.8 0 0 0 6.8 21H15" ' + stroke + '/>'), T("复制画师"), {
            fn: function () {
                var cur = state.sel; if (!cur) return;
                fetchExtract(cur).then(function (d) {
                    var arts = uniqArtists((d && d.artists) || []);
                    if (!arts.length) { toast(T("这张图没有画师")); return; }
                    copyText(arts.join(", "));
                }).catch(function (e) { toast(extractErrorText(e)); });
            }
        });
        add("combo", lbIcon('<path d="M8 7h11v12H8z" ' + stroke + '/><path d="M5 10V5h11" ' + stroke + '/>'), T("画师组合"), {
            fn: function () { var cur = state.sel; lbCloseMenu(); if (cur) openComboSave(cur); }
        });
        add("comboThumb", lbIcon('<rect x="4" y="6" width="16" height="12" rx="2" ' + stroke + '/><circle cx="9" cy="10" r="1.6" ' + stroke + '/><path d="M4 15.5 9 11l3 3 2.2-2.2L20 16" ' + stroke + '/>'), T("组合缩略图"), { sub: lbComboThumbSub });
        add("copyTags", lbIcon('<path d="M8 7.5h8l3 3.2V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 6.5 19V9A1.5 1.5 0 0 1 8 7.5z" ' + stroke + '/><path d="M16 7.5V11h3.2" ' + stroke + '/>'), T("复制标签"), {
            fn: function () {
                var cur = state.sel; if (!cur) return;
                fetchExtract(cur).then(function (d) {
                    copyText((d && (d.text || ((d.tags || []).join(", ")))) || "");
                }).catch(function (e) { toast(extractErrorText(e)); });
            }
        });
        add("copyParams", lbIcon('<path d="M5 7h14M5 12h14M5 17h9" ' + stroke + '/>'), T("复制参数"), {
            fn: function () {
                var cur = state.sel; if (!cur) return;
                fetchExtract(cur).then(function (d) { copyText((d && d.params_text) || ""); }).catch(function (e) { toast(extractErrorText(e)); });
            }
        });
        add("copyName", lbIcon('<path d="M7 4h7l5 5v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" ' + stroke + '/><path d="M14 4v5h5" ' + stroke + '/>'), T("复制文件名"), {
            fn: function () { var cur = state.sel; if (cur) copyText(cur.filename || ""); }
        });
        add("fav", lbIcon('<path d="M12 4.8 14.2 9l4.6.7-3.3 3.3.8 4.6L12 15.6 7.7 17.6l.8-4.6L5.2 9.7 9.8 9 12 4.8z" ' + stroke + '/>'), favOn ? T("移出收藏夹") : T("加入收藏夹"), {
            fn: function () {
                var cur = state.sel; if (!cur) return;
                toggleImgFav(cur).then(function () { if (_lbMorePinned && lbMoreOpen()) fillLbMore(); });
            }
        });
        add("favPrompt", lbIcon('<path d="M7 5.5h10a1 1 0 0 1 1 1V20l-6-3.2L6 20V6.5a1 1 0 0 1 1-1z" ' + stroke + '/>'), T("提示词收藏"), {
            fn: function () { var cur = state.sel; lbCloseMenu(); if (cur) openFavSave(cur); }
        });
        add("pinArtist", lbIcon('<path d="M12 4v10" ' + stroke + '/><path d="M8 8.5 12 4l4 4.5" ' + stroke + '/><path d="M6 20h12" ' + stroke + '/>'), T("画师置顶"), {
            fn: function () {
                var cur = state.sel; if (!cur) return;
                fetchExtract(cur).then(function (d) { pinArtistTags((d && d.artists) || []); }).catch(function (e) { toast(extractErrorText(e)); });
            }
        });
        add("aiThumb", lbIcon('<rect x="4" y="6" width="16" height="12" rx="2" ' + stroke + '/><circle cx="12" cy="12" r="2.4" ' + stroke + '/>'), T("AI缩略图"), { sub: lbAiSub });
        add("tab", lbIcon('<path d="M14 5h5v5" ' + stroke + '/><path d="M19 5 10 14" ' + stroke + '/><path d="M17 13.5V19H5V7h5.5" ' + stroke + '/>'), T("新标签页"), {
            fn: function () {
                var cur = state.sel;
                if (!cur || !cur.url) return;
                window.open(cur.url, "_blank", "noopener,noreferrer");
            }
        });
        add("download", lbIcon('<path d="M12 4v10" ' + stroke + '/><path d="M8 10.5 12 14.5l4-4" ' + stroke + '/><path d="M5 19h14" ' + stroke + '/>'), T("下载图片"), {
            fn: function () { downloadImage(state.sel); }
        });
        add("reveal", lbIcon('<path d="M4 8.5h6l2 2H20v8.2a1.3 1.3 0 0 1-1.3 1.3H5.3A1.3 1.3 0 0 1 4 18.7V8.5z" ' + stroke + '/>'), T("本地打开"), {
            fn: function () { revealLocalFile(state.sel); }
        });
        if (canManageFolders()) {
            var moveLabel = T("移动到文件夹");
            var moveCount = ctxMoveItems(it).length;
            if (moveCount > 1) moveLabel += "（" + moveCount + "）";
            add("move", lbIcon('<path d="M4 8h6l2 2h8v8.2a1.3 1.3 0 0 1-1.3 1.3H5.3A1.3 1.3 0 0 1 4 18.2V8z" ' + stroke + '/><path d="M14 13h4M16 11v4" ' + stroke + '/>'), moveLabel, { sub: lbMoveSub });
        }
        if (isTrashView()) {
            add("restore", lbIcon('<path d="M4 8h16" ' + stroke + '/><path d="M9 8V5h6v3" ' + stroke + '/><path d="M8 12h8M12 12v5" ' + stroke + '/>'), T("还原所在文件夹"), {
                fn: function () {
                    var cur = state.sel;
                    if (cur) restoreTrashFolder(trashRelOf(cur.subfolder || ""));
                }
            });
        } else {
            add("delete", lbIcon('<path d="M5 7h14" ' + stroke + '/><path d="M9 7V5h6v2" ' + stroke + '/><path d="M7.5 7l.7 12h7.6l.7-12" ' + stroke + '/>'), T("删除图片"), {
                danger: true,
                fn: function () { recycleLocalFile(state.sel); }
            });
        }
        _lbActs = catalog;
        var chosen = lbRingIds(catalog);
        var byId = {};
        catalog.forEach(function (item) { byId[item.id] = item; });
        chosen.forEach(function (id) {
            var item = byId[id];
            if (!item) return;
            ring.appendChild(lbTile(item.icon, item.name, item.act));
        });
        var hiddenN = catalog.length - chosen.length;
        if (hiddenN > 0) {
            ring.appendChild(lbTile(
                lbIcon('<path d="M12 6v12M6 12h12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
                T("更多"),
                { id: "more", more: true }
            ));
        }
        lbRelayoutRing();
        if (_lbRestOpen) lbShowRest();
    }

    function openLightbox(it) {
        if (!it) return;
        _lbFile = it;
        hidePeek();
        var box = document.getElementById("lightbox");
        var img = document.getElementById("lightbox-img");
        document.getElementById("lb-name").textContent = it.filename + (it.subfolder ? "  ·  " + it.subfolder : "");
        box.hidden = false;
        document.body.classList.add("lb-on");
        var moreWrap = document.getElementById("lb-more");
        if (moreWrap) {
            moreWrap.classList.remove("is-in");
            requestAnimationFrame(function () { moreWrap.classList.add("is-in"); });
        }
        _lb.zoom = 1;
        _lb.x = 0;
        _lb.y = 0;
        img.alt = it.filename || "";
        img.onload = function () { lbFit(); };
        var abs = "";
        try { abs = new URL(it.url, window.location.href).href; } catch (err) { abs = it.url || ""; }
        if (img.src !== abs) img.src = it.url;
        if (img.complete && img.naturalWidth) requestAnimationFrame(function () { lbFit(); });
        syncLbFileDrag();
        if (lbMoreOpen()) fillLbMore();
    }

    function closeLightbox() {
        _lbMorePinned = false;
        _lbFile = null;
        lbMoreSet(false);
        var box = document.getElementById("lightbox");
        if (box) box.hidden = true;
        document.body.classList.remove("lb-on");
        var moreWrap = document.getElementById("lb-more");
        if (moreWrap) moreWrap.classList.remove("is-in");
        syncLbFileDrag();
    }

    function hidePeek() {
        if (_peekT) { clearTimeout(_peekT); _peekT = null; }
        _peekGen++;
        _peekAnchor = null;
        var box = document.getElementById("peek");
        if (box) box.hidden = true;
    }

    function placePeek(anchor) {
        var box = document.getElementById("peek");
        var img = document.getElementById("peek-img");
        var cap = document.getElementById("peek-cap");
        if (!box || box.hidden || !anchor) return;
        if (img) {
            img.style.maxWidth = "";
            img.style.maxHeight = "";
        }
        if (cap) cap.style.maxWidth = "";
        var pw = box.offsetWidth || 480;
        var ph = box.offsetHeight || 480;
        var ar = anchor.getBoundingClientRect();
        var x = ar.right + 14;
        if (x + pw > window.innerWidth - 10) x = ar.left - pw - 14;
        if (x < 10) x = Math.max(10, Math.round((window.innerWidth - pw) / 2));
        var y = Math.round(ar.top + ar.height / 2 - ph / 2);
        if (y < 10) y = 10;
        if (y + ph > window.innerHeight - 10) y = Math.max(10, window.innerHeight - ph - 10);
        box.style.left = Math.round(x) + "px";
        box.style.top = Math.round(y) + "px";
    }

    function relayoutPeek() {
        if (_peekAnchor) placePeek(_peekAnchor);
    }

    function showPeek(it, tile, opts) {
        if (!it) return;
        if (!(opts && opts.allowWhileBusy) && (state.compareOn || lbOpen() || cmpOpen() || ctxOpen())) return;
        var pick = document.getElementById("pick-artist");
        if (pick && !pick.hidden) return;
        var box = document.getElementById("peek");
        var img = document.getElementById("peek-img");
        var cap = document.getElementById("peek-cap");
        if (!box || !img) return;
        _peekAnchor = tile;
        var my = ++_peekGen;
        function reveal() {
            if (my !== _peekGen) return;
            box.hidden = false;
            placePeek(tile);
        }
        img.onload = reveal;
        img.src = it.url;
        img.alt = it.filename || "";
        if (cap) cap.textContent = it.filename || "";
        if (img.complete && img.naturalWidth) reveal();
    }

    function lbNav(dir) {
        var items = state.items || [];
        if (!items.length || !state.sel) return;
        var i = -1;
        var key = itemKey(state.sel);
        for (var n = 0; n < items.length; n++) {
            if (itemKey(items[n]) === key) { i = n; break; }
        }
        var j = i + dir;
        if (j < 0 || j >= items.length) return;
        selectItem(items[j], true);
        openLightbox(items[j]);
    }

    function cmpFind(it) {
        var key = itemKey(it);
        for (var i = 0; i < state.compareItems.length; i++) {
            if (itemKey(state.compareItems[i]) === key) return i;
        }
        return -1;
    }

    function stopBlink() {
        if (_blinkTimer) { clearInterval(_blinkTimer); _blinkTimer = null; }
    }

    function paintCompareToggle() {
        var btn = document.getElementById("btn-compare");
        if (!btn) return;
        var on = !!state.compareOn;
        btn.classList.toggle("on", on);
        btn.classList.toggle("is-exit", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.textContent = on ? T("退出对比") : T("对比");
        btn.title = on ? T("退出对比，回到普通浏览") : T("开启对比，点图勾选");
    }
    function exitCompareMode() {
        state.compareItems = [];
        state.cmpA = 0;
        state.cmpB = 1;
        setCompareMode(false);
    }
    function setCompareMode(on) {
        hidePeek();
        state.compareOn = !!on;
        document.body.classList.toggle("compare-on", state.compareOn);
        paintCompareToggle();
        renderCompareDock();
        syncTileFlags();
        if (!state.compareOn) closeCompare();
        layoutAllDocks();
    }

    function renderCompareDock() {
        var dock = document.getElementById("cmp-dock");
        var thumbs = document.getElementById("cmp-dock-thumbs");
        var go = document.getElementById("cmp-go");
        var clr = document.getElementById("cmp-clear");
        var exitBtn = document.getElementById("cmp-exit");
        var tip = document.getElementById("cmp-dock-tip");
        var n = state.compareItems.length;
        paintCompareToggle();
        if (!dock) return;
        if (!state.compareOn) {
            dock.hidden = true;
            scheduleDockLayout();
            return;
        }
        dock.hidden = false;
        fillCmpThumbs(thumbs, false);
        if (tip) {
            if (n < 1) tip.textContent = T("点图勾选");
            else if (n < 2) tip.textContent = T("再选一张");
            else tip.textContent = "";
            tip.hidden = n >= 2;
        }
        if (go) {
            go.textContent = n ? (T("开始对比") + " (" + n + ")") : T("开始对比");
            go.disabled = n < 2;
            go.title = n < 2 ? T("至少选两张图才能对比") : T("开始对比");
        }
        if (clr) {
            clr.textContent = T("清空");
            clr.hidden = n < 1;
        }
        if (exitBtn) exitBtn.textContent = T("退出对比");
        scheduleDockLayout();
    }

    function toggleCompareItem(it) {
        var i = cmpFind(it);
        if (i >= 0) {
            state.compareItems.splice(i, 1);
            if (state.cmpA >= state.compareItems.length) state.cmpA = 0;
            if (state.cmpB >= state.compareItems.length) state.cmpB = Math.min(1, state.compareItems.length - 1);
            if (state.cmpA === state.cmpB && state.compareItems.length > 1) state.cmpB = state.cmpA === 0 ? 1 : 0;
        } else {
            if (state.compareItems.length >= CMP_MAX) {
                toast(T("最多对比 8 张"));
                return;
            }
            state.compareItems.push(it);
            if (state.compareItems.length === 2) state.cmpB = 1;
        }
        renderCompareDock();
        syncTileFlags();
        refreshOpenCompare();
    }

    function setCmpSlot(which, idx) {
        var n = state.compareItems.length;
        if (idx < 0 || idx >= n) return;
        if (which === "b") {
            state.cmpB = idx;
            if (state.cmpA === idx) state.cmpA = idx === 0 && n > 1 ? 1 : 0;
        } else {
            state.cmpA = idx;
            if (state.cmpB === idx) state.cmpB = idx === 0 && n > 1 ? 1 : 0;
        }
        renderCompareDock();
        refreshOpenCompare();
    }

    function fillCmpThumbs(box, pairIdle) {
        if (!box) return;
        box.innerHTML = "";
        state.compareItems.forEach(function (it, idx) {
            var d = el("div");
            var idle = pairIdle && idx !== state.cmpA && idx !== state.cmpB;
            d.className = "dt" + (idx === state.cmpA ? " is-a" : "") + (idx === state.cmpB ? " is-b" : "") + (idle ? " is-idle" : "");
            var img = document.createElement("img");
            img.src = it.url;
            img.alt = it.filename;
            d.appendChild(img);
            if (idx === state.cmpA || idx === state.cmpB) {
                var mk = el("span", "", idx === state.cmpA ? "A" : "B");
                mk.className = "mark";
                d.appendChild(mk);
            }
            d.title = it.filename + " — " + T("点设为 A，右键设为 B");
            d.onclick = function () { setCmpSlot("a", idx); };
            d.oncontextmenu = function (e) {
                e.preventDefault();
                e.stopPropagation();
                setCmpSlot("b", idx);
            };
            box.appendChild(d);
        });
    }

    function refreshOpenCompare() {
        var layer = document.getElementById("compare");
        if (layer && !layer.hidden) renderCompareStage();
    }

    function cmpItem(which) {
        var list = state.compareItems;
        if (!list.length) return null;
        var i = which === "b" ? state.cmpB : state.cmpA;
        if (i < 0 || i >= list.length) i = which === "b" ? 1 : 0;
        return list[i] || list[0];
    }

    function closeCompare() {
        stopBlink();
        resetSideZoom();
        document.getElementById("compare").hidden = true;
        var info = document.getElementById("cmp-info");
        if (info) {
            info.hidden = true;
            info.innerHTML = "";
        }
        if (typeof window.animaKillChipFlyouts === "function") window.animaKillChipFlyouts();
    }

    function setCmpMode(id) {
        if (id === state.compareMode) return;
        resetSideZoom();
        state.compareMode = id;
        renderCompareStage();
    }
    function cmpShowsAll() {
        return state.compareMode === "side" || state.compareMode === "grid";
    }
    function cmpPaneShape(n, side) {
        var cols;
        if (side) {
            if (n <= 5) cols = n;
            else if (n <= 6) cols = 3;
            else cols = 4;
        } else if (n <= 3) cols = n;
        else if (n === 4) cols = 2;
        else if (n <= 6) cols = 3;
        else cols = 4;
        if (cols < 1) cols = 1;
        return { cols: cols, rows: Math.ceil(n / cols) };
    }
    function applyCmpPaneGrid(box, n, side) {
        var shape = cmpPaneShape(n, side);
        box.style.gridTemplateColumns = "repeat(" + shape.cols + ", minmax(0, 1fr))";
        box.style.gridTemplateRows = "repeat(" + shape.rows + ", minmax(0, 1fr))";
    }

    function renderCompareStage() {
        stopBlink();
        var stage = document.getElementById("cmp-stage");
        var tools = document.getElementById("cmp-tools");
        var modes = document.getElementById("cmp-modes");
        var hint = document.getElementById("cmp-hint");
        stage.innerHTML = "";
        tools.innerHTML = "";
        tools.hidden = false;
        modes.innerHTML = "";
        CMP_MODES.forEach(function (m) {
            var b = el("button", "", T(m.zh));
            b.type = "button";
            b.className = (m.id === state.compareMode ? "on" : "ghost");
            b.title = (m.id === "grid" || m.id === "side") ? T("一次看全部已选图，滚轮可放大") : T("只对比 A 和 B 两张");
            b.onclick = function () { setCmpMode(m.id); };
            modes.appendChild(b);
        });
        var picks = document.getElementById("cmp-picks");
        var list = state.compareItems;
        if (picks) {
            picks.hidden = list.length < 2;
            fillCmpThumbs(picks, !cmpShowsAll());
        }
        if (hint) {
            if (cmpShowsAll()) hint.textContent = T("已选 ") + list.length + T(" 张都在画面里。滚轮放大，拖动移动，双击还原");
            else if (list.length > 2) hint.textContent = T("这个模式只比 A / B。要一起看 ") + list.length + T(" 张，用并排或宫格");
            else hint.textContent = T("点缩略图换 A，右键换 B");
        }
        if (list.length < 2) {
            stage.appendChild(el("div", "", T("至少选两张图才能对比")));
            stage.lastChild.className = "empty";
            tools.hidden = true;
            renderCompareMeta();
            return;
        }
        var a = cmpItem("a");
        var b = cmpItem("b");
        if (state.compareMode === "grid") renderGridCompare(stage, tools, list);
        else if (state.compareMode === "side") renderSide(stage, tools, list);
        else if (state.compareMode === "overlay") renderOverlay(stage, tools, a, b);
        else if (state.compareMode === "blink") renderBlink(stage, tools, a, b);
        else if (state.compareMode === "diff") renderDiff(stage, a, b);
        else renderSlider(stage, a, b);
        tools.hidden = !tools.childNodes.length;
        renderCompareMeta();
    }

    function mkCmpImg(src, alt, cls) {
        var img = document.createElement("img");
        img.src = src;
        img.alt = alt || "";
        if (cls) img.className = cls;
        img.draggable = false;
        return img;
    }

    function mkCmpBadge(text, kind) {
        var s = el("span", "", text);
        s.className = "cmp-badge" + (kind ? " is-" + kind : "");
        return s;
    }

    function memoCmpExtract(it) {
        var key = itemKey(it);
        if (!key) return Promise.resolve({});
        if (_cmpExtractMemo[key]) return _cmpExtractMemo[key];
        var p = fetchExtract(it).then(function (d) {
            return d || {};
        }).catch(function (e) {
            return { ok: false, error: extractErrorText(e), tags: [], artists: [], text: "", params: [] };
        });
        _cmpExtractMemo[key] = p;
        return p;
    }

    function paramValMap(d) {
        var m = {};
        ((d && d.params) || []).forEach(function (row) {
            var k = row.label || row.key || "";
            if (k) m[k] = row.value || "";
        });
        return m;
    }

    function paintCmpDiffs(box) {
        if (!box) return;
        var cards = box.querySelectorAll(".cmp-meta");
        if (cards.length < 2) return;
        var byKey = {};
        for (var i = 0; i < cards.length; i++) {
            var kvs = cards[i].querySelectorAll(".cmp-kv");
            for (var j = 0; j < kvs.length; j++) {
                var k = kvs[j].getAttribute("data-k") || "";
                if (!k) continue;
                if (!byKey[k]) byKey[k] = [];
                byKey[k].push(kvs[j].getAttribute("data-v") || "");
            }
        }
        Object.keys(byKey).forEach(function (k) {
            var seen = {};
            var arr = byKey[k];
            for (var n = 0; n < arr.length; n++) seen[arr[n]] = 1;
            if (Object.keys(seen).length < 2) return;
            var nodes = box.querySelectorAll(".cmp-kv");
            for (var p = 0; p < nodes.length; p++) {
                if (nodes[p].getAttribute("data-k") === k) nodes[p].classList.add("is-diff");
            }
        });
    }

    function bindCmpArtistThumb(img, tag) {
        if (!img || !tag) return;
        if (liveModeOn()) {
            var lv = liveFavThumb(tag);
            if (!lv) { img.hidden = true; return; }
            img.removeAttribute("style");
            img.hidden = false;
            img.src = lv;
            img.onerror = function () { img.hidden = true; };
            return;
        }
        resolveArtistForFlyout(tag).then(function (info) {
            if (!img.isConnected) return;
            var foundTag = (info && info.found && info.found.tag) || tag;
            var raw = (info && info.thumbUrl) || "";
            var url = info && info.useAdexProxy ? adexSrc(raw) : favImgUrl(raw, foundTag);
            if (!url) url = favImgUrl(raw, tag);
            if (!url) url = localFavThumb(foundTag) || localFavThumb(tag);
            if (!url) { img.hidden = true; return; }
            img.removeAttribute("style");
            img.hidden = false;
            img.src = url;
            img.onerror = function () { img.hidden = true; };
        });
    }

    function fillCmpMetaCard(card, it, mark) {
        card.innerHTML = "";
        card.className = "cmp-meta";
        card.setAttribute("data-cmp-key", itemKey(it));
        var hd = el("div");
        hd.className = "cmp-meta-hd";
        var mk = el("span", "", mark);
        mk.className = "cmp-meta-mark" + (mark === "A" ? " is-a" : mark === "B" ? " is-b" : "");
        var av = document.createElement("img");
        av.className = "cmp-meta-av";
        av.alt = "";
        av.hidden = true;
        var name = el("span", "", it.filename || "");
        name.className = "cmp-meta-name";
        name.title = it.filename || "";
        name.onclick = function () { copyText(it.filename || ""); };
        hd.appendChild(mk);
        hd.appendChild(av);
        hd.appendChild(name);
        card.appendChild(hd);
        var wait = el("div", "", T("加载中..."));
        wait.className = "cmp-meta-wait";
        card.appendChild(wait);
        memoCmpExtract(it).then(function (d) {
            if (card.getAttribute("data-cmp-key") !== itemKey(it)) return;
            wait.remove();
            var rows = el("div");
            rows.className = "cmp-meta-params";
            var pmap = paramValMap(d);
            var shown = 0;
            CMP_PARAM_KEYS.forEach(function (lab) {
                var val = pmap[lab];
                if (!val) return;
                shown++;
                var kv = el("button");
                kv.type = "button";
                kv.className = "cmp-kv";
                kv.setAttribute("data-k", lab);
                kv.setAttribute("data-v", val);
                kv.title = (lab ? lab + ": " : "") + val;
                var k = el("span", "", T(lab));
                k.className = "k";
                var v = el("span", "", val);
                v.className = "v";
                kv.appendChild(k);
                kv.appendChild(v);
                kv.onclick = function () { copyText(val); };
                rows.appendChild(kv);
            });
            ((d && d.params) || []).forEach(function (row) {
                if (row.key !== "lora" && row.label !== "LoRA") return;
                var val = row.value || "";
                if (!val) return;
                shown++;
                var kv = el("button");
                kv.type = "button";
                kv.className = "cmp-kv is-lora";
                kv.setAttribute("data-k", "LoRA");
                kv.setAttribute("data-v", val);
                kv.title = "LoRA: " + val;
                var k = el("span", "", "LoRA");
                k.className = "k";
                var v = el("span", "", val);
                v.className = "v";
                kv.appendChild(k);
                kv.appendChild(v);
                kv.onclick = function () { copyText(val); };
                rows.appendChild(kv);
            });
            if (shown) card.appendChild(rows);
            var arts = uniqArtists((d && d.artists) || []);
            var artBox = el("div");
            artBox.className = "cmp-arts";
            if (!arts.length) {
                var empty = el("span", "", T("无画师"));
                empty.className = "cmp-arts-empty";
                artBox.appendChild(empty);
            } else {
                bindCmpArtistThumb(av, arts[0]);
                arts.forEach(function (tag) {
                    var chip = makeArtistChip(tag);
                    chip.title = T("点击标签复制") + " · " + T("悬停查看画师缩略图");
                    artBox.appendChild(chip);
                });
            }
            card.appendChild(artBox);
            var box = document.getElementById("cmp-info");
            if (box && !box.querySelector(".cmp-meta-wait")) paintCmpDiffs(box);
        });
    }

    function renderCompareMeta() {
        var box = document.getElementById("cmp-info");
        if (!box) return;
        box.innerHTML = "";
        if (typeof window.animaKillChipFlyouts === "function") window.animaKillChipFlyouts();
        var list = state.compareItems;
        if (!list || list.length < 2) {
            box.hidden = true;
            return;
        }
        box.hidden = false;
        var items, marks;
        if (cmpShowsAll()) {
            items = list.slice();
            marks = items.map(function (_, i) { return String(i + 1); });
            box.className = "cmp-info is-multi";
        } else {
            items = [cmpItem("a"), cmpItem("b")];
            marks = ["A", "B"];
            box.className = "cmp-info is-ab";
        }
        items.forEach(function (it, idx) {
            if (!it) return;
            var card = el("div");
            box.appendChild(card);
            fillCmpMetaCard(card, it, marks[idx]);
        });
    }

    function renderSlider(stage, a, b) {
        var frame = el("div");
        frame.className = "cmp-frame";
        var imgB = mkCmpImg(b.url, b.filename, "cmp-img");
        var clip = el("div");
        clip.className = "cmp-clip";
        var imgA = mkCmpImg(a.url, a.filename, "cmp-img");
        clip.appendChild(imgA);
        var wipe = el("div");
        wipe.className = "cmp-wipe";
        frame.appendChild(imgB);
        frame.appendChild(clip);
        frame.appendChild(wipe);
        frame.appendChild(mkCmpBadge("A", "a"));
        frame.appendChild(mkCmpBadge("B", "b"));
        stage.appendChild(frame);
        function apply(pct) {
            pct = Math.max(0, Math.min(100, pct));
            state.wipePct = pct;
            var w = frame.clientWidth || 1;
            clip.style.width = pct + "%";
            clip.style.setProperty("--stage-w", w + "px");
            wipe.style.left = pct + "%";
        }
        function posFromEvent(e) {
            var r = frame.getBoundingClientRect();
            return ((e.clientX - r.left) / Math.max(1, r.width)) * 100;
        }
        frame.onpointerdown = function (e) {
            _wipeDrag = true;
            try { frame.setPointerCapture(e.pointerId); } catch (err) {}
            apply(posFromEvent(e));
        };
        frame.onpointermove = function (e) { if (_wipeDrag) apply(posFromEvent(e)); };
        function endWipe(e) {
            _wipeDrag = false;
            try { if (e) frame.releasePointerCapture(e.pointerId); } catch (err) {}
        }
        frame.onpointerup = endWipe;
        frame.onpointercancel = endWipe;
        frame.onlostpointercapture = endWipe;
        requestAnimationFrame(function () { apply(state.wipePct); });
    }

    function renderOverlay(stage, tools, a, b) {
        var frame = el("div");
        frame.className = "cmp-frame";
        frame.appendChild(mkCmpImg(b.url, b.filename, "cmp-img"));
        var top = mkCmpImg(a.url, a.filename, "cmp-img");
        top.style.opacity = String(state.overlayPct / 100);
        frame.appendChild(top);
        frame.appendChild(mkCmpBadge("A", "a"));
        frame.appendChild(mkCmpBadge("B", "b"));
        stage.appendChild(frame);
        var lab = el("span", "", T("叠图透明度"));
        var rng = document.createElement("input");
        rng.type = "range";
        rng.min = "0"; rng.max = "100"; rng.value = String(state.overlayPct);
        rng.oninput = function () {
            state.overlayPct = parseInt(rng.value, 10) || 0;
            top.style.opacity = String(state.overlayPct / 100);
        };
        tools.appendChild(lab);
        tools.appendChild(rng);
    }

    var SIDE_ZOOM_MIN = 1;
    var SIDE_ZOOM_MAX = 8;
    function resetSideZoom() {
        state.cmpSide = { s: 1, x: 0, y: 0 };
    }
    function sideZoomState() {
        if (!state.cmpSide || typeof state.cmpSide.s !== "number") resetSideZoom();
        return state.cmpSide;
    }
    function applySideZoom(box) {
        if (!box) return;
        var z = sideZoomState();
        var views = box.querySelectorAll(".cmp-view");
        if (!views.length) return;
        var r = views[0].getBoundingClientRect();
        var w = r.width || 1;
        var h = r.height || 1;
        if (z.s <= 1.001) {
            z.s = 1;
            z.x = 0;
            z.y = 0;
        } else {
            var minX = w - z.s * w;
            var minY = h - z.s * h;
            if (z.x > 0) z.x = 0;
            if (z.y > 0) z.y = 0;
            if (z.x < minX) z.x = minX;
            if (z.y < minY) z.y = minY;
        }
        var t = "translate(" + z.x + "px," + z.y + "px) scale(" + z.s + ")";
        for (var i = 0; i < views.length; i++) {
            var zoomEl = views[i].querySelector(".cmp-zoom");
            if (zoomEl) zoomEl.style.transform = t;
            views[i].classList.toggle("is-zoomed", z.s > 1);
        }
    }
    function mkSideCell(it, mark) {
        var cell = el("div");
        cell.className = "cell";
        var view = el("div");
        view.className = "cmp-view";
        var zoomEl = el("div");
        zoomEl.className = "cmp-zoom";
        zoomEl.appendChild(mkCmpImg(it.url, it.filename));
        view.appendChild(zoomEl);
        cell.appendChild(view);
        var kind = mark === "A" ? "a" : (mark === "B" ? "b" : "n");
        cell.appendChild(mkCmpBadge(mark, kind));
        return cell;
    }
    function appendZoomTools(tools, box) {
        var rst = el("button", "", T("适应窗口"));
        rst.type = "button";
        rst.className = "ghost";
        rst.onclick = function () {
            resetSideZoom();
            applySideZoom(box);
        };
        var tip = el("span", "", T("滚轮同时放大，拖动同时移动，双击复位"));
        tools.appendChild(rst);
        tools.appendChild(tip);
    }
    function bindSidePanZoom(box) {
        var z = sideZoomState();
        var views = box.querySelectorAll(".cmp-view");
        function viewOf(t) {
            return t && t.closest ? t.closest(".cmp-view") : null;
        }
        function zoomAt(view, cx, cy, nextS) {
            nextS = Math.max(SIDE_ZOOM_MIN, Math.min(SIDE_ZOOM_MAX, nextS));
            var r = (view || views[0]).getBoundingClientRect();
            var px = cx - r.left;
            var py = cy - r.top;
            var s0 = z.s || 1;
            z.x = px - (px - z.x) * (nextS / s0);
            z.y = py - (py - z.y) * (nextS / s0);
            z.s = nextS;
            applySideZoom(box);
        }
        box.addEventListener("wheel", function (e) {
            e.preventDefault();
            e.stopPropagation();
            var view = viewOf(e.target) || views[0];
            if (!view) return;
            var dy = e.deltaY;
            if (e.deltaMode === 1) dy *= 16;
            if (e.deltaMode === 2) dy *= 120;
            var factor = dy < 0 ? 1.12 : 1 / 1.12;
            zoomAt(view, e.clientX, e.clientY, z.s * factor);
        }, { passive: false });
        var drag = null;
        box.addEventListener("pointerdown", function (e) {
            if (e.button !== 0) return;
            if (z.s <= 1) return;
            var view = viewOf(e.target);
            if (!view) return;
            e.preventDefault();
            drag = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: z.x, oy: z.y };
            box.classList.add("is-drag");
            try { view.setPointerCapture(e.pointerId); } catch (err) {}
        });
        box.addEventListener("pointermove", function (e) {
            if (!drag || e.pointerId !== drag.id) return;
            z.x = drag.ox + (e.clientX - drag.x);
            z.y = drag.oy + (e.clientY - drag.y);
            applySideZoom(box);
        });
        function endDrag(e) {
            if (!drag) return;
            if (e && e.pointerId != null && e.pointerId !== drag.id) return;
            box.classList.remove("is-drag");
            drag = null;
        }
        box.addEventListener("pointerup", endDrag);
        box.addEventListener("pointercancel", endDrag);
        box.addEventListener("lostpointercapture", endDrag);
        box.addEventListener("dblclick", function (e) {
            e.preventDefault();
            resetSideZoom();
            applySideZoom(box);
        });
        applySideZoom(box);
        requestAnimationFrame(function () { applySideZoom(box); });
    }
    function renderSide(stage, tools, list) {
        var box = el("div");
        box.className = "cmp-side";
        applyCmpPaneGrid(box, list.length, true);
        list.forEach(function (it, idx) {
            box.appendChild(mkSideCell(it, String(idx + 1)));
        });
        stage.appendChild(box);
        bindSidePanZoom(box);
        appendZoomTools(tools, box);
    }

    function renderBlink(stage, tools, a, b) {
        var frame = el("div");
        frame.className = "cmp-frame";
        var imgA = mkCmpImg(a.url, a.filename, "cmp-img");
        var imgB = mkCmpImg(b.url, b.filename, "cmp-img");
        imgB.style.opacity = "0";
        frame.appendChild(imgA);
        frame.appendChild(imgB);
        frame.appendChild(mkCmpBadge("A", "a"));
        frame.appendChild(mkCmpBadge("B", "b"));
        stage.appendChild(frame);
        var showB = false;
        function tick() {
            showB = !showB;
            imgA.style.opacity = showB ? "0" : "1";
            imgB.style.opacity = showB ? "1" : "0";
        }
        stopBlink();
        _blinkTimer = setInterval(tick, Math.max(80, state.blinkMs));
        var lab = el("span", "", T("闪切速度"));
        var rng = document.createElement("input");
        rng.type = "range";
        rng.min = "80"; rng.max = "1200"; rng.value = String(state.blinkMs);
        rng.oninput = function () {
            state.blinkMs = parseInt(rng.value, 10) || 400;
            stopBlink();
            _blinkTimer = setInterval(tick, Math.max(80, state.blinkMs));
        };
        tools.appendChild(lab);
        tools.appendChild(rng);
    }

    function renderGridCompare(stage, tools, list) {
        var box = el("div");
        box.className = "cmp-grid";
        applyCmpPaneGrid(box, list.length, false);
        list.forEach(function (it, idx) {
            box.appendChild(mkSideCell(it, String(idx + 1)));
        });
        stage.appendChild(box);
        bindSidePanZoom(box);
        appendZoomTools(tools, box);
    }

    function renderDiff(stage, a, b) {
        var frame = el("div");
        frame.className = "cmp-frame";
        var canvas = document.createElement("canvas");
        canvas.className = "cmp-img";
        canvas.style.objectFit = "contain";
        frame.appendChild(canvas);
        stage.appendChild(frame);
        function load(url) {
            return new Promise(function (resolve, reject) {
                var img = new Image();
                img.onload = function () { resolve(img); };
                img.onerror = reject;
                img.src = url;
            });
        }
        Promise.all([load(a.url), load(b.url)]).then(function (imgs) {
            var w = Math.max(imgs[0].naturalWidth, imgs[1].naturalWidth);
            var h = Math.max(imgs[0].naturalHeight, imgs[1].naturalHeight);
            w = Math.min(w, 2048);
            h = Math.min(h, 2048);
            var off = document.createElement("canvas");
            off.width = w; off.height = h;
            canvas.width = w; canvas.height = h;
            var ctx = off.getContext("2d");
            var out = canvas.getContext("2d");
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(imgs[0], 0, 0, w, h);
            var d1 = ctx.getImageData(0, 0, w, h);
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(imgs[1], 0, 0, w, h);
            var d2 = ctx.getImageData(0, 0, w, h);
            var p1 = d1.data, p2 = d2.data;
            for (var i = 0; i < p1.length; i += 4) {
                p1[i] = Math.abs(p1[i] - p2[i]);
                p1[i + 1] = Math.abs(p1[i + 1] - p2[i + 1]);
                p1[i + 2] = Math.abs(p1[i + 2] - p2[i + 2]);
                p1[i + 3] = 255;
            }
            out.putImageData(d1, 0, 0);
        }).catch(function () {
            stage.innerHTML = "";
            stage.appendChild(el("div", "", T("差值图无法绘制（跨域或图片加载失败）")));
            stage.lastChild.className = "empty";
        });
    }

    function openCompare() {
        if (state.compareItems.length < 2) {
            toast(T("至少选两张图才能对比"));
            return;
        }
        hidePeek();
        if (state.cmpA === state.cmpB) state.cmpB = state.cmpA === 0 ? 1 : 0;
        closeLightbox();
        document.getElementById("compare").hidden = false;
        renderCompareStage();
    }

    function artistNormKey(tag) {
        var raw = String(tag || "").trim();
        if (!raw) return "";
        var p = window.animaParseWeightTag ? window.animaParseWeightTag(raw) : { tag: raw };
        var inner = p.tag || raw;
        inner = String(inner).replace(/^@+/, "").replace(/^artist:/i, "");
        return window.animaArtistNorm
            ? window.animaArtistNorm(inner)
            : inner.replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/_/g, " ").trim().toLowerCase();
    }

    function artistDisplayName(tag) {
        return String(tag || "")
            .replace(/^@+/, "")
            .replace(/^artist:/i, "")
            .replace(/\\\(/g, "(")
            .replace(/\\\)/g, ")")
            .replace(/_/g, " ")
            .trim();
    }

    function viewFiltersClear() {
        return !state.artistKey && !state.soloArtist && !state.seriesKey && !state.characterKey && !state.tagKey && !state.heartRate && !state.modelKey;
    }
    function captureFolderSnap() {
        return {
            subfolder: state.subfolder || "",
            items: (state.items || []).slice(),
            folders: (state.folders || []).slice(),
            parent: state.parent,
            page: state.page || 1,
            pages: state.pages || 1,
            total: state.total || 0
        };
    }
    function scrollGalleryTop() {
        var gal = document.getElementById("gallery");
        if (gal) gal.scrollTop = 0;
    }
    function paintFolderNow() {
        renderCrumb();
        renderFolders();
        renderGrid();
        renderPager();
        renderDetail();
        scrollGalleryTop();
        syncImgFavToolbar();
        syncTrashToolbar();
    }
    function paintFolderPending() {
        state.items = [];
        state.folders = [];
        state.parent = null;
        state.page = 1;
        state.pages = 1;
        state.total = 0;
        renderCrumb();
        renderFolders();
        var box = document.getElementById("grid");
        if (box) {
            box.innerHTML = "";
            var d = el("div", "", T("正在加载…"));
            d.className = "empty";
            box.appendChild(d);
        }
        var count = document.getElementById("count");
        if (count) count.textContent = T("正在加载…");
        renderPager();
        renderDetail();
        scrollGalleryTop();
        syncImgFavToolbar();
        syncTrashToolbar();
    }
    function changeFolder(sub) {
        var next = sub || "";
        var cur = state.subfolder || "";
        if (cur !== next && viewFiltersClear()) _folderSnaps[cur] = captureFolderSnap();
        state.subfolder = next;
        state.page = 1;
        state.sel = null;
        state.artistExact = false;
        state.artistKey = "";
        state.artistIndex = null;
        state.artistIndexSub = null;
        state.seriesKey = "";
        state.characterKey = "";
        state.castIndex = null;
        state.castIndexSub = null;
        state.modelIndex = null;
        state.modelIndexSub = null;
        closeLightbox();
        closePickArtist();
        if (_editOn) {
            _editSel = Object.create(null);
            _editAnchor = -1;
            closeEditMovePop();
            syncEditBar();
            paintEditTiles();
        }
        _stampKey = "";
        _refreshPending = false;
        markRefreshPending(false);
        var snap = _folderSnaps[next];
        if (snap && (snap.items || []).length) {
            state.items = snap.items.slice();
            state.folders = snap.folders.slice();
            state.parent = snap.parent;
            state.page = snap.page || 1;
            state.pages = snap.pages || 1;
            state.total = snap.total || state.items.length;
            paintFolderNow();
            loadList({ silent: true });
        } else {
            paintFolderPending();
            loadList();
        }
        if (state.view === "artist") loadArtistIndex();
        if (castFilterOn()) loadCastIndex();
        if (tagFilterOn()) loadTagIndex();
        loadModelIndex();
        applySortChrome();
    }

    function artistPopEl() { return document.getElementById("artist-pop"); }
    function artistPopBox() { return document.getElementById("artist-pop-box"); }
    function artistPopOpen() {
        var pop = artistPopEl();
        return !!(pop && !pop.hidden);
    }
    function raiseFilterPop(which) {
        var a = artistPopEl();
        var c = castPopEl();
        if (a && !a.hidden) a.style.zIndex = which === "artist" ? "92" : "91";
        if (c && !c.hidden) c.style.zIndex = which === "cast" ? "92" : "91";
    }
    function closeArtistPop() {
        _popCollapsed = false;
        var pop = artistPopEl();
        if (pop) pop.hidden = true;
        showSnapHint("");
        persistArtistPop();
        layoutAllDocks();
    }
    function setArtistCollapsed(on) {
        on = !!on;
        if (on) {
            _popCollapsed = true;
            var pop = artistPopEl();
            if (pop) pop.hidden = true;
            showSnapHint("");
            persistArtistPop();
            layoutAllDocks();
            return;
        }
        _popCollapsed = false;
        persistArtistPop();
        openArtistPop();
    }
    function persistArtistPop() {
        var box = artistPopBox();
        if (box && artistPopOpen()) {
            var r = box.getBoundingClientRect();
            if (r.width > 80 && r.height > 80) {
                if (!_popDock) {
                    _popFree = {
                        left: Math.round(r.left),
                        top: Math.round(r.top),
                        w: Math.round(r.width),
                        h: Math.round(r.height)
                    };
                } else if (_popDock === "left" || _popDock === "right") {
                    _popFree.w = Math.round(r.width);
                } else {
                    _popFree.h = Math.round(r.height);
                }
            }
        }
        try {
            localStorage.setItem(LS_ARTIST_POP, JSON.stringify({
                dock: _popDock || "",
                collapsed: _popCollapsed ? 1 : 0,
                left: _popFree.left,
                top: _popFree.top,
                w: _popFree.w,
                h: _popFree.h
            }));
        } catch (e1) {}
    }
    function dockSideOf(dock) {
        return dock === "inspect" ? "bottom" : (dock || "");
    }
    function panelOpen(id) {
        if (id === "inspect") {
            return !_insCollapsed && !document.body.classList.contains("compare-on");
        }
        if (id === "artist") return artistPopOpen();
        if (id === "cast") return castPopOpen();
        if (id === "tag") return tagPopOpen();
        if (id === "model") return modelPopOpen();
        return false;
    }
    function panelDock(id) {
        if (id === "inspect") return _insDock;
        if (id === "artist") return _popDock;
        if (id === "cast") return _castDock;
        if (id === "tag") return _tagDock;
        if (id === "model") return _modelDock;
        return "";
    }
    function panelSidePx(id, side) {
        var free = _popFree;
        if (id === "inspect") free = _insFree;
        else if (id === "cast") free = _castFree;
        else if (id === "tag") free = _tagFree;
        else if (id === "model") free = _modelFree;
        if (side === "left" || side === "right") return Math.max(240, Math.round(free.w || 360));
        return Math.max(140, Math.round(free.h || 280));
    }
    function occupiedPx(id, side) {
        if (!panelOpen(id)) return 0;
        var dock = dockSideOf(panelDock(id));
        if (!dock || dock !== side) return 0;
        return panelSidePx(id, side);
    }
    function adoptDockSize(free, kind, r) {
        if (!free || !kind || !r) return;
        if (kind === "left" || kind === "right") {
            if (r.w) free.w = Math.round(r.w);
        } else if (r.h) {
            free.h = Math.round(r.h);
        }
    }
    function dockOffset(side, selfId) {
        var ids = ["inspect", "artist", "cast", "tag", "model"];
        var acc = 0;
        for (var i = 0; i < ids.length; i++) {
            if (ids[i] === selfId) return acc;
            acc += occupiedPx(ids[i], side);
        }
        return acc;
    }
    function occSide(side, skipId) {
        var n = occupiedPx("inspect", side) + occupiedPx("artist", side) + occupiedPx("cast", side) + occupiedPx("tag", side) + occupiedPx("model", side);
        if (skipId) n -= occupiedPx(skipId, side);
        return Math.max(0, n);
    }
    function galleryOcc() {
        return {
            left: occSide("left", ""),
            right: occSide("right", ""),
            top: occSide("top", ""),
            bottom: occSide("bottom", "")
        };
    }
    function fabBoxRect(el, host) {
        if (!el) return null;
        if (host && host.hidden) return null;
        var cs = window.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return null;
        var r = el.getBoundingClientRect();
        if (r.width < 32 || r.height < 32) return null;
        return r;
    }
    function placeInspectFab() {
        var fab = document.getElementById("inspect-fab");
        if (!fab || fab.hidden) return;
        if (fab.parentNode !== document.body) document.body.appendChild(fab);
        var size = 46;
        var m = 18;
        var chrome = chromeBottom();
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var o = galleryOcc();
        var obstacles = [];
        var rCast = fabBoxRect(document.getElementById("cast-pop-box"), document.getElementById("cast-pop"));
        var rArtist = fabBoxRect(document.getElementById("artist-pop-box"), document.getElementById("artist-pop"));
        var rPick = fabBoxRect(document.getElementById("pick-artist-box"), document.getElementById("pick-artist"));
        if (rCast) obstacles.push(rCast);
        if (rArtist) obstacles.push(rArtist);
        if (rPick) obstacles.push(rPick);
        var rArtistFab = fabBoxRect(document.getElementById("artist-pop-fab"));
        var rCastFab = fabBoxRect(document.getElementById("cast-pop-fab"));
        var rTagFab = fabBoxRect(document.getElementById("tag-pop-fab"));
        var rModel = fabBoxRect(document.getElementById("model-pop-box"), document.getElementById("model-pop"));
        var rModelFab = fabBoxRect(document.getElementById("model-pop-fab"));
        if (rArtistFab) obstacles.push(rArtistFab);
        if (rCastFab) obstacles.push(rCastFab);
        if (rTagFab) obstacles.push(rTagFab);
        if (rModel) obstacles.push(rModel);
        if (rModelFab) obstacles.push(rModelFab);
        var cands = [
            { left: vw - m - size - (o.right || 0), top: vh - m - size - (o.bottom || 0) },
            { left: m + (o.left || 0), top: vh - m - size - (o.bottom || 0) },
            { left: vw - m - size - (o.right || 0), top: chrome + m + (o.top || 0) },
            { left: m + (o.left || 0), top: chrome + m + (o.top || 0) }
        ];
        function clampCand(p) {
            return {
                left: Math.max(m, Math.min(vw - m - size, p.left)),
                top: Math.max(chrome + 8, Math.min(vh - m - size, p.top))
            };
        }
        var best = clampCand(cands[0]);
        var bestArea = 1e15;
        var i, j;
        for (i = 0; i < cands.length; i++) {
            var p = clampCand(cands[i]);
            var a = { left: p.left, top: p.top, right: p.left + size, bottom: p.top + size };
            var area = 0;
            for (j = 0; j < obstacles.length; j++) {
                var b = obstacles[j];
                var ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
                var iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
                area += ix * iy;
            }
            if (area < bestArea) {
                bestArea = area;
                best = p;
            }
            if (area === 0) break;
        }
        fab.style.right = "auto";
        fab.style.bottom = "auto";
        fab.style.left = Math.round(best.left) + "px";
        fab.style.top = Math.round(best.top) + "px";
    }

    function placePopFabs() {
        var items = [
            { id: "artist", on: _popCollapsed && artistFilterOn() && !artistPopOpen(), dock: _popDock, lab: T("画师"), tip: T("点此展开画师筛选") },
            { id: "cast", on: _castCollapsed && castFilterOn() && !castPopOpen(), dock: _castDock, lab: T("角色"), tip: T("点此展开角色筛选") },
            { id: "tag", on: _tagCollapsed && tagFilterOn() && !tagPopOpen(), dock: _tagDock, lab: T("标签"), tip: T("点此展开标签筛选") },
            { id: "model", on: _modelCollapsed && !modelPopOpen(), dock: _modelDock, lab: T("模型"), tip: T("点此展开模型筛选") }
        ];
        var stacks = { left: 0, right: 0, top: 0, inspect: 0, float: 0 };
        var chrome = chromeBottom();
        var o = galleryOcc();
        var i;
        for (i = 0; i < items.length; i++) {
            var it = items[i];
            var fab = document.getElementById(it.id + "-pop-fab");
            if (!fab) continue;
            if (fab.parentNode !== document.body) document.body.appendChild(fab);
            fab.hidden = !it.on;
            if (!it.on) continue;
            fab.textContent = it.lab;
            fab.title = it.tip;
            fab.setAttribute("aria-label", it.tip);
            var dock = it.dock || "";
            if (dock !== "left" && dock !== "right" && dock !== "top" && dock !== "inspect") dock = "float";
            fab.className = "opv-pop-fab is-dock-" + dock;
            fab.style.left = "";
            fab.style.right = "";
            fab.style.top = "";
            fab.style.bottom = "";
            fab.style.transform = "";
            var k = stacks[dock] || 0;
            stacks[dock] = k + 1;
            if (dock === "left") {
                fab.style.left = "0px";
                fab.style.top = Math.round(chrome + 72 + k * 96) + "px";
            } else if (dock === "right") {
                fab.style.right = "0px";
                fab.style.top = Math.round(chrome + 72 + k * 96) + "px";
            } else if (dock === "top") {
                fab.style.top = chrome + "px";
                fab.style.left = Math.round(16 + (o.left || 0) + k * 96) + "px";
            } else {
                fab.style.left = Math.round(16 + (o.left || 0) + k * 96) + "px";
                fab.style.bottom = Math.round(16 + (o.bottom || 0)) + "px";
            }
        }
    }

    function relayoutFlow() {
        if (!isFlow()) return;
        var box = document.getElementById("grid");
        if (!box) return;
        var tiles = box.querySelectorAll(".tile");
        for (var i = 0; i < tiles.length; i++) layoutFlowTile(tiles[i], tiles[i].querySelector("img"));
        maybeLoadMore();
    }
    function scheduleRelayoutFlow() {
        if (_insetRaf) return;
        _insetRaf = requestAnimationFrame(function () {
            _insetRaf = 0;
            relayoutFlow();
        });
    }
    function syncShellInsets() {
        var gal = document.getElementById("gallery");
        var o = galleryOcc();
        var left = o.left, right = o.right, top = o.top, bottom = o.bottom;
        var root = document.documentElement;
        root.style.setProperty("--shell-left", left + "px");
        root.style.setProperty("--shell-right", right + "px");
        root.style.setProperty("--shell-top", top + "px");
        root.style.setProperty("--shell-bottom", bottom + "px");
        if (gal) {
            gal.style.paddingLeft = (16 + left) + "px";
            gal.style.paddingRight = (16 + right) + "px";
            gal.style.paddingTop = (14 + top) + "px";
            gal.style.paddingBottom = (24 + bottom) + "px";
        }
        var widthChanged = _lastInsets.left !== left || _lastInsets.right !== right;
        _lastInsets = { left: left, right: right, top: top, bottom: bottom };
        if (widthChanged) scheduleRelayoutFlow();
        placeInspectFab();
        placePopFabs();
        relayoutPeek();
    }
    function applyRect(box, r) {
        if (!box || !r) return;
        box.style.right = "auto";
        box.style.bottom = "auto";
        if (r.left != null) box.style.left = r.left + "px";
        if (r.top != null) box.style.top = r.top + "px";
        if (r.w != null) box.style.width = r.w + "px";
        if (r.h != null) box.style.height = r.h + "px";
    }
    function snapRectFor(kind, band, free, selfId) {
        band = band || popBand(selfId);
        free = free || _popFree;
        var chrome = band.cb != null ? band.cb : chromeBottom();
        var vw = band.vw || window.innerWidth;
        var vh = band.vh || window.innerHeight;
        var colH = Math.max(160, vh - chrome);
        var maxW = Math.max(260, Math.round(vw * 0.5));
        var maxH = Math.max(140, colH - 80);
        var w = Math.max(260, Math.min(maxW, free.w || 360));
        var h = Math.max(140, Math.min(maxH, free.h || Math.min(220, Math.round(colH * 0.42))));
        var stackL = dockOffset("left", selfId);
        var stackR = dockOffset("right", selfId);
        var stackT = dockOffset("top", selfId);
        var stackB = dockOffset("bottom", selfId);
        var left0 = occSide("left", selfId);
        var right0 = occSide("right", selfId);
        var span = Math.max(160, vw - left0 - right0);
        if (kind === "left") return { left: stackL, top: chrome, w: w, h: colH };
        if (kind === "right") return { left: vw - stackR - w, top: chrome, w: w, h: colH };
        if (kind === "top") return { left: left0, top: chrome + stackT, w: span, h: h };
        if (kind === "inspect" || kind === "bottom") return { left: left0, top: vh - stackB - h, w: span, h: h };
        return null;
    }
    function chromeBottom() {
        var c = document.querySelector(".chrome");
        if (!c) return 0;
        var b = Math.round(c.getBoundingClientRect().bottom);
        if (b > 0) return b;
        return Math.max(0, Math.round(c.offsetHeight || 0));
    }
    function inspectTop() {
        if (_insCollapsed || _insDock !== "bottom") return window.innerHeight;
        var ins = document.getElementById("inspect");
        if (!ins || ins.hidden) return window.innerHeight;
        var s = window.getComputedStyle(ins);
        if (s.display === "none" || s.visibility === "hidden") return window.innerHeight;
        return Math.round(ins.getBoundingClientRect().top);
    }
    function syncPopDockClass() {
        var box = artistPopBox();
        if (!box) return;
        box.classList.remove("is-dock-left", "is-dock-right", "is-dock-top", "is-dock-inspect");
        if (_popDock) box.classList.add("is-dock-" + _popDock);
        var undock = document.getElementById("artist-pop-undock");
        if (undock) undock.hidden = !_popDock;
    }
    function popBand(selfId) {
        selfId = selfId || "artist";
        var vh = window.innerHeight;
        var vw = window.innerWidth;
        return {
            cb: chromeBottom(),
            it: vh - occSide("bottom", selfId),
            vw: vw,
            vh: vh,
            left: occSide("left", selfId),
            right: occSide("right", selfId)
        };
    }
    function snapRect(kind, band) {
        return snapRectFor(kind, band || popBand("artist"), _popFree, "artist");
    }
    function applySnapRect(r) {
        applyRect(artistPopBox(), r);
    }
    function showSnapHint(kind, band) {
        if ((kind || "") === _snapKind) return;
        _snapKind = kind || "";
        var hint = document.getElementById("artist-snap-hint");
        if (!hint) return;
        if (!kind) {
            hint.hidden = true;
            hint.className = "";
            return;
        }
        band = band || popBand();
        hint.hidden = false;
        hint.className = "is-dock-" + kind;
        if (kind === "left" || kind === "right") {
            hint.style.top = band.cb + "px";
            hint.style.height = Math.max(0, band.it - band.cb) + "px";
            hint.style.width = "5px";
            hint.style.left = kind === "left" ? "0px" : (band.vw - 5) + "px";
        } else {
            hint.style.left = "0px";
            hint.style.width = band.vw + "px";
            hint.style.height = "5px";
            hint.style.top = kind === "top" ? band.cb + "px" : (band.it - 5) + "px";
        }
    }
    function snapFromPoint(x, y, band, bottomKind) {
        band = band || popBand("artist");
        bottomKind = bottomKind || "inspect";
        var edge = 36;
        var left0 = band.left || 0;
        var right0 = band.right || 0;
        if (x <= left0 + edge) return "left";
        if (x >= band.vw - right0 - edge) return "right";
        if (y <= band.cb + edge) return "top";
        if (y >= band.it - edge) return bottomKind;
        return "";
    }
    function setPopDock(kind) {
        var box = artistPopBox();
        var was = _popDock;
        _popDock = kind || "";
        if (!_popDock && was && box) {
            var w = Math.max(280, _popFree.w || 640);
            var h = Math.max(160, _popFree.h || 440);
            var left = 24;
            var top = chromeBottom() + 16;
            if (was === "right") left = Math.max(24, window.innerWidth - w - 24);
            if (was === "inspect") top = Math.max(chromeBottom() + 16, inspectTop() - h - 16);
            box.style.width = w + "px";
            box.style.height = h + "px";
            box.style.left = left + "px";
            box.style.top = top + "px";
        }
        syncPopDockClass();
        layoutAllDocks();
        persistArtistPop();
    }
    function layoutArtistPop() {
        var box = artistPopBox();
        if (!box || !artistPopOpen()) return;
        syncPopDockClass();
        if (_popDock) {
            var r = snapRect(_popDock, popBand("artist"));
            applySnapRect(r);
            adoptDockSize(_popFree, _popDock, r);
            return;
        }
        if (window.clampPopup) window.clampPopup(box);
    }
    function layoutCastPop() {
        var box = castPopBox();
        if (!box || !castPopOpen()) return;
        box.classList.remove("is-dock-left", "is-dock-right", "is-dock-top", "is-dock-inspect");
        var undock = document.getElementById("cast-pop-undock");
        if (undock) undock.hidden = !_castDock;
        if (_castDock) {
            box.classList.add("is-dock-" + _castDock);
            var cr = snapRectFor(_castDock, popBand("cast"), _castFree, "cast");
            applyRect(box, cr);
            adoptDockSize(_castFree, _castDock, cr);
            return;
        }
        if (window.clampPopup) window.clampPopup(box);
    }
    function layoutTagPop() {
        var box = tagPopBox();
        if (!box || !tagPopOpen()) return;
        box.classList.remove("is-dock-left", "is-dock-right", "is-dock-top", "is-dock-inspect");
        var undock = document.getElementById("tag-pop-undock");
        if (undock) undock.hidden = !_tagDock;
        if (_tagDock) {
            box.classList.add("is-dock-" + _tagDock);
            var tr = snapRectFor(_tagDock, popBand("tag"), _tagFree, "tag");
            applyRect(box, tr);
            adoptDockSize(_tagFree, _tagDock, tr);
            return;
        }
    }
    function layoutModelPop() {
        var box = modelPopBox();
        if (!box || !modelPopOpen()) return;
        box.classList.remove("is-dock-left", "is-dock-right", "is-dock-top", "is-dock-inspect");
        var undock = document.getElementById("model-pop-undock");
        if (undock) undock.hidden = !_modelDock;
        if (_modelDock) {
            box.classList.add("is-dock-" + _modelDock);
            var mr = snapRectFor(_modelDock, popBand("model"), _modelFree, "model");
            applyRect(box, mr);
            adoptDockSize(_modelFree, _modelDock, mr);
            return;
        }
    }
    function layoutAllDocks() {
        layoutInspect();
        layoutArtistPop();
        layoutCastPop();
        layoutTagPop();
        layoutModelPop();
        layoutInspect();
        layoutArtistPop();
        layoutCastPop();
        layoutTagPop();
        layoutModelPop();
        syncShellInsets();
    }
    function scheduleDockLayout() {
        if (_dockLayRaf) return;
        _dockLayRaf = requestAnimationFrame(function () {
            _dockLayRaf = 0;
            layoutAllDocks();
        });
    }
    function settleDockLayout() {
        requestAnimationFrame(function () {
            layoutAllDocks();
            requestAnimationFrame(function () { layoutAllDocks(); });
        });
    }
    function loadArtistPopLayout() {
        if (_popLayLoaded) return;
        _popLayLoaded = true;
        var d = null;
        try { d = JSON.parse(localStorage.getItem(LS_ARTIST_POP) || "null"); } catch (e1) { d = null; }
        if (!d) return;
        if (d.w) _popFree.w = d.w;
        if (d.h) _popFree.h = d.h;
        if (d.left != null) _popFree.left = d.left;
        if (d.top != null) _popFree.top = d.top;
        _popDock = d.dock || "";
        _popCollapsed = !!d.collapsed;
    }
    function restoreArtistPop() {
        var box = artistPopBox();
        if (!box) return;
        loadArtistPopLayout();
        if (_popDock && snapRect(_popDock)) {
            syncPopDockClass();
            layoutAllDocks();
            return;
        }
        _popDock = "";
        syncPopDockClass();
        var w = Math.max(280, _popFree.w || 640);
        var h = Math.max(160, _popFree.h || 440);
        var left = _popFree.left != null ? _popFree.left : Math.round((window.innerWidth - w) / 2);
        var top = _popFree.top != null ? _popFree.top : chromeBottom() + 12;
        box.style.width = w + "px";
        box.style.height = h + "px";
        box.style.left = left + "px";
        box.style.top = top + "px";
        if (window.clampPopup) window.clampPopup(box);
        syncShellInsets();
    }
    function resetArtistPop() {
        _popDock = "";
        _popFree = { left: 80, top: chromeBottom() + 12, w: 640, h: 440 };
        try { localStorage.removeItem(LS_ARTIST_POP); } catch (e1) {}
        restoreArtistPop();
        persistArtistPop();
    }
    function openArtistPop() {
        var pop = artistPopEl();
        if (!pop) return;
        loadArtistPopLayout();
        _popCollapsed = false;
        pop.hidden = false;
        restoreArtistPop();
        persistArtistPop();
        layoutAllDocks();
        raiseFilterPop("artist");
        if (state.view === "artist") {
            if (!state.artistIndex || state.artistIndexSub !== folderScopeKey() || state.artistIndexBusy) {
                loadArtistIndex();
            } else {
                renderArtistRail();
            }
        }
    }

    function artistFilterOn() {
        return state.view === "artist";
    }
    function filtersActive() {
        return !!state.artistKey || !!state.soloArtist || !!state.seriesKey || !!state.characterKey || !!state.tagKey || !!state.heartRate || !!state.modelKey;
    }
    function clearAllFilters() {
        var dirty = filtersActive();
        state.artistExact = false;
        state.artistKey = "";
        state.seriesKey = "";
        state.characterKey = "";
        state.tagKey = "";
        state.tagCn = "";
        persistTagKey();
        state.modelKey = "";
        persistModelKey();
        if (state.soloArtist) {
            state.soloArtist = false;
            try { localStorage.setItem(LS_SOLO, "0"); } catch (e0) {}
        }
        if (state.heartRate) {
            state.heartRate = 0;
            try { localStorage.removeItem(LS_HEART); } catch (eHr2) {}
        }
        setFilterMenu(false);
        syncFilterUi();
        renderArtistRail();
        renderCastPop();
        renderTagPop();
        renderModelPop();
        if (!dirty) return;
        state.page = 1;
        state.sel = null;
        closeLightbox();
        loadList();
    }
    function renderFilterStatus(busy) {
        var bar = document.getElementById("filter-status");
        var clearBtn = document.getElementById("btn-filter-clear");
        var menuClear = document.getElementById("filter-clear-all");
        var menuRow = document.getElementById("filter-clear-row");
        var active = filtersActive();
        if (clearBtn) clearBtn.hidden = !active;
        if (menuRow) menuRow.hidden = !active;
        if (menuClear) menuClear.textContent = T("清除筛选");
        if (!bar) {
            scheduleDockLayout();
            return;
        }
        if (!active && !busy) {
            bar.hidden = true;
            bar.innerHTML = "";
            scheduleDockLayout();
            return;
        }
        bar.hidden = false;
        bar.innerHTML = "";
        if (busy) {
            bar.textContent = listBusyText();
            scheduleDockLayout();
            return;
        }
        var bits = [];
        if (state.artistKey) bits.push(T("画师") + " " + artistKeyList(state.artistKey).map(artistDisplayName).join(" / "));
        if (state.characterKey) bits.push(T("角色") + " " + charDisplayName({ tag: state.characterKey, key: state.characterKey }));
        if (state.seriesKey) bits.push(T("系列") + " " + seriesDisplayName({ tag: state.seriesKey, key: state.seriesKey }));
        if (state.tagKey) bits.push(T("标签") + " " + tagDisplayName({ tag: state.tagKey, key: state.tagKey, cn: state.tagCn }));
        if (state.modelKey) bits.push(T("模型") + " " + modelKeyList().map(modelLabel).join(" / "));
        if (state.heartRate === -1) bits.push(T("未评分"));
        else if (state.heartRate) bits.push(state.heartRate + T("颗爱心"));
        if (state.soloArtist) bits.push(T("单画师"));
        var lab = el("span", "", bits.join(" · ") || T("筛选"));
        lab.className = "filter-status-lab";
        bar.appendChild(lab);
        scheduleDockLayout();
    }

    function syncFilterUi() {
        var any = filtersActive();
        var btn = document.getElementById("btn-filter");
        if (btn) btn.classList.toggle("on", any);
        var artistBtn = document.getElementById("filter-artist-toggle");
        if (artistBtn) artistBtn.classList.toggle("is-on", !!state.artistKey);
        var castBtn = document.getElementById("filter-cast-toggle");
        var castSw = document.getElementById("filter-cast-sw");
        if (castBtn) castBtn.classList.toggle("is-on", !!(state.seriesKey || state.characterKey));
        if (castSw) {
            castSw.textContent = castFilterOn() ? T("开") : T("关");
            castSw.classList.toggle("is-on", castFilterOn());
        }
        var tagBtn = document.getElementById("filter-tag-toggle");
        var tagSw = document.getElementById("filter-tag-sw");
        if (tagBtn) tagBtn.classList.toggle("is-on", !!state.tagKey);
        if (tagSw) {
            tagSw.textContent = tagFilterOn() ? T("开") : T("关");
            tagSw.classList.toggle("is-on", tagFilterOn());
        }
        var modelBtn = document.getElementById("filter-model-toggle");
        if (modelBtn) modelBtn.classList.toggle("is-on", !!state.modelKey);
        var soloBtn = document.getElementById("btn-solo");
        var soloSw = document.getElementById("filter-solo-sw");
        if (soloBtn) {
            soloBtn.classList.toggle("is-on", !!state.soloArtist);
            soloBtn.title = T("只显示只有一个画师标签的图");
        }
        if (soloSw) soloSw.textContent = state.soloArtist ? T("开") : T("关");
        var liveBtn = document.getElementById("btn-live");
        var liveSw = document.getElementById("filter-live-sw");
        if (liveBtn) {
            liveBtn.classList.toggle("is-on", liveModeOn());
            liveBtn.title = T("AI模式：用该画师的单画师生成图当缩略图。没指定时自动匹配。");
        }
        if (liveSw) liveSw.textContent = liveModeOn() ? T("开") : T("关");
        syncHeartRateUi();
        renderFilterStatus();
    }
    function syncHeartRateUi() {
        var lab = document.getElementById("filter-rate-lab");
        if (lab) lab.textContent = T("评分");
        var row = document.getElementById("filter-rate-row");
        if (row) {
            var btns = row.querySelectorAll("[data-rate]");
            for (var i = 0; i < btns.length; i++) {
                var rawRate = btns[i].getAttribute("data-rate") || "0";
                var n = (rawRate === "none" || rawRate === "-1") ? -1 : parseInt(rawRate, 10);
                if (n !== -1 && !(n >= 1 && n <= 5)) n = 0;
                var on = n === (state.heartRate || 0);
                btns[i].classList.toggle("is-on", on);
                if (n === -1) {
                    btns[i].textContent = T("未评分");
                    btns[i].title = T("未评分");
                } else if (n) {
                    btns[i].textContent = String(n) + "♥";
                    btns[i].title = n + T("颗爱心");
                } else {
                    btns[i].textContent = T("全部");
                    btns[i].title = T("全部");
                }
            }
        }
        var rateSort = document.getElementById("filter-rate-sort");
        if (rateSort) {
            rateSort.textContent = T("高分在前");
            rateSort.title = sortHint("rating");
            rateSort.classList.toggle("is-on", listSort() === "rating");
        }
    }

    function setFilterMenu(open) {
        var menu = document.getElementById("filter-menu");
        var btn = document.getElementById("btn-filter");
        if (!menu) return;
        menu.hidden = !open;
        if (btn) btn.classList.toggle("is-open", !!open);
        if (open) placeFilterMenu();
    }

    function placeFilterMenu() {
        var menu = document.getElementById("filter-menu");
        var btn = document.getElementById("btn-filter");
        if (!menu || menu.hidden || !btn) return;
        var br = btn.getBoundingClientRect();
        var top = br.bottom + 6;
        var left = br.left;
        var maxL = Math.max(8, window.innerWidth - 240);
        if (left > maxL) left = maxL;
        if (left < 8) left = 8;
        var mh = menu.offsetHeight || 280;
        if (top + mh > window.innerHeight) top = Math.max(8, br.top - mh - 6);
        menu.style.left = left + "px";
        menu.style.top = top + "px";
    }

    function setView(v) {
        if (v !== "artist") v = "folder";
        var prev = state.view;
        state.view = v;
        try { localStorage.setItem(LS_ARTIST_FILTER, v === "artist" ? "1" : "0"); } catch (e1) {}
        document.body.classList.toggle("opv-artist", v === "artist");
        syncFilterUi();
        if (v === "folder") {
            closeArtistPop();
            if (prev === "artist") {
                var dirty = !!state.artistKey;
                state.artistExact = false;
                state.artistKey = "";
                if (dirty) {
                    state.page = 1;
                    state.sel = null;
                    closeLightbox();
                    loadList();
                }
            }
            placeFilterMenu();
            return;
        }
        setFilterMenu(false);
        openArtistPop();
        placeFilterMenu();
    }

    function makeRailCard(opts) {
        opts = opts || {};
        var key = opts.key || "";
        var isAll = !!opts.isAll;
        var count = opts.count || 0;
        var b = el("div");
        b.setAttribute("role", "button");
        b.tabIndex = 0;
        b.className = "opv-art-card";
        if (isAll) b.classList.add("is-all");
        if (isAll ? !state.artistKey : artistKeyHas(key)) b.classList.add("is-on");
        if (!isAll && count === 0) b.classList.add("is-zero");
        if (key) b.setAttribute("data-key", key);
        if (opts.tag) b.setAttribute("data-tag", opts.tag);
        if (opts.query) b.setAttribute("data-q", opts.query);
        if (opts.thumbRaw) b.setAttribute("data-thumb", opts.thumbRaw);
        var pic = el("div");
        pic.className = "pic";
        if (isAll) {
            pic.textContent = T("全部");
        } else {
            var img = document.createElement("img");
            img.alt = opts.name || "";
            img.decoding = "async";
            if (!bindRailThumb(img, opts)) {
                img.hidden = true;
                if (!liveModeOn()) {
                    b.setAttribute("data-need-thumb", "1");
                    b.setAttribute("data-q", opts.query || opts.name || "");
                }
            }
            pic.appendChild(img);
            if (opts.starred) {
                var star = el("span", "", "★");
                star.className = "star";
                pic.appendChild(star);
            }
            var n = el("span", "", String(count));
            n.className = "n";
            pic.appendChild(n);
        }
        b.appendChild(pic);
        if (!isAll) {
            var nm = el("span", "", opts.name || key);
            nm.className = "nm";
            nm.title = opts.name || key;
            b.appendChild(nm);
            if (opts.starred && window.animaFavGrid && typeof window.animaFavGrid.makeRateRow === "function") {
                b.appendChild(window.animaFavGrid.makeRateRow(opts.rating, function (n) {
                    setArtistRating(opts.tag || opts.query || key, n);
                }, { center: true, size: 11 }));
            }
            var zoomTag = opts.tag || opts.query || opts.name || key;
            var zoom = el("button");
            zoom.type = "button";
            zoom.className = "art-zoom";
            zoom.title = T("查看大图");
            zoom.setAttribute("aria-label", T("查看大图"));
            zoom.innerHTML = ICON_ZOOM;
            zoom.onmouseenter = function () { peekArtistCard(b, zoomTag, key); };
            zoom.onmouseleave = function () { hidePeek(); };
            zoom.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                peekArtistCard(b, zoomTag, key);
            };
            b.appendChild(zoom);
            b.title = T("单击筛选，放大镜看大图，右键去D站/G站");
            b.onmouseleave = function () { hidePeek(); };
            b.oncontextmenu = function (e) {
                e.preventDefault();
                e.stopPropagation();
                openArtistSearchMenu(zoomTag, e.clientX, e.clientY);
            };
        }
        b.onclick = function () {
            var next = isAll ? "" : key;
            if (state.artistKey === next && !state.artistExact) return;
            state.artistExact = false;
            state.artistKey = next;
            state.page = 1;
            state.sel = null;
            closeLightbox();
            renderArtistRail();
            loadList();
            syncFilterUi();
        };
        return b;
    }

    function isLiveThumbUrl(u) {
        return /\/danbooru_anima\/live_thumb\//.test(String(u || ""));
    }
    function rememberRailThumb(key, img) {
        if (!key || !img) return;
        var src = img.currentSrc || img.getAttribute("src") || "";
        if (!src || isLiveThumbUrl(src)) return;
        _railThumbSrc[key] = src;
    }
    function fossilRailUrl(opts) {
        opts = opts || {};
        var tag = opts.tag || opts.query || "";
        var key = opts.key || "";
        var loc = localFavThumb(tag) || localFavThumb(opts.query);
        if (loc) return loc;
        var keep = (key && _railThumbSrc[key]) || "";
        if (keep && !isLiveThumbUrl(keep)) return keep;
        var raw = opts.thumbRaw || opts.thumb || "";
        if (!raw) return "";
        if (isAdexThumb(raw)) return adexSrc(raw);
        var g = window.animaFavGrid;
        var source = favThumbSource(raw);
        if (g && typeof g.favSrc === "function") return g.favSrc(raw, source, tag) || "";
        if (String(raw).indexOf("http") === 0) {
            if (g && typeof g.proxySrc === "function") return g.proxySrc(raw, source, "tiny");
            return "/danbooru_anima/image_proxy?url=" + encodeURIComponent(raw);
        }
        return isLiveThumbUrl(raw) ? "" : raw;
    }
    function bindRailThumb(img, opts) {
        opts = opts || {};
        if (!img) return false;
        var tag = opts.tag || opts.query || "";
        var key = opts.key || "";
        rememberRailThumb(key, img);
        if (liveModeOn()) {
            var lv = liveFavThumb(tag) || liveFavThumb(opts.query) || liveFavThumb(key);
            if (lv) {
                img.hidden = false;
                img.style.display = "block";
                img.loading = "eager";
                img.onerror = function () { img.hidden = true; };
                if ((img.getAttribute("src") || "") !== lv) img.src = lv;
                return true;
            }
            var gq = window.animaFavGrid;
            if (gq && typeof gq.queueLiveAutofill === "function") {
                gq.queueLiveAutofill(tag || opts.query || key);
            }
            var hold = fossilRailUrl(opts) || img.getAttribute("src") || "";
            if (isLiveThumbUrl(hold)) hold = fossilRailUrl(opts);
            if (!hold) return false;
            img.hidden = false;
            img.style.display = "block";
            if ((img.getAttribute("src") || "") !== hold) img.src = hold;
            return true;
        }
        var url = fossilRailUrl(opts);
        if (!url) return false;
        img.hidden = false;
        img.style.display = "block";
        img.loading = "eager";
        img.onerror = function () {
            var next = localFavThumb(tag) || favImgUrl(opts.thumbRaw || opts.thumb || "", tag);
            if (next && !isLiveThumbUrl(next) && next !== (img.getAttribute("src") || "")) {
                img.onerror = function () { img.hidden = true; };
                img.src = next;
                return;
            }
            img.hidden = true;
        };
        if ((img.getAttribute("src") || "") !== url) img.src = url;
        if (key && !isLiveThumbUrl(url)) _railThumbSrc[key] = url;
        return true;
    }
    function patchRailThumbs() {
        var box = document.getElementById("artist-rail");
        if (!box || state.view !== "artist") return;
        var cards = box.querySelectorAll(".opv-art-card[data-key]");
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            var img = card.querySelector(".pic img");
            if (!img) continue;
            bindRailThumb(img, {
                key: card.getAttribute("data-key") || "",
                tag: card.getAttribute("data-tag") || "",
                query: card.getAttribute("data-q") || "",
                thumbRaw: card.getAttribute("data-thumb") || ""
            });
        }
    }
    function fillRailMissingThumbs(box) {
        var nodes = box.querySelectorAll(".opv-art-card[data-need-thumb]");
        for (var i = 0; i < nodes.length; i++) {
            (function (card) {
                var q = card.getAttribute("data-q") || "";
                var key = card.getAttribute("data-key") || q;
                var img = card.querySelector("img");
                if (!img) return;
                var tag = key || q;
                if (liveModeOn()) {
                    if (liveFavThumb(tag) || liveFavThumb(q)) {
                        bindFavThumb(img, "", tag);
                        card.removeAttribute("data-need-thumb");
                    }
                    return;
                }
                var loc = localFavThumb(tag) || localFavThumb(q);
                if (!loc) return;
                bindFavThumb(img, "", tag);
                card.removeAttribute("data-need-thumb");
            })(nodes[i]);
        }
    }

    function renderArtistRail() {
        if (_railRaf) cancelAnimationFrame(_railRaf);
        _railRaf = requestAnimationFrame(function () {
            _railRaf = 0;
            renderArtistRailNow();
        });
    }
    function renderArtistRailNow() {
        var box = document.getElementById("artist-rail");
        if (!box || state.view !== "artist") return;
        var oldImgs = box.querySelectorAll(".opv-art-card[data-key] img");
        for (var oi = 0; oi < oldImgs.length; oi++) {
            var oc = oldImgs[oi].closest(".opv-art-card");
            rememberRailThumb(oc && oc.getAttribute("data-key"), oldImgs[oi]);
        }
        box.innerHTML = "";
        var idx = state.artistIndex;
        var stale = state.artistIndexBusy || !idx || state.artistIndexSub !== folderScopeKey();
        var st = el("div");
        st.className = "opv-art-status";
        if (state.artistIndexBusy || stale) st.textContent = T("正在读取本文件夹提示词…");
        else if (idx.error) st.textContent = String(idx.error);
        else st.textContent = T("已索引 PNG") + " " + String(idx.png || 0) + " · " + T("单击筛选，放大镜看大图，右键去D站/G站");
        box.appendChild(st);
        if (stale || idx.error) return;
        box.appendChild(makeRailCard({ isAll: true }));
        var countMap = {};
        (idx.artists || []).forEach(function (a) {
            if (a && a.key) countMap[a.key] = a;
        });
        var favs = (_favArtCache || []).slice();
        favs.sort(function (a, b) {
            if (!!a.starred !== !!b.starred) return a.starred ? -1 : 1;
            if (a.starred) {
                var ra = artistRateNum(a.rating), rb = artistRateNum(b.rating);
                if (ra !== rb) return rb - ra;
            }
            return String(a.tag || "").localeCompare(String(b.tag || ""));
        });
        var favKeys = {};
        favs.forEach(function (f) {
            var key = artistNormKey(f.tag);
            if (!key || favKeys[key]) return;
            favKeys[key] = 1;
            var hit = countMap[key];
            var count = (hit && hit.count) || 0;
            var name = artistDisplayName(f.tag || key);
            box.appendChild(makeRailCard({
                key: key,
                name: name,
                count: count,
                starred: !!f.starred,
                rating: f.rating,
                thumbRaw: f.thumb || "",
                tag: f.tag,
                source: favThumbSource(f.thumb || ""),
                query: name
            }));
        });
        var others = (idx.artists || []).filter(function (a) {
            return a && a.key && !favKeys[a.key] && a.count > 0;
        });
        if (others.length) {
            var head = el("div", "", listDeepOn() ? T("其它画师") : T("本文件夹其它画师"));
            head.className = "opv-art-head";
            box.appendChild(head);
            others.forEach(function (a) {
                var name = artistDisplayName(a.tag || a.key);
                box.appendChild(makeRailCard({
                    key: a.key,
                    name: name,
                    count: a.count || 0,
                    starred: false,
                    thumbRaw: "",
                    tag: a.tag || a.key,
                    source: "danbooru",
                    query: name
                }));
            });
        }
        fillRailMissingThumbs(box);
    }

    function movedRecordLeavesScope(it) {
        if (!it) return false;
        var src = it.from != null ? it.from : (it.subfolder || "");
        var dest = it.from != null ? (it.subfolder || "") : "";
        return movedLeavesView({ subfolder: src }, dest);
    }
    function refreshFilterCountsQuiet(moved) {
        var leaves = false;
        var i;
        for (i = 0; i < (moved || []).length; i++) {
            if (movedRecordLeavesScope(moved[i])) { leaves = true; break; }
        }
        if (!leaves) return;
        if (artistFilterOn()) loadArtistIndex({ quiet: true });
        if (castFilterOn()) loadCastIndex({ quiet: true });
        if (tagFilterOn()) loadTagIndex({ quiet: true });
        loadModelIndex({ quiet: true });
    }
    function loadArtistIndex(opts) {
        var quiet = !!(opts && opts.quiet) && state.artistIndex && state.artistIndexSub === folderScopeKey();
        if (!quiet) {
            state.artistIndexBusy = true;
            renderArtistRail();
        }
        var gen = ++_artistIdxGen;
        var sub = state.subfolder || "";
        return loadArtistFavs().then(function () {
            return fetch("/danbooru_anima/output_prompt/artist_index?subfolder=" + encodeURIComponent(sub) + "&" + listDeepQuery());
        }).then(function (r) {
            if (!r.ok) throw new Error(r.status === 404 ? "need_restart" : String(r.status));
            return r.json();
        }).then(function (d) {
            if (gen !== _artistIdxGen) return;
            state.artistIndexBusy = false;
            if (!d || d.ok === false) {
                state.artistIndex = { error: (d && d.error) || T("加载失败"), artists: [], png: 0 };
            } else {
                state.artistIndex = d;
            }
            state.artistIndexSub = folderScopeKey();
            renderArtistRail();
        }).catch(function (e) {
            if (gen !== _artistIdxGen) return;
            state.artistIndexBusy = false;
            state.artistIndex = {
                error: String(e && e.message === "need_restart" ? T("请先重启 ComfyUI，再打开本页") : (e && e.message) || e),
                artists: [],
                png: 0
            };
            state.artistIndexSub = folderScopeKey();
            renderArtistRail();
        });
    }

    function facetNormKey(tag) {
        var s = String(tag || "").trim();
        if (!s) return "";
        if (s === "__none__" || s === "original") return s;
        s = s.replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\[/g, "[").replace(/\\\]/g, "]");
        var m, n = 0;
        while (n < 8) {
            m = s.match(/^\((.+):[ \t]*(-?\d+(?:\.\d+)?)[ \t]*\)$/);
            if (!m) break;
            s = String(m[1] || "").trim();
            n++;
        }
        while (s.length >= 2 && s.charAt(0) === "(" && s.charAt(s.length - 1) === ")") {
            var inner = s.slice(1, -1).trim();
            var open = (inner.match(/\(/g) || []).length;
            var close = (inner.match(/\)/g) || []).length;
            if (open !== close) break;
            s = inner;
        }
        s = s.replace(/^@+/, "").replace(/^artist:/i, "");
        return s.replace(/\s+/g, "_").replace(/^,+|,+$/g, "").toLowerCase();
    }

    function castPopEl() { return document.getElementById("cast-pop"); }
    function castPopBox() { return document.getElementById("cast-pop-box"); }
    function castPopOpen() {
        var pop = castPopEl();
        return !!(pop && !pop.hidden);
    }
    function saveCastPopBox() {
        var bx = castPopBox();
        if (bx && castPopOpen()) {
            var r = bx.getBoundingClientRect();
            if (r.width > 200 && r.height > 140) {
                if (!_castDock) {
                    _castFree.left = Math.round(r.left);
                    _castFree.top = Math.round(r.top);
                    _castFree.w = Math.round(r.width);
                    _castFree.h = Math.round(r.height);
                } else if (_castDock === "left" || _castDock === "right") {
                    _castFree.w = Math.round(r.width);
                } else {
                    _castFree.h = Math.round(r.height);
                }
            }
        }
        try {
            localStorage.setItem(LS_CAST_POP, JSON.stringify({
                dock: _castDock || "",
                collapsed: _castCollapsed ? 1 : 0,
                left: _castFree.left,
                top: _castFree.top,
                w: _castFree.w,
                h: _castFree.h
            }));
        } catch (e1) {}
    }
    function loadCastPopLayout() {
        if (_castLayLoaded) return;
        _castLayLoaded = true;
        try {
            var st = JSON.parse(localStorage.getItem(LS_CAST_POP) || "null");
            if (!st) return;
            if (st.w > 240) _castFree.w = st.w;
            if (st.h > 140) _castFree.h = st.h;
            if (st.left != null) _castFree.left = st.left;
            if (st.top != null) _castFree.top = st.top;
            _castDock = st.dock || "";
            _castCollapsed = !!st.collapsed;
        } catch (e2) {}
    }
    function restoreCastPopBox() {
        var bx = castPopBox();
        if (!bx) return;
        loadCastPopLayout();
        if (_castDock && snapRectFor(_castDock, popBand("cast"), _castFree, "cast")) {
            layoutAllDocks();
            return;
        }
        if (_castFree.w > 240) bx.style.width = Math.min(_castFree.w, window.innerWidth - 24) + "px";
        if (_castFree.h > 140) bx.style.height = Math.min(_castFree.h, window.innerHeight - 24) + "px";
        if (_castFree.left != null) bx.style.left = _castFree.left + "px";
        if (_castFree.top != null) bx.style.top = _castFree.top + "px";
        _castDock = "";
        if (typeof window.clampPopup === "function") window.clampPopup(bx);
    }
    function closeCastPop() {
        _castCollapsed = false;
        var pop = castPopEl();
        if (pop) pop.hidden = true;
        showSnapHint("");
        saveCastPopBox();
        layoutAllDocks();
    }
    function setCastCollapsed(on) {
        on = !!on;
        if (on) {
            _castCollapsed = true;
            var pop = castPopEl();
            if (pop) pop.hidden = true;
            showSnapHint("");
            saveCastPopBox();
            layoutAllDocks();
            return;
        }
        _castCollapsed = false;
        saveCastPopBox();
        openCastPop();
    }
    function openCastPop() {
        var pop = castPopEl();
        if (!pop) return;
        loadCastPopLayout();
        _castCollapsed = false;
        pop.hidden = false;
        restoreCastPopBox();
        saveCastPopBox();
        layoutAllDocks();
        raiseFilterPop("cast");
        if (!_castDock && typeof window.clampPopup === "function") window.clampPopup(castPopBox());
        if (!state.castIndex || state.castIndexSub !== folderScopeKey() || state.castIndexBusy) {
            loadCastIndex();
        } else {
            renderCastPop();
        }
    }
    function castFilterOn() { return !!state.castOn; }
    function setCastFilter(on) {
        on = !!on;
        state.castOn = on;
        try { localStorage.setItem(LS_CAST, on ? "1" : "0"); } catch (e3) {}
        syncFilterUi();
        if (!on) {
            closeCastPop();
            var dirty = !!(state.seriesKey || state.characterKey);
            state.seriesKey = "";
            state.characterKey = "";
            if (dirty) {
                state.page = 1;
                state.sel = null;
                closeLightbox();
                loadList();
            }
            return;
        }
        openCastPop();
    }
    function facetCn(it) {
        if (!it) return "";
        return it.cn || _castTl[it.key] || _castTl[it.tag] || "";
    }
    function facetNote(kind, it) {
        if (!it || typeof window.animaFacetNoteGet !== "function") return "";
        return window.animaFacetNoteGet(kind, it.tag || it.key) || "";
    }
    function seriesBaseName(it) {
        var key = (it && it.key) || facetNormKey(it && it.tag);
        if (key === "__none__") return T("无系列");
        if (key === "original") return T("原创");
        var en = String((it && (it.tag || it.key)) || key).replace(/_/g, " ");
        var cn = facetCn(it);
        return cn ? (en + " " + cn) : en;
    }
    function seriesDisplayName(it) {
        return facetNote("series", it) || seriesBaseName(it);
    }
    function charBaseName(it) {
        var en = String((it && (it.tag || it.key)) || "").replace(/_/g, " ");
        var cn = facetCn(it);
        return cn ? (en + " " + cn) : en;
    }
    function charDisplayName(it) {
        return facetNote("character", it) || charBaseName(it);
    }
    function facetQueryHit(it, q) {
        if (!q) return true;
        var en = String((it && (it.tag || it.key)) || "").replace(/_/g, " ").toLowerCase();
        var key = String((it && it.key) || "").toLowerCase();
        var tag = String((it && it.tag) || "");
        var qq = String(q).toLowerCase().replace(/_/g, " ").trim();
        var qq2 = qq.replace(/\s+/g, "_");
        function has(s) {
            s = String(s || "").toLowerCase();
            if (!s) return false;
            return s.indexOf(qq) >= 0 || (qq2 && s.indexOf(qq2) >= 0);
        }
        var cn = facetCn(it) || (it && it.cn) || "";
        var n1 = String(facetNote("series", it) || "");
        var n2 = String(facetNote("character", it) || "");
        var tl = _tlCache[tag] || _tlCache[key] || _tlCache[tag.replace(/_/g, " ")] || _tlCache[String(tag).replace(/ /g, "_")] || "";
        var favCn = "";
        for (var fi = 0; fi < (_favCharCache || []).length; fi++) {
            if (_favCharCache[fi] && _favCharCache[fi].key === key) {
                favCn = _favCharCache[fi].cn || "";
                break;
            }
        }
        return has(en) || has(key) || has(cn) || has(n1) || has(n2) || has(tl) || has(favCn)
            || has(seriesDisplayName(it)) || has(charDisplayName(it));
    }
    function editFacetNote(kind, it) {
        if (!it || typeof window.animaFacetNoteEdit !== "function") return;
        var tag = it.tag || it.key;
        if (!tag) return;
        window.animaFacetNoteEdit({
            kind: kind,
            tag: tag,
            fallback: kind === "series" ? seriesBaseName(it) : charBaseName(it),
            onSaved: function () { renderCastPop(); syncFilterUi(); }
        });
    }
    function applyCastKeys(nextSeries, nextChar) {
        nextSeries = nextSeries || "";
        nextChar = nextChar || "";
        if (state.seriesKey === nextSeries && state.characterKey === nextChar) return;
        state.seriesKey = nextSeries;
        state.characterKey = nextChar;
        state.page = 1;
        state.sel = null;
        closeLightbox();
        renderCastPop();
        syncFilterUi();
        loadList();
    }
    function makeCastChip(opts) {
        opts = opts || {};
        var b = el("button");
        b.type = "button";
        b.className = "cast-chip" + (opts.on ? " is-on" : "");
        if (opts.title) b.title = opts.title;
        var lab = el("span", "", opts.label || "");
        b.appendChild(lab);
        if (opts.count != null) {
            var n = el("span", "", " (" + String(opts.count) + ")");
            n.className = "n";
            b.appendChild(n);
        }
        b.onclick = opts.onclick || function () {};
        if (opts.oncontextmenu) {
            b.oncontextmenu = function (e) {
                e.preventDefault();
                e.stopPropagation();
                opts.oncontextmenu(e);
            };
        }
        return b;
    }
    function castVisibleList(list, selectedKey, q) {
        var out = [];
        var seen = {};
        function push(it) {
            if (!it || !it.key || seen[it.key]) return;
            seen[it.key] = 1;
            out.push(it);
        }
        var selectedIt = null;
        if (selectedKey) {
            for (var i = 0; i < list.length; i++) {
                if (list[i] && list[i].key === selectedKey) { selectedIt = list[i]; break; }
            }
        }
        if (!q) {
            if (selectedIt) push(selectedIt);
            for (var j = 0; j < list.length && out.length < 60; j++) push(list[j]);
            return out;
        }
        var matched = [];
        for (var k = 0; k < list.length; k++) {
            var it = list[k];
            if (!it || !it.key || it.key === selectedKey) continue;
            if (!facetQueryHit(it, q)) continue;
            matched.push(it);
        }
        if (window.animaFuzzyCmp) {
            matched.sort(function (a, b) {
                return window.animaFuzzyCmp(q, { tag: a.tag || a.key, cn: facetCn(a) }, { tag: b.tag || b.key, cn: facetCn(b) });
            });
        }
        if (selectedIt) push(selectedIt);
        for (var n = 0; n < matched.length && out.length < 240; n++) push(matched[n]);
        return out;
    }
    function tagsNeedingCastCn(items) {
        var tags = [];
        var seen = {};
        (items || []).forEach(function (it) {
            var t = it && (it.tag || it.key);
            var key = facetNormKey(t);
            if (!t || !key || key === "__none__" || key === "original") return;
            if (_castTl[key] || _castTlTried[key] || seen[key]) return;
            seen[key] = 1;
            tags.push(t);
        });
        return tags;
    }
    function ensureCastCn(tags) {
        if (!tags || !tags.length) return Promise.resolve();
        tags.forEach(function (t) {
            var key = facetNormKey(t);
            if (key) _castTlTried[key] = 1;
        });
        return fetch("/danbooru_anima/translate_tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tags: tags, cloud: false })
        }).then(function (r) { return r.json(); }).then(function (d) {
            var tr = (d && d.success && d.translations) || {};
            Object.keys(tr).forEach(function (k) {
                if (!tr[k]) return;
                _castTl[k] = tr[k];
                _castTl[facetNormKey(k)] = tr[k];
            });
        }).catch(function () {});
    }
    function requestCastCn(items) {
        var tags = tagsNeedingCastCn(items);
        if (!tags.length) return;
        if (_castCnBusy) { _castCnQueued = items; return; }
        _castCnBusy = true;
        var gen = _castIdxGen;
        ensureCastCn(tags).then(function () {
            _castCnBusy = false;
            if (gen !== _castIdxGen) return;
            var queued = _castCnQueued;
            _castCnQueued = null;
            renderCastPop();
            if (queued) requestCastCn(queued);
        });
    }
    function renderCastPop() {
        var seriesBox = document.getElementById("cast-series");
        var charBox = document.getElementById("cast-chars");
        var sub = document.getElementById("cast-pop-sub");
        var charLab = document.getElementById("cast-chars-lab");
        if (!seriesBox || !charBox) return;
        seriesBox.innerHTML = "";
        charBox.innerHTML = "";
        var idx = state.castIndex;
        var stale = state.castIndexBusy || !idx || state.castIndexSub !== folderScopeKey();
        if (sub) {
            if (state.castIndexBusy || stale) sub.textContent = T("正在读取本文件夹角色…");
            else if (idx && idx.error) sub.textContent = String(idx.error);
            else sub.textContent = T("先点系列，再点该系列里的角色。也可以直接搜角色（中文或英文）。") + " " + T("右键角色或系列可设备注");
        }
        if (stale || (idx && idx.error)) return;
        var q = String(state.castQ || "").trim();
        var seriesVis = castVisibleList(idx.series || [], state.seriesKey, q);
        seriesBox.appendChild(makeCastChip({
            label: T("全部"),
            on: !state.seriesKey,
            onclick: function () { applyCastKeys("", ""); }
        }));
        seriesVis.forEach(function (it) {
            if (!it || !it.key) return;
            seriesBox.appendChild(makeCastChip({
                label: seriesDisplayName(it),
                title: seriesBaseName(it) + " — " + T("右键设置备注"),
                count: it.count || 0,
                on: it.key === state.seriesKey,
                onclick: function () {
                    applyCastKeys(it.key === state.seriesKey ? "" : it.key, "");
                },
                oncontextmenu: function () { editFacetNote("series", it); }
            }));
        });
        if (charLab) charLab.textContent = (!q && state.seriesKey) ? T("本系列角色") : T("角色");
        var chars = [];
        if (q) chars = (idx.characters || []).filter(function (it) { return facetQueryHit(it, q); });
        else if (state.seriesKey) chars = ((idx.series_chars || {})[state.seriesKey] || []).slice();
        else chars = (idx.characters || []).slice();
        chars = castVisibleList(chars, state.characterKey, q ? q : "");
        var favMap = {};
        (_favCharCache || []).forEach(function (f) {
            if (f && f.key) favMap[f.key] = f;
        });
        if (!chars.length) {
            var empty = el("div", "", q ? T("无结果") : T("没有可显示的标签"));
            empty.className = "cast-empty";
            charBox.appendChild(empty);
            requestCastCn(seriesVis);
            return;
        }
        chars.forEach(function (a) {
            var fav = favMap[a.key] || {};
            var name = charDisplayName({ tag: a.tag || a.key, key: a.key, cn: a.cn || fav.cn });
            charBox.appendChild(makeCastChip({
                label: name,
                title: charBaseName({ tag: a.tag || a.key, key: a.key, cn: a.cn || fav.cn }) + " — " + T("右键设置备注"),
                count: a.count || 0,
                on: a.key === state.characterKey,
                onclick: function () {
                    var keepSeries = String(state.castQ || "").trim() ? "" : (state.seriesKey || "");
                    applyCastKeys(keepSeries, a.key && a.key === state.characterKey ? "" : a.key);
                },
                oncontextmenu: function () { editFacetNote("character", { tag: a.tag || a.key, key: a.key, cn: a.cn || fav.cn }); }
            }));
        });
        requestCastCn(seriesVis.concat(chars));
    }
    function loadCastIndex(opts) {
        var quiet = !!(opts && opts.quiet) && state.castIndex && state.castIndexSub === folderScopeKey();
        if (!quiet) {
            state.castIndexBusy = true;
            renderCastPop();
        }
        var gen = ++_castIdxGen;
        var sub = state.subfolder || "";
        return loadCastFavs().then(function () {
            return fetch("/danbooru_anima/output_prompt/cast_index?subfolder=" + encodeURIComponent(sub) + "&" + listDeepQuery());
        }).then(function (r) {
            if (!r.ok) throw new Error(r.status === 404 ? "need_restart" : String(r.status));
            return r.json();
        }).then(function (d) {
            if (gen !== _castIdxGen) return;
            if (!d || d.ok === false) {
                state.castIndexBusy = false;
                state.castIndex = { error: (d && d.error) || T("加载失败"), series: [], characters: [], series_chars: {}, png: 0 };
                state.castIndexSub = folderScopeKey();
                renderCastPop();
                return;
            }
            if (gen !== _castIdxGen) return;
            state.castIndexBusy = false;
            state.castIndex = d;
            state.castIndexSub = folderScopeKey();
            ["series", "characters"].forEach(function (field) {
                (d[field] || []).forEach(function (it) {
                    if (!it || !it.cn) return;
                    if (it.key) _castTl[it.key] = it.cn;
                    if (it.tag) _castTl[it.tag] = it.cn;
                });
            });
            var sc = d.series_chars || {};
            Object.keys(sc).forEach(function (sk) {
                (sc[sk] || []).forEach(function (it) {
                    if (!it || !it.cn) return;
                    if (it.key) _castTl[it.key] = it.cn;
                    if (it.tag) _castTl[it.tag] = it.cn;
                });
            });
            renderCastPop();
        }).catch(function (e) {
            if (gen !== _castIdxGen) return;
            state.castIndexBusy = false;
            state.castIndex = {
                error: String(e && e.message === "need_restart" ? T("请先重启 ComfyUI，再打开本页") : (e && e.message) || e),
                series: [],
                characters: [],
                series_chars: {},
                png: 0
            };
            state.castIndexSub = folderScopeKey();
            renderCastPop();
        });
    }


    function tagPopEl() { return document.getElementById("tag-pop"); }
    function tagPopBox() { return document.getElementById("tag-pop-box"); }
    function tagPopOpen() {
        var pop = tagPopEl();
        return !!(pop && !pop.hidden);
    }
    function tagFilterOn() { return !!state.tagOn; }
    function persistTagKey() {
        try {
            localStorage.setItem(LS_TAG, state.tagOn ? "1" : "0");
            localStorage.setItem(LS_TAG_KEY, state.tagKey || "");
            localStorage.setItem(LS_TAG_CN, state.tagCn || "");
        } catch (e0) {}
    }
    function saveTagPopBox() {
        var bx = tagPopBox();
        if (bx && tagPopOpen()) {
            var r = bx.getBoundingClientRect();
            if (r.width > 200 && r.height > 140) {
                if (!_tagDock) {
                    _tagFree.left = Math.round(r.left);
                    _tagFree.top = Math.round(r.top);
                    _tagFree.w = Math.round(r.width);
                    _tagFree.h = Math.round(r.height);
                } else if (_tagDock === "left" || _tagDock === "right") {
                    _tagFree.w = Math.round(r.width);
                } else {
                    _tagFree.h = Math.round(r.height);
                }
            }
        }
        try {
            localStorage.setItem(LS_TAG_POP, JSON.stringify({
                dock: _tagDock || "",
                collapsed: _tagCollapsed ? 1 : 0,
                left: _tagFree.left,
                top: _tagFree.top,
                w: _tagFree.w,
                h: _tagFree.h
            }));
        } catch (e1) {}
    }
    function loadTagPopLayout() {
        if (_tagLayLoaded) return;
        _tagLayLoaded = true;
        try {
            var st = JSON.parse(localStorage.getItem(LS_TAG_POP) || "null");
            if (!st) return;
            if (st.w > 240) _tagFree.w = st.w;
            if (st.h > 140) _tagFree.h = st.h;
            if (st.left != null) _tagFree.left = st.left;
            if (st.top != null) _tagFree.top = st.top;
            _tagDock = st.dock || "";
            _tagCollapsed = !!st.collapsed;
        } catch (e2a) {}
    }
    function restoreTagPopBox() {
        var bx = tagPopBox();
        if (!bx) return;
        loadTagPopLayout();
        if (_tagDock && snapRectFor(_tagDock, popBand("tag"), _tagFree, "tag")) {
            layoutAllDocks();
            return;
        }
        _tagDock = "";
        if (_tagFree.w > 240) bx.style.width = Math.min(_tagFree.w, window.innerWidth - 24) + "px";
        if (_tagFree.h > 140) bx.style.height = Math.min(_tagFree.h, window.innerHeight - 24) + "px";
        if (_tagFree.left != null) bx.style.left = _tagFree.left + "px";
        if (_tagFree.top != null) bx.style.top = _tagFree.top + "px";
        if (typeof window.clampPopup === "function") window.clampPopup(bx);
    }
    function setTagDock(kind) {
        var box = tagPopBox();
        var was = _tagDock;
        _tagDock = kind || "";
        if (!_tagDock && was && box) {
            var w = Math.max(360, _tagFree.w || 520);
            var h = Math.max(280, _tagFree.h || 520);
            var left = _tagFree.left != null ? _tagFree.left : 24;
            var top = _tagFree.top != null ? _tagFree.top : chromeBottom() + 16;
            if (was === "right") left = Math.max(24, window.innerWidth - w - 24);
            box.style.width = w + "px";
            box.style.height = h + "px";
            box.style.left = left + "px";
            box.style.top = top + "px";
        }
        layoutAllDocks();
        saveTagPopBox();
    }
    function closeTagPop() {
        _tagCollapsed = false;
        var pop = tagPopEl();
        if (pop) pop.hidden = true;
        saveTagPopBox();
        layoutAllDocks();
    }
    function setTagCollapsed(on) {
        on = !!on;
        if (on) {
            _tagCollapsed = true;
            var pop = tagPopEl();
            if (pop) pop.hidden = true;
            saveTagPopBox();
            layoutAllDocks();
            return;
        }
        _tagCollapsed = false;
        saveTagPopBox();
        openTagPop();
    }
    function openTagPop() {
        var pop = tagPopEl();
        if (!pop) return;
        loadTagPopLayout();
        _tagCollapsed = false;
        pop.hidden = false;
        restoreTagPopBox();
        saveTagPopBox();
        if (!_tagDock && typeof window.clampPopup === "function") window.clampPopup(tagPopBox());
        var q = document.getElementById("tag-pop-q");
        if (q) {
            q.value = state.tagQ || "";
            setTimeout(function () { try { q.focus(); } catch (e3) {} }, 40);
        }
        if (!state.tagIndex || state.tagIndexSub !== folderScopeKey() || state.tagIndexBusy) {
            loadTagIndex();
        } else {
            renderTagPop();
        }
    }
    function setTagFilter(on) {
        on = !!on;
        state.tagOn = on;
        persistTagKey();
        syncFilterUi();
        if (!on) {
            closeTagPop();
            var dirty = !!state.tagKey;
            state.tagKey = "";
            state.tagCn = "";
            persistTagKey();
            if (dirty) {
                state.page = 1;
                state.sel = null;
                closeLightbox();
                loadList();
            }
            return;
        }
        openTagPop();
    }
    function applyTagKey(key, cn) {
        key = String(key || "").trim();
        cn = cn || "";
        if (!key) {
            state.tagQ = "";
            var qClear = document.getElementById("tag-pop-q");
            if (qClear) qClear.value = "";
        }
        var qNow = document.getElementById("tag-pop-q");
        _tagAppliedQ = qNow ? (qNow.value || "") : "";
        if (state.tagKey === key) {
            renderTagPop();
            return;
        }
        state.tagKey = key;
        state.tagCn = cn;
        if (key && !state.tagOn) state.tagOn = true;
        persistTagKey();
        state.page = 1;
        state.sel = null;
        closeLightbox();
        syncFilterUi();
        renderTagPop();
        loadList();
    }
    function tagDisplayName(it) {
        if (!it) return state.tagKey || "";
        var cn = it.cn || "";
        var tag = it.tag || it.key || "";
        if (cn && tag && cn !== tag) return cn + "  " + tag.replace(/_/g, " ");
        return cn || tag.replace(/_/g, " ") || "";
    }
    function loadTagIndex(opts) {
        var quiet = !!(opts && opts.quiet) && state.tagIndex && state.tagIndexSub === folderScopeKey();
        if (!quiet) {
            state.tagIndexBusy = true;
            renderTagPop();
        }
        var gen = ++_tagIdxGen;
        var sub = state.subfolder || "";
        return fetch("/danbooru_anima/output_prompt/tag_index?subfolder=" + encodeURIComponent(sub) + "&" + listDeepQuery()).then(function (r) {
            if (!r.ok) throw new Error(r.status === 404 ? "need_restart" : String(r.status));
            return r.json();
        }).then(function (d) {
            if (gen !== _tagIdxGen) return;
            state.tagIndexBusy = false;
            if (!d || d.ok === false) {
                state.tagIndex = { error: (d && d.error) || T("加载失败"), tags: [], png: 0 };
            } else {
                state.tagIndex = d;
            }
            state.tagIndexSub = folderScopeKey();
            renderTagPop();
            maybeApplyTypedTag(false);
        }).catch(function (e) {
            if (gen !== _tagIdxGen) return;
            state.tagIndexBusy = false;
            state.tagIndex = { error: (e && e.message) === "need_restart" ? T("请先重启 ComfyUI，再从总设置打开本页") : T("加载失败"), tags: [], png: 0 };
            state.tagIndexSub = folderScopeKey();
            renderTagPop();
        });
    }
    function fetchTagFuzzy(q) {
        q = String(q || "").trim();
        var gen = ++_tagFuzzyGen;
        if (!q) {
            state.tagFuzzy = [];
            return Promise.resolve([]);
        }
        return fetch("/danbooru_anima/fuzzy_tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: q })
        }).then(function (r) { return r.json(); }).then(function (d) {
            if (gen !== _tagFuzzyGen) return state.tagFuzzy || [];
            var items = (d && d.tags) || [];
            state.tagFuzzy = items;
            return items;
        }).catch(function () {
            if (gen !== _tagFuzzyGen) return [];
            state.tagFuzzy = [];
            return [];
        });
    }
    function tagTextHit(it, q) {
        var cn = String((it && it.cn) || "").toLowerCase();
        var tag = String((it && (it.tag || it.key)) || "").toLowerCase();
        var sp = tag.replace(/_/g, " ");
        return cn.indexOf(q) >= 0 || tag.indexOf(q) >= 0 || sp.indexOf(q) >= 0;
    }
    function tagExactHit(it, q) {
        if (!it || !q) return false;
        var tag = String(it.tag || it.key || "").toLowerCase();
        var sp = tag.replace(/_/g, " ");
        var cn = String(it.cn || "").toLowerCase();
        if (tag === q || sp === q || cn === q) return true;
        var parts = cn.split(/[,，、]/);
        var i;
        for (i = 0; i < parts.length; i++) {
            if (parts[i].trim() === q) return true;
        }
        return false;
    }
    function tagSuggestRows(q) {
        var idx = (state.tagIndex && state.tagIndex.tags) || [];
        var fuzzy = state.tagFuzzy || [];
        q = String(q || "").trim().toLowerCase();
        var byKey = {};
        idx.forEach(function (it) {
            if (!it || !it.key) return;
            byKey[it.key] = it;
        });
        var out = [];
        var seen = {};
        function add(it, fromFuzzy) {
            if (!it) return;
            var key = facetNormKey(it.tag || it.key || "");
            if (!key || seen[key]) return;
            var hit = byKey[key];
            if (q && !tagTextHit(it, q) && !(hit && tagTextHit(hit, q))) return;
            seen[key] = 1;
            out.push({
                tag: (hit && hit.tag) || it.tag || key,
                key: key,
                cn: (hit && hit.cn) || it.cn || "",
                count: (hit && hit.count) || 0,
                fuzzy: !!fromFuzzy
            });
        }
        fuzzy.forEach(function (it) { add(it, true); });
        idx.forEach(function (it) {
            if (!it || !it.key) return;
            if (!q || tagTextHit(it, q)) add(it, false);
        });
        out.sort(function (a, b) {
            var cmp = window.animaFuzzyCmp ? window.animaFuzzyCmp(q, a, b) : 0;
            if (cmp) return cmp;
            if ((a.count || 0) !== (b.count || 0)) return (b.count || 0) - (a.count || 0);
            return String(a.tag || "").localeCompare(String(b.tag || ""));
        });
        return out.slice(0, 80);
    }
    function bestTypedTag(q) {
        q = String(q || "").trim().toLowerCase();
        if (q.length < 2) return null;
        var rows = tagSuggestRows(q);
        var exact = [];
        var i;
        for (i = 0; i < rows.length; i++) {
            if (rows[i] && rows[i].count && tagExactHit(rows[i], q)) exact.push(rows[i]);
        }
        if (!exact.length) return null;
        var keyExact = [];
        for (i = 0; i < exact.length; i++) {
            var tag = String(exact[i].tag || exact[i].key || "").toLowerCase();
            if (tag === q || tag.replace(/_/g, " ") === q) keyExact.push(exact[i]);
        }
        var pool = keyExact.length ? keyExact : exact;
        pool.sort(function (a, b) { return (b.count || 0) - (a.count || 0); });
        return pool[0];
    }
    function maybeApplyTypedTag(fromType) {
        if (!tagPopOpen()) return;
        var qEl = document.getElementById("tag-pop-q");
        if (!qEl) return;
        var val = qEl.value || "";
        if (!String(val).trim()) {
            if (fromType && state.tagKey) applyTagKey("", "");
            return;
        }
        if (_tagAppliedQ !== null && val === _tagAppliedQ) return;
        var pick = bestTypedTag(val);
        if (!pick || pick.key === state.tagKey) {
            if (pick && pick.key === state.tagKey) _tagAppliedQ = val;
            return;
        }
        applyTagKey(pick.key, pick.cn || "");
    }
    function applyTypedTagEnter() {
        var qEl = document.getElementById("tag-pop-q");
        var val = qEl ? (qEl.value || "") : "";
        if (!String(val).trim()) return;
        if (state.tagIndexBusy || !state.tagIndex) {
            toast(T("正在读取本文件夹标签…"));
            return;
        }
        var pick = bestTypedTag(val);
        if (!pick) {
            var rows = tagSuggestRows(val);
            var i;
            for (i = 0; i < rows.length; i++) {
                if (rows[i] && rows[i].count) { pick = rows[i]; break; }
            }
            if (!pick && rows.length) pick = rows[0];
        }
        if (!pick) {
            toast(T("无结果"));
            return;
        }
        if (!pick.count) toast(T("没有带该标签的图片"));
        applyTagKey(pick.key, pick.cn || "");
    }
    function renderTagPop() {
        var box = document.getElementById("tag-pop-list");
        var sub = document.getElementById("tag-pop-sub");
        var picked = document.getElementById("tag-pop-picked");
        var qEl = document.getElementById("tag-pop-q");
        if (!box) return;
        if (qEl && qEl.value !== (state.tagQ || "") && document.activeElement !== qEl) qEl.value = state.tagQ || "";
        box.innerHTML = "";
        var idx = state.tagIndex;
        var stale = state.tagIndexBusy || !idx || state.tagIndexSub !== folderScopeKey();
        if (sub) {
            if (state.tagIndexBusy || stale) sub.textContent = T("正在读取本文件夹标签…");
            else if (idx && idx.error) sub.textContent = String(idx.error);
            else sub.textContent = (listDeepOn() ? T("输入中文或英文，点选后筛选当前文件夹及其子文件夹") : T("输入中文或英文，点选后筛选当前文件夹")) + " · " + T("已索引 PNG") + " " + String(idx.png || 0);
        }
        if (picked) {
            picked.innerHTML = "";
            if (state.tagKey) {
                picked.hidden = false;
                var chip = el("button");
                chip.type = "button";
                chip.className = "tag-pop-chip is-on";
                chip.textContent = tagDisplayName({ tag: state.tagKey, key: state.tagKey, cn: state.tagCn });
                chip.title = T("点击取消该标签");
                chip.onclick = function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    applyTagKey("", "");
                };
                picked.appendChild(chip);
            } else {
                picked.hidden = true;
            }
        }
        if (stale || (idx && idx.error)) return;
        var rows = tagSuggestRows(state.tagQ);
        if (!rows.length) {
            box.appendChild(el("div", "tag-pop-empty", state.tagQ ? T("无结果") : T("输入中文，例如：丝袜")));
            return;
        }
        rows.forEach(function (it) {
            if (!it || !it.key) return;
            var b = el("button");
            b.type = "button";
            b.className = "tag-pop-row" + (it.key === state.tagKey ? " is-on" : "") + (it.count ? "" : " is-zero");
            var lab = el("span", "tag-en", String(it.tag || it.key).replace(/_/g, " "));
            b.appendChild(lab);
            if (it.cn) {
                var cn = el("span", "tag-cn", it.cn);
                b.appendChild(cn);
            }
            var n = el("span", "tag-n", String(it.count || 0));
            b.appendChild(n);
            b.title = (it.cn ? it.cn + " / " : "") + (it.tag || it.key);
            b.onclick = function () { applyTagKey(it.key, it.cn || ""); };
            box.appendChild(b);
        });
    }

    function setTitle() {
        var title = document.getElementById("page-title");
        var hint = document.getElementById("page-hint");
        if (title) title.textContent = T("输出提示词查看器");
        if (hint) hint.textContent = T("移到放大镜查看大图，单击查看标签");
        var negTitle = document.getElementById("neg-title");
        if (negTitle) negTitle.textContent = T("负面提示词");
        var negCopy = document.getElementById("neg-copy");
        if (negCopy) negCopy.textContent = T("复制");
        var negToggle = document.getElementById("neg-toggle");
        var negBox = document.getElementById("neg-box");
        if (negToggle && negBox && !negBox.hidden) {
            negToggle.textContent = negBox.classList.contains("is-open") ? T("收起") : T("展开");
        }
        document.title = T("输出提示词查看器");
        var popBtn = document.getElementById("btn-popwin");
        if (popBtn) {
            popBtn.textContent = T("单独窗口");
            popBtn.title = T("在没有书签栏的窗口中打开当前文件夹");
        }
        document.getElementById("lb-close").textContent = T("关闭");
        document.getElementById("lb-prev").textContent = T("上一张");
        document.getElementById("lb-next").textContent = T("下一张");
        var lbMoreBtn = document.getElementById("lb-more-btn");
        if (lbMoreBtn) {
            lbMoreBtn.title = T("更多。主圈一圈最多 7 个，点「更多」看其余，加号可换上主圈。拖动换位置，点击可固定");
            lbMoreBtn.setAttribute("aria-label", T("更多"));
        }
        var lbZoom = document.getElementById("lb-zoom");
        if (lbZoom) lbZoom.title = T("滚轮放大，按住拖动查看");
        lbSyncChrome();
        document.getElementById("btn-compare").textContent = T("对比");
        document.getElementById("cmp-close").textContent = T("退出对比");
        document.getElementById("cmp-go").textContent = T("开始对比");
        document.getElementById("cmp-clear").textContent = T("清空");
        var cmpExitLab = document.getElementById("cmp-exit");
        if (cmpExitLab) cmpExitLab.textContent = T("退出对比");
        renderCompareDock();
        var folderTitle = document.getElementById("folder-bar-title");
        if (folderTitle) folderTitle.textContent = T("文件夹");
        var mkLab = document.getElementById("btn-mkdir");
        if (mkLab) mkLab.textContent = T("新建");
        syncEditChrome();
        var trLab = document.getElementById("btn-trash");
        if (trLab && !trLab.classList.contains("is-on")) trLab.textContent = T("查看器回收站");
        var emLab = document.getElementById("btn-trash-empty");
        if (emLab) emLab.textContent = T("清空回收站");
        syncTrashToolbar(_trashInfo);
        applyFolderBar();
        var btnFilter = document.getElementById("btn-filter");
        if (btnFilter) btnFilter.textContent = T("筛选");
        var btnFilterClear = document.getElementById("btn-filter-clear");
        if (btnFilterClear) {
            btnFilterClear.textContent = T("清除");
            btnFilterClear.title = T("清除筛选");
        }
        applyShutdownUi(_sdLast);
        applyDeepChrome();
        applySortChrome();
        var artistLab = document.getElementById("filter-artist-lab");
        if (artistLab) artistLab.textContent = T("画师筛选");
        var castLab = document.getElementById("filter-cast-lab");
        if (castLab) castLab.textContent = T("角色筛选");
        var tagLab = document.getElementById("filter-tag-lab");
        if (tagLab) tagLab.textContent = T("标签筛选");
        var modelLab = document.getElementById("filter-model-lab");
        if (modelLab) modelLab.textContent = T("模型筛选");
        var modelTitle = document.getElementById("model-pop-title");
        if (modelTitle) modelTitle.textContent = T("模型筛选");
        var modelSub = document.getElementById("model-pop-sub");
        if (modelSub) modelSub.textContent = T("点一个主模型。可以多选。不选就是全部。和画师、角色、标签、评分一起生效。");
        var modelFold = document.getElementById("model-pop-fold");
        if (modelFold) modelFold.textContent = T("收起");
        syncHeartRateUi();
        var tagTitle = document.getElementById("tag-pop-title");
        if (tagTitle) tagTitle.textContent = T("标签筛选");
        var tagClose = document.getElementById("tag-pop-close");
        if (tagClose) tagClose.textContent = T("关闭");
        var tagSub = document.getElementById("tag-pop-sub");
        if (tagSub) tagSub.textContent = T("输入中文或英文，点选后筛选当前文件夹及其子文件夹");
        var tagQ = document.getElementById("tag-pop-q");
        if (tagQ) tagQ.placeholder = T("例如：丝袜、smile");
        var castTitle = document.getElementById("cast-pop-title");
        if (castTitle) castTitle.textContent = T("角色筛选");
        var castClose = document.getElementById("cast-pop-close");
        if (castClose) castClose.textContent = T("关闭");
        var castSub = document.getElementById("cast-pop-sub");
        if (castSub) castSub.textContent = T("先点系列，再点该系列里的角色。也可以直接搜角色（中文或英文）。") + " " + T("右键角色或系列可设备注");
        var castQ = document.getElementById("cast-pop-q");
        if (castQ) castQ.placeholder = T("搜索系列或角色");
        var castSeriesLab = document.getElementById("cast-series-lab");
        if (castSeriesLab) castSeriesLab.textContent = T("系列");
        var castCharsLab = document.getElementById("cast-chars-lab");
        if (castCharsLab) castCharsLab.textContent = state.seriesKey ? T("本系列角色") : T("角色");
        var liveLab = document.getElementById("btn-live-lab");
        if (liveLab) liveLab.textContent = T("AI");
        var soloLab = document.getElementById("btn-solo-lab");
        if (soloLab) soloLab.textContent = T("单画师模式");
        var popTitle = document.getElementById("artist-pop-title");
        if (popTitle) popTitle.textContent = T("画师筛选");
        var popClose = document.getElementById("artist-pop-close");
        if (popClose) popClose.textContent = T("关闭");
        var popUndock = document.getElementById("artist-pop-undock");
        if (popUndock) popUndock.textContent = T("取消吸附");
        var popFold = document.getElementById("artist-pop-fold");
        if (popFold) {
            popFold.textContent = T("收起");
            popFold.title = T("收起成按钮，再点即可展开");
        }
        var pickTitle = document.getElementById("pick-artist-title");
        if (pickTitle) pickTitle.textContent = T("选择画师生成同款");
        var pickClose = document.getElementById("pick-artist-close");
        if (pickClose) pickClose.textContent = T("关闭");
        var pickQ = document.getElementById("pick-artist-q");
        if (pickQ) pickQ.placeholder = T("搜索画师");
        applyPickChrome();
        var pickTabs = document.getElementById("pick-artist-tabs");
        if (pickTabs) {
            var tbtns = pickTabs.querySelectorAll("button");
            for (var ti = 0; ti < tbtns.length; ti++) {
                var src = tbtns[ti].getAttribute("data-src");
                if (src === "all") tbtns[ti].textContent = T("全部");
                else if (src === "danbooru") tbtns[ti].textContent = T("D站");
                else if (src === "gelbooru") tbtns[ti].textContent = T("G站");
            }
        }
        var popHd = document.getElementById("artist-pop-hd");
        if (popHd) popHd.title = T("拖到左/右边缘、顶栏下或信息栏上可吸附");
        var castUndock = document.getElementById("cast-pop-undock");
        if (castUndock) castUndock.textContent = T("取消吸附");
        var castFold = document.getElementById("cast-pop-fold");
        if (castFold) {
            castFold.textContent = T("收起");
            castFold.title = T("收起成按钮，再点即可展开");
        }
        var castClose = document.getElementById("cast-pop-close");
        if (castClose) castClose.textContent = T("关闭");
        var tagFold = document.getElementById("tag-pop-fold");
        if (tagFold) {
            tagFold.textContent = T("收起");
            tagFold.title = T("收起成按钮，再点即可展开");
        }
        var tagClose = document.getElementById("tag-pop-close");
        if (tagClose) tagClose.textContent = T("关闭");
        var insTitle = document.getElementById("inspect-title");
        if (insTitle) insTitle.textContent = T("图像信息");
        var insFloat = document.getElementById("inspect-float");
        if (insFloat) insFloat.textContent = T("浮窗");
        var insFold = document.getElementById("inspect-collapse");
        if (insFold) insFold.textContent = T("收起");
        var insHd = document.getElementById("inspect-hd");
        if (insHd) insHd.title = T("拖到边缘可吸附，点浮窗脱离停靠");
        var insFab = document.getElementById("inspect-fab");
        if (insFab) insFab.title = T("展开图像信息");
        var castHd = document.getElementById("cast-pop-hd");
        if (castHd) castHd.title = T("拖到左/右边缘、顶栏下或信息栏上可吸附");
        syncFilterUi();
        var sizeLab = document.getElementById("page-size-lab");
        if (sizeLab) sizeLab.textContent = T("每页");
        applyBrowseChrome();
        applyFxClass();
        syncRefreshBtnTitle();
        syncImgFavToolbar();
        applyFavDirI18n();
        var rz = document.getElementById("inspect-resizer");
        if (rz) rz.title = T("拖拽调整信息栏高度，双击恢复默认");
        var arz = document.getElementById("artist-pop-rs");
        if (arz) arz.title = T("拖拽调整大小，双击恢复默认");
        var crz = document.getElementById("cast-pop-rs");
        if (crz) crz.title = T("拖拽调整大小");
    }

    function renderCrumb() {
        var box = document.getElementById("crumb");
        box.innerHTML = "";
        var root = el("button", "", T("output 根目录"));
        root.type = "button";
        root.onclick = function () { changeFolder(""); };
        box.appendChild(root);
        if (state.subfolder === IMG_FAV_SUB) {
            box.appendChild(el("span", "", "/"));
            var favB = el("button", "", T("★ 收藏夹"));
            favB.type = "button";
            favB.onclick = function () { changeFolder(IMG_FAV_SUB); };
            box.appendChild(favB);
            return;
        }
        if (isTrashView()) {
            box.appendChild(el("span", "", "/"));
            var trB = el("button", "", T("查看器回收站"));
            trB.type = "button";
            trB.onclick = function () { changeFolder(OPV_TRASH_SUB); };
            box.appendChild(trB);
            var rest = trashRelOf(state.subfolder);
            if (rest) {
                var partsT = String(state.subfolder || "").slice(OPV_TRASH_SUB.length + 1).split("/").filter(Boolean);
                var accT = OPV_TRASH_SUB;
                for (var ti = 0; ti < partsT.length; ti++) {
                    accT += "/" + partsT[ti];
                    (function (sub, name) {
                        box.appendChild(el("span", "", "/"));
                        var tb = el("button", "", name);
                        tb.type = "button";
                        tb.onclick = function () { changeFolder(sub); };
                        box.appendChild(tb);
                    })(accT, partsT[ti]);
                }
            }
            return;
        }
        var parts = (state.subfolder || "").split("/").filter(Boolean);
        var acc = "";
        for (var i = 0; i < parts.length; i++) {
            acc = acc ? (acc + "/" + parts[i]) : parts[i];
            (function (sub, name) {
                box.appendChild(el("span", "", "/"));
                var b = el("button", "", name);
                b.type = "button";
                b.onclick = function () { changeFolder(sub); };
                box.appendChild(b);
            })(acc, parts[i]);
        }
    }

    function folderCount() {
        if (state.subfolder === IMG_FAV_SUB) return (state.folders || []).length;
        return (state.parent != null ? 1 : 0) + (state.folders || []).length;
    }
    function applyFolderBar() {
        var n = folderCount();
        var canOpen = n > 0;
        if (!canOpen) _foldersOpen = false;
        var bar = document.getElementById("folder-bar");
        if (bar) bar.classList.toggle("is-open", !!(_foldersOpen && canOpen));
        var btn = document.getElementById("btn-folders");
        if (btn) {
            btn.hidden = !canOpen;
            btn.setAttribute("aria-expanded", (_foldersOpen && canOpen) ? "true" : "false");
            btn.title = _foldersOpen ? T("收起文件夹") : T("展开文件夹");
        }
        var countEl = document.getElementById("folder-bar-count");
        if (countEl) countEl.textContent = canOpen ? String(n) : "";
    }
    function toggleFolders() {
        if (folderCount() <= 0) return;
        _foldersOpen = !_foldersOpen;
        applyFolderBar();
        layoutAllDocks();
    }
    function renderFolders() {
        var box = document.getElementById("folders");
        box.innerHTML = "";
        if (state.parent != null && state.subfolder !== IMG_FAV_SUB) {
            var up = el("div");
            up.className = "folder is-up";
            var upIco = el("span", "", "↑");
            upIco.className = "ico";
            up.appendChild(upIco);
            up.appendChild(document.createTextNode(T("上级目录")));
            up.onclick = function () { changeFolder(state.parent || ""); };
            box.appendChild(up);
        }
        (state.folders || []).forEach(function (f, fi) {
            var d = el("div");
            d.className = "folder";
            var ico = el("span");
            ico.className = "ico";
            d.appendChild(ico);
            d.appendChild(document.createTextNode(f.name));
            d.onclick = function () { changeFolder(f.subfolder); };
            d.oncontextmenu = function (e) {
                e.preventDefault();
                e.stopPropagation();
                openFolderCtx(f, e.clientX, e.clientY);
            };
            if (!fxCheap() && _foldersOpen && fi < 28) d.style.animationDelay = (0.04 + fi * 0.028) + "s";
            box.appendChild(d);
        });
        applyFolderBar();
        layoutAllDocks();
    }

    function renderGrid(opts) {
        var box = document.getElementById("grid");
        if (!box) return;
        var append = !!(opts && opts.append) && isFlow();
        if (!append) box.innerHTML = "";
        applyBrowseChrome();
        if (!(state.items || []).length) {
            var emptyMsg = T("该文件夹没有图片");
            if (state.subfolder === IMG_FAV_SUB && !state.artistKey && !state.soloArtist && !state.seriesKey && !state.characterKey && !state.tagKey && !state.heartRate && !state.modelKey) emptyMsg = T("收藏夹里还没有图片");
            else if (isTrashView() && !state.artistKey && !state.soloArtist && !state.seriesKey && !state.characterKey && !state.tagKey && !state.heartRate && !state.modelKey) emptyMsg = T("查看器回收站是空的");
            else if (state.artistKey && state.soloArtist) emptyMsg = T("没有该画师的单画师图");
            else if (state.seriesKey && state.characterKey) emptyMsg = T("没有该系列里这个角色的图片");
            else if (state.characterKey) emptyMsg = T("没有该角色的图片");
            else if (state.seriesKey) emptyMsg = T("没有该系列的图片");
            else if (state.tagKey) emptyMsg = T("没有带该标签的图片");
            else if (state.modelKey) emptyMsg = T("没有使用所选模型的图片");
            else if (state.artistKey) emptyMsg = T("这个画师在本文件夹没有图");
            else if (state.heartRate === -1) emptyMsg = T("没有未评分的图片");
            else if (state.heartRate) emptyMsg = T("没有这个评分的图片");
            else if (state.soloArtist) emptyMsg = T("没有只有一个画师标签的图片");
            box.appendChild(el("div", "", emptyMsg));
            box.lastChild.className = "empty";
            setFlowMore("");
            return;
        }
        var start = 0;
        if (append) {
            start = box.querySelectorAll(".tile").length;
            if (start >= state.items.length) {
                syncTileFlags();
                return;
            }
        }
        var selKey = itemKey(state.sel);
        var cheap = fxCheap();
        for (var i = start; i < state.items.length; i++) {
            box.appendChild(makeTile(state.items[i], selKey, i - start, cheap));
        }
        if (isFlow()) {
            var laid = box.querySelectorAll(".tile");
            for (var t = start; t < laid.length; t++) {
                layoutFlowTile(laid[t], laid[t].querySelector("img"));
            }
        }
        if (isFlow() && !window.__animaGalleryPtrDown) recycleFlow();
    }

    function takeNewFront(fresh) {
        var have = {};
        var old = state.items || [];
        for (var i = 0; i < old.length; i++) have[itemKey(old[i])] = 1;
        var added = [];
        for (var j = 0; j < (fresh || []).length; j++) {
            var k = itemKey(fresh[j]);
            if (!k) continue;
            if (have[k]) break;
            have[k] = 1;
            added.push(fresh[j]);
        }
        return added;
    }

    function prependTiles(items) {
        var box = document.getElementById("grid");
        if (!box || !(items || []).length) return;
            var empty = box.querySelector(".empty");
        if (empty) empty.remove();
        var selKey = itemKey(state.sel);
        var cheap = fxCheap();
        var frag = document.createDocumentFragment();
        var tiles = [];
        for (var i = 0; i < items.length; i++) {
            var tile = makeTile(items[i], selKey, cheap ? -1 : i, cheap);
            tile.classList.add("is-new");
            frag.appendChild(tile);
            tiles.push(tile);
        }
        box.insertBefore(frag, box.firstChild);
        if (isFlow()) {
            for (var t = 0; t < tiles.length; t++) {
                layoutFlowTile(tiles[t], tiles[t].querySelector("img"));
            }
        }
        if (!isFlow()) {
            var keep = state.pageSize || 36;
            var extras = box.querySelectorAll(".tile");
            for (var n = extras.length - 1; n >= keep; n--) extras[n].remove();
        }
        syncTileFlags();
    }

    function applyMergedList(d, more) {
        var added = (listSort() === "newest") ? takeNewFront(more) : [];
        if (added.length) {
            state.items = added.concat(state.items || []);
            if (!isFlow()) {
                var keep = state.pageSize || 36;
                if (state.items.length > keep) state.items = state.items.slice(0, keep);
            }
            prependTiles(added);
        }
        if (typeof d.total === "number") state.total = d.total;
        if (typeof d.pages === "number") state.pages = d.pages;
        if (d.subfolder != null) state.subfolder = d.subfolder || "";
        if (d.folders) {
            var prev = ((state.folders || []).length) + ":" + ((state.folders[0] && state.folders[0].name) || "");
            state.folders = d.folders;
            var next = (d.folders.length) + ":" + ((d.folders[0] && d.folders[0].name) || "");
            if (prev !== next) renderFolders();
        }
        if (d.parent !== undefined) state.parent = d.parent;
        renderPager();
    }

    var _osDrag = null;
    var _osDragEatClick = false;
    function osDragDown(e, it) {
        if (!e || e.button !== 0 || _editOn || !it || !it.filename) return;
        if (e.pointerType && e.pointerType !== "mouse") return;
        if (e.target && e.target.closest && e.target.closest("button, a, input, textarea")) return;
        _osDrag = { x: e.clientX, y: e.clientY, it: it, sent: false, pid: e.pointerId };
    }
    function osDragSend(it) {
        var payload = JSON.stringify({ filename: it.filename, subfolder: it.subfolder || "" });
        fetch("/danbooru_anima/output_prompt/drag_out", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload
        }).then(function (r) {
            if (!r.ok) throw new Error("http");
            return r.json();
        }).then(function (j) {
            if (j && j.ok) return;
            if (j && j.quiet) return;
            toast(T((j && j.error) || "拖出失败"));
        }).catch(function () {
            toast(T("拖出失败，请重启 ComfyUI 后再试"));
        });
    }
    function osDragMove(e) {
        var d = _osDrag;
        if (!d || d.sent || !e || e.pointerId !== d.pid) return;
        if ((e.buttons & 1) === 0) { _osDrag = null; return; }
        var dx = e.clientX - d.x;
        var dy = e.clientY - d.y;
        if (dx * dx + dy * dy < 64) return;
        d.sent = true;
        _osDragEatClick = true;
        setTimeout(function () { _osDragEatClick = false; }, 500);
        hidePeek();
        osDragSend(d.it);
    }
    function osDragUp(e) {
        if (!_osDrag) return;
        if (e && e.pointerId != null && _osDrag.pid !== e.pointerId) return;
        _osDrag = null;
    }
    function syncTileFileDrag() {
        var box = document.getElementById("grid");
        if (!box) return;
        var tiles = box.querySelectorAll(".tile");
        var i;
        for (i = 0; i < tiles.length; i++) tiles[i].draggable = false;
    }
    function syncLbFileDrag() {
        var img = document.getElementById("lightbox-img");
        if (!img) return;
        img.draggable = false;
        img.classList.remove("is-file-drag");
    }
    function makeTile(it, selKey, delayIdx, cheap) {
        var picked = cmpFind(it) >= 0;
        var ek = itemKey(it);
        var tile = el("div");
        tile.className = "tile" + (ek === selKey ? " is-on" : "") + (picked ? " is-cmp" : "") + (isImgFav(it) ? " is-fav" : "") + ((_editOn && _editSel[ek]) ? " is-edit" : "");
        tile.setAttribute("data-key", ek);
        tile.setAttribute("data-fn", it.filename || "");
        tile.setAttribute("data-sub", it.subfolder || "");
        tile.title = _editOn
            ? T("点选可勾选，按住 Shift 连选")
            : (state.compareOn
            ? T("点击勾选，用于对比")
            : T("移到放大镜查看大图，单击查看标签") + " · " + T("按住拖到其他软件"));
        if (!cheap && delayIdx >= 0 && delayIdx < 40) {
            tile.style.animationDelay = (delayIdx * 0.032) + "s";
        }
        var badge = el("div", "", picked ? "✓" : "");
        badge.className = "pick";
        tile.appendChild(badge);
        var img = document.createElement("img");
        img.loading = "lazy";
        img.decoding = "async";
        img.alt = it.filename;
        img.draggable = false;
        tile.draggable = false;
        tile.addEventListener("dragstart", function (e) { e.preventDefault(); });
        img.onload = function () {
            img.classList.add("is-ready");
            if (window.__animaGalleryPtrDown) { _flowHoldLayout = true; return; }
            layoutFlowTile(tile, img);
            if (isFlow()) maybeLoadMore();
        };
        img.onerror = function () { img.classList.add("is-ready"); };
        img.src = it.url;
        var pic = el("div");
        pic.className = "tile-pic";
        pic.appendChild(img);
        var zoom = el("button");
        zoom.type = "button";
        zoom.className = "tile-zoom";
        zoom.title = T("查看大图");
        zoom.setAttribute("aria-label", T("查看大图"));
        zoom.innerHTML = ICON_ZOOM;
        zoom.onmouseenter = function () { showPeek(it, tile); };
        zoom.onmouseleave = function () { hidePeek(); };
        zoom.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (itemKey(state.sel) !== itemKey(it)) selectItem(it, true);
            openLightbox(it);
        };
        pic.appendChild(zoom);
        var favBtn = el("button", "", isImgFav(it) ? "★" : "☆");
        favBtn.type = "button";
        favBtn.className = "tile-fav" + (isImgFav(it) ? " is-on" : "");
        favBtn.title = isImgFav(it) ? T("移出收藏夹") : T("加入收藏夹");
        favBtn.setAttribute("aria-label", favBtn.title);
        favBtn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleImgFav(it);
        };
        pic.appendChild(favBtn);
        pic.appendChild(makeHeartRow(it));
        var editMark = el("span");
        editMark.className = "edit-mark";
        editMark.setAttribute("aria-hidden", "true");
        pic.appendChild(editMark);
        tile.appendChild(pic);
        if (img.complete) img.classList.add("is-ready");
        if (isFlow()) {
            if (window.__animaGalleryPtrDown) _flowHoldLayout = true;
            else layoutFlowTile(tile, img);
            if (img.complete) layoutFlowTile(tile, img);
        }
        var cap = el("div", "", it.filename);
        cap.className = "nm";
        tile.appendChild(cap);
        tile.onmouseleave = function () { hidePeek(); };
        tile.onclick = function (e) {
            if (_osDragEatClick) { _osDragEatClick = false; return; }
            if (_editOn) {
                if (_editDragSelect) {
                    _editDragSelect = false;
                    return;
                }
                if (e && e.shiftKey) editRangeTo(it);
                else editToggle(it);
                return;
            }
            if (state.compareOn) toggleCompareItem(it);
            else selectItem(it);
        };
        tile.oncontextmenu = function (e) {
            e.preventDefault();
            e.stopPropagation();
            openCtxMenu(it, e.clientX, e.clientY);
        };
        return tile;
    }

    function syncTileFlags() {
        var box = document.getElementById("grid");
        if (!box) return;
        var tiles = box.querySelectorAll(".tile");
        if (!tiles.length) {
            renderGrid();
            return;
        }
        var selKey = itemKey(state.sel);
        for (var i = 0; i < tiles.length; i++) {
            var tile = tiles[i];
            var it = { filename: tile.getAttribute("data-fn") || "", subfolder: tile.getAttribute("data-sub") || "" };
            var picked = cmpFind(it) >= 0;
            tile.classList.toggle("is-on", (tile.getAttribute("data-key") || "") === selKey);
            tile.classList.toggle("is-cmp", picked);
            tile.classList.toggle("is-edit", !!(_editOn && _editSel[tile.getAttribute("data-key") || ""]));
            var badge = tile.querySelector(".pick");
            if (badge) badge.textContent = picked ? "✓" : "";
        }
    }

    function goPage(n) {
        if (isFlow()) return;
        n = parseInt(n, 10);
        if (!n || n < 1) n = 1;
        if (n > (state.pages || 1)) n = state.pages || 1;
        if (n === state.page) return;
        state.page = n;
        hidePeek();
        if (!state.compareOn) {
            state.sel = null;
            closeLightbox();
        }
        loadList();
    }

    function renderPager() {
        var box = document.getElementById("pager");
        box.innerHTML = "";
        var info = el("span", "", state.page + " / " + state.pages);
        info.className = "pg-info";
        var prev = el("button", "", T("上一页"));
        prev.type = "button";
        prev.disabled = state.page <= 1;
        prev.onclick = function () { goPage(state.page - 1); };
        var next = el("button", "", T("下一页"));
        next.type = "button";
        next.disabled = state.page >= state.pages;
        next.onclick = function () { goPage(state.page + 1); };
        var inp = document.createElement("input");
        inp.type = "number";
        inp.min = "1";
        inp.max = String(state.pages);
        inp.value = String(state.page);
        inp.title = T("跳转页面");
        inp.onchange = function () { goPage(inp.value); };
        inp.onkeydown = function (e) {
            if (e.key === "Enter") { e.preventDefault(); goPage(inp.value); }
        };
        box.appendChild(prev);
        box.appendChild(inp);
        box.appendChild(next);
        box.appendChild(info);
        var count = document.getElementById("count");
        if (count) {
            count.textContent = "";
            if (isFlow()) {
                var loaded = (state.items || []).length;
                count.appendChild(document.createTextNode(T("已加载") + " " + loaded + " / " + String(state.total) + " " + T("张")));
            } else {
                count.appendChild(document.createTextNode(String(state.total) + " " + T("张")));
            }
        }
        if (isFlow()) {
            if (_flowEnd) setFlowMore(T("已经到底了"));
            else if (_flowBusy) setFlowMore(T("正在加载更多…"));
            else setFlowMore("");
        }
    }

    function uniqArtists(list) {
        var out = [];
        var seen = {};
        (list || []).forEach(function (t) {
            var raw = String(t || "").trim();
            if (!raw) return;
            var p = window.animaParseWeightTag ? window.animaParseWeightTag(raw) : { tag: raw };
            var inner = p.tag || raw;
            var key = window.animaArtistNorm
                ? window.animaArtistNorm(inner)
                : inner.replace(/^@+/, "").replace(/^artist:/i, "").replace(/_/g, " ").trim().toLowerCase();
            if (!key || seen[key]) return;
            seen[key] = 1;
            out.push(raw);
        });
        return out;
    }

    function makeArtistChip(tag) {
        var chip = el("div");
        var wide = tag.length > 40 || tag.indexOf("\n") >= 0;
        if (typeof window.animaApplyTagChip === "function") {
            window.animaApplyTagChip(chip, "#e91e63", { static: true, pick: true, wide: wide });
        } else {
            chip.style.cssText = "padding:4px 9px;border-radius:8px;cursor:pointer;background:#e91e6322;border:1px solid #e91e6388;";
        }
        var lab = el("span", "", window.animaChipLabel ? window.animaChipLabel(tag, 1, false) : tag);
        lab.className = "anima-chip-en";
        chip.appendChild(lab);
        var cn = _tlCache[tag] || "";
        if (cn) {
            var cnEl = el("span", "", cn);
            cnEl.className = "anima-chip-cn";
            chip.appendChild(cnEl);
        }
        chip.title = T("点击标签复制");
        chip.onclick = function () { copyText(tag); };
        bindArtistFlyout(chip, tag);
        applyPinMark(chip, tag);
        return chip;
    }

    function hideArtistsRow() {
        _artistRowGen++;
        var row = document.getElementById("artists-row");
        var body = document.querySelector(".inspect-body");
        if (row) {
            row.innerHTML = "";
            row.hidden = true;
            row.classList.remove("solo");
        }
        if (body) body.classList.remove("has-artists");
    }

    function renderArtists(artists) {
        var row = document.getElementById("artists-row");
        var body = document.querySelector(".inspect-body");
        if (!row) return;
        hideArtistsRow();
        var list = uniqArtists(artists);
        if (!list.length) return;
        var gen = _artistRowGen;
        row.hidden = false;
        if (body) body.classList.add("has-artists");
        var kicker = el("span", "", T("画师"));
        kicker.className = "artists-kicker";
        row.appendChild(kicker);
        if (list.length === 1) {
            row.classList.add("solo");
            var thumbWrap = el("div");
            thumbWrap.className = "art-thumb-wrap";
            var frame = el("div");
            frame.className = "art-thumb-frame";
            var thumb = el("img");
            thumb.className = "art-thumb";
            thumb.alt = list[0];
            frame.appendChild(thumb);
            mountArtThumbPin(frame, list[0]);
            thumbWrap.appendChild(frame);
            row.appendChild(thumbWrap);
            resolveArtistForFlyout(list[0]).then(function (info) {
                if (gen !== _artistRowGen) return;
                var foundTag = (info && info.found && info.found.tag) || list[0];
                var raw = (info && info.thumbUrl) || "";
                var url = info && info.useAdexProxy ? adexSrc(raw) : favImgUrl(raw, foundTag);
                if (!url) url = favImgUrl(raw, list[0]);
                if (!url) url = localFavThumb(foundTag) || localFavThumb(list[0]);
                if (!url) return;
                if (info && info.useAdexProxy) {
                    thumb.src = url;
                    thumb.onerror = function () { thumbWrap.classList.remove("is-on"); };
                } else {
                    bindFavThumb(thumb, raw, foundTag, favThumbSource(raw));
                }
                thumbWrap.classList.add("is-on");
                thumb.title = T("点击标签复制");
                thumb.onclick = function () { copyText(list[0]); };
                applyPinMark(frame, list[0]);
            });
        }
        var wrap = el("div");
        wrap.className = "art-list";
        list.forEach(function (tag) { wrap.appendChild(makeArtistChip(tag)); });
        row.appendChild(wrap);
    }

    function renderChips(tags, artists) {
        var box = document.getElementById("chips");
        box.innerHTML = "";
        var gen = ++_renderGen;
        if (!tags || !tags.length) {
            box.appendChild(el("div", "", T("没有可显示的标签")));
            box.lastChild.className = "empty";
            return;
        }
        var unknown = tags.filter(function (t) { return !(t in _tlCache) && !(t in _tlMissing); });
        if (unknown.length) {
            var apiTags = unknown.map(function (t) { return t.replace(/ /g, "_"); });
            fetch("/danbooru_anima/translate_tags", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tags: apiTags })
            }).then(function (r) { return r.json(); }).then(function (d) {
                if (d && d.success && d.translations) {
                    for (var i = 0; i < unknown.length; i++) {
                        var tv = d.translations[apiTags[i]] || "";
                        if (tv) _tlCache[unknown[i]] = tv;
                        else _tlMissing[unknown[i]] = 1;
                    }
                } else {
                    for (var j = 0; j < unknown.length; j++) _tlMissing[unknown[j]] = 1;
                }
                if (_renderGen === gen) renderChips(tags, artists);
            }).catch(function () {
                for (var j = 0; j < unknown.length; j++) _tlMissing[unknown[j]] = 1;
            });
        }
        tags.forEach(function (tag) {
            var cn = _tlCache[tag] || "";
            var col = tagColor(tag);
            var isArtist = window.animaChipLooksArtist ? window.animaChipLooksArtist(tag, _favArtCache) : (String(tag).indexOf("@") === 0);
            if (!isArtist && artists && artists.indexOf(tag) >= 0) isArtist = true;
            var chip = el("div");
            var wide = tag.length > 40 || tag.indexOf("\n") >= 0;
            if (typeof window.animaApplyTagChip === "function") {
                window.animaApplyTagChip(chip, isArtist ? "#e91e63" : col, { static: true, pick: true, wide: wide });
            } else {
                chip.style.cssText = "padding:4px 9px;border-radius:8px;cursor:pointer;background:" + col + "22;border:1px solid " + col + "88;";
            }
            var lab = el("span", "", window.animaChipLabel ? window.animaChipLabel(tag, 1, false) : tag);
            lab.className = "anima-chip-en";
            chip.appendChild(lab);
            if (cn) {
                var cnEl = el("span", "", cn);
                cnEl.className = "anima-chip-cn";
                chip.appendChild(cnEl);
            }
            chip.title = isArtist ? T("点击标签复制") : (T("点击标签复制") + " · " + T("右键去D站或G站"));
            chip.onclick = function () { copyText(tag); };
            if (isArtist) {
                bindArtistFlyout(chip, tag);
                applyPinMark(chip, tag);
            } else {
                chip.oncontextmenu = function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    openTagSearchMenu(tag, e.clientX, e.clientY);
                };
            }
            box.appendChild(chip);
        });
    }

    function renderNegative(d) {
        var box = document.getElementById("neg-box");
        var body = document.getElementById("neg-body");
        var btn = document.getElementById("neg-toggle");
        var copyBtn = document.getElementById("neg-copy");
        if (!box || !body) return;
        var text = String((d && d.negative) || "").trim();
        box.hidden = !text;
        body.textContent = text;
        if (!text) {
            box.classList.remove("is-open");
            if (btn) {
                btn.setAttribute("aria-expanded", "false");
                btn.textContent = T("展开");
            }
            return;
        }
        var open = box.classList.contains("is-open");
        if (btn) {
            btn.setAttribute("aria-expanded", open ? "true" : "false");
            btn.textContent = open ? T("收起") : T("展开");
        }
        if (copyBtn && !copyBtn._bound) {
            copyBtn._bound = true;
            copyBtn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                var t = (body.textContent || "").trim();
                if (!t) { toast(T("没有可复制的内容")); return; }
                copyText(t);
            };
        }
        if (btn && !btn._bound) {
            btn._bound = true;
            btn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                var on = box.classList.toggle("is-open");
                btn.setAttribute("aria-expanded", on ? "true" : "false");
                btn.textContent = on ? T("收起") : T("展开");
            };
        }
    }
    function renderParams(rows) {
        var box = document.getElementById("params");
        box.innerHTML = "";
        if (!rows || !rows.length) return;
        rows.forEach(function (row) {
            var r = el("div");
            r.className = "param-row" + ((row.key === "lora" || row.label === "LoRA") ? " is-lora" : "");
            r.title = T("点击复制这项");
            var k = el("div", "", row.label || row.key || "");
            k.className = "k";
            var v = el("div", "", row.value || "");
            v.className = "v";
            r.appendChild(k);
            r.appendChild(v);
            r.onclick = function () {
                copyText(row.value || "");
                r.classList.remove("is-flash");
                void r.offsetWidth;
                r.classList.add("is-flash");
                setTimeout(function () { r.classList.remove("is-flash"); }, 420);
            };
            box.appendChild(r);
        });
    }

    function setInspectFileHint(name) {
        var head = document.querySelector(".inspect-head");
        if (head) head.title = name || "";
    }

    function renderDetail() {
        var preview = document.getElementById("preview");
        var meta = document.getElementById("meta");
        var actions = document.getElementById("actions");
        var chips = document.getElementById("chips");
        var params = document.getElementById("params");
        var negBox = document.getElementById("neg-box");
        var negBody = document.getElementById("neg-body");
        preview.innerHTML = "";
        meta.innerHTML = "";
        actions.innerHTML = "";
        chips.innerHTML = "";
        params.innerHTML = "";
        if (negBody) negBody.textContent = "";
        if (negBox) {
            negBox.hidden = true;
            negBox.classList.remove("is-open");
        }
        hideArtistsRow();
        setInspectFileHint("");
        preview.classList.toggle("empty-preview", !state.sel);
        if (!state.sel) {
            chips.appendChild(el("div", "", T("移到放大镜查看大图。单击后，标签和参数出现在下方。")));
            chips.lastChild.className = "empty";
            return;
        }
        var img = document.createElement("img");
        img.id = "preview-img";
        img.src = state.sel.url;
        img.alt = state.sel.filename;
        img.title = T("点击查看大图");
        img.onclick = function (e) {
            e.stopPropagation();
            openLightbox(state.sel);
        };
        preview.appendChild(img);
        preview.onclick = function () { openLightbox(state.sel); };
        setInspectFileHint(state.sel.filename || "");

        var d = state.extract;
        if (!d) {
            chips.appendChild(el("div", "", T("加载中...")));
            chips.lastChild.className = "empty";
            return;
        }
        renderParams(d.params || []);
        var cands = d.candidates || [];
        renderNegative(d);
        if (cands.length) {
            var srcRow = el("div");
            srcRow.className = "prompt-src-row";
            srcRow.appendChild(el("b", "", T("正面提示词来源")));
            var srcSel = document.createElement("select");
            srcSel.className = "prompt-src";
            srcSel.setAttribute("aria-label", T("正面提示词来源"));
            var optAuto = document.createElement("option");
            optAuto.value = "auto";
            optAuto.textContent = T("自动（按连线抽取）");
            srcSel.appendChild(optAuto);
            cands.forEach(function (c) {
                var o = document.createElement("option");
                o.value = String(c.id);
                o.textContent = (c.title || c.class_type || ("#" + c.id)) + " #" + c.id;
                o.title = c.preview || "";
                srcSel.appendChild(o);
            });
            srcSel.value = d.picked_id ? String(d.picked_id) : "auto";
            srcSel.onchange = function () {
                var id = srcSel.value;
                writePromptSrc(d.graph_sig, id);
                state.extract = applyCandidateNode(d, id);
                renderDetail();
            };
            srcRow.appendChild(srcSel);
            document.getElementById("params").appendChild(srcRow);
        }
        if (d.path) {
            var pathLine = el("div");
            pathLine.className = "path-line";
            pathLine.appendChild(el("b", "", T("提取路径") + " "));
            pathLine.appendChild(document.createTextNode(d.path || "—"));
            document.getElementById("params").appendChild(pathLine);
        }
        if (d.ambiguous) {
            var w = el("div", "", T("同一张图的元数据里有多路存图，已尽量按文件名匹配。"));
            w.className = "warn";
            meta.appendChild(w);
            if (d.paths && d.paths.length > 1) {
                d.paths.forEach(function (p) { meta.appendChild(el("div", "opacity:.85", "· " + p)); });
            }
        }
        if (d.error) {
            var er = el("div", "", d.error);
            er.className = "err";
            meta.appendChild(er);
        }

        var bBig = el("button", "", T("查看大图"));
        bBig.type = "button";
        bBig.className = "act";
        bBig.onclick = function () { openLightbox(state.sel); };
        var bPar = el("button", "", T("复制参数"));
        bPar.type = "button";
        bPar.className = "act";
        bPar.onclick = function () { copyText((d && d.params_text) || ""); };
        var bArt = el("button", "", T("复制全部画师"));
        bArt.type = "button";
        bArt.className = "act";
        bArt.onclick = function () { copyText(((d && d.artists) || []).join(", ")); };
        var bAll = el("button", "", T("复制全部标签"));
        bAll.type = "button";
        bAll.className = "act primary";
        bAll.onclick = function () { copyText((d && (d.text || ((d.tags || []).join(", ")))) || ""); };
        actions.appendChild(bBig);
        actions.appendChild(bPar);
        var artList = uniqArtists((d && d.artists) || []);
        if (artList.length) actions.appendChild(bArt);
        actions.appendChild(bAll);
        var bPin = el("button", "", T("⭐ 收藏置顶"));
        bPin.type = "button";
        bPin.className = "act act-pin";
        bPin.title = T("收藏画师标签");
        bPin.onclick = function () { pinArtistTags(artList); };
        if (artList.length) actions.appendChild(bPin);
        var bFav = el("button", "", T("💾 收藏提示词"));
        bFav.type = "button";
        bFav.className = "act";
        bFav.title = T("收藏到提示词收藏夹");
        bFav.onclick = function () { openFavSave(state.sel); };
        actions.appendChild(bFav);
        var bImgFav = el("button", "", isImgFav(state.sel) ? T("移出收藏夹") : T("加入收藏夹"));
        bImgFav.type = "button";
        bImgFav.className = "act act-imgfav" + (isImgFav(state.sel) ? " is-on" : "");
        bImgFav.title = isImgFav(state.sel) ? T("移出收藏夹") : T("加入收藏夹");
        bImgFav.onclick = function () { toggleImgFav(state.sel); };
        actions.appendChild(bImgFav);
        if (state.sel) {
            var hearts = makeHeartRow(state.sel, "is-inspect");
            hearts.id = "inspect-hearts";
            hearts.title = T("给这张图打爱心，最多5颗");
            actions.appendChild(hearts);
        }
        renderArtists((d && d.artists) || []);
        renderChips((d && d.tags) || [], (d && d.artists) || []);
        refreshPinMarks();
    }

    function selectItem(it, keepLb) {
        state.sel = it;
        state.extract = null;
        syncTileFlags();
        renderDetail();
        if (!keepLb) closeLightbox();
        var q = "filename=" + encodeURIComponent(it.filename) + "&subfolder=" + encodeURIComponent(it.subfolder || "");
        fetch("/danbooru_anima/output_prompt/extract?" + q).then(function (r) {
            if (!r.ok) throw new Error(r.status === 404 ? "need_restart" : String(r.status));
            return r.json();
        }).then(function (d) {
            if (!state.sel || itemKey(state.sel) !== itemKey(it)) return;
            state.extract = applyStoredPromptNode(d || {});
            renderDetail();
        }).catch(function (e) {
            if (!state.sel || itemKey(state.sel) !== itemKey(it)) return;
            state.extract = { ok: false, error: String(e && e.message === "need_restart" ? T("请先重启 ComfyUI，再打开本页") : e), tags: [], artists: [], text: "", params: [] };
            renderDetail();
        });
    }

    function galleryNearTop() {
        var gal = document.getElementById("gallery");
        return !gal || gal.scrollTop < 96;
    }
    function stampKeyOf(d) {
        if (!d || d.ok === false) return "";
        return [d.count || 0, d.folders || 0, d.newest_mtime || 0, d.newest_name || "", listDeepOn() ? "1" : "0", listSort()].join("|");
    }
    function markRefreshPending(on) {
        var btn = document.getElementById("btn-refresh");
        if (!btn) return;
        btn.classList.toggle("has-news", !!on);
        syncRefreshBtnTitle();
    }
    function syncRefreshBtnTitle() {
        var btn = document.getElementById("btn-refresh");
        if (!btn) return;
        var title = T("刷新当前文件夹");
        if (_refreshPending) title = T("发现新图片") + " — " + title;
        btn.title = title;
        btn.setAttribute("aria-label", title);
        btn.innerHTML = ICON_REFRESH;
    }
    function refreshFolder(opts) {
        opts = opts || {};
        var silent = !!opts.silent && !opts.force;
        _refreshPending = false;
        markRefreshPending(false);
        if (!silent) {
            state.page = 1;
            _flowEnd = false;
        }
        if (!silent && artistFilterOn()) loadArtistIndex();
        if (!silent && castFilterOn()) loadCastIndex();
        if (!opts.skipUsed) refreshUsedArtists();
        if (silent && (state.items || []).length) loadList({ silent: true, merge: true });
        else loadList({ silent: silent });
        if (!silent) {
            var gal = document.getElementById("gallery");
            if (gal) gal.scrollTop = 0;
            toast(T("已刷新"), 1200);
        }
    }
    function applyPendingRefresh() {
        if (!_refreshPending || _listBusy || _flowBusy) return;
        if (!galleryNearTop()) return;
        refreshFolder({ silent: true });
    }
    function pollStamp() {
        if (document.hidden || _listBusy || _flowBusy || _stampBusy || _fsBusy) return;
        _stampBusy = true;
        var sub = state.subfolder || "";
        fetch("/danbooru_anima/output_prompt/stamp?subfolder=" + encodeURIComponent(sub) + "&" + listDeepQuery()).then(function (r) {
            if (r.status === 404) {
                return fetch("/danbooru_anima/output_prompt/list?subfolder=" + encodeURIComponent(sub) + "&page=1&page_size=1&" + listDeepQuery() + "&" + listSortQuery()).then(function (r2) {
                    return r2.json();
                }).then(function (d) {
                    var it = (d && d.items && d.items[0]) || {};
                    return {
                        ok: true,
                        count: (d && d.total) || 0,
                        folders: (d && d.folders && d.folders.length) || 0,
                        newest_mtime: it.mtime || 0,
                        newest_name: it.filename || ""
                    };
                });
            }
            return r.json();
        }).then(function (d) {
            var key = stampKeyOf(d);
            if (!key) return;
            if (!_stampKey) {
                _stampKey = key;
                return;
            }
            if (key === _stampKey) return;
            _stampKey = key;
            refreshUsedArtists();
            if (galleryNearTop()) loadList({ silent: true, merge: true });
            else {
                _refreshPending = true;
                markRefreshPending(true);
            }
        }).catch(function () {}).then(function () {
            _stampBusy = false;
        });
    }
    function startStampWatch() {
        if (_stampTimer) clearInterval(_stampTimer);
        _stampTimer = setInterval(pollStamp, STAMP_MS);
        setTimeout(pollStamp, 1200);
        document.addEventListener("visibilitychange", function () {
            if (!document.hidden) pollStamp();
        });
    }

    function loadList(opts) {
        var append = !!(opts && opts.append) && isFlow();
        var merge = !!(opts && opts.merge) && !append;
        var silent = (!!(opts && opts.silent) && !append) || merge;
        if (merge && !(state.items || []).length) merge = false;
        if (append) {
            if (_flowBusy || _flowEnd) return;
            if ((state.page || 1) >= (state.pages || 1)) {
                _flowEnd = true;
                renderPager();
                return;
            }
            _flowBusy = true;
            setFlowMore(T("正在加载更多…"));
        } else if (!merge) {
            _flowEnd = false;
            _flowBusy = false;
            if (!silent) showListBusy();
        }
        if (merge && (_listBusy || _flowBusy)) {
            _refreshPending = true;
            return;
        }
        _listBusy = true;
        var gen = ++_listGen;
        var page = append ? ((state.page || 1) + 1) : (merge ? 1 : (state.page || 1));
        var size = isFlow() ? FLOW_CHUNK : (state.pageSize || 36);
        var q = "subfolder=" + encodeURIComponent(state.subfolder || "") + "&page=" + page + "&page_size=" + size;
        if (state.artistKey) q += "&artist_key=" + encodeURIComponent(state.artistKey);
        if (state.artistExact && state.artistKey) q += "&exact=1";
        if (state.soloArtist) q += "&solo=1";
        if (state.seriesKey) q += "&series_key=" + encodeURIComponent(state.seriesKey);
        if (state.characterKey) q += "&character_key=" + encodeURIComponent(state.characterKey);
        if (state.tagKey) q += "&tag_key=" + encodeURIComponent(state.tagKey);
        if (state.modelKey) q += "&model=" + encodeURIComponent(state.modelKey);
        if (state.heartRate === -1) q += "&heart=none";
        else if (state.heartRate) q += "&heart=" + state.heartRate;
        q += "&" + listDeepQuery() + "&" + listSortQuery();
        fetch("/danbooru_anima/output_prompt/list?" + q).then(function (r) {
            if (!r.ok) throw new Error(r.status === 404 ? "need_restart" : String(r.status));
            return r.json();
        }).then(function (d) {
            if (gen !== _listGen) return;
            _listBusy = false;
            if (append) _flowBusy = false;
            else hideListBusy();
            if (!d || d.ok === false) {
                if (!append && !merge) document.getElementById("grid").textContent = (d && d.error) || T("加载失败");
                return;
            }
            syncTrashFromList(d);
            var more = d.items || [];
            for (var ri = 0; ri < more.length; ri++) rememberItemRating(more[ri]);
            if (merge) {
                if (more.length >= size && takeNewFront(more).length === more.length && (state.items || []).length) {
                    state.page = 1;
                    _flowEnd = false;
                    state.items = more;
                    state.folders = d.folders || [];
                    state.parent = d.parent;
                    state.pages = d.pages || 1;
                    state.total = d.total || 0;
                    state.subfolder = d.subfolder || "";
                    renderCrumb();
                    renderFolders();
                    renderGrid();
                    renderPager();
                    if (isFlow()) setTimeout(maybeLoadMore, 80);
                    return;
                }
                applyMergedList(d, more);
                if (_refreshPending && galleryNearTop()) applyPendingRefresh();
                return;
            }
            state.folders = d.folders || [];
            state.parent = d.parent;
            state.pages = d.pages || 1;
            state.total = d.total || 0;
            state.subfolder = d.subfolder || "";
            if (append) {
                var seen = {};
                for (var i = 0; i < state.items.length; i++) seen[itemKey(state.items[i])] = 1;
                var added = 0;
                for (var j = 0; j < more.length; j++) {
                    var k = itemKey(more[j]);
                    if (!k || seen[k]) continue;
                    seen[k] = 1;
                    state.items.push(more[j]);
                    added++;
                }
                state.page = d.page || page;
                if (!added || state.page >= state.pages) _flowEnd = true;
                renderGrid({ append: true });
            } else {
                state.items = more;
                state.page = d.page || 1;
                if (isFlow() && state.page >= state.pages) _flowEnd = true;
                renderCrumb();
                renderFolders();
                renderGrid();
                var gal = document.getElementById("gallery");
                if (gal) {
                    if (!silent) gal.scrollTop = 0;
                }
            }
            renderPager();
            renderCompareDock();
            var gal2 = document.getElementById("gallery");
            if (gal2 && !gal2._peekScrollBound) {
                gal2._peekScrollBound = true;
                gal2.addEventListener("scroll", function () {
                    hidePeek();
                    closeCtxMenu();
                    maybeLoadMore();
                }, { passive: true });
            }
            if (!silent) {
                hidePeek();
                closeCtxMenu();
                renderDetail();
            }
            if (isFlow() && !append) setTimeout(maybeLoadMore, 80);
        }).catch(function () {
            if (gen !== _listGen) return;
            _listBusy = false;
            if (append) _flowBusy = false;
            else hideListBusy();
            if (!append && !merge) document.getElementById("grid").textContent = T("加载失败") + " — " + T("请先重启 ComfyUI，再从总设置打开本页");
        });
    }

    function listBusyText() {
        if (state.soloArtist && state.artistKey) return T("正在筛选该画师的单画师图…");
        if (state.soloArtist) return T("正在筛选单画师图片…");
        if (state.seriesKey && state.characterKey) return T("正在按角色筛选…");
        if (state.characterKey) return T("正在按角色筛选…");
        if (state.seriesKey) return T("正在按系列筛选…");
        if (state.tagKey) return T("正在按标签筛选…");
        if (state.artistKey) return T("正在按画师筛选…");
        if (state.heartRate === -1) return T("正在筛选未评分的图片…");
        if (state.heartRate) return T("正在按评分筛选…");
        return T("正在加载…");
    }

    function showListBusy() {
        if (!state.soloArtist && !state.artistKey && !state.seriesKey && !state.characterKey && !state.tagKey && !state.heartRate) return;
        var msg = listBusyText();
        renderFilterStatus(true);
        var box = document.getElementById("grid");
        if (box) {
            box.innerHTML = "";
            var d = el("div", "", msg);
            d.className = "empty";
            box.appendChild(d);
        }
        var count = document.getElementById("count");
        if (count) count.textContent = T("筛选中…");
    }

    function hideListBusy() {
        renderFilterStatus();
    }

    function setCastDock(kind) {
        var box = castPopBox();
        var was = _castDock;
        var toSide = kind === "inspect" ? "bottom" : (kind || "");
        var fromSide = was === "inspect" ? "bottom" : (was || "");
        if ((toSide === "top" || toSide === "bottom") && fromSide !== "top" && fromSide !== "bottom") {
            var cap = Math.max(220, Math.min(260, Math.round((window.innerHeight - chromeBottom()) * 0.28)));
            _castFree.h = Math.min(Math.max(220, _castFree.h || cap), cap);
        }
        _castDock = kind || "";
        if (!_castDock && was && box) {
            var w = Math.max(420, _castFree.w || 680);
            var h = Math.max(320, _castFree.h || 560);
            var left = 24;
            var top = chromeBottom() + 16;
            if (was === "right") left = Math.max(24, window.innerWidth - w - 24);
            if (was === "inspect") top = Math.max(chromeBottom() + 16, (popBand("cast").it || window.innerHeight) - h - 16);
            box.style.width = w + "px";
            box.style.height = h + "px";
            box.style.left = left + "px";
            box.style.top = top + "px";
        }
        layoutAllDocks();
        saveCastPopBox();
    }

    function sizeFromEdge(drag, e, minW, minH, maxW, maxH) {
        var dx = e.clientX - drag.x;
        var dy = e.clientY - drag.y;
        var edge = drag.edge || "se";
        var dock = drag.dock || "";
        var w = drag.w;
        var h = drag.h;
        var left = drag.left;
        var top = drag.top;
        if (dock === "left") w = drag.w + dx;
        else if (dock === "right") w = drag.w - dx;
        else if (dock === "top") h = drag.h + dy;
        else if (dock === "inspect" || dock === "bottom") h = drag.h - dy;
        else {
            if (edge === "e" || edge === "se") w = drag.w + dx;
            if (edge === "w") w = drag.w - dx;
            if (edge === "s" || edge === "se") h = drag.h + dy;
            if (edge === "n") h = drag.h - dy;
        }
        if (w < minW) w = minW;
        if (maxW && w > maxW) w = maxW;
        if (h < minH) h = minH;
        if (maxH && h > maxH) h = maxH;
        if (!dock && edge === "w") left = drag.left + (drag.w - w);
        if (!dock && edge === "n") top = drag.top + (drag.h - h);
        return { w: Math.round(w), h: Math.round(h), left: Math.round(left), top: Math.round(top) };
    }
    function bindPlainEdges(box, onEnd, minW, minH) {
        if (!box || box._plainEdges) return;
        box._plainEdges = true;
        var edges = box.querySelectorAll(".opv-edge");
        for (var i = 0; i < edges.length; i++) {
            (function (el) {
                el.addEventListener("pointerdown", function (e) {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    var r = box.getBoundingClientRect();
                    var drag = {
                        edge: el.getAttribute("data-edge") || "e",
                        dock: "",
                        x: e.clientX,
                        y: e.clientY,
                        w: r.width,
                        h: r.height,
                        left: r.left,
                        top: r.top
                    };
                    function move(ev) {
                        var s = sizeFromEdge(drag, ev, minW || 320, minH || 220, window.innerWidth - 16, window.innerHeight - 16);
                        box.style.width = s.w + "px";
                        box.style.height = s.h + "px";
                        box.style.left = s.left + "px";
                        box.style.top = s.top + "px";
                    }
                    function up() {
                        document.removeEventListener("pointermove", move, true);
                        document.removeEventListener("pointerup", up, true);
                        document.removeEventListener("pointercancel", up, true);
                        if (typeof window.clampPopup === "function") window.clampPopup(box);
                        if (onEnd) onEnd();
                    }
                    document.addEventListener("pointermove", move, true);
                    document.addEventListener("pointerup", up, true);
                    document.addEventListener("pointercancel", up, true);
                });
            })(edges[i]);
        }
    }
    var MODEL_LABELS = {
        anima: "Anima",
        noob: "Noob",
        illustrious: "光辉",
        zimage: "Z-Image",
        krea2: "Krea 2",
        qwen: "千问 Image",
        flux: "Flux",
        other: "其他"
    };
    function modelLabel(id) {
        return MODEL_LABELS[id] || id || "";
    }
    function modelKeyList() {
        var seen = Object.create(null);
        var out = [];
        String(state.modelKey || "").split(",").forEach(function (bit) {
            var id = String(bit || "").trim();
            if (!id || seen[id]) return;
            seen[id] = 1;
            out.push(id);
        });
        return out;
    }
    function modelPopEl() { return document.getElementById("model-pop"); }
    function modelPopBox() { return document.getElementById("model-pop-box"); }
    function modelPopOpen() {
        var pop = modelPopEl();
        return !!(pop && !pop.hidden);
    }
    function saveModelPopBox() {
        var bx = modelPopBox();
        if (bx && modelPopOpen()) {
            var r = bx.getBoundingClientRect();
            if (r.width > 180 && r.height > 120) {
                if (!_modelDock) {
                    _modelFree.left = Math.round(r.left);
                    _modelFree.top = Math.round(r.top);
                    _modelFree.w = Math.round(r.width);
                    _modelFree.h = Math.round(r.height);
                } else if (_modelDock === "left" || _modelDock === "right") {
                    _modelFree.w = Math.round(r.width);
                } else {
                    _modelFree.h = Math.round(r.height);
                }
            }
        }
        try {
            localStorage.setItem(LS_MODEL_POP, JSON.stringify({
                dock: _modelDock || "",
                collapsed: _modelCollapsed ? 1 : 0,
                left: _modelFree.left,
                top: _modelFree.top,
                w: _modelFree.w,
                h: _modelFree.h
            }));
        } catch (e1) {}
    }
    function loadModelPopLayout() {
        if (_modelLayLoaded) return;
        _modelLayLoaded = true;
        try {
            var st = JSON.parse(localStorage.getItem(LS_MODEL_POP) || "null");
            if (!st) return;
            if (st.w > 220) _modelFree.w = st.w;
            if (st.h > 140) _modelFree.h = st.h;
            if (st.left != null) _modelFree.left = st.left;
            if (st.top != null) _modelFree.top = st.top;
            _modelDock = st.dock || "";
            _modelCollapsed = !!st.collapsed;
        } catch (e2a) {}
    }
    function restoreModelPopBox() {
        var bx = modelPopBox();
        if (!bx) return;
        loadModelPopLayout();
        if (_modelDock && snapRectFor(_modelDock, popBand("model"), _modelFree, "model")) {
            layoutAllDocks();
            return;
        }
        _modelDock = "";
        if (_modelFree.w > 220) bx.style.width = Math.min(_modelFree.w, window.innerWidth - 24) + "px";
        if (_modelFree.h > 140) bx.style.height = Math.min(_modelFree.h, window.innerHeight - 24) + "px";
        if (_modelFree.left != null) bx.style.left = _modelFree.left + "px";
        else bx.style.left = Math.max(12, window.innerWidth - 364) + "px";
        if (_modelFree.top != null) bx.style.top = _modelFree.top + "px";
        else bx.style.top = (chromeBottom() + 16) + "px";
        bx.style.right = "auto";
        if (typeof window.clampPopup === "function") window.clampPopup(bx);
    }
    function setModelDock(kind) {
        var box = modelPopBox();
        var was = _modelDock;
        _modelDock = kind || "";
        if (!_modelDock && was && box) {
            var w = Math.max(260, _modelFree.w || 340);
            var h = Math.max(180, _modelFree.h || 420);
            var left = _modelFree.left != null ? _modelFree.left : Math.max(12, window.innerWidth - w - 24);
            var top = _modelFree.top != null ? _modelFree.top : chromeBottom() + 16;
            if (was === "right") left = Math.max(24, window.innerWidth - w - 24);
            box.style.width = w + "px";
            box.style.height = h + "px";
            box.style.left = left + "px";
            box.style.top = top + "px";
        }
        layoutAllDocks();
        saveModelPopBox();
    }
    function setModelCollapsed(on) {
        on = !!on;
        if (on) {
            _modelCollapsed = true;
            var pop = modelPopEl();
            if (pop) pop.hidden = true;
            saveModelPopBox();
            layoutAllDocks();
            return;
        }
        _modelCollapsed = false;
        saveModelPopBox();
        openModelPop();
    }
    function openModelPop() {
        var pop = modelPopEl();
        if (!pop) return;
        loadModelPopLayout();
        _modelCollapsed = false;
        pop.hidden = false;
        restoreModelPopBox();
        saveModelPopBox();
        if (!_modelDock && typeof window.clampPopup === "function") window.clampPopup(modelPopBox());
        if (!state.modelIndex || state.modelIndexSub !== folderScopeKey() || state.modelIndexBusy) loadModelIndex();
        else renderModelPop();
        layoutAllDocks();
    }
    function renderModelPop() {
        var box = document.getElementById("model-pop-list");
        var sub = document.getElementById("model-pop-sub");
        if (!box) return;
        box.innerHTML = "";
        var hint = T("点一个主模型。可以多选。不选就是全部。和画师、角色、标签、评分一起生效。");
        var idx = state.modelIndex;
        var stale = state.modelIndexBusy || !idx || state.modelIndexSub !== folderScopeKey();
        if (stale) {
            if (sub) sub.textContent = (idx && idx.error) ? String(idx.error) : hint;
            var wait = el("div", "", T("正在读取模型分类…"));
            wait.className = "cast-empty";
            box.appendChild(wait);
            return;
        }
        if (idx && idx.error) {
            if (sub) sub.textContent = String(idx.error);
            var err = el("div", "", String(idx.error));
            err.className = "cast-empty";
            box.appendChild(err);
            return;
        }
        if (sub) {
            sub.textContent = idx && idx.pending
                ? (T("正在后台识别模型，还剩 ") + idx.pending + T(" 张。图片和其它筛选可以先用。"))
                : hint;
        }
        var picked = modelKeyList();
        var seen = Object.create(null);
        var rows = (idx.models || []).slice();
        picked.forEach(function (id) {
            var found = false;
            var i;
            for (i = 0; i < rows.length; i++) {
                if (rows[i] && rows[i].id === id) { found = true; break; }
            }
            if (!found) rows.push({ id: id, label: modelLabel(id), count: 0 });
        });
        if (!rows.length) {
            var none = el("div", "", (idx && idx.pending) ? T("正在识别模型…") : T("这个范围里还没有分出模型"));
            none.className = "cast-empty";
            box.appendChild(none);
            return;
        }
        rows.forEach(function (it) {
            if (!it || !it.id || seen[it.id]) return;
            seen[it.id] = 1;
            var b = document.createElement("button");
            b.type = "button";
            b.className = "tag-pop-row";
            if (picked.indexOf(it.id) >= 0) b.classList.add("is-on");
            if (!it.count) b.classList.add("is-zero");
            var name = document.createElement("span");
            name.className = "tag-en";
            name.textContent = it.label || modelLabel(it.id);
            var n = document.createElement("span");
            n.className = "tag-n";
            n.textContent = String(it.count || 0);
            b.appendChild(name);
            b.appendChild(n);
            b.onclick = function (ev) {
                ev.stopPropagation();
                toggleModelKey(it.id);
            };
            box.appendChild(b);
        });
    }
    function toggleModelKey(id) {
        id = String(id || "").trim();
        if (!id) return;
        var list = modelKeyList();
        var at = list.indexOf(id);
        if (at >= 0) list.splice(at, 1);
        else list.push(id);
        state.modelKey = list.join(",");
        persistModelKey();
        state.page = 1;
        state.sel = null;
        closeLightbox();
        syncFilterUi();
        renderModelPop();
        loadList();
    }
    function scheduleModelPoll(d) {
        if (_modelPoll) clearTimeout(_modelPoll);
        _modelPoll = 0;
        var waiting = !!(d && ((d.pending || 0) > 0 || d.running));
        if (waiting) _modelSawPending = true;
        if (waiting && (modelPopOpen() || state.modelKey)) {
            _modelPoll = setTimeout(function () {
                _modelPoll = 0;
                loadModelIndex({ quiet: true });
            }, 1500);
            return;
        }
        if (!waiting && _modelSawPending && state.modelKey) {
            _modelSawPending = false;
            loadList();
        }
    }
    function loadModelIndex(opts) {
        var quiet = !!(opts && opts.quiet);
        if (!quiet) {
            state.modelIndexBusy = true;
            renderModelPop();
        }
        var gen = ++_modelIdxGen;
        var sub = state.subfolder || "";
        return fetch("/danbooru_anima/output_prompt/model_index?subfolder=" + encodeURIComponent(sub) + "&" + listDeepQuery()).then(function (r) {
            if (!r.ok) throw new Error(r.status === 404 ? "need_restart" : String(r.status));
            return r.json();
        }).then(function (d) {
            if (gen !== _modelIdxGen) return;
            state.modelIndexBusy = false;
            state.modelIndexSub = folderScopeKey();
            state.modelIndex = d || { models: [] };
            if (d && d.ok === false) state.modelIndex.error = d.error || T("读取失败");
            renderModelPop();
            scheduleModelPoll(d || {});
        }).catch(function (err) {
            if (gen !== _modelIdxGen) return;
            state.modelIndexBusy = false;
            state.modelIndexSub = folderScopeKey();
            var msg = (err && err.message === "need_restart") ? T("需要重启 ComfyUI 后才能按模型分类") : T("模型分类读取失败");
            state.modelIndex = { models: [], error: msg };
            renderModelPop();
        });
    }
    function bindModelPop() {
        var fold = document.getElementById("model-pop-fold");
        if (fold) fold.onclick = function (e) { e.stopPropagation(); setModelCollapsed(true); };
        var fab = document.getElementById("model-pop-fab");
        if (fab && !fab._bound) {
            fab._bound = true;
            fab.onclick = function (e) { e.stopPropagation(); setModelCollapsed(false); };
        }
        var modelUndock = document.getElementById("model-pop-undock");
        if (modelUndock) modelUndock.onclick = function (e) { e.stopPropagation(); setModelDock(""); };
        var bx = modelPopBox();
        var hd = document.getElementById("model-pop-hd");
        bindDockDrag(bx, hd, {
            id: "model",
            free: _modelFree,
            minW: 260,
            minH: 180,
            maxW: 640,
            maxH: 720,
            getDock: function () { return _modelDock; },
            lift: function () {
                _modelDock = "";
                if (bx) bx.classList.remove("is-dock-left", "is-dock-right", "is-dock-top", "is-dock-inspect");
                var undock = document.getElementById("model-pop-undock");
                if (undock) undock.hidden = true;
            },
            setDock: setModelDock,
            onSave: saveModelPopBox
        });
        if (bx) bindPlainEdges(bx, saveModelPopBox, 260, 180);
    }

    function bindDockDrag(box, hd, opts) {
        if (!box || !hd || hd._dockDrag) return;
        hd._dockDrag = true;
        hd.style.cursor = "grab";
        var drag = null;
        hd.addEventListener("pointerdown", function (e) {
            if (e.button !== 0) return;
            if (e.target && e.target.closest && e.target.closest("button")) return;
            e.preventDefault();
            var r = box.getBoundingClientRect();
            if (opts.getDock()) {
                opts.free.w = Math.max(opts.minW, Math.min(opts.maxW, r.width));
                opts.free.h = Math.max(opts.minH, Math.min(opts.maxH, r.height));
                opts.lift();
                box.style.width = opts.free.w + "px";
                box.style.height = opts.free.h + "px";
                box.style.left = Math.round(e.clientX - opts.free.w / 2) + "px";
                box.style.top = Math.round(e.clientY - 18) + "px";
                box.style.right = "auto";
                r = box.getBoundingClientRect();
                layoutAllDocks();
            }
            drag = {
                x: e.clientX,
                y: e.clientY,
                lastX: e.clientX,
                lastY: e.clientY,
                left: r.left,
                top: r.top,
                band: popBand(opts.id)
            };
            hd.style.cursor = "grabbing";
            try { hd.setPointerCapture(e.pointerId); } catch (e2) {}
        });
        hd.addEventListener("pointermove", function (e) {
            if (!drag) return;
            drag.lastX = e.clientX;
            drag.lastY = e.clientY;
            box.style.left = Math.round(drag.left + (e.clientX - drag.x)) + "px";
            box.style.top = Math.round(drag.top + (e.clientY - drag.y)) + "px";
            box.style.right = "auto";
            showSnapHint(snapFromPoint(e.clientX, e.clientY, drag.band), drag.band);
        });
        function endDrag(e) {
            if (!drag) return;
            var kind = snapFromPoint((e && e.clientX) || drag.lastX, (e && e.clientY) || drag.lastY, drag.band);
            drag = null;
            hd.style.cursor = "grab";
            showSnapHint("");
            if (kind) opts.setDock(kind);
            else {
                if (typeof window.clampPopup === "function") window.clampPopup(box);
                opts.onSave();
                syncShellInsets();
            }
            try { if (e) hd.releasePointerCapture(e.pointerId); } catch (e3) {}
        }
        hd.addEventListener("pointerup", endDrag);
        hd.addEventListener("pointercancel", endDrag);
    }

    function bindTagPop() {
        var closeBtn = document.getElementById("tag-pop-close");
        if (closeBtn) closeBtn.onclick = function (e) { e.stopPropagation(); setTagCollapsed(true); };
        var tagFoldBtn = document.getElementById("tag-pop-fold");
        if (tagFoldBtn) tagFoldBtn.onclick = function (e) { e.stopPropagation(); setTagCollapsed(true); };
        var tagFab = document.getElementById("tag-pop-fab");
        if (tagFab && !tagFab._bound) {
            tagFab._bound = true;
            tagFab.onclick = function (e) { e.stopPropagation(); setTagCollapsed(false); };
        }
        var tagUndock = document.getElementById("tag-pop-undock");
        if (tagUndock) tagUndock.onclick = function (e) { e.stopPropagation(); setTagDock(""); };
        var q = document.getElementById("tag-pop-q");
        if (q && !q._bound) {
            q._bound = true;
            function runFuzzy(ev) {
                if (ev && ev.isComposing) return;
                var val = q.value || "";
                state.tagQ = val;
                state.tagFuzzy = [];
                _tagFuzzyGen++;
                if (_tagFuzzyT) clearTimeout(_tagFuzzyT);
                _tagFuzzyT = setTimeout(function () {
                    _tagFuzzyT = 0;
                    if ((q.value || "") !== val) return;
                    fetchTagFuzzy(val).then(function () {
                        if ((q.value || "") !== val) return;
                        renderTagPop();
                        maybeApplyTypedTag(false);
                    });
                }, 180);
                renderTagPop();
                maybeApplyTypedTag(true);
            }
            ["input", "keyup", "search", "change"].forEach(function (ev) {
                q.addEventListener(ev, runFuzzy);
            });
            q.addEventListener("keydown", function (e) {
                if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return;
                e.preventDefault();
                e.stopPropagation();
                applyTypedTagEnter();
            });
        }
        var bx = tagPopBox();
        var hd = document.getElementById("tag-pop-hd");
        bindDockDrag(bx, hd, {
            id: "tag",
            free: _tagFree,
            minW: 360,
            minH: 280,
            maxW: 720,
            maxH: 720,
            getDock: function () { return _tagDock; },
            lift: function () {
                _tagDock = "";
                if (bx) bx.classList.remove("is-dock-left", "is-dock-right", "is-dock-top", "is-dock-inspect");
                var undock = document.getElementById("tag-pop-undock");
                if (undock) undock.hidden = true;
            },
            setDock: setTagDock,
            onSave: saveTagPopBox
        });
        if (bx) bindPlainEdges(bx, saveTagPopBox, 360, 280);
    }

    function bindCastPop() {
        var closeBtn = document.getElementById("cast-pop-close");
        if (closeBtn) closeBtn.onclick = function (e) { e.stopPropagation(); setCastCollapsed(true); };
        var castFoldBtn = document.getElementById("cast-pop-fold");
        if (castFoldBtn) castFoldBtn.onclick = function (e) { e.stopPropagation(); setCastCollapsed(true); };
        var castFab = document.getElementById("cast-pop-fab");
        if (castFab && !castFab._bound) {
            castFab._bound = true;
            castFab.onclick = function (e) { e.stopPropagation(); setCastCollapsed(false); };
        }
        var undock = document.getElementById("cast-pop-undock");
        if (undock) undock.onclick = function (e) { e.stopPropagation(); setCastDock(""); };
        var q = document.getElementById("cast-pop-q");
        if (q && !q._bound) {
            q._bound = true;
            var t = 0;
            ["input", "keyup", "search", "change"].forEach(function (ev) {
                q.addEventListener(ev, function () {
                    state.castQ = q.value || "";
                    if (t) clearTimeout(t);
                    t = setTimeout(function () { t = 0; renderCastPop(); }, 80);
                });
            });
        }
        var bx = castPopBox();
        var hd = document.getElementById("cast-pop-hd");
        if (bx && hd && !hd._bound) {
            hd._bound = true;
            var drag = null;
            hd.addEventListener("pointerdown", function (e) {
                if (e.button !== 0) return;
                if (e.target && e.target.closest && e.target.closest("button")) return;
                e.preventDefault();
                var r = bx.getBoundingClientRect();
                if (_castDock) {
                    _castFree.w = Math.max(420, Math.min(720, r.width));
                    _castFree.h = Math.max(320, Math.min(640, r.height));
                    _castDock = "";
                    bx.classList.remove("is-dock-left", "is-dock-right", "is-dock-top", "is-dock-inspect");
                    bx.style.width = _castFree.w + "px";
                    bx.style.height = _castFree.h + "px";
                    bx.style.left = Math.round(e.clientX - _castFree.w / 2) + "px";
                    bx.style.top = Math.round(e.clientY - 18) + "px";
                    r = bx.getBoundingClientRect();
                    layoutInspect();
                    layoutArtistPop();
                    syncShellInsets();
                }
                drag = {
                    kind: "move",
                    x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY,
                    left: r.left, top: r.top, band: popBand("cast")
                };
                hd.style.cursor = "grabbing";
                try { hd.setPointerCapture(e.pointerId); } catch (e2) {}
            });
            hd.addEventListener("pointermove", function (e) {
                if (!drag || drag.kind !== "move") return;
                drag.lastX = e.clientX;
                drag.lastY = e.clientY;
                bx.style.left = Math.round(drag.left + (e.clientX - drag.x)) + "px";
                bx.style.top = Math.round(drag.top + (e.clientY - drag.y)) + "px";
                bx.style.right = "auto";
                showSnapHint(snapFromPoint(e.clientX, e.clientY, drag.band), drag.band);
                placeInspectFab();
            });
            function endCast(e) {
                if (!drag || drag.kind !== "move") return;
                var lastX = (e && e.clientX) || drag.lastX;
                var lastY = (e && e.clientY) || drag.lastY;
                var kind = snapFromPoint(lastX, lastY, drag.band);
                drag = null;
                hd.style.cursor = "grab";
                showSnapHint("");
                if (kind) setCastDock(kind);
                else {
                    if (typeof window.clampPopup === "function") window.clampPopup(bx);
                    saveCastPopBox();
                    syncShellInsets();
                }
                try { if (e) hd.releasePointerCapture(e.pointerId); } catch (e3) {}
            }
            hd.addEventListener("pointerup", endCast);
            hd.addEventListener("pointercancel", endCast);
            var rs = document.getElementById("cast-pop-rs");
            if (rs && !rs._bound) {
                rs._bound = true;
                rs.addEventListener("pointerdown", function (e) {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    hidePeek();
                    closeCtxMenu();
                    var r = bx.getBoundingClientRect();
                    drag = { kind: "size", edge: "se", x: e.clientX, y: e.clientY, w: r.width, h: r.height, left: r.left, top: r.top, dock: _castDock };
                    bx.classList.add("is-dragging");
                    try { rs.setPointerCapture(e.pointerId); } catch (e4) {}
                    document.body.classList.add("is-resizing-artist");
                });
                rs.addEventListener("pointermove", function (e) {
                    if (!drag || drag.kind !== "size") return;
                    var bandNow = popBand("cast");
                    if (drag.dock === "left" || drag.dock === "right") {
                        var sw = sizeFromEdge(drag, e, 260, 140, Math.round(bandNow.vw * 0.5), 0);
                        _castFree.w = sw.w;
                        var rw = snapRectFor(drag.dock, bandNow, _castFree, "cast");
                        applyRect(bx, rw);
                        adoptDockSize(_castFree, drag.dock, rw);
                        layoutInspect();
                        layoutArtistPop();
                        syncShellInsets();
                        return;
                    }
                    if (drag.dock === "top" || drag.dock === "inspect") {
                        var maxH = drag.dock === "top"
                            ? Math.max(140, (bandNow.vh || window.innerHeight) - bandNow.cb - occSide("bottom", "cast") - 80)
                            : Math.max(140, (bandNow.vh || window.innerHeight) - bandNow.cb - 80);
                        var sh = sizeFromEdge(drag, e, 260, 140, 0, maxH);
                        _castFree.h = sh.h;
                        var rt = snapRectFor(drag.dock, bandNow, _castFree, "cast");
                        applyRect(bx, rt);
                        adoptDockSize(_castFree, drag.dock, rt);
                        layoutInspect();
                        layoutArtistPop();
                        syncShellInsets();
                        return;
                    }
                    var sf = sizeFromEdge(drag, e, 280, 180, bandNow.vw - 16, bandNow.vh - 16);
                    bx.style.width = sf.w + "px";
                    bx.style.height = sf.h + "px";
                    bx.style.left = sf.left + "px";
                    bx.style.top = sf.top + "px";
                });
                function endCastSize(e) {
                    if (!drag || drag.kind !== "size") return;
                    drag = null;
                    bx.classList.remove("is-dragging");
                    document.body.classList.remove("is-resizing-artist");
                    saveCastPopBox();
                    layoutAllDocks();
                    try { rs.releasePointerCapture(e.pointerId); } catch (e5) {}
                }
                rs.addEventListener("pointerup", endCastSize);
                rs.addEventListener("pointercancel", endCastSize);
                var castEdges = bx.querySelectorAll(".opv-edge");
                for (var cei = 0; cei < castEdges.length; cei++) {
                    (function (el) {
                        el.addEventListener("pointerdown", function (e) {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            e.stopPropagation();
                            hidePeek();
                            closeCtxMenu();
                            var rct = bx.getBoundingClientRect();
                            drag = { kind: "size", edge: el.getAttribute("data-edge") || "e", x: e.clientX, y: e.clientY, w: rct.width, h: rct.height, left: rct.left, top: rct.top, dock: _castDock };
                            bx.classList.add("is-dragging");
                            document.body.classList.add("is-resizing-artist");
                            function move(ev) {
                                rs.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: ev.clientX, clientY: ev.clientY }));
                            }
                            function up(ev) {
                                document.removeEventListener("pointermove", move, true);
                                document.removeEventListener("pointerup", up, true);
                                document.removeEventListener("pointercancel", up, true);
                                endCastSize(ev || {});
                            }
                            document.addEventListener("pointermove", move, true);
                            document.addEventListener("pointerup", up, true);
                            document.addEventListener("pointercancel", up, true);
                        });
                    })(castEdges[cei]);
                }
            }
        }
    }

    var _sdPoll = 0;
    var _sdLast = null;

    function sdApi(body) {
        var opt = body
            ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
            : { method: "GET" };
        return fetch("/danbooru_anima/output_prompt/auto_shutdown", opt).then(function (r) {
            if (r.status === 404 || r.status === 405) throw new Error("need_restart");
            if (!r.ok) throw new Error(String(r.status));
            return r.json();
        });
    }

    function startSdPoll() {
        if (_sdPoll) return;
        _sdPoll = setInterval(function () {
            sdApi().then(applyShutdownUi).catch(function () {});
        }, 400);
    }

    function stopSdPoll() {
        if (!_sdPoll) return;
        clearInterval(_sdPoll);
        _sdPoll = 0;
    }

    function applyShutdownUi(d) {
        if (d) _sdLast = d;
        var data = d || _sdLast || {};
        var enabled = !!data.enabled;
        var phase = data.phase || "off";
        var left = data.countdown_left || 0;
        var btn = document.getElementById("btn-auto-shutdown");
        var ov = document.getElementById("sd-overlay");
        var num = document.getElementById("sd-count");
        var title = document.getElementById("sd-title");
        var sub = document.getElementById("sd-sub");
        var cancel = document.getElementById("sd-cancel");
        var lab = T("任务结束自动关机");
        if (enabled) {
            if (phase === "countdown") lab = T("即将关机") + " " + left + "s";
            else if (phase === "waiting_idle") lab = T("自动关机已开") + " · " + T("队列已空，确认空闲中");
            else if (phase === "watching") lab = T("自动关机已开") + " · " + T("任务进行中，结束后将关机");
            else if (phase === "waiting_work") lab = T("自动关机已开") + " · " + T("等待任务开始…");
            else lab = T("自动关机已开");
        }
        if (btn) {
            btn.classList.toggle("is-on", enabled);
            btn.setAttribute("aria-pressed", enabled ? "true" : "false");
            btn.textContent = lab;
            btn.title = lab;
        }
        var show = enabled && phase === "countdown";
        if (ov) {
            ov.hidden = !show;
            ov.setAttribute("aria-hidden", show ? "false" : "true");
        }
        document.body.classList.toggle("sd-counting", show);
        if (num) num.textContent = String(left);
        if (title) title.textContent = T("即将关机");
        if (sub) sub.textContent = T("电脑将在 30 秒后关机");
        if (cancel) cancel.textContent = T("取消自动关机");
        if (enabled) startSdPoll();
        else stopSdPoll();
    }

    function setAutoShutdown(on) {
        try { localStorage.setItem(LS_AUTO_SD, on ? "1" : "0"); } catch (eSet) {}
        sdApi({ enable: !!on }).then(function (d) {
            applyShutdownUi(d);
            if (d && d.ok === false && d.error) toast(d.error);
            else if (d && d.error && !d.enabled) toast(d.error);
            else if (!on) toast(T("自动关机已取消"));
        }).catch(function (err) {
            if (String(err.message || err) === "need_restart") toast(T("请先重启 ComfyUI"));
            else toast(String(err.message || err));
        });
    }

    function bindAutoShutdown() {
        var btn = document.getElementById("btn-auto-shutdown");
        if (btn) {
            btn.onclick = function () {
                setAutoShutdown(!(_sdLast && _sdLast.enabled));
            };
        }
        var cancel = document.getElementById("sd-cancel");
        if (cancel) {
            cancel.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                setAutoShutdown(false);
            };
        }
        sdApi().then(applyShutdownUi).catch(function () {});
    }

    function isPopWin() {
        try { return new URLSearchParams(window.location.search).get("pop") === "1"; } catch (ePop) { return false; }
    }
    function readPopFolder() {
        try {
            var q = new URLSearchParams(window.location.search);
            if (!q.has("folder")) return null;
            var parts = String(q.get("folder") || "").replace(/\\/g, "/").split("/");
            var clean = [];
            var i;
            for (i = 0; i < parts.length; i++) {
                if (!parts[i] || parts[i] === "." || parts[i] === "..") continue;
                clean.push(parts[i]);
            }
            return clean.join("/");
        } catch (eFolder) { return null; }
    }
    function popWinFrame() {
        var aw = screen.availWidth || 1280;
        var ah = screen.availHeight || 800;
        var left0 = (typeof screen.availLeft === "number") ? screen.availLeft : 0;
        var top0 = (typeof screen.availTop === "number") ? screen.availTop : 0;
        var w = Math.round(aw * 0.78);
        var h = Math.round(ah * 0.78);
        if (w < 880) w = Math.min(880, Math.max(480, aw - 48));
        if (h < 560) h = Math.min(560, Math.max(360, ah - 48));
        if (w > aw - 96) w = Math.max(480, aw - 96);
        if (h > ah - 96) h = Math.max(360, ah - 96);
        return {
            w: w,
            h: h,
            left: left0 + Math.round((aw - w) / 2),
            top: top0 + Math.max(24, Math.round((ah - h) / 2))
        };
    }
    function popFillsScreen(win) {
        try {
            var aw = screen.availWidth || 0;
            var ah = screen.availHeight || 0;
            if (!win || !aw || !ah) return false;
            return win.outerWidth >= aw - 16 && win.outerHeight >= ah - 16;
        } catch (eFill) { return false; }
    }
    function releasePopWin(win) {
        if (!win) return;
        if (!popFillsScreen(win)) return;
        var box = popWinFrame();
        try { win.resizeTo(box.w, box.h); } catch (eSz) {}
        try { win.moveTo(box.left, box.top); } catch (eMv) {}
    }
    function openPopWin() {
        if (isPopWin()) return;
        var url = null;
        try { url = new URL(window.location.href); } catch (eUrl) { url = null; }
        if (!url) {
            toast(T("浏览器拦住了单独窗口，请允许本站弹出窗口"));
            return;
        }
        url.searchParams.set("pop", "1");
        url.searchParams.set("folder", state.subfolder || "");
        var box = popWinFrame();
        var feat = "popup=yes,resizable=yes,width=" + box.w + ",height=" + box.h + ",left=" + box.left + ",top=" + box.top;
        var win = null;
        try { win = window.open(url.href, "anima-opv-pop", feat); } catch (eOpen) { win = null; }
        if (!win) {
            toast(T("浏览器拦住了单独窗口，请允许本站弹出窗口"));
            return;
        }
        try { win.focus(); } catch (eFocus) {}
        setTimeout(function () { releasePopWin(win); }, 60);
        setTimeout(function () { releasePopWin(win); }, 280);
    }

    function bindChrome() {
        var btnBrowse = document.getElementById("btn-browse");
        if (btnBrowse) {
            btnBrowse.onclick = function () { setBrowse(isFlow() ? "page" : "flow"); };
        }
        var flowSize = document.getElementById("flow-size");
        if (flowSize && !flowSize._bound) {
            flowSize._bound = true;
            flowSize.min = String(FLOW_TILE_MIN);
            flowSize.max = String(FLOW_TILE_MAX);
            flowSize.step = String(FLOW_TILE_STEP);
            flowSize.value = String(_flowTile);
            flowSize.oninput = function () { setFlowTile(flowSize.value); };
        }
        var btnFx = document.getElementById("btn-fx");
        if (btnFx) {
            btnFx.onclick = function () { toggleFx(); };
        }
        var btnRefresh = document.getElementById("btn-refresh");
        if (btnRefresh) {
            btnRefresh.onclick = function () { refreshFolder({ force: true }); };
        }
        window.addEventListener("pointermove", osDragMove, true);
        window.addEventListener("pointerup", osDragUp, true);
        window.addEventListener("pointercancel", osDragUp, true);
        var galDrag = document.getElementById("gallery");
        if (galDrag) {
            galDrag.addEventListener("pointerdown", function (e) {
                var tile = e.target && e.target.closest ? e.target.closest(".tile") : null;
                if (!tile) return;
                osDragDown(e, {
                    filename: tile.getAttribute("data-fn") || "",
                    subfolder: tile.getAttribute("data-sub") || ""
                });
            }, true);
        }
        var btnPop = document.getElementById("btn-popwin");
        if (btnPop) btnPop.onclick = openPopWin;
        bindImgFavToolbar();
        bindFavDirUi();
        bindFolderManage();
        var btnDeep = document.getElementById("btn-deep");
        if (btnDeep) {
            btnDeep.onclick = function () { setListDeep(!listDeepOn()); };
        }
        var btnSort = document.getElementById("btn-sort");
        if (btnSort) {
            btnSort.onclick = function () { cycleListSort(); };
        }
        var btnFolders = document.getElementById("btn-folders");
        if (btnFolders) {
            btnFolders.onclick = function () { toggleFolders(); };
        }
        document.getElementById("btn-compare").onclick = function () {
            if (state.compareOn) exitCompareMode();
            else {
                setCompareMode(true);
                toast(T("点图勾选。要结束，点红色的「退出对比」"));
            }
        };
        document.getElementById("cmp-go").onclick = openCompare;
        document.getElementById("cmp-clear").onclick = function () {
            state.compareItems = [];
            state.cmpA = 0;
            state.cmpB = 1;
            renderCompareDock();
            renderGrid();
            closeCompare();
        };
        document.getElementById("cmp-close").onclick = exitCompareMode;
        var cmpExit = document.getElementById("cmp-exit");
        if (cmpExit) cmpExit.onclick = exitCompareMode;
        var btnFilter = document.getElementById("btn-filter");
        var filterWrap = document.getElementById("filter-wrap");
        var filterMenu = document.getElementById("filter-menu");
        if (filterMenu && filterMenu.parentNode !== document.body) {
            document.body.appendChild(filterMenu);
        }
        if (btnFilter) {
            btnFilter.onclick = function (e) {
                e.stopPropagation();
                var menu = document.getElementById("filter-menu");
                setFilterMenu(menu && menu.hidden);
            };
        }
        var btnFilterClear = document.getElementById("btn-filter-clear");
        if (btnFilterClear) {
            btnFilterClear.onclick = function (e) {
                e.stopPropagation();
                clearAllFilters();
            };
        }
        var menuClear = document.getElementById("filter-clear-all");
        if (menuClear) {
            menuClear.onclick = function (e) {
                e.stopPropagation();
                clearAllFilters();
            };
        }
        var rateRow = document.getElementById("filter-rate-row");
        if (rateRow) {
            rateRow.onclick = function (e) {
                e.stopPropagation();
                var btn = e.target && e.target.closest ? e.target.closest("[data-rate]") : null;
                if (!btn || !rateRow.contains(btn)) return;
                setHeartRate(btn.getAttribute("data-rate"));
            };
        }
        var rateSortBtn = document.getElementById("filter-rate-sort");
        if (rateSortBtn) {
            rateSortBtn.onclick = function (e) {
                e.stopPropagation();
                setListSort(listSort() === "rating" ? "newest" : "rating");
            };
        }
        var artistToggle = document.getElementById("filter-artist-toggle");
        if (artistToggle) {
            artistToggle.onclick = function (e) {
                e.stopPropagation();
                setFilterMenu(false);
                setArtistCollapsed(false);
            };
        }
        var castToggle = document.getElementById("filter-cast-toggle");
        if (castToggle) {
            castToggle.onclick = function (e) {
                e.stopPropagation();
                setFilterMenu(false);
                setCastCollapsed(false);
            };
        }
        var tagToggle = document.getElementById("filter-tag-toggle");
        if (tagToggle) {
            tagToggle.onclick = function (e) {
                e.stopPropagation();
                setFilterMenu(false);
                setTagCollapsed(false);
            };
        }
        var modelToggle = document.getElementById("filter-model-toggle");
        if (modelToggle) {
            modelToggle.onclick = function (e) {
                e.stopPropagation();
                setFilterMenu(false);
                setModelCollapsed(false);
            };
        }

        var btnSolo = document.getElementById("btn-solo");
        if (btnSolo) {
            btnSolo.onclick = function (e) {
                e.stopPropagation();
                state.soloArtist = !state.soloArtist;
                try { localStorage.setItem(LS_SOLO, state.soloArtist ? "1" : "0"); } catch (e1) {}
                syncFilterUi();
                state.page = 1;
                state.sel = null;
                closeLightbox();
                loadList();
            };
        }
        var btnLive = document.getElementById("btn-live");
        if (btnLive) {
            btnLive.onclick = function (e) {
                e.stopPropagation();
                setLiveMode(!liveModeOn());
            };
        }
        window.addEventListener("anima-live-mode", function () { applyLiveModeUi(); });
        window.addEventListener("storage", function (e) {
            if (!e || e.key !== "apc_fav_live") return;
            applyLiveModeUi();
        });
        var popClose = document.getElementById("artist-pop-close");
        if (popClose) {
            popClose.onclick = function (e) {
                e.stopPropagation();
                setArtistCollapsed(true);
            };
        }
        var popFoldBtn = document.getElementById("artist-pop-fold");
        if (popFoldBtn) {
            popFoldBtn.onclick = function (e) {
                e.stopPropagation();
                setArtistCollapsed(true);
            };
        }
        var artistFab = document.getElementById("artist-pop-fab");
        if (artistFab && !artistFab._bound) {
            artistFab._bound = true;
            artistFab.onclick = function (e) {
                e.stopPropagation();
                setArtistCollapsed(false);
            };
        }
        var popUndock = document.getElementById("artist-pop-undock");
        if (popUndock) {
            popUndock.onclick = function (e) {
                e.stopPropagation();
                setPopDock("");
            };
        }
        document.addEventListener("mousedown", function (e) {
            var menu = document.getElementById("filter-menu");
            var box = artistPopBox();
            var castBox = castPopBox();
            if (filterWrap && filterWrap.contains(e.target)) return;
            if (menu && menu.contains(e.target)) return;
            if (box && box.contains(e.target)) return;
            if (castBox && castBox.contains(e.target)) return;
            setFilterMenu(false);
        });
        document.addEventListener("keydown", function (e) {
            if (e.key !== "Escape") return;
            if (modelPopOpen()) {
                setModelCollapsed(true);
                e.preventDefault();
                e.stopImmediatePropagation();
                return;
            }
            if (tagPopOpen()) {
                setTagCollapsed(true);
                e.preventDefault();
                e.stopImmediatePropagation();
                return;
            }
            if (castPopOpen()) {
                setCastCollapsed(true);
                e.preventDefault();
                e.stopImmediatePropagation();
                return;
            }
            if (artistPopOpen()) {
                setArtistCollapsed(true);
                e.preventDefault();
                e.stopImmediatePropagation();
                return;
            }
            var menu = document.getElementById("filter-menu");
            if (!menu || menu.hidden) return;
            setFilterMenu(false);
            e.preventDefault();
            e.stopImmediatePropagation();
        });
        window.addEventListener("resize", function () {
            placeFilterMenu();
            layoutAllDocks();
            if (isFlow()) {
                var box = document.getElementById("grid");
                if (box) {
                    var tiles = box.querySelectorAll(".tile");
                    for (var i = 0; i < tiles.length; i++) {
                        layoutFlowTile(tiles[i], tiles[i].querySelector("img"));
                    }
                }
                maybeLoadMore();
            }
        });
    }

    function bindPageSize() {
        var sel = document.getElementById("page-size");
        if (!sel || sel._bound) return;
        sel._bound = true;
        PAGE_SIZES.forEach(function (n) {
            var o = document.createElement("option");
            o.value = String(n);
            o.textContent = String(n);
            sel.appendChild(o);
        });
        sel.value = String(state.pageSize);
        sel.title = T("每页");
        sel.onchange = function () {
            var n = parseInt(sel.value, 10);
            if (PAGE_SIZES.indexOf(n) < 0) n = 36;
            var old = state.pageSize || 36;
            var idx = Math.max(0, ((state.page || 1) - 1) * old);
            state.pageSize = n;
            try { localStorage.setItem(LS_PAGE, String(n)); } catch (e1) {}
            state.page = Math.floor(idx / n) + 1;
            loadList();
        };
        bindAutoShutdown();
    }

    function bindArtistPop() {
        var hd = document.getElementById("artist-pop-hd");
        var box = artistPopBox();
        var rs = document.getElementById("artist-pop-rs");
        if (!hd || !box || hd._bound) return;
        hd._bound = true;
        var drag = null;
        function stopRaf() {
            if (drag && drag.raf) {
                cancelAnimationFrame(drag.raf);
                drag.raf = 0;
            }
        }
        function pickUp(e, r) {
            if (_popDock) {
                _popFree.w = Math.max(280, Math.min(640, r.width));
                _popFree.h = Math.max(160, Math.min(440, r.height));
                _popDock = "";
                syncPopDockClass();
                box.style.width = _popFree.w + "px";
                box.style.height = _popFree.h + "px";
                box.style.left = Math.round(e.clientX - _popFree.w / 2) + "px";
                box.style.top = Math.round(e.clientY - 18) + "px";
                box.style.transform = "none";
                r = { left: e.clientX - _popFree.w / 2, top: e.clientY - 18, width: _popFree.w, height: _popFree.h };
                layoutInspect();
                layoutCastPop();
                syncShellInsets();
            }
            return r;
        }
        function paintMove() {
            if (!drag || drag.kind !== "move") return;
            drag.raf = 0;
            var dx = drag.lastX - drag.x;
            var dy = drag.lastY - drag.y;
            box.style.transform = "translate3d(" + dx + "px," + dy + "px,0)";
            showSnapHint(snapFromPoint(drag.lastX, drag.lastY, drag.band), drag.band);
            placeInspectFab();
        }
        hd.addEventListener("pointerdown", function (e) {
            if (e.button !== 0) return;
            var t = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement);
            if (t && t.closest && t.closest("button")) return;
            e.preventDefault();
            hidePeek();
            closeCtxMenu();
            var r = box.getBoundingClientRect();
            drag = {
                kind: "move",
                x: e.clientX,
                y: e.clientY,
                lastX: e.clientX,
                lastY: e.clientY,
                left: r.left,
                top: r.top,
                w: r.width,
                h: r.height,
                docked: !!_popDock,
                lifted: !_popDock,
                band: popBand(),
                raf: 0
            };
            box.classList.add("is-dragging");
            try { hd.setPointerCapture(e.pointerId); } catch (e2) {}
            document.body.classList.add("is-resizing-artist");
        });
        hd.addEventListener("pointermove", function (e) {
            if (!drag || drag.kind !== "move") return;
            if (drag.docked && !drag.lifted) {
                if (Math.abs(e.clientX - drag.x) < 10 && Math.abs(e.clientY - drag.y) < 10) return;
                var r = pickUp(e, { left: drag.left, top: drag.top, width: drag.w, height: drag.h });
                drag.left = r.left;
                drag.top = r.top;
                drag.w = r.width;
                drag.h = r.height;
                drag.x = e.clientX;
                drag.y = e.clientY;
                drag.lifted = true;
            }
            drag.lastX = e.clientX;
            drag.lastY = e.clientY;
            if (!drag.raf) drag.raf = requestAnimationFrame(paintMove);
        });
        function endMove(e) {
            if (!drag || drag.kind !== "move") return;
            stopRaf();
            var lastX = e.clientX || drag.lastX;
            var lastY = e.clientY || drag.lastY;
            var kind = drag.lifted ? snapFromPoint(lastX, lastY, drag.band) : "";
            box.style.transform = "none";
            box.classList.remove("is-dragging");
            if (drag.lifted) {
                box.style.left = Math.round(drag.left + (lastX - drag.x)) + "px";
                box.style.top = Math.round(drag.top + (lastY - drag.y)) + "px";
            }
            drag = null;
            document.body.classList.remove("is-resizing-artist");
            showSnapHint("");
            if (kind) setPopDock(kind);
            else persistArtistPop();
            try { hd.releasePointerCapture(e.pointerId); } catch (e3) {}
        }
        hd.addEventListener("pointerup", endMove);
        hd.addEventListener("pointercancel", endMove);
        if (rs) {
            rs.addEventListener("pointerdown", function (e) {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                hidePeek();
                closeCtxMenu();
                var r = box.getBoundingClientRect();
                drag = { kind: "size", edge: "se", x: e.clientX, y: e.clientY, w: r.width, h: r.height, left: r.left, top: r.top, dock: _popDock, band: popBand() };
                box.classList.add("is-dragging");
                try { rs.setPointerCapture(e.pointerId); } catch (e4) {}
                document.body.classList.add("is-resizing-artist");
            });
            rs.addEventListener("pointermove", function (e) {
                if (!drag || drag.kind !== "size") return;
                var bandNow = popBand("artist");
                if (drag.dock === "left" || drag.dock === "right") {
                    var sw = sizeFromEdge(drag, e, 260, 140, Math.round(bandNow.vw * 0.5), 0);
                    _popFree.w = sw.w;
                    var rw = snapRectFor(drag.dock, bandNow, _popFree, "artist");
                    applySnapRect(rw);
                    adoptDockSize(_popFree, drag.dock, rw);
                    layoutInspect();
                    layoutCastPop();
                    syncShellInsets();
                    return;
                }
                if (drag.dock === "top" || drag.dock === "inspect") {
                    var maxH = drag.dock === "top"
                        ? Math.max(140, (bandNow.vh || window.innerHeight) - bandNow.cb - occSide("bottom", "artist") - 80)
                        : Math.max(140, (bandNow.vh || window.innerHeight) - bandNow.cb - 80);
                    var sh = sizeFromEdge(drag, e, 260, 140, 0, maxH);
                    _popFree.h = sh.h;
                    var rt = snapRectFor(drag.dock, bandNow, _popFree, "artist");
                    applySnapRect(rt);
                    adoptDockSize(_popFree, drag.dock, rt);
                    layoutInspect();
                    layoutCastPop();
                    syncShellInsets();
                    return;
                }
                var sf = sizeFromEdge(drag, e, 280, 160, drag.band.vw - 16, drag.band.vh - 16);
                box.style.width = sf.w + "px";
                box.style.height = sf.h + "px";
                box.style.left = sf.left + "px";
                box.style.top = sf.top + "px";
            });
            function endSize(e) {
                if (!drag || drag.kind !== "size") return;
                drag = null;
                box.classList.remove("is-dragging");
                document.body.classList.remove("is-resizing-artist");
                persistArtistPop();
                layoutAllDocks();
                try { rs.releasePointerCapture(e.pointerId); } catch (e5) {}
            }
            rs.addEventListener("pointerup", endSize);
            rs.addEventListener("pointercancel", endSize);
            rs.addEventListener("dblclick", function (e) {
                e.preventDefault();
                resetArtistPop();
            });
            var artistEdges = box.querySelectorAll(".opv-edge");
            for (var aei = 0; aei < artistEdges.length; aei++) {
                (function (el) {
                    el.addEventListener("pointerdown", function (e) {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        e.stopPropagation();
                        hidePeek();
                        closeCtxMenu();
                        var rct = box.getBoundingClientRect();
                        drag = { kind: "size", edge: el.getAttribute("data-edge") || "e", x: e.clientX, y: e.clientY, w: rct.width, h: rct.height, left: rct.left, top: rct.top, dock: _popDock, band: popBand() };
                        box.classList.add("is-dragging");
                        document.body.classList.add("is-resizing-artist");
                        function move(ev) {
                            rs.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: ev.clientX, clientY: ev.clientY }));
                        }
                        function up(ev) {
                            document.removeEventListener("pointermove", move, true);
                            document.removeEventListener("pointerup", up, true);
                            document.removeEventListener("pointercancel", up, true);
                            endSize(ev || {});
                        }
                        document.addEventListener("pointermove", move, true);
                        document.addEventListener("pointerup", up, true);
                        document.addEventListener("pointercancel", up, true);
                    });
                })(artistEdges[aei]);
            }
        }
        function abortArtistDrag(e) {
            if (!drag) return;
            if (drag.kind === "move") {
                endMove(e || { clientX: drag.lastX, clientY: drag.lastY, pointerId: -1 });
                return;
            }
            stopRaf();
            box.classList.remove("is-dragging");
            document.body.classList.remove("is-resizing-artist");
            persistArtistPop();
            try { if (rs && e && typeof e.pointerId === "number") rs.releasePointerCapture(e.pointerId); } catch (e5) {}
            drag = null;
        }
        window.addEventListener("pointerup", abortArtistDrag, true);
        window.addEventListener("pointercancel", abortArtistDrag, true);
        window.addEventListener("blur", function () { abortArtistDrag({ pointerId: -1 }); });
    }

    function persistInspectLayout() {
        try {
            localStorage.setItem(LS_INSPECT_LAYOUT, JSON.stringify({
                dock: _insDock || "",
                collapsed: _insCollapsed ? 1 : 0,
                left: _insFree.left,
                top: _insFree.top,
                w: _insFree.w,
                h: _insFree.h
            }));
            if (_insDock === "bottom" && _insFree.h) {
                localStorage.setItem(LS_INSPECT, String(Math.round(_insFree.h)));
            }
        } catch (e1) {}
    }
    function syncInspectClass() {
        var box = document.getElementById("inspect");
        if (!box) return;
        box.classList.remove("is-dock-left", "is-dock-right", "is-dock-top", "is-dock-bottom", "is-float", "is-collapsed");
        var compare = document.body.classList.contains("compare-on");
        var fab = document.getElementById("inspect-fab");
        var floatBtn = document.getElementById("inspect-float");
        if (_insCollapsed) {
            box.classList.add("is-collapsed");
            box.hidden = true;
        } else {
            box.hidden = compare;
            if (_insDock === "left" || _insDock === "right" || _insDock === "top") box.classList.add("is-dock-" + _insDock);
            else if (_insDock === "bottom") box.classList.add("is-dock-bottom");
            else box.classList.add("is-float");
        }
        if (fab) fab.hidden = !(_insCollapsed && !compare);
        if (fab && !fab.hidden) placeInspectFab();
        if (floatBtn) floatBtn.hidden = _insCollapsed || !_insDock;
    }
    function layoutInspect() {
        var box = document.getElementById("inspect");
        if (!box) return;
        syncInspectClass();
        if (_insCollapsed || document.body.classList.contains("compare-on")) return;
        if (_insDock === "bottom" || _insDock === "left" || _insDock === "right" || _insDock === "top") {
            var ir = snapRectFor(_insDock, popBand("inspect"), _insFree, "inspect");
            applyRect(box, ir);
            adoptDockSize(_insFree, _insDock, ir);
            return;
        }
        var w = Math.max(360, _insFree.w || 720);
        var h2 = Math.max(240, _insFree.h || 380);
        var left = _insFree.left != null ? _insFree.left : 80;
        var top = _insFree.top != null ? _insFree.top : chromeBottom() + 24;
        box.style.width = w + "px";
        box.style.height = h2 + "px";
        box.style.left = left + "px";
        box.style.top = top + "px";
        if (window.clampPopup) window.clampPopup(box);
    }
    function setInsDock(kind) {
        var box = document.getElementById("inspect");
        var was = _insDock;
        _insDock = kind || "";
        if (!_insDock && was && box) {
            var w = Math.max(420, _insFree.w || 720);
            var h = Math.max(260, _insFree.h || 380);
            box.style.width = w + "px";
            box.style.height = h + "px";
            box.style.left = Math.round((window.innerWidth - w) / 2) + "px";
            box.style.top = Math.round(chromeBottom() + 24) + "px";
            var r = box.getBoundingClientRect();
            _insFree.left = Math.round(r.left);
            _insFree.top = Math.round(r.top);
            _insFree.w = Math.round(r.width);
            _insFree.h = Math.round(r.height);
        }
        layoutAllDocks();
        persistInspectLayout();
    }
    function setInsCollapsed(on) {
        _insCollapsed = !!on;
        layoutAllDocks();
        persistInspectLayout();
    }
    function inspectBounds() {
        return { min: 220, max: Math.max(280, Math.round(window.innerHeight * 0.8)) };
    }

    function applyInspectHeight(px, persist) {
        var box = document.getElementById("inspect");
        if (!box) return;
        var b = inspectBounds();
        px = Math.max(b.min, Math.min(b.max, px));
        box.style.height = px + "px";
        _insFree.h = Math.round(px);
        layoutInspect();
        layoutArtistPop();
        layoutCastPop();
        syncShellInsets();
        if (persist) persistInspectLayout();
        return px;
    }

    function syncGalleryPad(px) {
        syncShellInsets();
    }

    function resetInspectHeight() {
        var box = document.getElementById("inspect");
        if (!box) return;
        box.style.height = "";
        _insFree.h = Math.round(window.innerHeight * 0.42);
        try { localStorage.removeItem(LS_INSPECT); } catch (e1) {}
        persistInspectLayout();
        layoutAllDocks();
    }

    function restoreInspectHeight() {
        var lay = null;
        try { lay = JSON.parse(localStorage.getItem(LS_INSPECT_LAYOUT) || "null"); } catch (e0) { lay = null; }
        if (lay) {
            if (lay.w) _insFree.w = lay.w;
            if (lay.h) _insFree.h = lay.h;
            if (lay.left != null) _insFree.left = lay.left;
            if (lay.top != null) _insFree.top = lay.top;
            _insDock = lay.dock || "bottom";
            _insCollapsed = !!lay.collapsed;
        }
        var raw = "";
        try { raw = localStorage.getItem(LS_INSPECT) || ""; } catch (e1) { raw = ""; }
        var n = parseInt(raw, 10);
        if (n >= 220) _insFree.h = n;
        if (_insDock === "bottom" && _insFree.h >= 220) applyInspectHeight(_insFree.h, false);
        layoutAllDocks();
    }

    function bindInspectResize() {
        var handle = document.getElementById("inspect-resizer");
        var box = document.getElementById("inspect");
        var hd = document.getElementById("inspect-hd");
        var rs = document.getElementById("inspect-rs");
        var floatBtn = document.getElementById("inspect-float");
        var foldBtn = document.getElementById("inspect-collapse");
        var fab = document.getElementById("inspect-fab");
        if (!box || box._bound) return;
        box._bound = true;
        restoreInspectHeight();
        if (floatBtn) floatBtn.onclick = function (e) {
            e.stopPropagation();
            setInsCollapsed(false);
            setInsDock("");
        };
        if (foldBtn) foldBtn.onclick = function (e) {
            e.stopPropagation();
            setInsCollapsed(true);
        };
        if (fab) fab.onclick = function () { setInsCollapsed(false); };
        var drag = null;
        function pickUpInspect(e, r) {
            if (_insDock) {
                _insFree.w = Math.max(360, Math.min(900, r.width));
                _insFree.h = Math.max(240, Math.min(720, r.height));
                _insDock = "";
                syncInspectClass();
                box.style.width = _insFree.w + "px";
                box.style.height = _insFree.h + "px";
                box.style.left = Math.round(e.clientX - _insFree.w / 2) + "px";
                box.style.top = Math.round(e.clientY - 18) + "px";
                r = { left: e.clientX - _insFree.w / 2, top: e.clientY - 18, width: _insFree.w, height: _insFree.h };
                syncShellInsets();
            }
            return r;
        }
        if (hd) {
            hd.addEventListener("pointerdown", function (e) {
                if (e.button !== 0) return;
                var t = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement);
                if (t && t.closest && t.closest("button")) return;
                e.preventDefault();
                hidePeek();
                closeCtxMenu();
                var r = box.getBoundingClientRect();
                drag = {
                    kind: "move",
                    x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY,
                    left: r.left, top: r.top, w: r.width, h: r.height,
                    docked: !!_insDock, lifted: !_insDock,
                    band: popBand("inspect")
                };
                box.classList.add("is-dragging");
                try { hd.setPointerCapture(e.pointerId); } catch (e2) {}
                document.body.classList.add("is-resizing-inspect");
            });
            hd.addEventListener("pointermove", function (e) {
                if (!drag || drag.kind !== "move") return;
                if (drag.docked && !drag.lifted) {
                    if (Math.abs(e.clientX - drag.x) < 10 && Math.abs(e.clientY - drag.y) < 10) return;
                    var r = pickUpInspect(e, { left: drag.left, top: drag.top, width: drag.w, height: drag.h });
                    drag.left = r.left;
                    drag.top = r.top;
                    drag.w = r.width;
                    drag.h = r.height;
                    drag.x = e.clientX;
                    drag.y = e.clientY;
                    drag.lifted = true;
                }
                drag.lastX = e.clientX;
                drag.lastY = e.clientY;
                box.style.left = Math.round(drag.left + (e.clientX - drag.x)) + "px";
                box.style.top = Math.round(drag.top + (e.clientY - drag.y)) + "px";
                showSnapHint(snapFromPoint(e.clientX, e.clientY, drag.band, "bottom"), drag.band);
            });
            function endInsMove(e) {
                if (!drag || drag.kind !== "move") return;
                var lastX = e.clientX || drag.lastX;
                var lastY = e.clientY || drag.lastY;
                var kind = drag.lifted ? snapFromPoint(lastX, lastY, drag.band, "bottom") : "";
                box.classList.remove("is-dragging");
                document.body.classList.remove("is-resizing-inspect");
                showSnapHint("");
                if (drag.lifted) {
                    box.style.left = Math.round(drag.left + (lastX - drag.x)) + "px";
                    box.style.top = Math.round(drag.top + (lastY - drag.y)) + "px";
                    var rr = box.getBoundingClientRect();
                    _insFree.left = Math.round(rr.left);
                    _insFree.top = Math.round(rr.top);
                    _insFree.w = Math.round(rr.width);
                    _insFree.h = Math.round(rr.height);
                }
                drag = null;
                if (kind) setInsDock(kind);
                else {
                    persistInspectLayout();
                    layoutAllDocks();
                }
                try { hd.releasePointerCapture(e.pointerId); } catch (e3) {}
            }
            hd.addEventListener("pointerup", endInsMove);
            hd.addEventListener("pointercancel", endInsMove);
        }
        if (handle) {
            handle.addEventListener("pointerdown", function (e) {
                if (e.button !== 0) return;
                if (_insDock !== "bottom") return;
                e.preventDefault();
                hidePeek();
                closeCtxMenu();
                drag = { kind: "size", y: e.clientY, h: box.getBoundingClientRect().height };
                try { handle.setPointerCapture(e.pointerId); } catch (e2) {}
                document.body.classList.add("is-resizing-inspect");
            });
            handle.addEventListener("pointermove", function (e) {
                if (!drag || drag.kind !== "size") return;
                applyInspectHeight(drag.h + (drag.y - e.clientY), false);
            });
            function endSize(e) {
                if (!drag || drag.kind !== "size") return;
                applyInspectHeight(box.getBoundingClientRect().height, true);
                drag = null;
                document.body.classList.remove("is-resizing-inspect");
                try { handle.releasePointerCapture(e.pointerId); } catch (e3) {}
            }
            handle.addEventListener("pointerup", endSize);
            handle.addEventListener("pointercancel", endSize);
            handle.addEventListener("dblclick", function (e) {
                e.preventDefault();
                resetInspectHeight();
            });
        }
        if (rs) {
            rs.addEventListener("pointerdown", function (e) {
                if (e.button !== 0) return;
                if (_insDock === "bottom") return;
                e.preventDefault();
                e.stopPropagation();
                hidePeek();
                var r = box.getBoundingClientRect();
                drag = { kind: "corner", edge: "se", x: e.clientX, y: e.clientY, w: r.width, h: r.height, left: r.left, top: r.top, dock: _insDock, band: popBand("inspect") };
                try { rs.setPointerCapture(e.pointerId); } catch (e4) {}
                document.body.classList.add("is-resizing-inspect");
            });
            rs.addEventListener("pointermove", function (e) {
                if (!drag || drag.kind !== "corner") return;
                if (drag.dock === "left" || drag.dock === "right") {
                    var sw = sizeFromEdge(drag, e, 280, 180, Math.round(drag.band.vw * 0.55), 0);
                    _insFree.w = sw.w;
                    layoutInspect();
                    layoutArtistPop();
                    layoutCastPop();
                    syncShellInsets();
                    return;
                }
                if (drag.dock === "top") {
                    var sh = sizeFromEdge(drag, e, 280, 180, 0, Math.max(200, drag.band.it - drag.band.cb - 24));
                    _insFree.h = sh.h;
                    layoutInspect();
                    layoutArtistPop();
                    layoutCastPop();
                    syncShellInsets();
                    return;
                }
                var sf = sizeFromEdge(drag, e, 360, 240, drag.band.vw - 16, drag.band.vh - 16);
                box.style.width = sf.w + "px";
                box.style.height = sf.h + "px";
                box.style.left = sf.left + "px";
                box.style.top = sf.top + "px";
            });
            function endCorner(e) {
                if (!drag || drag.kind !== "corner") return;
                var rr = box.getBoundingClientRect();
                _insFree.w = Math.round(rr.width);
                _insFree.h = Math.round(rr.height);
                _insFree.left = Math.round(rr.left);
                _insFree.top = Math.round(rr.top);
                drag = null;
                document.body.classList.remove("is-resizing-inspect");
                persistInspectLayout();
                layoutAllDocks();
                try { rs.releasePointerCapture(e.pointerId); } catch (e5) {}
            }
            rs.addEventListener("pointerup", endCorner);
            rs.addEventListener("pointercancel", endCorner);
            var insEdges = box.querySelectorAll(".opv-edge");
            for (var iei = 0; iei < insEdges.length; iei++) {
                (function (el) {
                    el.addEventListener("pointerdown", function (e) {
                        if (e.button !== 0) return;
                        if (_insDock === "bottom") return;
                        e.preventDefault();
                        e.stopPropagation();
                        hidePeek();
                        var rct = box.getBoundingClientRect();
                        drag = { kind: "corner", edge: el.getAttribute("data-edge") || "e", x: e.clientX, y: e.clientY, w: rct.width, h: rct.height, left: rct.left, top: rct.top, dock: _insDock, band: popBand("inspect") };
                        document.body.classList.add("is-resizing-inspect");
                        function move(ev) {
                            rs.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: ev.clientX, clientY: ev.clientY }));
                        }
                        function up(ev) {
                            document.removeEventListener("pointermove", move, true);
                            document.removeEventListener("pointerup", up, true);
                            document.removeEventListener("pointercancel", up, true);
                            endCorner(ev || {});
                        }
                        document.addEventListener("pointermove", move, true);
                        document.addEventListener("pointerup", up, true);
                        document.addEventListener("pointercancel", up, true);
                    });
                })(insEdges[iei]);
            }
        }
    }

    function bindLightbox() {
        document.getElementById("lb-close").onclick = closeLightbox;
        document.getElementById("lb-prev").onclick = function () { lbNav(-1); };
        document.getElementById("lb-next").onclick = function () { lbNav(1); };
        document.getElementById("lb-fit").onclick = function () {
            if (_lb.zoom <= 1.02) setLbNative(true);
            else lbFit();
        };
        var stage = document.getElementById("lb-stage");
        var img = document.getElementById("lightbox-img");
        if (stage) {
            stage.addEventListener("wheel", function (e) {
                if (!lbOpen()) return;
                e.preventDefault();
                lbWheel(e);
            }, { passive: false });
            stage.addEventListener("pointerdown", lbPointerDown);
            stage.addEventListener("pointermove", lbPointerMove);
            stage.addEventListener("pointerup", lbPointerUp);
            stage.addEventListener("pointercancel", lbPointerUp);
            stage.addEventListener("click", function (e) {
                if (_lbSuppressClick) { _lbSuppressClick = false; return; }
                if (e.target === stage) closeLightbox();
            });
        }
        if (img) {
            img.addEventListener("dblclick", function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (_lb.zoom <= 1.02) setLbNative(true);
                else lbFit();
            });
            img.addEventListener("dragstart", function (e) { e.preventDefault(); });
            img.addEventListener("pointerdown", function (e) {
                if (_lb.zoom > 1.02) return;
                osDragDown(e, _lbFile);
            });
        }
        var more = document.getElementById("lb-more");
        var moreBtn = document.getElementById("lb-more-btn");
        if (more && moreBtn) {
            more.addEventListener("pointerenter", function () {
                if (_lbMoreLeave) { clearTimeout(_lbMoreLeave); _lbMoreLeave = 0; }
                if (_lbMoreDrag) return;
                lbMoreSet(true);
            });
            more.addEventListener("pointerleave", function () {
                if (_lbMorePinned || _lbMoreDrag) return;
                if (_lbMoreLeave) clearTimeout(_lbMoreLeave);
                _lbMoreLeave = setTimeout(function () {
                    _lbMoreLeave = 0;
                    if (_lbMorePinned || _lbMoreDrag) return;
                    var el = document.elementFromPoint(_lbPtr.x, _lbPtr.y);
                    if (el && more.contains(el)) return;
                    lbMoreSet(false);
                }, 280);
            });
            document.addEventListener("pointermove", function (e) {
                _lbPtr.x = e.clientX;
                _lbPtr.y = e.clientY;
            }, true);
            moreBtn.addEventListener("pointerdown", function (e) {
                if (e.button !== 0) return;
                var host = document.getElementById("lightbox");
                var wrap = document.getElementById("lb-more");
                if (!host || !wrap) return;
                var hr = host.getBoundingClientRect();
                var r = wrap.getBoundingClientRect();
                _lbMoreDrag = {
                    id: e.pointerId,
                    x: e.clientX,
                    y: e.clientY,
                    ox: r.left - hr.left,
                    oy: r.top - hr.top,
                    moved: false
                };
                moreBtn.classList.add("is-dragging");
                try { moreBtn.setPointerCapture(e.pointerId); } catch (err) {}
            });
            moreBtn.addEventListener("pointermove", function (e) {
                if (!_lbMoreDrag || _lbMoreDrag.id !== e.pointerId) return;
                var dx = e.clientX - _lbMoreDrag.x;
                var dy = e.clientY - _lbMoreDrag.y;
                if (dx * dx + dy * dy > 25) _lbMoreDrag.moved = true;
                if (!_lbMoreDrag.moved) return;
                lbMoreApply(_lbMoreDrag.ox + dx, _lbMoreDrag.oy + dy);
            });
            function endMoreDrag(e) {
                if (!_lbMoreDrag || (e && _lbMoreDrag.id !== e.pointerId)) return;
                var moved = _lbMoreDrag.moved;
                _lbMoreDrag = null;
                moreBtn.classList.remove("is-dragging");
                if (moved) {
                    _lbMoreSkipClick = true;
                    lbMoreSave();
                }
            }
            moreBtn.addEventListener("pointerup", endMoreDrag);
            moreBtn.addEventListener("pointercancel", endMoreDrag);
            moreBtn.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (_lbMoreSkipClick) { _lbMoreSkipClick = false; return; }
                _lbMorePinned = !_lbMorePinned;
                if (_lbMorePinned) lbMoreSet(true);
                else lbMoreSet(false);
            });
            moreBtn.addEventListener("wheel", function (e) {
                if (!lbOpen()) return;
                e.preventDefault();
                lbWheel(e);
            }, { passive: false });
        }
        window.addEventListener("resize", function () {
            if (!lbOpen()) return;
            if (_lb.zoom <= 1.02) lbFit();
            else lbMoreRestore();
        });
        document.addEventListener("keydown", function (e) {
            var tag = (e.target && e.target.tagName) || "";
            if (tag === "INPUT" || tag === "TEXTAREA") return;
            if (e.key === "Escape" && ctxOpen()) {
                closeCtxMenu();
                e.preventDefault();
                return;
            }
            if (e.key === "Escape" && document.getElementById("edit-move-pop")) {
                closeEditMovePop();
                e.preventDefault();
                return;
            }
            if (e.key === "Escape" && pickArtistOpen()) {
                closePickArtist();
                e.preventDefault();
                return;
            }
            var fav = document.getElementById("fav-save");
            if (e.key === "Escape" && fav && !fav.hidden) {
                closeFavSave();
                e.preventDefault();
                return;
            }
            if (cmpOpen()) {
                if (e.key === "Escape") exitCompareMode();
                return;
            }
            if (lbOpen()) {
                if (e.key === "Escape") {
                    if (lbMoreOpen()) { _lbMorePinned = false; lbMoreSet(false); }
                    else closeLightbox();
                }
                if (e.key === "ArrowLeft") lbNav(-1);
                if (e.key === "ArrowRight") lbNav(1);
                return;
            }
            if (e.key === "Escape" && state.compareOn) {
                exitCompareMode();
                e.preventDefault();
                return;
            }
            if (_editOn && (e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "a" || e.key === "A")) {
                e.preventDefault();
                selectAllEdit();
                return;
            }
            if (e.key === "Escape" && _editOn) {
                if (editCount()) clearEditSel();
                else setEditMode(false);
                e.preventDefault();
                return;
            }
            if (e.key === "PageDown" || e.key === "]") {
                e.preventDefault();
                if (isFlow()) {
                    var gal = document.getElementById("gallery");
                    if (gal) gal.scrollTop += Math.round(gal.clientHeight * 0.9);
                    maybeLoadMore();
                } else goPage(state.page + 1);
            }
            if (e.key === "PageUp" || e.key === "[") {
                e.preventDefault();
                if (isFlow()) {
                    var gal2 = document.getElementById("gallery");
                    if (gal2) gal2.scrollTop -= Math.round(gal2.clientHeight * 0.9);
                } else goPage(state.page - 1);
            }
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                var items = state.items || [];
                if (!items.length) return;
                e.preventDefault();
                var i = 0;
                if (state.sel) {
                    var key = itemKey(state.sel);
                    for (var n = 0; n < items.length; n++) {
                        if (itemKey(items[n]) === key) { i = n; break; }
                    }
                    i = i + (e.key === "ArrowRight" ? 1 : -1);
                }
                if (i < 0) i = 0;
                if (i >= items.length) i = items.length - 1;
                selectItem(items[i]);
            }
        });
    }

    var gal0 = document.getElementById("gallery");
    if (gal0 && typeof window.animaShieldDomWidget === "function") window.animaShieldDomWidget(gal0);
    window.addEventListener("pointerup", function () {
        if (!isFlow() || window.__animaGalleryPtrDown || !_flowHoldLayout) return;
        _flowHoldLayout = false;
        var box = document.getElementById("grid");
        if (!box) return;
        var tiles = box.querySelectorAll(".tile");
        for (var i = 0; i < tiles.length; i++) layoutFlowTile(tiles[i], tiles[i].querySelector("img"));
        maybeLoadMore();
    }, true);

    setTitle();
    applyFxClass();
    applyBrowseChrome();
    bindChrome();
    bindPageSize();
    bindInspectResize();
    bindArtistPop();
    bindPickArtist();
    bindCastPop();
    bindTagPop();
    bindModelPop();
    bindLightbox();
    bindCtxMenu();
    if (typeof window.applyAnimaTheme === "function") {
        try { window.applyAnimaTheme(window.getAnimaThemeId ? window.getAnimaThemeId() : "cobalt", false); } catch (e3) {}
    }
    applyFxClass();
    try { window.name = isPopWin() ? "anima-opv-pop" : "anima-opv"; } catch (eNm) {}
    if (isPopWin()) {
        setTimeout(function () { releasePopWin(window); }, 0);
        setTimeout(function () { releasePopWin(window); }, 240);
    }
    var _bootArts = readPickerArtists();
    state.comboName = readPickerCombo();
    if (_bootArts.length) {
        var _bootItems = uniqArtistItems(_bootArts);
        if (_bootItems.length) {
            state.subfolder = "";
            state.listDeep = true;
            applyDeepChrome();
            state.heartRate = 0;
            state.tagKey = "";
            state.tagCn = "";
            state.modelKey = "";
            persistModelKey();
            state.soloArtist = readPickerSolo();
            state.artistExact = readPickerExact();
            state.seriesKey = "";
            state.characterKey = "";
            state.artistKey = _bootItems.map(function (it) { return it.key; }).join(",");
            state.view = "artist";
            state.page = 1;
        }
    }
    if (isPopWin()) {
        var _popFolder = readPopFolder();
        if (_popFolder != null) state.subfolder = _popFolder;
    }
    document.body.classList.toggle("opv-artist", artistFilterOn());
    loadArtistPopLayout();
    loadCastPopLayout();
    loadTagPopLayout();
    loadModelPopLayout();
    if (artistFilterOn()) {
        if (_popCollapsed) layoutAllDocks();
        else openArtistPop();
    }
    if (castFilterOn()) {
        if (_castCollapsed) layoutAllDocks();
        else openCastPop();
    }
    if (tagFilterOn()) {
        if (_tagCollapsed) layoutAllDocks();
        else openTagPop();
    }
    if (_modelCollapsed) layoutAllDocks();
    else openModelPop();
    if (artistFilterOn() && artistPopOpen()) raiseFilterPop("artist");
    else if (castFilterOn() && castPopOpen()) raiseFilterPop("cast");
    syncFilterUi();
    loadImgFavs();
    loadImgRates();
    loadList();
    startStampWatch();
    _skinDockReady = true;
    settleDockLayout();
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { scheduleDockLayout(); }).catch(function () {});
    }
    window.addEventListener("load", function () { scheduleDockLayout(); });
})();
