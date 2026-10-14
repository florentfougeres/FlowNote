//! Links to the web: opening one in the default browser, and reading a page's
//! title for the reading list (the only request the app makes on its own,
//! and only when the user adds a link).

use std::io::Read;
use std::time::Duration;

/// Only web and mail links leave the app.
fn is_web_url(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    lower.starts_with("https://") || lower.starts_with("http://")
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    let lower = url.trim().to_ascii_lowercase();
    if !is_web_url(&url) && !lower.starts_with("mailto:") {
        return Err(format!("Lien refusé : {url}"));
    }
    std::process::Command::new("open").arg(url.trim()).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Writes an exported presentation where the user chose to save it (an .html file only).
#[tauri::command]
pub fn save_export(path: String, content: String) -> Result<(), String> {
    if !path.to_ascii_lowercase().ends_with(".html") {
        return Err(format!("Export refusé : {path}"));
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Opens an exported presentation in the default browser.
#[tauri::command]
pub fn open_export(path: String) -> Result<(), String> {
    if !path.to_ascii_lowercase().ends_with(".html") || !std::path::Path::new(&path).is_file() {
        return Err(format!("Fichier introuvable : {path}"));
    }
    std::process::Command::new("open").arg(&path).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Title of a web page (`og:title`, else `<title>`), or None. Reads at most
/// 512 KB, gives up after a few seconds.
#[tauri::command]
pub async fn fetch_page_title(url: String) -> Option<String> {
    if !is_web_url(&url) {
        return None;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(6)).redirects(5).build();
        let response = agent.get(url.trim()).set("User-Agent", "Mozilla/5.0 (Macintosh) FlowNote").call().ok()?;
        let mut bytes = Vec::new();
        response.into_reader().take(512 * 1024).read_to_end(&mut bytes).ok()?;
        title_of(&String::from_utf8_lossy(&bytes))
    })
    .await
    .ok()
    .flatten()
}

fn title_of(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    // <meta property="og:title" content="…">, attributes in either order.
    let mut from = 0;
    while let Some(at) = lower[from..].find("<meta") {
        let start = from + at;
        let end = start + lower[start..].find('>').unwrap_or(lower.len() - start);
        let tag = &html[start..end];
        let tag_lower = &lower[start..end];
        if tag_lower.contains("og:title") {
            if let Some(value) = attribute(tag, tag_lower, "content") {
                return clean(&value);
            }
        }
        from = end;
    }
    let start = lower.find("<title")?;
    let open = start + lower[start..].find('>')? + 1;
    let close = open + lower[open..].find("</title")?;
    clean(&html[open..close])
}

fn attribute(tag: &str, tag_lower: &str, name: &str) -> Option<String> {
    let at = tag_lower.find(&format!("{name}="))? + name.len() + 1;
    let rest = &tag[at..];
    let quote = rest.chars().next()?;
    if quote == '"' || quote == '\'' {
        Some(rest[1..].split(quote).next()?.to_string())
    } else {
        Some(rest.split(|c: char| c.is_whitespace() || c == '>').next()?.to_string())
    }
}

/// Collapses whitespace and decodes the usual HTML entities.
fn clean(raw: &str) -> Option<String> {
    let mut text = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    for (entity, char) in [("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""), ("&#39;", "'"), ("&#x27;", "'"), ("&apos;", "'"), ("&nbsp;", " "), ("&ndash;", "–"), ("&mdash;", "—"), ("&rsquo;", "’"), ("&laquo;", "«"), ("&raquo;", "»")] {
        text = text.replace(entity, char);
    }
    let text = text.trim().to_string();
    (!text.is_empty()).then_some(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_title_of_a_page() {
        assert_eq!(title_of("<html><head><title>\n  Un   article &amp; plus\n</title></head>").as_deref(), Some("Un article & plus"));
        assert_eq!(title_of(r#"<title>Site</title><meta content="Le vrai titre" property="og:title">"#).as_deref(), Some("Le vrai titre"));
        assert_eq!(title_of(r#"<meta property='og:title' content='Simple'><title>x</title>"#).as_deref(), Some("Simple"));
        assert_eq!(title_of("<p>pas de titre</p>"), None);
        assert_eq!(title_of("<title>  </title>"), None);
    }

    /// Needs the network: cargo test -- --ignored
    #[test]
    #[ignore]
    fn fetches_a_real_page_title() {
        let title = tauri::async_runtime::block_on(fetch_page_title("https://example.com".into()));
        assert_eq!(title.as_deref(), Some("Example Domain"));
    }

    #[test]
    fn only_web_links_leave_the_app() {
        assert!(is_web_url("https://example.com"));
        assert!(is_web_url(" HTTP://x.fr "));
        assert!(!is_web_url("file:///etc/passwd"));
        assert!(!is_web_url("javascript:alert(1)"));
    }
}
