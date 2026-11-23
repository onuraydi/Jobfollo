use crate::mail::keychain::SecretStore;
use crate::mail::MailError;
use lettre::message::{Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SmtpSecurity {
    Starttls,
    Tls,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendEmailRequest {
    pub host: String,
    pub port: u16,
    pub security: SmtpSecurity,
    pub username: String,
    pub recipient: String,
    pub subject: String,
    pub text: String,
    pub html: String,
}

/// Removes any occurrence of sensitive strings from error messages before they are
/// returned to the UI or persisted to `reminder_log`.
pub fn scrub_secret(message: &str, secret: &str) -> String {
    if secret.is_empty() {
        return message.to_owned();
    }
    message.replace(secret, "[REDACTED]")
}

pub fn validate_request(req: &SendEmailRequest) -> Result<(Mailbox, Mailbox), MailError> {
    let host = req.host.trim();
    if host.is_empty() || host.chars().any(|c| c.is_whitespace()) {
        return Err(MailError::invalid_argument("Invalid SMTP host"));
    }
    if req.port == 0 {
        return Err(MailError::invalid_argument("SMTP port must be 1..65535"));
    }
    let username = req.username.trim();
    if username.is_empty() {
        return Err(MailError::invalid_argument("SMTP username is required"));
    }
    let from: Mailbox = username
        .parse()
        .map_err(|_| MailError::invalid_argument("SMTP username must be a valid email address"))?;
    let to: Mailbox = req
        .recipient
        .trim()
        .parse()
        .map_err(|_| MailError::invalid_argument("Invalid recipient email address"))?;
    if req.subject.trim().is_empty() || req.subject.contains(['\r', '\n']) {
        return Err(MailError::invalid_argument("Invalid email subject"));
    }
    Ok((from, to))
}

pub fn send_email_with_store(
    req: &SendEmailRequest,
    store: &dyn SecretStore,
) -> Result<(), MailError> {
    let (from, to) = validate_request(req)?;
    let password = store
        .get_password()?
        .filter(|p| !p.is_empty())
        .ok_or_else(|| MailError::missing_password("SMTP password is not configured in keychain"))?;

    let email = Message::builder()
        .from(from)
        .to(to)
        .subject(req.subject.trim())
        .multipart(
            MultiPart::alternative()
                .singlepart(SinglePart::plain(req.text.clone()))
                .singlepart(SinglePart::html(req.html.clone())),
        )
        .map_err(|err| {
            MailError::invalid_argument(scrub_secret(&format!("Failed to build email: {err}"), &password))
        })?;

    let creds = Credentials::new(req.username.trim().to_owned(), password.clone());
    let host = req.host.trim();

    let builder = match req.security {
        SmtpSecurity::Starttls => SmtpTransport::starttls_relay(host),
        SmtpSecurity::Tls => SmtpTransport::relay(host),
    }
    .map_err(|err| {
        MailError::smtp(scrub_secret(
            &format!("SMTP connection configuration error: {err}"),
            &password,
        ))
    })?;

    let mailer = builder
        .port(req.port)
        .credentials(creds)
        .timeout(Some(Duration::from_secs(20)))
        .build();

    mailer.send(&email).map(|_| ()).map_err(|err| {
        MailError::smtp(scrub_secret(
            &format!("SMTP send failed: {err}"),
            &password,
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mail::MailErrorKind;
    use std::sync::Mutex;

    struct MemorySecretStore {
        secret: Mutex<Option<String>>,
    }

    impl MemorySecretStore {
        fn new(initial: Option<&str>) -> Self {
            Self {
                secret: Mutex::new(initial.map(ToOwned::to_owned)),
            }
        }
    }

    impl SecretStore for MemorySecretStore {
        fn set_password(&self, password: &str) -> Result<(), MailError> {
            *self.secret.lock().unwrap() = Some(password.to_owned());
            Ok(())
        }

        fn get_password(&self) -> Result<Option<String>, MailError> {
            Ok(self.secret.lock().unwrap().clone())
        }

        fn delete_password(&self) -> Result<(), MailError> {
            *self.secret.lock().unwrap() = None;
            Ok(())
        }
    }

    fn sample_request() -> SendEmailRequest {
        SendEmailRequest {
            host: "smtp.example.com".to_owned(),
            port: 587,
            security: SmtpSecurity::Starttls,
            username: "sender@example.com".to_owned(),
            recipient: "recipient@example.com".to_owned(),
            subject: "Jobfollo test".to_owned(),
            text: "Hello".to_owned(),
            html: "<p>Hello</p>".to_owned(),
        }
    }

    #[test]
    fn scrub_secret_removes_all_occurrences_of_password() {
        let scrubbed = scrub_secret(
            "AUTH failed for secret-pass-123 (echo: secret-pass-123)",
            "secret-pass-123",
        );
        assert!(!scrubbed.contains("secret-pass-123"));
        assert_eq!(scrubbed, "AUTH failed for [REDACTED] (echo: [REDACTED])");
    }

    #[test]
    fn validate_request_rejects_bad_host_port_recipient_and_multiline_subject() {
        let mut req = sample_request();
        req.host = "bad host".to_owned();
        assert_eq!(
            validate_request(&req).unwrap_err().kind,
            MailErrorKind::InvalidArgument
        );

        let mut req = sample_request();
        req.port = 0;
        assert_eq!(
            validate_request(&req).unwrap_err().kind,
            MailErrorKind::InvalidArgument
        );

        let mut req = sample_request();
        req.recipient = "not-an-email".to_owned();
        assert_eq!(
            validate_request(&req).unwrap_err().kind,
            MailErrorKind::InvalidArgument
        );

        let mut req = sample_request();
        req.subject = "Line1\r\nBcc: attacker@evil.test".to_owned();
        assert_eq!(
            validate_request(&req).unwrap_err().kind,
            MailErrorKind::InvalidArgument
        );
    }

    #[test]
    fn send_email_returns_missing_password_when_keychain_has_no_secret() {
        let store = MemorySecretStore::new(None);
        let err = send_email_with_store(&sample_request(), &store).unwrap_err();
        assert_eq!(err.kind, MailErrorKind::MissingPassword);
    }
}
