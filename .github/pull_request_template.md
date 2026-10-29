## Summary

<!-- What changes and why. Link the ADR when the change is architectural. -->

## Type of change

- [ ] feat
- [ ] fix
- [ ] docs
- [ ] chore / refactor / test

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm test` and `npm run arch:check` pass
- [ ] British English everywhere except code comments, which are written in Spanish
- [ ] Database access only through stored procedures; no inline SQL; no floating-point money
- [ ] Applied migrations (`V####`) were not edited; changed objects (`R####`) bumped their header version
- [ ] Tests added or updated (unit, integration, concurrency or tSQLt as appropriate)
- [ ] `docs/progress/STATUS.md` updated
