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

/// Data returned by the browser-side JS scraper (colors + fonts + browser-visible images/text)
#[derive(Serialize, Deserialize, Clone, Debug)]
struct BrowserAnalysis {
    colors: Vec<String>,
    fonts: Vec<String>,
    #[serde(default)]
    images: Vec<ImageInfo>,
    #[serde(default)]
    text_content: Vec<TextBlock>,
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

    // HTTP GET with full browser-like headers to bypass anti-bot measures
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(url_str)
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Accept-Encoding", "gzip, deflate, br")
        .header("Connection", "keep-alive")
        .header("Upgrade-Insecure-Requests", "1")
        .header("Sec-Fetch-Dest", "document")
        .header("Sec-Fetch-Mode", "navigate")
        .header("Sec-Fetch-Site", "none")
        .header("Sec-Fetch-User", "?1")
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
            let alt = el.value().attr("alt").unwrap_or("").to_string();
            let width = el.value().attr("width").and_then(|w| w.parse().ok()).unwrap_or(0);
            let height = el.value().attr("height").and_then(|h| h.parse().ok()).unwrap_or(0);

            // Check ALL possible image source attributes
            let attrs = ["src", "data-src", "data-lazy-src", "data-original",
                         "data-lazy", "data-url", "data-image", "data-bg",
                         "data-hi-res-src", "data-retina", "data-full-src",
                         "data-zoom-image", "data-large-file", "data-medium-file"];
            for attr in &attrs {
                if let Some(src) = el.value().attr(attr) {
                    let src_clean = src.split(',').next().unwrap_or("").trim().split(' ').next().unwrap_or("");
                    if !src_clean.is_empty() {
                        let full_url = base_url.join(src_clean).map(|u| u.to_string()).unwrap_or_else(|_| src_clean.to_string());
                        if !full_url.starts_with("data:") && !seen_urls.contains(&full_url) {
                            seen_urls.insert(full_url.clone());
                            images.push(ImageInfo { src: full_url, alt: alt.clone(), width, height });
                        }
                    }
                }
            }

            // Also extract ALL entries from srcset
            if let Some(srcset) = el.value().attr("srcset") {
                for entry in srcset.split(',') {
                    let src = entry.trim().split(' ').next().unwrap_or("");
                    if !src.is_empty() {
                        let full_url = base_url.join(src).map(|u| u.to_string()).unwrap_or_else(|_| src.to_string());
                        if !full_url.starts_with("data:") && !seen_urls.contains(&full_url) {
                            seen_urls.insert(full_url.clone());
                            images.push(ImageInfo { src: full_url, alt: alt.clone(), width: 0, height: 0 });
                        }
                    }
                }
            }
        }
    }

    // <picture> <source> tags — extract ALL srcset entries
    if let Ok(source_selector) = Selector::parse("source[srcset]") {
        for el in document.select(&source_selector) {
            if let Some(srcset) = el.value().attr("srcset").or(el.value().attr("data-srcset")) {
                for entry in srcset.split(',') {
                    let src = entry.trim().split(' ').next().unwrap_or("");
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
    }

    // <a> tags linking directly to image files
    if let Ok(a_selector) = Selector::parse("a[href]") {
        for el in document.select(&a_selector) {
            if let Some(href) = el.value().attr("href") {
                let lower = href.to_lowercase();
                if lower.ends_with(".jpg") || lower.ends_with(".jpeg") || lower.ends_with(".png") ||
                   lower.ends_with(".gif") || lower.ends_with(".webp") || lower.ends_with(".svg") || lower.ends_with(".avif") {
                    let full_url = base_url.join(href).map(|u| u.to_string()).unwrap_or_else(|_| href.to_string());
                    if !seen_urls.contains(&full_url) {
                        seen_urls.insert(full_url.clone());
                        images.push(ImageInfo { src: full_url, alt: String::new(), width: 0, height: 0 });
                    }
                }
            }
        }
    }

    // <meta> og:image and twitter:image
    if let Ok(meta_selector) = Selector::parse("meta[property='og:image'], meta[name='twitter:image'], meta[itemprop='image']") {
        for el in document.select(&meta_selector) {
            if let Some(content) = el.value().attr("content") {
                let full_url = base_url.join(content).map(|u| u.to_string()).unwrap_or_else(|_| content.to_string());
                if !seen_urls.contains(&full_url) {
                    seen_urls.insert(full_url.clone());
                    images.push(ImageInfo { src: full_url, alt: "Social preview".to_string(), width: 0, height: 0 });
                }
            }
        }
    }

    // <video poster> images
    if let Ok(video_selector) = Selector::parse("video[poster]") {
        for el in document.select(&video_selector) {
            if let Some(poster) = el.value().attr("poster") {
                let full_url = base_url.join(poster).map(|u| u.to_string()).unwrap_or_else(|_| poster.to_string());
                if !seen_urls.contains(&full_url) {
                    seen_urls.insert(full_url.clone());
                    images.push(ImageInfo { src: full_url, alt: "Video poster".to_string(), width: 0, height: 0 });
                }
            }
        }
    }

    // Inline style background images
    if let Ok(style_selector) = Selector::parse("[style]") {
        for el in document.select(&style_selector) {
            if let Some(style) = el.value().attr("style") {
                if style.contains("background") {
                    // Extract url() values
                    let re_like: Vec<&str> = style.split("url(").skip(1).collect();
                    for part in re_like {
                        if let Some(end) = part.find(')') {
                            let src = part[..end].trim().trim_matches('"').trim_matches('\'');
                            if !src.is_empty() && !src.starts_with("data:") && !src.contains("gradient") {
                                let full_url = base_url.join(src).map(|u| u.to_string()).unwrap_or_else(|_| src.to_string());
                                if !seen_urls.contains(&full_url) {
                                    seen_urls.insert(full_url.clone());
                                    images.push(ImageInfo { src: full_url, alt: String::new(), width: 0, height: 0 });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Scan <script> tags for image URLs embedded in JSON/JS data
    // This catches Zillow-style carousels where images are stored in JavaScript objects
    if let Ok(script_selector) = Selector::parse("script") {
        for el in document.select(&script_selector) {
            let text = el.text().collect::<String>();
            if text.len() < 10 || text.len() > 500000 { continue; }
            // Find image URLs using simple pattern matching
            let extensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg"];
            for part in text.split('"').chain(text.split('\'')) {
                let trimmed = part.trim().replace("\\/", "/");
                if trimmed.len() > 10 && trimmed.len() < 2000 {
                    let lower = trimmed.to_lowercase();
                    if extensions.iter().any(|ext| lower.contains(ext)) {
                        if trimmed.starts_with("http") || trimmed.starts_with("//") {
                            let url = if trimmed.starts_with("//") { format!("https:{}", trimmed) } else { trimmed.clone() };
                            if !seen_urls.contains(&url) {
                                seen_urls.insert(url.clone());
                                images.push(ImageInfo { src: url, alt: String::new(), width: 0, height: 0 });
                            }
                        } else if trimmed.starts_with("/") {
                            let full_url = base_url.join(&trimmed).map(|u| u.to_string()).unwrap_or_default();
                            if !full_url.is_empty() && !seen_urls.contains(&full_url) {
                                seen_urls.insert(full_url.clone());
                                images.push(ImageInfo { src: full_url, alt: String::new(), width: 0, height: 0 });
                            }
                        }
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
    images.truncate(500);
    text_blocks.truncate(500);

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
    // 1. Browser-side JS scraper (renders JS, sees lazy-loaded content)
    // 2. Server-side HTTP scraper (like webscrap.py, sees raw HTML)
    let url_clone = url.clone();
    let server_scrape_handle = tokio::spawn(async move {
        server_side_scrape(&url_clone).await
    });

    // Wait for browser analysis with timeout (45s for JS-heavy sites)
    let browser_result = match tokio::time::timeout(std::time::Duration::from_secs(45), rx).await {
        Ok(Ok(Ok(data))) => Ok(data),
        Ok(Ok(Err(e))) => Err(format!("Analysis failed: {}", e)),
        Ok(Err(_)) => Err("Failed to receive analysis result (channel closed)".to_string()),
        Err(_) => Err("Analysis timed out (45s)".to_string()),
    };

    let _ = window.close();

    let browser_data = browser_result?;

    // Wait for server-side scrape
    let (server_images, server_text) = match server_scrape_handle.await {
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

    // ── MERGE results from both scrapers (deduplicate by NORMALIZED URL) ──
    // Normalize URLs to collapse resolution variants (e.g., _cc_ft_384 vs _cc_ft_768)
    fn normalize_image_url(url: &str) -> String {
        // Strip query params and hash
        let base = url.split('?').next().unwrap_or(url).split('#').next().unwrap_or(url);
        let mut norm = base.to_string();
        // Strip resolution/size patterns from filenames
        // Zillow: -cc_ft_384.jpg → .jpg
        let patterns = [
            // _cc_ft_384.jpg, -cc_ft_768.webp
            (r"[-_](cc_ft_|ft_)\d{2,4}", ""),
            // -300x200.jpg
            (r"-\d{2,4}x\d{2,4}", ""),
            // _384.jpg, _768.jpg, _1536.jpg (bare resolution suffix)
            (r"[-_]\d{3,4}(\.[a-zA-Z]+)$", "$1"),
            // @2x.jpg
            (r"@\dx(\.[a-zA-Z]+)$", "$1"),
            // -scaled, -thumbnail, -small, -medium, -large
            (r"[-_](small|medium|large|thumb|thumbnail|scaled|preview|mini|full|original)(\.[a-zA-Z]+)$", "$2"),
        ];
        for (pattern, replacement) in &patterns {
            if let Ok(re) = regex_lite::Regex::new(pattern) {
                norm = re.replace(&norm, *replacement).to_string();
            }
        }
        norm
    }

    let mut seen_image_urls: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut merged_images: Vec<ImageInfo> = Vec::new();

    // Browser images first (higher quality — they have actual rendered dimensions)
    for img in &browser_data.images {
        let norm = normalize_image_url(&img.src);
        if !seen_image_urls.contains(&norm) {
            seen_image_urls.insert(norm);
            merged_images.push(img.clone());
        }
    }
    // Then server-side images (catches anything the browser missed)
    for img in &server_images {
        let norm = normalize_image_url(&img.src);
        if !seen_image_urls.contains(&norm) {
            seen_image_urls.insert(norm);
            merged_images.push(img.clone());
        }
    }

    let mut seen_text: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut merged_text: Vec<TextBlock> = Vec::new();

    // Browser text first (catches JS-rendered content)
    for block in &browser_data.text_content {
        if !seen_text.contains(&block.text) {
            seen_text.insert(block.text.clone());
            merged_text.push(block.clone());
        }
    }
    // Then server-side text
    for block in &server_text {
        if !seen_text.contains(&block.text) {
            seen_text.insert(block.text.clone());
            merged_text.push(block.clone());
        }
    }

    merged_images.truncate(500);
    merged_text.truncate(500);

    println!("Analysis finished — colors: {}, fonts: {}, images: {} (browser: {}, server: {}), text: {} (browser: {}, server: {})",
        browser_data.colors.len(), browser_data.fonts.len(),
        merged_images.len(), browser_data.images.len(), server_images.len(),
        merged_text.len(), browser_data.text_content.len(), server_text.len());

    // Combine all results
    Ok(AnalysisResult {
        colors: browser_data.colors,
        fonts: browser_data.fonts,
        images: merged_images,
        text_content: merged_text,
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
