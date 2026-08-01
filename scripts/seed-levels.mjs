import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { getDatabase, get, ref, set } from 'firebase/database'

const projectRoot = new URL('../', import.meta.url)
const envText = readFileSync(new URL('.env', projectRoot), 'utf8')
const source = readFileSync(new URL('src/data.ts', projectRoot), 'utf8')

const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index), line.slice(index + 1)]
    }),
)

function extractArray(name) {
  const marker = `export const ${name}: Team[] = `
  const start = source.indexOf(marker)
  if (start < 0) throw new Error(`Missing ${name}`)
  const arrayStart = start + marker.length
  const exportStart = source.indexOf('\n\nexport ', arrayStart)
  const arrayText = source.slice(arrayStart, exportStart).trim()
  return Function(`"use strict"; return (${arrayText});`)()
}

const categories = {
  group1: 'Total Number of Devices and Smoothness',
  group2: 'Scientific Concepts and Green Energy',
  group3: 'Creative Device',
  group4: 'Overall Contraption Design',
}

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
})

const database = getDatabase(app)
const groupIds = ['group1', 'group2', 'group3', 'group4']

function addMinutes(time, minutes) {
  const [hours, mins] = time.split(':').map(Number)
  const total = hours * 60 + mins + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function teamIdForRunOrder(runOrder) {
  return `team-${String(runOrder).padStart(2, '0')}`
}

function createCompetition(levelId, levelName, teams, starts, configuredGroupCount) {
  const teamsRecord = Object.fromEntries(teams.map((team) => [teamIdForRunOrder(team.runOrder), team]))
  const judgeGroups = Object.fromEntries(groupIds.map((groupId, index) => [
    groupId,
    {
      categoryName: categories[groupId],
      startRunOrder: starts[groupId],
      configured: index < configuredGroupCount,
    },
  ]))
  const rounds = {}

  teams.forEach((deadlineTeam, roundIndex) => {
    const groups = {}
    groupIds.forEach((groupId, index) => {
      const judgeGroup = judgeGroups[groupId]
      if (!judgeGroup.configured) {
        groups[groupId] = {
          teamId: '',
          runOrder: 0,
          seatNumber: 'Not Configured',
          teamName: 'Not Configured',
          categoryName: judgeGroup.categoryName,
          configured: false,
          status: 'WAITING',
          completed: false,
        }
        return
      }
      const team = teams[(starts[groupId] - 1 + roundIndex) % teams.length]
      groups[groupId] = {
        teamId: teamIdForRunOrder(team.runOrder),
        runOrder: team.runOrder,
        seatNumber: team.seatNumber,
        teamName: team.teamName,
        categoryName: judgeGroup.categoryName,
        configured: index < configuredGroupCount,
        status: 'WAITING',
        completed: false,
      }
    })
    rounds[`round-${roundIndex + 1}`] = {
      startTime: addMinutes(deadlineTeam.finishTime, -8),
      finishTime: deadlineTeam.finishTime,
      groups,
    }
  })

  return {
    settings: {
      competitionName: `GM Advanced - ${levelName}`,
      competitionDate: new Date().toISOString().slice(0, 10),
      roundDurationMinutes: 8,
      dueSoonMinutes: 2,
      currentRound: 1,
      totalRounds: teams.length,
      soundEnabled: true,
      firstFinishTime: '13:13',
      followCurrentTime: true,
      levelId,
      levelName,
      configuredGroupCount,
    },
    teams: teamsRecord,
    judgeGroups,
    rounds,
    eventLogs: {},
  }
}

const levels = [
  {
    id: 'elementary-school',
    label: 'Elementary School',
    teams: extractArray('elementaryTeams'),
    starts: { group1: 1, group2: 7, group3: 14, group4: 21 },
    configuredGroupCount: 4,
  },
  {
    id: 'junior-high-school',
    label: 'Junior High School',
    teams: extractArray('juniorHighTeams'),
    starts: { group1: 1, group2: 7, group3: 14, group4: 21 },
    configuredGroupCount: 4,
  },
]

const result = {}
for (const level of levels) {
  const path = `competitions/gm-advanced/${level.id}`
  const snapshot = await get(ref(database, path))
  if (snapshot.exists()) {
    result[path] = 'already existed'
    continue
  }
  await set(ref(database, path), createCompetition(level.id, level.label, level.teams, level.starts, level.configuredGroupCount))
  result[path] = 'seeded'
}

console.log(JSON.stringify(result, null, 2))
