import bcrypt from 'bcryptjs'
import { query, queryOne, execute } from '../database/connection'
import { auditLog } from '../utils/audit'
import { sessionService } from './session.service'
import { settingsService } from './settings.service'
import type { ApiResult } from '@shared/types/dtos'

interface QuestionRow { id: number; question: string }
interface AnswerRow   { question_id: number; answer_hash: string }
interface AttemptCount { cnt: number }

const BCRYPT_ROUNDS = 10

function normalizeAnswer(answer: string): string {
  return String(answer).trim().toLowerCase()
}

export class SecurityService {
  // ── Questions catalogue ──────────────────────────────────────────────────

  async listQuestions() {
    return query<QuestionRow>(
      'SELECT id, question FROM security_questions WHERE is_active = 1 ORDER BY sort_order, id'
    )
  }

  // ── Setup / Update answers ───────────────────────────────────────────────

  async setupAnswers(
    userId: number,
    answers: { questionId: number; answer: string }[],
    actorId: number,
    actorUsername: string,
    sessionId?: number
  ): Promise<ApiResult> {
    if (!answers || answers.length < 2) {
      return { success: false, error: 'Se requieren mínimo 2 respuestas de seguridad', code: 'TOO_FEW_ANSWERS' }
    }

    const unique = new Set(answers.map((a) => a.questionId))
    if (unique.size !== answers.length) {
      return { success: false, error: 'No se pueden repetir preguntas', code: 'DUPLICATE_QUESTIONS' }
    }

    for (const { questionId, answer } of answers) {
      if (!answer || answer.trim().length < 2) {
        return { success: false, error: 'Cada respuesta debe tener al menos 2 caracteres', code: 'ANSWER_TOO_SHORT' }
      }
      const hash = await bcrypt.hash(normalizeAnswer(answer), BCRYPT_ROUNDS)
      await execute(
        `INSERT INTO user_security_answers (user_id, question_id, answer_hash)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE answer_hash = VALUES(answer_hash), updated_at = NOW()`,
        [userId, questionId, hash]
      )
    }

    await auditLog({
      userId: actorId, username: actorUsername,
      action: 'SETUP_SECURITY_QUESTIONS', module: 'security',
      recordId: String(userId), description: `Preguntas de seguridad configuradas para usuario ${userId}`,
      sessionId
    })

    return { success: true }
  }

  // ── Check if user has questions set ─────────────────────────────────────

  async hasQuestions(userId: number): Promise<boolean> {
    const rows = await query<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM user_security_answers WHERE user_id = ?',
      [userId]
    )
    return (rows[0]?.cnt ?? 0) >= 2
  }

  // ── Get user's questions (without answers) ───────────────────────────────

  async getUserQuestions(username: string): Promise<ApiResult<{ questionId: number; question: string }[]>> {
    const user = await queryOne<{ id: number }>(
      'SELECT id FROM users WHERE username = ? AND is_active = 1 LIMIT 1',
      [username]
    )
    // Do not reveal whether user exists
    if (!user) {
      return {
        success: true,
        data: [],
      }
    }

    const rows = await query<{ question_id: number; question: string }>(
      `SELECT usa.question_id, sq.question
       FROM user_security_answers usa
       JOIN security_questions sq ON sq.id = usa.question_id
       WHERE usa.user_id = ?
       ORDER BY usa.question_id`,
      [user.id]
    )

    if (rows.length < 2) {
      return { success: true, data: [] }
    }

    return {
      success: true,
      data: rows.map((r) => ({ questionId: r.question_id, question: r.question }))
    }
  }

  // ── Verify answers ───────────────────────────────────────────────────────

  private async checkRateLimit(userId: number): Promise<boolean> {
    const maxAttempts = await settingsService.getNumber('max_reset_attempts') || 5
    const rows = await query<AttemptCount>(
      `SELECT COUNT(*) AS cnt FROM password_reset_attempts
       WHERE user_id = ? AND success = 0 AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
      [userId]
    )
    return (rows[0]?.cnt ?? 0) < maxAttempts
  }

  async verifyAnswers(
    username: string,
    answers: { questionId: number; answer: string }[]
  ): Promise<ApiResult<{ userId: number }>> {
    const user = await queryOne<{ id: number; is_active: number }>(
      'SELECT id, is_active FROM users WHERE username = ? LIMIT 1',
      [username]
    )

    if (!user || !user.is_active) {
      return { success: false, error: 'Usuario no encontrado o inactivo', code: 'USER_NOT_FOUND' }
    }

    const allowed = await this.checkRateLimit(user.id)
    if (!allowed) {
      await execute(
        'INSERT INTO password_reset_attempts (user_id, username, success, fail_reason) VALUES (?, ?, 0, ?)',
        [user.id, username, 'rate_limit']
      )
      return { success: false, error: 'Demasiados intentos fallidos. Espere una hora.', code: 'RATE_LIMIT' }
    }

    const storedAnswers = await query<AnswerRow>(
      'SELECT question_id, answer_hash FROM user_security_answers WHERE user_id = ?',
      [user.id]
    )

    if (storedAnswers.length < 2) {
      return { success: false, error: 'Este usuario no tiene preguntas de seguridad configuradas', code: 'NO_QUESTIONS' }
    }

    const answerMap = new Map(storedAnswers.map((r) => [r.question_id, r.answer_hash]))
    let correctCount = 0

    for (const { questionId, answer } of answers) {
      const hash = answerMap.get(questionId)
      if (!hash) continue
      const ok = await bcrypt.compare(normalizeAnswer(answer), hash)
      if (ok) correctCount++
    }

    const required = Math.min(2, storedAnswers.length)
    if (correctCount < required) {
      await execute(
        'INSERT INTO password_reset_attempts (user_id, username, success, fail_reason) VALUES (?, ?, 0, ?)',
        [user.id, username, 'wrong_answers']
      )
      await auditLog({
        userId: user.id, username,
        action: 'PASSWORD_RESET_FAILED', module: 'security',
        recordId: String(user.id), description: 'Respuestas de seguridad incorrectas',
        result: 'failure', reason: 'wrong_answers'
      })
      return { success: false, error: 'Respuestas incorrectas', code: 'WRONG_ANSWERS' }
    }

    await execute(
      'INSERT INTO password_reset_attempts (user_id, username, success) VALUES (?, ?, 1)',
      [user.id, username]
    )

    return { success: true, data: { userId: user.id } }
  }

  // ── Recover password ─────────────────────────────────────────────────────

  async recoverPassword(
    username: string,
    answers: { questionId: number; answer: string }[],
    newPassword: string
  ): Promise<ApiResult> {
    const verifyResult = await this.verifyAnswers(username, answers)
    if (!verifyResult.success || !verifyResult.data) {
      return verifyResult
    }

    if (newPassword.length < 6) {
      return { success: false, error: 'La nueva contraseña debe tener al menos 6 caracteres', code: 'WEAK_PASSWORD' }
    }

    const userId = verifyResult.data.userId
    const hash   = await bcrypt.hash(newPassword, 12)
    await execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId])

    // Revocar todas las sesiones activas
    await sessionService.revokeAllForUser(userId, 'password_reset')

    await auditLog({
      userId, username,
      action: 'PASSWORD_RECOVERED', module: 'security',
      recordId: String(userId), description: 'Contraseña recuperada mediante preguntas de seguridad'
    })

    return { success: true }
  }
}

export const securityService = new SecurityService()
