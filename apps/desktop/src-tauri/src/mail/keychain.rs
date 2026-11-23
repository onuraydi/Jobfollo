use crate::mail::MailError;

pub const KEYCHAIN_SERVICE: &str = "io.github.onuraydi.jobfollo";
pub const KEYCHAIN_SMTP_ACCOUNT: &str = "smtp_password";

pub trait SecretStore: Send + Sync {
    fn set_password(&self, password: &str) -> Result<(), MailError>;
    fn get_password(&self) -> Result<Option<String>, MailError>;
    fn delete_password(&self) -> Result<(), MailError>;

    fn has_password(&self) -> Result<bool, MailError> {
        Ok(self
            .get_password()?
            .map(|p| !p.is_empty())
            .unwrap_or(false))
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct OsKeychainStore;

impl OsKeychainStore {
    fn entry() -> Result<keyring::Entry, MailError> {
        keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_SMTP_ACCOUNT)
            .map_err(|err| MailError::keychain(format!("Keychain initialization failed: {err}")))
    }
}

impl SecretStore for OsKeychainStore {
    fn set_password(&self, password: &str) -> Result<(), MailError> {
        if password.is_empty() {
            return Err(MailError::invalid_argument(
                "SMTP password cannot be empty",
            ));
        }
        let entry = Self::entry()?;
        entry
            .set_password(password)
            .map_err(|err| MailError::keychain(format!("Failed to save SMTP password: {err}")))
    }

    fn get_password(&self) -> Result<Option<String>, MailError> {
        let entry = Self::entry()?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(MailError::keychain(format!(
                "Failed to read SMTP password: {err}"
            ))),
        }
    }

    fn delete_password(&self) -> Result<(), MailError> {
        let entry = Self::entry()?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(MailError::keychain(format!(
                "Failed to delete SMTP password: {err}"
            ))),
        }
    }
}
