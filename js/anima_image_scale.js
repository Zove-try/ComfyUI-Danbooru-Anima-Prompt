import { app } from "/scripts/app.js";

function sideFromOld(value) {
    var s = String(value == null ? "" : value).trim().toLowerCase();
    if (s === "最短边" || s === "缩放至最短边" || s === "shortest" || s === "short") return "最短边";
    if (s === "最长边" || s === "缩放至最长边" || s === "longest" || s === "long") return "最长边";
    return "";
}

function lengthFrom(value) {
    var n = parseInt(value, 10);
    if (!isFinite(n) || n < 4) return 1024;
    return n;
}

function migratedValues(info) {
    var vals = info && info.widgets_values;
    if (Array.isArray(vals) && vals.length >= 8) {
        return {
            mode: sideFromOld(vals[6]) || "最长边",
            length: lengthFrom(vals[7]),
            legacy: true
        };
    }
    if (Array.isArray(vals) && vals.length >= 2 && vals.length < 8) {
        var current = sideFromOld(vals[0]);
        if (current && String(vals[0]) !== current) {
            return { mode: current, length: lengthFrom(vals[1]), legacy: true };
        }
    }
    if (vals && !Array.isArray(vals) && typeof vals === "object") {
        var mode = sideFromOld(vals["缩放至"] || vals["缩放方式"] || vals["缩放至边"] || vals.scale_to_side);
        var length = vals["缩放至长度"] != null ? vals["缩放至长度"] : vals.scale_to_length;
        if (mode || length != null) {
            return { mode: mode || "最长边", length: lengthFrom(length), legacy: false };
        }
    }
    return null;
}

function applyValues(node, picked) {
    var widgets = (node && node.widgets) || [];
    for (var i = 0; i < widgets.length; i++) {
        if (widgets[i].name === "缩放至") widgets[i].value = picked.mode;
        if (widgets[i].name === "缩放至长度") widgets[i].value = picked.length;
    }
}

app.registerExtension({
    name: "anima.imageScale",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData || nodeData.name !== "AnimaImageScaleByAspectRatio") return;
        if (nodeType.prototype._animaScaleHooked) return;
        nodeType.prototype._animaScaleHooked = true;
        var prev = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            if (this._animaScaleConfiguring) return;
            this._animaScaleConfiguring = true;
            try {
                var picked = migratedValues(info);
                if (picked && picked.legacy && info) info.widgets_values = [picked.mode, picked.length];
                var r = (typeof prev === "function" && prev !== nodeType.prototype.onConfigure)
                    ? prev.apply(this, arguments) : undefined;
                if (picked) applyValues(this, picked);
                return r;
            } finally {
                this._animaScaleConfiguring = false;
            }
        };
    }
});
