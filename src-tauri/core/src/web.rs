//! Links to the web: opening one in the default browser, and reading a page's
//! title (reading list) or title and preview image (link cards of a canvas).
//! These are the only requests the app makes on its own: when a link is added
//! to the reading list, or when a canvas shows a link card.

use std::io::Read;
use std::time::Duration;

/// Only web and mail links leave the app.
fn is_web_url(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    lower.starts_with("https://") || lower.starts_with("http://")
}

pub fn open_url(url: String) -> Result<(), String> {
    let lower = url.trim().to_ascii_lowercase();
    if !is_web_url(&url) && !lower.starts_with("mailto:") {
        return Err(format!("Lien refusé : {url}"));
    }
    std::process::Command::new("open").arg(url.trim()).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Files the app exports: presentations (HTML) and mind maps (PNG).
fn is_export(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".html") || lower.ends_with(".png")
}

/// Writes an export where the user chose to save it (.html or .png only).
pub fn save_export(path: String, content: Vec<u8>) -> Result<(), String> {
    if !is_export(&path) {
        return Err(format!("Export refusé : {path}"));
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Opens an export with its default app (browser for HTML, Preview for PNG).
pub fn open_export(path: String) -> Result<(), String> {
    if !is_export(&path) || !std::path::Path::new(&path).is_file() {
        return Err(format!("Fichier introuvable : {path}"));
    }
    std::process::Command::new("open").arg(&path).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// The beginning of a web page (at most 512 KB), or None. Gives up after a few seconds.
/// Blocking: the caller runs it away from the UI thread.
fn read_page(url: &str) -> Option<String> {
    if !is_web_url(url) {
        return None;
    }
    let agent: ureq::Agent = ureq::Agent::config_builder().timeout_global(Some(Duration::from_secs(6))).max_redirects(5).build().into();
    let mut response = agent.get(url.trim()).header("User-Agent", "Mozilla/5.0 (Macintosh) FlowNote").call().ok()?;
    let mut bytes = Vec::new();
    response.body_mut().as_reader().take(512 * 1024).read_to_end(&mut bytes).ok()?;
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

/// Title of a web page (`og:title`, else `<title>`), or None.
pub fn fetch_page_title(url: String) -> Option<String> {
    title_of(&read_page(&url)?)
}

/// What a link card shows: the page's title and its preview image (absolute URL).
#[derive(serde::Serialize, Debug, PartialEq)]
pub struct PagePreview {
    pub title: Option<String>,
    pub image: Option<String>,
}

pub fn fetch_page_preview(url: String) -> Option<PagePreview> {
    let html = read_page(&url)?;
    Some(PagePreview { title: title_of(&html), image: image_of(&html).and_then(|image| absolute(&url, &image)) })
}

/// Content of the first `<meta>` whose property or name is one of `names`, attributes in either order.
fn meta(html: &str, names: &[&str]) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut from = 0;
    while let Some(at) = lower[from..].find("<meta") {
        let start = from + at;
        let end = start + lower[start..].find('>').unwrap_or(lower.len() - start);
        let tag = &html[start..end];
        let tag_lower = &lower[start..end];
        let named = ["property", "name"].iter().filter_map(|key| attribute(tag, tag_lower, key)).any(|value| names.contains(&value.to_ascii_lowercase().as_str()));
        if named {
            if let Some(value) = attribute(tag, tag_lower, "content") {
                return Some(value);
            }
        }
        from = end;
    }
    None
}

fn image_of(html: &str) -> Option<String> {
    meta(html, &["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"]).map(|src| src.trim().replace("&amp;", "&")).filter(|src| !src.is_empty())
}

/// An image address of the page made absolute ("/a.png", "//cdn/a.png"); only web addresses are kept.
fn absolute(page: &str, src: &str) -> Option<String> {
    let page = page.trim();
    let scheme_end = page.find("://")? + 3;
    let origin = &page[..scheme_end + page[scheme_end..].find('/').unwrap_or(page.len() - scheme_end)];
    let url = if src.starts_with("//") {
        format!("{}{src}", &page[..scheme_end - 2])
    } else if src.starts_with('/') {
        format!("{origin}{src}")
    } else if is_web_url(src) {
        src.to_string()
    } else {
        let base = &page[..page.rfind('/').filter(|&i| i >= scheme_end).map_or(page.len(), |i| i + 1)];
        if base.ends_with('/') { format!("{base}{src}") } else { format!("{base}/{src}") }
    };
    is_web_url(&url).then_some(url)
}

fn title_of(html: &str) -> Option<String> {
    if let Some(value) = meta(html, &["og:title"]) {
        return clean(&value);
    }
    let lower = html.to_ascii_lowercase();
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

    #[test]
    fn reads_the_preview_image_of_a_page() {
        let html = r#"<meta content="/img/a.png" property="og:image"><meta name="twitter:image" content="https://x.y/b.png">"#;
        assert_eq!(image_of(html).as_deref(), Some("/img/a.png"));
        assert_eq!(absolute("https://site.fr/blog/post", "/img/a.png").as_deref(), Some("https://site.fr/img/a.png"));
        assert_eq!(absolute("https://site.fr/blog/post", "//cdn.fr/a.png").as_deref(), Some("https://cdn.fr/a.png"));
        assert_eq!(absolute("https://site.fr/blog/post", "a.png").as_deref(), Some("https://site.fr/blog/a.png"));
        assert_eq!(absolute("https://site.fr", "a.png").as_deref(), Some("https://site.fr/a.png"));
        assert_eq!(absolute("https://site.fr/", "javascript:alert(1)").as_deref(), Some("https://site.fr/javascript:alert(1)"));
        assert_eq!(image_of(r#"<meta name="twitter:image:src" content="https://x.y/c.png?a=1&amp;b=2">"#).as_deref(), Some("https://x.y/c.png?a=1&b=2"));
        assert_eq!(image_of("<title>x</title>"), None);
    }

    /// Needs the network: cargo test -- --ignored
    #[test]
    #[ignore]
    fn fetches_a_real_page_title() {
        let title = fetch_page_title("https://example.com".into());
        assert_eq!(title.as_deref(), Some("Example Domain"));
    }

    /// Needs the network: cargo test -- --ignored
    #[test]
    #[ignore]
    fn fetches_a_real_page_preview() {
        let preview = fetch_page_preview("https://github.com/obsidianmd/jsoncanvas".into()).unwrap();
        assert!(preview.title.is_some());
        assert!(preview.image.is_some_and(|image| image.starts_with("https://")));
    }

    #[test]
    fn only_web_links_leave_the_app() {
        assert!(is_web_url("https://example.com"));
        assert!(is_web_url(" HTTP://x.fr "));
        assert!(!is_web_url("file:///etc/passwd"));
        assert!(!is_web_url("javascript:alert(1)"));
    }
}
