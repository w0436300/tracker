#!/usr/bin/env python3
from pathlib import Path
import getpass, hashlib, re, sys

path = Path(__file__).with_name("config.js")
if not path.exists():
    sys.exit("config.js not found.")

p1 = getpass.getpass("New password: ")
p2 = getpass.getpass("Repeat password: ")
if not p1:
    sys.exit("Password cannot be empty.")
if p1 != p2:
    sys.exit("Passwords do not match.")

digest = hashlib.sha256(p1.encode("utf-8")).hexdigest()
text = path.read_text(encoding="utf-8")
new = re.sub(r'passwordHash:\s*"[0-9a-f]+"', f'passwordHash: "{digest}"', text)
path.write_text(new, encoding="utf-8")
print("Password hash updated in config.js. Commit and push the file.")
