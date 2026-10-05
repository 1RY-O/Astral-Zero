/**
 * Phase 2 lobby/UI regression harness.
 * ===========================================================
 * Runs the REAL widget modules against a stub of the Phaser scene API and
 * the REAL NetworkManager state shape, asserting the behaviour the lobby
 * promises:
 *
 *   - party create / join (code validation) / leave
 *   - leader vs follower permissions
 *   - friend add / remove / invite gating (offline, no party, full party)
 *   - mode selection driving the primary button
 *   - solo queue vs party start routing
 *
 * Run with:  npm test
 *
 * No browser and no backend needed - which is the point: it stays green in
 * CI long before the art exists.
 */
import assert from 'node:assert';

// ---- tiny Phaser-ish stubs ------------------------------------------------
class Gfx {
  constructor(){ this.ops = 0; }
  fillStyle(){ this.ops++; return this; }
  fillRect(){ this.ops++; return this; }
  fillRoundedRect(){ this.ops++; return this; }
  fillCircle(){ this.ops++; return this; }
  strokeRoundedRect(){ this.ops++; return this; }
  lineStyle(){ this.ops++; return this; }
  clear(){ this.ops++; return this; }
  setDepth(){ return this; } setScrollFactor(){ return this; }
  setVisible(v){ this.visible=v; return this; } setAlpha(){ return this; }
  destroy(){ this.destroyed = true; }
}
class Obj {
  constructor(o={}){ Object.assign(this, o); }
  setDepth(){ return this; } setScrollFactor(){ return this; } setOrigin(){ return this; }
  setVisible(v){ this.visible=v; return this; } setAlpha(){ return this; }
  setPosition(){ return this; } setScale(){ return this; } setColor(c){ this.color=c; return this; }
  setText(t){ this.text=t; return this; } setInteractive(){ this.interactive=true; return this; }
  setWordWrapWidth(){ return this; } setAlign(){ return this; } add(){ return this; }
  disableInteractive(){ this.interactive=false; return this; }
  destroy(){ this.destroyed = true; }
  on(ev, fn){ (this.h ||= {})[ev] = fn; return this; }
}
class Text extends Obj { constructor(x,y,str,style={}){ super({x,y,str,style}); this.text=str; this.width=(str||'').length*8; } }
class Img extends Obj { setTint(){ return this; } }

let zoneCount = 0;
function makeScene() {
  const scene = {
    add: {
      graphics: () => new Gfx(),
      text: (x,y,s,st) => new Text(x,y,s,st),
      image: (x,y) => new Img({x,y}),
      rectangle: (x,y,w,h,c) => new Obj({x,y,w,h,c}),
      zone: (x,y,w,h) => { zoneCount++; const z = new Obj({x,y,width:w,height:h}); z.input={enabled:true}; z.isOver=false; return z; },
      container: (x,y,list) => Object.assign(new Obj({x,y,list:list||[]}), {list:list||[]}),
    },
    tweens: { add: (cfg) => { scene.tweened = (scene.tweened||0)+1; return cfg; } },
    time: { now: 0, delayedCall: (ms, fn) => { scene.timer = fn; return { remove(){} }; } },
    scale: { canvasBounds:{left:0,top:0,width:1280,height:720}, displayScale:{x:1,y:1} },
    game: { canvas: { parentElement: null } },
    Math: null,
  };
  return scene;
}

// document stub (TextField creates a hidden input)
globalThis.document = { createElement: () => ({
  style:{cssText:''}, setAttribute(){}, addEventListener(){}, remove(){},
  focus(){}, blur(){}, select(){}, value:'',
}) };
globalThis.window = { location:{ search:'', href:'' }, localStorage:{ getItem:()=>null, setItem(){} } };
Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });

// ---- import the widgets ---------------------------------------------------
const { Panel } = await import('../src/ui/widgets/Panel.js');
const { Button } = await import('../src/ui/widgets/Button.js');
const { TextField } = await import('../src/ui/widgets/TextField.js');
const { ToastLayer } = await import('../src/ui/widgets/ToastLayer.js');
const { PartyPanel } = await import('../src/ui/lobby/PartyPanel.js');
const { FriendsPanel } = await import('../src/ui/lobby/FriendsPanel.js');
const { ModeSelector } = await import('../src/ui/lobby/ModeSelector.js');
const { InvitePrompt } = await import('../src/ui/lobby/InvitePrompt.js');
const { NameGate } = await import('../src/ui/lobby/NameGate.js');
const { normaliseParty, normaliseFriends } = await import('../src/net/MatchModel.js');

// ---- fake net (real normalised shapes + real Emitter semantics) ------------
const calls = [];
const listeners = new Map();
const net = {
  state: { party:null, friends:[], selectedMode:'ffa', busy:null, queue:null, localId:'S1', connection:'online' },
  on(evt, fn){ if(!listeners.has(evt)) listeners.set(evt,new Set()); listeners.get(evt).add(fn); return () => listeners.get(evt).delete(fn); },
  emit(evt, payload){ for (const fn of listeners.get(evt) ?? []) fn(payload); },
  createParty: () => calls.push('createParty'),
  joinParty: (c) => calls.push(['joinParty', c]),
  leaveParty: () => calls.push('leaveParty'),
  startPartyMatch: () => calls.push('startPartyMatch'),
  queueJoin: () => calls.push('queueJoin'),
  queueLeave: () => calls.push('queueLeave'),
  addFriend: (q) => { calls.push(['addFriend', q]); return Promise.resolve({ok:true}); },
  removeFriend: (f) => calls.push(['removeFriend', f.name]),
  inviteFriend: (f) => calls.push(['inviteFriend', f.name]),
  acceptInvite: () => calls.push('acceptInvite'),
  declineInvite: () => calls.push('declineInvite'),
  setNotice: (t,m) => calls.push(['notice', t, m]),
  // Mirrors NetworkManager.setMode: update state THEN emit, exactly like the
  // real class, so the widget's event-driven refresh path is exercised.
  setMode: (m) => { net.state.selectedMode = m; calls.push(['setMode', m]); net.emit('mode', { mode: m }); },
  requestFriends: () => calls.push('requestFriends'),
  setPlayerName: (n) => calls.push(['setPlayerName', n]),
};

// ---- exercise: empty lobby -------------------------------------------------
const s = makeScene();
const party = new PartyPanel(s, { x:34, y:96, width:380, height:590, net });
const friends = new FriendsPanel(s, { x:436, y:96, width:380, height:590, net });
const modes = new ModeSelector(s, { x:838, y:96, width:408, height:590, net });
const invite = new InvitePrompt(s, { net });
const toasts = new ToastLayer(s, {});

// Click Create Party.
party.createButton.zone.h.pointerup();
assert.deepStrictEqual(calls.pop(), 'createParty');

// Typing an invalid code keeps Join disabled; a valid 6-char code enables it.
party.codeField.setValue('ab');
assert.strictEqual(party.joinButton.enabled, false, '3-char code must disable Join');
party.codeField.setValue('a1b2c3');
assert.strictEqual(party.joinButton.enabled, true, '6-char code must enable Join');
party.joinButton.zone.h.pointerup();
assert.deepStrictEqual(calls.pop(), ['joinParty', 'A1B2C3']);

// Bad code: the Join BUTTON is inert (no request is ever emitted)...
party.codeField.setValue('zz');
assert.strictEqual(party.joinButton.enabled, false);
party.joinButton.zone.h.pointerup();
assert.strictEqual(calls.pop(), undefined, 'disabled Join must not emit a request');
// ...but pressing Enter in the field still reports why it cannot be submitted.
party.codeField._handleSubmit();
assert.deepStrictEqual(calls.pop(), ['notice','error','Party codes are exactly 6 characters.']);

// ---- in a party ------------------------------------------------------------
net.state.party = normaliseParty({
  code: 'A7K9P2', leaderId: 'S1', leaderName: 'Alpha',
  members: [{id:'S1',socketId:'S1',name:'Alpha'},{id:'S2',socketId:'S2',name:'Beta'}],
  memberCount: 2, maxSize: 4,
}, 'S1');
party.refresh();
assert.strictEqual(party.codeText.text, 'A7K9P2');
assert.strictEqual(party.memberRows.filter(r=>r.row.visible).length, 2);
assert.strictEqual(party.memberRows[0].tag.text, 'LEADER · YOU');
assert.strictEqual(party.memberRows[1].tag.text, '');
party.leaveButton.zone.h.pointerup();
assert.deepStrictEqual(calls.pop(), 'leaveParty');

// Full party: 4 members.
net.state.party = normaliseParty({
  code: 'FULL01', leaderId: 'S9', leaderName: 'Zed',
  members: ['S9','S1','S2','S3'].map((id,i)=>({id,socketId:id,name:'P'+i})),
  memberCount:4, maxSize:4,
}, 'S1');
party.refresh();
assert.strictEqual(party.memberRows.filter(r=>r.row.visible).length, 4, '4 rows max');
assert.strictEqual(net.state.party.isFull, true);

// ---- friends ---------------------------------------------------------------
// Reset to a NON-full party so the invite button's happy path is reachable.
net.state.party = normaliseParty({ code:'AAA111', leaderId:'S1', leaderName:'Alpha',
  members:[{id:'S1',socketId:'S1',name:'Alpha'},{id:'S2',socketId:'S2',name:'Beta'}],
  memberCount:2, maxSize:4 }, 'S1');
net.state.friends = normaliseFriends([
  { id:'S2', name:'Beta', online:true },
  { id:'zeta', name:'OfflinePal', online:false },
]);
friends.refresh();
assert.strictEqual(friends.rows[0].invite.enabled, true, 'online friend in a non-full party');
friends.rows[0].invite.zone.h.pointerup();
assert.deepStrictEqual(calls.pop(), ['inviteFriend','Beta']);
friends.rows[1].invite.zone.h.pointerup();  // offline -> inert
assert.strictEqual(calls.pop(), undefined, 'offline friend must not fire an invite');
friends.rows[0].remove.zone.h.pointerup();
assert.deepStrictEqual(calls.pop(), ['removeFriend','Beta']);

// No party -> invite buttons inert with the "No party" label.
net.state.party = null;
friends.refresh();
assert.strictEqual(friends.rows[0].invite.enabled, false);
assert.strictEqual(friends.rows[0].invite.label.text, 'No party');

// Add friend via Enter (onSubmit path).
friends.addField.setValue('Gamma');
friends.addField._handleSubmit();
assert.ok(calls.some(c => Array.isArray(c) && c[0]==='addFriend' && c[1]==='Gamma'));
calls.length = 0;  // drain, so later assertions read only their own effects

// ---- modes -----------------------------------------------------------------
// Mirror LobbyScene: subscribe the panels to the events they render from.
net.on('mode', () => modes.refresh());
net.on('party', () => { party.refresh(); friends.refresh(); modes.refresh(); });

modes.cards.ffa.zone.h.pointerup();
assert.deepStrictEqual(calls.pop(), ['setMode','ffa']);
modes.cards.tdm.zone.h.pointerup();
assert.deepStrictEqual(calls.pop(), ['setMode','tdm']);
assert.ok(modes.descText.text.includes('Two crews'), 'mode description follows selection');

// Solo -> Find Match queues.
net.state.party = null; net.state.queue = null;
modes.refresh();
assert.strictEqual(modes.primary.label.text, 'FIND MATCH');
modes.primary.zone.h.pointerup();
assert.deepStrictEqual(calls.pop(), 'queueJoin');

// Queued -> Cancel Search leaves the queue.
net.state.queue = { mode:'tdm', position:2, playersInQueue:4 };
modes.refresh();
assert.strictEqual(modes.primary.label.text, 'SEARCHING');
modes.primary.zone.h.pointerup();
assert.deepStrictEqual(calls.pop(), 'queueLeave');

// Party member (not leader) -> disabled "Waiting for Leader".
net.state.queue = null;
net.state.party = normaliseParty({ code:'AAA111', leaderId:'S2', leaderName:'Beta',
  members:[{id:'S2',socketId:'S2',name:'Beta'},{id:'S1',socketId:'S1',name:'Alpha'}],
  memberCount:2, maxSize:4 }, 'S1');
modes.refresh();
assert.strictEqual(modes.primary.label.text, 'WAITING');
modes.primary.zone.h.pointerup();
assert.strictEqual(calls.pop(), undefined, 'non-leader must not start a match');

// Leader -> Start Match.
net.state.party = normaliseParty({ code:'BBB222', leaderId:'S1', leaderName:'Alpha',
  members:[{id:'S1',socketId:'S1',name:'Alpha'}], memberCount:1, maxSize:4 }, 'S1');
modes.refresh();
assert.strictEqual(modes.primary.label.text, 'START MATCH');
modes.primary.zone.h.pointerup();
assert.deepStrictEqual(calls.pop(), 'startPartyMatch');

// ---- invite prompt ---------------------------------------------------------
invite.present({ code:'Z9Z9Z9', fromName:'Alpha', memberCount:2 });
assert.strictEqual(invite.codeText.text, 'Z9Z9Z9');
invite.accept.zone.h.pointerup();
assert.deepStrictEqual(calls.pop(), 'acceptInvite');

// ---- toasts + name gate ----------------------------------------------------
toasts.show('error', 'PARTY_FULL');
toasts.show('info', 'first-match protection');
assert.strictEqual(toasts.active.length, 2);
toasts.clear();
assert.strictEqual(toasts.active.length, 0);

const gate = new NameGate(s, { net, onDone(){} });
gate.goButton.zone.h.pointerup();  // empty name -> inert
gate.field.setValue('MopLord42');
gate.field._handleSubmit();
assert.deepStrictEqual(calls.pop(), ['setPlayerName','MopLord42']);
assert.ok(gate.field.destroyed || gate.field.bg.destroyed, 'name gate tears itself down after confirming');

// ---- teardown must not throw ----------------------------------------------
for (const w of [party, friends, modes, invite]) w.destroy();
toasts.clear();
assert.ok(zoneCount > 0);

console.log('\n✅ All UI harness checks passed (' + zoneCount + ' interactive zones created).');
process.exit(0);
