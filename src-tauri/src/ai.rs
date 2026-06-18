//! AI provider commands.
//!
//! Responsibilities:
//! - Execute small editor transforms against OpenAI-compatible chat-completions
//!   backends using vault-provided settings.
//! - Keep provider HTTP handling in Rust so API keys do not pass through browser
//!   fetch APIs or third-party frontend packages.
//!
//! Contracts:
//! - AI commands never read or write vault files directly.
//! - The caller supplies the exact selected/document text to transform and must
//!   review/apply the returned output in the UI.
//! - This first compatibility layer targets `/models` and `/chat/completions`;
//!   provider-specific APIs should be added as explicit runtime modes, not
//!   guessed here.
use super::*;

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatCompletionChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionChoice {
    message: ChatCompletionMessage,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionMessage {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ModelsResponse {
    data: Vec<ModelEntry>,
}

#[derive(Debug, Deserialize)]
struct ModelEntry {
    id: String,
}

pub(crate) fn ai_endpoint_url(base_url: &str, endpoint: &str) -> Result<reqwest::Url, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    let parsed = reqwest::Url::parse(&format!("{trimmed}/"))
        .map_err(|_| "AI base URL must be valid".to_string())?;

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("AI base URL must use http or https".into());
    }

    parsed
        .join(endpoint.trim_start_matches('/'))
        .map_err(|err| format!("Could not build AI endpoint URL: {err}"))
}

fn ai_http_client(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|err| format!("Could not create AI HTTP client: {err}"))
}

#[tauri::command]
pub(crate) async fn list_ai_models(settings: AiSettings) -> Result<AiModelListResponse, String> {
    let settings = clean_ai_settings(settings)?;

    if settings.api_key.is_empty() {
        return Err("Add an AI API key in Settings before fetching models".into());
    }

    let response = ai_http_client(Duration::from_secs(30))?
        .get(ai_endpoint_url(&settings.base_url, "models")?)
        .bearer_auth(settings.api_key)
        .send()
        .await
        .map_err(|err| format!("AI models request failed: {err}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|err| format!("Could not read AI models response: {err}"))?;

    if !status.is_success() {
        return Err(format!("AI provider returned {status}: {text}"));
    }

    let models = serde_json::from_str::<ModelsResponse>(&text)
        .map_err(|err| format!("Could not parse AI models response: {err}"))?
        .data
        .into_iter()
        .map(|model| model.id.trim().to_string())
        .filter(|id| !id.is_empty())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    if models.is_empty() {
        return Err("AI provider returned no models".into());
    }

    Ok(AiModelListResponse { models })
}

#[tauri::command]
pub(crate) async fn test_ai_connection(
    settings: AiSettings,
) -> Result<AiConnectionTestResponse, String> {
    let settings = clean_ai_settings(settings)?;

    if settings.api_key.is_empty() {
        return Err("Add an AI API key in Settings before testing the API".into());
    }

    let body = serde_json::json!({
        "model": settings.model,
        "messages": [
            {
                "role": "user",
                "content": "Reply with exactly: OK"
            }
        ]
    });
    let response = ai_http_client(Duration::from_secs(30))?
        .post(ai_endpoint_url(&settings.base_url, "chat/completions")?)
        .bearer_auth(settings.api_key)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body.to_string())
        .send()
        .await
        .map_err(|err| format!("AI test request failed: {err}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|err| format!("Could not read AI test response: {err}"))?;

    if !status.is_success() {
        return Err(format!("AI provider returned {status}: {text}"));
    }

    serde_json::from_str::<ChatCompletionResponse>(&text)
        .map_err(|err| format!("Could not parse AI test response: {err}"))?;

    Ok(AiConnectionTestResponse {
        message: format!("Connected to {}", settings.model),
    })
}

#[tauri::command]
pub(crate) async fn run_ai_transform(
    request: AiTransformRequest,
) -> Result<AiTransformResponse, String> {
    let settings = clean_ai_settings(request.settings)?;

    if !settings.enabled {
        return Err("Enable AI in Settings before running AI commands".into());
    }

    if settings.api_key.is_empty() {
        return Err("Add an AI API key in Settings before running AI commands".into());
    }

    let input = request.input.trim();

    if input.is_empty() {
        return Err("Select text before running this AI command".into());
    }

    let instruction = request.instruction.trim();

    if instruction.is_empty() {
        return Err("AI instruction cannot be empty".into());
    }

    let body = serde_json::json!({
        "model": settings.model,
        "messages": [
            {
                "role": "system",
                "content": "You are an editor inside Glyphary. Return only the requested Markdown text, without commentary or code fences unless the user asks for code."
            },
            {
                "role": "user",
                "content": format!("{instruction}\n\nText:\n{input}")
            }
        ],
    });
    let response = ai_http_client(Duration::from_secs(60))?
        .post(ai_endpoint_url(&settings.base_url, "chat/completions")?)
        .bearer_auth(settings.api_key)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body.to_string())
        .send()
        .await
        .map_err(|err| format!("AI request failed: {err}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|err| format!("Could not read AI response: {err}"))?;

    if !status.is_success() {
        return Err(format!("AI provider returned {status}: {text}"));
    }

    let completion = serde_json::from_str::<ChatCompletionResponse>(&text)
        .map_err(|err| format!("Could not parse AI response: {err}"))?;
    let output = completion
        .choices
        .first()
        .and_then(|choice| choice.message.content.as_deref())
        .map(str::trim)
        .filter(|content| !content.is_empty())
        .ok_or_else(|| "AI provider returned an empty response".to_string())?;

    Ok(AiTransformResponse {
        output: output.into(),
    })
}
