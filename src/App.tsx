import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import './App.css'
import {
  createDefaultCompetition,
  competitionLevels,
  defaultLevelId,
  generateFinishTimes,
  generateRounds,
  getLevelLabel,
  judgeGroupIds,
  teamsFromRecord,
  teamsToRecord,
  type CompetitionData,
  type CompetitionLevelId,
  type EventLog,
  type GroupRoundState,
  type Status,
  type Team,
} from './data'
import {
  ensureCompetitionExists,
  getInitialFirebaseDiagnostics,
  initializeSelectedLevel,
  type FirebaseDiagnostics,
  firebaseIsConfigured,
  resetSelectedLevel,
  saveCompetition,
  subscribeCompetition,
  withServerTimestamp,
} from './firebase'

const cacheKey = 'gm-advanced-competition-cache'
const queueKey = 'gm-advanced-competition-queue'
const staffNameKey = 'gm-advanced-staff-name'
const selectedLevelKey = 'gm-advanced-selected-level'
const sessionKey = 'gm-advanced-session'

type Route = '/dashboard' | '/summary' | '/setup'
type UserRole = 'admin' | 'level'
type AppSession = {
  username: string
  role: UserRole
  levelId?: CompetitionLevelId
}
type IssueDialogState = {
  round: number
  groupId: string
  note: string
} | null

const accounts: Record<string, { password: string; role: UserRole; levelId?: CompetitionLevelId; staffName: string }> = {
  wgm2026: { password: '1122', role: 'admin', staffName: 'Admin' },
  senior: { password: '1234', role: 'level', levelId: 'senior-high-school', staffName: 'Senior Staff' },
  junior: { password: '1234', role: 'level', levelId: 'junior-high-school', staffName: 'Junior Staff' },
  elementary: { password: '1234', role: 'level', levelId: 'elementary-school', staffName: 'Elementary Staff' },
}

const redirectedPath = new URLSearchParams(window.location.search).get('redirect')
if (redirectedPath) {
  window.history.replaceState({}, '', redirectedPath)
}

function getRoute(): Route {
  if (window.location.pathname.endsWith('/summary')) return '/summary'
  return window.location.pathname.endsWith('/setup') ? '/setup' : '/dashboard'
}

function appBasePath() {
  return window.location.pathname.replace(/\/(dashboard|summary|setup)\/?$/, '/')
}

function navigate(route: Route) {
  window.history.pushState({}, '', `${appBasePath()}${route.slice(1)}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function scopedKey(key: string, levelId: CompetitionLevelId) {
  return `${key}:${levelId}`
}

function readCachedCompetition(levelId: CompetitionLevelId) {
  try {
    const cached = localStorage.getItem(scopedKey(cacheKey, levelId))
    return cached ? (JSON.parse(cached) as CompetitionData) : null
  } catch {
    return null
  }
}

function writeCachedCompetition(levelId: CompetitionLevelId, data: CompetitionData) {
  localStorage.setItem(scopedKey(cacheKey, levelId), JSON.stringify(data))
}

function readQueuedCompetition(levelId: CompetitionLevelId) {
  try {
    const queued = localStorage.getItem(scopedKey(queueKey, levelId))
    return queued ? (JSON.parse(queued) as CompetitionData) : null
  } catch {
    return null
  }
}

function queueCompetition(levelId: CompetitionLevelId, data: CompetitionData) {
  localStorage.setItem(scopedKey(queueKey, levelId), JSON.stringify(data))
}

function clearQueue(levelId: CompetitionLevelId) {
  localStorage.removeItem(scopedKey(queueKey, levelId))
}

function readSession() {
  try {
    const session = localStorage.getItem(sessionKey)
    return session ? (JSON.parse(session) as AppSession) : null
  } catch {
    return null
  }
}

function nowIso() {
  return new Date().toISOString()
}

function shortTeamName(name: string) {
  return name.length > 18 ? `${name.slice(0, 16)}...` : name
}

function dateTimeForTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`)
}

function minutesUntil(date: string, finishTime: string, now: Date) {
  return (dateTimeForTime(date, finishTime).getTime() - now.getTime()) / 60000
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00`))
}

function formatClock(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function formatRemaining(minutes: number) {
  if (minutes <= 0) return 'Past deadline'
  const whole = Math.ceil(minutes)
  return `${whole} min remaining`
}

function getActiveRound(data: CompetitionData, now: Date) {
  const rounds = Object.entries(data.rounds)
    .map(([roundKey, round]) => ({
      roundNumber: Number(roundKey.replace('round-', '')),
      deadline: dateTimeForTime(data.settings.competitionDate, round.finishTime),
    }))
    .sort((a, b) => a.roundNumber - b.roundNumber)

  const active = rounds.find((round) => now.getTime() <= round.deadline.getTime())
  return active?.roundNumber || rounds[rounds.length - 1]?.roundNumber || 1
}

function makeLog(
  action: EventLog['action'],
  round: number,
  judgeGroup: string,
  staffName: string,
  group?: GroupRoundState,
  note?: string,
  previousValue?: unknown,
  newValue?: unknown,
): EventLog {
  return {
    timestamp: nowIso(),
    round,
    judgeGroup,
    action,
    teamId: group?.teamId,
    seatNumber: group?.seatNumber,
    teamName: group?.teamName,
    note,
    staffName,
    previousValue,
    newValue,
    issueNote: action === 'ISSUE' ? note : undefined,
  }
}

function addLog(data: CompetitionData, log: EventLog) {
  return {
    ...data,
    eventLogs: {
      ...data.eventLogs,
      [`log-${Date.now()}-${Math.random().toString(16).slice(2)}`]: withServerTimestamp(log),
    },
  }
}

function computeStatus(group: GroupRoundState, deadline: string, data: CompetitionData, now: Date): Status {
  if (!group.configured) return 'WAITING'
  if (group.completed) return 'COMPLETED'
  if (group.status === 'ISSUE') return 'ISSUE'
  const remaining = minutesUntil(data.settings.competitionDate, deadline, now)
  if (remaining < 0) return 'OVERDUE'
  if (remaining <= data.settings.dueSoonMinutes) return 'DUE_SOON'
  return 'WAITING'
}

function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const dataLines = lines[0]?.toLowerCase().startsWith('runorder,') ? lines.slice(1) : lines

  return dataLines.map((line) => {
    const [runOrder, seatNumber, teamName, finishTime] = line.split(',').map((part) => part.trim())
    return {
      runOrder: Number(runOrder),
      seatNumber,
      teamName,
      finishTime,
    }
  }).filter((team) => team.runOrder && team.seatNumber && team.teamName && team.finishTime)
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function App() {
  const [session, setSession] = useState<AppSession | null>(readSession)
  const [route, setRoute] = useState<Route>(getRoute)
  const [selectedLevel, setSelectedLevel] = useState<CompetitionLevelId>(() => {
    const session = readSession()
    if (session?.role === 'level' && session.levelId) return session.levelId
    const saved = localStorage.getItem(selectedLevelKey) as CompetitionLevelId | null
    return saved && competitionLevels.some((level) => level.id === saved) ? saved : defaultLevelId
  })
  const [data, setData] = useState<CompetitionData>(() => readCachedCompetition(selectedLevel) || createDefaultCompetition())
  const [levelHasData, setLevelHasData] = useState(true)
  const [online, setOnline] = useState(navigator.onLine)
  const [now, setNow] = useState(new Date())
  const [issueDialog, setIssueDialog] = useState<IssueDialogState>(null)
  const [csvPreview, setCsvPreview] = useState<Team[]>([])
  const [saveMessage, setSaveMessage] = useState('Local data ready')
  const [menuOpen, setMenuOpen] = useState(false)
  const [staffName, setStaffName] = useState(() => localStorage.getItem(staffNameKey) || '')
  const [firebaseDiagnostics, setFirebaseDiagnostics] = useState<FirebaseDiagnostics>(getInitialFirebaseDiagnostics)
  const [summaryData, setSummaryData] = useState<Record<CompetitionLevelId, CompetitionData | null>>(() => ({
    'elementary-school': readCachedCompetition('elementary-school'),
    'junior-high-school': readCachedCompetition('junior-high-school'),
    'senior-high-school': readCachedCompetition('senior-high-school'),
  }))
  const [groupRounds, setGroupRounds] = useState<Record<string, number>>(() => {
    const initialRound = data.settings.followCurrentTime ? getActiveRound(data, now) : data.settings.currentRound
    return Object.fromEntries(judgeGroupIds.map((groupId) => [groupId, initialRound]))
  })
  const isAdmin = session?.role === 'admin'

  useEffect(() => {
    if (!session) return
    if (session.role === 'level' && session.levelId && selectedLevel !== session.levelId) {
      setSelectedLevel(session.levelId)
      localStorage.setItem(selectedLevelKey, session.levelId)
    }
  }, [selectedLevel, session])

  useEffect(() => {
    if (!session) return
    if (!isAdmin && (route === '/setup' || route === '/summary')) {
      navigate('/dashboard')
    }
  }, [isAdmin, route, session])

  useEffect(() => {
    const onPop = () => setRoute(getRoute())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (!session || staffName) return
    const name = window.prompt('Staff Name')
    const nextName = name?.trim() || accounts[session.username]?.staffName || 'Staff'
    localStorage.setItem(staffNameKey, nextName)
    setStaffName(nextName)
  }, [session, staffName])

  useEffect(() => {
    if (!firebaseIsConfigured()) {
      setSaveMessage('Firebase env missing')
      return () => undefined
    }

    let unsubscribe = () => {
      // Firebase listener is attached after the initial seed check completes.
    }
    let cancelled = false

    ensureCompetitionExists(selectedLevel)
      .then(({ created, data: initialData }) => {
        if (cancelled) return
        if (initialData) {
          setData(initialData)
          setLevelHasData(true)
          writeCachedCompetition(selectedLevel, initialData)
          setSaveMessage(created ? 'Initial Firebase data created' : 'Loaded existing Firebase data')
        } else {
          setData(readCachedCompetition(selectedLevel) || createDefaultCompetition())
          setLevelHasData(false)
          setSaveMessage('No competition data has been configured for this level.')
        }
        unsubscribe = subscribeCompetition(selectedLevel, (remote) => {
          if (!remote) {
            setLevelHasData(false)
            return
          }
          setLevelHasData(true)
          setData(remote)
          writeCachedCompetition(selectedLevel, remote)
          setSaveMessage('Synced with Firebase')
        }, setFirebaseDiagnostics)
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Firebase connection failed'
        setFirebaseDiagnostics((current) => ({
          ...current,
          connected: false,
          message,
        }))
        setSaveMessage(message)
      })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [selectedLevel])

  useEffect(() => {
    if (!firebaseIsConfigured()) return () => undefined

    const unsubscribers = competitionLevels.map((level) =>
      subscribeCompetition(level.id, (remote) => {
        setSummaryData((current) => ({
          ...current,
          [level.id]: remote,
        }))
        if (remote) writeCachedCompetition(level.id, remote)
      }),
    )

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (!online || !firebaseIsConfigured()) return
    const queued = readQueuedCompetition(selectedLevel)
    if (!queued) return
    saveCompetition(selectedLevel, queued)
      .then(() => {
        clearQueue(selectedLevel)
        setSaveMessage('Queued actions synced')
      })
      .catch(() => {
        setSaveMessage('Sync retry pending')
      })
  }, [online, selectedLevel])

  async function persist(nextData: CompetitionData, message = 'Saved') {
    setData(nextData)
    setLevelHasData(true)
    writeCachedCompetition(selectedLevel, nextData)

    if (!online || !firebaseIsConfigured()) {
      queueCompetition(selectedLevel, nextData)
      setSaveMessage(firebaseIsConfigured() ? 'Offline: action queued' : 'Saved locally: Firebase env missing')
      return
    }

    try {
      await saveCompetition(selectedLevel, nextData)
      clearQueue(selectedLevel)
      setSaveMessage(message)
    } catch {
      queueCompetition(selectedLevel, nextData)
      setSaveMessage('Save failed: action queued')
    }
  }

  function updateData(mutator: (current: CompetitionData) => CompetitionData, message?: string) {
    void persist(mutator(data), message)
  }

  const teams = useMemo(() => teamsFromRecord(data.teams), [data.teams])
  const activeRound = getActiveRound(data, now)
  const currentRound = data.settings.followCurrentTime
    ? activeRound
    : Math.min(Math.max(1, data.settings.currentRound), data.settings.totalRounds)
  const currentRoundState = data.rounds[`round-${currentRound}`]
  const configuredGroupIds = judgeGroupIds.filter((groupId) => currentRoundState?.groups[groupId]?.configured !== false)
  const completedCount = configuredGroupIds.filter((groupId) => currentRoundState?.groups[groupId]?.completed).length
  const requiredCount = configuredGroupIds.length
  const deadlineMinutes = currentRoundState
    ? minutesUntil(data.settings.competitionDate, currentRoundState.finishTime, now)
    : 0

  function setAllGroupRounds(round: number) {
    const nextRound = Math.min(Math.max(1, round), data.settings.totalRounds)
    setGroupRounds(Object.fromEntries(judgeGroupIds.map((groupId) => [groupId, nextRound])))
  }

  function goTo(routeName: Route) {
    if (!isAdmin && (routeName === '/setup' || routeName === '/summary')) return
    navigate(routeName)
    setMenuOpen(false)
  }

  function changeLevel(levelId: CompetitionLevelId) {
    if (!isAdmin && session?.levelId) return
    localStorage.setItem(selectedLevelKey, levelId)
    setSelectedLevel(levelId)
    setGroupRounds(Object.fromEntries(judgeGroupIds.map((groupId) => [groupId, 1])))
    setMenuOpen(false)
  }

  function handleLogin(username: string, password: string) {
    const normalized = username.trim().toLowerCase()
    const account = accounts[normalized]
    if (!account || account.password !== password) {
      return false
    }

    const nextSession: AppSession = {
      username: normalized,
      role: account.role,
      levelId: account.levelId,
    }
    localStorage.setItem(sessionKey, JSON.stringify(nextSession))
    localStorage.setItem(staffNameKey, account.staffName)
    setSession(nextSession)
    setStaffName(account.staffName)

    if (account.levelId) {
      localStorage.setItem(selectedLevelKey, account.levelId)
      setSelectedLevel(account.levelId)
    }
    navigate('/dashboard')
    return true
  }

  function handleLogout() {
    localStorage.removeItem(sessionKey)
    setSession(null)
    setMenuOpen(false)
    navigate('/dashboard')
  }

  function initializeLevel() {
    const message = `Initialize ${getLevelLabel(selectedLevel)} data? Existing data at this level will be replaced.`
    if (!window.confirm(message)) return
    initializeSelectedLevel(selectedLevel)
      .then((nextData) => {
        setData(nextData)
        setLevelHasData(true)
        writeCachedCompetition(selectedLevel, nextData)
        setSaveMessage('Selected level initialized')
      })
      .catch((error: unknown) => {
        setSaveMessage(error instanceof Error ? error.message : 'Could not initialize selected level')
      })
  }

  function rebuildFromSetup(next: CompetitionData) {
    return {
      ...next,
      settings: {
        ...next.settings,
        totalRounds: Object.keys(next.teams).length,
      },
      rounds: generateRounds(next.teams, next.judgeGroups, next.settings.roundDurationMinutes),
    }
  }

  function clearEvaluationResults() {
    const message = `Clear test results for ${getLevelLabel(selectedLevel)}? Teams, schedule, and settings will stay the same.`
    if (!window.confirm(message)) return

    setAllGroupRounds(1)
    updateData((current) => ({
      ...current,
      eventLogs: {},
      settings: {
        ...current.settings,
        currentRound: 1,
        followCurrentTime: false,
      },
      rounds: Object.fromEntries(
        Object.entries(current.rounds).map(([roundKey, round]) => [
          roundKey,
          {
            ...round,
            groups: Object.fromEntries(
              Object.entries(round.groups).map(([groupId, group]) => [
                groupId,
                {
                  ...group,
                  completed: false,
                  completedAt: undefined,
                  completedBy: undefined,
                  issueNote: undefined,
                  status: 'WAITING',
                  updatedAt: undefined,
                },
              ]),
            ) as Record<string, GroupRoundState>,
          },
        ]),
      ),
    }), 'Test results cleared')
  }

  function handleComplete(groupId: string, round: number) {
    const roundState = data.rounds[`round-${round}`]
    if (!roundState) return
    if (roundState.groups[groupId]?.configured === false) return
    updateData((current) => {
      const roundKey = `round-${round}`
      const group = current.rounds[roundKey].groups[groupId]
      if (group.completed) return current
      const nextGroup = {
        ...group,
        status: 'COMPLETED' as const,
        completed: true,
        completedAt: nowIso(),
        completedBy: staffName,
        updatedAt: nowIso(),
      }
      const next = {
        ...current,
        rounds: {
          ...current.rounds,
          [roundKey]: {
            ...current.rounds[roundKey],
            groups: {
              ...current.rounds[roundKey].groups,
              [groupId]: nextGroup,
            },
          },
        },
      }
      return addLog(next, makeLog('COMPLETE', round, groupId, staffName, nextGroup, undefined, group, nextGroup))
    }, 'Completion saved')
  }

  function handleUndo(groupId: string, round: number) {
    const roundState = data.rounds[`round-${round}`]
    if (!roundState) return
    if (roundState.groups[groupId]?.configured === false) return
    if (!window.confirm('Clear this completion status?')) return
    updateData((current) => {
      const roundKey = `round-${round}`
      const group = current.rounds[roundKey].groups[groupId]
      const nextGroup = {
        ...group,
        status: 'WAITING' as const,
        completed: false,
        completedAt: undefined,
        completedBy: undefined,
        updatedAt: nowIso(),
      }
      const next = {
        ...current,
        rounds: {
          ...current.rounds,
          [roundKey]: {
            ...current.rounds[roundKey],
            groups: {
              ...current.rounds[roundKey].groups,
              [groupId]: nextGroup,
            },
          },
        },
      }
      return addLog(next, makeLog('UNDO', round, groupId, staffName, nextGroup, undefined, group, nextGroup))
    }, 'Completion cleared')
  }

  function saveIssue() {
    if (!issueDialog) return
    if (currentRoundState?.groups[issueDialog.groupId]?.configured === false) return
    updateData((current) => {
      const roundKey = `round-${issueDialog.round}`
      const group = current.rounds[roundKey].groups[issueDialog.groupId]
      const nextGroup = {
        ...group,
        status: 'ISSUE' as const,
        issueNote: issueDialog.note.trim(),
        issueAt: nowIso(),
        updatedAt: nowIso(),
      }
      const next = {
        ...current,
        rounds: {
          ...current.rounds,
          [roundKey]: {
            ...current.rounds[roundKey],
            groups: {
              ...current.rounds[roundKey].groups,
              [issueDialog.groupId]: nextGroup,
            },
          },
        },
      }
      return addLog(next, makeLog('ISSUE', issueDialog.round, issueDialog.groupId, staffName, nextGroup, issueDialog.note.trim(), group, nextGroup))
    }, 'Issue saved')
    setIssueDialog(null)
  }

  function changeRound(round: number) {
    setAllGroupRounds(round)
    updateData((current) => ({
      ...current,
      settings: {
        ...current.settings,
        currentRound: Math.min(Math.max(1, round), current.settings.totalRounds),
        followCurrentTime: false,
      },
    }), 'Round changed')
  }

  function setFollowCurrentTime(followCurrentTime: boolean) {
    if (followCurrentTime) setAllGroupRounds(activeRound)
    updateData((current) => ({
      ...current,
      settings: {
        ...current.settings,
        followCurrentTime,
      },
    }), followCurrentTime ? 'Following current time' : 'Manual round selection')
  }

  function resetCurrentRound() {
    if (!window.confirm('Reset all four judging statuses for this round?')) return
    updateData((current) => {
      const roundKey = `round-${currentRound}`
      const resetGroups = Object.fromEntries(
        Object.entries(current.rounds[roundKey].groups).map(([groupId, group]) => [
          groupId,
          {
            ...group,
            teamId: group.teamId,
            status: 'WAITING',
            completed: false,
            completedAt: undefined,
            completedBy: undefined,
            issueNote: undefined,
            updatedAt: nowIso(),
          },
        ]),
      ) as Record<string, GroupRoundState>
      const next = {
        ...current,
        rounds: {
          ...current.rounds,
          [roundKey]: {
            ...current.rounds[roundKey],
            groups: resetGroups,
          },
        },
      }
      return addLog(next, makeLog('RESET_ROUND', current.settings.currentRound, 'all', staffName))
    }, 'Current round reset')
  }

  function exportTeamsCsv() {
    const rows = ['runOrder,seatNumber,teamName,finishTime']
    teams.forEach((team) => rows.push(`${team.runOrder},${team.seatNumber},${team.teamName},${team.finishTime}`))
    downloadFile('gm-advanced-teams.csv', rows.join('\n'), 'text/csv')
  }

  function exportEventsCsv() {
    const rows = ['timestamp,round,judgeGroup,action,teamId,staffName,note']
    Object.values(data.eventLogs).forEach((log) => {
      rows.push([log.timestamp, log.round, log.judgeGroup, log.action, log.teamId || '', log.staffName || '', log.note || ''].join(','))
    })
    downloadFile('gm-advanced-event-log.csv', rows.join('\n'), 'text/csv')
  }

  function exportStatusJson() {
    downloadFile('gm-advanced-status-backup.json', JSON.stringify(data, null, 2), 'application/json')
  }

  function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const backup = JSON.parse(String(reader.result)) as CompetitionData
        if (!backup.settings || !backup.teams || !backup.rounds) throw new Error('Invalid backup')
        updateData((current) => addLog({ ...backup, eventLogs: backup.eventLogs || {} }, makeLog('IMPORT_BACKUP', current.settings.currentRound, 'all', staffName)), 'Backup imported')
      } catch {
        window.alert('Could not import that JSON backup.')
      }
    }
    reader.readAsText(file)
  }

  function handleCsvFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setCsvPreview(parseCsv(String(reader.result)))
    reader.readAsText(file)
  }

  function applyCsvPreview() {
    if (!csvPreview.length) return
    updateData((current) => rebuildFromSetup({
      ...current,
      teams: teamsToRecord(csvPreview),
      settings: {
        ...current.settings,
        totalRounds: csvPreview.length,
        firstFinishTime: csvPreview[0].finishTime,
      },
    }), 'Teams imported')
    setCsvPreview([])
  }

  function updateSettingsField<K extends keyof CompetitionData['settings']>(
    field: K,
    value: CompetitionData['settings'][K],
  ) {
    updateData((current) => rebuildFromSetup({
      ...current,
      settings: {
        ...current.settings,
        [field]: value,
      },
    }), 'Settings saved')
  }

  function updateCategory(groupId: string, categoryName: string) {
    updateData((current) => rebuildFromSetup({
      ...current,
      judgeGroups: {
        ...current.judgeGroups,
        [groupId]: {
          ...current.judgeGroups[groupId],
          categoryName,
        },
      },
    }), 'Category saved')
  }

  function updateStart(groupId: string, startRunOrder: number) {
    updateData((current) => rebuildFromSetup({
      ...current,
      judgeGroups: {
        ...current.judgeGroups,
        [groupId]: {
          ...current.judgeGroups[groupId],
          startRunOrder,
        },
      },
    }), 'Start position saved')
  }

  function applyGeneratedSchedule(totalTeams: number) {
    const finishTimes = generateFinishTimes(
      data.settings.firstFinishTime,
      data.settings.roundDurationMinutes,
      totalTeams,
    )
    const nextTeams = Array.from({ length: totalTeams }, (_, index) => {
      const existing = teams[index]
      const runOrder = index + 1
      return {
        runOrder,
        seatNumber: existing?.seatNumber || `GAS-${String(runOrder).padStart(3, '0')}`,
        teamName: existing?.teamName || `Team ${runOrder}`,
        finishTime: finishTimes[index],
      }
    })
    updateData((current) => rebuildFromSetup({
      ...current,
      teams: teamsToRecord(nextTeams),
    }), 'Schedule regenerated')
  }

  function resetAllData() {
    if (!window.confirm(`Reset ${getLevelLabel(selectedLevel)} data? This cannot be undone.`)) return
    resetSelectedLevel(selectedLevel)
      .then((nextData) => {
        if (nextData) {
          setData(nextData)
          setLevelHasData(true)
          writeCachedCompetition(selectedLevel, nextData)
          setSaveMessage('Selected level reset')
        } else {
          setLevelHasData(false)
          setSaveMessage('Selected level reset to empty')
        }
      })
      .catch((error: unknown) => {
        setSaveMessage(error instanceof Error ? error.message : 'Could not reset selected level')
      })
  }

  if (!session) {
    return <LoginPage onLogin={handleLogin} />
  }

  const effectiveRoute = !isAdmin && route !== '/dashboard' ? '/dashboard' : route

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{isAdmin ? 'Admin Control' : 'Judge Staff Control'}</p>
          <h1>{data.settings.competitionName} · {getLevelLabel(selectedLevel)}</h1>
        </div>
        <button
          aria-expanded={menuOpen}
          aria-label="Open menu"
          className="menu-button"
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div className={menuOpen ? 'top-actions open' : 'top-actions'}>
          {isAdmin ? (
            <label className="level-select">
              Level
              <select value={selectedLevel} onChange={(event) => changeLevel(event.target.value as CompetitionLevelId)}>
                {competitionLevels.map((level) => (
                  <option key={level.id} value={level.id}>{level.label}</option>
                ))}
              </select>
            </label>
          ) : (
            <div className="locked-level">
              <span className="label">Level</span>
              <strong>{getLevelLabel(selectedLevel)}</strong>
            </div>
          )}
          <button className={effectiveRoute === '/dashboard' ? 'tab active' : 'tab'} type="button" onClick={() => goTo('/dashboard')}>Dashboard</button>
          {isAdmin ? (
            <>
              <button className={effectiveRoute === '/summary' ? 'tab active' : 'tab'} type="button" onClick={() => goTo('/summary')}>Summary</button>
              <button className={effectiveRoute === '/setup' ? 'tab active' : 'tab'} type="button" onClick={() => goTo('/setup')}>Setup</button>
            </>
          ) : null}
          <button
            className="ghost utility-item"
            type="button"
            onClick={() => {
              const nextName = window.prompt('Staff Name', staffName)?.trim()
              if (!nextName) return
              localStorage.setItem(staffNameKey, nextName)
              setStaffName(nextName)
            }}
          >
            {staffName || 'Staff'}
          </button>
          <span className={firebaseDiagnostics.connected ? 'badge good utility-item' : 'badge warning utility-item'}>
            {firebaseDiagnostics.connected ? 'Firebase' : 'Local cache'}
          </span>
          <span className={online ? 'badge good utility-item' : 'badge danger utility-item'}>{online ? 'Online' : 'Offline'}</span>
          <button className="ghost logout-button" type="button" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {effectiveRoute === '/summary' ? (
        <SummaryPage
          dataByLevel={summaryData}
          onOpenLevel={(levelId) => {
            changeLevel(levelId)
            navigate('/dashboard')
          }}
        />
      ) : !levelHasData ? (
        <EmptyLevel
          levelLabel={getLevelLabel(selectedLevel)}
          onInitialize={initializeLevel}
        />
      ) : effectiveRoute === '/dashboard' ? (
        <DashboardPage
          canEdit
          completedCount={completedCount}
          currentRound={currentRound}
          currentRoundState={currentRoundState}
          data={data}
          deadlineMinutes={deadlineMinutes}
          groupRounds={groupRounds}
          now={now}
          requiredCount={requiredCount}
          onComplete={handleComplete}
          onGroupRoundChange={(groupId, round) => {
            setGroupRounds((current) => ({
              ...current,
              [groupId]: Math.min(Math.max(1, round), data.settings.totalRounds),
            }))
          }}
          onIssue={(groupId, round) => setIssueDialog({ round, groupId, note: '' })}
          onFollowCurrentTime={setFollowCurrentTime}
          onResetRound={resetCurrentRound}
          onRoundChange={changeRound}
          onUndo={handleUndo}
          saveMessage={saveMessage}
          staffName={staffName}
        />
      ) : (
        <SetupPage
          csvPreview={csvPreview}
          data={data}
          diagnostics={firebaseDiagnostics}
          levelLabel={getLevelLabel(selectedLevel)}
          onInitializeLevel={initializeLevel}
          onApplyCsv={applyCsvPreview}
          onBackupImport={importBackup}
          onCategoryChange={updateCategory}
          onClearResults={clearEvaluationResults}
          onCsvFile={handleCsvFile}
          onExportEvents={exportEventsCsv}
          onExportJson={exportStatusJson}
          onExportTeams={exportTeamsCsv}
          onGeneratedSchedule={applyGeneratedSchedule}
          onResetAll={resetAllData}
          onSettingsChange={updateSettingsField}
          onStart={() => navigate('/dashboard')}
          onStartChange={updateStart}
        />
      )}

      {issueDialog ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-label="Issue note">
            <h2>Record Issue</h2>
            <textarea
              autoFocus
              value={issueDialog.note}
              maxLength={160}
              placeholder="Short note for Head Staff records"
              onChange={(event) => setIssueDialog({ ...issueDialog, note: event.target.value })}
            />
            <div className="modal-actions">
              <button className="ghost" type="button" onClick={() => setIssueDialog(null)}>Cancel</button>
              <button className="issue" type="button" onClick={saveIssue}>Save Issue</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

function LoginPage({ onLogin }: { onLogin: (username: string, password: string) => boolean }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const ok = onLogin(username, password)
    if (!ok) setError('ID or password is incorrect.')
  }

  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={submit}>
        <div>
          <p className="eyebrow">GM Advanced</p>
          <h1>Competition Control</h1>
        </div>
        <label>ID<input autoFocus value={username} autoComplete="username" onChange={(event) => setUsername(event.target.value)} /></label>
        <label>Password<input type="password" value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} /></label>
        {error ? <p className="login-error">{error}</p> : null}
        <button className="primary" type="submit">Login</button>
      </form>
    </main>
  )
}

type DashboardProps = {
  canEdit: boolean
  completedCount: number
  currentRound: number
  currentRoundState: CompetitionData['rounds'][string]
  data: CompetitionData
  deadlineMinutes: number
  groupRounds: Record<string, number>
  now: Date
  requiredCount: number
  onComplete: (groupId: string, round: number) => void
  onFollowCurrentTime: (follow: boolean) => void
  onGroupRoundChange: (groupId: string, round: number) => void
  onIssue: (groupId: string, round: number) => void
  onResetRound: () => void
  onRoundChange: (round: number) => void
  onUndo: (groupId: string, round: number) => void
  saveMessage: string
  staffName: string
}

function EmptyLevel({ levelLabel, onInitialize }: { levelLabel: string; onInitialize: () => void }) {
  return (
    <section className="page empty-level">
      <div className="panel">
        <p className="eyebrow">Selected Level</p>
        <h2>{levelLabel}</h2>
        <p>No competition data has been configured for this level.</p>
        <button className="primary" type="button" onClick={onInitialize}>Initialize Level</button>
      </div>
    </section>
  )
}

type GroupSummary = {
  groupId: string
  label: string
  categoryName: string
  configured: boolean
  total: number
  completed: number
  remaining: number
  issues: number
}

function summarizeLevel(data: CompetitionData | null) {
  if (!data) return null

  const groupSummaries = judgeGroupIds.map((groupId, index): GroupSummary => {
    const roundEntries = Object.entries(data.rounds).sort(([a], [b]) =>
      Number(a.replace('round-', '')) - Number(b.replace('round-', '')),
    )
    const sampleGroup = roundEntries[0]?.[1].groups[groupId]
    const configured = sampleGroup?.configured !== false
    const entries = configured
      ? roundEntries.map(([roundKey, round]) => ({
        round: Number(roundKey.replace('round-', '')),
        deadline: round.finishTime,
        group: round.groups[groupId],
      })).filter((entry) => entry.group?.configured !== false)
      : []
    const completed = entries.filter((entry) => entry.group.completed).length
    const issues = entries.filter((entry) => entry.group.status === 'ISSUE').length

    return {
      groupId,
      label: `Judge Group ${index + 1}`,
      categoryName: data.judgeGroups[groupId]?.categoryName || sampleGroup?.categoryName || 'Not Configured',
      configured,
      total: entries.length,
      completed,
      remaining: entries.length - completed,
      issues,
    }
  })

  const configuredGroups = groupSummaries.filter((group) => group.configured)
  const total = configuredGroups.reduce((sum, group) => sum + group.total, 0)
  const completed = configuredGroups.reduce((sum, group) => sum + group.completed, 0)
  const remaining = configuredGroups.reduce((sum, group) => sum + group.remaining, 0)
  const issues = configuredGroups.reduce((sum, group) => sum + group.issues, 0)

  return {
    groupSummaries,
    total,
    completed,
    remaining,
    issues,
  }
}

function SummaryPage({
  dataByLevel,
  onOpenLevel,
}: {
  dataByLevel: Record<CompetitionLevelId, CompetitionData | null>
  onOpenLevel: (levelId: CompetitionLevelId) => void
}) {
  return (
    <section className="page summary-page">
      <div className="summary-hero">
        <div>
          <p className="eyebrow">All Levels</p>
          <h2>Progress Summary</h2>
        </div>
        <p>Live completion counts for every judge group.</p>
      </div>

      <div className="summary-board">
        {competitionLevels.map((level) => {
          const data = dataByLevel[level.id]
          const summary = summarizeLevel(data)

          if (!data || !summary) {
            return (
              <article className="summary-level-row no-data" key={level.id}>
                <div className="summary-card-head">
                  <h3>{level.label}</h3>
                  <span className="badge warning">No Data</span>
                </div>
                <button className="ghost" type="button" onClick={() => onOpenLevel(level.id)}>Open Level</button>
              </article>
            )
          }

          return (
            <article className="summary-level-row" key={level.id}>
              <div className="summary-level-overview">
                <button className="summary-level-button" type="button" onClick={() => onOpenLevel(level.id)}>
                  <span>{level.label}</span>
                  <strong>{summary.completed}/{summary.total}</strong>
                </button>
                <div className="summary-level-meta">
                  <span>เหลือ {summary.remaining}</span>
                  {summary.issues ? <span className="issue-count">{summary.issues} issue</span> : <span>ไม่มี issue</span>}
                </div>
              </div>

              <div className="summary-group-strip">
                {summary.groupSummaries.map((group, index) => (
                  <div
                    className={group.configured ? `summary-group-tile group-${index + 1}` : 'summary-group-tile disabled'}
                    key={group.groupId}
                    title={group.configured ? group.categoryName : 'Not Configured'}
                  >
                    <span>ชุด {index + 1}</span>
                    <strong>{group.configured ? `${group.completed}/${group.total}` : '-'}</strong>
                    {group.configured ? (
                      <div className="mini-progress" aria-hidden="true">
                        <span style={{ width: `${group.total ? (group.completed / group.total) * 100 : 0}%` }}></span>
                      </div>
                    ) : null}
                    <em>{group.configured ? `เหลือ ${group.remaining}${group.issues ? ` · ${group.issues} issue` : ''}` : 'Not Configured'}</em>
                  </div>
                ))}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function DashboardPage(props: DashboardProps) {
  const { data, currentRound, currentRoundState, completedCount, deadlineMinutes, groupRounds, now } = props

  return (
    <section className="page">
      <div className="status-strip">
        <div>
          <span className="label">Date</span>
          <strong>{formatDate(data.settings.competitionDate)}</strong>
        </div>
        <div>
          <span className="label">Live Time</span>
          <strong>{formatClock(now)}</strong>
        </div>
        <div>
          <span className="label">Current Round</span>
          <strong>{currentRound} / {data.settings.totalRounds}</strong>
        </div>
        <div>
          <span className="label">Time Slot</span>
          <strong>{currentRoundState.startTime} - {currentRoundState.finishTime}</strong>
        </div>
        <div>
          <span className="label">Deadline</span>
          <strong>{formatRemaining(deadlineMinutes)}</strong>
        </div>
        <div>
          <span className="label">Completion</span>
          <strong>{completedCount} / {props.requiredCount} completed</strong>
        </div>
      </div>

      <div className="round-controls">
        <button type="button" className="ghost" disabled={currentRound <= 1} onClick={() => props.onRoundChange(currentRound - 1)}>Previous Round</button>
        <label>
          Go to Round
          <input
            type="number"
            min="1"
            max={data.settings.totalRounds}
            value={currentRound}
            onChange={(event) => props.onRoundChange(Number(event.target.value))}
          />
        </label>
        <button type="button" className="ghost" disabled={currentRound >= data.settings.totalRounds} onClick={() => props.onRoundChange(currentRound + 1)}>Next Round</button>
        <label className="toggle inline-toggle">
          <input
            type="checkbox"
            checked={data.settings.followCurrentTime}
            onChange={(event) => props.onFollowCurrentTime(event.target.checked)}
          />
          Follow Current Time
        </label>
        <button type="button" className="danger" disabled={!props.canEdit} onClick={props.onResetRound}>Reset Current Round</button>
      </div>

      {completedCount === props.requiredCount ? (
        <div className="all-complete">
          <strong>ALL CONFIGURED JUDGING GROUPS COMPLETED</strong>
          <button type="button" className="primary" disabled={currentRound >= data.settings.totalRounds} onClick={() => props.onRoundChange(currentRound + 1)}>Next Round</button>
        </div>
      ) : null}

      <div className="cards-grid">
        {judgeGroupIds
          .filter((groupId) => currentRoundState.groups[groupId]?.configured !== false)
          .map((groupId, index) => {
          const groupRound = Math.min(Math.max(1, groupRounds[groupId] || currentRound), data.settings.totalRounds)
          const groupRoundState = data.rounds[`round-${groupRound}`] || currentRoundState
          const group = groupRoundState.groups[groupId]
          const status = computeStatus(group, groupRoundState.finishTime, data, now)
          const configured = group.configured !== false
          return (
            <article className={`judge-card group-${index + 1} ${configured ? status.toLowerCase() : 'not-configured'}`} key={groupId}>
              <div className="card-head">
                <div>
                  <span className="label">Judge Group {index + 1}</span>
                  <h2>{data.judgeGroups[groupId].categoryName}</h2>
                </div>
                <span className="status-pill">{configured ? status.replace('_', ' ') : 'Not Configured'}</span>
              </div>
              <div className="card-round-controls">
                <button
                  className="ghost"
                  type="button"
                  disabled={groupRound <= 1}
                  onClick={() => props.onGroupRoundChange(groupId, groupRound - 1)}
                >
                  Prev
                </button>
                <label>
                  Round
                  <input
                    type="number"
                    min="1"
                    max={data.settings.totalRounds}
                    value={groupRound}
                    onChange={(event) => props.onGroupRoundChange(groupId, Number(event.target.value))}
                  />
                </label>
                <button
                  className="ghost"
                  type="button"
                  disabled={groupRound >= data.settings.totalRounds}
                  onClick={() => props.onGroupRoundChange(groupId, groupRound + 1)}
                >
                  Next
                </button>
              </div>
              <dl className="team-facts">
                <div><dt>Run Order</dt><dd>{configured ? group.runOrder : '-'}</dd></div>
                <div><dt>Seat Number</dt><dd>{group.seatNumber}</dd></div>
                <div><dt>Team</dt><dd>{group.teamName}</dd></div>
                <div><dt>Deadline</dt><dd>{groupRoundState.finishTime}</dd></div>
              </dl>
              <p className="timestamp">{group.completedAt ? `Completed ${new Date(group.completedAt).toLocaleTimeString()} by ${group.completedBy || 'Staff'}` : group.issueNote ? `Issue: ${group.issueNote}` : 'Awaiting confirmation'}</p>
              <div className="card-actions">
                <button className="complete" type="button" disabled={!props.canEdit || !configured || group.completed} onClick={() => props.onComplete(groupId, groupRound)}>Complete</button>
                <button className="issue" type="button" disabled={!props.canEdit || !configured} onClick={() => props.onIssue(groupId, groupRound)}>Issue</button>
                <button className="ghost" type="button" disabled={!props.canEdit || !configured || !group.completed} onClick={() => props.onUndo(groupId, groupRound)}>Undo</button>
              </div>
            </article>
          )
        })}
      </div>

      <div className="save-line">{props.saveMessage} · Staff: {props.staffName}</div>
      <Timeline data={data} currentRound={currentRound} now={now} />
    </section>
  )
}

function Timeline({ data, currentRound, now }: { data: CompetitionData; currentRound: number; now: Date }) {
  return (
    <section className="timeline-wrap">
      <h2>Timeline</h2>
      <div className="table-scroll">
        <table className="timeline">
          <thead>
            <tr>
              <th>Round</th>
              <th>Time Slot</th>
              {judgeGroupIds.map((_, index) => <th key={index}>Judge Group {index + 1}</th>)}
              <th>Overall Status</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.rounds).map(([roundKey, round]) => {
              const roundNumber = Number(roundKey.replace('round-', ''))
              const configuredIds = judgeGroupIds.filter((groupId) => round.groups[groupId]?.configured !== false)
              const statuses = configuredIds.map((groupId) => {
                const group = round.groups[groupId]
                return computeStatus(group, round.finishTime, data, now)
              })
              const completed = statuses.filter((status) => status === 'COMPLETED').length
              const rowStatus = completed === configuredIds.length ? 'complete-row' : statuses.includes('OVERDUE') ? 'overdue-row' : ''
              return (
                <tr className={`${rowStatus} ${roundNumber === currentRound ? 'current-row' : ''}`} key={roundKey}>
                  <td>{roundNumber}</td>
                  <td>{round.startTime} - {round.finishTime}</td>
                  {judgeGroupIds.map((groupId) => {
                    const group = round.groups[groupId]
                    if (group.configured === false) return <td key={groupId}>Not Configured</td>
                    return <td key={groupId}>{group.completed ? 'Done' : 'Open'} {group.seatNumber} {shortTeamName(group.teamName)}</td>
                  })}
                  <td>{completed} / {configuredIds.length} completed</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

type SetupProps = {
  csvPreview: Team[]
  data: CompetitionData
  diagnostics: FirebaseDiagnostics
  levelLabel: string
  onApplyCsv: () => void
  onBackupImport: (event: ChangeEvent<HTMLInputElement>) => void
  onCategoryChange: (groupId: string, categoryName: string) => void
  onClearResults: () => void
  onCsvFile: (event: ChangeEvent<HTMLInputElement>) => void
  onExportEvents: () => void
  onExportJson: () => void
  onExportTeams: () => void
  onGeneratedSchedule: (totalTeams: number) => void
  onResetAll: () => void
  onInitializeLevel: () => void
  onSettingsChange: <K extends keyof CompetitionData['settings']>(field: K, value: CompetitionData['settings'][K]) => void
  onStart: () => void
  onStartChange: (groupId: string, startRunOrder: number) => void
}

function SetupPage(props: SetupProps) {
  const { data } = props
  const [teamTotal, setTeamTotal] = useState(Object.keys(data.teams).length)

  return (
    <section className="page setup-page">
      <div className="setup-grid">
        <section className="panel">
          <h2>Competition Settings</h2>
          <label>Competition Name<input value={data.settings.competitionName} onChange={(event) => props.onSettingsChange('competitionName', event.target.value)} /></label>
          <label>Date<input type="date" value={data.settings.competitionDate} onChange={(event) => props.onSettingsChange('competitionDate', event.target.value)} /></label>
          <label>First Finish Time<input type="time" value={data.settings.firstFinishTime} onChange={(event) => props.onSettingsChange('firstFinishTime', event.target.value)} /></label>
          <label>Round Duration<input type="number" min="1" value={data.settings.roundDurationMinutes} onChange={(event) => props.onSettingsChange('roundDurationMinutes', Number(event.target.value))} /></label>
          <label>Due Soon Warning<input type="number" min="1" value={data.settings.dueSoonMinutes} onChange={(event) => props.onSettingsChange('dueSoonMinutes', Number(event.target.value))} /></label>
          <label>Total Teams<input type="number" min="4" value={teamTotal} onChange={(event) => setTeamTotal(Number(event.target.value))} /></label>
          <button className="primary" type="button" onClick={() => props.onGeneratedSchedule(teamTotal)}>Apply Team Count and Times</button>
          <label className="toggle"><input type="checkbox" checked={data.settings.soundEnabled} onChange={(event) => props.onSettingsChange('soundEnabled', event.target.checked)} /> Sound alerts</label>
        </section>

        <section className="panel">
          <h2>Judge Groups</h2>
          {judgeGroupIds.map((groupId, index) => (
            <div className="group-editor" key={groupId}>
              <strong>Judge Group {index + 1}</strong>
              <label>Category<input value={data.judgeGroups[groupId].categoryName} onChange={(event) => props.onCategoryChange(groupId, event.target.value)} /></label>
              <label>Starting Run Order<input type="number" min="1" max={Object.keys(data.teams).length} value={data.judgeGroups[groupId].startRunOrder} onChange={(event) => props.onStartChange(groupId, Number(event.target.value))} /></label>
            </div>
          ))}
        </section>

        <section className="panel">
          <h2>Firebase Diagnostics</h2>
          <p className="warning-copy">Public editing is enabled. Disable Firebase public write access after the event.</p>
          <div className="diagnostics">
            <div><span className="label">Selected Level</span><strong>{props.levelLabel}</strong></div>
            <div><span className="label">Database Path</span><strong>{props.diagnostics.path}</strong></div>
            <div><span className="label">Configured</span><strong>{props.diagnostics.configured ? 'Yes' : 'No'}</strong></div>
            <div><span className="label">Realtime Status</span><strong>{props.diagnostics.connected ? 'Connected' : 'Not connected'}</strong></div>
            <div><span className="label">Message</span><strong>{props.diagnostics.message}</strong></div>
            {props.diagnostics.missingVariables.length ? (
              <div><span className="label">Missing Variables</span><strong>{props.diagnostics.missingVariables.join(', ')}</strong></div>
            ) : null}
          </div>
          <button className="primary" type="button" onClick={props.onInitializeLevel}>Initialize Selected Level</button>
        </section>

        <section className="panel">
          <h2>Import and Export</h2>
          <label>Import Teams CSV<input type="file" accept=".csv,text/csv" onChange={props.onCsvFile} /></label>
          {props.csvPreview.length ? (
            <div className="preview">
              <strong>{props.csvPreview.length} teams ready to import</strong>
              <ul>
                {props.csvPreview.slice(0, 5).map((team) => <li key={team.runOrder}>{team.runOrder}. {team.seatNumber} {team.teamName} {team.finishTime}</li>)}
              </ul>
              <button className="primary" type="button" onClick={props.onApplyCsv}>Save CSV Preview</button>
            </div>
          ) : null}
          <div className="button-row">
            <button className="ghost" type="button" onClick={props.onExportTeams}>Export Teams CSV</button>
            <button className="ghost" type="button" onClick={props.onExportEvents}>Export Event Log CSV</button>
            <button className="ghost" type="button" onClick={props.onExportJson}>Export Selected Level JSON</button>
          </div>
          <label>Import Selected Level JSON<input type="file" accept=".json,application/json" onChange={props.onBackupImport} /></label>
          <div className="admin-reset-box">
            <strong>Admin Reset</strong>
            <p>Clear all Complete and Issue test results for this level only. Teams, schedule, and settings stay unchanged.</p>
            <button className="ghost" type="button" onClick={props.onClearResults}>Clear Test Results</button>
            <button className="danger" type="button" onClick={props.onResetAll}>Reset Selected Level</button>
          </div>
          <button className="complete" type="button" onClick={props.onStart}>Start Competition</button>
        </section>
      </div>
    </section>
  )
}

export default App
