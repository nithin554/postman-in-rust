use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    Client, Method,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    error::Error as StdError,
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

/// Hard cap for a response body kept in memory / sent over IPC.
const MAX_BODY_BYTES: usize = 20 * 1024 * 1024;
const WORKSPACE_FILE: &str = "workspace.json";

fn yes() -> bool {
    true
}

pub struct AppState {
    cancellations: Mutex<HashMap<String, oneshot::Sender<()>>>,
    cookies: Mutex<Arc<reqwest::cookie::Jar>>,
}

impl AppState {
    fn new() -> Self {
        Self {
            cancellations: Mutex::new(HashMap::new()),
            cookies: Mutex::new(Arc::new(reqwest::cookie::Jar::default())),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldInput {
    pub key: String,
    pub value: String,
    #[serde(default = "yes")]
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "mode", rename_all = "camelCase")]
pub enum BodyInput {
    None,
    Raw {
        content: String,
    },
    Urlencoded {
        #[serde(default)]
        params: Vec<FieldInput>,
    },
    Formdata {
        #[serde(default)]
        params: Vec<FieldInput>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequestInput {
    pub request_id: String,
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<FieldInput>,
    #[serde(default)]
    pub body: Option<BodyInput>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default = "yes")]
    pub follow_redirects: bool,
    #[serde(default = "yes")]
    pub verify_tls: bool,
    #[serde(default = "yes")]
    pub cookie_jar: bool,
    #[serde(default)]
    pub proxy: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseHeader {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResult {
    pub request_id: String,
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<ResponseHeader>,
    pub body: String,
    /// `text` or `base64`
    pub body_encoding: String,
    pub size_bytes: usize,
    pub elapsed_ms: u64,
    pub content_type: String,
    pub final_url: String,
    pub http_version: String,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedFile {
    pub name: String,
    pub path: String,
    pub contents: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: &'static str,
    pub version: &'static str,
    pub runtime: &'static str,
    pub platform: String,
    pub arch: &'static str,
}

fn describe_error(context: &str, error: &reqwest::Error) -> String {
    let detail = root_cause(error);
    if error.is_timeout() {
        format!("{context}: the request timed out")
    } else if error.is_connect() {
        format!("{context}: could not connect ({detail})")
    } else if error.is_redirect() {
        format!("{context}: too many redirects")
    } else {
        format!("{context}: {detail}")
    }
}

fn root_cause(error: &reqwest::Error) -> String {
    let mut message = error.to_string();
    let mut source = error.source();
    while let Some(current) = source {
        let text = current.to_string();
        if !text.is_empty() {
            message = text;
        }
        source = current.source();
    }
    message
}

fn build_headers(fields: &[FieldInput]) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    for field in fields.iter().filter(|f| f.enabled && !f.key.trim().is_empty()) {
        let name = HeaderName::from_bytes(field.key.trim().as_bytes())
            .map_err(|_| format!("`{}` is not a valid header name.", field.key.trim()))?;
        let value = HeaderValue::from_str(&field.value)
            .map_err(|_| format!("The value for `{}` contains invalid characters.", field.key.trim()))?;
        headers.append(name, value);
    }
    Ok(headers)
}

async fn execute_request(
    input: HttpRequestInput,
    cookies: Arc<reqwest::cookie::Jar>,
) -> Result<HttpResult, String> {
    let url = reqwest::Url::parse(input.url.trim())
        .map_err(|error| format!("That URL could not be parsed: {error}"))?;

    let method = Method::from_bytes(input.method.trim().to_uppercase().as_bytes())
        .map_err(|_| format!("`{}` is not a supported HTTP method.", input.method))?;

    let headers = build_headers(&input.headers)?;

    let mut builder = Client::builder()
        .user_agent(format!(
            "Courier/{} (Tauri; +https://github.com/nithin554/postman-in-rust)",
            env!("CARGO_PKG_VERSION")
        ))
        .timeout(Duration::from_millis(
            input.timeout_ms.unwrap_or(30_000).clamp(300, 600_000),
        ))
        .redirect(if input.follow_redirects {
            reqwest::redirect::Policy::limited(10)
        } else {
            reqwest::redirect::Policy::none()
        })
        .danger_accept_invalid_certs(!input.verify_tls);

    if input.cookie_jar {
        builder = builder.cookie_provider(cookies);
    }

    if let Some(proxy) = input
        .proxy
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        builder = builder.proxy(
            reqwest::Proxy::all(proxy)
                .map_err(|error| format!("The proxy address is invalid: {error}"))?,
        );
    }

    let client = builder
        .build()
        .map_err(|error| format!("Could not initialize the HTTP client: {error}"))?;

    let mut request = client.request(method, url).headers(headers);

    match input.body.unwrap_or(BodyInput::None) {
        BodyInput::None => {}
        BodyInput::Raw { content } => {
            request = request.body(content);
        }
        BodyInput::Urlencoded { params } => {
            let pairs: Vec<(String, String)> = params
                .into_iter()
                .filter(|p| p.enabled && !p.key.is_empty())
                .map(|p| (p.key, p.value))
                .collect();
            request = request.form(&pairs);
        }
        BodyInput::Formdata { params } => {
            let mut form = reqwest::multipart::Form::new();
            for param in params
                .into_iter()
                .filter(|p| p.enabled && !p.key.is_empty())
            {
                form = form.text(param.key, param.value);
            }
            request = request.multipart(form);
        }
    }

    let started = Instant::now();
    let response = request
        .send()
        .await
        .map_err(|error| describe_error("Request failed", &error))?;

    let status = response.status();
    let final_url = response.url().to_string();
    let http_version = format!("{:?}", response.version());
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .map(|value| String::from_utf8_lossy(value.as_bytes()).to_string())
        .unwrap_or_default();

    let headers: Vec<ResponseHeader> = response
        .headers()
        .iter()
        .map(|(key, value)| ResponseHeader {
            key: key.as_str().to_string(),
            value: String::from_utf8_lossy(value.as_bytes()).to_string(),
        })
        .collect();

    let mut response = response;
    let mut collected: Vec<u8> = Vec::new();
    let mut truncated = false;

    loop {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                if collected.len() + chunk.len() > MAX_BODY_BYTES {
                    let remaining = MAX_BODY_BYTES.saturating_sub(collected.len());
                    collected.extend_from_slice(&chunk[..remaining]);
                    truncated = true;
                    break;
                }
                collected.extend_from_slice(&chunk);
            }
            Ok(None) => break,
            Err(error) => {
                return Err(describe_error(
                    "The connection dropped while reading the response",
                    &error,
                ))
            }
        }
    }

    let elapsed_ms = started.elapsed().as_millis() as u64;
    let size_bytes = collected.len();

    let looks_textual = content_type.is_empty()
        || content_type.starts_with("text/")
        || content_type.contains("json")
        || content_type.contains("xml")
        || content_type.contains("javascript")
        || content_type.contains("ecmascript")
        || content_type.contains("svg")
        || content_type.contains("x-www-form-urlencoded")
        || content_type.contains("graphql");

    let has_nul = collected.iter().any(|byte| *byte == 0);

    let (body, body_encoding) = if looks_textual && !has_nul {
        match String::from_utf8(collected) {
            Ok(text) => (text, "text"),
            Err(error) => (BASE64.encode(error.into_bytes()), "base64"),
        }
    } else {
        (BASE64.encode(&collected), "base64")
    };

    Ok(HttpResult {
        request_id: input.request_id,
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or_default().to_string(),
        headers,
        body,
        body_encoding: body_encoding.to_string(),
        size_bytes,
        elapsed_ms,
        content_type,
        final_url,
        http_version,
        truncated,
    })
}

#[tauri::command]
async fn send_request(
    state: State<'_, AppState>,
    input: HttpRequestInput,
) -> Result<HttpResult, String> {
    let request_id = input.request_id.clone();
    let (cancel_tx, cancel_rx) = oneshot::channel();

    {
        let mut pending = state
            .cancellations
            .lock()
            .map_err(|_| "The request state is unavailable.".to_string())?;
        pending.insert(request_id.clone(), cancel_tx);
    }

    let cookies = state
        .cookies
        .lock()
        .map(|jar| jar.clone())
        .unwrap_or_default();

    let result = tokio::select! {
        result = execute_request(input, cookies) => result,
        _ = cancel_rx => Err("The request was cancelled.".to_string()),
    };

    if let Ok(mut pending) = state.cancellations.lock() {
        pending.remove(&request_id);
    }

    result
}

#[tauri::command]
fn cancel_request(state: State<'_, AppState>, request_id: String) -> Result<(), String> {
    if let Ok(mut pending) = state.cancellations.lock() {
        if let Some(sender) = pending.remove(&request_id) {
            let _ = sender.send(());
        }
    }
    Ok(())
}

#[tauri::command]
fn clear_cookies(state: State<'_, AppState>) -> Result<(), String> {
    let mut jar = state
        .cookies
        .lock()
        .map_err(|_| "The cookie state is unavailable.".to_string())?;
    *jar = Arc::new(reqwest::cookie::Jar::default());
    Ok(())
}

fn workspace_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve the app data folder: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create the app data folder: {error}"))?;
    Ok(dir.join(WORKSPACE_FILE))
}

#[tauri::command]
fn load_workspace(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    let path = workspace_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read the saved workspace: {error}"))?;

    match serde_json::from_str::<serde_json::Value>(&contents) {
        Ok(value) if value.is_object() => Ok(Some(value)),
        Ok(_) => Err("The saved workspace is not a JSON object.".to_string()),
        Err(error) => {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let backup = path.with_file_name(format!("workspace.corrupt-{stamp}.json"));
            let _ = fs::rename(&path, &backup);
            Err(format!(
                "The saved workspace could not be read ({error}). It was backed up so you can start fresh."
            ))
        }
    }
}

#[tauri::command]
fn save_workspace(app: AppHandle, workspace: serde_json::Value) -> Result<(), String> {
    if !workspace.is_object() {
        return Err("Refusing to save an invalid workspace.".to_string());
    }

    let path = workspace_path(&app)?;
    let temp = path.with_extension("json.tmp");
    let contents = serde_json::to_string_pretty(&workspace)
        .map_err(|error| format!("Could not serialize the workspace: {error}"))?;

    fs::write(&temp, contents)
        .map_err(|error| format!("Could not write the workspace: {error}"))?;
    fs::rename(&temp, &path)
        .map_err(|error| format!("Could not finalize the workspace file: {error}"))?;
    Ok(())
}

#[tauri::command]
async fn import_json_file(app: AppHandle) -> Result<Option<ImportedFile>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Import collections, environments, or a workspace")
        .add_filter("JSON files", &["json"])
        .blocking_pick_file();

    let Some(file_path) = picked else {
        return Ok(None);
    };

    let path = file_path
        .into_path()
        .map_err(|error| format!("Could not resolve the selected file: {error}"))?;
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read the selected file: {error}"))?;
    let name = path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "import.json".to_string());

    Ok(Some(ImportedFile {
        name,
        path: path.to_string_lossy().to_string(),
        contents,
    }))
}

#[tauri::command]
async fn export_json_file(
    app: AppHandle,
    default_name: String,
    contents: String,
) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Export")
        .set_file_name(&default_name)
        .add_filter("JSON files", &["json"])
        .blocking_save_file();

    let Some(file_path) = picked else {
        return Ok(None);
    };

    let mut path = file_path
        .into_path()
        .map_err(|error| format!("Could not resolve the export location: {error}"))?;
    if path.extension().is_none() {
        path.set_extension("json");
    }

    fs::write(&path, contents)
        .map_err(|error| format!("Could not write the file: {error}"))?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "Courier",
        version: env!("CARGO_PKG_VERSION"),
        runtime: "Tauri 2 · Rust",
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            send_request,
            cancel_request,
            clear_cookies,
            load_workspace,
            save_workspace,
            import_json_file,
            export_json_file,
            app_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Courier application");
}
