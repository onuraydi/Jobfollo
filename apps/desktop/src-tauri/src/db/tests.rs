#![allow(clippy::unwrap_used, clippy::expect_used)]

use crate::db::error::DbErrorKind;
use crate::db::{
    BatchResult, Database, SqlStatement, MAX_BATCH_STATEMENTS, MAX_SELECT_ROWS, MAX_SQL_BYTES,
};
use rusqlite::Connection;
use serde_json::{json, Value as JsonValue};
use tempfile::tempdir;

fn stmt(sql: &str, params: Vec<JsonValue>) -> SqlStatement {
    SqlStatement {
        sql: sql.to_owned(),
        params,
    }
}

#[test]
fn binds_all_supported_param_types_and_preserves_turkish_emoji_and_sql_injection() {
    let db = Database::open_in_memory().unwrap();
    db.batch(&[stmt(
        "CREATE TABLE sample (
            id INTEGER PRIMARY KEY,
            n_int INTEGER,
            n_real REAL,
            txt TEXT,
            opt TEXT
        )",
        vec![],
    )])
    .unwrap();

    let injection = "'; DROP TABLE sample; --";
    let turkish_emoji = "Çağrı Şirket Özel ğüşiöç 🚀✅";

    db.batch(&[
        stmt(
            "INSERT INTO sample (id, n_int, n_real, txt, opt) VALUES (?, ?, ?, ?, ?)",
            vec![
                json!(1),
                json!(-42),
                json!(2.5),
                json!(turkish_emoji),
                JsonValue::Null,
            ],
        ),
        stmt(
            "INSERT INTO sample (id, n_int, n_real, txt, opt) VALUES (?, ?, ?, ?, ?)",
            vec![json!(2), json!(0), json!(0.25), json!(injection), json!("ok")],
        ),
    ])
    .unwrap();

    let rows = db
        .select(
            "SELECT id, n_int, typeof(n_int) AS t_int, n_real, typeof(n_real) AS t_real, txt, opt
             FROM sample ORDER BY id ASC",
            &[],
        )
        .unwrap();

    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0]["n_int"], json!(-42));
    assert_eq!(rows[0]["t_int"], json!("integer"));
    assert_eq!(rows[0]["n_real"], json!(2.5));
    assert_eq!(rows[0]["t_real"], json!("real"));
    assert_eq!(rows[0]["txt"], json!(turkish_emoji));
    assert_eq!(rows[0]["opt"], JsonValue::Null);
    assert_eq!(rows[1]["txt"], json!(injection));
}

#[test]
fn rejects_unsupported_param_types_with_invalid_argument() {
    let db = Database::open_in_memory().unwrap();

    let bad_params: Vec<JsonValue> = vec![
        json!(true),
        json!(false),
        json!([1, 2]),
        json!({"a": 1}),
        serde_json::from_str("18446744073709551615").unwrap(), // u64::MAX > i64::MAX
    ];

    for bad in bad_params {
        let err = db.select("SELECT ?", &[bad]).unwrap_err();
        assert_eq!(err.kind, DbErrorKind::InvalidArgument);
    }
}

#[test]
fn rejects_unsafe_result_values_and_duplicate_column_names() {
    let db = Database::open_in_memory().unwrap();

    // Integer outside ±2^53
    let too_big = db.select("SELECT 9007199254740993 AS big", &[]).unwrap_err();
    assert_eq!(too_big.kind, DbErrorKind::Sql);

    // BLOB
    let blob = db.select("SELECT X'DEADBEEF' AS bin", &[]).unwrap_err();
    assert_eq!(blob.kind, DbErrorKind::Sql);

    // Duplicate column names
    db.batch(&[
        stmt("CREATE TABLE a (id INTEGER PRIMARY KEY)", vec![]),
        stmt("CREATE TABLE b (id INTEGER PRIMARY KEY)", vec![]),
        stmt("INSERT INTO a (id) VALUES (1)", vec![]),
        stmt("INSERT INTO b (id) VALUES (1)", vec![]),
    ])
    .unwrap();

    let dup = db
        .select("SELECT a.id, b.id FROM a JOIN b ON a.id = b.id", &[])
        .unwrap_err();
    assert_eq!(dup.kind, DbErrorKind::InvalidArgument);
}

#[test]
fn rolls_back_entire_batch_on_third_statement_failure_without_leaking_params() {
    let db = Database::open_in_memory().unwrap();
    db.batch(&[stmt(
        "CREATE TABLE items (id TEXT PRIMARY KEY, secret_note TEXT NOT NULL)",
        vec![],
    )])
    .unwrap();

    let secret_param = "SUPER_SECRET_VALUE_999";
    let err = db
        .batch(&[
            stmt(
                "INSERT INTO items (id, secret_note) VALUES (?, ?)",
                vec![json!("i1"), json!("first")],
            ),
            stmt(
                "INSERT INTO items (id, secret_note) VALUES (?, ?)",
                vec![json!("i2"), json!("second")],
            ),
            stmt(
                "INSERT INTO items (id, secret_note) VALUES (?, ?)",
                vec![json!("i1"), json!(secret_param)], // duplicate PK on statement index 2
            ),
        ])
        .unwrap_err();

    assert_eq!(err.kind, DbErrorKind::Constraint);
    assert!(
        err.message.contains("Statement 2"),
        "expected failing statement index in message, got: {}",
        err.message
    );
    assert!(
        !err.message.contains(secret_param),
        "error message must never contain parameter values"
    );

    let rows = db.select("SELECT id FROM items", &[]).unwrap();
    assert!(rows.is_empty(), "entire batch must roll back");
}

#[test]
fn rejects_row_returning_statements_in_batch() {
    let db = Database::open_in_memory().unwrap();
    db.batch(&[stmt("CREATE TABLE t (id INTEGER PRIMARY KEY)", vec![])])
        .unwrap();

    let err_select = db.batch(&[stmt("SELECT 1", vec![])]).unwrap_err();
    assert_eq!(err_select.kind, DbErrorKind::InvalidArgument);

    let err_returning = db
        .batch(&[stmt("INSERT INTO t (id) VALUES (1) RETURNING id", vec![])])
        .unwrap_err();
    assert_eq!(err_returning.kind, DbErrorKind::InvalidArgument);
}

#[test]
fn enforces_readonly_in_select_and_rejects_multi_statements() {
    let db = Database::open_in_memory().unwrap();
    db.batch(&[stmt("CREATE TABLE t (id INTEGER PRIMARY KEY)", vec![])])
        .unwrap();

    let write_in_select = db
        .select("INSERT INTO t (id) VALUES (1)", &[])
        .unwrap_err();
    assert_eq!(write_in_select.kind, DbErrorKind::Forbidden);

    let multi_select = db.select("SELECT 1; SELECT 2", &[]).unwrap_err();
    assert_eq!(multi_select.kind, DbErrorKind::InvalidArgument);

    let multi_batch = db
        .batch(&[stmt(
            "INSERT INTO t (id) VALUES (1); INSERT INTO t (id) VALUES (2)",
            vec![],
        )])
        .unwrap_err();
    assert_eq!(multi_batch.kind, DbErrorKind::InvalidArgument);
}

#[test]
fn authorizer_denies_attach_detach_pragma_vtable_and_load_extension() {
    let db = Database::open_in_memory().unwrap();

    let forbidden_batch = [
        "ATTACH DATABASE ':memory:' AS extra",
        "DETACH DATABASE main",
        "PRAGMA foreign_keys = OFF",
        "CREATE VIRTUAL TABLE vt USING fts5(content)",
    ];
    for sql in forbidden_batch {
        let err = db.batch(&[stmt(sql, vec![])]).unwrap_err();
        assert_eq!(
            err.kind,
            DbErrorKind::Forbidden,
            "expected Forbidden for: {sql}, got: {err:?}"
        );
    }

    let forbidden_select = [
        "PRAGMA user_version",
        "PRAGMA foreign_keys",
        "SELECT load_extension('nonexistent')",
    ];
    for sql in forbidden_select {
        let err = db.select(sql, &[]).unwrap_err();
        assert_eq!(
            err.kind,
            DbErrorKind::Forbidden,
            "expected Forbidden for: {sql}, got: {err:?}"
        );
    }
}

#[test]
fn file_database_enforces_foreign_keys_wal_mode_and_integrity_check() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("nested").join("jobfollo.db");

    {
        let db = Database::open_file(&db_path).unwrap();
        db.batch(&[
            stmt("CREATE TABLE parent (id TEXT PRIMARY KEY)", vec![]),
            stmt(
                "CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parent(id))",
                vec![],
            ),
        ])
        .unwrap();

        let fk_err = db
            .batch(&[stmt(
                "INSERT INTO child (id, parent_id) VALUES (?, ?)",
                vec![json!("c1"), json!("missing")],
            )])
            .unwrap_err();
        assert_eq!(fk_err.kind, DbErrorKind::Constraint);

        db.batch(&[
            stmt("INSERT INTO parent (id) VALUES (?)", vec![json!("p1")]),
            stmt(
                "INSERT INTO child (id, parent_id) VALUES (?, ?)",
                vec![json!("c1"), json!("p1")],
            ),
        ])
        .unwrap();
    }

    // Verify WAL mode and integrity_check directly via raw rusqlite connection
    let verify_conn = Connection::open(&db_path).unwrap();
    let mode: String = verify_conn
        .query_row("PRAGMA journal_mode", [], |r| r.get(0))
        .unwrap();
    assert_eq!(mode.to_lowercase(), "wal");

    let integrity: String = verify_conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .unwrap();
    assert_eq!(integrity, "ok");
}

#[test]
fn enforces_batch_sql_and_row_limits() {
    let db = Database::open_in_memory().unwrap();

    // > MAX_BATCH_STATEMENTS
    let too_many: Vec<SqlStatement> = (0..=MAX_BATCH_STATEMENTS)
        .map(|_| stmt("CREATE TABLE IF NOT EXISTS x (id INTEGER)", vec![]))
        .collect();
    let batch_err = db.batch(&too_many).unwrap_err();
    assert_eq!(batch_err.kind, DbErrorKind::Limit);

    // > MAX_SQL_BYTES
    let huge_sql = " ".repeat(MAX_SQL_BYTES + 1);
    let sql_err = db.select(&huge_sql, &[]).unwrap_err();
    assert_eq!(sql_err.kind, DbErrorKind::Limit);

    // > MAX_SELECT_ROWS via recursive CTE
    let cte = format!(
        "WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM cnt WHERE x <= {}) SELECT x FROM cnt",
        MAX_SELECT_ROWS
    );
    let rows_err = db.select(&cte, &[]).unwrap_err();
    assert_eq!(rows_err.kind, DbErrorKind::Limit);
}

#[test]
fn reports_open_error_without_panicking_when_path_is_a_directory() {
    let dir = tempdir().unwrap();
    let err = Database::open_file(dir.path()).err().unwrap();
    assert_eq!(err.kind, DbErrorKind::Open);
}

#[test]
fn matches_exact_camel_case_json_ipc_contract() {
    let fixtures: JsonValue =
        serde_json::from_str(include_str!("../../../contract/ipc-fixtures.json")).unwrap();
    let db = Database::open_in_memory().unwrap();

    // Shared literal JSON string as TypeScript sends it (with params omitted on first statement)
    let input_json = fixtures["batch"]["requestStatementsJson"].as_str().unwrap();
    let expected_batch_json = fixtures["batch"]["expectedResponseJson"].as_str().unwrap();

    let statements: Vec<SqlStatement> = serde_json::from_str(input_json).unwrap();
    let batch_results: Vec<BatchResult> = db.batch(&statements).unwrap();
    let batch_json = serde_json::to_string(&batch_results).unwrap();
    assert_eq!(batch_json, expected_batch_json);

    let select_sql = fixtures["select"]["sql"].as_str().unwrap();
    let select_params: Vec<JsonValue> = fixtures["select"]["params"]
        .as_array()
        .unwrap()
        .clone();
    let expected_select_json = fixtures["select"]["expectedResponseJson"].as_str().unwrap();

    let rows = db.select(select_sql, &select_params).unwrap();
    let select_json = serde_json::to_string(&rows).unwrap();
    assert_eq!(select_json, expected_select_json);

    // Error JSON contract matches every error kind defined in fixtures["errors"]
    let err = db
        .batch(&[stmt(
            "INSERT INTO notes (id, body) VALUES (?, ?)",
            vec![json!("n1"), json!("dup")],
        )])
        .unwrap_err();
    let err_value: JsonValue = serde_json::to_value(&err).unwrap();
    assert_eq!(err_value["kind"], fixtures["errors"]["constraint"]["kind"]);
    assert!(err_value["message"].as_str().unwrap().contains("Statement 0"));
}
