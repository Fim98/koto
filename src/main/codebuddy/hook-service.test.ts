// Why: CodeBuddy reuses the Claude-compatible installer through CODEBUDDY_HOOK_SETTINGS, so the
// contract to lock in is the parameterization — config dir, script file name, no statusline —
// not the shared install mechanics the claude hook-service tests already cover.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi, describe, expect, it } from 'vitest'

import { createManagedCommandMatcher } from '../agent-hooks/installer-utils'
import { codebuddyHookService } from './hook-service'
import { CLAUDE_EVENTS } from '../claude/hook-settings'

const CODEBUDDY_SCRIPT_FILE_NAME =
  process.platform === 'win32' ? 'codebuddy-hook.cmd' : 'codebuddy-hook.sh'
const isCodebuddyManagedCommand = createManagedCommandMatcher(CODEBUDDY_SCRIPT_FILE_NAME)

type TestHook = { command: string; args?: string[] }

function hasManagedCommand(hook: TestHook) {
  return (
    isCodebuddyManagedCommand(hook.command) || hook.args?.some(isCodebuddyManagedCommand) === true
  )
}

function stubHome(): { tmpHome: string; cleanup: () => void } {
  const tmpHome = mkdtempSync(join(tmpdir(), 'orca-codebuddy-hooks-'))
  vi.stubEnv('HOME', tmpHome)
  vi.stubEnv('USERPROFILE', tmpHome)
  return {
    tmpHome,
    cleanup: () => {
      vi.unstubAllEnvs()
      rmSync(tmpHome, { recursive: true, force: true })
    }
  }
}

describe('codebuddyHookService', () => {
  it('installs managed hooks into ~/.codebuddy/settings.json under the codebuddy script name', () => {
    const { tmpHome, cleanup } = stubHome()
    try {
      const configPath = join(tmpHome, '.codebuddy', 'settings.json')
      mkdirSync(join(tmpHome, '.codebuddy'), { recursive: true })
      writeFileSync(configPath, JSON.stringify({ trustedDirectories: ['/tmp'] }))

      const status = codebuddyHookService.install()
      expect(status).toMatchObject({ agent: 'codebuddy', state: 'installed', configPath })

      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(config.trustedDirectories).toEqual(['/tmp'])
      for (const event of CLAUDE_EVENTS) {
        const hooks = config.hooks[event.eventName].flatMap(
          (definition: { hooks: TestHook[] }) => definition.hooks
        )
        expect(hooks.some(hasManagedCommand)).toBe(true)
      }

      // The managed script body posts to the shared Claude-compatible route.
      const script = readFileSync(
        join(homedir(), '.orca', 'agent-hooks', CODEBUDDY_SCRIPT_FILE_NAME),
        'utf-8'
      )
      expect(script).toContain('/hook/claude')
    } finally {
      cleanup()
    }
  })

  it('never installs a statusLine (Claude-only feed)', () => {
    const { tmpHome, cleanup } = stubHome()
    try {
      const configPath = join(tmpHome, '.codebuddy', 'settings.json')
      mkdirSync(join(tmpHome, '.codebuddy'), { recursive: true })
      writeFileSync(configPath, '{}')

      codebuddyHookService.install()
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(config.statusLine).toBeUndefined()
    } finally {
      cleanup()
    }
  })

  it('removes managed hooks while preserving user settings', () => {
    const { tmpHome, cleanup } = stubHome()
    try {
      const configPath = join(tmpHome, '.codebuddy', 'settings.json')
      mkdirSync(join(tmpHome, '.codebuddy'), { recursive: true })
      writeFileSync(configPath, '{}')

      codebuddyHookService.install()
      const status = codebuddyHookService.remove()
      expect(status.state).toBe('not_installed')

      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(Object.keys(config.hooks ?? {})).toEqual([])
    } finally {
      cleanup()
    }
  })
})
