<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="96" height="96" alt="Floward's blue flowing-water logo">
</p>

<h1 align="center">顺水意流 · floward</h1>

<p align="center"><strong>Use tasks and connections to turn what you want to do into concrete next steps.</strong></p>

<p align="center">A planning tool for Windows · Local storage · Offline use</p>

<p align="center"><a href="README.md">简体中文</a> · English</p>

<p align="center">
  <a href="#features">Features &amp; Demos</a> ·
  <a href="#start">Download &amp; Usage</a> ·
  <a href="#why">Motivation &amp; Related Research</a> ·
  <a href="#credits">Acknowledgments &amp; License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Windows_11-x64-3978c6?style=flat-square" alt="Windows 11 x64">
  <img src="https://img.shields.io/badge/version-2.0.0-5a8163?style=flat-square" alt="Version 2.0.0">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0--only-8a699c?style=flat-square" alt="GPL-3.0-only"></a>
</p>

I'm at my computer, researching a small tool I want to build. My browser is full of similar products, tutorials, and articles; my notes are full of ideas. Several evenings later, I'm increasingly sure what it should look like, but I still haven't put anything in front of another person. When I reopen the project, there are plenty of questions I could keep researching. What I can't say is which thing I should actually do today.

I start wondering: could I write a one-page explanation and ask two people to try it? That means preparing the explanation and inviting people separately, then bringing the two together to see where they get stuck. Their feedback could tell me whether to improve the explanation, change a feature, or reconsider the idea itself.

That's why I made Floward. Write what you want to do in a box, then draw connections downward to add concrete steps. Branch out for things that need separate preparation, and bring them together afterward. The software arranges the positions; double-click a complex task to break it down inside. When I open it, I want to see “the explanation still needs an example” or “who should I ask to try this?”—and pick one thing to actually do.

<a id="features"></a>

## ✨ Features & Demos

### Creating tasks and the basic view

Preparing a small trial means writing an explanation and finding people willing to try it. Connect those two tasks below the goal, then connect both to “try it for real.” The relationship between the preparations becomes clear.

Drag from the bottom edge of a task into empty space and type the next task. Drag to an existing task to connect the two. Positions are arranged automatically as you add branches and joins, so you don't have to line up every box yourself.

![Creating tasks and the basic Floward view](<docs/media/floward 创建及基本视图.gif>)

### Projects with multiple levels

“Write a one-page explanation” can be broken down further: identify the reader, choose an example, and put the draft together. Double-click a task to enter its internal graph. Click “首页” (Home) at the top to return to the overview.

The notes on the right can hold a specific progress update, such as “the opening is written; next, add an example of where a first-time user gets stuck.” Keep the main steps in the overview and open the details when you need them.

![A project with multiple levels](docs/media/多层项目.gif)

### Setting a task background

Creative work and learning can live in separate lanes, each with its own saved viewing position. Within a lane, use background bands to distinguish “prepare the explanation” from “collect feedback,” and a horizontal marker to mark the first trial.

You choose the titles, colors, and positions of bands and markers. Dates don't rearrange your tasks into a calendar.

![Setting a task background](docs/media/设置事件背景.gif)

Your content stays on your computer. The menu offers full backup and restore, plus JSON and Markdown export. A full backup takes your edit history and settings with you when you move to another computer.

<a id="start"></a>

## 🚀 Download & Usage

For **Windows 11 x64**. Current version: **2.0.0**.

1. **Download, install, and open.** [Download the Windows x64 installer](https://github.com/Lucian-D-W/floward/releases/download/v2.0.0/floward_2.0.0_x64-setup.exe), run `floward_2.0.0_x64-setup.exe`, follow the installation prompts, then open floward from the Start menu. If WebView2 is missing, the installer downloads the Microsoft runtime during initial setup.
2. **Write your first task.** Right-click empty space in a lane, choose “新建事项” (New task), type, and press Enter to save. Shift+Enter inserts a line break.
3. **Connect the next step.** Drag from the bottom edge of a task into empty space to create a successor, or to an existing task to connect them. Click a task and press Enter to edit its text; double-click to go inside.
4. **Save a backup.** Choose “完整备份…” (Full backup) from the menu and save the file in your backup location.

Everyday use requires no development tools. Enable the Windows desktop display from the menu; it shares content with the main window. Choose “完全退出” (Quit completely) from the system tray to exit the whole application.

For development, see the [development and build guide](docs/DEVELOPMENT.md).

Find versions and installers in [Releases](https://github.com/Lucian-D-W/floward/releases), and report problems or suggestions in [Issues](https://github.com/Lucian-D-W/floward/issues).

<a id="why"></a>

## 💡 Motivation & Related Research

**References**

**1. On Distinguishing Epistemic from Pragmatic Action**  
David Kirsh and Paul Maglio, 1994, *Cognitive Science*, 18(4), 513–549. [Paper](https://doi.org/10.1207/s15516709cog1804_1). Studying movement and rotation in Tetris, the authors describe actions that make it easier to see and judge a situation, reducing the need for mental computation. Drawing relationships gives me a way to think about that idea of reasoning through interaction.

**2. Planning and Acting in Partially Observable Stochastic Domains**  
Leslie Pack Kaelbling, Michael L. Littman, and Anthony R. Cassandra, 1998, *Artificial Intelligence*, 101(1–2), 99–134. [Paper](https://people.csail.mit.edu/lpk/papers/aij98-pomdp.pdf). The paper studies action selection with incomplete information, considering both changes to the environment and information gathering within the same decision problem. What interests me is that a trial can make the next step clearer even when it doesn't immediately complete the goal.

**3. Atomic Habits**  
James Clear, 2018. [Excerpt on the author's website](https://jamesclear.com/three-steps-habit-change). The book's four principles of behavior design are to make the cue obvious, the behavior attractive, the action easy, and the feedback satisfying. They prompted me to consider whether a tool remains easy to use as energy and circumstances change.

**Design influences and application**

I don't want organizing a plan to become another major project. Choosing node types, filling in forms, and positioning everything can consume a whole session before I've touched the thing I meant to do. So Floward uses ordinary tasks and connections, lets automatic layout handle positions, and keeps details inside tasks until they're needed. Connecting two things, noticing a gap, and adding a task can themselves help me think.

I also want a graph to have room for “try it once and see what happens.” A trial might reveal that the explanation needs work, or that the original direction should change. The relationships in the graph can change with it; a planned sequence doesn't force you to complete tasks in that order. What I want to keep is the record of those attempts and how my judgment changed, beyond the tidy plan I started with.

<a id="credits"></a>

## 🙏 Acknowledgments & License

Thanks to [Tauri](https://tauri.app/), [React](https://react.dev/), [React Flow](https://reactflow.dev/), [ELK / elkjs](https://github.com/kieler/elkjs), SQLite, and [tauri-plugin-wallpaper](vendor/tauri-plugin-wallpaper/FLOWARD-PATCHES.md) for the foundations of the desktop windows, graph interactions, automatic layout, and local storage.

Copyright © 2026 **Lucian W. (lucian-d-w)**. Original project code is licensed under **[GPL-3.0-only](LICENSE)**; see the [copyright statement](COPYRIGHT) for its scope. Third-party code and materials retain their own licenses and attribution; see [third-party notices](THIRD_PARTY_NOTICES.md).
