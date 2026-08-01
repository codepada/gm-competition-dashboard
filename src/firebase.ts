import { initializeApp, type FirebaseApp } from 'firebase/app'
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
  database: Database
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
export function databasePathForLevel(levelId: CompetitionLevelId) {
  return `competitions/${competitionRoot}/${levelId}`
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
      database: getDatabase(app),
    }
  }

  return services
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
