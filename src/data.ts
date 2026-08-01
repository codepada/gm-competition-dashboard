export const competitionRoot = 'gm-advanced'

export type CompetitionLevelId = 'elementary-school' | 'junior-high-school' | 'senior-high-school'

export type CompetitionLevel = {
  id: CompetitionLevelId
  label: string
}

export const competitionLevels: CompetitionLevel[] = [
  { id: 'elementary-school', label: 'Elementary School' },
  { id: 'junior-high-school', label: 'Junior High School' },
  { id: 'senior-high-school', label: 'Senior High School' },
]

export const defaultLevelId: CompetitionLevelId = 'senior-high-school'

export type Status =
  | 'WAITING'
  | 'DUE_SOON'
  | 'COMPLETED'
  | 'OVERDUE'
  | 'ISSUE'

export type Team = {
  runOrder: number
  seatNumber: string
  teamName: string
  finishTime: string
}

export type JudgeGroup = {
  categoryName: string
  startRunOrder: number
  configured: boolean
  imageUrl?: string
}

export type GroupRoundState = {
  teamId: string
  runOrder: number
  seatNumber: string
  teamName: string
  categoryName: string
  configured: boolean
  status: Status
  completed: boolean
  completedAt?: string
  completedBy?: string
  issueNote?: string
  issueAt?: string
  updatedAt?: string
}

export type RoundState = {
  startTime: string
  finishTime: string
  groups: Record<string, GroupRoundState>
}

export type EventLog = {
  timestamp: string | object
  round: number
  judgeGroup: string
  action: 'COMPLETE' | 'UNDO' | 'ISSUE' | 'RESET_ROUND' | 'IMPORT_BACKUP'
  teamId?: string
  seatNumber?: string
  teamName?: string
  note?: string
  staffName?: string
  previousValue?: unknown
  newValue?: unknown
  issueNote?: string
}

export type CompetitionSettings = {
  competitionName: string
  competitionDate: string
  roundDurationMinutes: number
  dueSoonMinutes: number
  currentRound: number
  totalRounds: number
  soundEnabled: boolean
  firstFinishTime: string
  followCurrentTime: boolean
  levelId: CompetitionLevelId
  levelName: string
  configuredGroupCount: number
}

export type CompetitionData = {
  settings: CompetitionSettings
  teams: Record<string, Team>
  judgeGroups: Record<string, JudgeGroup>
  rounds: Record<string, RoundState>
  eventLogs: Record<string, EventLog>
}

export const judgeGroupIds = ['group1', 'group2', 'group3', 'group4'] as const

export const judgeGroupLabels: Record<string, string> = {
  group1: 'Judge Group 1',
  group2: 'Judge Group 2',
  group3: 'Judge Group 3',
  group4: 'Judge Group 4',
}

const judgingCategories = {
  group1: 'Total Number of Devices and Smoothness',
  group2: 'Scientific Concepts and Green Energy',
  group3: 'Creative Device',
  group4: 'Overall Contraption Design',
}

export const defaultTeams: Team[] = [
  { runOrder: 1, seatNumber: 'GAS-001', teamName: 'RoboX Team', finishTime: '13:13' },
  { runOrder: 2, seatNumber: 'GAS-002', teamName: 'WCP - 3W1B', finishTime: '13:21' },
  { runOrder: 3, seatNumber: 'GAS-003', teamName: 'Dragon Ball Z', finishTime: '13:29' },
  { runOrder: 4, seatNumber: 'GAS-004', teamName: 'CDW Eco Play TH', finishTime: '13:37' },
  { runOrder: 5, seatNumber: 'GAS-005', teamName: 'WN STEM 169', finishTime: '13:45' },
  { runOrder: 6, seatNumber: 'GAS-006', teamName: 'Son of GFBlack69', finishTime: '13:53' },
  { runOrder: 7, seatNumber: 'GAS-007', teamName: 'Blue Lock', finishTime: '14:01' },
  { runOrder: 8, seatNumber: 'GAS-008', teamName: 'FSS STEAM TEAM', finishTime: '14:09' },
  { runOrder: 9, seatNumber: 'GAS-009', teamName: 'Unity Force', finishTime: '14:17' },
  { runOrder: 10, seatNumber: 'GAS-010', teamName: 'powergreen', finishTime: '14:25' },
  { runOrder: 11, seatNumber: 'GAS-011', teamName: 'Sweet dream', finishTime: '14:33' },
  { runOrder: 12, seatNumber: 'GAS-012', teamName: 'SK : I HATE MONDAY', finishTime: '14:41' },
  { runOrder: 13, seatNumber: 'GAS-013', teamName: 'SK LAST HOPE', finishTime: '14:49' },
  { runOrder: 14, seatNumber: 'GAS-014', teamName: 'BBB (Brick By Brick)', finishTime: '14:57' },
  { runOrder: 15, seatNumber: 'GAS-015', teamName: 'P.A.VISIONERS', finishTime: '15:05' },
  { runOrder: 16, seatNumber: 'GAS-016', teamName: 'Gu gor soon pen', finishTime: '15:13' },
  { runOrder: 17, seatNumber: 'GAS-017', teamName: 'PT Avatar Greentech', finishTime: '15:21' },
  { runOrder: 18, seatNumber: 'GAS-018', teamName: 'Bao Bei Men', finishTime: '15:29' },
  { runOrder: 19, seatNumber: 'GAS-019', teamName: 'ARSteroid International', finishTime: '15:37' },
  { runOrder: 20, seatNumber: 'GAS-020', teamName: 'Qi Ji Riders', finishTime: '15:45' },
  { runOrder: 21, seatNumber: 'GAS-021', teamName: 'Future World', finishTime: '15:53' },
  { runOrder: 22, seatNumber: 'GAS-022', teamName: 'Not Like Us', finishTime: '16:01' },
  { runOrder: 23, seatNumber: 'GAS-023', teamName: 'Humungousaur', finishTime: '16:09' },
  { runOrder: 24, seatNumber: 'GAS-024', teamName: 'XAT-FOUR', finishTime: '16:17' },
  { runOrder: 25, seatNumber: 'GAS-025', teamName: 'Show me the way', finishTime: '16:25' },
  { runOrder: 26, seatNumber: 'GAS-026', teamName: 'NBW GM2', finishTime: '16:33' },
  { runOrder: 27, seatNumber: 'GAS-027', teamName: 'Kpwit 03', finishTime: '16:41' },
  { runOrder: 28, seatNumber: 'GAS-028', teamName: 'ILAB robot', finishTime: '16:49' },
]

export const juniorHighTeams: Team[] = [
  { runOrder: 1, seatNumber: 'GAJ-001', teamName: 'TCCS MECH Team', finishTime: '13:13' },
  { runOrder: 2, seatNumber: 'GAJ-002', teamName: 'Setia EcoBot', finishTime: '13:21' },
  { runOrder: 3, seatNumber: 'GAJ-003', teamName: 'Touch Grass Committee (TGC)', finishTime: '13:29' },
  { runOrder: 4, seatNumber: 'GAJ-004', teamName: 'MSS Nova', finishTime: '13:37' },
  { runOrder: 5, seatNumber: 'GAJ-005', teamName: 'STEM SPARK P.T.', finishTime: '13:45' },
  { runOrder: 6, seatNumber: 'GAJ-006', teamName: 'SM Taxtic', finishTime: '13:53' },
  { runOrder: 7, seatNumber: 'GAJ-007', teamName: 'Radian', finishTime: '14:01' },
  { runOrder: 8, seatNumber: 'GAJ-008', teamName: 'WCP - My Time', finishTime: '14:09' },
  { runOrder: 9, seatNumber: 'GAJ-009', teamName: 'PTN.GM.Advance', finishTime: '14:17' },
  { runOrder: 10, seatNumber: 'GAJ-010', teamName: 'ACD-STEAM-90', finishTime: '14:25' },
  { runOrder: 11, seatNumber: 'GAJ-011', teamName: 'watsamngamschool919', finishTime: '14:33' },
  { runOrder: 12, seatNumber: 'GAJ-012', teamName: 'Art and Horse Lead the Way', finishTime: '14:41' },
  { runOrder: 13, seatNumber: 'GAJ-013', teamName: 'The Animal Four', finishTime: '14:49' },
  { runOrder: 14, seatNumber: 'GAJ-014', teamName: 'CO 2 NEWWORLD', finishTime: '14:57' },
  { runOrder: 15, seatNumber: 'GAJ-015', teamName: 'The TTS Green Innovator', finishTime: '15:05' },
  { runOrder: 16, seatNumber: 'GAJ-016', teamName: 'SK Brainstorm Elite', finishTime: '15:13' },
  { runOrder: 17, seatNumber: 'GAJ-017', teamName: 'SK Mobility', finishTime: '15:21' },
  { runOrder: 18, seatNumber: 'GAJ-018', teamName: 'SingRongkrajom', finishTime: '15:29' },
  { runOrder: 19, seatNumber: 'GAJ-019', teamName: 'Alpha Force', finishTime: '15:37' },
  { runOrder: 20, seatNumber: 'GAJ-020', teamName: 'Chanon', finishTime: '15:45' },
  { runOrder: 21, seatNumber: 'GAJ-021', teamName: 'Witty', finishTime: '15:53' },
  { runOrder: 22, seatNumber: 'GAJ-022', teamName: 'NBW GM1', finishTime: '16:01' },
  { runOrder: 23, seatNumber: 'GAJ-023', teamName: 'Niche Catalyst', finishTime: '16:09' },
  { runOrder: 24, seatNumber: 'GAJ-024', teamName: 'Mayor Wukong', finishTime: '16:17' },
  { runOrder: 25, seatNumber: 'GAJ-025', teamName: 'Miraculous', finishTime: '16:25' },
  { runOrder: 26, seatNumber: 'GAJ-026', teamName: 'Coconut Robot', finishTime: '16:33' },
  { runOrder: 27, seatNumber: 'GAJ-027', teamName: 'THE SOTER OF S.L.K', finishTime: '16:41' },
]

export const elementaryTeams: Team[] = [
  { runOrder: 1, seatNumber: 'GAE-001', teamName: 'Two-Wheeled Infinity', finishTime: '13:13' },
  { runOrder: 2, seatNumber: 'GAE-002', teamName: 'ET KING', finishTime: '13:21' },
  { runOrder: 3, seatNumber: 'GAE-003', teamName: 'JGPS-1', finishTime: '13:29' },
  { runOrder: 4, seatNumber: 'GAE-004', teamName: 'PNJB', finishTime: '13:37' },
  { runOrder: 5, seatNumber: 'GAE-005', teamName: 'Kei To Science Elite', finishTime: '13:45' },
  { runOrder: 6, seatNumber: 'GAE-006', teamName: 'BRF Power', finishTime: '13:53' },
  { runOrder: 7, seatNumber: 'GAE-007', teamName: 'AST1', finishTime: '14:01' },
  { runOrder: 8, seatNumber: 'GAE-008', teamName: 'Wboc SuperGirl', finishTime: '14:09' },
  { runOrder: 9, seatNumber: 'GAE-009', teamName: 'SK BUTTERFLY A', finishTime: '14:17' },
  { runOrder: 10, seatNumber: 'GAE-010', teamName: 'Dara six-seven', finishTime: '14:25' },
  { runOrder: 11, seatNumber: 'GAE-011', teamName: 'PSP Orion Star', finishTime: '14:33' },
  { runOrder: 12, seatNumber: 'GAE-012', teamName: 'Gadget Tech PopCorn', finishTime: '14:41' },
  { runOrder: 13, seatNumber: 'GAE-013', teamName: 'PC Juniors GM', finishTime: '14:49' },
  { runOrder: 14, seatNumber: 'GAE-014', teamName: 'Smart Team', finishTime: '14:57' },
  { runOrder: 15, seatNumber: 'GAE-015', teamName: 'B.R.N. Synergy Team', finishTime: '15:05' },
  { runOrder: 16, seatNumber: 'GAE-016', teamName: 'PSP Eco Kids', finishTime: '15:13' },
  { runOrder: 17, seatNumber: 'GAE-017', teamName: 'Wat Khaenok School', finishTime: '15:21' },
  { runOrder: 18, seatNumber: 'GAE-018', teamName: 'SJ TEAM', finishTime: '15:29' },
  { runOrder: 19, seatNumber: 'GAE-019', teamName: 'KN.Study Wars 2', finishTime: '15:37' },
  { runOrder: 20, seatNumber: 'GAE-020', teamName: 'P2P Robot', finishTime: '15:45' },
  { runOrder: 21, seatNumber: 'GAE-021', teamName: 'THE BLITZ OF S.L.K', finishTime: '15:53' },
  { runOrder: 22, seatNumber: 'GAE-022', teamName: 'DIAMOND', finishTime: '16:01' },
]

export function teamIdForRunOrder(runOrder: number) {
  return `team-${String(runOrder).padStart(2, '0')}`
}

export function teamsToRecord(teams: Team[]) {
  return teams.reduce<Record<string, Team>>((record, team) => {
    record[teamIdForRunOrder(team.runOrder)] = team
    return record
  }, {})
}

export function teamsFromRecord(teams: Record<string, Team>) {
  return Object.values(teams).sort((a, b) => a.runOrder - b.runOrder)
}

function addMinutes(time: string, minutes: number) {
  const [hours, mins] = time.split(':').map(Number)
  const total = hours * 60 + mins + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function generateFinishTimes(firstFinishTime: string, durationMinutes: number, totalTeams: number) {
  return Array.from({ length: totalTeams }, (_, index) => addMinutes(firstFinishTime, index * durationMinutes))
}

export function generateRounds(
  teams: Record<string, Team>,
  judgeGroups: Record<string, JudgeGroup>,
  roundDurationMinutes: number,
) {
  const orderedTeams = teamsFromRecord(teams)
  const rounds: Record<string, RoundState> = {}

  orderedTeams.forEach((_, roundIndex) => {
    const groups: Record<string, GroupRoundState> = {}

    judgeGroupIds.forEach((groupId) => {
      const group = judgeGroups[groupId]
      if (!group.configured) {
        groups[groupId] = {
          teamId: '',
          runOrder: 0,
          seatNumber: 'Not Configured',
          teamName: 'Not Configured',
          categoryName: group.categoryName,
          configured: false,
          status: 'WAITING',
          completed: false,
        }
        return
      }
      const currentIndex = (group.startRunOrder - 1 + roundIndex) % orderedTeams.length
      const team = orderedTeams[currentIndex]
      groups[groupId] = {
        teamId: teamIdForRunOrder(team.runOrder),
        runOrder: team.runOrder,
        seatNumber: team.seatNumber,
        teamName: team.teamName,
        categoryName: group.categoryName,
        configured: true,
        status: 'WAITING',
        completed: false,
      }
    })

    const finishTime = orderedTeams[roundIndex].finishTime
    rounds[`round-${roundIndex + 1}`] = {
      startTime: addMinutes(finishTime, -roundDurationMinutes),
      finishTime,
      groups,
    }
  })

  return rounds
}

function createJudgeGroups(configuredGroupCount: number, starts: Record<string, number>): Record<string, JudgeGroup> {
  return {
    group1: {
      categoryName: judgingCategories.group1,
      startRunOrder: starts.group1,
      configured: configuredGroupCount >= 1,
    },
    group2: {
      categoryName: judgingCategories.group2,
      startRunOrder: starts.group2,
      configured: configuredGroupCount >= 2,
    },
    group3: {
      categoryName: judgingCategories.group3,
      startRunOrder: starts.group3,
      configured: configuredGroupCount >= 3,
    },
    group4: {
      categoryName: judgingCategories.group4,
      startRunOrder: starts.group4,
      configured: configuredGroupCount >= 4,
    },
  }
}

function createCompetition(
  levelId: CompetitionLevelId,
  levelName: string,
  teamsList: Team[],
  starts: Record<string, number>,
  configuredGroupCount: number,
) {
  const today = new Date().toISOString().slice(0, 10)
  const teams = teamsToRecord(teamsList)
  const judgeGroups = createJudgeGroups(configuredGroupCount, starts)

  return {
    settings: {
      competitionName: `GM Advanced - ${levelName}`,
      competitionDate: today,
      roundDurationMinutes: 8,
      dueSoonMinutes: 2,
      currentRound: 1,
      totalRounds: teamsList.length,
      soundEnabled: true,
      firstFinishTime: '13:13',
      followCurrentTime: true,
      levelId,
      levelName,
      configuredGroupCount,
    },
    teams,
    judgeGroups,
    rounds: generateRounds(teams, judgeGroups, 8),
    eventLogs: {},
  } satisfies CompetitionData
}

export function createSeniorHighCompetition(): CompetitionData {
  return createCompetition('senior-high-school', 'Senior High School', defaultTeams, {
    group1: 1,
    group2: 7,
    group3: 14,
    group4: 21,
  }, 4)
}

export function createJuniorHighCompetition(): CompetitionData {
  return createCompetition('junior-high-school', 'Junior High School', juniorHighTeams, {
    group1: 1,
    group2: 7,
    group3: 14,
    group4: 21,
  }, 4)
}

export function createElementaryCompetition(): CompetitionData {
  return createCompetition('elementary-school', 'Elementary School', elementaryTeams, {
    group1: 1,
    group2: 7,
    group3: 14,
    group4: 21,
  }, 4)
}

export function createCompetitionForLevel(levelId: CompetitionLevelId): CompetitionData {
  if (levelId === 'elementary-school') return createElementaryCompetition()
  if (levelId === 'junior-high-school') return createJuniorHighCompetition()
  return createSeniorHighCompetition()
}

export function createDefaultCompetition() {
  return createSeniorHighCompetition()
}

export function getLevelLabel(levelId: CompetitionLevelId) {
  return competitionLevels.find((level) => level.id === levelId)?.label || 'Senior High School'
}
