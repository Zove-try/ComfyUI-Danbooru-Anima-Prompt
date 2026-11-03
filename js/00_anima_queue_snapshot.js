import { app } from "/scripts/app.js";

// 批量排队时锁定 D站/G站「点运行那一刻」的选中图。
// ComfyUI 的 queuePrompt 会把后续点击压进 queueItems，真正序列化时用 LIFO pop，
// 并且 graphToPrompt 会逐个 await 各节点的 serializeValue。下一页搜索把服务端
// 堵住时，这些点击要等加载完才序列化，读到的是当时的 live widget，于是一整批
// 都变成最后一张图。这里在点击时压栈，序列化时弹出并写回 prompt。
(function installAnimaQueueSnapshot() {
    if (app.__animaQueueSnapV >= 3) return;

    var SNAP_V = 3;
    var TARGET = { DanbooruBrowser: 1, GelbooruBrowser: 1 };
    var KEYS = ["selection_data", "_tag_fusion", "node_settings"];
    var snaps = [];
    var depth = 0;
    var activeSnap = null;
    var installed = false;

    function nodeClass(n) {
        return (n && (n.constructor && n.constructor.comfyClass || n.comfyClass || n.type)) || "";
    }

    function walkNodes(graph, out, seen) {
        if (!graph) return;
        seen = seen || new Set();
        if (seen.has(graph)) return;
        seen.add(graph);
        var list = graph._nodes || graph.nodes || [];
        for (var i = 0; i < list.length; i++) {
            var n = list[i];
            if (!n) continue;
            out.push(n);
            if (n.subgraph) walkNodes(n.subgraph, out, seen);
        }
    }

    function browserNodes() {
        var out = [];
        var all = [];
        walkNodes(app.rootGraph || app.graph, all, new Set());
        for (var i = 0; i < all.length; i++) {
            if (TARGET[nodeClass(all[i])]) out.push(all[i]);
        }
        return out;
    }

    function widgetMap(n) {
        var map = {};
        var ws = n.widgets || [];
        for (var i = 0; i < ws.length; i++) {
            var w = ws[i];
            if (w && w.name) map[w.name] = w;
        }
        return map;
    }

    function freezeVal(v) {
        if (typeof v === "string" || v == null) return v;
        try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
    }

    function captureLive() {
        var snap = {};
        var nodes = browserNodes();
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            var rec = {};
            var wm = widgetMap(n);
            var has = false;
            for (var k = 0; k < KEYS.length; k++) {
                var name = KEYS[k];
                if (wm[name]) {
                    rec[name] = freezeVal(wm[name].value);
                    has = true;
                }
            }
            if (has) snap[String(n.id)] = rec;
        }
        return snap;
    }

    function cloneSnap(snap) {
        var out = {};
        var ids = Object.keys(snap);
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            var rec = snap[id];
            var copy = {};
            for (var k in rec) {
                if (Object.prototype.hasOwnProperty.call(rec, k)) copy[k] = rec[k];
            }
            out[id] = copy;
        }
        return out;
    }

    function applySnap(snap) {
        if (!snap) return;
        var nodes = browserNodes();
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            var rec = snap[String(n.id)];
            if (!rec) continue;
            var wm = widgetMap(n);
            for (var k = 0; k < KEYS.length; k++) {
                var name = KEYS[k];
                if (wm[name] && Object.prototype.hasOwnProperty.call(rec, name)) {
                    wm[name].value = rec[name];
                }
            }
        }
    }

    function restoreSelective(applied, backup) {
        if (!applied || !backup) return;
        var nodes = browserNodes();
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            var id = String(n.id);
            var rec = applied[id];
            var bak = backup[id];
            if (!rec || !bak) continue;
            var wm = widgetMap(n);
            for (var k = 0; k < KEYS.length; k++) {
                var name = KEYS[k];
                var w = wm[name];
                if (!w) continue;
                if (!Object.prototype.hasOwnProperty.call(rec, name)) continue;
                if (!Object.prototype.hasOwnProperty.call(bak, name)) continue;
                if (w.value === rec[name]) w.value = bak[name];
            }
        }
    }

    function outputEntry(output, id) {
        if (!output) return null;
        if (output[id]) return output[id];
        var num = Number(id);
        if (String(num) === id && output[num]) return output[num];
        var keys = Object.keys(output);
        var tail = ":" + id;
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (key === id || (key.length > tail.length && key.slice(-tail.length) === tail)) return output[key];
        }
        return null;
    }

    function patchOutput(result, snap) {
        var output = result && result.output;
        if (!output || !snap) return;
        var ids = Object.keys(snap);
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            var rec = snap[id];
            var entry = outputEntry(output, id);
            if (!entry || !entry.inputs) continue;
            for (var k = 0; k < KEYS.length; k++) {
                var name = KEYS[k];
                if (Object.prototype.hasOwnProperty.call(rec, name)) {
                    entry.inputs[name] = rec[name];
                }
            }
        }
    }

    function recFor(snap, execNode) {
        if (!snap || !execNode) return null;
        var keys = [];
        if (execNode.node && execNode.node.id != null) keys.push(String(execNode.node.id));
        if (execNode.id != null) {
            var id = String(execNode.id);
            keys.push(id);
            var cut = id.lastIndexOf(":");
            if (cut >= 0) keys.push(id.slice(cut + 1));
        }
        for (var i = 0; i < keys.length; i++) {
            if (snap[keys[i]]) return snap[keys[i]];
        }
        return null;
    }

    function armWidget(w) {
        if (!w || w.__animaSnapSerV >= SNAP_V) return;
        var prev = w.serializeValue;
        var name = w.name;
        w.serializeValue = async function (execNode) {
            var rec = recFor(activeSnap, execNode);
            if (rec && Object.prototype.hasOwnProperty.call(rec, name)) return rec[name];
            if (typeof prev === "function") return await prev.apply(this, arguments);
            return w.value;
        };
        w.__animaSnapSerV = SNAP_V;
    }

    function armAll() {
        var nodes = browserNodes();
        for (var i = 0; i < nodes.length; i++) {
            var wm = widgetMap(nodes[i]);
            for (var k = 0; k < KEYS.length; k++) {
                if (wm[KEYS[k]]) armWidget(wm[KEYS[k]]);
            }
        }
    }

    function getBatchCount(args) {
        var n;
        if (args.length >= 2 && (typeof args[1] === "number" || typeof args[1] === "string")) {
            n = Number(args[1]);
            if (isFinite(n) && n >= 1) return Math.floor(n);
        }
        var first = args[0];
        if (first && typeof first === "object" && first.batchCount != null) {
            n = Number(first.batchCount);
            if (isFinite(n) && n >= 1) return Math.floor(n);
        }
        return 1;
    }

    function install() {
        if (installed || app.__animaQueueSnapV >= SNAP_V) return;
        if (typeof app.queuePrompt !== "function" || typeof app.graphToPrompt !== "function") return;

        installed = true;
        app.__animaQueueSnapV = SNAP_V;

        var origQP = app.queuePrompt;
        app.queuePrompt = async function animaQueueSnapQP() {
            armAll();
            var batchCount = getBatchCount(arguments);
            var snap = captureLive();
            for (var i = 0; i < batchCount; i++) snaps.push(cloneSnap(snap));
            depth++;
            try {
                return await origQP.apply(this, arguments);
            } finally {
                depth--;
                if (depth === 0) snaps.length = 0;
            }
        };

        var origG2P = app.graphToPrompt;
        app.graphToPrompt = async function animaQueueSnapG2P() {
            var applied = null;
            var backup = null;
            var prevSnap = activeSnap;
            if (depth > 0 && snaps.length) {
                applied = snaps.pop();
                activeSnap = applied;
                backup = captureLive();
                applySnap(applied);
            }
            try {
                var result = await origG2P.apply(this, arguments);
                if (applied) patchOutput(result, applied);
                return result;
            } finally {
                activeSnap = prevSnap;
                if (applied && backup) restoreSelective(applied, backup);
            }
        };

        console.log("[Anima] queue snapshot v" + SNAP_V + " ready");
    }

    if (typeof app.queuePrompt === "function" && typeof app.graphToPrompt === "function") {
        install();
    } else {
        var timer = setInterval(function () {
            if (typeof app.queuePrompt === "function" && typeof app.graphToPrompt === "function") {
                clearInterval(timer);
                install();
            }
        }, 50);
        setTimeout(function () { clearInterval(timer); }, 15000);
    }

    try {
        app.registerExtension({
            name: "anima.queue_snapshot",
            setup: function () { install(); }
        });
    } catch (e) {}
})();
