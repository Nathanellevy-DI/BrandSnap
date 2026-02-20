use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, State};
use serde::{Serialize, Deserialize};
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;
use scraper::{Html, Selector};
use url::Url;

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

/// Data returned by the browser-side JS scraper (colors + fonts)
#[derive(Serialize, Deserialize, Clone, Debug)]
struct BrowserAnalysis {
    colors: Vec<String>,
    fonts: Vec<String>,
    metadata: PageMetadata,
}

/// The full analysis result sent to the frontend (browser data + server-side scrape)
#[derive(Serialize, Deserialize, Clone, Debug)]
struct AnalysisResult {
    colors: Vec<String>,
    fonts: Vec<String>,
    images: Vec<ImageInfo>,
    text_content: Vec<TextBlock>,
    metadata: PageMetadata,
}

struct AppState {
    pending_analysis: Arc<Mutex<Option<oneshot::Sender<Result<BrowserAnalysis, String>>>>>,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn complete_analysis(state: State<'_, AppState>, data: BrowserAnalysis) -> Result<(), String> {
    println!("Received browser analysis data: {:?}", data.metadata.title);
    if let Some(tx) = state.pending_analysis.lock().unwrap().take() {
        let _ = tx.send(Ok(data));
        Ok(())
    } else {
        Err("No pending analysis found".to_string())
    }
}

/// Server-side scraper: fetches HTML via HTTP and parses text + images
/// This replicates the Python webscrap.py approach using reqwest + scraper (BeautifulSoup equivalent)
async fn server_side_scrape(url_str: &str) -> Result<(Vec<ImageInfo>, Vec<TextBlock>), String> {
    println!("[server-side scrape] Fetching URL: {}", url_str);

    let base_url = Url::parse(url_str).map_err(|e| format!("Invalid URL: {}", e))?;

    // HTTP GET with a browser-like User-Agent (same as webscrap.py)
    let client = reqwest::Client::new();
    let response = client
        .get(url_str)
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let html_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let document = Html::parse_document(&html_text);

    // ── Extract Images (like webscrap.py: soup.find_all("img")) ──
    let mut images: Vec<ImageInfo> = Vec::new();
    let mut seen_urls: std::collections::HashSet<String> = std::collections::HashSet::new();

    // <img> tags
    if let Ok(img_selector) = Selector::parse("img") {
        for el in document.select(&img_selector) {
            if let Some(src) = el.value().attr("src").or(el.value().attr("data-src")) {
                // Resolve relative URLs (like webscrap.py: urljoin(url, src))
                let full_url = base_url.join(src).map(|u| u.to_string()).unwrap_or_else(|_| src.to_string());
                if full_url.starts_with("data:") || seen_urls.contains(&full_url) {
                    continue;
                }
                seen_urls.insert(full_url.clone());
                let alt = el.value().attr("alt").unwrap_or("").to_string();
                let width = el.value().attr("width").and_then(|w| w.parse().ok()).unwrap_or(0);
                let height = el.value().attr("height").and_then(|h| h.parse().ok()).unwrap_or(0);
                images.push(ImageInfo { src: full_url, alt, width, height });
            }
        }
    }

    // <picture> <source> tags
    if let Ok(source_selector) = Selector::parse("picture source") {
        for el in document.select(&source_selector) {
            if let Some(srcset) = el.value().attr("srcset") {
                let src = srcset.split(',').next().unwrap_or("").trim().split(' ').next().unwrap_or("");
                if !src.is_empty() {
                    let full_url = base_url.join(src).map(|u| u.to_string()).unwrap_or_else(|_| src.to_string());
                    if !full_url.starts_with("data:") && !seen_urls.contains(&full_url) {
                        seen_urls.insert(full_url.clone());
                        images.push(ImageInfo { src: full_url, alt: String::new(), width: 0, height: 0 });
                    }
                }
            }
        }
    }

    println!("[server-side scrape] Found {} images", images.len());

    // ── Extract Text (like webscrap.py: soup.get_text()) ──
    let mut text_blocks: Vec<TextBlock> = Vec::new();
    let mut seen_text: std::collections::HashSet<String> = std::collections::HashSet::new();

    let text_tags = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote", "figcaption"];

    for tag_name in &text_tags {
        if let Ok(selector) = Selector::parse(tag_name) {
            for el in document.select(&selector) {
                let text: String = el.text().collect::<Vec<_>>().join(" ").trim().to_string();
                if text.len() >= 3 && !seen_text.contains(&text) {
                    seen_text.insert(text.clone());
                    text_blocks.push(TextBlock {
                        tag: tag_name.to_uppercase(),
                        text,
                    });
                }
            }
        }
    }

    println!("[server-side scrape] Found {} text blocks", text_blocks.len());

    // Cap results
    images.truncate(50);
    text_blocks.truncate(100);

    Ok((images, text_blocks))
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

    let builder = WebviewWindowBuilder::new(&app, label, WebviewUrl::External(url.parse().map_err(|e: url::ParseError| e.to_string())?))
        .title("BrandSnap Scraper")
        .visible(false) 
        .initialization_script(script);

    let window = builder.build().map_err(|e| e.to_string())?;

    // Run BOTH scrapers in parallel:
    // 1. Browser-side JS scraper (for colors + fonts — needs CSS computation)
    // 2. Server-side HTTP scraper (for images + text — like webscrap.py)
    let url_clone = url.clone();
    let server_scrape_handle = tokio::spawn(async move {
        server_side_scrape(&url_clone).await
    });

    // Wait for browser analysis with timeout
    let browser_result = match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
        Ok(Ok(Ok(data))) => Ok(data),
        Ok(Ok(Err(e))) => Err(format!("Analysis failed: {}", e)),
        Ok(Err(_)) => Err("Failed to receive analysis result (channel closed)".to_string()),
        Err(_) => Err("Analysis timed out (30s)".to_string()),
    };

    let _ = window.close();

    let browser_data = browser_result?;

    // Wait for server-side scrape
    let (images, text_content) = match server_scrape_handle.await {
        Ok(Ok(data)) => data,
        Ok(Err(e)) => {
            println!("Server-side scrape failed (non-fatal): {}", e);
            (Vec::new(), Vec::new())
        },
        Err(e) => {
            println!("Server-side scrape task failed (non-fatal): {}", e);
            (Vec::new(), Vec::new())
        },
    };

    println!("Analysis finished — colors: {}, fonts: {}, images: {}, text: {}",
        browser_data.colors.len(), browser_data.fonts.len(), images.len(), text_content.len());

    // Combine both results
    Ok(AnalysisResult {
        colors: browser_data.colors,
        fonts: browser_data.fonts,
        images,
        text_content,
        metadata: browser_data.metadata,
    })
}

/// Download an image from a URL and save it to ~/Downloads
#[tauri::command]
async fn download_image(url: String) -> Result<String, String> {
    println!("Downloading image: {}", url);

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    let bytes = response.bytes().await.map_err(|e| format!("Failed to read image: {}", e))?;

    // Extract filename from URL
    let parsed_url = Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;
    let filename = parsed_url.path_segments()
        .and_then(|segs| segs.last())
        .and_then(|name| if name.is_empty() { None } else { Some(name.to_string()) })
        .unwrap_or_else(|| "image.png".to_string());

    // Save to ~/Downloads
    let downloads_dir = dirs::download_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    let save_path = downloads_dir.join(&filename);

    std::fs::write(&save_path, &bytes).map_err(|e| format!("Failed to save file: {}", e))?;

    println!("Image saved to: {:?}", save_path);
    Ok(save_path.to_string_lossy().to_string())
}

/// Open a URL in the system's default browser
#[tauri::command]
async fn open_in_browser(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| format!("Failed to open URL: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            pending_analysis: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![greet, analyze_page, complete_analysis, download_image, open_in_browser])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
