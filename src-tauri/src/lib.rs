use reqwest::blocking::{Client, Response};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust Modified!", name)
}

#[tauri::command]
fn invoke_http_request(http_method: &str, url: &str, _body: &str) -> String {
    let response: Result<String, String> = match http_method {
        "GET" => invoke_get_request(url, _body),
        _ => Err("Not Implemented Yet".to_string()),
    };
    response.unwrap_or_else(|res| res)
}

fn invoke_get_request(url: &str, _body: &str) -> Result<String, String> {
    let client: Client = Client::new();

    let response: Response = match client.get(url).send() {
        Ok(res) => res,
        Err(err) => {
            return Err(format!("Network error: {}", err));
        }
    };

    let status = response.status();
    let body = response.text().unwrap_or_default();

    if !status.is_success() {
        return Err(format!(
            "Request failed with http status code {} and response {}",
            status.as_u16(),
            body
        ));
    }

    Ok(body)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, invoke_http_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
