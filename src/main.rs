use std::{
    collections::HashMap,
    net::SocketAddr,
    path::Path,
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use axum::{
    body::Body,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, State,
    },
    http::{header, HeaderValue, Method, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use tokio::sync::{mpsc, OwnedSemaphorePermit, RwLock, Semaphore};
use tower_governor::{
    governor::GovernorConfigBuilder, key_extractor::SmartIpKeyExtractor, GovernorLayer,
};
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing::{info, warn};

const ROUND_SECONDS: f32 = 180.0;
const ACTION_COOLDOWN: Duration = Duration::from_millis(110);
const MAX_ROOMS: usize = 256;
const MAX_CONNECTIONS: usize = 2_048;
const WS_BURST_PER_IP: u32 = 120;
const PAGEVIEW_BURST_PER_IP: u32 = 20;

#[derive(Clone)]
struct AppState {
    rooms: Arc<RwLock<HashMap<String, Room>>>,
    db: SqlitePool,
    limits: Arc<CapacityLimits>,
}

struct CapacityLimits {
    max_rooms: usize,
    connections: Arc<Semaphore>,
}

impl CapacityLimits {
    fn production() -> Self {
        Self {
            max_rooms: MAX_ROOMS,
            connections: Arc::new(Semaphore::new(MAX_CONNECTIONS)),
        }
    }

    fn try_connection(&self) -> Result<OwnedSemaphorePermit, ()> {
        self.connections.clone().try_acquire_owned().map_err(|_| ())
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Phase {
    Lobby,
    Playing,
    Won,
    Lost,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Role {
    Ward,
    Surge,
}

#[derive(Debug, Clone)]
struct Player {
    id: String,
    name: String,
    role: Role,
    meter: f32,
    connected: bool,
    last_action: Option<Instant>,
}

struct Room {
    code: String,
    connections: HashMap<String, mpsc::UnboundedSender<Message>>,
    players: Vec<Player>,
    phase: Phase,
    boss_hp: f32,
    team_hp: f32,
    shield: f32,
    boost: f32,
    remaining: f32,
    next_hit: f32,
    last_tick: Instant,
    announcement: String,
    is_demo: bool,
    created_at: Instant,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ServerMessage {
    State { room: RoomView },
    Error { message: String, recoverable: bool },
    RoomClosed { message: String },
}

#[derive(Debug, Serialize)]
struct RoomView {
    code: String,
    phase: Phase,
    boss_hp: f32,
    team_hp: f32,
    shield: f32,
    boost: f32,
    remaining_ms: u64,
    incoming_ms: u64,
    announcement: String,
    players: Vec<PlayerView>,
}

#[derive(Debug, Serialize)]
struct PlayerView {
    id: String,
    name: String,
    role: Role,
    meter: f32,
    connected: bool,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    Create {
        client_id: String,
    },
    Join {
        code: String,
        name: String,
        client_id: String,
    },
    Demo {
        client_id: String,
    },
    Start,
    Restart,
    DemoReset,
    DemoAction {
        role: Role,
        action: Action,
    },
    Action {
        action: Action,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Action {
    Build,
    Share,
}

#[tokio::main]
async fn main() {
    let log_filter = tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        tracing_subscriber::EnvFilter::new("coop_boss_access=info,tower_http=info")
    });
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(log_filter)
        .init();

    let database_url = std::env::var("DATABASE_URL").ok();
    let database_source = if database_url.is_some() {
        "supplied"
    } else {
        "default"
    };
    let database_url = database_url.unwrap_or_else(|| "sqlite://data/coop.db?mode=rwc".into());
    if database_url.starts_with("sqlite://data/") {
        std::fs::create_dir_all("data").expect("create data directory");
    }
    let db = SqlitePoolOptions::new()
        .max_connections(4)
        .connect(&database_url)
        .await
        .expect("connect to SQLite");
    migrate(&db).await.expect("run database migration");

    let state = AppState {
        rooms: Arc::new(RwLock::new(HashMap::new())),
        db,
        limits: Arc::new(CapacityLimits::production()),
    };
    tokio::spawn(game_clock(state.clone()));

    let app = app(state);
    let port_value = std::env::var("PORT").ok();
    let port_source = if port_value.is_some() {
        "supplied"
    } else {
        "default"
    };
    let port: u16 = port_value.and_then(|v| v.parse().ok()).unwrap_or(8080);
    let address = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .expect("bind server");
    info!(%address, database_source, port_source, "runtime configuration ready; coop boss server ready");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .expect("serve application");
}

fn app(state: AppState) -> Router {
    let dist = std::env::var("DIST_DIR").unwrap_or_else(|_| "dist".into());
    let fallback =
        ServeDir::new(&dist).fallback(ServeFile::new(Path::new(&dist).join("index.html")));
    let websocket_limit = GovernorConfigBuilder::default()
        .key_extractor(SmartIpKeyExtractor)
        .per_second(1)
        .burst_size(WS_BURST_PER_IP)
        .finish()
        .expect("valid WebSocket rate limit");
    let pageview_limit = GovernorConfigBuilder::default()
        .key_extractor(SmartIpKeyExtractor)
        .per_second(1)
        .burst_size(PAGEVIEW_BURST_PER_IP)
        .finish()
        .expect("valid page-view rate limit");
    Router::new()
        .route("/health", get(health))
        .route(
            "/api/pageview",
            post(pageview)
                .layer(GovernorLayer::new(pageview_limit))
                .layer(middleware::from_fn(post_only)),
        )
        .route(
            "/ws",
            get(ws_handler)
                .layer(GovernorLayer::new(websocket_limit))
                .layer(middleware::from_fn(get_only)),
        )
        .fallback_service(fallback)
        .layer(middleware::from_fn(security_headers))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn post_only(request: Request<Body>, next: Next) -> Response {
    if request.method() != Method::POST {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    }
    next.run(request).await
}

async fn get_only(request: Request<Body>, next: Next) -> Response {
    if request.method() != Method::GET {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    }
    next.run(request).await
}

async fn migrate(db: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS daily_page_views (day INTEGER PRIMARY KEY, views INTEGER NOT NULL DEFAULT 0)",
    )
    .execute(db)
    .await?;
    Ok(())
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "build": option_env!("BUILD_SHA").unwrap_or("dev")
    }))
}

async fn pageview(State(state): State<AppState>) -> StatusCode {
    let day = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        / 86_400;
    match sqlx::query(
        "INSERT INTO daily_page_views(day, views) VALUES(?, 1) ON CONFLICT(day) DO UPDATE SET views = views + 1",
    )
    .bind(day as i64)
    .execute(&state.db)
    .await
    {
        Ok(_) => StatusCode::NO_CONTENT,
        Err(error) => {
            warn!(%error, "page count update failed");
            StatusCode::SERVICE_UNAVAILABLE
        }
    }
}

async fn security_headers(request: Request<Body>, next: Next) -> Response {
    let path = request.uri().path().to_string();
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(
        header::STRICT_TRANSPORT_SECURITY,
        HeaderValue::from_static("max-age=31536000; includeSubDomains"),
    );
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static("default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws: wss:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"),
    );
    if path.starts_with("/assets/") {
        headers.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=31536000, immutable"),
        );
    } else {
        headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    }
    response
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
) -> Response {
    let permit = match state.limits.try_connection() {
        Ok(permit) => permit,
        Err(()) => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                "The game server is at capacity. Try again shortly.",
            )
                .into_response()
        }
    };
    ws.max_message_size(4096)
        .on_upgrade(move |socket| handle_socket(socket, state, permit, peer))
        .into_response()
}

async fn handle_socket(
    mut socket: WebSocket,
    state: AppState,
    _connection_permit: OwnedSemaphorePermit,
    _peer: SocketAddr,
) {
    let first = match tokio::time::timeout(Duration::from_secs(10), socket.recv()).await {
        Ok(Some(Ok(Message::Text(text)))) => serde_json::from_str::<ClientMessage>(&text),
        _ => return,
    };
    let first = match first {
        Ok(message) => message,
        Err(_) => {
            let _ = send_direct(
                &mut socket,
                &ServerMessage::Error {
                    message: "That connection request was not understood.".into(),
                    recoverable: false,
                },
            )
            .await;
            return;
        }
    };

    let (client_id, room_code, is_host) = match register(first, &state).await {
        Ok(context) => context,
        Err(message) => {
            let _ = send_direct(
                &mut socket,
                &ServerMessage::Error {
                    message,
                    recoverable: true,
                },
            )
            .await;
            return;
        }
    };

    let (mut outbound, mut inbound) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel();
    {
        let mut rooms = state.rooms.write().await;
        if let Some(room) = rooms.get_mut(&room_code) {
            room.connections.insert(client_id.clone(), tx);
            broadcast_room(room);
        }
    }

    loop {
        tokio::select! {
            Some(message) = rx.recv() => {
                if outbound.send(message).await.is_err() { break; }
            }
            incoming = inbound.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(message) = serde_json::from_str::<ClientMessage>(&text) {
                            process_message(&state, &room_code, &client_id, is_host, message).await;
                        }
                    }
                    Some(Ok(Message::Ping(data))) => { let _ = outbound.send(Message::Pong(data)).await; }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    _ => {}
                }
            }
        }
    }
    disconnect(&state, &room_code, &client_id, is_host).await;
}

async fn register(
    message: ClientMessage,
    state: &AppState,
) -> Result<(String, String, bool), String> {
    match message {
        ClientMessage::Create { client_id } if valid_id(&client_id) => {
            let mut rooms = state.rooms.write().await;
            if rooms.len() >= state.limits.max_rooms {
                return Err(
                    "All game rooms are busy. Close an unused host or try again shortly.".into(),
                );
            }
            let code = make_code(&rooms);
            rooms.insert(code.clone(), Room::new(code.clone()));
            Ok((client_id, code, true))
        }
        ClientMessage::Join {
            code,
            name,
            client_id,
        } if valid_id(&client_id) => {
            let code = normalize_code(&code)?;
            let name = normalize_name(&name)?;
            let mut rooms = state.rooms.write().await;
            let room = rooms.get_mut(&code).ok_or_else(|| {
                "Room not found. Check the four-character code and try again.".to_string()
            })?;
            if room.phase != Phase::Lobby && !room.players.iter().any(|p| p.id == client_id) {
                return Err(
                    "That round has already started. Ask the host to begin a new room.".into(),
                );
            }
            if let Some(player) = room.players.iter_mut().find(|p| p.id == client_id) {
                player.connected = true;
                player.name = name;
            } else {
                if room.players.len() >= 8 {
                    return Err("This room is full (8 players).".into());
                }
                let ward_count = room.players.iter().filter(|p| p.role == Role::Ward).count();
                let surge_count = room.players.len() - ward_count;
                let role = if ward_count <= surge_count {
                    Role::Ward
                } else {
                    Role::Surge
                };
                room.players.push(Player {
                    id: client_id.clone(),
                    name,
                    role,
                    meter: 0.0,
                    connected: true,
                    last_action: None,
                });
            }
            Ok((client_id, code, false))
        }
        ClientMessage::Demo { client_id } if valid_id(&client_id) => {
            let mut rooms = state.rooms.write().await;
            if rooms.len() >= state.limits.max_rooms {
                return Err(
                    "All sample rooms are busy. Close an unused demo or try again shortly.".into(),
                );
            }
            let workspace_id = make_demo_id(&rooms);
            rooms.insert(workspace_id.clone(), Room::demo());
            Ok((client_id, workspace_id, true))
        }
        _ => Err("Start by creating a room or joining with a valid code.".into()),
    }
}

async fn process_message(
    state: &AppState,
    code: &str,
    client_id: &str,
    is_host: bool,
    message: ClientMessage,
) {
    let mut rooms = state.rooms.write().await;
    let Some(room) = rooms.get_mut(code) else {
        return;
    };
    match message {
        ClientMessage::Start if is_host => start_round(room),
        ClientMessage::Restart if is_host => start_round(room),
        ClientMessage::DemoReset if is_host && room.is_demo => room.reset_demo(),
        ClientMessage::DemoAction { role, action } if is_host && room.is_demo => {
            apply_demo_action(room, role, action)
        }
        ClientMessage::Action { action } if !is_host && room.phase == Phase::Playing => {
            let now = Instant::now();
            let Some(player) = room.players.iter_mut().find(|p| p.id == client_id) else {
                return;
            };
            if player
                .last_action
                .is_some_and(|last| now.duration_since(last) < ACTION_COOLDOWN)
            {
                return;
            }
            player.last_action = Some(now);
            match action {
                Action::Build => {
                    player.meter = (player.meter + 10.0).min(100.0);
                    room.announcement = format!(
                        "{} built {} charge",
                        player.name,
                        if player.role == Role::Ward {
                            "ward"
                        } else {
                            "surge"
                        }
                    );
                }
                Action::Share if player.meter >= 40.0 => {
                    player.meter -= 40.0;
                    match player.role {
                        Role::Ward => {
                            room.shield = (room.shield + 28.0).min(100.0);
                            room.announcement = format!("{} shared a team shield", player.name);
                        }
                        Role::Surge => {
                            room.boost = (room.boost + 28.0).min(100.0);
                            room.announcement =
                                format!("{} boosted every team strike", player.name);
                        }
                    }
                }
                Action::Share => {
                    room.announcement = format!("{} needs 40 charge to share", player.name)
                }
            }
        }
        _ => return,
    }
    broadcast_room(room);
}

fn apply_demo_action(room: &mut Room, role: Role, action: Action) {
    if room.phase != Phase::Playing {
        return;
    }
    let Some(player) = room.players.iter_mut().find(|player| player.role == role) else {
        return;
    };
    match action {
        Action::Build => {
            player.meter = (player.meter + 10.0).min(100.0);
            room.announcement = format!(
                "{} built {} charge",
                player.name,
                if role == Role::Ward { "ward" } else { "surge" }
            );
        }
        Action::Share if player.meter >= 40.0 => {
            player.meter -= 40.0;
            match role {
                Role::Ward => {
                    room.shield = (room.shield + 28.0).min(100.0);
                    room.announcement = format!("{} shared a team shield", player.name);
                }
                Role::Surge => {
                    room.boost = (room.boost + 28.0).min(100.0);
                    room.announcement = format!("{} boosted every team strike", player.name);
                }
            }
        }
        Action::Share => {
            room.announcement = format!("{} needs 40 charge to share", player.name);
        }
    }
}

fn start_round(room: &mut Room) {
    let connected: Vec<_> = room.players.iter().filter(|p| p.connected).collect();
    let has_ward = connected.iter().any(|p| p.role == Role::Ward);
    let has_surge = connected.iter().any(|p| p.role == Role::Surge);
    if connected.len() < 2 || !has_ward || !has_surge {
        room.announcement = "Connect at least one WARD and one SURGE player to start".into();
        return;
    }
    room.phase = Phase::Playing;
    room.boss_hp = 100.0;
    room.team_hp = 100.0;
    room.shield = 20.0;
    room.boost = 0.0;
    room.remaining = ROUND_SECONDS;
    room.next_hit = 6.0;
    room.last_tick = Instant::now();
    room.announcement = "Round started — build, then share!".into();
    for player in &mut room.players {
        player.meter = 0.0;
    }
}

async fn disconnect(state: &AppState, code: &str, client_id: &str, is_host: bool) {
    let mut rooms = state.rooms.write().await;
    if is_host {
        if let Some(room) = rooms.remove(code) {
            let message = encode(&ServerMessage::RoomClosed {
                message: "The host closed this room. Return home to join another.".into(),
            });
            for sender in room.connections.values() {
                let _ = sender.send(Message::Text(message.clone().into()));
            }
        }
    } else if let Some(room) = rooms.get_mut(code) {
        room.connections.remove(client_id);
        if room.phase == Phase::Lobby {
            room.players.retain(|player| player.id != client_id);
        } else if let Some(player) = room
            .players
            .iter_mut()
            .find(|player| player.id == client_id)
        {
            player.connected = false;
            room.announcement = format!("{} disconnected — they can rejoin", player.name);
        }
        broadcast_room(room);
    }
}

async fn game_clock(state: AppState) {
    let mut interval = tokio::time::interval(Duration::from_millis(250));
    loop {
        interval.tick().await;
        let mut rooms = state.rooms.write().await;
        rooms.retain(|_, room| {
            !room.is_demo || room.created_at.elapsed() < Duration::from_secs(86_400)
        });
        for room in rooms
            .values_mut()
            .filter(|room| room.phase == Phase::Playing && !room.is_demo)
        {
            tick_room(room);
            broadcast_room(room);
        }
    }
}

fn tick_room(room: &mut Room) {
    let now = Instant::now();
    let delta = now.duration_since(room.last_tick).as_secs_f32().min(1.0);
    room.last_tick = now;
    room.remaining = (room.remaining - delta).max(0.0);
    room.next_hit -= delta;

    let boosted = room.boost > 0.0;
    room.boss_hp = (room.boss_hp - delta * if boosted { 1.2 } else { 0.45 }).max(0.0);
    if boosted {
        room.boost = (room.boost - delta * 7.0).max(0.0);
    }

    if room.next_hit <= 0.0 {
        room.next_hit += 7.0;
        let incoming = 14.0;
        let absorbed = room.shield.min(incoming);
        room.shield -= absorbed;
        let damage = incoming - absorbed;
        room.team_hp = (room.team_hp - damage).max(0.0);
        room.announcement = if damage == 0.0 {
            "Shield caught the dragon's hit!".into()
        } else {
            format!("Dragon hit the team for {}", damage.round())
        };
    }

    if room.boss_hp <= 0.0 {
        room.phase = Phase::Won;
        room.announcement = "Night dragon defeated — every role mattered!".into();
    } else if room.team_hp <= 0.0 {
        room.phase = Phase::Lost;
        room.announcement = "The team fell — build more WARD before each hit".into();
    } else if room.remaining <= 0.0 {
        room.phase = Phase::Lost;
        room.announcement = "Time ran out — share more SURGE to strike faster".into();
    }
}

impl Room {
    fn new(code: String) -> Self {
        Self {
            code,
            connections: HashMap::new(),
            players: Vec::new(),
            phase: Phase::Lobby,
            boss_hp: 100.0,
            team_hp: 100.0,
            shield: 0.0,
            boost: 0.0,
            remaining: ROUND_SECONDS,
            next_hit: 6.0,
            last_tick: Instant::now(),
            announcement: "Waiting for one WARD and one SURGE player".into(),
            is_demo: false,
            created_at: Instant::now(),
        }
    }

    fn demo() -> Self {
        let mut room = Self::new("DEMO".into());
        room.is_demo = true;
        room.reset_demo();
        room
    }

    fn reset_demo(&mut self) {
        self.phase = Phase::Playing;
        self.boss_hp = 68.0;
        self.team_hp = 82.0;
        self.shield = 20.0;
        self.boost = 0.0;
        self.remaining = 155.0;
        self.next_hit = 4.5;
        self.last_tick = Instant::now();
        self.announcement = "Mina is building a shield before the next hit".into();
        self.players = vec![
            Player {
                id: "demo-ward".into(),
                name: "Mina".into(),
                role: Role::Ward,
                meter: 30.0,
                connected: true,
                last_action: None,
            },
            Player {
                id: "demo-surge".into(),
                name: "Ivo".into(),
                role: Role::Surge,
                meter: 40.0,
                connected: true,
                last_action: None,
            },
        ];
    }

    fn view(&self) -> RoomView {
        RoomView {
            code: self.code.clone(),
            phase: self.phase.clone(),
            boss_hp: self.boss_hp.round(),
            team_hp: self.team_hp.round(),
            shield: self.shield.round(),
            boost: self.boost.round(),
            remaining_ms: (self.remaining * 1000.0) as u64,
            incoming_ms: (self.next_hit.max(0.0) * 1000.0) as u64,
            announcement: self.announcement.clone(),
            players: self
                .players
                .iter()
                .map(|player| PlayerView {
                    id: player.id.clone(),
                    name: player.name.clone(),
                    role: player.role,
                    meter: player.meter.round(),
                    connected: player.connected,
                })
                .collect(),
        }
    }
}

fn broadcast_room(room: &Room) {
    let message = Message::Text(encode(&ServerMessage::State { room: room.view() }).into());
    for sender in room.connections.values() {
        let _ = sender.send(message.clone());
    }
}

async fn send_direct(socket: &mut WebSocket, message: &ServerMessage) -> Result<(), axum::Error> {
    socket.send(Message::Text(encode(message).into())).await
}

fn encode(message: &ServerMessage) -> String {
    serde_json::to_string(message).expect("serialize server message")
}

fn normalize_code(value: &str) -> Result<String, String> {
    let code: String = value
        .trim()
        .to_ascii_uppercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    if code.len() == 4 {
        Ok(code)
    } else {
        Err("Room codes have four letters or numbers.".into())
    }
}

fn normalize_name(value: &str) -> Result<String, String> {
    let name = value.trim();
    if name.is_empty() || name.chars().count() > 16 || name.chars().any(char::is_control) {
        Err("Use a display name between 1 and 16 characters.".into())
    } else {
        Ok(name.to_string())
    }
}

fn valid_id(value: &str) -> bool {
    (8..=64).contains(&value.len()) && value.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn make_code(rooms: &HashMap<String, Room>) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    loop {
        let mut rng = rand::rng();
        let code: String = (0..4)
            .map(|_| ALPHABET[rng.random_range(0..ALPHABET.len())] as char)
            .collect();
        if !rooms.contains_key(&code) {
            return code;
        }
    }
}

fn make_demo_id(rooms: &HashMap<String, Room>) -> String {
    loop {
        let value: u64 = rand::rng().random();
        let id = format!("demo:{value:016x}");
        if !rooms.contains_key(&id) {
            return id;
        }
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("install Ctrl+C handler")
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install signal handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = terminate => {} }
}

#[cfg(test)]
mod tests {
    use super::*;
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    #[test]
    fn validates_room_inputs() {
        assert_eq!(normalize_code(" ab2z ").unwrap(), "AB2Z");
        assert!(normalize_code("ABC").is_err());
        assert!(normalize_name("").is_err());
        assert!(normalize_name("Night Owl").is_ok());
    }

    #[test]
    fn ward_absorbs_an_incoming_hit() {
        let mut room = Room::new("TEST".into());
        room.phase = Phase::Playing;
        room.shield = 14.0;
        room.next_hit = 0.0;
        room.last_tick = Instant::now() - Duration::from_millis(250);
        tick_room(&mut room);
        assert_eq!(room.team_hp, 100.0);
        assert_eq!(room.shield, 0.0);
    }

    #[test]
    fn surge_accelerates_team_damage() {
        let mut normal = Room::new("NORM".into());
        normal.phase = Phase::Playing;
        normal.next_hit = 10.0;
        normal.last_tick = Instant::now() - Duration::from_secs(1);
        let mut boosted = Room::new("FAST".into());
        boosted.phase = Phase::Playing;
        boosted.next_hit = 10.0;
        boosted.boost = 30.0;
        boosted.last_tick = Instant::now() - Duration::from_secs(1);
        tick_room(&mut normal);
        tick_room(&mut boosted);
        assert!(boosted.boss_hp < normal.boss_hp);
    }

    #[tokio::test]
    async fn health_and_anonymous_page_count_routes_work() {
        let db = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        migrate(&db).await.unwrap();
        let service = app(AppState {
            rooms: Arc::new(RwLock::new(HashMap::new())),
            db: db.clone(),
            limits: Arc::new(CapacityLimits::production()),
        });

        let health_response = service
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(health_response.status(), StatusCode::OK);
        assert_eq!(
            health_response
                .headers()
                .get(header::STRICT_TRANSPORT_SECURITY)
                .unwrap(),
            "max-age=31536000; includeSubDomains"
        );
        let body = health_response
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes();
        let health_json = String::from_utf8_lossy(&body);
        assert!(health_json.contains("\"status\":\"ok\""));
        assert!(health_json.contains("\"build\":\"dev\""));

        let count_response = service
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/pageview")
                    .header("x-forwarded-for", "192.0.2.1")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(count_response.status(), StatusCode::NO_CONTENT);
        let views: i64 = sqlx::query_scalar("SELECT views FROM daily_page_views LIMIT 1")
            .fetch_one(&db)
            .await
            .unwrap();
        assert_eq!(views, 1);
        let tables: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .fetch_all(&db)
        .await
        .unwrap();
        assert_eq!(tables, vec!["daily_page_views"]);
        let columns: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM pragma_table_info('daily_page_views') ORDER BY cid",
        )
        .fetch_all(&db)
        .await
        .unwrap();
        assert_eq!(columns, vec!["day", "views"]);
    }

    #[tokio::test]
    async fn rejects_pageview_bursts_above_the_public_limit() {
        let db = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        migrate(&db).await.unwrap();
        let service = app(AppState {
            rooms: Arc::new(RwLock::new(HashMap::new())),
            db: db.clone(),
            limits: Arc::new(CapacityLimits::production()),
        });

        let mut rejected = 0;
        for _ in 0..=PAGEVIEW_BURST_PER_IP {
            let response = service
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/api/pageview")
                        .header("x-forwarded-for", "198.51.100.22")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            if response.status() == StatusCode::TOO_MANY_REQUESTS {
                rejected += 1;
            }
        }
        assert!(
            rejected >= 1,
            "a burst above the published quota must be rejected"
        );
        let views: i64 = sqlx::query_scalar("SELECT views FROM daily_page_views LIMIT 1")
            .fetch_one(&db)
            .await
            .unwrap();
        assert!(views <= i64::from(PAGEVIEW_BURST_PER_IP));

        let unsupported = service
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri("/api/pageview")
                    .header("x-forwarded-for", "198.51.100.22")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(unsupported.status(), StatusCode::METHOD_NOT_ALLOWED);
    }

    #[tokio::test]
    async fn bounds_rooms_and_live_connections() {
        let db = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        migrate(&db).await.unwrap();
        let limits = Arc::new(CapacityLimits {
            max_rooms: 1,
            connections: Arc::new(Semaphore::new(1)),
        });
        let state = AppState {
            rooms: Arc::new(RwLock::new(HashMap::new())),
            db,
            limits: limits.clone(),
        };

        let first_permit = limits
            .try_connection()
            .expect("first connection is admitted");
        assert!(
            limits.try_connection().is_err(),
            "second concurrent connection must be rejected"
        );
        drop(first_permit);
        assert!(
            limits.try_connection().is_ok(),
            "capacity must return after disconnect"
        );

        register(
            ClientMessage::Create {
                client_id: "host-capacity-one".into(),
            },
            &state,
        )
        .await
        .unwrap();
        let error = register(
            ClientMessage::Create {
                client_id: "host-capacity-two".into(),
            },
            &state,
        )
        .await
        .unwrap_err();
        assert!(error.contains("rooms are busy"));
        assert_eq!(state.rooms.read().await.len(), 1);
    }

    #[tokio::test]
    async fn demo_workspace_is_seeded_isolated_resettable_and_ephemeral() {
        let db = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        migrate(&db).await.unwrap();
        let state = AppState {
            rooms: Arc::new(RwLock::new(HashMap::new())),
            db: db.clone(),
            limits: Arc::new(CapacityLimits::production()),
        };

        let client_id = "demo-browser-client".to_string();
        let (_, workspace_id, is_host) = register(
            ClientMessage::Demo {
                client_id: client_id.clone(),
            },
            &state,
        )
        .await
        .unwrap();
        assert!(workspace_id.starts_with("demo:"));
        assert!(is_host);
        {
            let rooms = state.rooms.read().await;
            let room = rooms.get(&workspace_id).unwrap();
            assert!(room.is_demo);
            assert_eq!(room.code, "DEMO");
            assert_eq!(room.players.len(), 2);
            assert_eq!(room.players[0].name, "Mina");
            assert_eq!(room.players[1].role, Role::Surge);
        }

        process_message(
            &state,
            &workspace_id,
            &client_id,
            true,
            ClientMessage::DemoAction {
                role: Role::Ward,
                action: Action::Build,
            },
        )
        .await;
        process_message(
            &state,
            &workspace_id,
            &client_id,
            true,
            ClientMessage::DemoAction {
                role: Role::Ward,
                action: Action::Share,
            },
        )
        .await;
        assert_eq!(state.rooms.read().await[&workspace_id].shield, 48.0);

        process_message(
            &state,
            &workspace_id,
            &client_id,
            true,
            ClientMessage::DemoReset,
        )
        .await;
        assert_eq!(state.rooms.read().await[&workspace_id].shield, 20.0);

        let inaccessible = register(
            ClientMessage::Join {
                code: "DEMO".into(),
                name: "Visitor".into(),
                client_id: "normal-player-client".into(),
            },
            &state,
        )
        .await
        .unwrap_err();
        assert!(inaccessible.contains("Room not found"));
        let page_views: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM daily_page_views")
            .fetch_one(&db)
            .await
            .unwrap();
        assert_eq!(
            page_views, 0,
            "demo play must not enter the page-view store"
        );

        disconnect(&state, &workspace_id, &client_id, true).await;
        assert!(state.rooms.read().await.is_empty());
    }
}
