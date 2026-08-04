# Firebase Auth Setup

The app keeps the same login form: staff enter a short ID and password.
Behind the scenes, the app signs in with this email format:

```text
{staff-id}@gm-advanced.local
```

For example, `adminu` signs in as `adminu@gm-advanced.local`.

## Required Firebase Setup

1. Enable Firebase Authentication with the Email/Password provider.
2. Create one Firebase Auth user for each staff ID.
3. Create a Realtime Database profile at `users/{uid}` for each user.
4. Deploy `database.rules.json` after every required user profile exists.

Do not deploy the database rules before profiles exist. Users without a profile cannot use the app.

## Staff Accounts

Create these Firebase Auth emails and set the Firebase password shown below.
The login page still accepts the old short passwords:

- Staff IDs that used `1234` are sent to Firebase as `123456`.
- `wgm2026` with `1122` is sent to Firebase as `112233`.

| Staff ID | Firebase Auth email | Firebase password | Role | Level | Group | Staff name |
| --- | --- | --- | --- | --- | --- | --- |
| `wgm2026` | `wgm2026@gm-advanced.local` | `112233` | `admin` |  |  | `Admin` |
| `adminf` | `adminf@gm-advanced.local` | `123456` | `staffLead` |  |  | `Head Staff` |
| `adminu` | `adminu@gm-advanced.local` | `123456` | `staffLead` |  |  | `Head Staff` |
| `adminel` | `adminel@gm-advanced.local` | `123456` | `adminLevel` | `elementary-school` |  | `Elementary Admin` |
| `adminjr` | `adminjr@gm-advanced.local` | `123456` | `adminLevel` | `junior-high-school` |  | `Junior Admin` |
| `adminsh` | `adminsh@gm-advanced.local` | `123456` | `adminLevel` | `senior-high-school` |  | `Senior Admin` |
| `dsel` | `dsel@gm-advanced.local` | `123456` | `staff` | `elementary-school` | `group1` | `Elementary Devices Staff` |
| `sgel` | `sgel@gm-advanced.local` | `123456` | `staff` | `elementary-school` | `group2` | `Elementary Science Staff` |
| `crel` | `crel@gm-advanced.local` | `123456` | `staff` | `elementary-school` | `group3` | `Elementary Creative Staff` |
| `ovel` | `ovel@gm-advanced.local` | `123456` | `staff` | `elementary-school` | `group4` | `Elementary Overall Staff` |
| `dsjr` | `dsjr@gm-advanced.local` | `123456` | `staff` | `junior-high-school` | `group1` | `Junior Devices Staff` |
| `sgjr` | `sgjr@gm-advanced.local` | `123456` | `staff` | `junior-high-school` | `group2` | `Junior Science Staff` |
| `crjr` | `crjr@gm-advanced.local` | `123456` | `staff` | `junior-high-school` | `group3` | `Junior Creative Staff` |
| `ovjr` | `ovjr@gm-advanced.local` | `123456` | `staff` | `junior-high-school` | `group4` | `Junior Overall Staff` |
| `dssh` | `dssh@gm-advanced.local` | `123456` | `staff` | `senior-high-school` | `group1` | `Senior Devices Staff` |
| `sgsh` | `sgsh@gm-advanced.local` | `123456` | `staff` | `senior-high-school` | `group2` | `Senior Science Staff` |
| `crsh` | `crsh@gm-advanced.local` | `123456` | `staff` | `senior-high-school` | `group3` | `Senior Creative Staff` |
| `ovsh` | `ovsh@gm-advanced.local` | `123456` | `staff` | `senior-high-school` | `group4` | `Senior Overall Staff` |

## Profile Shape

Each profile is stored under `users/{firebase-auth-uid}`.

Admin profile:

```json
{
  "username": "wgm2026",
  "role": "admin",
  "staffName": "Admin"
}
```

Head staff profile:

```json
{
  "username": "adminu",
  "role": "staffLead",
  "staffName": "Head Staff"
}
```

Level admin profile:

```json
{
  "username": "adminel",
  "role": "adminLevel",
  "levelId": "elementary-school",
  "staffName": "Elementary Admin"
}
```

Staff profile:

```json
{
  "username": "dsel",
  "role": "staff",
  "levelId": "elementary-school",
  "groupId": "group1",
  "staffName": "Elementary Devices Staff"
}
```

## Deploy Rules

After all users and profiles are ready:

```sh
firebase deploy --only database
```

The current rules protect the database from users who are not signed in and from accounts without a profile. Staff accounts can write to their assigned level because the app currently saves a full level document for each update.
