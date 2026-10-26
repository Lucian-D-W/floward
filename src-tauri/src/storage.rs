use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::Mutex,
};
use tauri::{Emitter, Manager};

pub struct Store {
    pub conn: Mutex<Connection>,
    pub path: PathBuf,
}
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub revision: i64,
    pub document: Value,
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn initial() -> Value {
    json!({"schema":2,"views":[{"id":"root","owner":null}],"lanes":[{"id":"lane-first","view":"root","title":"我的事项","width":320,"order":0,"archived":false}],"tasks":[],"edges":[],"bands":[],"markers":[],"trash":[]})
}
impl Store {
    pub fn open(path: PathBuf) -> Result<Self, String> {
        let conn = Connection::open(&path).map_err(err)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS document (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, before_json TEXT NOT NULL, after_json TEXT NOT NULL, label TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS view_state (key TEXT PRIMARY KEY, json TEXT NOT NULL);").map_err(err)?;
        conn.execute(
            "INSERT OR IGNORE INTO document VALUES(1,0,?1)",
            [initial().to_string()],
        )
        .map_err(err)?;
        Ok(Self {
            conn: Mutex::new(conn),
            path,
        })
    }
}
fn snapshot(conn: &Connection) -> Result<Snapshot, String> {
    conn.query_row("SELECT revision,json FROM document WHERE id=1", [], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
    })
    .map_err(err)
    .and_then(|(revision, s)| {
        Ok(Snapshot {
            revision,
            document: serde_json::from_str(&s).map_err(err)?,
        })
    })
}
fn list<'a>(v: &'a Value, key: &str) -> Result<&'a Vec<Value>, String> {
    v[key].as_array().ok_or(format!("缺少 {key}"))
}
fn string<'a>(v: &'a Value, key: &str) -> Result<&'a str, String> {
    v[key]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or(format!("缺少 {key}"))
}
fn number(v: &Value, key: &str) -> Result<f64, String> {
    v[key]
        .as_f64()
        .filter(|n| n.is_finite())
        .ok_or(format!("无效 {key}"))
}
fn text_field(v: &Value, key: &str) -> Result<(), String> {
    v[key].as_str().ok_or(format!("缺少文字字段 {key}"))?;
    Ok(())
}
fn bool_field(v: &Value, key: &str) -> Result<(), String> {
    v[key].as_bool().ok_or(format!("缺少布尔字段 {key}"))?;
    Ok(())
}
fn valid_style(a: &Value) -> Result<(), String> {
    for k in ["fill", "border"] {
        let s = string(a, k)?;
        if s.len() != 7 || !s.starts_with('#') || !s[1..].bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("颜色必须为六位十六进制".into());
        }
    }
    if !(0.0..=1.0).contains(&number(a, "opacity")?)
        || !(0.0..=6.0).contains(&number(a, "lineWidth")?)
    {
        return Err("外观数值超出范围".into());
    }
    if !["solid", "dashed", "dotted"].contains(&string(a, "lineStyle")?) {
        return Err("线型无效".into());
    }
    Ok(())
}
fn date_value(s: &str) -> Result<i64, String> {
    if let Ok(date) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        return Ok(date.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp());
    }
    chrono::DateTime::parse_from_rfc3339(s)
        .map(|d| d.timestamp())
        .map_err(|_| "日期格式无效".into())
}
pub fn validate(d: &Value) -> Result<(), String> {
    if d["schema"] != 2 {
        return Err("仅支持 Floward V2 数据".into());
    }
    let views = list(d, "views")?;
    let lanes = list(d, "lanes")?;
    let tasks = list(d, "tasks")?;
    let edges = list(d, "edges")?;
    let mut ids = HashSet::new();
    for key in [
        "views", "lanes", "tasks", "edges", "bands", "markers", "trash",
    ] {
        for obj in list(d, key)? {
            if !ids.insert(string(obj, "id")?) {
                return Err("对象 ID 重复".into());
            }
        }
    }
    let vm: HashMap<_, _> = views
        .iter()
        .map(|v| (v["id"].as_str().unwrap(), v))
        .collect();
    let lm: HashMap<_, _> = lanes
        .iter()
        .map(|v| (v["id"].as_str().unwrap(), v))
        .collect();
    let tm: HashMap<_, _> = tasks
        .iter()
        .map(|v| (v["id"].as_str().unwrap(), v))
        .collect();
    if vm.get("root").is_none_or(|v| !v["owner"].is_null()) {
        return Err("首页不存在".into());
    }
    let mut owners = HashSet::new();
    for v in views {
        let id = string(v, "id")?;
        if id != "root" {
            let owner = string(v, "owner")?;
            if !tm.contains_key(owner) || !owners.insert(owner) {
                return Err("内部视图拥有者无效或重复".into());
            }
        }
        let mut current = id;
        let mut seen = HashSet::new();
        let mut depth = 0;
        while current != "root" {
            if !seen.insert(current) {
                return Err("内部视图不能循环包含".into());
            }
            let owner = string(vm.get(current).ok_or("视图不存在")?, "owner")?;
            let lane = string(tm.get(owner).ok_or("拥有者不存在")?, "lane")?;
            current = string(lm.get(lane).ok_or("泳道不存在")?, "view")?;
            depth += 1;
            if depth > 2 {
                return Err("最多 L0、L1、L2 三层".into());
            }
        }
    }
    for l in lanes {
        if !vm.contains_key(string(l, "view")?) {
            return Err("泳道视图不存在".into());
        }
        let w = number(l, "width")?;
        if !(200.0..=10000.0).contains(&w) {
            return Err("泳道宽度不合法".into());
        }
        string(l, "title")?;
        number(l, "order")?;
        bool_field(l, "archived")?;
        if let Some(background) = l.get("background") {
            if !matches!(background.as_str(), Some("plain" | "dots" | "grid" | "aurora" | "grain" | "contour" | "rays" | "silk" | "stars" | "radar" | "matrix" | "metal")) {
                return Err("泳道背景不合法".into());
            }
        }
    }
    for t in tasks {
        if !lm.contains_key(string(t, "lane")?) {
            return Err("任务泳道不存在".into());
        }
        string(t, "title")?;
        for k in ["notes", "start", "due", "created", "modified"] {
            text_field(t, k)?;
        }
        for k in ["done", "focused"] {
            bool_field(t, k)?;
        }
        number(t, "order")?;
        valid_style(&t["appearance"])?;
        if let Some(font) = t.get("fontFamily") {
            if font.as_str().is_none_or(|s| s.len() > 256) { return Err("字体名称无效".into()); }
        }
        if t.get("fontSize").is_some() {
            let size = number(t, "fontSize")?;
            if size != 0.0 && !(8.0..=96.0).contains(&size) { return Err("字号必须为8–96或0（默认）".into()); }
        }
        for field in ["start", "due"] {
            if let Some(s) = t[field].as_str() {
                if !s.is_empty() {
                    let valid = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok()
                        || chrono::DateTime::parse_from_rfc3339(s).is_ok();
                    if !valid {
                        return Err("日期格式无效".into());
                    }
                }
            }
        }
        if let (Some(a), Some(b)) = (
            t["start"].as_str().filter(|s| !s.is_empty()),
            t["due"].as_str().filter(|s| !s.is_empty()),
        ) {
            if date_value(a)? > date_value(b)? {
                return Err("开始时间不能晚于截止时间".into());
            }
        }
    }
    let mut pairs = HashSet::new();
    let mut next: HashMap<&str, Vec<&str>> = HashMap::new();
    let mut degree: HashMap<&str, usize> = tm.keys().map(|id| (*id, 0)).collect();
    for e in edges {
        let a = string(e, "source")?;
        let b = string(e, "target")?;
        let ta = tm.get(a).ok_or("连接起点不存在")?;
        let tb = tm.get(b).ok_or("连接终点不存在")?;
        if a == b || ta["lane"] != tb["lane"] || !pairs.insert((a, b)) {
            return Err("禁止自连、重复边或跨泳道连接".into());
        }
        next.entry(a).or_default().push(b);
        *degree.get_mut(b).unwrap() += 1;
    }
    let mut queue: Vec<_> = degree
        .iter()
        .filter(|(_, v)| **v == 0)
        .map(|(k, _)| *k)
        .collect();
    let mut count = 0;
    while let Some(a) = queue.pop() {
        count += 1;
        if let Some(bs) = next.get(a) {
            for b in bs {
                let n = degree.get_mut(b).unwrap();
                *n -= 1;
                if *n == 0 {
                    queue.push(b)
                }
            }
        }
    }
    if count != tasks.len() {
        return Err("连接会形成有向环".into());
    }
    for e in edges {
        text_field(e, "label")?;
        text_field(e, "color")?;
        bool_field(e, "dashed")?;
    }
    for key in ["bands", "markers"] {
        for b in list(d, key)? {
            if !lm.contains_key(string(b, "lane")?) {
                return Err("标注泳道不存在".into());
            }
            string(b, "title")?;
            number(b, "y")?;
            if key == "bands" {
                if number(b, "height")? < 24.0 {
                    return Err("色带不能小于24".into());
                }
                valid_style(&b["appearance"])?;
            } else {
                for k in ["date", "color", "lineStyle"] {
                    text_field(b, k)?;
                }
                if !(0.0..=6.0).contains(&number(b, "lineWidth")?) {
                    return Err("横线线宽无效".into());
                }
            }
        }
    }
    for t in list(d, "trash")? {
        for k in ["title", "kind", "deleted"] {
            text_field(t, k)?;
        }
        if !t["payload"].is_object() {
            return Err("回收站内容无效".into());
        }
        for k in ["views", "lanes", "tasks", "edges", "bands", "markers"] {
            if !t["payload"][k].is_null() {
                list(&t["payload"], k)?;
            }
        }
    }
    let bands = list(d, "bands")?;
    for (i, a) in bands.iter().enumerate() {
        for b in &bands[i + 1..] {
            if a["lane"] == b["lane"]
                && number(a, "y")? < number(b, "y")? + number(b, "height")?
                && number(b, "y")? < number(a, "y")? + number(a, "height")?
            {
                return Err("情境色带不能重叠".into());
            }
        }
    }
    Ok(())
}
#[tauri::command]
pub fn load(store: tauri::State<Store>) -> Result<Snapshot, String> {
    snapshot(&*store.conn.lock().map_err(err)?)
}
#[tauri::command]
pub fn commit(
    app: tauri::AppHandle,
    store: tauri::State<Store>,
    revision: i64,
    document: Value,
    label: String,
) -> Result<Snapshot, String> {
    validate(&document)?;
    let mut c = store.conn.lock().map_err(err)?;
    let tx = c.transaction().map_err(err)?;
    let before = snapshot(&tx)?;
    if before.revision != revision {
        return Err("另一窗口已修改内容。草稿已保留，请重新载入后重试。".into());
    }
    let text = document.to_string();
    tx.execute("DELETE FROM history WHERE undone=1", [])
        .map_err(err)?;
    tx.execute(
        "INSERT INTO history(before_json,after_json,label) VALUES(?1,?2,?3)",
        params![before.document.to_string(), text, label],
    )
    .map_err(err)?;
    tx.execute(
        "UPDATE document SET revision=revision+1,json=?1 WHERE id=1",
        [text],
    )
    .map_err(err)?;
    tx.commit().map_err(err)?;
    let result = snapshot(&c)?;
    drop(c);
    let _ = app.emit("document-changed", result.revision);
    Ok(result)
}
#[tauri::command]
pub fn history(
    app: tauri::AppHandle,
    store: tauri::State<Store>,
    redo: bool,
) -> Result<Snapshot, String> {
    let mut c = store.conn.lock().map_err(err)?;
    let tx = c.transaction().map_err(err)?;
    let query = if redo {
        "SELECT id,after_json FROM history WHERE undone=1 ORDER BY id ASC LIMIT 1"
    } else {
        "SELECT id,before_json FROM history WHERE undone=0 ORDER BY id DESC LIMIT 1"
    };
    let row = tx.query_row(query, [], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
    });
    match row {
        Ok((id, s)) => {
            validate(&serde_json::from_str(&s).map_err(err)?)?;
            tx.execute(
                "UPDATE document SET json=?1,revision=revision+1 WHERE id=1",
                [s],
            )
            .map_err(err)?;
            tx.execute(
                "UPDATE history SET undone=?1 WHERE id=?2",
                params![!redo, id],
            )
            .map_err(err)?;
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {}
        Err(e) => return Err(err(e)),
    }
    tx.commit().map_err(err)?;
    let result = snapshot(&c)?;
    drop(c);
    let _ = app.emit("document-changed", result.revision);
    Ok(result)
}
#[tauri::command]
pub fn state_get(store: tauri::State<Store>, key: String) -> Result<Value, String> {
    let c = store.conn.lock().map_err(err)?;
    let r = c.query_row("SELECT json FROM view_state WHERE key=?1", [key], |r| {
        r.get::<_, String>(0)
    });
    match r {
        Ok(s) => serde_json::from_str(&s).map_err(err),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(Value::Null),
        Err(e) => Err(err(e)),
    }
}
#[tauri::command]
pub fn state_set(store: tauri::State<Store>, key: String, value: Value) -> Result<(), String> {
    store.conn.lock().map_err(err)?.execute("INSERT INTO view_state(key,json) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET json=excluded.json",params![key,value.to_string()]).map_err(err)?;
    Ok(())
}
#[tauri::command]
pub fn data_location(store: tauri::State<Store>) -> String {
    store.path.display().to_string()
}
fn checked_backup(path: &std::path::Path) -> Result<Value, String> {
    let c = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(err)?;
    let check: String = c
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(err)?;
    if check != "ok" {
        return Err("备份文件损坏".into());
    }
    c.prepare("SELECT id,before_json,after_json,label,undone FROM history LIMIT 0")
        .map_err(err)?;
    c.prepare("SELECT key,json FROM view_state LIMIT 0")
        .map_err(err)?;
    let document = snapshot(&c)?.document;
    validate(&document)?;
    Ok(document)
}
#[tauri::command]
pub async fn export_file(
    app: tauri::AppHandle,
    kind: String,
    text: Option<String>,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ext = if kind == "backup" {
            "db"
        } else if kind == "markdown" {
            "md"
        } else {
            "json"
        };
        let Some(path) = rfd::FileDialog::new()
            .set_title("导出顺水意流 · floward")
            .set_file_name(format!(
                "floward-{}.{}",
                chrono::Local::now().format("%Y%m%d-%H%M%S"),
                ext
            ))
            .add_filter("floward", &[ext])
            .save_file()
        else {
            return Ok(None);
        };
        let store = app.state::<Store>();
        let c = store.conn.lock().map_err(err)?;
        if path == store.path {
            return Err("不能覆盖正在使用的数据库".into());
        }
        if kind == "backup" {
            let temp = path.with_extension(format!("{}.partial", uuid::Uuid::new_v4()));
            c.backup("main", &temp, None).map_err(err)?;
            let b = Connection::open(&temp).map_err(err)?;
            let check: String = b
                .query_row("PRAGMA integrity_check", [], |r| r.get(0))
                .map_err(err)?;
            if check != "ok" {
                return Err("备份校验失败".into());
            }
            drop(b);
            std::fs::rename(&temp, &path).map_err(err)?;
        } else {
            let body = if kind == "markdown" {
                text.ok_or("缺少导出内容")?
            } else {
                serde_json::to_string_pretty(&snapshot(&c)?.document).map_err(err)?
            };
            std::fs::write(&path, body).map_err(err)?;
        }
        Ok(Some(path.display().to_string()))
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn import_file(app: tauri::AppHandle, backup: bool) -> Result<Option<Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = rfd::FileDialog::new()
            .set_title(if backup {
                "选择完整备份"
            } else {
                "导入 V2 JSON"
            })
            .add_filter("floward", if backup { &["db"] } else { &["json"] })
            .pick_file()
        else {
            return Ok(None);
        };
        let d = if backup {
            checked_backup(&path)?
        } else {
            serde_json::from_str(&std::fs::read_to_string(&path).map_err(err)?).map_err(err)?
        };
        validate(&d)?;
        if backup {
            let store = app.state::<Store>();
            if path.canonicalize().map_err(err)? == store.path.canonicalize().map_err(err)? {
                return Err("请选择导出的备份文件，不能用当前库恢复自身".into());
            }
            let mut c = store.conn.lock().map_err(err)?;
            let original = store.path.with_file_name(format!(
                "before-restore-{}.db",
                chrono::Local::now().format("%Y%m%d-%H%M%S")
            ));
            c.backup("main", original, None).map_err(err)?;
            let old = snapshot(&c)?.revision;
            c.restore("main", &path, None::<fn(rusqlite::backup::Progress)>)
                .map_err(err)?;
            c.execute("UPDATE document SET revision=?1 WHERE id=1", [old + 1])
                .map_err(err)?;
            drop(c);
            let _ = app.emit("document-changed", old + 1);
            let _ = app.emit("workspace-restored", old + 1);
            return Ok(Some(json!({"restored":true})));
        }
        Ok(Some(d))
    })
    .await
    .map_err(err)?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backup_roundtrip_keeps_document_history_and_camera() {
        let base = std::env::temp_dir().join(format!("floward-check-{}", uuid::Uuid::new_v4()));
        let path = base.with_extension("db");
        let backup = base.with_extension("backup.db");
        let store = Store::open(path.clone()).unwrap();
        let mut c = store.conn.lock().unwrap();
        let d = initial();
        c.execute("INSERT INTO view_state VALUES('main/camera/root/lane-first','{\"x\":-100,\"y\":-90,\"zoom\":1}')",[]).unwrap();
        c.execute(
            "INSERT INTO history(before_json,after_json,label) VALUES(?1,?1,'sample')",
            [d.to_string()],
        )
        .unwrap();
        c.backup("main", &backup, None).unwrap();
        assert_eq!(checked_backup(&backup).unwrap(), d);
        c.execute("DELETE FROM history", []).unwrap();
        c.execute("DELETE FROM view_state", []).unwrap();
        c.restore("main", &backup, None::<fn(rusqlite::backup::Progress)>)
            .unwrap();
        assert_eq!(
            c.query_row("SELECT COUNT(*) FROM history", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert!(c
            .query_row("SELECT json FROM view_state", [], |r| r.get::<_, String>(0))
            .unwrap()
            .contains("-100"));
        drop(c);
        drop(store);
        let _ = std::fs::remove_file(path);
        let _ = std::fs::remove_file(backup);
    }
    #[test]
    fn incomplete_backup_is_rejected_without_changing_live_store() {
        let path =
            std::env::temp_dir().join(format!("floward-incomplete-{}.db", uuid::Uuid::new_v4()));
        let fake = Connection::open(&path).unwrap();
        fake.execute_batch("CREATE TABLE document(id,revision,json)")
            .unwrap();
        fake.execute(
            "INSERT INTO document VALUES(1,0,?1)",
            [initial().to_string()],
        )
        .unwrap();
        drop(fake);
        assert!(checked_backup(&path).is_err());
        let _ = std::fs::remove_file(path);
    }
}
