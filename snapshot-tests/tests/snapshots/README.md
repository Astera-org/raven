# Snapshot directory

Captured response snapshots live here, organized as:

```
<group>/<case-slug>.json
```

These files are the regression baseline -- treat updates as substantive
changes in code review. To intentionally regenerate snapshots:

```sh
pnpm test:update        # forwards -u to vitest; updates only mismatched snapshots
```
