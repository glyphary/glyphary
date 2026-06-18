//! AI backend regression tests.
//!
//! Responsibilities:
//! - Lock OpenAI-compatible endpoint URL construction without hitting the network.
//!
//! Contracts:
//! - A configured base URL such as `https://api.openai.com/v1` is a directory
//!   root for provider endpoints, not a file path segment to replace.
use super::*;

#[test]
fn builds_ai_endpoint_urls_under_base_path() {
    let url =
        ai_endpoint_url("https://api.openai.com/v1", "models").expect("models URL should build");

    assert_eq!(url.as_str(), "https://api.openai.com/v1/models");

    let chat_url = ai_endpoint_url("https://api.openai.com/v1/", "/chat/completions")
        .expect("chat URL should build");

    assert_eq!(
        chat_url.as_str(),
        "https://api.openai.com/v1/chat/completions"
    );
}
