use crate::db::error::DbError;
use rusqlite::hooks::{AuthAction, AuthContext, Authorization};
use rusqlite::Connection;

pub fn install_authorizer(conn: &Connection) -> Result<(), DbError> {
    conn.authorizer(Some(|ctx: AuthContext<'_>| match ctx.action {
        AuthAction::Attach { .. }
        | AuthAction::Detach { .. }
        | AuthAction::Pragma { .. }
        | AuthAction::CreateVtable { .. }
        | AuthAction::DropVtable { .. } => Authorization::Deny,
        AuthAction::Function { function_name }
            if function_name.eq_ignore_ascii_case("load_extension") =>
        {
            Authorization::Deny
        }
        _ => Authorization::Allow,
    }));
    Ok(())
}
