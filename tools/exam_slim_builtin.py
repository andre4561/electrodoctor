# SPDX-License-Identifier: AGPL-3.0-or-later
# Устарело: повторный прогон ломал уже укороченный BUILTIN.
# Собирать каркас так: python tools/exam_recover_descs.py && python tools/exam_write_ts.py
from __future__ import annotations

import sys

print(
    "exam_slim_builtin.py больше не трогает exams.ts.\n"
    "Восстановление/сборка: python tools/exam_recover_descs.py && python tools/exam_write_ts.py",
    file=sys.stderr,
)
sys.exit(2)
