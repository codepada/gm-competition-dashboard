import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth'
import { getDatabase, get, onValue, ref, remove, serverTimestamp, set, type Database } from 'firebase/database'
import {
  competitionRoot,
  createCompetitionForLevel,
  defaultLevelId,
  type CompetitionData,
  type CompetitionLevelId,
  type EventLog,
} from './data'

type FirebaseServices = {
  app: FirebaseApp
  auth: Auth
  database: Database
}

export type StaffRole = 'admin' | 'adminLevel' | 'staffLead' | 'staff'
export type StaffProfile = {
  username: string
  role: StaffRole
  levelId?: CompetitionLevelId
  groupId?: string
  staffName: string
}

export type FirebaseDiagnostics = {
  configured: boolean
  connected: boolean
  path: string
  missingVariables: string[]
  message: string
}

const requiredEnv = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const envValues: Record<(typeof requiredEnv)[number], string | undefined> = {
  VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
  VITE_FIREBASE_DATABASE_URL: firebaseConfig.databaseURL,
  VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
  VITE_FIREBASE_STORAGE_BUCKET: firebaseConfig.storageBucket,
  VITE_FIREBASE_MESSAGING_SENDER_ID: firebaseConfig.messagingSenderId,
  VITE_FIREBASE_APP_ID: firebaseConfig.appId,
}

const missingVariables = requiredEnv.filter((name) => !envValues[name])
const authEmailDomain = 'gm-advanced.local'

export function databasePathForLevel(levelId: CompetitionLevelId) {
  return `competitions/${competitionRoot}/${levelId}`
}

export function staffProfilePath(uid: string) {
  return `users/${uid}`
}

export function staffEmailForId(username: string) {
  return `${username.trim().toLowerCase()}@${authEmailDomain}`
}

function firebasePasswordCandidates(password: string) {
  const trimmed = password.trim()
  if (trimmed === '1234') return ['123456']
  if (trimmed === '1122') return ['112233']
  return [password]
}

let services: FirebaseServices | null = null

function cleanUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cleanUndefined) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, cleanUndefined(item)]),
    ) as T
  }
  return value
}

export function validateFirebaseEnvironment() {
  return missingVariables
}

export function firebaseIsConfigured() {
  return missingVariables.length === 0
}

export function getFirebaseServices() {
  if (!firebaseIsConfigured()) {
    throw new Error(`Missing Firebase environment variables: ${missingVariables.join(', ')}`)
  }

  if (!services) {
    const app = initializeApp(firebaseConfig)
    services = {
      app,
      auth: getAuth(app),
      database: getDatabase(app),
    }
  }

  return services
}

function isStaffRole(value: unknown): value is StaffRole {
  return value === 'admin' || value === 'adminLevel' || value === 'staffLead' || value === 'staff'
}

function readStaffProfile(value: unknown): StaffProfile | null {
  if (!value || typeof value !== 'object') return null
  const profile = value as Record<string, unknown>
  if (typeof profile.username !== 'string' || !isStaffRole(profile.role) || typeof profile.staffName !== 'string') {
    return null
  }

  return {
    username: profile.username.trim().toLowerCase(),
    role: profile.role,
    levelId: typeof profile.levelId === 'string' ? profile.levelId as CompetitionLevelId : undefined,
    groupId: typeof profile.groupId === 'string' ? profile.groupId : undefined,
    staffName: profile.staffName,
  }
}

export async function getStaffProfile(user: User) {
  const current = getFirebaseServices()
  const snapshot = await get(ref(current.database, staffProfilePath(user.uid)))
  const profile = readStaffProfile(snapshot.val())
  if (!profile) {
    throw new Error('This account does not have a staff profile.')
  }
  return profile
}

export async function signInStaff(username: string, password: string) {
  const normalized = username.trim().toLowerCase()
  const current = getFirebaseServices()
  const candidates = firebasePasswordCandidates(password)
  let credential
  for (const candidate of candidates) {
    try {
      credential = await signInWithEmailAndPassword(current.auth, staffEmailForId(normalized), candidate)
      break
    } catch (error) {
      if (candidate === candidates.at(-1)) throw error
    }
  }
  if (!credential) throw new Error('Could not sign in.')
  const profile = await getStaffProfile(credential.user)

  if (profile.username !== normalized) {
    await signOut(current.auth)
    throw new Error('This staff ID does not match the signed-in account.')
  }

  return profile
}

export function subscribeStaffAuth(callback: (profile: StaffProfile | null) => void) {
  if (!firebaseIsConfigured()) {
    callback(null)
    return () => undefined
  }

  const current = getFirebaseServices()
  return onAuthStateChanged(current.auth, (user) => {
    if (!user) {
      callback(null)
      return
    }

    getStaffProfile(user)
      .then(callback)
      .catch(() => {
        callback(null)
        void signOut(current.auth)
      })
  })
}

export async function signOutStaff() {
  if (!firebaseIsConfigured()) return
  await signOut(getFirebaseServices().auth)
}

export function getInitialFirebaseDiagnostics(): FirebaseDiagnostics {
  const path = databasePathForLevel(defaultLevelId)
  return {
    configured: firebaseIsConfigured(),
    connected: false,
    path,
    missingVariables,
    message: firebaseIsConfigured()
      ? 'Firebase configured. Waiting for realtime connection.'
      : `Missing Firebase environment variables: ${missingVariables.join(', ')}`,
  }
}

export async function ensureCompetitionExists(levelId: CompetitionLevelId) {
  const current = getFirebaseServices()
  const databasePath = databasePathForLevel(levelId)
  const competitionRef = ref(current.database, databasePath)
  const snapshot = await get(competitionRef)

  if (snapshot.exists()) {
    return {
      created: false,
      data: snapshot.val() as CompetitionData,
    }
  }

  const initialData = createCompetitionForLevel(levelId)
  await set(competitionRef, initialData)
  return {
    created: true,
    data: initialData,
  }
}

export function subscribeCompetition(
  levelId: CompetitionLevelId,
  callback: (data: CompetitionData | null) => void,
  onConnectionChange?: (diagnostics: FirebaseDiagnostics) => void,
) {
  if (!firebaseIsConfigured()) {
    onConnectionChange?.(getInitialFirebaseDiagnostics())
    callback(null)
    return () => undefined
  }

  const current = getFirebaseServices()
  const databasePath = databasePathForLevel(levelId)
  const connectedRef = ref(current.database, '.info/connected')
  const dataRef = ref(current.database, databasePath)

  const unsubscribeConnected = onValue(connectedRef, (snapshot) => {
    const connected = snapshot.val() === true
    onConnectionChange?.({
      configured: true,
      connected,
      path: databasePath,
      missingVariables: [],
      message: connected ? 'Connected to Firebase Realtime Database.' : 'Firebase configured, currently offline.',
    })
  })

  const unsubscribeData = onValue(dataRef, (snapshot) => {
    callback(snapshot.exists() ? (snapshot.val() as CompetitionData) : null)
  })

  return () => {
    unsubscribeConnected()
    unsubscribeData()
  }
}

export async function saveCompetition(levelId: CompetitionLevelId, data: CompetitionData) {
  const current = getFirebaseServices()
  await set(ref(current.database, databasePathForLevel(levelId)), cleanUndefined(data))
}

export async function initializeSelectedLevel(levelId: CompetitionLevelId) {
  const data = createCompetitionForLevel(levelId)
  await saveCompetition(levelId, data)
  return data
}

export async function resetSelectedLevel(levelId: CompetitionLevelId) {
  const current = getFirebaseServices()
  await remove(ref(current.database, databasePathForLevel(levelId)))
  return initializeSelectedLevel(levelId)
}

export function withServerTimestamp(log: EventLog): EventLog {
  return {
    ...log,
    timestamp: serverTimestamp(),
  }
}
