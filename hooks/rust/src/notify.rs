//! HTTP notification to the Vibecraft WebSocket server.
//!
//! This module handles real-time event delivery to the Vibecraft visualization
//! server. Events are POSTed via HTTP to allow the browser client to receive
//! immediate updates.
//!
//! # Architecture
//!
//! ```text
//! Rust Hook ─────POST─────▶ WebSocket Server ─────WS─────▶ Browser
//!              /event              │
//!                                  ▼
//!                           Broadcast to clients
//! ```
//!
//! # Design Choices
//!
//! **Fire-and-forget threading**: The HTTP POST is spawned in a separate thread
//! to avoid blocking the hook. This is important because:
//!
//! 1. Hook latency directly affects Claude Code responsiveness
//! 2. Server may be down/slow - we don't want to block on that
//! 3. Events are also written to JSONL, so HTTP delivery is optional
//!
//! **Short timeout**: 2-second timeout ensures we don't hang indefinitely
//! if the server is unresponsive.
//!
//! **True fire-and-forget**: The spawned thread runs independently with no
//! synchronization. The HTTP request may or may not complete before the
//! process exits - this is acceptable since events are already persisted
//! to the JSONL file. This approach minimizes hook latency.

use serde::Serialize;
use std::thread;
use std::time::Duration;

/// Default WebSocket server endpoint for event notifications.
const DEFAULT_URL: &str = "http://localhost:4003/event";

/// HTTP request timeout in seconds.
///
/// Short timeout (2s) ensures we don't block the hook for too long
/// if the server is slow or unresponsive.
const TIMEOUT_SECS: u64 = 2;

/// Sends an event to the WebSocket server asynchronously.
///
/// The HTTP POST is performed in a separate thread to avoid blocking
/// the main hook execution. This is fire-and-forget - errors are silently
/// ignored since the event is also persisted to the JSONL file.
///
/// # Arguments
///
/// * `event` - Any serializable event to send
/// * `url` - Optional custom endpoint URL (defaults to `localhost:4003/event`)
///
/// # Thread Safety
///
/// The event is moved into the spawned thread, so it must be `Send + 'static`.
/// Serialization happens in the spawned thread to minimize main thread work.
///
/// # Example
///
/// ```ignore
/// notify_server(my_event, Some("http://custom:8080/event"));
/// // Thread spawned, function returns immediately
/// ```
pub fn notify_server<T: Serialize + Send + 'static>(event: T, url: Option<&str>) {
    let url = url.unwrap_or(DEFAULT_URL).to_string();

    thread::spawn(move || {
        let body = match serde_json::to_string(&event) {
            Ok(b) => b,
            Err(_) => return,
        };

        let _ = ureq::post(&url)
            .timeout(Duration::from_secs(TIMEOUT_SECS))
            .set("Content-Type", "application/json")
            .send(body.as_bytes());
    });
}

/// Checks if WebSocket notifications are enabled.
///
/// Notifications can be disabled by setting `VIBECRAFT_ENABLE_WS_NOTIFY=false`.
/// Any other value (including unset) means notifications are enabled.
///
/// # Returns
///
/// `true` if notifications should be sent, `false` otherwise.
///
/// # Environment Variable
///
/// `VIBECRAFT_ENABLE_WS_NOTIFY`:
/// - Not set → enabled (default)
/// - `"false"` (case-insensitive) → disabled
/// - Any other value → enabled
pub fn is_notify_enabled() -> bool {
    std::env::var("VIBECRAFT_ENABLE_WS_NOTIFY")
        .map(|v| v.to_lowercase() != "false")
        .unwrap_or(true)
}

/// Returns the WebSocket notification endpoint URL.
///
/// Reads from `VIBECRAFT_WS_NOTIFY` environment variable, falling back
/// to `http://localhost:4003/event` if not set.
///
/// # Returns
///
/// The URL to POST events to.
///
/// # Environment Variable
///
/// `VIBECRAFT_WS_NOTIFY`:
/// - Not set → `http://localhost:4003/event`
/// - Set → use the provided value
pub fn get_notify_url() -> String {
    std::env::var("VIBECRAFT_WS_NOTIFY").unwrap_or_else(|_| DEFAULT_URL.to_string())
}
