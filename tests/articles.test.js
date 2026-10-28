// SPDX-License-Identifier: AGPL-3.0-or-later
// Ссылки «название анализа → статья»: каждая ведёт на существующий файл в docs/articles/lab-tests/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { LAB_ARTICLES, articleUrl } from "../docs/app/articles.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
test("статьи для анализов существуют", () => {
  for (const [code, name] of Object.entries(LAB_ARTICLES)) {
    assert.ok(existsSync(join(ROOT, "docs/articles/lab-tests", name + ".md")), code + " → " + name);
    assert.ok(articleUrl(code).endsWith(".html"));
  }
});
