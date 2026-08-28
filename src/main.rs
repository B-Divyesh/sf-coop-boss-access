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
        State,
    },
    http::{header, HeaderValue, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use tokio::sync::{mpsc, RwLock};
use tower_http::{services::{ServeDir, ServeFile}, trace::TraceLayer};
use tracing::{info, warn};

const ROUND_SECONDS: f32 = 180.0;
const ACTION_COOLDOWN: Duration = Duration::from_millis(110);

#[derive(Clone)]
struct AppState {
    rooms: Arc<RwLock<HashMap<String, Room>>>,
    db: SqlitePool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Phase {
    Lobby,
    Playing,
    Won,
    Lost,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
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
    Create { client_id: String },
    Join { code: String, name: String, client_id: String },
    Start,
    Restart,
    Action { action: Action },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Action {
    Build,
    Share,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let database_url = std::env::var("DATABASE_URL").ok();
    let database_source = if database_url.is_some() { "supplied" } else { "default" };
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

    let state = AppState { rooms: Arc::new(RwLock::new(HashMap::new())), db };
    tokio::spawn(game_clock(state.clone()));

    let app = app(state);
    let port_value = std::env::var("PORT").ok();
    let port_source = if port_value.is_some() { "supplied" } else { "default" };
    let port: u16 = port_value.and_then(|v| v.parse().ok()).unwrap_or(8080);
    let address = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(address).await.expect("bind server");
    info!(%address, database_source, port_source, "runtime configuration ready; coop boss server ready");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("serve application");
}

fn app(state: AppState) -> Router {
    let dist = std::env::var("DIST_DIR").unwrap_or_else(|_| "dist".into());
    let fallback = ServeDir::new(&dist).fallback(ServeFile::new(Path::new(&dist).join("index.html")));
    Router::new()
        .route("/health", get(health))
        .route("/api/pageview", post(pageview))
        .route("/ws", get(ws_handler))
        .fallback_service(fallback)
        .layer(middleware::from_fn(security_headers))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
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
    let day = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() / 86_400;
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
    headers.insert(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    headers.insert(header::REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static("default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws: wss:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"),
    );
    if path.starts_with("/assets/") || path.starts_with("/fonts/") || path.starts_with("/art/") {
        headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("public, max-age=31536000, immutable"));
    } else {
        headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    }
    response
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.max_message_size(4096).on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let first = match tokio::time::timeout(Duration::from_secs(10), socket.recv()).await {
        Ok(Some(Ok(Message::Text(text)))) => serde_json::from_str::<ClientMessage>(&text),
        _ => return,
    };
    let first = match first {
        Ok(message) => message,
        Err(_) => {
            let _ = send_direct(&mut socket, &ServerMessage::Error { message: "That connection request was not understood.".into(), recoverable: false }).await;
            return;
        }
    };

    let (client_id, room_code, is_host) = match register(first, &state).await {
        Ok(context) => context,
        Err(message) => {
            let _ = send_direct(&mut socket, &ServerMessage::Error { message, recoverable: true }).await;
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

async fn register(message: ClientMessage, state: &AppState) -> Result<(String, String, bool), String> {
    match message {
        ClientMessage::Create { client_id } if valid_id(&client_id) => {
            let mut rooms = state.rooms.write().await;
            let code = make_code(&rooms);
            rooms.insert(code.clone(), Room::new(code.clone()));
            Ok((client_id, code, true))
        }
        ClientMessage::Join { code, name, client_id } if valid_id(&client_id) => {
            let code = normalize_code(&code)?;
            let name = normalize_name(&name)?;
            let mut rooms = state.rooms.write().await;
            let room = rooms.get_mut(&code).ok_or_else(|| "Room not found. Check the four-character code and try again.".to_string())?;
            if room.phase != Phase::Lobby && !room.players.iter().any(|p| p.id == client_id) {
                return Err("That round has already started. Ask the host to begin a new room.".into());
            }
            if let Some(player) = room.players.iter_mut().find(|p| p.id == client_id) {
                player.connected = true;
                player.name = name;
            } else {
                if room.players.len() >= 8 { return Err("This room is full (8 players).".into()); }
                let ward_count = room.players.iter().filter(|p| p.role == Role::Ward).count();
                let surge_count = room.players.len() - ward_count;
                let role = if ward_count <= surge_count { Role::Ward } else { Role::Surge };
                room.players.push(Player { id: client_id.clone(), name, role, meter: 0.0, connected: true, last_action: None });
            }
            Ok((client_id, code, false))
        }
        _ => Err("Start by creating a room or joining with a valid code.".into()),
    }
}

async fn process_message(state: &AppState, code: &str, client_id: &str, is_host: bool, message: ClientMessage) {
    let mut rooms = state.rooms.write().await;
    let Some(room) = rooms.get_mut(code) else { return; };
    match message {
        ClientMessage::Start if is_host => start_round(room),
        ClientMessage::Restart if is_host => start_round(room),
        ClientMessage::Action { action } if !is_host && room.phase == Phase::Playing => {
            let now = Instant::now();
            let Some(player) = room.players.iter_mut().find(|p| p.id == client_id) else { return; };
            if player.last_action.is_some_and(|last| now.duration_since(last) < ACTION_COOLDOWN) { return; }
            player.last_action = Some(now);
            match action {
                Action::Build => {
                    player.meter = (player.meter + 10.0).min(100.0);
                    room.announcement = format!("{} built {} charge", player.name, if player.role == Role::Ward { "ward" } else { "surge" });
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
                            room.announcement = format!("{} boosted every team strike", player.name);
                        }
                    }
                }
                Action::Share => room.announcement = format!("{} needs 40 charge to share", player.name),
            }
        }
        _ => return,
    }
    broadcast_room(room);
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
    for player in &mut room.players { player.meter = 0.0; }
}

async fn disconnect(state: &AppState, code: &str, client_id: &str, is_host: bool) {
    let mut rooms = state.rooms.write().await;
    if is_host {
        if let Some(room) = rooms.remove(code) {
            let message = encode(&ServerMessage::RoomClosed { message: "The host closed this room. Return home to join another.".into() });
            for sender in room.connections.values() { let _ = sender.send(Message::Text(message.clone().into())); }
        }
    } else if let Some(room) = rooms.get_mut(code) {
        room.connections.remove(client_id);
        if room.phase == Phase::Lobby {
            room.players.retain(|player| player.id != client_id);
        } else if let Some(player) = room.players.iter_mut().find(|player| player.id == client_id) {
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
        for room in rooms.values_mut().filter(|room| room.phase == Phase::Playing) {
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
    if boosted { room.boost = (room.boost - delta * 7.0).max(0.0); }

    if room.next_hit <= 0.0 {
        room.next_hit += 7.0;
        let incoming = 14.0;
        let absorbed = room.shield.min(incoming);
        room.shield -= absorbed;
        let damage = incoming - absorbed;
        room.team_hp = (room.team_hp - damage).max(0.0);
        room.announcement = if damage == 0.0 { "Shield caught the dragon's hit!".into() } else { format!("Dragon hit the team for {}", damage.round()) };
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
        }
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
            players: self.players.iter().map(|player| PlayerView {
                id: player.id.clone(),
                name: player.name.clone(),
                role: player.role,
                meter: player.meter.round(),
                connected: player.connected,
            }).collect(),
        }
    }
}

fn broadcast_room(room: &Room) {
    let message = Message::Text(encode(&ServerMessage::State { room: room.view() }).into());
    for sender in room.connections.values() { let _ = sender.send(message.clone()); }
}

async fn send_direct(socket: &mut WebSocket, message: &ServerMessage) -> Result<(), axum::Error> {
    socket.send(Message::Text(encode(message).into())).await
}

fn encode(message: &ServerMessage) -> String {
    serde_json::to_string(message).expect("serialize server message")
}

fn normalize_code(value: &str) -> Result<String, String> {
    let code: String = value.trim().to_ascii_uppercase().chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    if code.len() == 4 { Ok(code) } else { Err("Room codes have four letters or numbers.".into()) }
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
        let code: String = (0..4).map(|_| ALPHABET[rng.random_range(0..ALPHABET.len())] as char).collect();
        if !rooms.contains_key(&code) { return code; }
    }
}

async fn shutdown_signal() {
    let ctrl_c = async { tokio::signal::ctrl_c().await.expect("install Ctrl+C handler") };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install signal handler").recv().await;
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
        let db = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        migrate(&db).await.unwrap();
        let service = app(AppState { rooms: Arc::new(RwLock::new(HashMap::new())), db: db.clone() });

        let health_response = service.clone().oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(health_response.status(), StatusCode::OK);
        let body = health_response.into_body().collect().await.unwrap().to_bytes();
        let health_json = String::from_utf8_lossy(&body);
        assert!(health_json.contains("\"status\":\"ok\""));
        assert!(health_json.contains("\"build\":\"dev\""));

        let count_response = service.oneshot(Request::builder().method("POST").uri("/api/pageview").body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(count_response.status(), StatusCode::NO_CONTENT);
        let views: i64 = sqlx::query_scalar("SELECT views FROM daily_page_views LIMIT 1").fetch_one(&db).await.unwrap();
        assert_eq!(views, 1);
    }
}
