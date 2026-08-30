<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { applyDemoAction, cleanCode, createDemoRoom, formatClock, hasReadyTeam, roleCopy } from './game';
  import type { Role, Room, ServerEvent } from './types';

  type Page = 'home' | 'demo' | 'host' | 'join' | 'privacy' | 'terms';
  type Connection = 'idle' | 'connecting' | 'online' | 'offline';

  let page: Page = routeFor(location.pathname, location.search);
  let socket: WebSocket | null = null;
  let connection: Connection = 'idle';
  let room: Room | null = page === 'demo' ? createDemoRoom() : null;
  let joinCode = cleanCode(new URLSearchParams(location.search).get('room') ?? '');
  let playerName = page === 'demo' ? '' : sessionStorage.getItem('controller-name') ?? '';
  let error = '';
  let notice = '';
  let qrSource = '';
  let qrFor = '';
  let isHost = false;
  let clientId = '';
  let reducedMotion = readSetting('reduced-motion', false, page === 'demo');
  let highContrast = readSetting('high-contrast', false, page === 'demo');
  let groundMarkers = readSetting('ground-markers', true, page === 'demo');
  let routeNotice = '';
  const buildId = (import.meta.env.VITE_BUILD_SHA || 'dev').slice(0, 12);

  $: me = room?.players.find((player) => player.id === clientId) ?? null;
  $: role = me?.role ?? null;
  $: joinUrl = room ? `${location.origin}/join?room=${room.code}` : '';
  $: if (room?.code && isHost && page !== 'demo') createQr(joinUrl);
  $: pageTitle = titleFor(page);

  onMount(() => {
    const pop = () => {
      closeSocket();
      activatePage(routeFor(location.pathname, location.search));
    };
    window.addEventListener('popstate', pop);
    if (page === 'host') connectHost();
    if (page === 'demo') connectDemo();
    return () => {
      window.removeEventListener('popstate', pop);
      closeSocket();
    };
  });

  function routeFor(path: string, search = ''): Page {
    if (path.startsWith('/demo') || new URLSearchParams(search).get('demo') === '1') return 'demo';
    if (path.startsWith('/host')) return 'host';
    if (path.startsWith('/join')) return 'join';
    if (path.startsWith('/privacy')) return 'privacy';
    if (path.startsWith('/terms')) return 'terms';
    return 'home';
  }

  function titleFor(target: Page): string {
    if (target === 'privacy') return 'Privacy — Co-op Boss Access';
    if (target === 'terms') return 'Terms — Co-op Boss Access';
    if (target === 'join') return 'Phone controller — Co-op Boss Access';
    if (target === 'host') return 'Host game — Co-op Boss Access';
    if (target === 'demo') return 'Demo — Co-op Boss Access';
    return 'Co-op Boss Access — beat a boss with phone controls';
  }

  function getClientId(): string {
    if (clientId) return clientId;
    const existing = localStorage.getItem('coop-client-id');
    if (existing) {
      clientId = existing;
      return clientId;
    }
    clientId = crypto.randomUUID();
    localStorage.setItem('coop-client-id', clientId);
    return clientId;
  }

  function navigate(next: Page, path: string): void {
    closeSocket();
    history.pushState({}, '', path);
    activatePage(next);
  }

  function activatePage(next: Page): void {
    const wasDemo = page === 'demo';
    page = next;
    room = next === 'demo' ? createDemoRoom() : null;
    error = '';
    notice = '';
    loadSettings(next === 'demo');
    if (wasDemo && next !== 'demo') clearDemoStorage();
    if (next === 'host') connectHost();
    if (next === 'demo') connectDemo();
    routeNotice = titleFor(next);
    void tick().then(() => {
      const heading = document.querySelector<HTMLElement>('main h1');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus();
    });
  }

  function wsAddress(): string {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }

  function openSocket(firstMessage: object, host: boolean): void {
    closeSocket();
    isHost = host;
    error = '';
    notice = '';
    connection = 'connecting';
    const nextSocket = new WebSocket(wsAddress());
    socket = nextSocket;
    nextSocket.addEventListener('open', () => {
      connection = 'online';
      nextSocket.send(JSON.stringify(firstMessage));
    });
    nextSocket.addEventListener('message', (message) => {
      const event = JSON.parse(String(message.data)) as ServerEvent;
      if (event.type === 'state') {
        room = event.room;
        error = '';
      } else if (event.type === 'error') {
        error = event.message;
        if (!event.recoverable) nextSocket.close();
      } else {
        error = event.message;
        room = null;
        nextSocket.close();
      }
    });
    nextSocket.addEventListener('error', () => {
      error = 'The game server could not be reached. Check your connection and try again.';
    });
    nextSocket.addEventListener('close', () => {
      if (socket === nextSocket) connection = 'offline';
    });
  }

  function connectHost(): void {
    openSocket({ type: 'create', client_id: getClientId() }, true);
  }

  function connectDemo(): void {
    const demoClientId = `demo-${crypto.randomUUID()}`;
    openSocket({ type: 'demo', client_id: demoClientId }, true);
  }

  function submitJoin(): void {
    joinCode = cleanCode(joinCode);
    playerName = playerName.trim();
    if (joinCode.length !== 4) {
      error = 'Enter the four-character code shown on the host screen.';
      return;
    }
    if (!playerName || [...playerName].length > 16) {
      error = 'Enter a display name from 1 to 16 characters.';
      return;
    }
    sessionStorage.setItem('controller-name', playerName);
    history.replaceState({}, '', `/join?room=${joinCode}`);
    openSocket({ type: 'join', code: joinCode, name: playerName, client_id: getClientId() }, false);
  }

  function retry(): void {
    if (isHost) connectHost();
    else submitJoin();
  }

  function send(message: object): void {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function demoAction(role: Role, action: 'build' | 'share'): void {
    if (!room) return;
    if (socket?.readyState === WebSocket.OPEN) {
      send({ type: 'demo_action', role, action });
    } else {
      room = applyDemoAction(room, role, action);
    }
  }

  function resetDemo(): void {
    clearDemoStorage();
    reducedMotion = false;
    highContrast = false;
    groundMarkers = true;
    room = createDemoRoom();
    if (socket?.readyState === WebSocket.OPEN) send({ type: 'demo_reset' });
  }

  function startForReal(): void {
    clearDemoStorage();
    navigate('home', '/');
  }

  function closeSocket(): void {
    const current = socket;
    socket = null;
    current?.close();
    connection = 'idle';
  }

  async function createQr(url: string): Promise<void> {
    if (!url || qrFor === url) return;
    qrFor = url;
    const { default: QRCode } = await import('qrcode');
    qrSource = await QRCode.toDataURL(url, {
      width: 224,
      margin: 2,
      color: { dark: '#171006', light: '#fff8df' },
      errorCorrectionLevel: 'M'
    });
  }

  async function copyJoinLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(joinUrl);
      notice = 'Join link copied.';
    } catch {
      notice = 'Copy was blocked. Read the four-character code aloud instead.';
    }
  }

  function saveSetting(key: string, value: boolean): void {
    if (page === 'demo') sessionStorage.setItem(`demo:coop-boss:${key}`, String(value));
    else localStorage.setItem(key, String(value));
  }

  function readSetting(key: string, fallback: boolean, demo: boolean): boolean {
    const value = demo
      ? sessionStorage.getItem(`demo:coop-boss:${key}`)
      : localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  }

  function loadSettings(demo: boolean): void {
    reducedMotion = readSetting('reduced-motion', false, demo);
    highContrast = readSetting('high-contrast', false, demo);
    groundMarkers = readSetting('ground-markers', true, demo);
  }

  function clearDemoStorage(): void {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('demo:coop-boss:')) sessionStorage.removeItem(key);
    }
  }
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <link rel="canonical" href={`${location.origin}${page === 'home' ? '/' : `/${page}`}`} />
</svelte:head>

<div class:reduced-motion={reducedMotion} class:high-contrast={highContrast} class="app-shell">
  <a class="skip-link" href="#main">Skip to game</a>
  <p class="sr-only" aria-live="polite">{routeNotice}</p>
  <header class="site-header">
    <a class="brand" href="/" on:click|preventDefault={() => navigate('home', '/') }>
      <span class="brand-mark" aria-hidden="true">⬡✦</span>
      <span>Co-op Boss Access</span>
    </a>
    {#if page === 'demo'}
      <span class="connection"><span aria-hidden="true"></span>Sample room</span>
    {:else if page === 'host' || (page === 'join' && room)}
      <span class:offline={connection !== 'online'} class="connection"><span aria-hidden="true"></span>{connection === 'online' ? 'Live' : connection}</span>
    {:else}
      <a class="small-link" href="/join" on:click|preventDefault={() => navigate('join', '/join')}>Join a room</a>
    {/if}
  </header>

  {#if page === 'demo'}
    <aside class="demo-banner" data-connection={connection} aria-label="Demo controls">
      <strong>Demo — sample data, nothing is saved</strong>
      <span>{connection === 'offline' ? 'Offline copy; the sample controls still work.' : 'Mina and Ivo are ready in an isolated sample room.'}</span>
      <div><button class="text-button" on:click={resetDemo}>Reset demo</button><button class="button secondary" on:click={startForReal}>Start for real</button></div>
    </aside>
  {/if}

  <main id="main" tabindex="-1">
    {#if page === 'home'}
      <section class="home-grid" aria-labelledby="home-title">
        <div class="home-copy">
          <p class="eyebrow">A three-minute team battle</p>
          <h1 id="home-title">Beat a boss together with phone controls</h1>
          <p class="lede">For friends sharing one screen, phones become clear two-button controls with no account.</p>
          <div class="home-actions">
            <button class="button primary" on:click={() => navigate('demo', '/demo')}>Try it with sample data <span aria-hidden="true">→</span></button>
            <button class="button secondary" on:click={() => navigate('host', '/host')}>Host a game</button>
            <span class="action-note">The sample opens with two players ready.</span>
          </div>
          <ul class="promise-list" aria-label="Price, privacy, and offline facts">
            <li><span aria-hidden="true">◉</span> Free to play</li>
            <li><span aria-hidden="true">⌁</span> Room data vanishes when the host leaves</li>
            <li><span aria-hidden="true">↓</span> Reloads offline after your first visit</li>
          </ul>
        </div>
        <figure class="hero-art">
          <div class="neon-label" aria-hidden="true">WARD + SURGE</div>
          <img src="/art/night-market-dragon.webp" width="960" height="640" alt="A paper-cut night dragon behind two controller plinths marked with a hexagon and a four-point star" fetchpriority="high" decoding="async" />
          <figcaption>Every cue uses a shape, word, and position—not color alone.</figcaption>
        </figure>
      </section>
      <section class="how" aria-labelledby="how-title">
        <p class="eyebrow">How it works</p>
        <h2 id="how-title">Start a game in three steps</h2>
        <ol>
          <li><strong>Host</strong><span>Put the arena on one shared screen.</span></li>
          <li><strong>Join</strong><span>Friends scan or enter one short code.</span></li>
          <li><strong>Share</strong><span>Build charge, then protect or boost the whole team.</span></li>
        </ol>
      </section>
      <section class="privacy-note" aria-labelledby="privacy-note-title">
        <p class="eyebrow">What the game does not keep</p>
        <h2 id="privacy-note-title">No profiles, chat, or player history</h2>
        <p>Live room data stays in server memory. Display settings stay in this browser.</p>
        <a href="/privacy" on:click|preventDefault={() => navigate('privacy', '/privacy')}>Read the privacy policy</a>
      </section>
    {:else if page === 'join'}
      <section class="controller-page" aria-labelledby="join-title">
        {#if !room}
          <div class="controller-intro">
            <p class="eyebrow">Phone controller</p>
            <h1 id="join-title">Join the room</h1>
            <p>The host screen shows the room code. Your name is visible only to this room.</p>
            <form class="join-form" on:submit|preventDefault={submitJoin} novalidate>
              <label for="room-code">Four-character room code</label>
              <input id="room-code" bind:value={joinCode} on:input={() => joinCode = cleanCode(joinCode)} inputmode="text" autocomplete="off" autocapitalize="characters" required aria-describedby="join-error" />
              <label for="player-name">Your display name</label>
              <input id="player-name" bind:value={playerName} autocomplete="nickname" maxlength="16" required aria-describedby="name-note join-error" />
              <small id="name-note">1–16 characters. It disappears when the room closes.</small>
              <button class="button primary" disabled={connection === 'connecting'}>{connection === 'connecting' ? 'Connecting…' : 'Join the team'}</button>
              {#if error}<p id="join-error" class="form-error" role="alert">{error}</p>{/if}
            </form>
          </div>
        {:else if me && role}
          <div class="controller {role}" aria-labelledby="join-title">
            <div class="role-badge" aria-hidden="true">{roleCopy[role].symbol}</div>
            <p class="eyebrow">Room {room.code} · {me.name}</p>
            <h1 id="join-title">You are {roleCopy[role].label}</h1>
            <p class="role-instruction">{roleCopy[role].instruction}</p>

            {#if room.phase === 'lobby'}
              <div class="waiting-state" role="status"><span class="waiting-icon" aria-hidden="true">{roleCopy[role].symbol}</span><strong>Ready</strong><span>Look up at the host screen. The round starts there.</span></div>
            {:else if room.phase === 'playing'}
              <div class="controller-status">
                <div><span>Charge</span><strong>{me.meter}%</strong></div>
                <progress max="100" value={me.meter} aria-label={`${roleCopy[role].label} charge: ${me.meter}%`}></progress>
                <div class="mini-stats"><span>Team {room.team_hp}%</span><span>{formatClock(room.remaining_ms)}</span></div>
              </div>
              <div class="control-buttons">
                <button class="action-button build" on:click={() => send({ type: 'action', action: 'build' })}>
                  <span aria-hidden="true">＋10</span><strong>{roleCopy[role].build}</strong><small>Tap to fill your meter</small>
                </button>
                <button class="action-button share" disabled={me.meter < 40} on:click={() => send({ type: 'action', action: 'share' })}>
                  <span aria-hidden="true">{roleCopy[role].symbol}</span><strong>{roleCopy[role].share}</strong><small>{me.meter < 40 ? `${40 - me.meter}% more charge needed` : 'Ready for the whole team'}</small>
                </button>
              </div>
            {:else}
              <div class="waiting-state result" role="status"><span class="waiting-icon" aria-hidden="true">{room.phase === 'won' ? '★' : '↻'}</span><strong>{room.phase === 'won' ? 'Dragon defeated!' : 'Round over'}</strong><span>Look at the host screen for the result and next round.</span></div>
            {/if}
            <p class="sr-only" aria-live="polite">{room.announcement}. Charge {me.meter} percent.</p>
          </div>
        {/if}
        {#if connection === 'offline' && room}
          <div class="offline-banner" role="alert"><strong>Controller disconnected.</strong><span>Your role is held for this round.</span><button class="button secondary" on:click={retry}>Reconnect</button></div>
        {/if}
      </section>
    {:else if page === 'host' || page === 'demo'}
      <section class="host-page" class:demo-page={page === 'demo'} aria-labelledby="host-title">
        <div class="host-heading">
          <div><p class="eyebrow">{page === 'demo' ? 'Playable sample battle' : 'Shared-screen arena'}</p><h1 id="host-title">{page === 'demo' ? 'Try the sample battle' : 'The Night Dragon'}</h1></div>
          <div class="access-settings" aria-label="Display settings">
            <button aria-pressed={groundMarkers} on:click={() => { groundMarkers = !groundMarkers; saveSetting('ground-markers', groundMarkers); }}><span aria-hidden="true">◎</span> Ground markers</button>
            <button aria-pressed={highContrast} on:click={() => { highContrast = !highContrast; saveSetting('high-contrast', highContrast); }}><span aria-hidden="true">◐</span> High contrast</button>
            <button aria-pressed={reducedMotion} on:click={() => { reducedMotion = !reducedMotion; saveSetting('reduced-motion', reducedMotion); }}><span aria-hidden="true">≋</span> Reduce motion</button>
          </div>
        </div>

        {#if connection === 'connecting' && !room}
          <div class="system-state" role="status"><span class="spinner" aria-hidden="true"></span><h2>Creating your room…</h2><p>Setting up a private room on this server.</p></div>
        {:else if connection === 'offline' && !room}
          <div class="system-state error-state" role="alert"><span aria-hidden="true">!</span><h2>The room is offline</h2><p>{error || 'The room connection ended. A new room code will be created when you retry.'}</p><button class="button primary" on:click={retry}>Create a new room</button></div>
        {:else if room}
          {#if room.phase === 'lobby' && page === 'host'}
            <div class="lobby-grid">
              <div class="join-board">
                <p class="sign-label">Phones join with</p>
                <p class="room-code" aria-label={`Room code ${room.code.split('').join(' ')}`}>{room.code}</p>
                <p class="join-address">{location.host}/join</p>
                <button class="text-button" on:click={copyJoinLink}>Copy direct join link</button>
                <p class="copy-notice" aria-live="polite">{notice}</p>
              </div>
              <div class="qr-board">
                {#if qrSource}<img src={qrSource} width="224" height="224" alt={`QR code to join room ${room.code}`} />{/if}
                <span>Scan to join</span>
              </div>
              <div class="roster">
                <div class="roster-heading"><div><p class="eyebrow">Players</p><h2>Build your team</h2></div><span>{room.players.filter((p) => p.connected).length}/8</span></div>
                {#if room.players.length === 0}
                  <div class="empty-roster"><span aria-hidden="true">⌁</span><strong>No controllers yet</strong><p>Open the join link on two phones. The first becomes WARD; the second becomes SURGE.</p></div>
                {:else}
                  <ul class="player-list">
                    {#each room.players as player}
                      <li class={player.role}><span class="player-symbol" aria-hidden="true">{roleCopy[player.role].symbol}</span><span><strong>{player.name}</strong><small>{roleCopy[player.role].label}</small></span><span class="ready-word">Ready</span></li>
                    {/each}
                  </ul>
                {/if}
                <button class="button primary start-button" disabled={!hasReadyTeam(room.players)} on:click={() => send({ type: 'start' })}>{hasReadyTeam(room.players) ? 'Start 3-minute round' : 'Need WARD + SURGE'}</button>
                <p class="start-help">Roles alternate automatically so every team has both powers.</p>
              </div>
            </div>
          {:else}
            <div class="arena" class:markers-on={groundMarkers}>
              <div class="score-strip" aria-label="Round status">
                <div><span>Dragon</span><progress class="boss-meter" max="100" value={room.boss_hp} aria-label={`Dragon health: ${room.boss_hp}%`}></progress><strong>{room.boss_hp}%</strong></div>
                <time aria-label={`${formatClock(room.remaining_ms)} remaining`}>{formatClock(room.remaining_ms)}</time>
                <div><span>Team</span><progress class="team-meter" max="100" value={room.team_hp} aria-label={`Team health: ${room.team_hp}%`}></progress><strong>{room.team_hp}%</strong></div>
              </div>
              <div class="announcement" role="status" aria-live="polite"><span aria-hidden="true">◆</span>{room.announcement}<span aria-hidden="true">◆</span></div>
              <div class="boss-stage" class:incoming={room.phase === 'playing' && room.incoming_ms < 2500}>
                <img src="/art/night-market-dragon.webp" width="960" height="640" alt="The paper-cut night dragon above the Ward and Surge plinths" decoding="async" />
                {#if room.phase === 'playing' && room.incoming_ms < 2500}<div class="hit-warning"><strong>INCOMING HIT</strong><span>{Math.ceil(room.incoming_ms / 1000)}</span></div>{/if}
                <div class="power ward-power"><span>⬡ WARD SHIELD</span><strong>{room.shield}%</strong><progress max="100" value={room.shield} aria-label={`Shared ward shield: ${room.shield}%`}></progress></div>
                <div class="power surge-power"><span>✦ SURGE BOOST</span><strong>{room.boost}%</strong><progress max="100" value={room.boost} aria-label={`Shared surge boost: ${room.boost}%`}></progress></div>
                <div class="ground-marker ward-marker" aria-hidden="true"><span>⬡</span></div>
                <div class="ground-marker surge-marker" aria-hidden="true"><span>✦</span></div>
                {#if room.phase === 'won' || room.phase === 'lost'}
                  <div class="round-result" role="dialog" aria-labelledby="result-title" aria-describedby="result-copy">
                    <span class="result-symbol" aria-hidden="true">{room.phase === 'won' ? '★' : '↻'}</span>
                    <h2 id="result-title">{room.phase === 'won' ? 'Dragon defeated!' : 'Play another round'}</h2>
                    <p id="result-copy">{room.announcement}</p>
                    <button class="button primary" on:click={() => page === 'demo' ? resetDemo() : send({ type: 'restart' })}>Play another round</button>
                  </div>
                {/if}
              </div>
              <ul class="active-players" aria-label="Connected controllers">
                {#each room.players as player}
                  <li class:disconnected={!player.connected}><span aria-hidden="true">{roleCopy[player.role].symbol}</span><strong>{player.name}</strong><small>{player.connected ? `${player.meter}% ready` : 'Disconnected'}</small></li>
                {/each}
              </ul>
              {#if page === 'demo'}
                <section class="demo-controls" aria-labelledby="demo-controls-title">
                  <div><p class="eyebrow">Sample phone controls</p><h2 id="demo-controls-title">Build charge, then share</h2></div>
                  {#each room.players as player}
                    <div class="demo-role {player.role}">
                      <span class="demo-role-symbol" aria-hidden="true">{roleCopy[player.role].symbol}</span>
                      <span><strong>{player.name} · {roleCopy[player.role].label}</strong><small>{player.meter}% charge</small></span>
                      <button on:click={() => demoAction(player.role, 'build')} aria-label={`Build ${roleCopy[player.role].label} charge`}>Build +10</button>
                      <button on:click={() => demoAction(player.role, 'share')} disabled={player.meter < 40}>{roleCopy[player.role].share}</button>
                    </div>
                  {/each}
                </section>
              {/if}
            </div>
          {/if}
          {#if connection === 'offline' && page === 'host'}
            <div class="offline-banner" role="alert"><strong>Host connection lost.</strong><span>This room has closed to protect its private state.</span><button class="button secondary" on:click={retry}>Create a new room</button></div>
          {/if}
        {/if}
      </section>
    {:else if page === 'privacy'}
      <article class="legal-page">
        <p class="eyebrow">Plain-language policy</p><h1>Privacy</h1>
        <p class="lede">A room is temporary. We do not create profiles or collect accessibility information.</p>
        <h2>What the server sees</h2><p>While a room is open, the server holds its four-character code, display names, connection IDs, roles, and current game state in memory. This is needed to synchronize the host and phone controllers. The room disappears when the host disconnects or the service restarts.</p>
        <h2>What is stored</h2><p>Your browser stores a random controller ID and your display preferences. Your name lasts only in the current browser tab. The server keeps one aggregate page-view number per day; it does not attach IP addresses, user agents, room codes, or player data to that number. To prevent overload, the server temporarily counts connection and page-view requests by network address in memory. Those short-lived counts are not written to the database.</p>
        <h2>How the sample stays separate</h2><p>The demo uses sample names in an isolated memory-only workspace. Demo display changes use a separate browser namespace. Demo visits are not added to the page count.</p>
        <h2>What is never collected</h2><p>No accounts, chat, precise location, advertising IDs, or accessibility settings. There are no third-party analytics, fonts, scripts, or trackers.</p>
        <h2>Room-code safety</h2><p>Anyone with a live room code can join. Share it only with the people playing, and close the host screen when the game is over.</p>
      </article>
    {:else}
      <article class="legal-page">
        <p class="eyebrow">Fair-play rules</p><h1>Terms</h1>
        <p class="lede">Co-op Boss Access is a free game provided as-is for casual group play.</p>
        <h2>Use</h2><p>You may use the service for lawful, friendly play. Do not attempt to disrupt rooms, overload the service, probe other players, or enter abusive display names.</p>
        <h2>Availability</h2><p>Rooms are deliberately temporary and may close if the host disconnects, the network changes, or the service restarts. There is no guarantee that a particular room or result will be retained.</p>
        <h2>Safety and ownership</h2><p>The game does not replace professional accessibility advice. The code is MIT licensed; the original generated scene is provided as part of this product and may not imply endorsement by any model provider.</p>
        <h2>Changes</h2><p>These terms may change as the game evolves. Continued use after an update means you accept the current terms.</p>
      </article>
    {/if}
  </main>

  <footer>
    <p>Built for cooperative, mixed-ability play. Dragon artwork was generated for this game.</p>
    <nav aria-label="Legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="https://github.com/B-Divyesh/sf-coop-boss-access">Source</a><span>Build {buildId}</span></nav>
  </footer>
</div>
