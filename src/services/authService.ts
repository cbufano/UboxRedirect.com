/**
 * authService — MOCK auth layer backed by localStorage.
 *
 * This is the ISOLATION LAYER for authentication in the app. When the real
 * backend is wired up, only the internals of this module should change —
 * the public interface (`User`, `authService.register/login/logout/getSession`)
 * must remain exactly as-is so consumers never need to change.
 *
 * IMPORTANT (mock-only, not production-safe):
 * Passwords are stored in plain text in localStorage purely so this mock can
 * validate credentials client-side. A real backend must NEVER do this — it
 * must hash passwords server-side (e.g. bcrypt/argon2) and never persist or
 * transmit plain-text passwords to the client at all.
 */

const USERS_KEY = 'bufano.users'
const SESSION_KEY = 'bufano.session'

export interface User {
  id: string
  name: string
  email: string
  country: string
}

interface StoredUser extends User {
  // MOCK ONLY — see file header. Never store plain-text passwords in production.
  password: string
}

interface RegisterInput {
  name: string
  email: string
  country: string
  password: string
}

function readUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as StoredUser[]) : []
  } catch {
    return []
  }
}

function writeUsers(users: StoredUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function toPublicUser(stored: StoredUser): User {
  const { id, name, email, country } = stored
  return { id, name, email, country }
}

function setSession(user: User): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
}

export const authService = {
  register(data: RegisterInput): User {
    const users = readUsers()
    const exists = users.some((u) => u.email === data.email)
    if (exists) {
      throw new Error('A user with this email already exists')
    }

    const stored: StoredUser = {
      id: data.email,
      name: data.name,
      email: data.email,
      country: data.country,
      password: data.password,
    }

    users.push(stored)
    writeUsers(users)

    const publicUser = toPublicUser(stored)
    setSession(publicUser)
    return publicUser
  },

  login(email: string, password: string): User {
    const users = readUsers()
    const found = users.find((u) => u.email === email)
    if (!found || found.password !== password) {
      throw new Error('Invalid credentials')
    }

    const publicUser = toPublicUser(found)
    setSession(publicUser)
    return publicUser
  },

  logout(): void {
    localStorage.removeItem(SESSION_KEY)
  },

  getSession(): User | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return null
      return parsed as User
    } catch {
      return null
    }
  },
}
