"""URL of this plugin's web folder.

Manager installs the pack under the name in pyproject.toml
(danbooru-anima-prompt). A manual clone keeps the GitHub folder name.
The static route uses whichever directory name is actually on disk.
"""
import os


def extension_static_url(filename):
    here = os.path.normcase(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "js")))
    names = []
    try:
        import nodes
        dirs = getattr(nodes, "EXTENSION_WEB_DIRS", {}) or {}
        for name, directory in dirs.items():
            try:
                if os.path.normcase(os.path.abspath(directory)) == here:
                    names.append(str(name))
            except Exception:
                continue
    except Exception:
        pass
    name = names[0] if names else "danbooru-anima-prompt"
    filename = str(filename or "").lstrip("/")
    return "/extensions/" + name + "/" + filename
