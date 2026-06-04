# Persistence Plan

## Problem

The relay currently stores:

- live sessions in `relay/src/session.js`
- Peek view links in `relay/src/viewStore.js`

Both are in-memory only. That means:

- process restarts drop active state
- multi-instance scaling is unsafe without sticky routing
- abuse resilience is limited by one process memory budget

## Target state

Move session and view metadata into a shared store such as Redis while keeping encrypted payload handling temporary and bounded.

## Phase 1

- Introduce a storage interface for sessions:
  - `createSession`
  - `getSession`
  - `updateSession`
  - `killSession`
  - `lookupSessionByCode`
- Introduce a storage interface for Peek views:
  - `createView`
  - `getView`
  - `deleteView`
  - `validateUploadToken`
- Keep the existing in-memory implementation as the default fallback.

## Phase 2

- Add Redis-backed implementations.
- Store only:
  - ids
  - tokens
  - expiries
  - socket ownership metadata
  - Peek metadata
- Keep encrypted payload size bounded and TTL-controlled.

Status:

- Redis-backed session and Peek view adapters are now scaffolded behind `REDIS_URL`.
- In-memory storage remains the safe fallback when Redis is not configured or unavailable at boot.

## Phase 3

- Update relay WebSocket/session code to use the storage interface instead of direct module state.
- Add integration tests that run against the in-memory adapter first.

Status:

- Relay/session/view access is now promise-compatible so async backends can be used without another API break.

## Operational goals

- relay restarts should not orphan valid sessions immediately
- more than one relay instance should be deployable safely
- expiry cleanup should rely on TTL semantics where possible
