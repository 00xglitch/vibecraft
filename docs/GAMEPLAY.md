# Vibecraft Gameplay Guide

Welcome to Vibecraft! This guide explains how to get the most out of visualizing your Claude Code sessions in 3D.

## Getting Started

### 1. Setup

```bash
# Install and configure
npx vibecraft setup

# Start the server
npx vibecraft

# Open http://localhost:4002 in your browser
```

### 2. Start a Claude Session

Either:

- Click on an empty hex zone in the 3D scene to create a new session
- Press `Alt+N` to open the new session modal
- Start Claude in any terminal - Vibecraft will detect it automatically

## The Workshop

The workshop is a 3D space where each Claude session gets its own **hexagonal zone**. Inside each zone, your Claude character moves between **workstations** based on the tools being used.

### Workstations

| Station       | Tools               | Visual                                   |
| ------------- | ------------------- | ---------------------------------------- |
| **Bookshelf** | Read                | Books being pulled from shelves          |
| **Workbench** | Edit                | Tools and gears spinning                 |
| **Desk**      | Write               | Paper and pencil writing                 |
| **Terminal**  | Bash                | Computer terminal with flickering screen |
| **Scanner**   | Grep, Glob          | Scanning beams and search patterns       |
| **Antenna**   | WebFetch, WebSearch | Broadcasting signals                     |
| **Portal**    | Task                | Spinning portal for subagents            |
| **Taskboard** | TodoWrite           | Sticky notes appearing                   |

### Subagents

When Claude spawns Task tools (subagents), mini-Claudes appear in the 3D scene:

- **Zone-matched colors**: Subagents inherit their parent zone's color, getting slightly dimmer with depth
- **Connection lines**: Dashed lines connect subagents to the zone center or their parent agent
- **Hierarchy positioning**: Root subagents spiral out from zone center; nested subagents orbit their parent
- **Size scaling**: Deeper nested subagents are smaller (60% base, decreasing with depth)

### Zone Status Colors

Zone floors glow different colors to indicate status:

| Color                 | Status    | Meaning                       |
| --------------------- | --------- | ----------------------------- |
| **Subtle zone color** | Idle      | Waiting for input             |
| **Cyan pulse**        | Working   | Claude is processing          |
| **Amber pulse**       | Waiting   | Question or permission needed |
| **Red pulse**         | Attention | Requires user action          |
| **Dim**               | Offline   | Session ended or disconnected |

## Characters

Choose your avatar in Settings (`Alt+D` → Settings):

| Character       | Description                     |
| --------------- | ------------------------------- |
| **ClaudeMon**   | Friendly robot buddy (default)  |
| **AfroSamurai** | Cool samurai with katana        |
| **Ninja**       | Stealthy warrior with red eyes  |
| **Wizard**      | Mystical spellcaster with staff |
| **Rick**        | Genius scientist with flask     |
| **Morty**       | Nervous sidekick                |
| **Pacman**      | Classic arcade character        |

Each character has unique idle animations and working behaviors!

## Keyboard Shortcuts

### Navigation

| Key            | Action                                 |
| -------------- | -------------------------------------- |
| `Tab` / `Esc`  | Switch focus: Workshop ↔ Activity Feed |
| `1-6`          | Switch to session 1-6                  |
| `Q-Y`          | Switch to session 7-12                 |
| `A-H`          | Switch to session 13-18                |
| `Alt+key`      | Switch to session (works in inputs)    |
| `0` or `` ` `` | Overview (all sessions)                |

### Actions

| Key         | Action                                       |
| ----------- | -------------------------------------------- |
| `Alt+N`     | New session modal                            |
| `Alt+A`     | Go to next session needing attention         |
| `Alt+Space` | Expand most recent "show more" in feed       |
| `Alt+R`     | Toggle voice recording                       |
| `F`         | Toggle follow-active mode                    |
| `P`         | Toggle station panels                        |
| `Ctrl+C`    | Copy (if text selected) or interrupt session |

### Draw Mode

| Key   | Action                       |
| ----- | ---------------------------- |
| `D`   | Toggle draw mode             |
| `1-6` | Select color                 |
| `0`   | Eraser                       |
| `Q/E` | Decrease/increase brush size |
| `R`   | Toggle 3D stacking           |
| `X`   | Clear all painted hexes      |

## Session Management

### Creating Sessions

1. **Quick Create**: Click empty floor hex
2. **Full Options**: `Alt+N` opens modal with:
   - Name (auto-detected from directory)
   - Working directory
   - Model selection (Sonnet, Opus, Haiku)
   - Extended thinking toggle
   - Permission flags

### Session Sidebar

- **Pin sessions**: Click 📌 to pin to top
- **Drag to reorder**: Drag sessions to rearrange
- **Archive**: Hide inactive sessions
- **Status badges**: Shows working/idle/attention state

### Zone Info Modal

Right-click a zone to see:

- Session details and statistics
- Token usage (current + cumulative)
- Git status (branch, changes, commits)
- Files touched
- MCP servers connected
- Recent file changes (with rollback option)

## Activity Feed

The activity feed shows real-time Claude activity:

- **User prompts** in blue
- **Tool usage** with collapsible details
- **Claude responses** in purple
- **Thinking indicators** with animated dots

### Feed Controls

- Click session in sidebar to filter feed
- "All Sessions" shows everything
- Click "show more" to expand long content
- `Alt+Space` expands most recent item

## Sound Effects

Vibecraft plays synthesized sounds for:

- Tool usage (different sound per tool type)
- Success/error results
- Character movement
- Git commits (special fanfare!)
- Subagent spawn/despawn

Toggle in Settings or with volume control in HUD.

### Spatial Audio

Sounds are positioned based on zone location:

- Far zones are quieter
- Zones to the left/right pan accordingly
- Focused zone gets a volume boost

## Plugins

Access plugins from the sidebar:

### Model Selector

- Choose between Sonnet, Opus, and Haiku
- Affects new sessions

### Thinking Toggle

- Enable extended thinking mode
- Shows more detailed reasoning

### MCP List

- View connected MCP servers
- See tool counts per server

## Tips & Tricks

### Productivity

1. **Use keyboard shortcuts** - `1-6` to quickly switch sessions
2. **Pin active sessions** - Keep your main work sessions at the top
3. **Archive finished sessions** - Reduce clutter without deleting
4. **Check git status** - Right-click zone for quick repo info

### Debugging

1. **Watch the character** - Movement shows which tools are running
2. **Expand tool details** - Click to see file paths, commands
3. **Use station panels** - Press `P` to see recent tool history
4. **Check tokens** - Zone info shows usage stats

### Fun

1. **Try different characters** - Each has unique animations
2. **Use draw mode** - Paint hexes to customize your workspace
3. **Watch subagents** - Mini-claudes spawn from the portal
4. **Listen to sounds** - Each tool has its signature sound

## Troubleshooting

### Session Not Appearing

1. Check Claude is running with hooks enabled
2. Verify `~/.claude/settings.json` has hook config
3. Run `npx vibecraft setup` to reconfigure

### Character Not Moving

1. Check WebSocket connection (status in HUD)
2. Verify events are being received
3. Check browser console for errors

### Sound Not Playing

1. Click anywhere first (browser audio policy)
2. Check volume slider isn't muted
3. Verify sound is enabled in settings

### Performance Issues

1. Reduce number of active sessions
2. Disable shadows in settings
3. Close unused browser tabs
4. Archive finished sessions

## Advanced Features

### Rollback

When Claude edits files, changes are tracked. Access via Zone Info modal:

- View recent file changes
- See before/after diffs
- Click "Rollback" to restore previous version

### Google Jules Integration

For async tasks that can run in the background:

1. Ensure `npm install -g @google/jules` is installed
2. Create tasks via API or UI
3. Monitor progress in Jules panel
4. Get notified when PR is ready

### Voice Input

1. Click microphone or press `Alt+R`
2. Speak your prompt
3. Real-time transcription appears
4. Press Enter to send

Requires Deepgram API key in server config.

---

Happy coding with Vibecraft! 🎮
