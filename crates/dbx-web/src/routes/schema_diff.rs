use axum::Json;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateSchemaSyncSqlRequest {
    pub diffs: Vec<dbx_core::schema_diff::TableDiff>,
    #[serde(default)]
    pub function_diffs: Vec<dbx_core::schema_diff::FunctionDiff>,
    #[serde(default)]
    pub sequence_diffs: Vec<dbx_core::schema_diff::SequenceDiff>,
    #[serde(default)]
    pub rule_diffs: Vec<dbx_core::schema_diff::RuleDiff>,
    #[serde(default)]
    pub owner_diffs: Vec<dbx_core::schema_diff::OwnerDiff>,
    pub database_type: dbx_core::models::connection::DatabaseType,
    pub target_schema: Option<String>,
    #[serde(default)]
    pub cascade_delete: bool,
}

pub async fn prepare_schema_diff(
    Json(options): Json<dbx_core::schema_diff::SchemaDiffPreparationOptions>,
) -> Json<dbx_core::schema_diff::SchemaDiffPreparation> {
    Json(dbx_core::schema_diff::prepare_schema_diff(options))
}

pub async fn generate_schema_sync_sql(Json(req): Json<GenerateSchemaSyncSqlRequest>) -> Json<String> {
    Json(dbx_core::schema_diff::generate_schema_sync_sql(
        &req.diffs,
        &req.function_diffs,
        &req.sequence_diffs,
        &req.rule_diffs,
        &req.owner_diffs,
        req.database_type,
        req.target_schema.as_deref(),
        req.cascade_delete,
    ))
}
