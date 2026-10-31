"""Build a private ChatGPT workspace package referencing its registered MCP app.

The public directory package keeps its remote mcp.json; registered app references
are for local/workspace installation and are excluded from public submission.
"""
import argparse
import json
from pathlib import Path
import re
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("app_id", help="Registered asdk_app_ ID (not a credential)")
parser.add_argument("--version", default="0.1.2")
args = parser.parse_args()
if not re.fullmatch(r"asdk_app_[A-Za-z0-9_-]+", args.app_id):
    parser.error("Expected a registered asdk_app_ identifier")
if not re.fullmatch(r"\d+\.\d+\.\d+", args.version):
    parser.error("Expected a semantic package version")
root = Path(__file__).resolve().parents[1]
plugin = root / "plugin"
output = root / "submission/sally-workspace-plugin.zip"
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(plugin.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(plugin).as_posix()
        if relative in ("mcp.json", ".mcp.json"):
            continue
        if relative in ("plugin.json", ".codex-plugin/plugin.json"):
            manifest = json.loads(path.read_text())
            manifest["version"] = args.version
            manifest.pop("mcpServers", None)
            if relative == "plugin.json":
                manifest["extensions"]["com.openai"]["apps"] = "./.app.json"
            else:
                manifest["apps"] = "./.app.json"
            archive.writestr(relative, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        else:
            archive.write(path, relative)
    archive.writestr(".app.json", json.dumps({"apps": {"sally": {"id": args.app_id, "required": True}}}, indent=2) + "\n")
print(f"Prepared {output.name}: registered Sally connection, skill and branding; private workspace use only.")
