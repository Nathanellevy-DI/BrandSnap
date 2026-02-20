use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, State};
use serde::{Serialize, Deserialize};
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;

#[derive(Serialize, Deserialize, Clone, Debug)]
struct PageMetadata {
    title: String,
    description: String,
    favicon: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ImageInfo {
    src: String,
    alt: String,
    width: u32,
    height: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct TextBlock {
    tag: String,
    text: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct AnalysisResult {
    colors: Vec<String>,
    fonts: Vec<String>,
    images: Vec<ImageInfo>,
    text_content: Vec<TextBlock>,
    metadata: PageMetadata,
}

struct AppState {
    pending_analysis: Arc<Mutex<Option<oneshot::Sender<Result<AnalysisResult, String>>>>>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn complete_analysis(state: State<'_, AppState>, data: AnalysisResult) -> Result<(), String> {
    println!("Received analysis data: {:?}", data.metadata.title);
    if let Some(tx) = state.pending_analysis.lock().unwrap().take() {
        let _ = tx.send(Ok(data));
        Ok(())
    } else {
        Err("No pending analysis found".to_string())
    }
}

#[tauri::command]
async fn analyze_page(app: AppHandle, state: State<'_, AppState>, url: String) -> Result<AnalysisResult, String> {
    println!("Analyzing URL: {}", url);
    let label = "scraper-window";

    // Close existing window if any
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.close();
    }

    let (tx, rx) = oneshot::channel();
    
    // Store the sender in the state
    {
        let mut pending = state.pending_analysis.lock().unwrap();
        *pending = Some(tx);
    }

    let script = include_str!("scraper.js");

    let mut builder = WebviewWindowBuilder::new(&app, label, WebviewUrl::External(url.parse().map_err(|e: url::ParseError| e.to_string())?))
        .title("BrandSnap Scraper")
        .visible(false) 
        .initialization_script(script);

    let window = builder.build().map_err(|e| e.to_string())?;

    // Wait for result with timeout
    let result = match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
        Ok(Ok(Ok(data))) => Ok(data),
        Ok(Ok(Err(e))) => Err(format!("Analysis failed: {}", e)),
        Ok(Err(_)) => Err("Failed to receive analysis result (channel closed)".to_string()),
        Err(_) => Err("Analysis timed out (30s)".to_string()),
    };

    println!("Analysis finished with result: {:?}", result.is_ok());

    let _ = window.close();
    
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            pending_analysis: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![greet, analyze_page, complete_analysis])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
