use http::{HeaderMap, HeaderName, HeaderValue};
use reqwest::blocking::{Client, Response};
use serde::{Deserialize, Serialize};
use std::str::FromStr;

#[derive(Serialize, Deserialize, Debug)]
pub struct KeyValuePair {
    key: String,
    value: String,
    enabled: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RequestPayload {
    method: String,
    url: String,
    params: Vec<KeyValuePair>,
    headers: Vec<KeyValuePair>,
    body: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ResponsePayload {
    status_code: u16,
    headers: Vec<KeyValuePair>,
    body: String,
}

#[tauri::command]
fn invoke_http_request(request_payload: RequestPayload) -> Result<ResponsePayload, String> {
    let client: Client = Client::new();

    let method = reqwest::Method::from_str(&request_payload.method.to_uppercase())
        .unwrap_or(reqwest::Method::GET);

    let header_map: HeaderMap = request_payload
        .headers
        .into_iter()
        .filter(|header| header.enabled)
        .filter_map(|header| {
            let key = HeaderName::from_str(&header.key).ok()?;
            let value = HeaderValue::from_str(&header.value).ok()?;
            Some((key, value))
        })
        .collect();

    let query_params: Vec<(String, String)> = request_payload
        .params
        .into_iter()
        .filter(|p| p.enabled && !p.key.is_empty())
        .map(|p| (p.key, p.value))
        .collect();

    let response: Response = match client
        .request(method, &request_payload.url)
        .headers(header_map)
        .query(&query_params)
        .body(request_payload.body)
        .send()
    {
        Ok(res) => res,
        Err(err) => {
            return Err(format!("Network error: {}", err));
        }
    };

    let status = response.status();

    let headers: Vec<KeyValuePair> = response
        .headers()
        .iter()
        .map(|(key, value)| KeyValuePair {
            key: key.to_string(),
            value: String::from_utf8_lossy(value.as_bytes()).to_string(),
            enabled: true,
        })
        .collect();

    let body = response.text().unwrap_or_default();

    let response_payload = ResponsePayload {
        status_code: status.as_u16(),
        body,
        headers,
    };

    Ok(response_payload)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![invoke_http_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
