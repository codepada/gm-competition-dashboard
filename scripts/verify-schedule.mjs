import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/data.ts', import.meta.url), 'utf8')

function extractArray(name) {
  const marker = `export const ${name}: Team[] = `
  const start = source.indexOf(marker)
  if (start < 0) throw new Error(`Missing ${name}`)
  const arrayStart = start + marker.length
  const exportStart = source.indexOf('\n\nexport ', arrayStart)
  const arrayText = source.slice(arrayStart, exportStart).trim()
  return Function(`"use strict"; return (${arrayText});`)()
}

function makeRounds(teams, starts, configuredGroupCount) {
  const groupIds = ['group1', 'group2', 'group3', 'group4']
  const rounds = {}
  teams.forEach((deadlineTeam, roundIndex) => {
    const groups = {}
    groupIds.forEach((groupId, index) => {
      if (index >= configuredGroupCount) {
        groups[groupId] = 'Not Configured'
        return
      }
      const team = teams[(starts[groupId] - 1 + roundIndex) % teams.length]
      groups[groupId] = `${team.seatNumber} - ${team.teamName}`
    })
    rounds[roundIndex + 1] = {
      deadline: deadlineTeam.finishTime,
      ...groups,
    }
  })
  return rounds
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${expected}", got "${actual}"`)
  }
}

const senior = makeRounds(extractArray('defaultTeams'), { group1: 1, group2: 7, group3: 14, group4: 21 }, 4)
const junior = makeRounds(extractArray('juniorHighTeams'), { group1: 1, group2: 7, group3: 14, group4: 21 }, 4)
const elementary = makeRounds(extractArray('elementaryTeams'), { group1: 1, group2: 7, group3: 14, group4: 21 }, 4)

assertEqual(senior[1].deadline, '13:13', 'Senior Round 1 deadline')
assertEqual(senior[9].group4, 'GAS-001 - RoboX Team', 'Senior Round 9 Group 4')
assertEqual(senior[28].group2, 'GAS-006 - Son of GFBlack69', 'Senior Round 28 Group 2')

assertEqual(junior[1].group1, 'GAJ-001 - TCCS MECH Team', 'Junior Round 1 Group 1')
assertEqual(junior[1].group2, 'GAJ-007 - Radian', 'Junior Round 1 Group 2')
assertEqual(junior[1].group3, 'GAJ-014 - CO 2 NEWWORLD', 'Junior Round 1 Group 3')
assertEqual(junior[1].group4, 'GAJ-021 - Witty', 'Junior Round 1 Group 4')
assertEqual(junior[15].group1, 'GAJ-015 - The TTS Green Innovator', 'Junior Round 15 Group 1')
assertEqual(junior[15].group2, 'GAJ-021 - Witty', 'Junior Round 15 Group 2')
assertEqual(junior[15].group3, 'GAJ-001 - TCCS MECH Team', 'Junior Round 15 Group 3')
assertEqual(junior[27].group1, 'GAJ-027 - THE SOTER OF S.L.K', 'Junior Round 27 Group 1')
assertEqual(junior[27].group2, 'GAJ-006 - SM Taxtic', 'Junior Round 27 Group 2')
assertEqual(junior[27].group3, 'GAJ-013 - The Animal Four', 'Junior Round 27 Group 3')
assertEqual(junior[27].group4, 'GAJ-020 - Chanon', 'Junior Round 27 Group 4')
assertEqual(junior[27].deadline, '16:41', 'Junior Round 27 deadline')

assertEqual(elementary[1].group1, 'GAE-001 - Two-Wheeled Infinity', 'Elementary Round 1 Group 1')
assertEqual(elementary[1].group2, 'GAE-007 - AST1', 'Elementary Round 1 Group 2')
assertEqual(elementary[1].group3, 'GAE-014 - Smart Team', 'Elementary Round 1 Group 3')
assertEqual(elementary[1].group4, 'GAE-021 - THE BLITZ OF S.L.K', 'Elementary Round 1 Group 4')
assertEqual(elementary[3].group4, 'GAE-001 - Two-Wheeled Infinity', 'Elementary Round 3 Group 4')
assertEqual(elementary[22].group1, 'GAE-022 - DIAMOND', 'Elementary Round 22 Group 1')
assertEqual(elementary[22].group2, 'GAE-006 - BRF Power', 'Elementary Round 22 Group 2')
assertEqual(elementary[22].group3, 'GAE-013 - PC Juniors GM', 'Elementary Round 22 Group 3')
assertEqual(elementary[22].group4, 'GAE-020 - P2P Robot', 'Elementary Round 22 Group 4')
assertEqual(elementary[22].deadline, '16:01', 'Elementary Round 22 deadline')

console.log('Schedule verification passed for Senior, Junior, and Elementary required assignments.')
