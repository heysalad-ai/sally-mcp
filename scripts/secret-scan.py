"""Scan publishable text only. Never print matching secret values."""
import pathlib,re,sys,subprocess
root=pathlib.Path(__file__).resolve().parents[1]
patterns=[r'(?i)(?:sk-(?:proj-)?[a-z0-9_-]{24,}|gh[pousr]_[a-z0-9]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)',r'eyJ[a-zA-Z0-9_-]{12,}\.[a-zA-Z0-9_-]{12,}\.[a-zA-Z0-9_-]{12,}']
found=[]
try:
 tracked=subprocess.check_output(['git','ls-files'],cwd=root,text=True).splitlines()
 for name in tracked:
  leaf=pathlib.Path(name).name
  if (leaf.startswith(('.env','.dev.vars')) and not leaf.endswith('.example')) or pathlib.Path(name).suffix in ('.onnx','.npy') or leaf in ('tokenizer.json','tokenizer_config.json'):found.append(name)
except subprocess.CalledProcessError:pass

for path in root.rglob('*'):
 if not path.is_file() or any(p in ('node_modules','.next','.vercel','.git','.wrangler','dist','test-results','playwright-report','.venv-nano','__pycache__') for p in path.relative_to(root).parts) or path.name.startswith(('.env','.dev.vars')) or path.suffix in ('.png','.jpg','.zip','.woff2'):continue
 try:text=path.read_text()
 except UnicodeError:continue
 if any(re.search(pattern,text) for pattern in patterns):found.append(str(path.relative_to(root)))
if found:
 print('Potential secrets in: '+', '.join(found));sys.exit(1)
print('PASS: publishable files contain no credential-pattern matches; ignored local secrets excluded.')
