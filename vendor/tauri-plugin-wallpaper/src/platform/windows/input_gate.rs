//! Floward C01 local patch: one owner per pointer gesture. The hook only
//! handles reported application regions on the desktop and yields icon hits.
//! No keyboard hook or synthetic keyboard input is installed.
use std::sync::{Arc,LazyLock,Mutex};
use std::sync::atomic::{AtomicBool,Ordering};
use std::time::{Duration,Instant};
use windows::{core::BOOL,Win32::{Foundation::{HWND,LPARAM,LRESULT,POINT,RECT,WPARAM,CloseHandle},Graphics::Gdi::{ClientToScreen,ScreenToClient},UI::{WindowsAndMessaging::*,Input::KeyboardAndMouse::{GetAsyncKeyState,GetDoubleClickTime,VK_CONTROL,VK_SHIFT}},System::{Threading::{OpenProcess,PROCESS_VM_OPERATION,PROCESS_VM_READ,PROCESS_VM_WRITE},Memory::{VirtualAllocEx,VirtualFreeEx,MEM_COMMIT,MEM_RESERVE,MEM_RELEASE,PAGE_READWRITE},Diagnostics::Debug::{ReadProcessMemory,WriteProcessMemory}}}};
#[derive(Clone)]struct Target{label:String,host:isize,input:isize}
type Focus=Arc<dyn Fn(&str)+Send+Sync+'static>;
static TARGETS:LazyLock<Mutex<Vec<Target>>>=LazyLock::new(||Mutex::new(Vec::new()));
static REGIONS:LazyLock<Mutex<std::collections::HashMap<String,Vec<[i32;4]>>>>=LazyLock::new(||Mutex::new(std::collections::HashMap::new()));
static FOCUS:LazyLock<Mutex<Option<Focus>>>=LazyLock::new(||Mutex::new(None));
static ICONS:LazyLock<Mutex<Vec<[i32;4]>>>=LazyLock::new(||Mutex::new(Vec::new()));
static OWNER:Mutex<Option<(isize,u32)>>=Mutex::new(None);
static STARTED:AtomicBool=AtomicBool::new(false);
static LAST_DOWN:LazyLock<Mutex<Option<(isize,Instant,POINT)>>>=LazyLock::new(||Mutex::new(None));
fn hwnd(v:isize)->HWND{HWND(v as _)}
pub(crate) fn set_focus_callback(f:Focus){*FOCUS.lock().unwrap()=Some(f)}
pub(crate) fn set_regions(label:&str,regions:Vec<[i32;4]>){REGIONS.lock().unwrap().insert(label.to_owned(),regions);}
unsafe fn class(h:HWND)->String{let mut s=[0u8;128];let n=GetClassNameA(h,&mut s);String::from_utf8_lossy(&s[..n.max(0) as usize]).into_owned()}
unsafe fn find_child(root:HWND,name:&str)->Option<HWND>{struct Search<'a>{name:&'a str,result:isize}unsafe extern "system" fn visit(w:HWND,p:LPARAM)->BOOL{let s=&mut *(p.0 as *mut Search);if class(w)==s.name{s.result=w.0 as isize;return BOOL(0)}BOOL(1)}let mut s=Search{name,result:0};let _=EnumChildWindows(Some(root),Some(visit),LPARAM(&mut s as *mut _ as isize));(s.result!=0).then(||hwnd(s.result))}
pub(super) fn register_target(label:&str,host:isize,mouse:bool,_keyboard:bool)->crate::Result<()>{
 if !mouse{unregister_target(host);return Ok(())}let input=unsafe{find_child(hwnd(host),"Chrome_WidgetWin_1").or_else(||find_child(hwnd(host),"Chrome_RenderWidgetHostHWND")).unwrap_or(hwnd(host))}.0 as isize;
 let mut ts=TARGETS.lock().unwrap();ts.retain(|t|t.host!=host);ts.push(Target{label:label.into(),host,input});drop(ts);
 if !STARTED.swap(true,Ordering::SeqCst){std::thread::spawn(||unsafe{let hook=SetWindowsHookExW(WH_MOUSE_LL,Some(mouse_hook),None,0);if hook.is_err(){STARTED.store(false,Ordering::SeqCst);return}let mut msg=MSG::default();while GetMessageW(&mut msg,None,0,0).as_bool(){let _=TranslateMessage(&msg);DispatchMessageW(&msg);}if let Ok(h)=hook{let _=UnhookWindowsHookEx(h);}});std::thread::spawn(||loop{if !TARGETS.lock().unwrap().is_empty(){let icons=unsafe{icon_rectangles()};*ICONS.lock().unwrap()=icons;}std::thread::sleep(Duration::from_millis(700));});}
 Ok(())
}
pub(crate) fn unregister_target(host:isize){TARGETS.lock().unwrap().retain(|t|t.host!=host);let mut owner=OWNER.lock().unwrap();if owner.is_some_and(|(h,_)|h==host){*owner=None}}
pub(super) fn handle_wm_input(_p:LPARAM){} // Raw forwarding is replaced, never doubled.
fn inside(r:[i32;4],p:POINT)->bool{p.x>=r[0]&&p.y>=r[1]&&p.x<r[2]&&p.y<r[3]}
unsafe extern "system" fn mouse_hook(code:i32,w:WPARAM,l:LPARAM)->LRESULT{
 if code<0{return CallNextHookEx(None,code,w,l)}
 let event=&*(l.0 as *const MSLLHOOKSTRUCT);let msg=w.0 as u32;
 let targets=match TARGETS.try_lock(){Ok(t)=>t.clone(),Err(_)=>return CallNextHookEx(None,code,w,l)};
 if targets.is_empty(){return CallNextHookEx(None,code,w,l)}
 let captured=*OWNER.lock().unwrap();
 let target=if let Some((host,_))=captured{targets.iter().find(|t|t.host==host).cloned()}else{
  let pointed=WindowFromPoint(event.pt);let root=GetAncestor(pointed,GA_ROOT);
  let mut ancestor=pointed;for _ in 0..12{if targets.iter().any(|t|t.host==ancestor.0 as isize){return CallNextHookEx(None,code,w,l)}let parent=GetAncestor(ancestor,GA_PARENT);if parent==ancestor||parent.is_invalid(){break}ancestor=parent;}
  let c=class(root);if c!="Progman"&&c!="WorkerW"{return CallNextHookEx(None,code,w,l)}
  // Yield clicks on desktop icons and labels, including input focus, to Shell.
  if ICONS.lock().unwrap().iter().any(|r|inside(*r,event.pt)){return CallNextHookEx(None,code,w,l)}
  targets.iter().find(|t|{let mut p=event.pt;let _=ScreenToClient(hwnd(t.host),&mut p);REGIONS.lock().unwrap().get(&t.label).is_some_and(|rs|rs.iter().any(|r|inside(*r,p)))}).cloned()
 };
 let Some(t)=target else{return CallNextHookEx(None,code,w,l)};
 if !IsWindow(Some(hwnd(t.host))).as_bool(){unregister_target(t.host);return CallNextHookEx(None,code,w,l)}
 let down=matches!(msg,WM_LBUTTONDOWN|WM_RBUTTONDOWN|WM_MBUTTONDOWN);let up=matches!(msg,WM_LBUTTONUP|WM_RBUTTONUP|WM_MBUTTONUP);
 if down{*OWNER.lock().unwrap()=Some((t.host,msg));if let Some(f)=FOCUS.lock().unwrap().clone(){f(&t.label)}}
 let owner=*OWNER.lock().unwrap();let mut flags=0usize;
 if !up{if let Some((_,button))=owner{flags|=match button{WM_LBUTTONDOWN=>1,WM_RBUTTONDOWN=>2,WM_MBUTTONDOWN=>16,_=>0}}}
 if GetAsyncKeyState(VK_SHIFT.0 as i32)<0{flags|=4}if GetAsyncKeyState(VK_CONTROL.0 as i32)<0{flags|=8}
 let wheel=matches!(msg,WM_MOUSEWHEEL|WM_MOUSEHWHEEL);let mut p=event.pt;if !wheel{let _=ScreenToClient(hwnd(t.input),&mut p);}let lp=LPARAM(((p.y as isize)<<16)|((p.x as isize)&0xffff));let wp=WPARAM(if wheel{flags|((event.mouseData as usize)&0xffff0000)}else{flags});
 let mut send=msg;if msg==WM_LBUTTONDOWN{let mut last=LAST_DOWN.lock().unwrap();if last.as_ref().is_some_and(|(host,time,pos)|*host==t.host&&time.elapsed().as_millis()<(GetDoubleClickTime() as u128)&&(pos.x-event.pt.x).abs()<4&&(pos.y-event.pt.y).abs()<4){send=WM_LBUTTONDBLCLK;*last=None}else{*last=Some((t.host,Instant::now(),event.pt))}}
 let _=PostMessageA(Some(hwnd(t.input)),send,wp,lp);
 if up{*OWNER.lock().unwrap()=None;}
 if msg==WM_MOUSEMOVE{CallNextHookEx(None,code,w,l)}else{LRESULT(1)}
}
unsafe fn icon_rectangles()->Vec<[i32;4]>{
 unsafe extern "system" fn visit(w:HWND,p:LPARAM)->BOOL{if let Some(def)=find_child(w,"SHELLDLL_DefView"){if let Some(list)=find_child(def,"SysListView32"){*(p.0 as *mut isize)=list.0 as isize;return BOOL(0)}}BOOL(1)}
 let mut raw=0isize;let _=EnumWindows(Some(visit),LPARAM(&mut raw as *mut _ as isize));if raw==0{return vec![]};let list=hwnd(raw);let mut pid=0;GetWindowThreadProcessId(list,Some(&mut pid));let Ok(process)=OpenProcess(PROCESS_VM_OPERATION|PROCESS_VM_READ|PROCESS_VM_WRITE,false,pid)else{return vec![]};let remote=VirtualAllocEx(process,None,std::mem::size_of::<RECT>(),MEM_COMMIT|MEM_RESERVE,PAGE_READWRITE);if remote.is_null(){let _=CloseHandle(process);return vec![]}
 let mut count=0usize;let _=SendMessageTimeoutW(list,0x1004,WPARAM(0),LPARAM(0),SMTO_ABORTIFHUNG,100,Some(&mut count));let mut rects=vec![];
 for i in 0..count.min(1000){let mut rect=RECT::default();let mut result=0usize;if WriteProcessMemory(process,remote,&rect as *const _ as _,std::mem::size_of::<RECT>(),None).is_err(){break}let ok=SendMessageTimeoutW(list,0x100e,WPARAM(i),LPARAM(remote as isize),SMTO_ABORTIFHUNG,50,Some(&mut result));if ok.0==0||result==0{continue}if ReadProcessMemory(process,remote,&mut rect as *mut _ as _,std::mem::size_of::<RECT>(),None).is_ok(){let mut origin=POINT::default();let _=ClientToScreen(list,&mut origin);rects.push([rect.left+origin.x,rect.top+origin.y,rect.right+origin.x,rect.bottom+origin.y]);}}
 let _=VirtualFreeEx(process,remote,0,MEM_RELEASE);let _=CloseHandle(process);rects
}
