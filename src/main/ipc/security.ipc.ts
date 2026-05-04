import { ipcMain } from 'electron'
import { securityService } from '../services/security.service'
import { validateSessionToken } from '../services/session.service'
import { IPC_CHANNELS } from '@shared/types/ipc'
import type { SetupSecurityAnswersDTO, RecoverPasswordDTO } from '@shared/types/dtos'

export function registerSecurityIpc(): void {
  // Public: list all questions
  ipcMain.handle(IPC_CHANNELS.SECURITY_LIST_QUESTIONS, async () => {
    const questions = await securityService.listQuestions()
    return { success: true, data: questions }
  })

  // Public: get questions for a given username (does not expose whether user exists)
  ipcMain.handle(IPC_CHANNELS.SECURITY_GET_USER_QUESTIONS, async (_, { username }: { username: string }) => {
    return securityService.getUserQuestions(username)
  })

  // Public: check if user has security questions set
  ipcMain.handle(IPC_CHANNELS.SECURITY_HAS_QUESTIONS, async (_, { sessionToken }: { sessionToken: string }) => {
    const ctx = await validateSessionToken(sessionToken)
    if (!ctx) return { success: false, error: 'Sesión inválida', code: 'UNAUTHORIZED' }
    const has = await securityService.hasQuestions(ctx.userId)
    return { success: true, data: { hasQuestions: has } }
  })

  // Authenticated: setup / update own security answers
  ipcMain.handle(IPC_CHANNELS.SECURITY_SETUP_ANSWERS, async (_, payload: SetupSecurityAnswersDTO & { sessionToken: string }) => {
    const ctx = await validateSessionToken(payload.sessionToken)
    if (!ctx) return { success: false, error: 'Sesión inválida', code: 'UNAUTHORIZED' }

    // Users can only set their own answers, admins can set for anyone
    if (ctx.userId !== payload.userId && ctx.roleName !== 'admin') {
      return { success: false, error: 'No autorizado', code: 'FORBIDDEN' }
    }

    return securityService.setupAnswers(payload.userId, payload.answers, ctx.userId, ctx.username, ctx.sessionId)
  })

  // Public (unauthenticated flow): verify answers for password recovery
  ipcMain.handle(IPC_CHANNELS.SECURITY_VERIFY_ANSWERS, async (_, payload: { username: string; answers: { questionId: number; answer: string }[] }) => {
    return securityService.verifyAnswers(payload.username, payload.answers)
  })

  // Public (unauthenticated flow): recover password
  ipcMain.handle(IPC_CHANNELS.SECURITY_RECOVER_PASSWORD, async (_, payload: RecoverPasswordDTO) => {
    return securityService.recoverPassword(payload.username, payload.answers, payload.newPassword)
  })
}
