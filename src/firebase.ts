import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth'
import {
  getDatabase,
  get,
  limitToLast,
  onChildAdded,
  onChildChanged,
  onValue,
  query,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
  type Database,
} from 'firebase/database'
import {
  competitionRoot,
  createCompetitionForLevel,
  defaultLevelId,
  type CompetitionData,
  type CompetitionLevelId,
  type EventLog,
  type GroupRoundState,
} from './data'

type FirebaseServices = {
  app: FirebaseApp
  auth: Auth
  database: Database
}

type ListenerEntry<T> = {
  callbacks: Set<(value: T) => void>
  unsubscribe: () => void
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
const latestEventLogLimit = 100

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
const competitionCache = new Map<CompetitionLevelId, CompetitionData | null>()
const pendingCompetitionLoads = new Map<CompetitionLevelId, Promise<CompetitionData | null>>()
const valueListeners = new Map<string, ListenerEntry<unknown>>()
const childAddedListeners = new Map<string, ListenerEntry<{ key: string; value: unknown }>>()
const childChangedListeners = new Map<string, ListenerEntry<{ key: string; value: unknown }>>()

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

function updateCompetitionCache(levelId: CompetitionLevelId, mutator: (current: CompetitionData | null) => CompetitionData | null) {
  const next = mutator(competitionCache.get(levelId) ?? null)
  competitionCache.set(levelId, next)
  return next
}

function subscribeSharedValue<T>(path: string, callback: (value: T | null) => void) {
  const current = getFirebaseServices()
  const existing = valueListeners.get(path) as ListenerEntry<T | null> | undefined
  if (existing) {
    existing.callbacks.add(callback)
    return () => {
      existing.callbacks.delete(callback)
      if (existing.callbacks.size) return
      existing.unsubscribe()
      valueListeners.delete(path)
    }
  }

  const callbacks = new Set<(value: T | null) => void>([callback])
  const unsubscribe = onValue(ref(current.database, path), (snapshot) => {
    const value = snapshot.exists() ? snapshot.val() as T : null
    callbacks.forEach((listener) => listener(value))
  })
  valueListeners.set(path, { callbacks: callbacks as Set<(value: unknown) => void>, unsubscribe })

  return () => {
    callbacks.delete(callback)
    if (callbacks.size) return
    unsubscribe()
    valueListeners.delete(path)
  }
}

function subscribeSharedChildAdded<T>(path: string, callback: (key: string, value: T) => void, limit?: number) {
  const current = getFirebaseServices()
  const listenerKey = limit ? `${path}?limitToLast=${limit}:child_added` : `${path}:child_added`
  const existing = childAddedListeners.get(listenerKey)
  const wrappedCallback = ({ key, value }: { key: string; value: unknown }) => callback(key, value as T)
  if (existing) {
    existing.callbacks.add(wrappedCallback)
    return () => {
      existing.callbacks.delete(wrappedCallback)
      if (existing.callbacks.size) return
      existing.unsubscribe()
      childAddedListeners.delete(listenerKey)
    }
  }

  const callbacks = new Set<(value: { key: string; value: unknown }) => void>([wrappedCallback])
  const targetRef = ref(current.database, path)
  const unsubscribe = onChildAdded(limit ? query(targetRef, limitToLast(limit)) : targetRef, (snapshot) => {
    if (!snapshot.key) return
    const item = { key: snapshot.key, value: snapshot.val() }
    callbacks.forEach((listener) => listener(item))
  })
  childAddedListeners.set(listenerKey, { callbacks, unsubscribe })

  return () => {
    callbacks.delete(wrappedCallback)
    if (callbacks.size) return
    unsubscribe()
    childAddedListeners.delete(listenerKey)
  }
}

function subscribeSharedChildChanged<T>(path: string, callback: (key: string, value: T) => void, limit?: number) {
  const current = getFirebaseServices()
  const listenerKey = limit ? `${path}?limitToLast=${limit}:child_changed` : `${path}:child_changed`
  const existing = childChangedListeners.get(listenerKey)
  const wrappedCallback = ({ key, value }: { key: string; value: unknown }) => callback(key, value as T)
  if (existing) {
    existing.callbacks.add(wrappedCallback)
    return () => {
      existing.callbacks.delete(wrappedCallback)
      if (existing.callbacks.size) return
      existing.unsubscribe()
      childChangedListeners.delete(listenerKey)
    }
  }

  const callbacks = new Set<(value: { key: string; value: unknown }) => void>([wrappedCallback])
  const targetRef = ref(current.database, path)
  const unsubscribe = onChildChanged(limit ? query(targetRef, limitToLast(limit)) : targetRef, (snapshot) => {
    if (!snapshot.key) return
    const item = { key: snapshot.key, value: snapshot.val() }
    callbacks.forEach((listener) => listener(item))
  })
  childChangedListeners.set(listenerKey, { callbacks, unsubscribe })

  return () => {
    callbacks.delete(wrappedCallback)
    if (callbacks.size) return
    unsubscribe()
    childChangedListeners.delete(listenerKey)
  }
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
  if (competitionCache.has(levelId)) {
    const cached = competitionCache.get(levelId)
    return {
      created: false,
      data: cached,
    }
  }

  const pending = pendingCompetitionLoads.get(levelId)
  if (pending) {
    const data = await pending
    return {
      created: false,
      data,
    }
  }

  const current = getFirebaseServices()
  const databasePath = databasePathForLevel(levelId)
  const load = Promise.all([
    get(ref(current.database, `${databasePath}/settings`)),
    get(ref(current.database, `${databasePath}/judgeGroups`)),
    get(ref(current.database, `${databasePath}/teams`)),
    get(ref(current.database, `${databasePath}/rounds`)),
    get(query(ref(current.database, `${databasePath}/eventLogs`), limitToLast(latestEventLogLimit))),
  ]).then(([settings, judgeGroups, teams, rounds, eventLogs]) => {
    const hasData = settings.exists() || judgeGroups.exists() || teams.exists() || rounds.exists()
    const data = hasData
      ? {
        settings: settings.val(),
        judgeGroups: judgeGroups.val(),
        teams: teams.val(),
        rounds: rounds.val(),
        eventLogs: eventLogs.exists() ? eventLogs.val() : {},
      } as CompetitionData
      : null
    competitionCache.set(levelId, data)
    pendingCompetitionLoads.delete(levelId)
    return data
  }).catch((error) => {
    pendingCompetitionLoads.delete(levelId)
    throw error
  })
  pendingCompetitionLoads.set(levelId, load)
  const data = await load

  if (data) {
    return {
      created: false,
      data,
    }
  }

  const initialData = createCompetitionForLevel(levelId)
  await saveCompetition(levelId, initialData)
  competitionCache.set(levelId, initialData)
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

  const databasePath = databasePathForLevel(levelId)
  const unsubscribers: Array<() => void> = []
  if (!competitionCache.has(levelId) && !pendingCompetitionLoads.has(levelId)) {
    ensureCompetitionExists(levelId)
      .then(() => emit())
      .catch(() => callback(null))
  }

  const unsubscribeConnected = subscribeSharedValue<boolean>('.info/connected', (connectedValue) => {
    const connected = connectedValue === true
    onConnectionChange?.({
      configured: true,
      connected,
      path: databasePath,
      missingVariables: [],
      message: connected ? 'Connected to Firebase Realtime Database.' : 'Firebase configured, currently offline.',
    })
  })
  unsubscribers.push(unsubscribeConnected)

  const emit = () => callback(competitionCache.get(levelId) ?? null)
  emit()

  unsubscribers.push(subscribeSharedValue<CompetitionData['settings']>(`${databasePath}/settings`, (settings) => {
    updateCompetitionCache(levelId, (currentData) => settings && currentData ? { ...currentData, settings } : currentData)
    emit()
  }))

  unsubscribers.push(subscribeSharedValue<CompetitionData['judgeGroups']>(`${databasePath}/judgeGroups`, (judgeGroups) => {
    updateCompetitionCache(levelId, (currentData) => judgeGroups && currentData ? { ...currentData, judgeGroups } : currentData)
    emit()
  }))

  unsubscribers.push(subscribeSharedValue<CompetitionData['teams']>(`${databasePath}/teams`, (teams) => {
    updateCompetitionCache(levelId, (currentData) => teams && currentData ? { ...currentData, teams } : currentData)
    emit()
  }))

  const updateRound = (roundKey: string, round: CompetitionData['rounds'][string]) => {
    updateCompetitionCache(levelId, (currentData) => round && currentData ? {
      ...currentData,
      rounds: {
        ...currentData.rounds,
        [roundKey]: round,
      },
    } : currentData)
    emit()
  }
  unsubscribers.push(subscribeSharedChildChanged<CompetitionData['rounds'][string]>(`${databasePath}/rounds`, updateRound))

  const updateEventLog = (logKey: string, log: EventLog) => {
    updateCompetitionCache(levelId, (currentData) => log && currentData ? {
      ...currentData,
      eventLogs: {
        ...currentData.eventLogs,
        [logKey]: log,
      },
    } : currentData)
    emit()
  }
  unsubscribers.push(subscribeSharedChildAdded<EventLog>(`${databasePath}/eventLogs`, updateEventLog, latestEventLogLimit))
  unsubscribers.push(subscribeSharedChildChanged<EventLog>(`${databasePath}/eventLogs`, updateEventLog, latestEventLogLimit))

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe())
  }
}

export function subscribeConnection(
  levelId: CompetitionLevelId,
  onConnectionChange: (diagnostics: FirebaseDiagnostics) => void,
) {
  if (!firebaseIsConfigured()) {
    onConnectionChange(getInitialFirebaseDiagnostics())
    return () => undefined
  }

  const databasePath = databasePathForLevel(levelId)
  return subscribeSharedValue<boolean>('.info/connected', (connectedValue) => {
    const connected = connectedValue === true
    onConnectionChange?.({
      configured: true,
      connected,
      path: databasePath,
      missingVariables: [],
      message: connected ? 'Connected to Firebase Realtime Database.' : 'Firebase configured, currently offline.',
    })
  })
}

export async function saveCompetition(levelId: CompetitionLevelId, data: CompetitionData) {
  const current = getFirebaseServices()
  const cleaned = cleanUndefined(data)
  const databasePath = databasePathForLevel(levelId)
  await Promise.all([
    set(ref(current.database, `${databasePath}/settings`), cleaned.settings),
    set(ref(current.database, `${databasePath}/judgeGroups`), cleaned.judgeGroups),
    set(ref(current.database, `${databasePath}/teams`), cleaned.teams),
    set(ref(current.database, `${databasePath}/rounds`), cleaned.rounds),
    Object.keys(cleaned.eventLogs || {}).length
      ? update(ref(current.database, `${databasePath}/eventLogs`), cleaned.eventLogs)
      : remove(ref(current.database, `${databasePath}/eventLogs`)),
  ])
  competitionCache.set(levelId, cleaned)
}

export async function saveRoundGroupChange(
  levelId: CompetitionLevelId,
  round: number,
  groupId: string,
  group: GroupRoundState,
  logKey: string,
  log: EventLog,
) {
  const current = getFirebaseServices()
  const databasePath = databasePathForLevel(levelId)
  const cleanedGroup = cleanUndefined(group)
  const cleanedLog = cleanUndefined(log)
  await Promise.all([
    set(ref(current.database, `${databasePath}/rounds/round-${round}/groups/${groupId}`), cleanedGroup),
    set(ref(current.database, `${databasePath}/eventLogs/${logKey}`), cleanedLog),
  ])
  updateCompetitionCache(levelId, (currentData) => currentData ? {
    ...currentData,
    rounds: {
      ...currentData.rounds,
      [`round-${round}`]: {
        ...currentData.rounds[`round-${round}`],
        groups: {
          ...currentData.rounds[`round-${round}`].groups,
          [groupId]: cleanedGroup,
        },
      },
    },
    eventLogs: {
      ...currentData.eventLogs,
      [logKey]: cleanedLog,
    },
  } : currentData)
}

export async function saveRoundChange(
  levelId: CompetitionLevelId,
  round: number,
  roundState: CompetitionData['rounds'][string],
  logKey: string,
  log: EventLog,
) {
  const current = getFirebaseServices()
  const databasePath = databasePathForLevel(levelId)
  const cleanedRound = cleanUndefined(roundState)
  const cleanedLog = cleanUndefined(log)
  await Promise.all([
    set(ref(current.database, `${databasePath}/rounds/round-${round}`), cleanedRound),
    set(ref(current.database, `${databasePath}/eventLogs/${logKey}`), cleanedLog),
  ])
  updateCompetitionCache(levelId, (currentData) => currentData ? {
    ...currentData,
    rounds: {
      ...currentData.rounds,
      [`round-${round}`]: cleanedRound,
    },
    eventLogs: {
      ...currentData.eventLogs,
      [logKey]: cleanedLog,
    },
  } : currentData)
}

export async function loadEventLogs(levelId: CompetitionLevelId) {
  const current = getFirebaseServices()
  const snapshot = await get(ref(current.database, `${databasePathForLevel(levelId)}/eventLogs`))
  return snapshot.exists() ? snapshot.val() as Record<string, EventLog> : {}
}

export async function initializeSelectedLevel(levelId: CompetitionLevelId) {
  const data = createCompetitionForLevel(levelId)
  await saveCompetition(levelId, data)
  return data
}

export async function resetSelectedLevel(levelId: CompetitionLevelId) {
  const current = getFirebaseServices()
  await remove(ref(current.database, databasePathForLevel(levelId)))
  competitionCache.delete(levelId)
  return initializeSelectedLevel(levelId)
}

export function withServerTimestamp(log: EventLog): EventLog {
  return {
    ...log,
    timestamp: serverTimestamp(),
  }
}
