#!/usr/bin/env python3

"""
https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging
"""

import re
import struct
import subprocess
import sys

_ANSI_RE = re.compile(rb"\x1b\[[0-?]*[ -/]*[@-~]")


def main() -> None:
    raw_len = sys.stdin.buffer.read(4)
    if len(raw_len) < 4:
        return
    msg_len = struct.unpack("<I", raw_len)[0]
    if msg_len > 1_048_576:
        return
    raw_msg = sys.stdin.buffer.read(msg_len)

    try:
        proc = subprocess.run(
            ["pwsh", "-NoProfile", "-NoLogo", "-Command", "-"],
            input=raw_len + raw_msg,
            capture_output=True,
            timeout=15,
        )
        raw_output = proc.stdout
    except Exception:
        return

    sys.stdout.buffer.write(_ANSI_RE.sub(b"", raw_output))
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    main()
