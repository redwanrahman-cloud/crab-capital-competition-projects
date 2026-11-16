# Test Evidence Trail in five minutes

Use the README installation commands, then open http://127.0.0.1:8765/ in a current browser. Use a new store name for a fresh example; retain the same name when checking persistence. Stop the server with Ctrl+C before reopening that store.

1. Inspect Source A's 12 ms text and the supporting quote below. Source B's 21 ms quote contradicts C1; the app preserves both.
2. On Source A, click **Try synthetic change: 12 → 24 ms**, then **Save new revision**.
3. The impact section should list four affected nodes: C1, C2, D1 and D2. Follow A → C1 → C2 → D1. C3 and D3 remain unrelated. Expand **Inspect the actual Relate traversal** to see the query executed by the embedded engine.
4. On D1, enter a short note and click **Record human review**. D1 should say **Human reviewed current revisions**; D2 should still say **Needs review**.
5. Change Source A to `Synthetic cache evaluation: median latency was 30 ms.` and save. D1 should need review again. Under **Human review history**, expand **Exact source revisions acknowledged**: the earlier acknowledgment must still show 24 ms, while the current source shows 30 ms.
6. Stop and restart the server with the same store. Revisions, quotes and the historical acknowledgment should remain.

Expected interpretation: a source revision changed, so dependent claims and decisions need another look. The app never proves a claim false or silently changes a judgment. The graph and all content are synthetic. Reviews are local acknowledgments without authenticated identity; any source revision invalidates the current acknowledgment. Traversal is capped at eight hops.

Automated check: `.\.venv\Scripts\python.exe .\test_app.py` should report five tests passing. This checks actual Relate persistence/traversal and a temporary loopback HTTP server. It is separate from the manual browser walkthrough above. No external service, paid data, or credentials are needed.
