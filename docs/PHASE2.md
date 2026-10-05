# Astral Zero — Phase 2 Frontend Walkthrough

> Lobby UI · Party · Friends · Match Entry · Arsenal-style camera
> Frontend-only work. No backend files were modified.

---

## 1. What Phase 2 delivers

| # | Feature | Where |
| --- | --- | --- |
| 1 | SocketClient + NetworkManager, party create/join/leave | `src/net/` |
| 2 | Lobby UI (code, member list, mode selection) | `src/scenes/LobbyScene.js`, `src/ui/lobby/` |
| 3 | Friends list + one-click invite | `src/ui/lobby/FriendsPanel.js` |
| 4 | Lobby → Arena transition on match-ready | `src/scenes/LobbyScene.js` (`net.on('match-ready')`) |
| 5 | Bots rendered correctly per mode/team | `src/entities/RemoteActor.js` |
| ★ | Arsenal-style over-the-shoulder camera | `src/camera/ThirdPersonCamera.js` |

---

## 2. Architecture — the one rule that matters

```
Scenes  ──read──▶  NetworkManager.state  ◀──normalised──  SocketClient  ──▶  backend
   │                     │                                    │
   └──call intents──▶    └──emits typed events────────────▶    └──only file
                          ('party','friends','queue',…)          that imports
                                                                 socket.io-client
```

**Scenes never import the socket, and never build state themselves.** Every
value on screen is either (a) a normalised server payload or (b) local UI state
like "which mode card is selected". That is why two browsers in one party always
agree without extra round-trips: both are rendering the same `party_update`.

`MatchModel.js` holds every payload normaliser and imports no network code and no
Phaser, which is what makes the whole thing testable in plain Node.

---

## 3. Socket events used

Contract `1.1.0-phase2`. Client-side names live in `src/net/events.js`.

| Direction | Event | Used for |
| --- | --- | --- |
| C→S | `player_join` | Announce identity (keys friends + first-match protection) |
| C→S | `friend_add` / `friend_remove` / `friend_list` | Friends panel |
| C→S | `party_create` / `party_join` / `party_leave` | Party panel |
| C→S | `party_start_match` | Leader's "Start Match" |
| C→S | `party_invite` | "Invite" next to each friend |
| C→S | `queue_join` / `queue_leave` | Solo "Find Match" / "Cancel Search" |
| C→S | `room_leave` | "Leave" in the HUD |
| C→S | `player_move` | Throttled position relay at 20 Hz |
| S→C | `connected` | Contract-version handshake |
| S→C | `error_event` | Uniform `{ code, message }` → toast |
| S→C | `party_update` | Live member list (pushed to every member) |
| S→C | `party_invited` | Incoming invite prompt |
| S→C | `friend_update` | Friends list |
| S→C | `queue_update` | "Searching… position N" |
| S→C | `match_found` | "Match found — loading arena…" |
| S→C | `room_joined` | ★ **The spawn manifest** (humans + bots) |
| S→C | `room_update` | Someone left the room |
| S→C | `match_state` | Countdown → playing → gameover → lobby |
| S→C | `match_end` | Results + return to lobby |

**Why `room_joined` and not `match_found`?** `match_found` only carries ids
(`roomId`, `mode`). `room_joined` carries the authoritative roster, so it is the
single event that can build the world. The NetworkManager treats `match_state`'s
roster as a defensive fallback in case the two are ever reordered.

---

## 4. The camera

Full rationale is in [`FRONTEND.md`](../FRONTEND.md#the-camera-phase-2). The two
things worth knowing:

1. **`baseZoom` is 1.22, not 1.0.** The gray-box arena is exactly the viewport
   size, so at zoom 1.0 Phaser clamps `scroll` to zero — the camera would freeze
   dead-centre and the whole over-the-shoulder framing would be dead code.
2. **`boundsPadding: 240`** adds invisible headroom around the arena so the
   anchor and aim lead still work when the player nears an edge.

Run `npm run test:camera` to see the guarantees asserted:

```
✅ player anchored at 32% of the view (Arsenal over-the-shoulder)
✅ player stayed visible across 600 frames of aim flicks (worst streak: 1 frames)
✅ zoom stayed within [0.95, 1.5]
✅ cursor lead moved the camera 317px right→left
```

---

## 5. UI design rules

- **Buttons are gated, not validated-after-the-fact.** "Join" is disabled below
  6 characters, "Start Match" is disabled for non-leaders, "Invite" is disabled
  when there is no party / the party is full / the friend is offline. The UI
  never sends a request the backend would only reject.
- **Rows are pooled.** Party members and friends are built once and reused, so a
  `party_update` push does not churn the display list.
- **Error wording lives in the network layer** (`describeError` in
  `src/net/events.js`), not in the panels. Toasts are the only place errors are
  rendered.
- **No art assets.** Every panel, button and name tag is drawn with Graphics and
  Text using `src/config/uiTheme.js`.

### Text input

Phaser cannot do real text entry, so `TextField` draws the box in Phaser and
routes typing through a single **hidden `<input>`** shared by every field in the
scene. That buys OS IME, paste, mobile keyboards and correct focus handling for
free, and it stops game keys (Space = jump) firing while typing a party code.

---

## 6. First-match protection

The backend forces brand-new players into `bot_practice` even when they pick
FFA/TDM, flagged as `firstMatchProtection: true` in the ack. The client never
fights this — it reports it:

```js
if (res.firstMatchProtection) {
  const { message } = describeProtection(res);
  // → "First-match protection: Bot Practice instead of Free-for-All."
  net.setNotice('info', message);
}
```

The arena then shows whatever mode actually started, so Bot Practice looks and
behaves like Bot Practice.

---

## 7. Manual test checklist

```bash
npm run dev:server   # terminal 1 — backend on :3000
npm run dev          # terminal 2 — game on :5173
```

| # | Steps | Expected |
| --- | --- | --- |
| 1 | Open the game | Name prompt → lobby, status pill turns **ONLINE** |
| 2 | "Create Party" | 6-char code appears, members `1/4`, "Start Match" enabled |
| 3 | Open a second browser, join with the code | Both show `2/4` live |
| 4 | Leader leaves | Second browser promotes to leader, "Start Match" enables |
| 5 | Add a friend by name | Appears in the list with a green dot |
| 6 | "Invite" next to an online friend | Friend gets the invite prompt; Accept joins |
| 7 | Invite an **offline** friend | Button reads "Offline" and is inert |
| 8 | 5th player tries to join | Server rejects with `PARTY_FULL` → toast |
| 9 | Pick TDM → "Start Match" | Cut to arena, cyan vs amber names, roster in HUD |
| 10 | Solo, pick FFA on a fresh name | Toast: "First-match protection: Bot Practice instead of Free-for-All." |
| 11 | Move the mouse | Camera leads toward the cursor; player stays visible |
| 12 | "Leave" in the HUD | Back to the lobby, party state restored |
| 13 | `?skipLobby` | Boots straight into the arena (no backend needed) |

---

## 8. Testing

| Command | Covers |
| --- | --- |
| `npm test` | Party/friends/mode behaviour, leader permissions, invite gating |
| `npm run test:camera` | Off-centre anchoring, visibility guarantee, zoom clamps, aim lead |
| `npm run test:all` | Both |

`tests/phaser-stub.mjs` lets the real game modules load in plain Node, so both
suites run without a browser or a backend.

---

## 9. Known limitations (Phase 3)

- **Bots stand still.** The server fills the roster but has no AI tick yet, so
  `RemoteActor` idles in place. Movement wiring is already in place — it needs
  a `bot_update` consumer.
- **Damage is not implemented.** The HUD shows the roster, not health bars.
- **`player_move` is broadcast but not applied.** The client relays its position
  at 20 Hz, but remote humans only move once Phase 3 adds server-side movement.
- **No reconnect recovery of a party.** `socket.id` changes on reconnect, so a
  dropped player must rejoin with the code (documented in the backend).
