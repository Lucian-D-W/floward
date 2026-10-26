#[tauri::command]
pub fn system_fonts() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    unsafe {
        use std::collections::BTreeSet;
        use windows::Win32::{Foundation::LPARAM, Graphics::Gdi::*};
        unsafe extern "system" fn collect(
            font: *const LOGFONTW, _: *const TEXTMETRICW, _: u32, data: LPARAM,
        ) -> i32 {
            let names = &mut *(data.0 as *mut BTreeSet<String>);
            let face = &(*font).lfFaceName;
            let end = face.iter().position(|c| *c == 0).unwrap_or(face.len());
            let name = String::from_utf16_lossy(&face[..end]);
            if !name.is_empty() && !name.starts_with('@') { names.insert(name); }
            1
        }
        let dc = GetDC(None);
        if dc.0.is_null() { return Err("无法读取系统字体".into()); }
        let mut names = BTreeSet::<String>::new();
        let mut query = LOGFONTW::default();
        query.lfCharSet = DEFAULT_CHARSET;
        EnumFontFamiliesExW(dc, &query, Some(collect), LPARAM(&mut names as *mut _ as isize), 0);
        ReleaseDC(None, dc);
        Ok(names.into_iter().collect())
    }
    #[cfg(not(windows))]
    Ok(vec![])
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn installed_fonts_have_unique_family_names() {
        let names = super::system_fonts().unwrap();
        assert!(!names.is_empty());
        assert!(names.windows(2).all(|pair| pair[0] < pair[1]));
        assert!(names.iter().all(|name| !name.starts_with('@')));
    }
}
