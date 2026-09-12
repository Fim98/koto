import { ClaudeHookService } from '../claude/hook-service'
import { CODEBUDDY_HOOK_SETTINGS } from '../claude/hook-settings'

// Why: CodeBuddy Code is a Claude Code fork — same settings.json hooks schema,
// same hook event names, same `~/.codebuddy` config dir — so the managed Claude
// hook installer applies verbatim and its events post to the shared
// Claude-compatible `/hook/claude` route.
export const codebuddyHookService = new ClaudeHookService({
  agent: 'codebuddy',
  displayName: 'CodeBuddy',
  settings: CODEBUDDY_HOOK_SETTINGS
})
