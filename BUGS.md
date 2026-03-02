# Bug List & Known Issues

## 🔴 Critical
_(none)_

## 🟡 Medium
1. **Agent contention on concurrent talk** — When two LLM calls hit the same pet agent within ~3s, the second may return empty/undefined. Workaround: 5s delay between conversations targeting the same pet.
2. **Plaza landscape mode blocks nav** — Screen Orientation API can lock to landscape in headless browsers, hiding nav buttons. Workaround: force-click or use `navTo()` helper.

## 🟢 Low / Cosmetic
3. **Regex term detection false positive** — "新词叫" detected as a term when it's part of the sentence structure. Filter list needs expansion.
4. **Economy: wallets only created on first work** — Pets that never worked don't appear in wallet rankings (have implicit 100💰 but no wallet row).
5. **Social graph empty for non-interacting pets** — Pets with no conversations show as isolated nodes with no edges (correct behavior, but could show suggested connections).
6. **CivDashboard guild member count** — Shows "1人" even after joins because the list query doesn't re-fetch after join.

## ✅ Fixed (this session)
- Language detection LLM conflict → switched to regex-based detection
- `current_location` column name mismatch → fixed to `location`
- `relationship_level` → `type`, `from_id` → `from_pet_id` in SQL queries
- `@types/ws` missing for world-events.ts
