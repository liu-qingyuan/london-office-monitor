"""Private local JSON durability shared by consent and intake, without a database."""
from __future__ import annotations

import json
import os
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4


@contextmanager
def file_lock(path: Path):
    """One process-shared lock across read/replace on POSIX and native Windows."""
    if path.is_symlink():
        raise ValueError("State lock must not be a symbolic link")
    with path.open("a+b") as lock:
        if os.name == "nt":
            import msvcrt
            if lock.tell() == 0:
                lock.write(b"\0")
                lock.flush()
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
            try:
                yield
            finally:
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)


def atomic_json(path: Path, data):
    """Readers see the complete old or new UTF-8 JSON, never a partial document."""
    temporary = path.with_name(path.name + "." + uuid4().hex + ".tmp")
    try:
        with temporary.open("x", encoding="utf-8") as output:
            json.dump(data, output, ensure_ascii=False, indent=2, allow_nan=False)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
