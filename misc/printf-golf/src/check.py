#!/usr/bin/env python3

import sys
import base64
import ctypes
import hashlib
import subprocess

# sha256sum target.txt
TARGET_SHA256 = "d4f2eae11528030cb4fe09676f8befd4831c447929d24acfa348a207ffb2bcb4"

def _disable_aslr():
    libc = ctypes.CDLL("libc.so.6", use_errno=True)
    cur = libc.personality(0xffffffff)
    libc.personality(cur | 0x00040000)

inp = base64.b64decode(input("solution (base64): "))
proc = subprocess.Popen(
    ["./printf_golf"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    preexec_fn=_disable_aslr,
)

try:
    stdout, stderr = proc.communicate(inp, timeout=1)
except subprocess.TimeoutExpired:
    proc.kill()
    proc.communicate()
    print("timed out")
    exit(1)

sys.stderr.buffer.write(stdout)
if stderr:
    sys.stderr.buffer.write(stderr)

if proc.returncode != 0:
    print(f"exited with {proc.returncode}")
    exit(1)

if hashlib.sha256(stdout).hexdigest() != TARGET_SHA256:
    print("incorrect")
    exit(1)

print(f"ok: {len(inp)}")
exit(0)
