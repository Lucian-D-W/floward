import {Component,type ReactNode} from 'react';
export default class ErrorBoundary extends Component<{children:ReactNode},{error:string|null}>{
 state={error:null as string|null};
 static getDerivedStateFromError(error:unknown){return{error:String(error)}}
 render(){return this.state.error?<section className="loading"><p>界面暂时无法显示。</p><p>重新打开会读取本地已保存的内容；未提交文字可在菜单的草稿恢复中查看。</p><button onClick={()=>location.reload()}>重新打开</button><details><summary>错误信息</summary>{this.state.error}</details></section>:this.props.children}
}
