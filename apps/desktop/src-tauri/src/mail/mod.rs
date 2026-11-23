pub mod keychain;
pub mod smtp;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MailErrorKind {
    InvalidArgument,
    Keychain,
    MissingPassword,
    Smtp,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailError {
    pub kind: MailErrorKind,
    pub message: String,
}

impl MailError {
    pub fn invalid_argument(message: impl Into<String>) -> Self {
        Self {
            kind: MailErrorKind::InvalidArgument,
            message: message.into(),
        }
    }

    pub fn keychain(message: impl Into<String>) -> Self {
        Self {
            kind: MailErrorKind::Keychain,
            message: message.into(),
        }
    }

    pub fn missing_password(message: impl Into<String>) -> Self {
        Self {
            kind: MailErrorKind::MissingPassword,
            message: message.into(),
        }
    }

    pub fn smtp(message: impl Into<String>) -> Self {
        Self {
            kind: MailErrorKind::Smtp,
            message: message.into(),
        }
    }
}
